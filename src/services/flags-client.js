import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the flags API. */
export class FlagsClient extends ServiceClient {
  /**
   * @param {Record<string, string|number|undefined>} q
   * @param {readonly string[]} keys
   */
  static params(q, keys) {
    const p = new URLSearchParams();
    for (const k of keys) if (q[k] !== undefined && q[k] !== '') p.set(k, String(q[k]));
    return p;
  }

  environments() {
    return this.json('GET', '/v1/environments');
  }

  /** @param {Record<string, string|number|undefined>} q */
  listFlags(q) {
    return this.json('GET', `/v1/flags?${FlagsClient.params(q, ['q', 'tag', 'kind', 'archived', 'limit', 'cursor'])}`);
  }

  /** @param {string} key */
  getFlag(key) {
    return this.json('GET', `/v1/flags/${encodeURIComponent(key)}`);
  }

  /** @param {object} body */
  createFlag(body) {
    return this.json('POST', '/v1/flags', { body });
  }

  /** @param {string} key @param {object} patch */
  patchFlag(key, patch) {
    return this.json('PATCH', `/v1/flags/${encodeURIComponent(key)}`, { body: patch });
  }

  /** @param {string} key */
  deleteFlag(key) {
    return this.json('DELETE', `/v1/flags/${encodeURIComponent(key)}`);
  }

  /** @param {string} key @param {string} env @param {object} patch */
  patchEnv(key, env, patch) {
    return this.json('PATCH', `/v1/flags/${encodeURIComponent(key)}/envs/${encodeURIComponent(env)}`, { body: patch });
  }

  /** @param {string} key @param {string} from @param {string} to */
  copyEnv(key, from, to) {
    return this.json('POST', `/v1/flags/${encodeURIComponent(key)}/envs/${encodeURIComponent(from)}/copy`, { body: { to } });
  }

  /** @param {string|null} key @param {{ limit?: number, before?: string }} q */
  history(key, q) {
    const p = FlagsClient.params(q, ['limit', 'before']);
    return this.json('GET', key === null ? `/v1/history?${p}` : `/v1/flags/${encodeURIComponent(key)}/history?${p}`);
  }

  /** @param {{ env: string, context?: object, keys?: string[] }} body */
  evaluate(body) {
    return this.json('POST', '/v1/evaluate', { body: { ...body, details: true } });
  }

  stats() {
    return this.json('GET', '/v1/stats');
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      activeFlags: PrometheusText.value(s, 'flags_total', { state: 'active' }),
      archivedFlags: PrometheusText.value(s, 'flags_total', { state: 'archived' }),
      enabledByEnv: Object.fromEntries(s.filter((x) => x.name === 'flags_enabled').map((x) => [x.labels.env, x.value])),
      evaluationsByEnv: Object.fromEntries(s.filter((x) => x.name === 'flags_evaluations_total').map((x) => [x.labels.env, x.value])),
      uptimeSec: PrometheusText.value(s, 'flags_process_uptime_seconds'),
    };
  }
}
