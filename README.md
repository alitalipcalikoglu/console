# console

One installable web app to watch and operate the atc-web services: notify, auth, media, gateway, audit, shortlink and flags. Fastify backend-for-frontend plus a Svelte 5 progressive web app. Works on phones and desktops, light and dark, Turkish and English.

The console depends on nothing else to run: its own administrator accounts, sessions, two-factor authentication and audit log live in its own SQLite database. Services are reached over HTTP with dedicated API keys; a service being down shows up as a red card, not as a broken console.

Runtime dependencies: `fastify`, `@fastify/static`. Build-time only: `svelte`, `vite`. Storage via `node:sqlite` (Node 22.13+).

## Run

```bash
cp .env.example .env                    # service keys, cookie/TLS settings
cp services.example.json services.json  # which services, where, which key
npm ci
npm run build                           # Svelte app → public/
npm run admin -- create you@example.com # first administrator (password prompted)
npm start
```

Local development with hot reload: `npm run dev` (API on 3004) and `npm run dev:ui` (Vite on 5173, proxies `/api`). Set `COOKIE_SECURE=false` for plain-http development.

Production with PM2:

```bash
npm ci && npm run build
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Production with Docker (the image builds the UI itself):

```bash
docker build -t atc-console .
docker run -d -p 3004:3004 -v console-data:/data -v ./services.json:/config/services.json:ro --env-file .env atc-console
docker exec -it <container> node scripts/admin.js create you@example.com
```

Tests and type check (server tests with `node:test`, UI with `svelte-check`):

```bash
npm test
npm run typecheck
```

## What you can do

| Area | See | Do (admin role) |
|---|---|---|
| Overview | health, readiness, latency and headline numbers of every service; cards with auto-refresh enabled tick at their own interval | refresh one service at a time (no global refresh) |
| Service pages | – | auto-refresh per service (Off / 15 s / 30 s / 1 min / 5 min), stored in `services.json` |
| Notify | queue counters, messages by status, delivery errors, attempts | retry failed messages, send a test message from a template |
| Auth | users, verification state, lockouts, sessions per device, audit trail | create user, disable/enable, delete, revoke one or all sessions, resend verification, send password reset |
| Media | files as grid or list with previews, storage numbers | drag-and-drop upload (public/private), rename, switch visibility, soft delete and restore, generate signed links, create upload tickets |
| Gateway | readiness per route, requests by status class, p50/p95 latency, bytes, rejections | – (gateway has no write API) |
| Audit | events pushed by every service with filters (outcome, action prefix, source, actor, target, request id, IP, time range), 24-hour statistics, event detail with metadata and hashes | verify the hash chain, export NDJSON/CSV (both recorded in the console log) |
| Shortlink | links with status, clicks, tags; 7-day overview and most clicked; per-link statistics (per day, referrers, devices, recent clicks) and QR code | create links (slug, expiry, click limit, tags, 301/302), edit, disable/enable, delete, download the QR as PNG |
| Flags | flags with kind, tags and per-environment state; environment versions and evaluation counts; per-flag history; evaluate for a given user with the reason | create flags, switch per environment, edit values, rollout percentage and targeting rules, copy between environments, archive, reshuffle, delete |
| Console log | who did what in the console, filter by action prefix | – |
| Admins | console accounts, roles, 2FA state, last login | add, change role, disable, set password, unlock, delete |
| Account | own sessions | change password, enable/disable TOTP (QR code), sign out other sessions, theme, language |

`viewer` accounts see everything and change nothing; write buttons are hidden and the API refuses mutations with `403`.

## How it connects

`services.json` lists service instances; secrets stay in `.env` and are referenced by variable name:

```json
{ "id": "media", "type": "media", "label": "Media (EU)", "url": "http://10.0.0.3:3003", "apiKeyEnv": "MEDIA_API_KEY" }
```

`type` is one of `notify`, `auth`, `media`, `gateway`, `audit`, `shortlink`, `flags` and selects the screens and endpoints; several instances of one type are allowed (tabs appear). `url` is the internal address the console calls; `publicUrl` is optional information for auth. The gateway needs `metricsTokenEnv` instead of an API key. The file is validated at startup with precise error messages. Changing connections means a restart (`pm2 reload console`).

Each service may carry `"polling": { "enabled": false, "intervalSec": 30 }`: auto-refresh of that service's page in the UI. Admins change it from the page's app bar (Auto-refresh: Off / 15 s / 30 s / 1 min / 5 min); the console writes it back to `services.json` atomically, so the setting is shared by every admin and survives restarts. There is no global refresh; each service polls at its own interval, on its own page and on the overview card, only while that page is open and the tab is visible.

One scheduler per service owns the timer: requests never overlap (a tick that arrives while a request is in flight is folded into exactly one follow-up run), every run is timed, and the last ten durations drive an adaptive interval of at least 1.3× the average (a service averaging 10 s is asked every 13 s at most, whatever the setting says). When the effective interval changes the old timer is destroyed and a new one started. The service page shows the numbers: setting, effective interval, average, last, runs, errors, coalesced ticks and a bar per request.

Every operation goes through the console's own typed API (`/api/services/:id/…`), which calls the service with the console's key. There is no generic proxy: an action exists in the console only if the service exposes it. Destructive actions ask for confirmation (deleting a user requires typing the email) and every write is recorded in the console's audit log with actor, target and IP.

## Security notes

- Passwords: scrypt (`SCRYPT_LOG_N`), minimum 12 characters, no email-derived passwords. Lockout after `CONSOLE_LOGIN_MAX_FAILURES`. Login attempts rate-limited per IP.
- Sessions: server-side, opaque cookie (`HttpOnly; SameSite=Strict; Secure`), absolute (`CONSOLE_SESSION_TTL_MIN`) and idle (`CONSOLE_SESSION_IDLE_MIN`) expiry. Password change signs out other sessions.
- TOTP (RFC 6238, Google Authenticator compatible) with replay protection; disabling needs password and a valid code. Recommended for every admin: the console holds every service key.
- CSRF: every mutating request must carry `X-Console-Request: 1`, which cross-site pages cannot add; cookies are `SameSite=Strict` as well.
- Service keys never reach the browser. Media previews and downloads are streamed through the console.
- Strict Content-Security-Policy on every page (`script-src 'self'` plus the hash of the theme pre-paint script, no remote sources, `frame-ancestors 'none'`). Security headers on every response (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, HSTS with TLS); API responses are `no-store`.
- The file-bytes proxy renders only raster image types inline; anything else (SVG, PDF, HTML) is delivered as `application/octet-stream` attachment inside a sandboxed CSP, so a hostile upload cannot run on the console's origin.
- The first administrator is created from the server's command line; there is no sign-up page.
- Container runs as the unprivileged `node` user.

## PWA

Installable (manifest, icons for iOS and Android, standalone display). The service worker precaches the app shell, serves navigations network-first with an offline fallback, never caches `/api`, and shows a "new version ready" prompt when a deployment lands. An offline badge appears in the header when the network drops.

## Code layout

Class-based; dependencies are injected through constructors, `src/application.js` is the composition root.

| Class | File | Role |
|---|---|---|
| `Application` | `src/application.js` | Wiring, startup, graceful shutdown |
| `Config` | `src/config.js` | Validated environment |
| `Database` | `src/db.js` | SQLite connection, migrations, transactions |
| `PasswordHasher`, `OpaqueToken`, `Totp` | `src/crypto/` | scrypt, session tokens, RFC 6238 |
| `AdminStore`, `SessionStore`, `AuditStore` | `src/store/` | Persistence |
| `ConsoleAuth`, `AdminService`, `ConsoleError` | `src/domain/` | Sign-in, 2FA, sessions; admin management; error codes |
| `ServiceRegistry`, `ServiceClients`, `*Client`, `PrometheusText` | `src/services/` | services.json, typed clients per service, metrics parsing |
| `ConsoleApi`, `SessionAuth` | `src/http/` | Routes, cookies, CSRF, roles, static app |
| `RateLimiter`, `Maintenance` | `src/` | Login throttling, hourly purge |
| `AdminCli` | `scripts/admin.js` | Create/list/reset administrators |
| Svelte app | `ui/src/` | `lib/` (api, router, session, i18n, theme, pwa, qr, components), `pages/` |

## Examples

Scenario walkthroughs for every feature live in [examples/](examples/README.md).

## Out of scope by design

- Editing service configuration from the UI: connections and secrets stay in files on the server.
- Single sign-on for the console itself (the console must work when auth is down).
- Editing gateway routes: the gateway reads `routes.json` from disk; the console shows what it reports.

## License

MIT, see [LICENSE](LICENSE).
