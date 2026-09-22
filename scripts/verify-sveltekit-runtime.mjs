import assert from 'node:assert/strict';
import { execFileSync, fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { Agent, request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Database } from '../src/db.js';

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const canonical = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const scratch = mkdtempSync(join(tmpdir(), 'console-m2-runtime-'));

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('could not allocate port'));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function childExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ code, signal })),
    new Promise((_, reject) => setTimeout(() => reject(new Error('child process did not exit')), timeoutMs)),
  ]);
}

async function startRuntime(name, extraEnv = {}) {
  const port = await freePort();
  const dbPath = join(scratch, `${name}.db`);
  const child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      LOG_LEVEL: 'silent',
      COOKIE_SECURE: 'false',
      DB_PATH: dbPath,
      PUBLIC_DIR: join(scratch, 'missing-public'),
      ...extraEnv,
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
  return { child, port, dbPath, diagnostics: () => diagnostics };
}

async function stopRuntime(runtime) {
  runtime.child.kill('SIGTERM');
  runtime.child.kill('SIGTERM');
  assert.deepEqual(await childExit(runtime.child), { code: 0, signal: null }, runtime.diagnostics());
  const db = new Database(runtime.dbPath);
  try {
    db.ping();
    assert.equal(db.schemaVersion, 2);
  } finally {
    db.close();
  }
}

function httpsGet(port, path) {
  return new Promise((resolveResponse, reject) => {
    httpsRequest({
      host: '127.0.0.1', port, path,
      agent: new Agent({ rejectUnauthorized: false }),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveResponse({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        encrypted: response.socket.encrypted,
      }));
    }).on('error', reject).end();
  });
}

try {
  const http = await startRuntime('http');
  try {
    let response = await fetch(`http://127.0.0.1:${http.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const untrustedTrace = '00-11111111111111111111111111111111-2222222222222222-01';
    response = await fetch(`http://127.0.0.1:${http.port}/health`, { headers: { traceparent: untrustedTrace } });
    assert.match(response.headers.get('traceparent') ?? '', TRACEPARENT);
    assert.notEqual(response.headers.get('traceparent')?.slice(3, 35), untrustedTrace.slice(3, 35));

    response = await fetch(`http://127.0.0.1:${http.port}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    response = await fetch(`http://127.0.0.1:${http.port}/v1/info`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: 'console', version: packageVersion, apiVersion: 'v1',
      capabilities: ['totp', 'admin-roles', 'audit-trail', 'service-proxy'],
      schemaVersion: 2, serviceCore: '1.12.0',
    });

    response = await fetch(`http://127.0.0.1:${http.port}/openapi.yaml`, {
      headers: { authorization: 'Bearer deliberately-ignored', cookie: 'console_session=deliberately-ignored' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/yaml/);
    assert.equal(response.headers.get('cache-control'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('traceparent') ?? '', TRACEPARENT);
    assert.equal(await response.text(), canonical);

    response = await fetch(`http://127.0.0.1:${http.port}/`, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
    assert.doesNotMatch(await response.text(), /aria-label="main"/);
    response = await fetch(`http://127.0.0.1:${http.port}/login`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Sign in to Console/);
  } finally {
    await stopRuntime(http);
  }

  const cert = join(scratch, 'cert.pem');
  const key = join(scratch, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const https = await startRuntime('https', { TLS_CERT_PATH: cert, TLS_KEY_PATH: key });
  try {
    const response = await httpsGet(https.port, '/health');
    assert.equal(response.status, 200);
    assert.equal(response.body, '{"status":"ok"}');
    assert.equal(response.encrypted, true);
    assert.equal(response.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
  } finally {
    await stopRuntime(https);
  }

  const invalid = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', resolve('server.mjs')], {
    cwd: resolve('.'), env: { ...process.env, PORT: 'not-a-port', LOG_LEVEL: 'silent' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  invalid.stderr?.on('data', (chunk) => { stderr += chunk; });
  assert.deepEqual(await childExit(invalid), { code: 1, signal: null });
  assert.match(stderr, /^configuration error: PORT must be an integer/m);

  console.log('SvelteKit runtime singleton, HTTP/HTTPS, operational parity, IPC readiness and graceful shutdown: OK');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
