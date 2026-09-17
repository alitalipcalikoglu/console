import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the ratelimit API. */
export class RateLimitClient extends ServiceClient {
  /**
   * @param {Record<string, string|number|undefined>} q
   * @param {readonly string[]} keys
   */
  static params(q, keys) {
    const p = new URLSearchParams();
    for (const k of keys) if (q[k] !== undefined && q[k] !== '') p.set(k, String(q[k]));
    return p;
  }

  /** @param {string} name */
  static #p(name) {
    return `/v1/policies/${encodeURIComponent(name)}`;
  }

  listPolicies() {
    return this.json('GET', '/v1/policies');
  }

  /** @param {string} name */
  getPolicy(name) {
    return this.json('GET', RateLimitClient.#p(name));
  }

  /** @param {object} body */
  createPolicy(body) {
    return this.json('POST', '/v1/policies', { body });
  }

  /** @param {string} name @param {object} patch */
  patchPolicy(name, patch) {
    return this.json('PATCH', RateLimitClient.#p(name), { body: patch });
  }

  /** @param {string} name */
  deletePolicy(name) {
    return this.json('DELETE', RateLimitClient.#p(name));
  }

  /** @param {string} name @param {{ hours?: number }} q */
  policyStats(name, q) {
    return this.json('GET', `${RateLimitClient.#p(name)}/stats?${RateLimitClient.params(q, ['hours'])}`);
  }

  /** @param {string} name @param {{ window?: number, limit?: number }} q */
  top(name, q) {
    return this.json('GET', `${RateLimitClient.#p(name)}/top?${RateLimitClient.params(q, ['window', 'limit'])}`);
  }

  /** @param {string} name @param {{ limit?: number, offset?: number }} q */
  overrides(name, q) {
    return this.json('GET', `${RateLimitClient.#p(name)}/overrides?${RateLimitClient.params(q, ['limit', 'offset'])}`);
  }

  /** @param {string} name @param {string} subject @param {object} body */
  setOverride(name, subject, body) {
    return this.json('PUT', `${RateLimitClient.#p(name)}/overrides/${encodeURIComponent(subject)}`, { body });
  }

  /** @param {string} name @param {string} subject */
  deleteOverride(name, subject) {
    return this.json('DELETE', `${RateLimitClient.#p(name)}/overrides/${encodeURIComponent(subject)}`);
  }

  /** @param {string} name @param {string} subject */
  subject(name, subject) {
    return this.json('GET', `${RateLimitClient.#p(name)}/subjects/${encodeURIComponent(subject)}`);
  }

  /** @param {string} name @param {string} subject */
  resetSubject(name, subject) {
    return this.json('DELETE', `${RateLimitClient.#p(name)}/subjects/${encodeURIComponent(subject)}/usage`);
  }

  /** @param {object} body */
  check(body) {
    return this.json('POST', '/v1/check', { body });
  }

  stats() {
    return this.json('GET', '/v1/stats');
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    const sum = (/** @type {string} */ decision) => s.filter((x) => x.name === 'ratelimit_decisions_total' && x.labels.decision === decision).reduce((a, x) => a + x.value, 0);
    return {
      policies: PrometheusText.value(s, 'ratelimit_policies'),
      allowed: sum('allowed'),
      denied: sum('denied'),
      counters: PrometheusText.value(s, 'ratelimit_counters'),
      dbBytes: PrometheusText.value(s, 'ratelimit_db_bytes'),
      uptimeSec: PrometheusText.value(s, 'ratelimit_process_uptime_seconds'),
    };
  }
}
