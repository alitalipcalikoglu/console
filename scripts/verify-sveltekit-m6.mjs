import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Config } from '../src/config.js';
import { ConsoleRuntime } from '../src/lib/server/runtime.js';

const PASSWORD = 'CorrectHorseBattery1!';
const SECRETS_KEY = '46'.repeat(32);
const SERVICE_KEY = 'm6'.repeat(20);
const routes = JSON.parse(readFileSync(new URL('../test/migration/fixtures/frontend-routes.json', import.meta.url), 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'console-m6-'));

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

const cookiePair = (response) => response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
const materialize = (pattern) => pattern.replaceAll(':sid', 'fixture-service').replaceAll(':id', 'fixture-id');
const requestJson = (body, headers = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

let child;
try {
  assert.equal(routes.length, 34);
  const dbPath = join(scratch, 'console.db');
  const servicesFile = join(scratch, 'services.json');
  const serviceTypes = ['notify', 'auth', 'media', 'gateway', 'audit', 'shortlink', 'flags', 'scheduler', 'webhook-out', 'search', 'ratelimit', 'geo'];
  writeFileSync(servicesFile, JSON.stringify({ services: serviceTypes.map((type) => ({
    id: type === 'webhook-out' ? 'webhooks' : type,
    type,
    url: 'http://127.0.0.1:9',
    ...(type === 'gateway' ? { metricsTokenEnv: 'M6_SERVICE_KEY' } : { apiKeyEnv: 'M6_SERVICE_KEY' }),
  })) }));

  const seedRuntime = new ConsoleRuntime(Config.fromEnv({
    DB_PATH: dbPath,
    LOG_LEVEL: 'silent',
    COOKIE_SECURE: 'false',
    SCRYPT_LOG_N: '14',
    SECRETS_KEY,
  }));
  await seedRuntime.adminService.create({ email: 'admin@m6.test', name: 'Admin', password: PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
  await seedRuntime.adminService.create({ email: 'viewer@m6.test', name: 'Viewer', password: PASSWORD, role: 'viewer' }, null, { ip: null, userAgent: null });
  seedRuntime.finishShutdown();

  const port = await freePort();
  child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      DB_PATH: dbPath,
      SERVICES_FILE: servicesFile,
      M6_SERVICE_KEY: SERVICE_KEY,
      PORT: String(port),
      HOST: '127.0.0.1',
      LOG_LEVEL: 'silent',
      COOKIE_SECURE: 'false',
      ORIGIN: `http://127.0.0.1:${port}`,
      SCRYPT_LOG_N: '14',
      SECRETS_KEY,
      SERVICE_TIMEOUT_MS: '500',
      PUBLIC_DIR: join(scratch, 'missing-public'),
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
    within(new Promise(() => {}), 10_000, 'runtime ready'),
  ]);
  assert.equal(ready, 'ready');
  const origin = `http://127.0.0.1:${port}`;

  let response = await fetch(`${origin}/login`, { redirect: 'manual' });
  assert.equal(response.status, 200);
  let html = await response.text();
  assert.match(html, /Sign in to Console/);
  assert.doesNotMatch(html, /aria-label="main"/);

  for (const pattern of routes.filter((pattern) => pattern !== '/login')) {
    response = await fetch(`${origin}${materialize(pattern)}`, { redirect: 'manual' });
    assert.equal(response.status, 303, `anonymous ${pattern}`);
    assert.equal(response.headers.get('location'), '/login', pattern);
    assert.doesNotMatch(await response.text(), /aria-label="main"/, pattern);
  }

  const login = async (email) => {
    const result = await fetch(`${origin}/api/session/login`, requestJson({ email, password: PASSWORD }));
    assert.equal(result.status, 200);
    return cookiePair(result);
  };
  const admin = await login('admin@m6.test');
  const viewer = await login('viewer@m6.test');

  response = await fetch(`${origin}/login`, { headers: { cookie: admin }, redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');

  for (const pattern of routes.filter((pattern) => !['/login', '/admins'].includes(pattern))) {
    const suffix = pattern === '/notify/:sid' ? '?status=sent#queue' : '';
    response = await fetch(`${origin}${materialize(pattern)}${suffix}`, { headers: { cookie: viewer }, redirect: 'manual' });
    assert.equal(response.status, 200, `viewer ${pattern}`);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
    html = await response.text();
    assert.match(html, /aria-label="main"/, pattern);
    assert.doesNotMatch(html, /<div id="app"><\/div>|data-m1-foundation/, pattern);
    assert.doesNotMatch(html, new RegExp(SERVICE_KEY), pattern);
    assert.doesNotMatch(html, new RegExp(viewer.split('=', 2)[1]), pattern);
  }

  response = await fetch(`${origin}/admins`, { headers: { cookie: viewer }, redirect: 'manual' });
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /Yöneticiler|Admins<\/h1>/);
  response = await fetch(`${origin}/admins`, { headers: { cookie: admin }, redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /aria-label="main"/);

  response = await fetch(`${origin}/unknown/browser/route`, { headers: { cookie: admin }, redirect: 'manual' });
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(await response.text(), /Page not found/);
  response = await fetch(`${origin}/api/not-a-route`, { headers: { cookie: admin } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'route not found' } });

  response = await fetch(`${origin}/api/session/logout`, requestJson({}, { cookie: admin }));
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/session/logout`, requestJson({}, { cookie: admin, 'x-console-request': '1' }));
  assert.equal(response.status, 204);
  response = await fetch(`${origin}/account`, { headers: { cookie: admin }, redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login');

  const canonical = [
    '../src/lib/pages/media/Files.svelte',
    '../src/lib/pages/media/FileDetail.svelte',
    '../src/lib/pages/audit/Events.svelte',
    '../src/lib/pages/shortlink/LinkDetail.svelte',
  ].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  assert.match(canonical, /api\.upload\(/);
  assert.match(canonical, /\/bytes\//);
  assert.match(canonical, /events\/export/);
  assert.match(canonical, /qr\.png/);
  assert.doesNotMatch(canonical, /base64|readAsDataURL/);

  child.kill('SIGTERM');
  assert.deepEqual(await childExit(child), { code: 0, signal: null }, diagnostics);
  child = undefined;
  console.log('SvelteKit M6 SSR auth, 34 routes, roles, deep links, 404, logout and binary UI contracts: OK');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}
