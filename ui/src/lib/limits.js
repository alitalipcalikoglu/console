/**
 * Editing helpers for ratelimit limit lists: a limit is `{ window: seconds, limit: units }`, the
 * editor works with `{ n, unit, limit }` rows where the window is `n × unit`.
 * @typedef {{ window: number, limit: number }} Limit
 * @typedef {'s'|'m'|'h'|'d'} Unit
 * @typedef {{ n: number, unit: Unit, limit: number }} LimitRow
 */
export class LimitRows {
  /** @type {Record<Unit, number>} */
  static UNIT_SEC = { s: 1, m: 60, h: 3600, d: 86400 };
  /** @type {Unit[]} */
  static UNITS = ['s', 'm', 'h', 'd'];

  /** Largest unit that divides the window evenly. @param {number} sec */
  static split(sec) {
    for (const u of [...LimitRows.UNITS].reverse()) if (sec % LimitRows.UNIT_SEC[u] === 0) return { n: sec / LimitRows.UNIT_SEC[u], unit: u };
    return { n: sec, unit: /** @type {Unit} */ ('s') };
  }

  /** @param {Limit[]} limits @returns {LimitRow[]} */
  static fromLimits(limits) {
    return limits.map((l) => ({ ...LimitRows.split(l.window), limit: l.limit }));
  }

  /** @param {LimitRow[]} rows @returns {Limit[]} */
  static toLimits(rows) {
    return rows.map((r) => ({ window: Number(r.n) * LimitRows.UNIT_SEC[r.unit], limit: Number(r.limit) })).sort((a, b) => a.window - b.window);
  }

  /** Rows are complete, integers in range, windows distinct. @param {LimitRow[]} rows @param {number} maxWindowSec */
  static valid(rows, maxWindowSec = 2_592_000) {
    if (!rows.length) return false;
    const seen = new Set();
    for (const r of rows) {
      const n = Number(r.n);
      const limit = Number(r.limit);
      if (!Number.isInteger(n) || n < 1 || !Number.isInteger(limit) || limit < 0) return false;
      const w = n * LimitRows.UNIT_SEC[r.unit];
      if (w > maxWindowSec || seen.has(w)) return false;
      seen.add(w);
    }
    return true;
  }

  /** New empty row. @returns {LimitRow} */
  static blank() {
    return { n: 1, unit: 'm', limit: 100 };
  }
}
