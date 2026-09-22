import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { parse } from 'yaml';
import { OpenApiDocuments } from '../../src/services/openapi-documents.js';
import { ADMIN_PASSWORD } from '../helpers.js';
import { closeServer, cookiePair, REQUEST_ID, startConsole, TRACEPARENT } from './helpers.js';

const require = createRequire(import.meta.url);
const canonical = readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8');
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const docsYaml = 'openapi: 3.1.0\ninfo:\n  title: Fixture service\n  version: 1.0.0\npaths: {}\n';
/** @type {{ url?: string, headers: import('node:http').IncomingHttpHeaders }[]} */
const docsRequests = [];
const docsServer = createServer((req, res) => {
  docsRequests.push({ url: req.url, headers: { ...req.headers } });
  res.writeHead(200, { 'content-type': 'text/yaml', 'content-length': String(Buffer.byteLength(docsYaml)) }).end(docsYaml);
});

/** @type {Awaited<ReturnType<typeof startConsole>>} */ let consoleApp;
/** @type {string} */ let cookie;

before(async () => {
  await new Promise((resolveListen) => docsServer.listen(0, '127.0.0.1', () => resolveListen(undefined)));
  const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (docsServer.address()).port}`;
  consoleApp = await startConsole({ urls: { notify: origin } });
  await consoleApp.adminService.create({ email: 'platform@migration.test', name: 'Platform', password: ADMIN_PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
  const login = await fetch(`${consoleApp.origin}/api/session/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'platform@migration.test', password: ADMIN_PASSWORD }),
  });
  cookie = cookiePair(login.headers.get('set-cookie'));
});

after(async () => {
  await consoleApp.close();
  await closeServer(docsServer);
});

test('operational oracle: health, readiness and service identity remain exact', async () => {
  let response = await fetch(`${consoleApp.origin}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  response = await fetch(`${consoleApp.origin}/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  response = await fetch(`${consoleApp.origin}/v1/info`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: 'console', version: PACKAGE_VERSION, apiVersion: 'v1',
    capabilities: ['totp', 'admin-roles', 'audit-trail', 'service-proxy'],
    schemaVersion: 2, serviceCore: '1.12.0',
  });
});

test('OpenAPI endpoint oracle: the unauthenticated response is the canonical root bytes', async () => {
  const response = await fetch(`${consoleApp.origin}/openapi.yaml`, {
    headers: { authorization: 'Bearer deliberately-ignored', cookie: 'console_session=deliberately-ignored' },
  });
  assert.equal(response.status, 200);
  assert.match(String(response.headers.get('content-type')), /^text\/yaml/);
  assert.equal(await response.text(), canonical);
  assert.equal(response.headers.get('cache-control'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(String(response.headers.get('traceparent')), TRACEPARENT);
});

test('Docs oracle: authentication, fixed registry, local spec, credential-free upstream and URL rejection', async () => {
  let response = await fetch(`${consoleApp.origin}/api/docs/services`);
  assert.equal(response.status, 401);

  response = await fetch(`${consoleApp.origin}/api/docs/services`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.equal(list.items.length, 13);
  assert.deepEqual(list.items[0], { id: 'console', type: 'console', label: 'Console' });
  assert.equal(JSON.stringify(list).includes('apiKey'), false);

  response = await fetch(`${consoleApp.origin}/api/docs/services/console/openapi`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).document, parse(canonical));

  response = await fetch(`${consoleApp.origin}/api/docs/services/notify/openapi`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).document.info.title, 'Fixture service');
  const downstream = docsRequests.at(-1);
  assert.ok(downstream);
  assert.equal(downstream.url, '/openapi.yaml');
  assert.equal(downstream.headers.authorization, undefined);
  assert.equal(downstream.headers.cookie, undefined);
  assert.match(String(downstream.headers['x-request-id']), REQUEST_ID);

  const requestCount = docsRequests.length;
  response = await fetch(`${consoleApp.origin}/api/docs/services/http%3A%2F%2F127.0.0.1/openapi`, { headers: { cookie } });
  assert.ok(response.status === 400 || response.status === 404);
  assert.equal(docsRequests.length, requestCount, 'a caller cannot turn the docs endpoint into an arbitrary URL fetch');
  assert.equal(OpenApiDocuments.MAX_BYTES, 5 * 1024 * 1024);
});

/** @returns {Promise<number>} */
function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
      server.close((err) => err ? reject(err) : resolvePort(port));
    });
  });
}

/** @param {import('node:child_process').ChildProcess} child @param {number} [timeoutMs] */
function childExit(child, timeoutMs = 10_000) {
  return Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    new Promise((_, reject) => setTimeout(() => reject(new Error('child process did not exit')), timeoutMs)),
  ]);
}

test('process oracle: configured port, ready IPC, identity and graceful SIGTERM', { timeout: 20_000 }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'console-m0-process-'));
  const servicesFile = join(scratch, 'services.json');
  const dbPath = join(scratch, 'console.db');
  writeFileSync(servicesFile, JSON.stringify({ services: [{ id: 'gateway', type: 'gateway', url: 'http://127.0.0.1:1' }] }));
  const port = await getFreePort();
  const child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', DB_PATH: dbPath, SERVICES_FILE: servicesFile },
    execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '';
  assert.ok(child.stderr);
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const ready = await Promise.race([
      once(child, 'message').then(([message]) => message),
      childExit(child).then((result) => { throw new Error(`child exited before ready: ${JSON.stringify(result)} ${stderr}`); }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ready IPC timed out')), 10_000)),
    ]);
    assert.equal(ready, 'ready');
    const response = await fetch(`http://127.0.0.1:${port}/v1/info`);
    assert.equal(response.status, 200);
    const info = await response.json();
    assert.equal(info.service, 'console');
    assert.equal(info.version, PACKAGE_VERSION);
    assert.equal(info.schemaVersion, 2);
    child.kill('SIGTERM');
    assert.deepEqual(await childExit(child), { code: 0, signal: null });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('process oracle: invalid startup configuration fails closed', { timeout: 10_000 }, async () => {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', resolve('server.mjs')], {
    cwd: resolve('.'), env: { ...process.env, PORT: 'not-a-port', LOG_LEVEL: 'silent' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  assert.ok(child.stderr);
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  assert.deepEqual(await childExit(child), { code: 1, signal: null });
  assert.match(stderr, /^configuration error: PORT must be an integer/m);
});

test('process oracle: PM2 budget and canonical lifecycle close ordering remain frozen', () => {
  const ecosystem = require('../../ecosystem.config.cjs');
  const processConfig = ecosystem.apps[0];
  assert.equal(processConfig.script, 'server.mjs');
  assert.equal(processConfig.wait_ready, true);
  assert.equal(processConfig.listen_timeout, 10_000);
  assert.equal(processConfig.kill_timeout, 35_000);
  const wrapper = readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../../src/lib/server/runtime.js', import.meta.url), 'utf8');
  const wrapperSteps = ['runtime?.beginShutdown()', 'await close(server)', 'await runtime?.finishShutdown()'];
  const positions = wrapperSteps.map((step) => wrapper.indexOf(step));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'runtime stops maintenance before HTTP drain and resource close');
  assert.match(runtime, /this\.maintenance\.stop\(\)/);
  assert.match(runtime, /this\.m4\?\.forwarder\.close\(\)/);
  assert.match(runtime, /this\.db\.close\(\)/);
  assert.match(wrapper, /FORCE_EXIT_MS\s*=\s*30_000/);
});
