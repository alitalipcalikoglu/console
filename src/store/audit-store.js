/** @typedef {import('../db.js').Database} Database */
/** @typedef {import('../types.js').AuditRow} AuditRow */

/** Append-only log of who did what in the console. */
export class AuditStore {
  static COLUMNS = 'id, admin_id, admin_email, action, target, meta, ip, at';

  /** @param {Database} db */
  constructor(db) {
    /** Called after every insert, e.g. to forward the entry to the audit service. @type {((e: { adminId: string|null, adminEmail: string|null, action: string, target: string|null, meta: object|null, ip: string|null }, at: number) => void)|null} */
    this.onRecord = null;
    const C = AuditStore.COLUMNS;
    this.stmt = {
      insert: db.prepare(`INSERT INTO audit (admin_id, admin_email, action, target, meta, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      list: db.prepare(`SELECT ${C} FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?`),
      listByAction: db.prepare(`SELECT ${C} FROM audit WHERE id < ? AND action LIKE ? ORDER BY id DESC LIMIT ?`),
      purge: db.prepare(`DELETE FROM audit WHERE at < ?`),
    };
  }

  /**
   * @param {{ adminId?: string|null, adminEmail?: string|null, action: string, target?: string|null, meta?: object|null, ip?: string|null }} e
   * @param {number} [now]
   */
  record({ adminId = null, adminEmail = null, action, target = null, meta = null, ip = null }, now = Date.now()) {
    this.stmt.insert.run(adminId, adminEmail, action, target, meta ? JSON.stringify(meta) : null, ip, now);
    this.onRecord?.({ adminId, adminEmail, action, target, meta, ip }, now);
  }

  /**
   * @param {{ limit: number, beforeId?: number, action?: string }} q  `action` is a prefix, e.g. "auth." or "login".
   * @returns {AuditRow[]}
   */
  list({ limit, beforeId = Number.MAX_SAFE_INTEGER, action }) {
    if (action) return /** @type {AuditRow[]} */ (this.stmt.listByAction.all(beforeId, `${action.replace(/[%_]/g, '')}%`, limit));
    return /** @type {AuditRow[]} */ (this.stmt.list.all(beforeId, limit));
  }

  /** @param {number} before */
  purge(before) {
    return Number(this.stmt.purge.run(before).changes);
  }
}
