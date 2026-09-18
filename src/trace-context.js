import { randomBytes } from 'node:crypto';

/**
 * W3C Trace Context (`traceparent`, https://www.w3.org/TR/trace-context/) for console's own
 * outbound calls to the services it manages (Stage 10 — see `stack/docs/OBSERVABILITY.md`
 * "`traceparent`", which named this as the next service to adopt it). Console is a trust boundary
 * exactly like gateway (reached directly by browsers, never behind a proxy whose headers it would
 * make sense to trust) — and its existing `X-Request-Id` policy already reflects that: it always
 * mints its own (`requestIdHeader: false` in `http/console-api.js`), never an inbound client's.
 * `traceparent` follows the identical policy here, for the identical reason: an inbound
 * `traceparent` is never read or trusted (a browser could claim any trace-id it likes), so there is
 * nothing to validate and nothing that can be malformed on the way in — console always starts a
 * fresh trace for a request it handles, the same way it always starts a fresh request id.
 *
 * A fresh span id is minted per outbound hop (`span()`), not once per inbound request reused
 * everywhere — one console request commonly fans out to several services (dashboards, `/v1/info`
 * aggregation), and each of those is its own hop under the same trace, not the same hop repeated.
 */
export class TraceContext {
  static VERSION = '00';

  /**
   * @param {string} traceId 32 hex chars, identifies the whole admin action across every hop.
   * @param {string} spanId  16 hex chars, identifies this one hop.
   * @param {string} [flags] 2 hex chars; `01` = sampled.
   */
  constructor(traceId, spanId, flags = '01') {
    this.traceId = traceId;
    this.spanId = spanId;
    this.flags = flags;
  }

  /** A fresh trace for one inbound console request — never derived from anything the browser sent. */
  static forRequest() {
    return new TraceContext(randomBytes(16).toString('hex'), randomBytes(8).toString('hex'));
  }

  /** A fresh span within this same trace, for one outbound call. */
  span() {
    return new TraceContext(this.traceId, randomBytes(8).toString('hex'), this.flags);
  }

  toString() {
    return `${TraceContext.VERSION}-${this.traceId}-${this.spanId}-${this.flags}`;
  }
}
