# Operating notify

**Notify** page (one per configured notify instance).

## Reading the queue

Five counters from the service's metrics: queued, processing, sent, failed and the age of the oldest waiting message. A growing "oldest waiting" means deliveries are stuck; open the **Queued** filter and read `Last error` on the top rows.

The message table filters by status, loads more with a button, and shows attempts as `n/max`. Clicking a row opens the detail page with every field the service keeps (recipient or URL, provider id, next attempt, last error, timestamps). Template data is never shown: notify does not return it, by design.

## Retry a failed message

**Retry** appears on failed rows and on the detail page. It calls `POST /api/services/:id/notify/messages/:mid/retry`, the message goes back to `queued` with attempts reset, and the audit log records `notify.message.retry`. Only `failed` messages can be retried; the service answers `409` for other states and the toast shows that message.

## Send a test message

**Send message** opens a dialog:

1. Pick a template. The data field is pre-filled with a skeleton derived from the template's JSON Schema (`appName`, URLs, numbers, the current UI language as `locale`).
2. Enter one or more recipients (comma separated).
3. Edit the JSON and press **Send**.

The message is really queued and delivered. Validation failures from notify (`VALIDATION_FAILED` with the failing path) surface in the toast. Audited as `notify.message.send` with template and recipients.

## Behind the scenes

| Call | Notify endpoint |
|---|---|
| `GET /api/services/:id/notify/messages?status=&limit=&cursor=` | `GET /v1/messages` |
| `GET /api/services/:id/notify/messages/:mid` | `GET /v1/messages/:id` |
| `POST /api/services/:id/notify/messages/:mid/retry` | `POST /v1/messages/:id/retry` |
| `GET /api/services/:id/notify/templates` | `GET /v1/templates` |
| `POST /api/services/:id/notify/messages` | `POST /v1/messages` |
