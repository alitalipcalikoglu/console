import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the notify API. */
export class NotifyClient extends ServiceClient {
  /** @param {{ status?: string, limit?: number, cursor?: string }} q */
  listMessages(q) {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.limit) p.set('limit', String(q.limit));
    if (q.cursor) p.set('cursor', q.cursor);
    return this.json('GET', `/v1/messages?${p}`);
  }

  /** @param {string} id */
  getMessage(id) {
    return this.json('GET', `/v1/messages/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  retry(id) {
    return this.json('POST', `/v1/messages/${encodeURIComponent(id)}/retry`);
  }

  templates() {
    return this.json('GET', '/v1/templates');
  }

  /** @param {object} body */
  send(body) {
    return this.json('POST', '/v1/messages', { body });
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      queued: PrometheusText.value(s, 'notify_messages', { status: 'queued' }),
      processing: PrometheusText.value(s, 'notify_messages', { status: 'processing' }),
      sent: PrometheusText.value(s, 'notify_messages', { status: 'sent' }),
      failed: PrometheusText.value(s, 'notify_messages', { status: 'failed' }),
      oldestQueuedAgeSec: PrometheusText.value(s, 'notify_oldest_queued_age_seconds'),
      uptimeSec: PrometheusText.value(s, 'notify_process_uptime_seconds'),
    };
  }
}
