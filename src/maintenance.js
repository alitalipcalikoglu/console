/** Hourly purge of expired sessions and old audit rows. */
export class Maintenance {
  static INTERVAL_MS = 3_600_000;

  /**
   * @param {{ sessions: import('./store/session-store.js').SessionStore, audit: import('./store/audit-store.js').AuditStore, log: import('./types.js').Logger, options: { sessionIdleMs: number, auditRetentionDays: number } }} deps
   */
  constructor({ sessions, audit, log, options }) {
    this.sessions = sessions;
    this.audit = audit;
    this.log = log;
    this.options = options;
    /** @type {NodeJS.Timeout|null} */
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.run();
    this.timer = setInterval(() => this.run(), Maintenance.INTERVAL_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** @param {number} [now] */
  run(now = Date.now()) {
    try {
      const r = { sessions: this.sessions.purge(now, now - this.options.sessionIdleMs), audit: this.audit.purge(now - this.options.auditRetentionDays * 86_400_000) };
      if (r.sessions || r.audit) this.log.info(r, 'maintenance purged rows');
      return r;
    } catch (err) {
      this.log.error({ err }, 'maintenance failed');
      return null;
    }
  }
}
