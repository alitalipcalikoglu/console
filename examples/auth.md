# Operating auth

**Auth** page: counters (active users, disabled, active sessions), a user list with email search (press `/` to focus), and per-user pages.

## Find a user

Type part of nothing: the search is an exact email lookup, because the auth service indexes by email and never lists by fragment. Without a search term the list shows newest users first with **Load more**.

## User page

Header shows status (active / disabled / locked), verification state and the user id with a copy button. Then:

- **Sessions**: one row per device with IP, user agent, last seen, expiry. **Revoke session** ends one; **Revoke all sessions** ends every device (confirmation).
- **Audit trail**: the auth service's own events for this user (`login.failed` with reason, `session.reuse_detected`, `password.reset`, …). Dangerous ones are tinted red.

## Actions

| Button | Effect | Auth endpoint |
|---|---|---|
| Send verification email | new link by email (throttled by auth) | `POST /v1/auth/verify-email/resend` |
| Send password reset email | reset link by email; always accepted | `POST /v1/auth/password/forgot` |
| Disable | sessions end, sign-in refused; confirmation | `PATCH /v1/users/:id { status: "disabled" }` |
| Enable | re-allow sign-in | `PATCH … { status: "active" }` |
| Delete | hard delete; you must type the email | `DELETE /v1/users/:id` |
| Create user (list page) | account + verification email | `POST /v1/users` |

Every action is written to the console audit log (`auth.user.*`) with the target user id and the service id, in addition to auth's own trail.

## Lockouts

A locked user shows a red **Locked** badge and the lock expiry. Auth has no unlock endpoint by design (locks are short); wait for the window or disable/enable the account, which does not clear the counter but confirms the account is under control.
