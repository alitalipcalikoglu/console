# First run and sign-in

## Create the first administrator

There is deliberately no sign-up page. On the server:

```bash
npm run admin -- create ali@example.com --name "Ali" --role admin
# New password (min 12 chars): ********
# Repeat password: ********
# created admin ali@example.com (7c1e…)
```

The password is prompted without echo and never appears in shell history. `npm run admin -- list` shows every account; `npm run admin -- reset-password <email>` sets a new one and signs that person out everywhere.

Until an administrator exists the server logs a warning at start: `no administrator exists yet: run npm run admin -- create <email>`.

## Sign in

Open the console, enter email and password. A successful sign-in sets one cookie:

```
Set-Cookie: console_session=<opaque token>; Max-Age=43200; Path=/; HttpOnly; SameSite=Strict; Secure
```

The token is random; only its hash is stored. The session ends after `CONSOLE_SESSION_TTL_MIN` (12 h) or after `CONSOLE_SESSION_IDLE_MIN` (60 min) without a request, whichever comes first.

## Wrong password, lockout

Five failures (`CONSOLE_LOGIN_MAX_FAILURES`) lock the account for 15 minutes (`CONSOLE_LOGIN_LOCKOUT_MIN`). The sign-in page shows "Account locked. Try again in N seconds." Another admin can lift it from **Admins → Unlock**. Unknown emails get the same "email or password is incorrect" message and cost the same time as a wrong password.

Sign-in attempts are also rate limited per IP (`RATE_LIMIT_MAX` per minute → `429`).

## Behind the scenes

| Call | Purpose |
|---|---|
| `POST /api/session/login { email, password }` | `{ totpRequired, admin }`, sets the cookie |
| `POST /api/session/totp { code }` | second step when `totpRequired` |
| `GET /api/session` | `{ admin, totpPending }` for the current cookie |
| `POST /api/session/logout` | clears the cookie |

Every state-changing call needs the header `X-Console-Request: 1`; the app adds it automatically.
