import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the search API. */
export class SearchClient extends ServiceClient {
  /**
   * @param {Record<string, string|number|undefined>} q
   * @param {readonly string[]} keys
   */
  static params(q, keys) {
    const p = new URLSearchParams();
    for (const k of keys) if (q[k] !== undefined && q[k] !== '') p.set(k, String(q[k]));
    return p;
  }

  listIndexes() {
    return this.json('GET', '/v1/indexes');
  }

  /** @param {string} name */
  getIndex(name) {
    return this.json('GET', `/v1/indexes/${encodeURIComponent(name)}`);
  }

  /** @param {object} body */
  createIndex(body) {
    return this.json('POST', '/v1/indexes', { body });
  }

  /** @param {string} name @param {object} patch */
  patchIndex(name, patch) {
    return this.json('PATCH', `/v1/indexes/${encodeURIComponent(name)}`, { body: patch });
  }

  /** @param {string} name */
  deleteIndex(name) {
    return this.json('DELETE', `/v1/indexes/${encodeURIComponent(name)}`);
  }

  /** @param {string} name */
  clearIndex(name) {
    return this.json('POST', `/v1/indexes/${encodeURIComponent(name)}/clear`);
  }

  /** @param {string} name @param {object} body */
  search(name, body) {
    return this.json('POST', `/v1/indexes/${encodeURIComponent(name)}/search`, { body });
  }

  /** @param {string} name @param {{ limit?: number, offset?: number }} q */
  browse(name, q) {
    return this.json('GET', `/v1/indexes/${encodeURIComponent(name)}/documents?${SearchClient.params(q, ['limit', 'offset'])}`);
  }

  /** @param {string} name @param {string} id */
  getDocument(name, id) {
    return this.json('GET', `/v1/indexes/${encodeURIComponent(name)}/documents/${encodeURIComponent(id)}`);
  }

  /** @param {string} name @param {object[]} documents */
  upsert(name, documents) {
    return this.json('PUT', `/v1/indexes/${encodeURIComponent(name)}/documents`, { body: { documents } });
  }

  /** @param {string} name @param {string} id */
  deleteDocument(name, id) {
    return this.json('DELETE', `/v1/indexes/${encodeURIComponent(name)}/documents/${encodeURIComponent(id)}`);
  }

  stats() {
    return this.json('GET', '/v1/stats');
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      indexes: PrometheusText.value(s, 'search_indexes'),
      documents: PrometheusText.value(s, 'search_documents_total'),
      queriesByIndex: Object.fromEntries(s.filter((x) => x.name === 'search_queries_total').map((x) => [x.labels.index, x.value])),
      dbBytes: PrometheusText.value(s, 'search_db_bytes'),
      uptimeSec: PrometheusText.value(s, 'search_process_uptime_seconds'),
    };
  }
}
