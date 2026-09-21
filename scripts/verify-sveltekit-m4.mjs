import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Config } from '../src/config.js';
import { ConsoleRuntime } from '../src/lib/server/runtime.js';

const PASSWORD = 'CorrectHorseBattery1!';
const KEY = '22'.repeat(32);
const API_KEY = 'm4'.repeat(20);
const CSRF = { 'x-console-request': '1' };
const scratch = mkdtempSync(join(tmpdir(), 'console-m4-'));
const seen = [];

const freePort = () => new Promise((resolvePort, reject) => {
  const server = createTcpServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('could not allocate port'));
    server.close((error) => error ? reject(error) : resolvePort(address.port));
  });
});

const childExit = (child, timeoutMs = 10_000) => {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    new Promise((_, reject) => setTimeout(() => reject(new Error('child did not exit')), timeoutMs)),
  ]);
};

const downstream = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  request.on('end', () => {
    const url = new URL(request.url ?? '/', 'http://downstream.test');
    const entry = { method: request.method, url: request.url, headers: { ...request.headers }, body: Buffer.concat(chunks).toString() };
    seen.push(entry);
    const json = (status, body) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/v1/messages' && url.searchParams.get('status') === 'scheduled') return;
    if (url.pathname === '/v1/messages' && url.searchParams.get('status') === 'failed') return json(409, { error: { code: 'DOWNSTREAM_CONFLICT', message: 'fixture conflict', details: { safe: true } } });
    if (url.pathname === '/v1/messages' && request.method === 'GET') return json(200, { items: [], nextCursor: null });
    if (url.pathname === '/v1/messages' && request.method === 'POST') return json(202, { id: 'message-1' });
    if (url.pathname === '/v1/users/user%3A1' && request.method === 'PATCH') return json(200, { id: 'user:1', status: 'disabled' });
    if (url.pathname === '/v1/users/user%3A1' && request.method === 'DELETE') return response.writeHead(204).end();
    if (url.pathname === '/v1/events' && request.method === 'POST') return json(202, { accepted: true });
    return json(200, { ok: true });
  });
});

const json = (method, body, headers = {}) => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const readBody = async (response) => {
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
};
const cookiePair = (response) => response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';

