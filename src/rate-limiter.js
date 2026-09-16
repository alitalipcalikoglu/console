/** In-memory fixed-window limiter (one-minute windows) for the login endpoints. */
export class RateLimiter {
  static WINDOW_MS = 60_000;

  constructor() {
    /** @type {Map<string, { count: number, resetAt: number }>} */
    this.buckets = new Map();
    this.lastSweep = 0;
  }

  /**
   * @param {string} key
   * @param {number} max
   * @param {number} [now]
   */
  hit(key, max, now = Date.now()) {
    if (now - this.lastSweep >= RateLimiter.WINDOW_MS) {
      this.lastSweep = now;
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    }
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + RateLimiter.WINDOW_MS };
      this.buckets.set(key, b);
    }
    b.count += 1;
    return { allowed: b.count <= max, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
}
