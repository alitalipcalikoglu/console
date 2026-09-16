/** @typedef {{ id: number, kind: 'ok'|'danger'|'info'|'warn', text: string, action?: { label: string, run: () => void }, sticky?: boolean }} Toast */

/** Small global notification queue. */
export class Toasts {
  constructor() {
    /** @type {Toast[]} */
    this.items = $state([]);
    this.seq = 0;
  }

  /**
   * @param {Toast['kind']} kind
   * @param {string} text
   * @param {{ action?: Toast['action'], sticky?: boolean, ms?: number }} [o]
   */
  push(kind, text, { action, sticky = false, ms = kind === 'danger' ? 7000 : 4000 } = {}) {
    const id = ++this.seq;
    this.items = [...this.items, { id, kind, text, action, sticky }];
    if (!sticky) setTimeout(() => this.dismiss(id), ms);
    return id;
  }

  /** @param {number} id */
  dismiss(id) {
    this.items = this.items.filter((t) => t.id !== id);
  }

  /** @param {string} text @param {Parameters<Toasts['push']>[2]} [o] */
  ok(text, o) { return this.push('ok', text, o); }
  /** @param {string} text @param {Parameters<Toasts['push']>[2]} [o] */
  info(text, o) { return this.push('info', text, o); }
  /** @param {string} text @param {Parameters<Toasts['push']>[2]} [o] */
  warn(text, o) { return this.push('warn', text, o); }

  /**
   * Show an error in a way the admin can act on.
   * @param {unknown} err
   * @param {string} [fallback]
   */
  error(err, fallback = 'Something went wrong') {
    const e = /** @type {{ message?: string, code?: string, service?: string, details?: any }} */ (err ?? {});
    const parts = [e.message || fallback];
    if (e.service) parts.push(`(${e.service})`);
    if (Array.isArray(e.details?.problems)) parts.push(e.details.problems.join('; '));
    return this.push('danger', parts.join(' '));
  }
}

export const toasts = new Toasts();
