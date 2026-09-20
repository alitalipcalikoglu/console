import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { testConsole } from '../helpers.js';

/**
 * Starts the real current Console on a kernel-assigned TCP port. Migration tests use HTTP rather
 * than Fastify inject so the same assertions can be retained when the server becomes SvelteKit.
 * Only this adapter should need to change during the framework migration.
 *
 * @param {Parameters<typeof testConsole>[0]} [options]
 */
export async function startConsole(options) {
  const fixture = await testConsole(options);
  await fixture.app.listen({ host: '127.0.0.1', port: 0 });
  const address = /** @type {import('node:net').AddressInfo} */ (fixture.app.server.address());
  return {
    ...fixture,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => fixture.app.close(),
  };
}

/** @param {Response} response */
export async function observed(response) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return {
    status: response.status,
    body,
    headers: Object.fromEntries([
      'cache-control', 'content-disposition', 'content-length', 'content-range', 'content-security-policy',
      'content-type', 'etag', 'accept-ranges', 'referrer-policy', 'retry-after', 'set-cookie',
      'strict-transport-security', 'traceparent', 'x-content-type-options', 'x-frame-options', 'x-request-id',
    ].map((name) => [name, response.headers.get(name)])),
  };
}

/** @param {string|null} setCookie */
export function cookiePair(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(';', 1)[0];
}

/**
 * Sends a deliberately chunked request and exposes when the downstream has received its first
 * chunk. This proves streaming without allocating anything near the production upload limit.
 * @param {string} url
 * @param {{ headers?: Record<string, string>, chunks: Buffer[], firstChunkSeen: Promise<void> }} options
 */
export async function chunkedRequest(url, { headers = {}, chunks, firstChunkSeen }) {
  const target = new URL(url);
  const response = new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: 'PUT', headers }, (res) => {
    /** @type {Buffer[]} */
    const body = [];
      res.on('data', (chunk) => body.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(body).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(chunks[0]);
    firstChunkSeen.then(() => {
      for (const chunk of chunks.slice(1)) req.write(chunk);
      req.end();
    }, reject);
  });
  return response;
}

/** @param {import('node:http').Server} server */
export async function closeServer(server) {
  server.close();
  await once(server, 'close');
}

export const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
export const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
