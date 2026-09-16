# Two-factor authentication

Recommended for every admin: whoever holds a console session can operate every service.

## Enable

**Account → Two-factor authentication → Enable.**

1. A QR code and a manual key appear (generated in the browser, no third-party service).
2. Scan with Google Authenticator, 1Password, Authy or any RFC 6238 app.
3. Enter the 6-digit code the app shows and press **Enable**.

Nothing changes until the code is confirmed, so a half-finished enrolment cannot lock you out. `TOTP_ISSUER` (default "atc console") is the name shown in the authenticator app.

## Signing in afterwards

After the password step the console asks for the code ("Second step"). The session is not usable until the code is accepted; `GET /api/session` reports `totpPending: true` meanwhile. A code is valid for its 30-second window plus one window either side, and each code is accepted only once (a replay within the window fails).

Wrong codes count as failed logins towards the lockout.

## Disable

**Account → Two-factor authentication → Disable** asks for the current password **and** a valid code. Both are required so a stolen unlocked session cannot switch 2FA off.

## Lost authenticator

Another administrator sets a new password from **Admins → Set password**; TOTP stays enabled. If nobody can produce a code, reset the account from the server:

```bash
sqlite3 data/console.db "UPDATE admins SET totp_secret = NULL, totp_enabled_at = NULL WHERE email = 'ali@example.com'"
```

then sign in with the password alone and enrol again.

## Behind the scenes

| Call | Purpose |
|---|---|
| `POST /api/me/totp/start` | `{ secret, uri }` (otpauth URI for the QR) |
| `POST /api/me/totp/confirm { code }` | enables |
| `POST /api/me/totp/disable { password, code }` | disables |

Audit entries: `totp.enabled`, `totp.disabled`, and `login.succeeded` with `{ "totp": true }`.
