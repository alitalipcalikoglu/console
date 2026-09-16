/**
 * Request-timing statistics for one service and the adaptive interval derived from them.
 * Pure (no runes) so it can be unit tested with node:test.
 */
export class PollMetrics {
  static WINDOW = 10;
  /** Effective interval must leave this much headroom over the average request time. */
  static HEADROOM = 1.3;

  constructor() {
    /** @type {number[]} last durations in ms, oldest first */
    this.durations = [];
    this.runs = 0;
    this.errors = 0;
    /** Ticks that arrived while a request was in flight and were folded into one follow-up run. */
    this.coalesced = 0;
    this.lastMs = 0;
  }

  /**
   * @param {number} ms
   * @param {boolean} ok
   */
  record(ms, ok) {
    this.durations.push(ms);
    if (this.durations.length > PollMetrics.WINDOW) this.durations.shift();
    this.lastMs = ms;
    this.runs += 1;
    if (!ok) this.errors += 1;
  }

  get avgMs() {
    return this.durations.length ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length : 0;
  }

  get maxMs() {
    return this.durations.length ? Math.max(...this.durations) : 0;
  }

  /**
   * Interval to actually use: never below the configured one, and at least avg × 1.3 so a slow
   * service is not asked again before it has answered (10 s average → at least 13 s).
   * @param {number} configuredSec
   */
  effectiveSec(configuredSec) {
    const needed = Math.ceil((this.avgMs / 1000) * PollMetrics.HEADROOM);
    return Math.max(configuredSec, needed);
  }

  /** @param {number} configuredSec */
  isSlowedDown(configuredSec) {
    return this.effectiveSec(configuredSec) > configuredSec;
  }
}
