import { randomUUID } from 'node:crypto';
import { ConfigError } from '@atc-web/service-core/config';
import { SecretBox } from '@atc-web/service-core/secrets';

/** @typedef {import('../db.js').Database} Database */
/** @typedef {import('../types.js').AdminRow} AdminRow */
/** @typedef {import('../types.js').Role} Role */

/** Console administrator accounts. */
export class AdminStore {
  static COLUMNS = 'id, email, name, password_hash, role, status, totp_secret, totp_enabled_at, failed_logins, locked_until, created_at, updated_at, last_login_at';

  /**
   * @param {Database} db
   * @param {import('@atc-web/service-core/secrets').SecretBox|null} [box] Seals `totp_secret` on
   *   write (Stage 4). `null` when `SECRETS_KEY` is not configured — {@link setTotpSecret} then
   *   refuses (new enrollment always needs a box to seal into; there is no plaintext fallback for a
   *   *new* secret, only for one already stored before this option existed — see {@link reseal}).
   */
  constructor(db, box = null) {
    this.box = box;
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
   * Stage 4 startup migration: re-seal any `totp_secret` still stored in plaintext from before this
   * option existed. Idempotent and safe to call on every start — a database with nothing left to
   * reseal (the common case, including every fresh install) is a single cheap read and a no-op.
   *
   * Fails fast with `ConfigError` (refuses to start, exactly like a normal config validation
   * failure) when plaintext rows exist and `box` is `null` — this is the "existing production data,
   * key missing" case: the service must not silently keep serving those secrets in plaintext, and
   * must not silently generate a new secret or lose the existing one, so the only safe move is to
   * stop and say why. Runs in one transaction: either every plaintext row this call found is sealed,
   * or (a crash mid-way) none of them are — never a partially-migrated table, and a failed attempt
   * is retried in full, from scratch, on the next start.
   * @param {Database} db
   * @param {import('@atc-web/service-core/secrets').SecretBox|null} box
   * @returns {number} rows resealed
   */
  static reseal(db, box) {
    const rows = /** @type {{ id: string, totp_secret: string }[]} */ (
      db.prepare(`SELECT id, totp_secret FROM admins WHERE totp_secret IS NOT NULL`).all()
    );
    const legacy = rows.filter((r) => !SecretBox.isSealed(r.totp_secret));
    if (legacy.length === 0) return 0;
    if (!box) {
      throw new ConfigError(
        `${legacy.length} existing TOTP secret(s) are stored in plaintext and SECRETS_KEY is not set. ` +
        'Set SECRETS_KEY (openssl rand -hex 32) and restart to seal them; the service will not start ' +
        'with unsealed secrets left in place unaddressed.',
      );
    }
    const update = db.prepare(`UPDATE admins SET totp_secret = ? WHERE id = ?`);
    db.transaction(() => {
      for (const row of legacy) update.run(box.seal(row.totp_secret), row.id);
    });
    return legacy.length;
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
    if (!this.box) throw new Error('AdminStore.setTotpSecret requires a SecretBox (SECRETS_KEY)');
    this.stmt.setTotpSecret.run(this.box.seal(secret), now, id);
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
