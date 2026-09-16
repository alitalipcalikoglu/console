# Console log

**Console log** page (the console's own audit trail, not the audit service): every action performed through the console, newest first, with actor email, action, target, details and IP.

## What is recorded

| Prefix | Examples |
|---|---|
| `login.` / `logout` | `login.succeeded` (with `{ totp: true }` when 2FA was used), `login.failed` with reason (`unknown_email`, `bad_password`, `bad_totp`, `locked`, `disabled`) |
| `password.` / `totp.` / `sessions.` | own-account changes |
| `admin.` | created, updated (with the patch), password_reset, unlocked, deleted |
| `notify.` | `message.retry`, `message.send` (template, recipients) |
| `auth.` | `user.create`, `user.update`, `user.delete`, `user.sessions.revoke_all`, `user.session.revoke`, `user.resend_verification`, `user.password_reset_email` |
| `media.` | `file.upload` (name, size), `file.update`, `file.delete`, `file.restore`, `ticket.create` |
| `service.` | `settings.update` (auto-refresh change, with the new `polling` value) |
| `audit.` | `chain.verify` (result), `events.export` (format and filter) on the audit service pages |
| `shortlink.` | `link.create` (url), `link.update` (patch), `link.delete` |

Reads are not recorded; writes always are, including failed attempts to sign in.

## Filtering

Quick chips (`login`, `admin.`, `notify.`, …) or type any prefix into the filter. Paging is by **Load more**.

## Retention

Rows older than `AUDIT_RETENTION_DAYS` (default 365) are purged hourly. Export before that if you need longer:

```bash
sqlite3 -json data/console.db "SELECT * FROM audit ORDER BY id" > audit-$(date +%F).json
```

## Behind the scenes

`GET /api/audit?limit=50&action=auth.&before=<id>` → `{ items, nextBefore }`. Viewers can read the log too.
