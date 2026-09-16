# Operating shortlink

**Shortlink** page (one per configured `shortlink` service): every short link with its state and clicks, a 7-day overview, and per-link statistics with the QR code. Admins create and change links here; viewers see everything.

## Numbers at the top

| Card | Source |
|---|---|
| Active links (inactive below) | the service's `/metrics` |
| Clicks (last hour below) | `/metrics`; lifetime counted clicks, bots excluded |
| Last 7 days | `GET /v1/stats?days=7` |
| Uptime | `/metrics` |

**Most clicked · last 7 days** lists the top links of the window with the destination host; each entry opens the link.

## Finding a link

- Segmented control: **All / Active / Disabled / Expired / Limit reached**.
- Search box: substring of the code or the destination URL.
- Tag box: one tag exactly.
- The table shows code (with a copy button for the short URL), destination, status, clicks (and the limit as `70 / 100`), tags, last click and creation time. Filters live in the URL.

## Creating a link

**Create link** in the app bar. Only the destination is required. Optional: short code (3–64 characters; random when empty), expiry (local time, sent as ISO), click limit, tags (comma separated), note, and **Permanent redirect (301)**. On success the console opens the new link's page and shows its code.

Errors from the service arrive as toasts with the service's message: `"promo" is already in use`, `host "evil.test" is not allowed`, `expiresAt must be in the future`.

## Link page

- Header: status badge, `301`/`302`, tags; the short URL (opens in a new tab, copy button); destination; clicks and remaining clicks; last click; expiry; note; who created it and when; the `+` preview page.
- **QR code**: PNG rendered by the service and relayed through the console (`GET /api/services/:id/shortlink/links/:code/qr.png`), with a **Download PNG** button. For print, use the service's SVG output directly (`https://s.example.com/<code>/qr`).
- **Last 30 days**: clicks, unique visitors, bots, mobile/desktop split; clicks per day as bars; referring sites (`direct / QR` for none); the 20 most recent clicks with device, referrer and the anonymised visitor hash.

Actions in the app bar (admins): **Edit** (destination, expiry, limit, tags, note, 301/302), **Disable** / **Enable**, **Delete** (asks you to type the code; the click history goes with it). Every write is recorded in the [console log](audit.md) as `shortlink.link.create|update|delete`.

## Reading the statistics

- `Clicks` on the link is the lifetime counter without bots; the 30-day cards come from the click log and can be smaller after retention.
- Scans of a printed QR code appear as `direct / QR` with mobile devices. Create one link per channel to compare channels.
- A `301` link under-reports: browsers cache the redirect for a day.

## Behind the scenes

| Call | Purpose |
|---|---|
| `GET /api/services/:id/shortlink/links?status&q&tag&limit&cursor` | list |
| `POST /api/services/:id/shortlink/links` | create; admin; audited |
| `GET /api/services/:id/shortlink/links/:code?days=30` | link plus statistics in one response |
| `PATCH` / `DELETE /api/services/:id/shortlink/links/:code` | edit / delete; admin; audited |
| `GET /api/services/:id/shortlink/links/:code/qr.png?scale=6&margin=2` | PNG relay inside a sandboxed CSP |
| `GET /api/services/:id/shortlink/stats?days=7` | overview |

The console never relays SVG from the service; QR codes are shown as PNG only.
