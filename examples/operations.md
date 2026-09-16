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
npm ci && npm run build     # UI to public/
pm2 reload console          # zero downtime; the new process signals ready after listen()
```

The server serves `public/` in wildcard mode, so a rebuilt bundle is picked up even without a restart; reload anyway to load server changes.

## TLS

Either terminate at a reverse proxy (set `TRUST_PROXY=true` so lockouts and rate limits use the real client IP) or set `TLS_CERT_PATH` / `TLS_KEY_PATH` to serve HTTPS directly with HSTS.

## Docker

```bash
docker build -t atc-console .
docker run -d --name console -p 3004:3004 -v console-data:/data -v $PWD/services.json:/config/services.json:ro --env-file .env atc-console
docker exec -it console node scripts/admin.js create ali@example.com
```

## Logs

JSON lines. `Authorization` and `Cookie` are redacted. Watch for `login.failed` bursts in the audit table rather than in logs.

## Backups

```bash
sqlite3 data/console.db ".backup 'console-$(date +%F).db'"
```

The database holds admins (with password hashes and TOTP secrets), sessions and the audit log. Treat backups as secrets.
