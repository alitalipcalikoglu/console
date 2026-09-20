import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { ADMIN_PASSWORD, CSRF, servicesEnv } from '../helpers.js';
import { chunkedRequest, closeServer, cookiePair, REQUEST_ID, startConsole, TRACEPARENT } from './helpers.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MEDIA = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
const SVG = Buffer.from('<svg onload="alert(1)"/>');
const EXPORT = Buffer.from('{"seq":1}\n{"seq":2}\n');
/** @typedef {{ method: string, url: string, headers: import('node:http').IncomingHttpHeaders, chunks: Buffer[], body: Buffer|null }} SeenRequest */
/** @type {SeenRequest[]} */
const seen = [];
let downstreamOrigin = '';
/** @type {() => void} */ let firstUploadChunkResolve = () => {};
/** @type {Promise<void>} */ let firstUploadChunk = new Promise((resolve) => { firstUploadChunkResolve = resolve; });

const downstream = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://downstream.test');
  /** @type {SeenRequest} */
  const entry = { method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers }, chunks: [], body: null };
  seen.push(entry);

  if (url.pathname === '/files/file-1/thumb' || url.pathname === '/files/file-1/original') {
    req.resume();
    const hostile = url.pathname.endsWith('/original');
    const bytes = hostile ? SVG : MEDIA;
    res.writeHead(200, {
      'content-type': hostile ? 'image/svg+xml' : 'image/webp',
      'content-length': String(bytes.length),
      'content-disposition': hostile ? 'inline; filename="hostile.svg"' : 'inline; filename="thumb.webp"',
      etag: '"fixture-etag"',
      'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      'accept-ranges': 'bytes',
    }).end(bytes);
    return;
  }

  req.on('data', (chunk) => {
    entry.chunks.push(Buffer.from(chunk));
    if (req.method === 'PUT' && url.pathname === '/v1/files' && entry.chunks.length === 1) firstUploadChunkResolve();
  });
  req.on('end', () => {
    entry.body = Buffer.concat(entry.chunks);
    /** @param {number} status @param {unknown} body @param {Record<string, string>} [headers] */
    const json = (status, body, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
    if (url.pathname === '/v1/messages' && url.searchParams.get('status') === 'scheduled') return;
    if (url.pathname === '/v1/messages' && url.searchParams.get('status') === 'failed') {
      return json(409, { error: { code: 'DOWNSTREAM_CONFLICT', message: 'fixture conflict', details: { safe: true } } });
    }
    if (url.pathname === '/v1/messages' && req.method === 'GET') return json(200, { items: [], nextCursor: null });
    if (url.pathname === '/v1/messages' && req.method === 'POST') return json(202, { id: 'message-1' });
    if (url.pathname === '/v1/users/user%3A1' && req.method === 'PATCH') return json(200, { id: 'user:1', status: 'disabled' });
    if (url.pathname === '/v1/users/user%3A1' && req.method === 'DELETE') return res.writeHead(204).end();
    if (url.pathname === '/v1/files' && req.method === 'PUT') return json(201, { file: { id: 'file-1', name: 'fixture.bin', size: entry.body?.length ?? 0 } });
    if (url.pathname === '/v1/files/file-1/urls') {
      return json(200, { urls: { thumb: { url: `${downstreamOrigin}/files/file-1/thumb` }, original: { url: `${downstreamOrigin}/files/file-1/original` } } });
    }
    if (url.pathname === '/v1/events/export') {
      if (url.searchParams.get('source') === 'broken') return json(503, { error: { code: 'UNAVAILABLE', message: 'fixture unavailable' } });
      return res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': 'attachment; filename="fixture.ndjson"' }).end(EXPORT);
    }
    if (url.pathname === '/v1/links/missing/qr') return json(404, { error: { code: 'NOT_FOUND', message: 'link not found' } });
    if (url.pathname === '/v1/links/abc/qr') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    return json(200, { ok: true });
  });
});

