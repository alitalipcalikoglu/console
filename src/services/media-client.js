import { PrometheusText, ServiceClient, ServiceError } from './client.js';

/** Typed wrapper over the media API. */
export class MediaClient extends ServiceClient {
  /** @param {{ limit?: number, cursor?: string }} q */
  listFiles(q) {
    const p = new URLSearchParams();
    if (q.limit) p.set('limit', String(q.limit));
    if (q.cursor) p.set('cursor', q.cursor);
    return this.json('GET', `/v1/files?${p}`);
  }

  /** @param {string} id */
  getFile(id) {
    return this.json('GET', `/v1/files/${encodeURIComponent(id)}`);
  }

  /**
   * Stream an upload through to media.
   * @param {NodeJS.ReadableStream|BodyInit|null} stream
   * @param {{ name?: string|null, visibility?: string, contentType?: string, contentLength?: string }} o
   * @param {AbortSignal} [signal]
   */
  upload(stream, o, signal) {
    const p = new URLSearchParams();
    if (o.visibility) p.set('visibility', o.visibility);
    /** @type {Record<string, string>} */
    const headers = {};
    if (o.contentType) headers['content-type'] = o.contentType;
    if (o.contentLength) headers['content-length'] = o.contentLength;
    if (o.name) headers['x-file-name'] = encodeURIComponent(o.name);
    return this.json('PUT', `/v1/files?${p}`, { raw: /** @type {any} */ (stream), headers, timeoutMs: 300_000, signal });
  }

  /** @param {string} id @param {{ name?: string, visibility?: 'public'|'private' }} patch */
  patchFile(id, patch) {
    return this.json('PATCH', `/v1/files/${encodeURIComponent(id)}`, { body: patch });
  }

  /** @param {string} id */
  deleteFile(id) {
    return this.json('DELETE', `/v1/files/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  restoreFile(id) {
    return this.json('POST', `/v1/files/${encodeURIComponent(id)}/restore`);
  }

  /** @param {string} id @param {number} [ttlSec] */
  urls(id, ttlSec) {
    return this.json('POST', `/v1/files/${encodeURIComponent(id)}/urls${ttlSec ? `?ttl=${ttlSec}` : ''}`);
  }

  /** @param {object} body */
  createTicket(body) {
    return this.json('POST', '/v1/uploads', { body });
  }

  /**
   * Fetch file bytes for proxying to the browser (thumbnails, previews). Uses the internal URL
   * even when the service advertises a public one.
   * @param {string} id
   * @param {string} variant
   * @returns {Promise<Response>}
   */
  async bytes(id, variant) {
    const { urls } = /** @type {{ urls: Record<string, { url: string }> }} */ (await this.urls(id, 300));
    const entry = urls[variant];
    if (!entry) throw new ServiceError(`variant "${variant}" not available`, { statusCode: 404, code: 'UNKNOWN_VARIANT', service: this.def.id });
    const u = new URL(entry.url);
    const res = await this.request('GET', `${u.pathname}${u.search}`, { auth: 'none', timeoutMs: 60_000 });
    if (!res.ok) throw new ServiceError(`${this.def.id} delivery responded ${res.status}`, { statusCode: res.status, service: this.def.id });
    return res;
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      files: PrometheusText.value(s, 'media_files'),
      blobs: PrometheusText.value(s, 'media_blobs'),
      storedBytes: PrometheusText.value(s, 'media_stored_bytes'),
      uploads: PrometheusText.value(s, 'media_uploads_total'),
      downloads: PrometheusText.value(s, 'media_downloads_total'),
      uptimeSec: PrometheusText.value(s, 'media_process_uptime_seconds'),
    };
  }
}