let child;
try {
  await new Promise((resolveStart, reject) => downstream.listen(0, '127.0.0.1', resolveStart).once('error', reject));
  const downstreamAddress = downstream.address();
  if (!downstreamAddress || typeof downstreamAddress === 'string') throw new Error('downstream did not bind');
  const downstreamOrigin = `http://127.0.0.1:${downstreamAddress.port}`;
  const dbPath = join(scratch, 'console.db');
  const servicesFile = join(scratch, 'services.json');
  const serviceTypes = ['notify', 'auth', 'media', 'gateway', 'audit', 'shortlink', 'flags', 'scheduler', 'webhook-out', 'search', 'ratelimit', 'geo'];
  writeFileSync(servicesFile, JSON.stringify({ services: serviceTypes.map((type) => ({
    id: type === 'webhook-out' ? 'webhooks' : type,
    type,
    url: downstreamOrigin,
    ...(type === 'gateway' ? { metricsTokenEnv: 'M4_API_KEY' } : { apiKeyEnv: 'M4_API_KEY' }),
  })) }));

  const seedRuntime = new ConsoleRuntime(Config.fromEnv({
    DB_PATH: dbPath, LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SECRETS_KEY: KEY,
  }));
  await seedRuntime.adminService.create({ email: 'admin@m4.test', name: 'Admin', password: PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
  await seedRuntime.adminService.create({ email: 'viewer@m4.test', name: 'Viewer', password: PASSWORD, role: 'viewer' }, null, { ip: null, userAgent: null });
  seedRuntime.finishShutdown();

  const port = await freePort();
  child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: {
      ...process.env, DB_PATH: dbPath, SERVICES_FILE: servicesFile, M4_API_KEY: API_KEY,
      PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false',
      ORIGIN: `http://127.0.0.1:${port}`,
      SCRYPT_LOG_N: '14', SECRETS_KEY: KEY, SERVICE_TIMEOUT_MS: '500', PUBLIC_DIR: join(scratch, 'missing-public'),
    },
    execArgv: ['--disable-warning=ExperimentalWarning'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let diagnostics = '';
  child.stdout?.on('data', (chunk) => { diagnostics += chunk; });
  child.stderr?.on('data', (chunk) => { diagnostics += chunk; });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    childExit(child).then((result) => { throw new Error(`runtime exited before ready: ${JSON.stringify(result)} ${diagnostics}`); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`runtime ready timed out: ${diagnostics}`)), 10_000)),
  ]);
  assert.equal(ready, 'ready');
  const origin = `http://127.0.0.1:${port}`;

  let response = await fetch(`${origin}/api/services/notify/notify/messages`);
  assert.equal(response.status, 401);
  assert.deepEqual(await readBody(response), { error: { code: 'UNAUTHENTICATED', message: 'sign in required' } });

  const login = async (email) => {
    const result = await fetch(`${origin}/api/session/login`, json('POST', { email, password: PASSWORD }));
    assert.equal(result.status, 200);
    return cookiePair(result);
  };
  const admin = await login('admin@m4.test');
  const viewer = await login('viewer@m4.test');

  response = await fetch(`${origin}/api/services/notify/notify/messages?status=queued&limit=7&cursor=next`, { headers: { cookie: viewer } });
  assert.equal(response.status, 200, await response.clone().text());
  const getRequest = seen.findLast((entry) => entry.url?.startsWith('/v1/messages?'));
  assert.equal(getRequest?.url, '/v1/messages?status=queued&limit=7&cursor=next');
  assert.equal(getRequest?.headers.authorization, `Bearer ${API_KEY}`);
  assert.match(String(getRequest?.headers.traceparent), /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

  response = await fetch(`${origin}/api/services/notify/notify/messages?limit=0`, { headers: { cookie: viewer } });
  assert.equal(response.status, 400, await response.clone().text());
  response = await fetch(`${origin}/api/services/notify/notify/messages?limit=7&limit=8`, { headers: { cookie: viewer } });
  assert.equal(response.status, 400, 'repeated scalar query parameters stay invalid');
  response = await fetch(`${origin}/api/services/notify/notify/messages`, json('POST', { channel: 'email' }, { cookie: viewer, ...CSRF }));
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/services/notify/notify/messages`, json('POST', { channel: 'email' }, { cookie: admin }));
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/services/notify/notify/messages`, json('POST', '{', { cookie: admin }));
  assert.equal(response.status, 400, 'JSON validation remains ahead of CSRF/auth gates');
  response = await fetch(`${origin}/api/services/notify/notify/messages`, { method: 'POST', headers: { cookie: admin, ...CSRF, origin, 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(response.status, 400, await response.clone().text());
  assert.equal((await readBody(response)).error.message, 'body must be object');
  response = await fetch(`${origin}/api/services/notify/notify/messages`, { method: 'POST', headers: { cookie: admin, ...CSRF, 'content-type': 'application/octet-stream' }, body: '{}' });
  assert.equal(response.status, 415);
  assert.equal((await readBody(response)).error.code, 'FST_ERR_CTP_INVALID_MEDIA_TYPE');
  response = await fetch(`${origin}/api/services/notify/notify/messages`, { method: 'POST', headers: { cookie: admin, ...CSRF, 'content-type': 'application/json' } });
  assert.equal(response.status, 400);
  assert.equal((await readBody(response)).error.code, 'FST_ERR_CTP_EMPTY_JSON_BODY');
  response = await fetch(`${origin}/api/services/notify/notify/messages`, json('POST', { channel: 'email', to: 'person@example.test' }, { cookie: admin, ...CSRF }));
  assert.equal(response.status, 202);
  assert.deepEqual(JSON.parse(seen.findLast((entry) => entry.url === '/v1/messages' && entry.method === 'POST').body), { channel: 'email', to: 'person@example.test' });

  response = await fetch(`${origin}/api/services/auth/auth/users/user:1`, json('PATCH', { status: 'disabled', extra: true }, { cookie: admin, ...CSRF }));
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/services/auth/auth/users/user:1`, json('PATCH', { status: 'disabled' }, { cookie: admin, ...CSRF }));
  assert.equal(response.status, 200);
  assert.equal(seen.findLast((entry) => entry.method === 'PATCH')?.url, '/v1/users/user%3A1');
  response = await fetch(`${origin}/api/services/auth/auth/users/user:1`, { method: 'DELETE', headers: { cookie: admin, ...CSRF } });
  assert.equal(response.status, 204);

  response = await fetch(`${origin}/api/services/auth/auth/users/%20`, { headers: { cookie: admin } });
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/services/notify/notify/messages?status=failed`, { headers: { cookie: admin } });
  assert.equal(response.status, 409);
  assert.deepEqual(await readBody(response), { error: { code: 'DOWNSTREAM_CONFLICT', message: 'fixture conflict', service: 'notify', details: { safe: true } } });
  response = await fetch(`${origin}/api/services/notify/notify/messages?status=scheduled`, { headers: { cookie: admin } });
  assert.equal(response.status, 502);
  assert.equal((await readBody(response)).error.code, 'UPSTREAM_UNREACHABLE');

  response = await fetch(`${origin}/api/admins`, { headers: { cookie: viewer } });
  assert.equal(response.status, 200);
  response = await fetch(`${origin}/api/admins`, json('POST', { email: 'new@m4.test', password: PASSWORD, role: 'viewer', extra: true }, { cookie: admin, ...CSRF }));
  assert.equal(response.status, 400);
  response = await fetch(`${origin}/api/admins`, json('POST', { email: 'new@m4.test', password: PASSWORD, role: 'viewer' }, { cookie: admin, ...CSRF }));
  assert.equal(response.status, 201);
  response = await fetch(`${origin}/api/audit`, { headers: { cookie: admin } });
  assert.equal(response.status, 200);
  assert.ok((await readBody(response)).items.some((entry) => entry.action === 'admin.created'));

  response = await fetch(`${origin}/api/services/notify/notify/messages`, json('POST', { payload: 'x'.repeat(70_000) }, { cookie: admin, ...CSRF }));
  assert.equal(response.status, 413);
  response = await fetch(`${origin}/api/not-an-operation`, { headers: { cookie: admin } });
  assert.equal(response.status, 404);
  assert.deepEqual(await readBody(response), { error: { code: 'NOT_FOUND', message: 'route not found' } });

  child.kill('SIGTERM');
  assert.deepEqual(await childExit(child), { code: 0, signal: null }, diagnostics);
  child = undefined;
  console.log('SvelteKit M4 JSON routes, auth, CSRF, validation, downstream, audit and error contracts: OK');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await new Promise((resolveClose) => downstream.close(() => resolveClose()));
  rmSync(scratch, { recursive: true, force: true });
}
