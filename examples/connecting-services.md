# Connecting services

## services.json

```json
{
  "services": [
    { "id": "notify",  "type": "notify",  "label": "Notify",     "url": "http://10.0.0.1:3001", "apiKeyEnv": "NOTIFY_API_KEY" },
    { "id": "auth",    "type": "auth",    "label": "Auth",       "url": "http://10.0.0.2:3002", "apiKeyEnv": "AUTH_API_KEY", "publicUrl": "https://api.example.com" },
    { "id": "media",   "type": "media",   "label": "Media (EU)", "url": "http://10.0.0.3:3003", "apiKeyEnv": "MEDIA_API_KEY" },
    { "id": "media-us","type": "media",   "label": "Media (US)", "url": "http://10.0.1.3:3003", "apiKeyEnv": "MEDIA_US_API_KEY" },
    { "id": "gateway", "type": "gateway", "label": "Gateway",    "url": "http://10.0.0.4:3000", "metricsTokenEnv": "GATEWAY_METRICS_TOKEN" }
  ]
}
```

- `id`: lower-case, unique; appears in URLs (`/media/media-us`) and in the audit log.
- `type`: `notify`, `auth`, `media` or `gateway`. Decides the screens.
- `url`: bare origin the console calls. Private network addresses are fine and preferred.
- `apiKeyEnv` / `metricsTokenEnv`: **names** of environment variables in `.env`, never the secret itself. Missing or short (< 32 chars) values stop the process at start.
- Two instances of the same type show as tabs on that service's page.

Validation errors are exact: `services[3].apiKeyEnv refers to MEDIA_US_API_KEY, which is not set`.

## Dedicated keys

In each service add an entry for the console and use its secret here:

```
# notify .env
NOTIFY_API_KEYS=auth:…,gateway:…,console:6f1c…
```

Rotating the console's access to one service is then a change in two files and a reload, without touching other callers.

## When a service is down

The overview card turns red ("Unreachable"), its navigation dot turns red, and its pages show an error box with **Retry**. Everything else keeps working; the console never depends on a service to sign you in. Yellow ("Degraded") means `/health` answers but `/ready` does not, for example a gateway with a route whose upstreams are all down.

## Behind the scenes

| Call | Purpose |
|---|---|
| `GET /api/services` | configured services (no secrets) |
| `GET /api/services/overview` | health, readiness, latency and parsed metrics for all (used by scripts; the UI probes one service at a time) |
| `GET /api/services/:id/status` | the same for one |
