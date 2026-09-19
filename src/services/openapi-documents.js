import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ServiceError } from './client.js';

const SERVICE_TYPES = new Set([
  'audit', 'auth', 'console', 'flags', 'gateway', 'geo', 'media', 'notify',
  'ratelimit', 'scheduler', 'search', 'shortlink', 'webhook-out',
]);

/** Explicit, read-only OpenAPI aggregation. This is intentionally not a generic service proxy. */
export class OpenApiDocuments {
  static MAX_BYTES = 5 * 1024 * 1024;

  /**
   * @param {import('./clients.js').ServiceClients} clients
   * @param {{ localSpecUrl?: URL, timeoutMs?: number }} [o]
   */
  constructor(clients, { localSpecUrl = new URL('../../openapi.yaml', import.meta.url), timeoutMs = 3_000 } = {}) {
    this.clients = clients;
    this.timeoutMs = timeoutMs;
    this.local = OpenApiDocuments.parse(readFileSync(localSpecUrl, 'utf8'), 'console');
  }

  /** Public descriptions only; credentials and internal request details never enter this object. */
  list() {
    return [
      { id: 'console', type: 'console', label: 'Console' },
      ...this.clients.registry.describe().map(({ id, type, label }) => ({ id, type, label })),
    ];
  }

  /** @param {string} id */
  async get(id) {
    if (id === 'console') return { service: this.list()[0], document: this.local };
    const def = this.clients.registry.get(id);
    if (!def) {
      const knownButMissing = SERVICE_TYPES.has(id);
      throw new ServiceError(
        knownButMissing ? `service "${id}" is not configured` : `unknown documentation service "${id}"`,
        { statusCode: 404, code: knownButMissing ? 'DOCS_SERVICE_UNCONFIGURED' : 'DOCS_UNKNOWN_SERVICE', service: id },
      );
    }

    let response;
    try {
      response = await this.clients.any(id).request('GET', '/openapi.yaml', {
        auth: 'none', timeoutMs: this.timeoutMs, distinguishTimeout: true,
        headers: { accept: 'text/yaml, application/yaml;q=0.9, text/plain;q=0.5' },
      });
    } catch (err) {
      const timeout = err instanceof ServiceError && err.code === 'UPSTREAM_TIMEOUT';
      throw new ServiceError(timeout ? `${id} documentation request timed out` : `${id} documentation service is unreachable`, {
        statusCode: timeout ? 504 : 502,
        code: timeout ? 'DOCS_UPSTREAM_TIMEOUT' : 'DOCS_UPSTREAM_UNREACHABLE',
        service: id,
      });
    }
    if (!response.ok) {
      throw new ServiceError(`${id} documentation endpoint returned an error`, {
        statusCode: 502, code: 'DOCS_UPSTREAM_ERROR', details: { upstreamStatus: response.status }, service: id,
      });
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > OpenApiDocuments.MAX_BYTES) {
      throw new ServiceError(`${id} documentation is too large`, { statusCode: 502, code: 'DOCS_DOCUMENT_TOO_LARGE', service: id });
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw) > OpenApiDocuments.MAX_BYTES) {
      throw new ServiceError(`${id} documentation is too large`, { statusCode: 502, code: 'DOCS_DOCUMENT_TOO_LARGE', service: id });
    }
    return {
      service: { id: def.id, type: def.type, label: def.label },
      document: OpenApiDocuments.parse(raw, id),
    };
  }

  /** @param {string} raw @param {string} service */
  static parse(raw, service) {
    if (!raw.trim()) throw new ServiceError(`${service} documentation is empty`, { statusCode: 502, code: 'DOCS_INVALID_DOCUMENT', service });
    let document;
    try {
      document = parse(raw, { maxAliasCount: 50, prettyErrors: false });
    } catch {
      throw new ServiceError(`${service} documentation is not valid YAML`, { statusCode: 502, code: 'DOCS_INVALID_DOCUMENT', service });
    }
    const object = document && typeof document === 'object' && !Array.isArray(document);
    const info = object && document.info && typeof document.info === 'object' && !Array.isArray(document.info);
    const paths = object && document.paths && typeof document.paths === 'object' && !Array.isArray(document.paths);
    if (!object || typeof document.openapi !== 'string' || !/^3\.1(?:\.|$)/.test(document.openapi)
      || !info || typeof document.info.title !== 'string' || !document.info.title.trim() || !paths) {
      throw new ServiceError(`${service} documentation is not a valid OpenAPI 3.1 document`, { statusCode: 502, code: 'DOCS_INVALID_DOCUMENT', service });
    }
    return document;
  }
}
