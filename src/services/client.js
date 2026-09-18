import { RequestContext } from '@atc-web/service-core/request-context';

/** @typedef {import('../types.js').ServiceDef} ServiceDef */

/** Error from a downstream service, carrying its HTTP status and error code when available. */
export class ServiceError extends Error {
  /**
   * @param {string} message
   * @param {{ statusCode: number, code?: string, details?: unknown, service?: string }} info
   */
  constructor(message, info) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = info.statusCode;
    this.code = info.code ?? (info.statusCode >= 500 ? 'UPSTREAM_ERROR' : 'UPSTREAM_REJECTED');
    this.details = info.details;
    this.service = info.service;
  }
}

/** Parsed Prometheus text exposition. */
export class PrometheusText {
  /**
   * @param {string} text
   * @returns {{ name: string, labels: Record<string, string>, value: number }[]}
   */
  static parse(text) {
    /** @type {{ name: string, labels: Record<string, string>, value: number }[]} */
    const out = [];
    for (const line of text.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(-?[0-9.eE+-]+|NaN|\+Inf|-Inf)/.exec(line);
      if (!m) continue;
      /** @type {Record<string, string>} */
      const labels = {};
      if (m[3]) for (const kv of m[3].match(/[a-zA-Z_][a-zA-Z0-9_]*="(?:[^"\\]|\\.)*"/g) ?? []) {
        const i = kv.indexOf('=');
        labels[kv.slice(0, i)] = kv.slice(i + 2, -1).replace(/\\"/g, '"');
      }
      out.push({ name: m[1], labels, value: m[4] === '+Inf' ? Infinity : m[4] === '-Inf' ? -Infinity : Number(m[4]) });
    }
    return out;
  }

  /**
   * First sample matching name and labels, or fallback.
   * @param {ReturnType<typeof PrometheusText.parse>} samples
   * @param {string} name
   * @param {Record<string, string>} [labels]
   */
  static value(samples, name, labels = {}) {
    const s = samples.find((x) => x.name === name && Object.entries(labels).every(([k, v]) => x.labels[k] === v));
    return s ? s.value : null;
  }
}

/**
 * Base HTTP client for one service instance: bearer auth, timeouts, JSON handling, error mapping.
 */
export class ServiceClient {
  /**
   * @param {ServiceDef} def
   * @param {{ timeoutMs: number, fetch?: typeof fetch }} o
   */
  constructor(def, { timeoutMs, fetch: fetchImpl = fetch }) {
    this.def = def;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  get id() {
    return this.def.id;
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ body?: unknown, raw?: BodyInit, headers?: Record<string, string>, auth?: 'apiKey'|'metrics'|'none', timeoutMs?: number }} [o]
   * @returns {Promise<Response>}
   */
  async request(method, path, o = {}) {
    /** @type {Record<string, string>} */
    const headers = { accept: 'application/json, text/plain;q=0.9, */*;q=0.1', ...RequestContext.get()?.propagationHeaders() };
    Object.assign(headers, o.headers);
    const auth = o.auth ?? 'apiKey';
    if (auth === 'apiKey' && this.def.apiKey) headers.authorization = `Bearer ${this.def.apiKey}`;
    if (auth === 'metrics' && this.def.metricsToken) headers.authorization = `Bearer ${this.def.metricsToken}`;
    let body = o.raw;
    if (o.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.body);
    }
    try {
      return await this.fetch(`${this.def.url}${path}`, {
        method, headers, body, redirect: 'error', signal: AbortSignal.timeout(o.timeoutMs ?? this.timeoutMs),
        ...(body && typeof body === 'object' && 'pipe' in /** @type {any} */ (body) ? { duplex: 'half' } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(`${this.def.id} unreachable: ${msg}`, { statusCode: 502, code: 'UPSTREAM_UNREACHABLE', service: this.def.id });
    }
  }

  /**
   * JSON request; non-2xx becomes a ServiceError with the service's own code and message.
   * @template T
   * @param {string} method
   * @param {string} path
   * @param {Parameters<ServiceClient['request']>[2]} [o]
   * @returns {Promise<T>}
   */
  async json(method, path, o) {
    const res = await this.request(method, path, o);
    if (res.status === 204) return /** @type {T} */ (null);
    const text = await res.text();
    /** @type {any} */
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const code = data?.error?.code;
      const message = data?.error?.message ?? `${this.def.id} responded ${res.status}`;
      throw new ServiceError(message, { statusCode: res.status, code, details: data?.error?.details, service: this.def.id });
    }
    return data;
  }

  /** @returns {Promise<{ health: boolean, ready: boolean, readyDetail: unknown, latencyMs: number }>} */
  async status() {
    const started = Date.now();
    const probe = async (/** @type {string} */ path) => {
      try {
        const res = await this.request('GET', path, { auth: 'none', timeoutMs: 3_000 });
        const text = await res.text();
        let detail = null;
        try { detail = JSON.parse(text); } catch { detail = text.slice(0, 200); }
        return { ok: res.ok, detail };
      } catch {
        return { ok: false, detail: null };
      }
    };
    const [health, ready] = await Promise.all([probe('/health'), probe('/ready')]);
    return { health: health.ok, ready: ready.ok, readyDetail: ready.detail, latencyMs: Date.now() - started };
  }

  /**
   * `/v1/info` (Stage 7), tolerant of an unreachable service, a service too old to have the
   * route (404), or a malformed body — the console's About view must degrade gracefully in a
   * mixed-version rollout, never crash the page for one bad or outdated service.
   * @returns {Promise<{ ok: true, data: Record<string, unknown> } | { ok: false, error: string }>}
   */
  async info() {
    let res;
    try {
      res = await this.request('GET', '/v1/info', { auth: 'none', timeoutMs: 3_000 });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (!res.ok) return { ok: false, error: res.status === 404 ? 'no /v1/info (older version)' : `responded ${res.status}` };
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'malformed /v1/info response' };
      return { ok: true, data };
    } catch {
      return { ok: false, error: 'malformed /v1/info response (not JSON)' };
    }
  }

  /** Raw Prometheus samples, or null when the service exposes no metrics to us. */
  async metricsSamples() {
    const auth = this.def.type === 'gateway' ? 'metrics' : 'apiKey';
    if (auth === 'metrics' && !this.def.metricsToken) return null;
    const res = await this.request('GET', '/metrics', { auth });
    if (!res.ok) throw new ServiceError(`${this.def.id} metrics responded ${res.status}`, { statusCode: res.status, service: this.def.id });
    return PrometheusText.parse(await res.text());
  }
}
