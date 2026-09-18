# console readiness contract

## Purpose

The administrative control plane: a Svelte progressive web app plus a Fastify backend-for-frontend
that authenticates admins directly (its own accounts, sessions, TOTP — not delegated to `auth`,
which is for end users of the platform's applications), and proxies typed, role-checked operations
to every other service through per-service client classes.

## Dependencies

Every service listed in `services.json`, each optional at the level of "console still runs and
serves the UI without it" but required for that service's own pages to work: a call to an
unreachable service answers `502 UPSTREAM_UNREACHABLE` from the console's own API, the UI shows
that service as unreachable rather than the console failing. The audit service is additionally
used (when present, with a write-capable key) as the destination for the console's own log
(`src/application.js`: `AuditClient` forwarder reading `registry.ofType('audit')[0]`).

## Persistence

SQLite (`DB_PATH`, default `./data/console.db`): `admins` (`totp_secret` sealed at rest, Stage 4/4.1
— see "TOTP secret storage" in README.md), `sessions`, `totp_used` (replay guard), `audit` (the
console's own append-only log of admin actions), `totp_seal_state` (Stage 4.1, schema v2 — a
one-row, one-way marker set once `AdminStore.reseal` has confirmed every `totp_secret` is sealed
under the current key; this service's first real schema migration since the Stage 3 mechanism was
built — `v1.` sealing itself, Stage 4, changed only a column's content encoding, not the schema, so
it never needed one). Same migration mechanism as every other service (`src/db.js`:
`PRAGMA user_version`, one transaction per migration, WAL). The *resealing* itself (as opposed to
this marker table) still runs at application startup rather than as a numbered migration — it needs
a live `SecretBox`/key to decrypt with, which the SQL migration runner has no way to supply
(`AdminStore.reseal`, idempotent, see README.md). Also writes `services.json` in place when an admin
changes a service's polling settings through the UI (atomic: temp file + rename,
`ServiceRegistry.save`).

## Health endpoint

`GET /health`: always `{"status":"ok"}`, no dependency checks.

## Readiness endpoint

`GET /ready`: `db.ping()` only — does **not** check any of the services it proxies to. `503` only
on a database problem. No caching (the check itself is cheap).

## Graceful shutdown

SIGTERM/SIGINT → stop the maintenance timer → `app.close()` (Fastify drains in-flight requests,
including any upload streaming through the console) → flush the audit-log forwarder (up to ~2 s
plus retries) → close the database → exit. Force-exit at 30 s; PM2 `kill_timeout` 35 000 ms.
`unhandledRejection` runs the same shutdown; `uncaughtException` exits immediately.

## Resource limits

Request body cap 64 KiB for ordinary API calls (`bodyLimit` in `src/http/console-api.js`); file
uploads proxied to `media` stream through without that limit (media enforces its own).
`max_memory_restart`: 300M.

## Timeouts

`SERVICE_TIMEOUT_MS` (default 10 000): every outbound call to a proxied service
(`src/services/client.js`, `AbortSignal.timeout`). A service's own `/health`/`/ready` probe (used
for the overview page) uses a shorter 3 s timeout, independent of `SERVICE_TIMEOUT_MS`.

## Retry policy

None. A failed outbound call to a service is surfaced to the admin as an error; the UI's manual
refresh is the retry mechanism, by design (see the platform-wide "no background polling" rule).

## Idempotency

Session login is rate-limited per IP, not idempotency-guarded (a locked-out account behaves the
same on repeat attempts). Every write the console performs against another service is exactly one
HTTP call with no client-side retry, so idempotency for that operation is whatever guarantee the
target service's endpoint itself makes — the console adds none of its own.

## Backup

The console's own database (admins, sessions, its log) and `services.json` (which service
connections it knows about) need to survive a disk loss; neither is derivable from anything else.

## Restore

Restore the database file and `services.json` together (a stale `services.json` after a database
restore just means the connection list is momentarily out of date, not unsafe) and restart.

## Metrics

None of its own — there is no `/metrics` endpoint (`src/http/console-api.js` has no such route).
The console instead *reads* other services' `/metrics` (via `PrometheusText.parse` in
`src/services/client.js`) to render their dashboards.

## Logging

Fastify's default request logging (no custom access-log line the way gateway has one); redacts
`authorization` and `cookie`. See [OBSERVABILITY.md](../../stack/docs/OBSERVABILITY.md) for the
target field vocabulary — `service`/`version`/`traceId` are not yet emitted here either.

## Tracing

