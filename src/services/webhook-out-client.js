import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the webhook-out API. */
export class WebhookOutClient extends ServiceClient {
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
  listSubscriptions(q) {
    return this.json('GET', `/v1/subscriptions?${WebhookOutClient.params(q, ['q', 'status', 'event', 'limit', 'cursor'])}`);
  }

  /** @param {string} id */
  getSubscription(id) {
    return this.json('GET', `/v1/subscriptions/${encodeURIComponent(id)}`);
  }

  /** @param {object} body */
  createSubscription(body) {
    return this.json('POST', '/v1/subscriptions', { body });
  }

  /** @param {string} id @param {object} patch */
  patchSubscription(id, patch) {
    return this.json('PATCH', `/v1/subscriptions/${encodeURIComponent(id)}`, { body: patch });
  }

  /** @param {string} id */
  deleteSubscription(id) {
    return this.json('DELETE', `/v1/subscriptions/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  rotate(id) {
    return this.json('POST', `/v1/subscriptions/${encodeURIComponent(id)}/rotate`);
  }

  /** @param {string} id */
  test(id) {
    return this.json('POST', `/v1/subscriptions/${encodeURIComponent(id)}/test`);
  }

  /** @param {string} id @param {{ from: string, to?: string }} body */
  replay(id, body) {
    return this.json('POST', `/v1/subscriptions/${encodeURIComponent(id)}/replay`, { body });
  }

  /** @param {{ status?: string, subscription?: string, event?: string, limit?: number, before?: string }} q */
  deliveries(q) {
    return this.json('GET', `/v1/deliveries?${WebhookOutClient.params(q, ['status', 'subscription', 'event', 'limit', 'before'])}`);
  }

  /** @param {string} id */
  getDelivery(id) {
    return this.json('GET', `/v1/deliveries/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  redeliver(id) {
    return this.json('POST', `/v1/deliveries/${encodeURIComponent(id)}/redeliver`);
  }

  /** @param {string} id */
  cancelDelivery(id) {
    return this.json('POST', `/v1/deliveries/${encodeURIComponent(id)}/cancel`);
  }

  /** @param {{ type?: string, limit?: number, before?: string }} q */
  events(q) {
    return this.json('GET', `/v1/events?${WebhookOutClient.params(q, ['type', 'limit', 'before'])}`);
  }

  /** @param {string} id */
  getEvent(id) {
    return this.json('GET', `/v1/events/${encodeURIComponent(id)}`);
  }

  eventTypes() {
    return this.json('GET', '/v1/event-types');
  }

  stats() {
    return this.json('GET', '/v1/stats');
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      activeSubscriptions: PrometheusText.value(s, 'webhook_subscriptions', { status: 'active' }),
      pausedSubscriptions: PrometheusText.value(s, 'webhook_subscriptions', { status: 'paused' }),
      disabledSubscriptions: PrometheusText.value(s, 'webhook_subscriptions', { status: 'disabled' }),
      events: PrometheusText.value(s, 'webhook_events_total'),
      deliveriesByStatus: Object.fromEntries(s.filter((x) => x.name === 'webhook_deliveries').map((x) => [x.labels.status, x.value])),
      backlog: PrometheusText.value(s, 'webhook_backlog'),
      oldestQueuedAgeSec: PrometheusText.value(s, 'webhook_oldest_queued_age_seconds'),
      failedSinceStart: PrometheusText.value(s, 'webhook_deliveries_finished_total', { status: 'failed' }),
      uptimeSec: PrometheusText.value(s, 'webhook_process_uptime_seconds'),
    };
  }
}
