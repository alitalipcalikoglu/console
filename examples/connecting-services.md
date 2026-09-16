# Connecting services

## services.json

```json
{
  "services": [
    { "id": "notify",  "type": "notify",  "label": "Notify",     "url": "http://10.0.0.1:3001", "apiKeyEnv": "NOTIFY_API_KEY" },
    { "id": "auth",    "type": "auth",    "label": "Auth",       "url": "http://10.0.0.2:3002", "apiKeyEnv": "AUTH_API_KEY", "publicUrl": "https://api.example.com" },
    { "id": "media",   "type": "media",   "label": "Media (EU)", "url": "http://10.0.0.3:3003", "apiKeyEnv": "MEDIA_API_KEY" },
    { "id": "media-us","type": "media",   "label": "Media (US)", "url": "http://10.0.1.3:3003", "apiKeyEnv": "MEDIA_US_API_KEY" },
    { "id": "gateway", "type": "gateway", "label": "Gateway",    "url": "http://10.0.0.4:3000", "metricsTokenEnv": "GATEWAY_METRICS_TOKEN" },
    { "id": "audit",   "type": "audit",   "label": "Audit",      "url": "http://10.0.0.5:3005", "apiKeyEnv": "AUDIT_API_KEY" },
    { "id": "shortlink","type": "shortlink","label": "Shortlink", "url": "http://10.0.0.6:3006", "apiKeyEnv": "SHORTLINK_API_KEY" },
    { "id": "flags",   "type": "flags",   "label": "Flags",      "url": "http://10.0.0.7:3007", "apiKeyEnv": "FLAGS_API_KEY" },
    { "id": "scheduler", "type": "scheduler", "label": "Scheduler", "url": "http://10.0.0.8:3008", "apiKeyEnv": "SCHEDULER_API_KEY" }
  ]
}
```

- `id`: lower-case, unique; appears in URLs (`/media/media-us`) and in the audit log.
- `type`: `notify`, `auth`, `media`, `gateway`, `audit`, `shortlink`, `flags` or `scheduler`. Decides the screens.
- `url`: bare origin the console calls. Private network addresses are fine and preferred.
- `apiKeyEnv` / `metricsTokenEnv`: **names** of environment variables in `.env`, never the secret itself. Missing or short (< 32 chars) values stop the process at start.
- `polling` (optional): `{ "enabled": true, "intervalSec": 30 }` makes the service's page, and its card on the overview, refresh at that interval while open and visible. The interval is a floor: the console times every run, keeps the last ten, and never polls faster than 1.3× the average response time (avg 10 s → effective 13 s), restarting the timer when that changes. Runs are serialised per service; a tick during a run is coalesced into one follow-up. Changed from the UI by admins; the console rewrites the file (atomic temp-file rename) and keeps every other field untouched. Allowed interval 5–3600 s.
- Two instances of the same type show as tabs on that service's page.

Validation errors are exact: `services[3].apiKeyEnv refers to MEDIA_US_API_KEY, which is not set`.

## Dedicated keys

In each service add an entry for the console and use its secret here:

```
# notify .env
NOTIFY_API_KEYS=auth:…,gateway:…,console:6f1c…
```

For the audit service use a **read** role key (`AUDIT_API_KEYS=…,console:<secret>:read`): the console only reads events, verifies the chain and exports; it never writes there. The shortlink key needs `readwrite` (default role) because admins create and edit links from the console. The flags key needs `readwrite` **without** an environment scope, so the console can manage every environment. The scheduler key needs `readwrite` (default role): admins create jobs, run them on demand and cancel runs from the console.

Rotating the console's access to one service is then a change in two files and a reload, without touching other callers.

## When a service is down

The overview card turns red ("Unreachable"), its navigation dot turns red, and its pages show an error box with **Retry**. Everything else keeps working; the console never depends on a service to sign you in. Yellow ("Degraded") means `/health` answers but `/ready` does not, for example a gateway with a route whose upstreams are all down.

## Behind the scenes

| Call | Purpose |
|---|---|
| `GET /api/services` | configured services (no secrets) |
| `GET /api/services/overview` | health, readiness, latency and parsed metrics for all (used by scripts; the UI probes one service at a time) |
| `GET /api/services/:id/status` | the same for one |
| `PATCH /api/services/:id/settings { polling }` | admin only; persists the auto-refresh setting, audited as `service.settings.update` |
