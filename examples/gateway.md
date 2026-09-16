# Watching the gateway

**Gateway** page refreshes every 30 seconds.

## Upstream health

Badges per route from the gateway's `/ready`: `web 2/2` green, `media 1/2` yellow (one upstream in cooldown), `dead 0/1` red. A red route makes the gateway report "Degraded" on the overview.

## Traffic table

From the gateway's Prometheus metrics (needs `metricsTokenEnv` in `services.json`; without it the page shows health only):

| Column | Meaning |
|---|---|
| Requests, 2xx, 4xx, 5xx | counts since the gateway started |
| Upstream errors | connection failures and timeouts, including retried ones |
| p50 / p95 | latency bucket upper bounds, e.g. `≤50 ms` |
| in / out | body bytes by direction |

Rejections by the gateway itself (rate limited, unauthorized, no route) are the counters above the table.

## Reading it

- 5xx rising with upstream errors → an upstream is failing; check that service's page.
- 4xx rising with `unauthorized` → clients sending bad or expired tokens.
- `rate limited` climbing on the login route → brute force or a misbehaving client.
- `no route` → traffic for hosts or paths nobody configured, often scanners.

## Behind the scenes

`GET /api/services/:id/status` returns `{ health, ready, readyDetail, latencyMs, summary }` where `summary.routes[id]` holds the parsed numbers. The console does not modify the gateway: routes live in its `routes.json`.
