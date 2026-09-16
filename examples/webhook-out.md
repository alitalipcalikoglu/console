# Operating webhooks

**Webhooks** page (one per configured `webhook-out` service): subscriptions with their state, recent deliveries and events across all subscribers. Viewers see everything; admins change.

## Numbers at the top

| Card | Meaning |
|---|---|
| Active subscriptions | active count; paused and disabled below, the small print turns red when something is disabled |
| Events (24 h) | published in the last day, total stored below |
| Failed (24 h) | dead deliveries in the last day (red when above zero), succeeded below |
| Backlog | queued and retrying deliveries with the age of the oldest; "worker stopped" in red if the loop is down |

## Subscriptions

Columns: name with description, status (with the consecutive-failure counter when above zero), the first three event patterns, last delivery as a status badge with time, receiver URL. Segment All / active / paused / disabled and a search over name, description and URL. Filters live in the URL.

**Create subscription** asks for name, description, receiver URL, event patterns (one per line: `order.paid`, `order.*`, `*`) and `X-*` headers (one per line). On success the **signing secret** is shown once in a dialog with a copy button; closing it opens the new subscription's page. The secret is not retrievable later; use **Rotate secret** if it was lost.

## Recent deliveries and events

Two panels below the list: deliveries across all subscribers (status filter, subscriber name resolved from the loaded list) and events (type filter fed by `GET /v1/event-types`). Rows open the delivery or event page.

## The subscription page

Badges (status, last delivery, consecutive failures), an explanation when the subscription was disabled automatically, then URL with copy button, patterns, headers, last delivery, the rotation grace note while a previous secret is still valid, creator and update time. Below, its deliveries with **Load more**.

Actions in the app bar: **Send test** (queues a `webhook.test` event for this subscriber only), **Edit** (only changed fields are sent; "No changes." otherwise), **Pause** (confirmation explains that new events are not queued while paused) / **Resume**, and under ⋯: **Replay** (a dialog with a from/to window; queues matching events again), **Rotate secret** (confirmation, then the new secret in the one-time dialog with the grace deadline), **Delete** (typed confirmation).

## The delivery page

Status, attempt counter, links to the subscription and the event, timestamps, HTTP status, the latest error and response, and every attempt in a table. **Redeliver** (for finished deliveries; confirmation; opens the new delivery) and **Cancel** (for queued or retrying ones; confirmation).

## The event page

Type, id with copy button, source key, idempotency key, the JSON data, and the deliveries this event produced with their outcomes.

## Recorded in the console log

`webhook.subscription.create` (URL and patterns), `webhook.subscription.update` (the patch), `webhook.subscription.delete`, `webhook.subscription.rotate`, `webhook.subscription.test` (delivery id), `webhook.subscription.replay` (window and queued count), `webhook.delivery.redeliver` (new delivery id), `webhook.delivery.cancel`. Secrets are never written to the log.
