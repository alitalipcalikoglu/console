import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Config } from '../src/config.js';
import { ConsoleRuntime } from '../src/lib/server/runtime.js';
import { AuditClient } from '../src/services/audit-client.js';
import { CONSOLE_UPLOAD_LIMIT_BYTES } from '../src/services/upload-stream.js';

const PASSWORD = 'CorrectHorseBattery1!';
const KEY = '33'.repeat(32);
const API_KEY = 'm5'.repeat(20);
const CSRF = { 'x-console-request': '1' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MEDIA = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
const SVG = Buffer.from('<svg onload="alert(1)"/>');
const scratch = mkdtempSync(join(tmpdir(), 'console-m5-'));
const seen = [];

const deferred = () => {
  let resolvePromise = () => {};
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
};
const uploadFirst = deferred();
const abortFirst = deferred();
const uploadAborted = deferred();
const mediaTail = deferred();
const exportTail = deferred();
const shutdownTail = deferred();

const freePort = () => new Promise((resolvePort, reject) => {
  const server = createTcpServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('could not allocate port'));
    server.close((error) => error ? reject(error) : resolvePort(address.port));
  });
});

const within = (promise, milliseconds, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds)),
]);

const childExit = (child, timeoutMs = 10_000) => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return within(once(child, 'exit').then(([code, signal]) => ({ code, signal })), timeoutMs, 'child exit');
};

let downstreamOrigin = '';
const downstream = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://downstream.test');
  const entry = { method: request.method, url: request.url, headers: { ...request.headers }, chunks: [], body: null };
  seen.push(entry);
  const json = (status, body, headers = {}) => response.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));

  if (url.pathname.startsWith('/delivery/')) {
    request.resume();
    if (url.pathname === '/delivery/missing') return json(404, { error: { code: 'NOT_FOUND', message: 'missing' } });
    if (url.pathname === '/delivery/fail') return json(503, { error: { code: 'UNAVAILABLE', message: 'failed' } });
    if (url.pathname === '/delivery/original') {
      return response.writeHead(200, {
        'content-type': 'image/svg+xml', 'content-length': String(SVG.length),
        'content-disposition': 'inline; filename="hostile.svg"', 'set-cookie': 'downstream=secret',
      }).end(SVG);
    }
    response.writeHead(200, {
      'content-type': 'image/webp', 'content-length': String(MEDIA.length),
      'content-disposition': 'inline; filename="thumb.webp"', etag: '"m5-etag"',
      'content-range': `bytes 0-${MEDIA.length - 1}/${MEDIA.length}`, 'accept-ranges': 'bytes',
      'set-cookie': 'downstream=secret', 'x-internal-secret': 'hidden',
    });
    response.write(MEDIA.subarray(0, 4));
    mediaTail.promise.then(() => response.end(MEDIA.subarray(4)));
    return;
  }

  request.on('aborted', () => uploadAborted.resolve());
  request.on('data', (chunk) => {
    entry.chunks.push(Buffer.from(chunk));
    if (request.method === 'PUT' && url.pathname === '/v1/files' && entry.chunks.length === 1) uploadFirst.resolve();
    if (request.headers['x-file-name'] === 'abort-client.bin' && entry.chunks.length === 1) abortFirst.resolve();
  });
  request.on('end', () => {
    entry.body = Buffer.concat(entry.chunks);
    if (url.pathname === '/v1/files' && request.method === 'PUT') {
      if (request.headers['x-file-name'] === 'downstream-abort.bin') return response.destroy();
      if (request.headers['x-file-name'] === 'downstream-error.bin') {
        return json(422, { error: { code: 'INVALID_UPLOAD', message: 'fixture rejected', details: { safe: true } } });
      }
      return json(201, { file: { id: 'file-1', name: 'fixture.bin', size: entry.body.length } });
    }
    const urls = /^\/v1\/files\/([^/]+)\/urls$/.exec(url.pathname);
    if (urls) {
      const id = decodeURIComponent(urls[1]);
      const target = id === 'missing' ? 'missing' : id === 'fail' ? 'fail' : id === 'file-1' ? 'thumb' : 'original';
      return json(200, { urls: { thumb: { url: `${downstreamOrigin}/delivery/${target}` }, original: { url: `${downstreamOrigin}/delivery/original` } } });
    }
    if (url.pathname === '/v1/events/export') {
      if (url.searchParams.get('source') === 'broken') return json(503, { error: { code: 'UNAVAILABLE', message: 'fixture unavailable' } });
      response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': 'attachment; filename="fixture.ndjson"', 'set-cookie': 'downstream=secret' });
      const tail = url.searchParams.get('source') === 'shutdown' ? shutdownTail : exportTail;
      response.write('{"seq":1}\n');
      tail.promise.then(() => response.end('{"seq":2}\n'));
      return;
    }
    const qr = /^\/v1\/links\/([^/]+)\/qr$/.exec(url.pathname);
    if (qr) {
      const id = decodeURIComponent(qr[1]);
      if (id === 'missing') return json(404, { error: { code: 'NOT_FOUND', message: 'link not found' } });
      if (id === 'fail') return json(503, { error: { code: 'UNAVAILABLE', message: 'fixture unavailable' } });
      return response.writeHead(200, { 'content-type': 'image/png', 'content-length': String(PNG.length), 'set-cookie': 'downstream=secret' }).end(PNG);
    }
    return json(200, { ok: true });
  });
});

