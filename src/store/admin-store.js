import { randomUUID } from 'node:crypto';
import { ConfigError } from '@atc-web/service-core/config';
import { SecretBox } from '@atc-web/service-core/secrets';

/** @typedef {import('../db.js').Database} Database */
/** @typedef {import('../types.js').AdminRow} AdminRow */
/** @typedef {import('../types.js').Role} Role */
/** @typedef {import('../crypto/totp-keyring.js').TotpKeyring} TotpKeyring */

/** Console administrator accounts. */
export class AdminStore {
  static COLUMNS = 'id, email, name, password_hash, role, status, totp_secret, totp_enabled_at, failed_logins, locked_until, created_at, updated_at, last_login_at';

  /**
   * @param {Database} db
   * @param {TotpKeyring|null} [keyring] Seals `totp_secret` on write (Stage 4/4.1). `null` when
   *   `SECRETS_KEY` is not configured — {@link setTotpSecret} then refuses (new enrollment always
   *   needs a key to seal into; there is no plaintext fallback for a *new* secret, only for one
   *   already stored before this option existed — see {@link reseal}).
   */
  constructor(db, keyring = null) {
    this.keyring = keyring;
    const C = AdminStore.COLUMNS;
    this.stmt = {
      insert: db.prepare(`INSERT INTO admins (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      byId: db.prepare(`SELECT ${C} FROM admins WHERE id = ?`),
      byEmail: db.prepare(`SELECT ${C} FROM admins WHERE email = ?`),
      all: db.prepare(`SELECT ${C} FROM admins ORDER BY created_at`),
      count: db.prepare(`SELECT COUNT(*) AS n FROM admins WHERE role = 'admin' AND status = 'active'`),
      setPassword: db.prepare(`UPDATE admins SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?`),
      setRole: db.prepare(`UPDATE admins SET role = ?, updated_at = ? WHERE id = ?`),
      setStatus: db.prepare(`UPDATE admins SET status = ?, updated_at = ? WHERE id = ?`),
      setName: db.prepare(`UPDATE admins SET name = ?, updated_at = ? WHERE id = ?`),
      setTotpSecret: db.prepare(`UPDATE admins SET totp_secret = ?, totp_enabled_at = NULL, updated_at = ? WHERE id = ?`),
      enableTotp: db.prepare(`UPDATE admins SET totp_enabled_at = ?, updated_at = ? WHERE id = ? AND totp_secret IS NOT NULL`),
      disableTotp: db.prepare(`UPDATE admins SET totp_secret = NULL, totp_enabled_at = NULL, updated_at = ? WHERE id = ?`),
      loginFailed: db.prepare(`UPDATE admins SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE locked_until END, updated_at = ? WHERE id = ? RETURNING failed_logins, locked_until`),
      loginSucceeded: db.prepare(`UPDATE admins SET failed_logins = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?`),
      remove: db.prepare(`DELETE FROM admins WHERE id = ?`),
    };
  }

  /** @param {string} email */
  static normalizeEmail(email) {
    return email.trim().toLowerCase();
  }

  /**
   * Startup migration/rotation pass, safe and idempotent to call on every start. Three things a row
   * can need:
   * - **plaintext → current key** (Stage 4, upgrading from before sealing existed at all), or
   * - **sealed under a *different* key (`v1.` legacy-no-id, or `v2.` under the previous key) →
   *   current key** (Stage 4.1, completing or continuing a `SECRETS_KEY` rotation) —
   *
   * both go through the same "decrypt with whatever key can, re-seal with the current key" path.
   * A row already sealed under the current key needs nothing and is left untouched.
   *
   * Runs the actual writes in one transaction: every eligible row is resealed, or (a decrypt
   * failure partway, or a crash) none of them are — a failed attempt is retried in full, from
   * scratch, on the next start. Once nothing is left needing resealing — including a database that
   * never had a TOTP secret at all — {@link totp_seal_state} is marked (idempotently; never unset),
   * which is what makes a plaintext row found *after* this point a corruption signal rather than a
   * tolerated migration state — see {@link hasFullySealed} and `ConsoleAuth`'s `strictSealing`.
   *
   * Fails fast with `ConfigError` (refuses to start) when a row needs resealing but `keyring` is
   * `null`, or a sealed row names a key that is neither the configured current nor previous key —
   * the service must not silently keep serving an unsealed/unrotatable secret, generate a new one,
   * or drop the old one; the only safe move is to stop and say exactly which rows and why.
   * @param {Database} db
   * @param {TotpKeyring|null} keyring
   * @returns {number} rows resealed
   */
  static reseal(db, keyring) {
    const rows = /** @type {{ id: string, totp_secret: string }[]} */ (
      db.prepare(`SELECT id, totp_secret FROM admins WHERE totp_secret IS NOT NULL`).all()
    );
    const needsReseal = rows.filter((r) => !(keyring && keyring.isCurrent(r.totp_secret)));
    if (needsReseal.length > 0) {
      if (!keyring) {
        throw new ConfigError(
          `${needsReseal.length} existing TOTP secret(s) need SECRETS_KEY to seal (or reseal to the current key) — ` +
          'set SECRETS_KEY (openssl rand -hex 32) and restart; the service will not start leaving them as they are.',
        );
      }
      /** @type {{ id: string, sealed: string }[]} */
      const resealedRows = [];
      /** @type {string[]} */
      const failed = [];
      for (const row of needsReseal) {
        try {
          const plaintext = SecretBox.isSealed(row.totp_secret) ? keyring.open(row.totp_secret) : row.totp_secret;
          resealedRows.push({ id: row.id, sealed: keyring.seal(plaintext) });
        } catch {
          failed.push(row.id);
        }
      }
      if (failed.length > 0) {
        throw new ConfigError(
          `cannot reseal ${failed.length} TOTP secret(s) to the current key — they are sealed under a key that is ` +
          'neither SECRETS_KEY nor SECRETS_PREVIOUS_KEY. Set SECRETS_PREVIOUS_KEY to whichever key last sealed them, ' +
          'restart to complete the reseal, then it can be removed.',
        );
      }
      const update = db.prepare(`UPDATE admins SET totp_secret = ? WHERE id = ?`);
      db.transaction(() => {
        for (const { id, sealed } of resealedRows) update.run(sealed, id);
      });
    }
    db.prepare(`INSERT OR IGNORE INTO totp_seal_state (id, fully_sealed_at) VALUES (1, ?)`).run(Date.now());
    return needsReseal.length;
  }

  /** Whether {@link reseal} has ever confirmed every `totp_secret` sealed under the current key. @param {Database} db */
  static hasFullySealed(db) {
    return db.prepare(`SELECT 1 FROM totp_seal_state WHERE id = 1`).get() !== undefined;
  }

  /**
   * @param {{ email: string, name: string, passwordHash: string, role: Role }} a
   * @param {number} [now]
   * @returns {AdminRow}
   */
  create(a, now = Date.now()) {
    const id = randomUUID();
    this.stmt.insert.run(id, AdminStore.normalizeEmail(a.email), a.name.trim(), a.passwordHash, a.role, now, now);
    return /** @type {AdminRow} */ (this.stmt.byId.get(id));
  }

  /** @param {string} id */
  byId(id) {
    return /** @type {AdminRow|undefined} */ (this.stmt.byId.get(id));
  }

  /** @param {string} email */
  byEmail(email) {
    return /** @type {AdminRow|undefined} */ (this.stmt.byEmail.get(AdminStore.normalizeEmail(email)));
  }

  /** @returns {AdminRow[]} */
  all() {
    return /** @type {AdminRow[]} */ (this.stmt.all.all());
  }

  /** Number of active administrators; the console refuses to drop below one. */
  activeAdminCount() {
    return /** @type {{ n: number }} */ (this.stmt.count.get()).n;
  }

  /** @param {string} id @param {string} hash @param {number} [now] */
  setPassword(id, hash, now = Date.now()) {
    this.stmt.setPassword.run(hash, now, id);
  }

  /** @param {string} id @param {Role} role @param {number} [now] */
  setRole(id, role, now = Date.now()) {
    this.stmt.setRole.run(role, now, id);
  }

  /** @param {string} id @param {'active'|'disabled'} status @param {number} [now] */
  setStatus(id, status, now = Date.now()) {
    this.stmt.setStatus.run(status, now, id);
  }

  /** @param {string} id @param {string} name @param {number} [now] */
  setName(id, name, now = Date.now()) {
    this.stmt.setName.run(name.trim(), now, id);
  }

  /**
   * Start enrolment: seal and store the secret, not yet enabled.
   * @param {string} id @param {string} secret @param {number} [now]
   */
  setTotpSecret(id, secret, now = Date.now()) {
    // Defensive: the domain layer (ConsoleAuth.startTotp) checks this first and throws a proper
    // ConsoleError before ever reaching here — this is a bug-catcher, not an expected user-facing path.
    if (!this.keyring) throw new Error('AdminStore.setTotpSecret requires a TotpKeyring (SECRETS_KEY)');
    this.stmt.setTotpSecret.run(this.keyring.seal(secret), now, id);
  }

  /** @param {string} id @param {number} [now] */
  enableTotp(id, now = Date.now()) {
    return this.stmt.enableTotp.run(now, now, id).changes === 1;
  }

  /** @param {string} id @param {number} [now] */
  disableTotp(id, now = Date.now()) {
    this.stmt.disableTotp.run(now, id);
  }

  /**
   * @param {string} id
   * @param {{ maxFailures: number, lockoutMs: number, now?: number }} o
   * @returns {{ failed_logins: number, locked_until: number|null }}
   */
  recordLoginFailure(id, { maxFailures, lockoutMs, now = Date.now() }) {
    return /** @type {{ failed_logins: number, locked_until: number|null }[]} */ (this.stmt.loginFailed.all(maxFailures, now + lockoutMs, now, id))[0];
  }

  /** @param {string} id @param {number} [now] */
  recordLoginSuccess(id, now = Date.now()) {
    this.stmt.loginSucceeded.run(now, now, id);
  }

  /** @param {string} id */
  remove(id) {
    return this.stmt.remove.run(id).changes === 1;
  }
}
