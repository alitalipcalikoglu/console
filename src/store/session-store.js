import { randomUUID } from 'node:crypto';
import { OpaqueToken } from '../crypto/opaque-token.js';

/** @typedef {import('../db.js').Database} Database */
/** @typedef {import('../types.js').SessionRow} SessionRow */

/** Server-side browser sessions. The cookie holds an opaque token; only its hash is stored. */
export class SessionStore {
  static COLUMNS = 'id, admin_id, token_hash, created_at, last_seen_at, expires_at, totp_pending, ip, user_agent';

  /** @param {Database} db */
  constructor(db) {
    const C = SessionStore.COLUMNS;
    this.stmt = {
      insert: db.prepare(`INSERT INTO sessions (id, admin_id, token_hash, created_at, last_seen_at, expires_at, totp_pending, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      byToken: db.prepare(`SELECT ${C} FROM sessions WHERE token_hash = ?`),
      byId: db.prepare(`SELECT ${C} FROM sessions WHERE id = ?`),
      touch: db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`),
      clearPending: db.prepare(`UPDATE sessions SET totp_pending = 0, last_seen_at = ? WHERE id = ?`),
      remove: db.prepare(`DELETE FROM sessions WHERE id = ?`),
      removeForAdmin: db.prepare(`DELETE FROM sessions WHERE admin_id = ? AND id != ?`),
      forAdmin: db.prepare(`SELECT ${C} FROM sessions WHERE admin_id = ? AND expires_at > ? AND totp_pending = 0 ORDER BY last_seen_at DESC`),
      purge: db.prepare(`DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?`),
      totpUsed: db.prepare(`INSERT INTO totp_used (admin_id, step) VALUES (?, ?) ON CONFLICT DO NOTHING`),
      totpPurge: db.prepare(`DELETE FROM totp_used WHERE step < ?`),
    };
  }

  /**
   * @param {{ adminId: string, ttlMs: number, totpPending: boolean, ip: string|null, userAgent: string|null }} s
   * @param {number} [now]
   * @returns {{ session: SessionRow, token: string }}
   */
  create(s, now = Date.now()) {
    const id = randomUUID();
    const { token, hash } = OpaqueToken.generate();
    this.stmt.insert.run(id, s.adminId, hash, now, now, now + s.ttlMs, s.totpPending ? 1 : 0, s.ip, s.userAgent);
    return { session: /** @type {SessionRow} */ (this.stmt.byId.get(id)), token };
  }

  /**
   * @param {string} token
   * @returns {SessionRow|undefined}
   */
  byToken(token) {
    if (!OpaqueToken.looksValid(token)) return undefined;
    return /** @type {SessionRow|undefined} */ (this.stmt.byToken.get(OpaqueToken.hash(token)));
  }

  /** @param {string} id */
  byId(id) {
    return /** @type {SessionRow|undefined} */ (this.stmt.byId.get(id));
  }

  /** @param {string} id @param {number} [now] */
  touch(id, now = Date.now()) {
    this.stmt.touch.run(now, id);
  }

  /** @param {string} id @param {number} [now] */
  completeTotp(id, now = Date.now()) {
    this.stmt.clearPending.run(now, id);
  }

  /** @param {string} id */
  remove(id) {
    return this.stmt.remove.run(id).changes === 1;
  }

  /**
   * Remove every other session of an admin (password change, "sign out everywhere").
   * @param {string} adminId
   * @param {string} keepId
   */
  removeOthers(adminId, keepId) {
    return Number(this.stmt.removeForAdmin.run(adminId, keepId).changes);
  }

  /** @param {string} adminId @param {number} [now] */
  forAdmin(adminId, now = Date.now()) {
    return /** @type {SessionRow[]} */ (this.stmt.forAdmin.all(adminId, now));
  }

  /**
   * Refuse a TOTP step that was already accepted for this admin (replay within the window).
   * @param {string} adminId
   * @param {number} step
   * @returns {boolean} true if the step was fresh.
   */
  claimTotpStep(adminId, step) {
    return this.stmt.totpUsed.run(adminId, step).changes === 1;
  }

  /**
   * @param {number} now
   * @param {number} idleBefore  last_seen_at older than this is expired by inactivity.
   */
  purge(now, idleBefore) {
    const sessions = Number(this.stmt.purge.run(now, idleBefore).changes);
    this.stmt.totpPurge.run(Math.floor(now / 1000 / 30) - 10);
    return sessions;
  }
}
