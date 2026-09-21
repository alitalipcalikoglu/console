import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the audit service (read role: the console never writes events there). */
export class AuditClient extends ServiceClient {
  static EXPORT_TIMEOUT_MS = 600_000;

  /** Query parameters forwarded verbatim to the audit service's filters. */
  static FILTERS = /** @type {const} */ (['source', 'action', 'actionPrefix', 'outcome', 'actorType', 'actorId', 'targetType', 'targetId', 'ip', 'requestId', 'from', 'to']);

  /**
   * @param {Record<string, string|number|undefined>} q
   * @param {readonly string[]} keys
   */
  static params(q, keys) {
    const p = new URLSearchParams();
    for (const k of keys) if (q[k] !== undefined && q[k] !== '') p.set(k, String(q[k]));
    return p;
  }

  /** @param {Record<string, string|number|undefined>} q */
  listEvents(q) {
    const p = AuditClient.params(q, [...AuditClient.FILTERS, 'limit', 'cursor']);
    return this.json('GET', `/v1/events?${p}`);
  }

  /** @param {string} id */
  getEvent(id) {
    return this.json('GET', `/v1/events/${encodeURIComponent(id)}`);
  }

  /** @param {number} [hours] */
  stats(hours) {
    return this.json('GET', `/v1/stats${hours ? `?hours=${hours}` : ''}`);
  }

  chainHead() {
    return this.json('GET', '/v1/chain/head');
  }

  /** @param {{ fromSeq?: number, toSeq?: number }} q */
  verify(q) {
    const p = AuditClient.params(q, ['fromSeq', 'toSeq']);
    return this.json('GET', `/v1/chain/verify?${p}`, { timeoutMs: 120_000 });
  }

  /**
   * Streaming export; the caller pipes the response body through.
   * @param {Record<string, string|undefined>} q
   * @param {'ndjson'|'csv'} format
   */
  export(q, format) {
    const p = AuditClient.params(q, AuditClient.FILTERS);
    p.set('format', format);
    return this.request('GET', `/v1/events/export?${p}`, { timeoutMs: AuditClient.EXPORT_TIMEOUT_MS });
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      total: PrometheusText.value(s, 'audit_events_total'),
      lastHour: PrometheusText.value(s, 'audit_events_received_last_hour'),
      headSeq: PrometheusText.value(s, 'audit_chain_head_seq'),
      oldestAgeSec: PrometheusText.value(s, 'audit_oldest_event_age_seconds'),
      dbBytes: PrometheusText.value(s, 'audit_db_bytes'),
      uptimeSec: PrometheusText.value(s, 'audit_process_uptime_seconds'),
      bySource: Object.fromEntries(s.filter((x) => x.name === 'audit_events_by_source').map((x) => [x.labels.source, x.value])),
    };
  }
}
