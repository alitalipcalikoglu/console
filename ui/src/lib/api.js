/** Error thrown by {@link Api} for non-2xx responses; mirrors the server's `{ error }` shape. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {{ code?: string, message?: string, details?: any, service?: string }} body
   */
  constructor(status, body) {
    super(body.message ?? `request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'REQUEST_ERROR';
    this.details = body.details;
    this.service = body.service;
  }
}

/**
 * Thin fetch wrapper for the console's own API: same-origin cookies, CSRF header on writes,
 * JSON in/out, typed errors. A 401 on an authenticated call triggers `onUnauthenticated`.
 */
export class Api {
  /** @param {{ onUnauthenticated?: (code: string) => void }} [o] */
  constructor({ onUnauthenticated } = {}) {
    this.onUnauthenticated = onUnauthenticated;
  }

  /**
   * @template T
   * @param {string} method
   * @param {string} path
   * @param {{ body?: unknown, raw?: BodyInit, headers?: Record<string, string>, signal?: AbortSignal, quiet401?: boolean }} [o]
   * @returns {Promise<T>}
   */
  async call(method, path, o = {}) {
    /** @type {Record<string, string>} */
    const headers = { accept: 'application/json', ...(o.headers ?? {}) };
    if (method !== 'GET' && method !== 'HEAD') headers['x-console-request'] = '1';
    let body = o.raw;
    if (o.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(o.body);
    }
    const res = await fetch(`/api${path}`, { method, headers, body, credentials: 'same-origin', signal: o.signal });
    if (res.status === 204) return /** @type {T} */ (null);
    const text = await res.text();
    /** @type {any} */
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const err = new ApiError(res.status, data?.error ?? {});
      if (res.status === 401 && !o.quiet401 && this.onUnauthenticated) this.onUnauthenticated(err.code);
      throw err;
    }
    return data;
  }

  /** @template T @param {string} path @param {{ signal?: AbortSignal, quiet401?: boolean }} [o] @returns {Promise<T>} */
  get(path, o) { return this.call('GET', path, o); }
  /** @template T @param {string} path @param {unknown} [body] @returns {Promise<T>} */
  post(path, body) { return this.call('POST', path, { body }); }
  /** @template T @param {string} path @param {unknown} body @returns {Promise<T>} */
  patch(path, body) { return this.call('PATCH', path, { body }); }
  /** @template T @param {string} path @param {unknown} body @returns {Promise<T>} */
  put(path, body) { return this.call('PUT', path, { body }); }
  /** @template T @param {string} path @returns {Promise<T>} */
  delete(path) { return this.call('DELETE', path); }

  /**
   * Upload with progress (XHR, because fetch has no upload progress yet).
   * @param {string} path
   * @param {File} file
   * @param {(fraction: number) => void} onProgress
   * @returns {Promise<any>}
   */
  upload(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api${path}`);
      xhr.setRequestHeader('x-console-request', '1');
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onerror = () => reject(new ApiError(0, { code: 'NETWORK', message: 'network error' }));
      xhr.onload = () => {
        let data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = null; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(xhr.status, data?.error ?? {}));
      };
      xhr.send(file);
    });
  }
}

export const api = new Api();