/** @type {Awaited<ReturnType<typeof startConsole>>} */ let consoleApp;
/** @type {string} */ let cookie;

before(async () => {
  await new Promise((resolve) => downstream.listen(0, '127.0.0.1', () => resolve(undefined)));
  downstreamOrigin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (downstream.address()).port}`;
  consoleApp = await startConsole({ urls: { notify: downstreamOrigin, auth: downstreamOrigin, media: downstreamOrigin, audit: downstreamOrigin, shortlink: downstreamOrigin } });
  await consoleApp.adminService.create({ email: 'downstream@migration.test', name: 'Downstream', password: ADMIN_PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
  const response = await fetch(`${consoleApp.origin}/api/session/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'downstream@migration.test', password: ADMIN_PASSWORD }) });
  cookie = cookiePair(response.headers.get('set-cookie'));
});

after(async () => {
  await consoleApp.close();
  await closeServer(downstream);
});

/** @param {(entry: SeenRequest) => boolean} predicate @returns {SeenRequest} */
function latest(predicate) {
  const request = [...seen].reverse().find(predicate);
  if (!request) throw new Error('expected downstream request was not observed');
  return request;
}

test('downstream oracle: GET/query, POST JSON, PATCH JSON, DELETE, key and trace propagation', async () => {
  let response = await fetch(`${consoleApp.origin}/api/services/notify/notify/messages?status=queued&limit=7&cursor=next`, { headers: { cookie } });
  assert.equal(response.status, 200);
  let request = latest((entry) => entry.url.startsWith('/v1/messages?'));
  assert.equal(request.method, 'GET');
  assert.equal(request.url, '/v1/messages?status=queued&limit=7&cursor=next');
  assert.equal(request.headers.authorization, `Bearer ${servicesEnv.NOTIFY_API_KEY}`);
  assert.match(String(request.headers['x-request-id']), REQUEST_ID);
  assert.match(String(request.headers.traceparent), TRACEPARENT);
  assert.match(String(response.headers.get('traceparent')), TRACEPARENT);
  const outboundTrace = String(request.headers.traceparent).match(TRACEPARENT);
  const responseTrace = String(response.headers.get('traceparent')).match(TRACEPARENT);
  assert.equal(outboundTrace?.[1], responseTrace?.[1]);
  assert.notEqual(outboundTrace?.[2], responseTrace?.[2], 'outbound hop gets a fresh child span');

  const send = { channel: 'email', to: 'operator@example.test', template: 'fixture' };
  response = await fetch(`${consoleApp.origin}/api/services/notify/notify/messages`, { method: 'POST', headers: { cookie, ...CSRF, 'content-type': 'application/json' }, body: JSON.stringify(send) });
  assert.equal(response.status, 202);
  request = latest((entry) => entry.url === '/v1/messages' && entry.method === 'POST');
  assert.ok(request.body);
  assert.deepEqual(JSON.parse(request.body.toString()), send);

  response = await fetch(`${consoleApp.origin}/api/services/auth/auth/users/user:1`, { method: 'PATCH', headers: { cookie, ...CSRF, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'disabled' }) });
  assert.equal(response.status, 200);
  request = latest((entry) => entry.method === 'PATCH');
  assert.equal(request.url, '/v1/users/user%3A1');
  assert.ok(request.body);
  assert.deepEqual(JSON.parse(request.body.toString()), { status: 'disabled' });

  response = await fetch(`${consoleApp.origin}/api/services/auth/auth/users/user:1`, { method: 'DELETE', headers: { cookie, ...CSRF } });
  assert.equal(response.status, 204);
  assert.equal(latest((entry) => entry.method === 'DELETE').url, '/v1/users/user%3A1');
});

test('downstream oracle: service errors keep status, code, details and service id', async () => {
  const response = await fetch(`${consoleApp.origin}/api/services/notify/notify/messages?status=failed`, { headers: { cookie } });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: { code: 'DOWNSTREAM_CONFLICT', message: 'fixture conflict', service: 'notify', details: { safe: true } } });
});

