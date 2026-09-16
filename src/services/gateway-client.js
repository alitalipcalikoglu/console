import { ServiceClient } from './client.js';

/** Typed wrapper over the gateway's probes and metrics. */
export class GatewayClient extends ServiceClient {
  /**
   * Per-route request counts, error counts and latency from the Prometheus endpoint.
   * @returns {Promise<{ routes: Record<string, { requests: Record<string, number>, upstreamErrors: number, p50Ms: number|null, p95Ms: number|null, bytesIn: number, bytesOut: number }>, rejected: Record<string, number>, uptimeSec: number|null }|null>}
   */
  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    /** @type {Record<string, any>} */
    const routes = {};
    const route = (/** @type {string} */ id) => (routes[id] ??= { requests: {}, upstreamErrors: 0, buckets: [], count: 0, bytesIn: 0, bytesOut: 0 });
    /** @type {Record<string, number>} */
    const rejected = {};
    let uptimeSec = null;
    for (const x of s) {
      switch (x.name) {
        case 'gateway_requests_total': route(x.labels.route).requests[x.labels.status] = x.value; break;
        case 'gateway_upstream_errors_total': route(x.labels.route).upstreamErrors = x.value; break;
        case 'gateway_request_duration_ms_bucket': route(x.labels.route).buckets.push({ le: x.labels.le === '+Inf' ? Infinity : Number(x.labels.le), n: x.value }); break;
        case 'gateway_request_duration_ms_count': route(x.labels.route).count = x.value; break;
        case 'gateway_bytes_total': route(x.labels.route)[x.labels.direction === 'in' ? 'bytesIn' : 'bytesOut'] = x.value; break;
        case 'gateway_rejected_total': rejected[x.labels.reason] = x.value; break;
        case 'gateway_process_uptime_seconds': uptimeSec = x.value; break;
        default: break;
      }
    }
    for (const r of Object.values(routes)) {
      r.p50Ms = GatewayClient.#quantile(r.buckets, r.count, 0.5);
      r.p95Ms = GatewayClient.#quantile(r.buckets, r.count, 0.95);
      delete r.buckets;
      delete r.count;
    }
    return { routes, rejected, uptimeSec };
  }

  /**
   * Upper bound of the histogram bucket holding the quantile.
   * @param {{ le: number, n: number }[]} buckets
   * @param {number} count
   * @param {number} q
   */
  static #quantile(buckets, count, q) {
    if (!count) return null;
    const sorted = [...buckets].sort((a, b) => a.le - b.le);
    const target = count * q;
    for (const b of sorted) if (b.n >= target) return b.le === Infinity ? sorted[sorted.length - 2]?.le ?? null : b.le;
    return null;
  }
}
