# Operations

## Probes

```bash
curl -s http://localhost:3004/health   # {"status":"ok"}
curl -s http://localhost:3004/ready    # {"status":"ok"} when SQLite answers; 503 otherwise
```

Readiness does not depend on the services: a console with every service down is still ready to show you that.

## Environment

Nothing is strictly required to start except the variables named in `services.json`. Full list: [.env.example](../.env.example). Keep `COOKIE_SECURE=true` in production (the cookie is then only sent over HTTPS).

## Deploy

```bash
git pull
npm ci && npm run build     # adapter-node application to build/
pm2 reload console          # zero downtime; the new process signals ready after listen()
```

The process must be reloaded after a build so `server.mjs` starts the new adapter-node handler. There is no wildcard SPA fallback; direct browser URLs are SvelteKit filesystem routes.

## TLS

Either terminate at a reverse proxy (set `TRUST_PROXY=true` so lockouts and rate limits use the real client IP) or set `TLS_CERT_PATH` / `TLS_KEY_PATH` to serve HTTPS directly with HSTS.

## Docker

```bash
docker build -t atc-console .
docker run -d --name console -p 3004:3004 -v console-data:/data -v $PWD/services.json:/config/services.json:ro --env-file .env -e DB_PATH=/data/console.db -e SERVICES_FILE=/config/services.json atc-console
docker exec -it console npm run admin -- create ali@example.com
```

The explicit path overrides prevent the host-oriented defaults in `.env` from bypassing the
persistent volume and mounted service catalog. The health check follows `PORT`; a custom port must
be set and published consistently, for example `-e PORT=4304 -p 4304:4304`. Named-volume ownership
is initialized for the non-root `node` user; make bind-mounted data directories writable by it.

## Logs

JSON lines. `Authorization` and `Cookie` are redacted. Watch for `login.failed` bursts in the audit table rather than in logs.

## Backups

```bash
sqlite3 data/console.db ".backup 'console-$(date +%F).db'"
```

The database holds admins (with password hashes and TOTP secrets), sessions and the audit log. Treat backups as secrets.