test('downstream oracle: the configured request deadline maps an unresponsive service safely', { timeout: 5_000 }, async () => {
  const response = await fetch(`${consoleApp.origin}/api/services/notify/notify/messages?status=scheduled`, { headers: { cookie } });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: { code: 'UPSTREAM_UNREACHABLE', message: 'notify timed out', service: 'notify' },
  });
});

test('trace oracle: inbound trace is rejected by default and adopted only with TRUST_PROXY=true', async () => {
  const claimedTrace = 'a'.repeat(32);
  const claimedParent = 'b'.repeat(16);
  const inbound = `00-${claimedTrace}-${claimedParent}-01`;
  /** @param {boolean} trustProxy */
  async function exercise(trustProxy) {
    const app = await startConsole({ urls: { notify: downstreamOrigin }, env: { TRUST_PROXY: String(trustProxy) } });
    try {
      const email = `${trustProxy ? 'trusted' : 'untrusted'}@migration.test`;
      await app.adminService.create({ email, name: 'Trace', password: ADMIN_PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
      const login = await fetch(`${app.origin}/api/session/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: ADMIN_PASSWORD }) });
      const localCookie = cookiePair(login.headers.get('set-cookie'));
      seen.length = 0;
      const response = await fetch(`${app.origin}/api/services/notify/notify/messages`, { headers: { cookie: localCookie, traceparent: inbound } });
      const forwarded = String(latest((entry) => entry.url.startsWith('/v1/messages')).headers.traceparent).match(TRACEPARENT);
      return { status: response.status, responseTrace: String(response.headers.get('traceparent')).match(TRACEPARENT), forwarded };
    } finally {
      await app.close();
    }
  }
  const untrusted = await exercise(false);
  assert.equal(untrusted.status, 200);
  assert.notEqual(untrusted.forwarded?.[1], claimedTrace);
  assert.equal(untrusted.forwarded?.[1], untrusted.responseTrace?.[1]);
  const trusted = await exercise(true);
  assert.equal(trusted.forwarded?.[1], claimedTrace);
  assert.equal(trusted.responseTrace?.[1], claimedTrace);
  assert.notEqual(trusted.forwarded?.[2], claimedParent);

  seen.length = 0;
  const malformed = await fetch(`${consoleApp.origin}/api/services/notify/notify/messages`, { headers: { cookie, traceparent: 'not-a-trace' } });
  assert.equal(malformed.status, 200);
  const regenerated = String(latest((entry) => entry.url.startsWith('/v1/messages')).headers.traceparent);
  assert.match(regenerated, TRACEPARENT);
  assert.doesNotMatch(regenerated, /not-a-trace/);
});

test('media upload oracle: raw streaming, metadata headers, content length and 512 MiB configured cap', async () => {
  firstUploadChunk = new Promise((resolve) => { firstUploadChunkResolve = resolve; });
  const streamed = await chunkedRequest(`${consoleApp.origin}/api/services/media/media/files?visibility=private&name=two%20chunks.bin`, {
    headers: { cookie, ...CSRF, 'content-type': 'application/octet-stream' },
    chunks: [Buffer.from('first-'), Buffer.from('second')],
    firstChunkSeen: firstUploadChunk,
  });
  assert.equal(streamed.status, 201);
  assert.deepEqual(JSON.parse(streamed.body), { file: { id: 'file-1', name: 'fixture.bin', size: 12 } });
  const streamRequest = latest((entry) => entry.method === 'PUT' && entry.url.startsWith('/v1/files?'));
  assert.ok(streamRequest.body);
  assert.equal(streamRequest.body.toString(), 'first-second');
  assert.equal(streamRequest.url, '/v1/files?visibility=private');
  assert.equal(streamRequest.headers['x-file-name'], 'two%20chunks.bin');
  assert.equal(streamRequest.headers['content-type'], 'application/octet-stream');
  assert.equal(streamRequest.headers['content-length'], undefined, 'chunked input remains without a fabricated content length');

  const fixed = Buffer.from('fixed-length');
  const response = await fetch(`${consoleApp.origin}/api/services/media/media/files?name=fixed.bin`, /** @type {RequestInit & { duplex: 'half' }} */ ({ method: 'PUT', headers: { cookie, ...CSRF, 'content-type': 'application/x-fixture', 'content-length': String(fixed.length) }, body: fixed, duplex: 'half' }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { file: { id: 'file-1', name: 'fixture.bin', size: fixed.length } });
  const fixedRequest = latest((entry) => entry.method === 'PUT' && entry.headers['x-file-name'] === 'fixed.bin');
  assert.equal(fixedRequest.headers['content-length'], String(fixed.length));
  assert.equal(fixedRequest.headers['content-type'], 'application/x-fixture');

  const source = readFileSync(new URL('../../src/http/console-api.js', import.meta.url), 'utf8');
  const limits = [...source.matchAll(/bodyLimit:\s*(512\s*\*\s*1024\s*\*\s*1024)/g)];
  assert.equal(limits.length, 2, 'parser and upload route both declare the current limit');
  assert.equal(512 * 1024 * 1024, 536_870_912);
  const clientSource = readFileSync(new URL('../../src/services/media-client.js', import.meta.url), 'utf8');
  assert.match(clientSource, /raw:\s*\/\*\* @type \{any\} \*\/ \(stream\)/, 'the current client passes the incoming stream through as raw body');
  assert.match(clientSource, /timeoutMs:\s*300_000/, 'the current upload-specific timeout is five minutes');
});

test('media bytes oracle: exact bytes and filtered headers; inbound Range is not forwarded', async () => {
  let response = await fetch(`${consoleApp.origin}/api/services/media/media/files/file-1/bytes/thumb`, { headers: { cookie, range: 'bytes=0-3' } });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), MEDIA);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-length'), String(MEDIA.length));
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="thumb.webp"');
  assert.equal(response.headers.get('etag'), '"fixture-etag"');
  assert.equal(response.headers.get('content-range'), null);
  assert.equal(response.headers.get('accept-ranges'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store', 'the common API onSend hook currently overrides the route cache directive');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  const byteRequest = latest((entry) => entry.url === '/files/file-1/thumb');
  assert.equal(byteRequest.headers.range, undefined, 'KNOWN CURRENT BEHAVIOR: inbound Range is not forwarded');

  response = await fetch(`${consoleApp.origin}/api/services/media/media/files/file-1/bytes/original`, { headers: { cookie } });
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), SVG);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="file-1.bin"');
});

test('audit export oracle: bytes and download headers survive; errors stay JSON', async () => {
  let response = await fetch(`${consoleApp.origin}/api/services/audit/audit/events/export?format=ndjson&source=auth`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), EXPORT);
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="fixture.ndjson"');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.equal(response.headers.get('cache-control'), 'no-store');

  response = await fetch(`${consoleApp.origin}/api/services/audit/audit/events/export?source=broken`, { headers: { cookie } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'UPSTREAM_ERROR', message: 'audit export responded 503', service: 'audit' } });
});

test('QR PNG oracle: magic bytes, headers and not-found error', async () => {
  let response = await fetch(`${consoleApp.origin}/api/services/shortlink/shortlink/links/abc/qr.png`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(bytes.subarray(0, 8), PNG.subarray(0, 8));
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-length'), String(PNG.length));
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="abc.png"');
  assert.equal(response.headers.get('cache-control'), 'no-store', 'the common API onSend hook currently overrides the route cache directive');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");

  response = await fetch(`${consoleApp.origin}/api/services/shortlink/shortlink/links/missing/qr.png`, { headers: { cookie } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'UPSTREAM_REJECTED', message: 'shortlink qr responded 404', service: 'shortlink' } });
});