Forwards its own inbound request id (`X-Request-Id`) on every outbound call to a service, via
`AsyncLocalStorage` (`src/services/client.js`: `requestIdContext`, set once per request in an
`onRequest` hook in `src/http/console-api.js`) — no route handler or client method has to thread it
through explicitly. The console's own inbound id is always self-generated (`requestIdHeader:
false`) — unlike the gateway, there is no upstream proxy whose header would make sense to trust
here, so there is no `TRUST_PROXY`-style gate on it.

As of Stage 10, the same applies to `traceparent` (`src/trace-context.js`, `TraceContext`;
`src/services/client.js`: `traceContext`): console mints a fresh W3C trace (`TraceContext.forRequest()`)
for every inbound request it handles — an inbound `traceparent` from the browser is never read,
parsed, or trusted, exactly like `X-Request-Id`'s existing policy, for the identical reason (console
is a trust boundary, not an internal service reached only from other trusted services). A fresh span
id is minted per *outbound hop* (`TraceContext#span()`), not once and reused for every downstream
call — one console request commonly fans out to several services, and each of those is genuinely a
separate hop under the same trace. The trace-id is echoed back to the browser on the response
(`traceparent` response header) so it correlates with what was forwarded to whichever service(s) the
request called, even though the browser's own (if any) claimed trace-id was never the one used.
Regression-tested in `test/trace-context.test.js`: forwarding, per-request trace-id isolation
(including under real concurrency), per-hop span freshness, and a malformed or spoofed inbound
`traceparent` never crashing the request or leaking through to a downstream call.

## Security model

Cookie session (`HttpOnly`, `SameSite=Strict`, `Secure` when `COOKIE_SECURE`), CSRF via a required
`X-Console-Request` header on every mutating call, TOTP (RFC 6238, ±1 step, replay-guarded via
`totp_used`; secret sealed at rest under `SECRETS_KEY`, current/previous rotation via `TotpKeyring`,
Stage 4.1 — README.md's "TOTP secret storage" / "Rotating SECRETS_KEY"). Two roles only,
`admin`/`viewer`: viewers read, admins mutate (`requireSession` vs `requireAdmin` per route) — no
finer-grained, per-service permission model. Dummy-hash login timing defence for unknown emails, same
scrypt cost as real accounts (mirrors the fix made to `auth` in Stage 0, but console's own copy of
this logic was already correct — see `src/domain/console-auth.js`). Every secret naming a downstream
service's API key (`apiKeyEnv` in `services.json`) is env-only, no rotation support beyond changing
the value and restarting — unlike `SECRETS_KEY`, which as of Stage 4.1 does have an online rotation
path (current + previous key, reseal, drop the old key once confirmed) precisely because it protects
data that must keep being readable through the transition, not a bearer credential swapped atomically.

## Scaling model

**B — single-node stateful.** One SQLite file per process, in-memory login rate limiter, in-memory
`AsyncLocalStorage` request context (inherently per-process, which is correct — it exists to carry
state within one request's own execution, not across instances).

## Single-node / multi-node guarantees

Running two console instances against the same database file is not supported or tested: session
touches, admin creation/role changes, and the `services.json` atomic-write path all assume a single
writer. Nothing prevents starting a second instance, but doing so is unverified and not the
deployment model this service is built for.

## Known failure modes

- Every proxied service down at once: the console itself still serves the UI and its own
  authentication; every service page shows "unreachable".
- Audit service down while forwarding is configured: the console's own log entries queue in the
  forwarder's in-memory buffer (≤5000) and are dropped, oldest first, if it stays down long enough
  — the console's *local* audit log (its own `audit` table) is unaffected either way.
- Process killed without SIGTERM: any buffered-but-unsent audit-forwarding events for the console's
  own log are lost (not written anywhere durable before being sent — see the outbox discussion in
  `stack/docs/ARCHITECTURE_AUDIT.md` §4.4, planned for a later stage, not this one).
- Two instances on one database file: unverified; avoid.
- `SECRETS_KEY` missing while a sealed `totp_secret` exists: that one admin's second factor throws
  `TOTP_UNAVAILABLE` (503) instead of a wrong-code error — a config problem, not a client error, and
  distinguishable from a bad code by the response code and body. Every other admin, and every
  non-TOTP operation, is unaffected.
- `SECRETS_KEY` missing at startup while a *plaintext* (pre-Stage-4) `totp_secret` still exists, or a
  row is sealed under a key that is neither `SECRETS_KEY` nor `SECRETS_PREVIOUS_KEY` (a rotation
  where the previous key was dropped from config too early): refuses to start (`ConfigError`, names
  the affected count), not a runtime failure mode — see README.md's "Rotating SECRETS_KEY".
- A `v2.`-format `totp_secret` naming a key id this instance doesn't recognise (neither current nor
  previous): `TotpKeyring.open` refuses outright rather than trying it against the wrong key anyway —
  fail-closed. AES-GCM's authentication tag makes a wrong-key attempt fail deterministically in any
  case, so even the one case this *does* try more than one key (`v1.` legacy values, which carry no
  id at all, tried against current then previous) can never "succeed" with the wrong key and wrong
  plaintext — a wrong key is always caught, never silently accepted.
- A plaintext `totp_secret` found *after* `totp_seal_state` confirms this database has completed
  sealing: `TOTP_SECRET_CORRUPT` (500), not accepted as a valid secret — see README.md's "Once fully
  sealed, plaintext is no longer tolerated".
