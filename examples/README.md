# console examples

Walkthroughs for every feature of the admin console. Screens are described as the admin sees them; the underlying HTTP calls (`/api/…`) are named so you can script them too.

| Example | Shows |
|---|---|
| [First run and sign-in](first-run-and-sign-in.md) | Creating the first administrator, signing in, cookies and lockout |
| [Two-factor authentication](two-factor.md) | Enrolling with a QR code, the second step at sign-in, replay protection, disabling |
| [Admins and roles](admins-and-roles.md) | Adding admins and viewers, what each can do, the last-admin guard |
| [Connecting services](connecting-services.md) | `services.json`, dedicated keys, several instances, what breaks when a service is down |
| [Operating notify](notify.md) | Reading the queue, retrying failures, sending a test message |
| [Operating auth](auth.md) | Finding a user, revoking sessions, disabling, resending emails, deleting |
| [Operating media](media.md) | Uploading, previews, visibility, signed links, delete and restore, tickets |
| [Watching the gateway](gateway.md) | Upstream health per route, traffic and latency table |
| [Operating the audit service](audit-service.md) | Filtering events, statistics, event detail, verifying the chain, exporting |
| [Console log](audit.md) | What the console records about its own admins, filtering, retention |
| [Installing as an app and updates](pwa.md) | Install on phone/desktop, offline behaviour, update prompt, theme and language |
| [Operations](operations.md) | Health, environment, PM2, Docker, TLS, backups |