const jsonRequest = (method, body, headers = {}) => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const cookiePair = (response) => response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
const latest = (predicate) => {
  const entry = [...seen].reverse().find(predicate);
  if (!entry) throw new Error('expected downstream request was not observed');
  return entry;
};
const readAll = async (reader) => {
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    chunks.push(Buffer.from(value));
  }
};

const chunkedUpload = (url, headers, chunks, firstChunkSeen) => new Promise((resolveUpload, reject) => {
  const target = new URL(url);
  const request = httpRequest({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: 'PUT', headers }, (response) => {
    const body = [];
    response.on('data', (chunk) => body.push(Buffer.from(chunk)));
    response.on('end', () => resolveUpload({ status: response.statusCode, body: Buffer.concat(body).toString('utf8') }));
  });
  request.on('error', reject);
  request.write(chunks[0]);
  firstChunkSeen.then(() => {
    for (const chunk of chunks.slice(1)) request.write(chunk);
    request.end();
  }, reject);
});

const declaredOversize = (url, headers) => new Promise((resolveRequest, reject) => {
  const target = new URL(url);
  const request = httpRequest({ hostname: target.hostname, port: target.port, path: target.pathname, method: 'PUT', headers }, (response) => {
    const body = [];
    response.on('data', (chunk) => body.push(Buffer.from(chunk)));
    response.on('end', () => resolveRequest({ status: response.statusCode, body: Buffer.concat(body).toString('utf8') }));
  });
  request.on('error', reject);
  request.flushHeaders();
});

const abortUpload = (url, headers) => new Promise((resolveAbort, reject) => {
  const target = new URL(url);
  const request = httpRequest({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: 'PUT', headers });
  request.on('response', (response) => response.resume());
  request.on('error', (error) => {
    if (error.code === 'ECONNRESET') resolveAbort();
    else reject(error);
  });
  request.write('first-chunk');
  abortFirst.promise.then(() => {
    request.destroy();
    resolveAbort();
  }, reject);
});

