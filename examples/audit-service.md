# Operating the audit service

**Audit** page (one per configured `audit` service): the events every service pushed to the [audit](https://github.com/alitalipcalikoglu/audit) log, with filters, statistics, chain verification and export. The console holds a read-only key; nothing here writes to the log.

## Numbers at the top

| Card | Source |
|---|---|
| Total events, last hour | the service's `/metrics` |
| Last 24 hours, Failures, Denied | `GET /v1/stats?hours=24` on the service |
| Chain head | `audit_chain_head_seq`; after **Verify chain** the card shows *Chain intact* or *Chain broken* |
| Database | size and age of the oldest record |

Below them, for the same 24-hour window: top actions, top failures (failed or denied), events by source, most active actors. Every entry is a shortcut: clicking an action sets the action-prefix filter, a source toggles the source filter, an actor filters by that actor.

## Filtering

- Segmented control: **All / Success / Failure / Denied**.
- Action prefix box: `auth.` shows everything under `auth`, `auth.login` exactly that action.
- **Filters** opens the rest: source, actor type/id, target type/id, request id, IP, from/to. The badge on the button counts active filters; **Clear filters** resets them.
- Filters live in the URL, so a filtered view can be bookmarked or sent to a colleague: `/audit/audit?actionPrefix=auth.&outcome=failure&actorId=u_1001`.

Typing waits 300 ms before querying. Paging is **Load more** (keyset cursor from the service, stable while new events arrive).

## Event detail

Click a row. The page shows outcome, action, event and receipt time, source, actor, target, IP, user agent, request id, client id, the metadata as formatted JSON (values the service redacted show as `[REDACTED]`), and the event's hash and previous hash with copy buttons.

Three links pivot from one event to the related list: **Events of this actor**, **Events on this target**, **Events in the same request**.

## Verifying the chain

**Verify chain** in the app bar asks the service to recompute every hash from its oldest kept event to the head (`GET /v1/chain/verify`). A green toast reports how many events were checked; a red one names the first broken position and the reason (`hash mismatch at seq N` or `seq N is missing`). The result also colours the *Chain head* card. The check is recorded in the [console log](audit.md) as `audit.chain.verify` with the outcome.

On very large logs the service caps one call at `VERIFY_MAX_ROWS` (default 100 000) and answers `RANGE_TOO_LARGE`; verify in ranges from the command line in that case, see the service's own examples.

## Exporting

**Export** opens a dialog: it names how many filters are active, lets you choose **NDJSON** or **CSV**, and **Download** streams the result through the console (`GET /api/services/:id/audit/events/export?…`). The current filters apply; events come oldest first; the service stops at `EXPORT_MAX_ROWS`, so split long ranges with from/to. Every export is written to the console log as `audit.events.export` with the format and the filter used.

## Auto-refresh

The page and its overview card refresh on the service's own schedule (`polling` in `services.json`, changed from the app bar by admins). One run reloads the list, the statistics and the numbers together; the service-level timing panel shows how long the audit service takes to answer.

## Behind the scenes

| Call | Purpose |
|---|---|
| `GET /api/services/:id/audit/events?…` | filtered list; the console forwards only known filter names |
| `GET /api/services/:id/audit/events/:eventId` | one event |
| `GET /api/services/:id/audit/stats?hours=24` | window aggregates |
| `GET /api/services/:id/audit/chain/head` | `{ seq, hash }` |
| `GET /api/services/:id/audit/chain/verify?fromSeq&toSeq` | recompute; audited |
| `GET /api/services/:id/audit/events/export?format=csv&…` | streamed download inside a sandboxed CSP; audited |

Viewers can do everything on this page: all of it is reading. Errors from the service (`UPSTREAM_UNREACHABLE`, `RANGE_TOO_LARGE`, …) show in an error box with **Retry**.
