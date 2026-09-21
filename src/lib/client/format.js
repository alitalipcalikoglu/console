/** Display formatting helpers. Locale-aware where it matters. */
export class Fmt {
  /** @param {'tr'|'en'} lang */
  constructor(lang) {
    this.lang = lang;
  }

  get locale() { return this.lang === 'tr' ? 'tr-TR' : 'en-GB'; }

  /** @param {number|null|undefined} n */
  int(n) {
    return n === null || n === undefined || Number.isNaN(n) ? '–' : new Intl.NumberFormat(this.locale).format(Math.round(n));
  }

  /** @param {number|null|undefined} bytes */
  bytes(bytes) {
    if (bytes === null || bytes === undefined) return '–';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v)} ${units[i]}`;
  }

  /** @param {number|null|undefined} ms */
  ms(ms) {
    if (ms === null || ms === undefined) return '–';
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
  }

  /** @param {number|null|undefined} sec */
  duration(sec) {
    if (sec === null || sec === undefined) return '–';
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  }

  /** @param {string|number|null|undefined} iso */
  dateTime(iso) {
    if (!iso) return '–';
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }

  /**
   * "3 min ago" / "in 2 h".
   * @param {string|number|null|undefined} iso
   * @param {number} [now]
   */
  relative(iso, now = Date.now()) {
    if (!iso) return '–';
    const diff = (new Date(iso).getTime() - now) / 1000;
    const rtf = new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' });
    const abs = Math.abs(diff);
    if (diff > 0 && diff < 60) return rtf.format(0, 'second'); // clock skew between a fresh timestamp and a stale `now`
    if (abs < 60) return rtf.format(Math.round(diff), 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
    return this.dateTime(iso);
  }

  /** @param {string} s @param {number} n */
  static short(s, n = 8) {
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }
}
