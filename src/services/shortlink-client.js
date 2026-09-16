import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the shortlink API. */
export class ShortlinkClient extends ServiceClient {
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
  listLinks(q) {
    return this.json('GET', `/v1/links?${ShortlinkClient.params(q, ['q', 'tag', 'status', 'createdBy', 'limit', 'cursor'])}`);
  }

  /** @param {string} code */
  getLink(code) {
    return this.json('GET', `/v1/links/${encodeURIComponent(code)}`);
  }

  /** @param {object} body */
  createLink(body) {
    return this.json('POST', '/v1/links', { body });
  }

  /** @param {string} code @param {object} patch */
  patchLink(code, patch) {
    return this.json('PATCH', `/v1/links/${encodeURIComponent(code)}`, { body: patch });
  }

  /** @param {string} code */
  deleteLink(code) {
    return this.json('DELETE', `/v1/links/${encodeURIComponent(code)}`);
  }

  /** @param {string} code @param {number} [days] */
  linkStats(code, days) {
    return this.json('GET', `/v1/links/${encodeURIComponent(code)}/stats${days ? `?days=${days}` : ''}`);
  }

  /**
   * PNG only: the console shows QR codes inline and never relays SVG.
   * @param {string} code
   * @param {{ scale?: number, margin?: number }} o
   */
  qrPng(code, o) {
    const p = ShortlinkClient.params({ format: 'png', scale: o.scale, margin: o.margin }, ['format', 'scale', 'margin']);
    return this.request('GET', `/v1/links/${encodeURIComponent(code)}/qr?${p}`);
  }

  /** @param {number} [days] */
  stats(days) {
    return this.json('GET', `/v1/stats${days ? `?days=${days}` : ''}`);
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      activeLinks: PrometheusText.value(s, 'shortlink_links', { state: 'active' }),
      inactiveLinks: PrometheusText.value(s, 'shortlink_links', { state: 'inactive' }),
      clicks: PrometheusText.value(s, 'shortlink_clicks_total'),
      clicksLastHour: PrometheusText.value(s, 'shortlink_clicks_last_hour'),
      uptimeSec: PrometheusText.value(s, 'shortlink_process_uptime_seconds'),
    };
  }
}
