import { randomUUID } from 'node:crypto';

/** @typedef {import('../db.js').Database} Database */
/** @typedef {import('../types.js').AdminRow} AdminRow */
/** @typedef {import('../types.js').Role} Role */

/** Console administrator accounts. */
export class AdminStore {
  static COLUMNS = 'id, email, name, password_hash, role, status, totp_secret, totp_enabled_at, failed_logins, locked_until, created_at, updated_at, last_login_at';

  /** @param {Database} db */
  constructor(db) {
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

  /** Start enrolment: store the secret, not yet enabled. @param {string} id @param {string} secret @param {number} [now] */
  setTotpSecret(id, secret, now = Date.now()) {
    this.stmt.setTotpSecret.run(secret, now, id);
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