let child;
try {
  await new Promise((resolveStart, reject) => downstream.listen(0, '127.0.0.1', resolveStart).once('error', reject));
  const downstreamAddress = downstream.address();
  if (!downstreamAddress || typeof downstreamAddress === 'string') throw new Error('downstream did not bind');
  downstreamOrigin = `http://127.0.0.1:${downstreamAddress.port}`;
  const dbPath = join(scratch, 'console.db');
  const servicesFile = join(scratch, 'services.json');
  const serviceTypes = ['notify', 'auth', 'media', 'gateway', 'audit', 'shortlink', 'flags', 'scheduler', 'webhook-out', 'search', 'ratelimit', 'geo'];
  writeFileSync(servicesFile, JSON.stringify({ services: serviceTypes.map((type) => ({
    id: type === 'webhook-out' ? 'webhooks' : type,
    type,
    url: downstreamOrigin,
    ...(type === 'gateway' ? { metricsTokenEnv: 'M5_API_KEY' } : { apiKeyEnv: 'M5_API_KEY' }),
  })) }));

  const seedRuntime = new ConsoleRuntime(Config.fromEnv({
    DB_PATH: dbPath, LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SECRETS_KEY: KEY,
  }));
  await seedRuntime.adminService.create({ email: 'admin@m5.test', name: 'Admin', password: PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
  await seedRuntime.adminService.create({ email: 'viewer@m5.test', name: 'Viewer', password: PASSWORD, role: 'viewer' }, null, { ip: null, userAgent: null });
  seedRuntime.finishShutdown();

  const port = await freePort();
  const childEnv = { ...process.env };
  delete childEnv.BODY_SIZE_LIMIT;
  Object.assign(childEnv, {
    DB_PATH: dbPath, SERVICES_FILE: servicesFile, M5_API_KEY: API_KEY,
    PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false',
    ORIGIN: `http://127.0.0.1:${port}`, SCRYPT_LOG_N: '14', SECRETS_KEY: KEY,
    SERVICE_TIMEOUT_MS: '500', PUBLIC_DIR: join(scratch, 'missing-public'),
  });
  child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'), env: childEnv, execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let diagnostics = '';
  child.stdout?.on('data', (chunk) => { diagnostics += chunk; });
  child.stderr?.on('data', (chunk) => { diagnostics += chunk; });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    childExit(child).then((result) => { throw new Error(`runtime exited before ready: ${JSON.stringify(result)} ${diagnostics}`); }),
    within(new Promise(() => {}), 10_000, 'runtime ready'),
  ]);
  assert.equal(ready, 'ready');
  const origin = `http://127.0.0.1:${port}`;

  const login = async (email) => {
    const response = await fetch(`${origin}/api/session/login`, jsonRequest('POST', { email, password: PASSWORD }));
    assert.equal(response.status, 200);
    return cookiePair(response);
  };
  const admin = await login('admin@m5.test');
  const viewer = await login('viewer@m5.test');

  let response = await fetch(`${origin}/api/services/media/media/files`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', ...CSRF }, body: 'anonymous' });
  assert.equal(response.status, 401);
  for (const path of [
    '/api/services/media/media/files/file-1/bytes/thumb',
    '/api/services/audit/audit/events/export',
    '/api/services/shortlink/shortlink/links/abc/qr.png',
  ]) {
    response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 401, path);
  }
  response = await fetch(`${origin}/api/services/media/media/files`, { method: 'PUT', headers: { cookie: viewer, 'content-type': 'application/octet-stream', ...CSRF }, body: 'viewer' });
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/services/media/media/files`, { method: 'PUT', headers: { cookie: admin, 'content-type': 'application/octet-stream' }, body: 'no-csrf' });
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/services/media/media/files?visibility=secret`, { method: 'PUT', headers: { cookie: admin, 'content-type': 'application/octet-stream', ...CSRF }, body: 'invalid-query' });
  assert.equal(response.status, 400);

  const streamed = await chunkedUpload(`${origin}/api/services/media/media/files?visibility=private&name=two%20chunks.bin`, {
    cookie: admin, ...CSRF, 'content-type': 'application/octet-stream',
  }, [Buffer.from('first-'), Buffer.from('second')], uploadFirst.promise);
  assert.equal(streamed.status, 201, streamed.body);
  assert.deepEqual(JSON.parse(streamed.body), { file: { id: 'file-1', name: 'fixture.bin', size: 12 } });
  let request = latest((entry) => entry.method === 'PUT' && entry.url.startsWith('/v1/files?'));
  assert.equal(request.body.toString(), 'first-second');
  assert.equal(request.url, '/v1/files?visibility=private');
  assert.equal(request.headers['x-file-name'], 'two%20chunks.bin');
  assert.equal(request.headers['content-type'], 'application/octet-stream');
  assert.equal(request.headers['content-length'], undefined);
  assert.equal(request.headers.authorization, `Bearer ${API_KEY}`);
  assert.match(String(request.headers.traceparent), /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  assert.equal(request.headers.cookie, undefined);

  const fixed = Buffer.from('fixed-length');
  response = await fetch(`${origin}/api/services/media/media/files?name=fixed.bin`, {
    method: 'PUT', headers: { cookie: admin, ...CSRF, 'content-type': 'application/x-fixture', 'content-length': String(fixed.length) }, body: fixed,
  });
  assert.equal(response.status, 201);
  request = latest((entry) => entry.method === 'PUT' && entry.headers['x-file-name'] === 'fixed.bin');
  assert.equal(request.headers['content-length'], String(fixed.length));
  assert.equal(request.headers['content-type'], 'application/x-fixture');

  const oversized = await within(declaredOversize(`${origin}/api/services/media/media/files`, {
    cookie: admin, ...CSRF, 'content-type': 'application/octet-stream', 'content-length': String(CONSOLE_UPLOAD_LIMIT_BYTES + 1),
  }), 5_000, 'declared oversized upload');
  assert.equal(oversized.status, 413);
  assert.deepEqual(JSON.parse(oversized.body), { error: { code: 'FST_ERR_CTP_BODY_TOO_LARGE', message: 'Request body is too large' } });
  assert.match(readFileSync(new URL('../src/services/media-client.js', import.meta.url), 'utf8'), /timeoutMs:\s*300_000/);
  assert.equal(AuditClient.EXPORT_TIMEOUT_MS, 600_000);

  response = await fetch(`${origin}/api/services/media/media/files?name=downstream-error.bin`, {
    method: 'PUT', headers: { cookie: admin, ...CSRF, 'content-type': 'application/octet-stream' }, body: 'bad-upload',
  });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: { code: 'INVALID_UPLOAD', message: 'fixture rejected', service: 'media', details: { safe: true } } });
  response = await fetch(`${origin}/api/services/media/media/files?name=downstream-abort.bin`, {
    method: 'PUT', headers: { cookie: admin, ...CSRF, 'content-type': 'application/octet-stream' }, body: 'abort-me',
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_UNREACHABLE');
  await within(abortUpload(`${origin}/api/services/media/media/files?name=abort-client.bin`, {
    cookie: admin, ...CSRF, 'content-type': 'application/octet-stream',
  }), 5_000, 'client upload abort');
  await within(uploadAborted.promise, 5_000, 'downstream upload cancellation');

  response = await fetch(`${origin}/api/services/media/media/files/file-1/bytes/thumb`, { headers: { cookie: viewer, range: 'bytes=0-3' } });
  if (response.status !== 200) throw new Error(`media bytes returned ${response.status}: ${await response.text()}`);
  const mediaReader = response.body.getReader();
  const firstMedia = await mediaReader.read();
  assert.deepEqual(Buffer.from(firstMedia.value), MEDIA.subarray(0, 4));
  mediaTail.resolve();
  assert.deepEqual(Buffer.concat([Buffer.from(firstMedia.value), await readAll(mediaReader)]), MEDIA);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-length'), String(MEDIA.length));
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="thumb.webp"');
  assert.equal(response.headers.get('etag'), '"m5-etag"');
  assert.equal(response.headers.get('content-range'), null);
  assert.equal(response.headers.get('accept-ranges'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-internal-secret'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  request = latest((entry) => entry.url === '/delivery/thumb');
  assert.equal(request.headers.range, undefined);
  assert.equal(request.headers.authorization, undefined);
  const mediaUrls = latest((entry) => entry.url.startsWith('/v1/files/file-1/urls'));
  assert.equal(mediaUrls.headers.authorization, `Bearer ${API_KEY}`);
  assert.match(String(mediaUrls.headers.traceparent), /^00-/);

  response = await fetch(`${origin}/api/services/media/media/files/hostile/bytes/original`, { headers: { cookie: viewer } });
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), SVG);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="hostile.bin"');
  response = await fetch(`${origin}/api/services/media/media/files/missing/bytes/thumb`, { headers: { cookie: viewer } });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'UPSTREAM_REJECTED');
  response = await fetch(`${origin}/api/services/media/media/files/fail/bytes/thumb`, { headers: { cookie: viewer } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');

  response = await fetch(`${origin}/api/services/audit/audit/events/export?unknown=1`, { headers: { cookie: viewer } });
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/services/audit/audit/events/export?format=ndjson&source=auth`, { headers: { cookie: viewer } });
  if (response.status !== 200) throw new Error(`audit export returned ${response.status}: ${await response.text()}`);
  const exportReader = response.body.getReader();
  const firstExport = await exportReader.read();
  assert.equal(Buffer.from(firstExport.value).toString(), '{"seq":1}\n');
  exportTail.resolve();
  assert.equal(Buffer.concat([Buffer.from(firstExport.value), await readAll(exportReader)]).toString(), '{"seq":1}\n{"seq":2}\n');
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="fixture.ndjson"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  request = latest((entry) => entry.url.startsWith('/v1/events/export?') && entry.url.includes('source=auth'));
  assert.equal(request.url, '/v1/events/export?source=auth&format=ndjson');
  assert.equal(request.headers.authorization, `Bearer ${API_KEY}`);
  assert.match(String(request.headers.traceparent), /^00-/);
  response = await fetch(`${origin}/api/services/audit/audit/events/export?source=broken`, { headers: { cookie: viewer } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'UPSTREAM_ERROR', message: 'audit export responded 503', service: 'audit' } });

  response = await fetch(`${origin}/api/services/shortlink/shortlink/links/a:b/qr.png?scale=4&margin=2`, { headers: { cookie: viewer } });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-length'), String(PNG.length));
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="a:b.png"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  request = latest((entry) => entry.url.startsWith('/v1/links/a%3Ab/qr'));
  assert.equal(request.url, '/v1/links/a%3Ab/qr?format=png&scale=4&margin=2');
  assert.equal(request.headers.authorization, `Bearer ${API_KEY}`);
  assert.match(String(request.headers.traceparent), /^00-/);
  response = await fetch(`${origin}/api/services/shortlink/shortlink/links/missing/qr.png`, { headers: { cookie: viewer } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'UPSTREAM_REJECTED', message: 'shortlink qr responded 404', service: 'shortlink' } });
  response = await fetch(`${origin}/api/services/shortlink/shortlink/links/fail/qr.png`, { headers: { cookie: viewer } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');

  response = await fetch(`${origin}/api/audit`, { headers: { cookie: admin } });
  const audit = await response.json();
  assert.ok(audit.items.some((entry) => entry.action === 'media.file.upload'));
  assert.ok(audit.items.some((entry) => entry.action === 'audit.events.export'));

  const active = await fetch(`${origin}/api/services/audit/audit/events/export?source=shutdown`, { headers: { cookie: viewer } });
  const activeReader = active.body.getReader();
  const activeFirst = await activeReader.read();
  assert.equal(Buffer.from(activeFirst.value).toString(), '{"seq":1}\n');
  child.kill('SIGTERM');
  shutdownTail.resolve();
  assert.equal(Buffer.concat([Buffer.from(activeFirst.value), await readAll(activeReader)]).toString(), '{"seq":1}\n{"seq":2}\n');
  assert.deepEqual(await childExit(child), { code: 0, signal: null }, diagnostics);
  child = undefined;
  console.log('SvelteKit M5 upload backpressure, limits, binary streams, headers, abort and shutdown contracts: OK');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  mediaTail.resolve();
  exportTail.resolve();
  shutdownTail.resolve();
  await new Promise((resolveClose) => downstream.close(() => resolveClose()));
  rmSync(scratch, { recursive: true, force: true });
}
