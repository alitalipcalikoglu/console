import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Config } from '../src/config.js';
import { Totp } from '../src/crypto/totp.js';
import { Database } from '../src/db.js';
import { ConsoleRuntime } from '../src/lib/server/runtime.js';
import { SessionStore } from '../src/store/session-store.js';

const PASSWORD = 'CorrectHorseBattery1!';
const NEW_PASSWORD = 'EvenBetterBattery2!';
const KEY = '11'.repeat(32);
const TRACE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const scratch = mkdtempSync(join(tmpdir(), 'console-m3-auth-'));

const freePort = () => new Promise((resolvePort, reject) => {
  const server = createServer();
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

async function seed(dbPath) {
  const runtime = new ConsoleRuntime(Config.fromEnv({
    DB_PATH: dbPath, LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SECRETS_KEY: KEY,
  }));
  const hash = await runtime.hasher.hash(PASSWORD);
  for (const [email, name, role] of [
    ['admin@m3.test', 'Admin', 'admin'],
    ['viewer@m3.test', 'Viewer', 'viewer'],
    ['totp@m3.test', 'TOTP', 'admin'],
    ['expiry@m3.test', 'Expiry', 'admin'],
  ]) runtime.admins.create({ email, name, passwordHash: hash, role });
  const totpAdmin = runtime.admins.byEmail('totp@m3.test');
  assert.ok(totpAdmin);
  const secret = 'JBSWY3DPEHPK3PXP';
  runtime.admins.setTotpSecret(totpAdmin.id, secret);
  runtime.admins.enableTotp(totpAdmin.id);
  runtime.finishShutdown();
  return secret;
}

async function start(name, extraEnv = {}) {
  const dbPath = join(scratch, `${name}.db`);
  const secret = await seed(dbPath);
  const port = await freePort();
  const child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
      HOST: '127.0.0.1',
      LOG_LEVEL: 'silent',
      COOKIE_SECURE: 'false',
      SCRYPT_LOG_N: '14',
      SECRETS_KEY: KEY,
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
  return { child, dbPath, secret, origin: `http://127.0.0.1:${port}`, diagnostics: () => diagnostics };
}

async function stop(app) {
  app.child.kill('SIGTERM');
  assert.deepEqual(await childExit(app.child), { code: 0, signal: null }, app.diagnostics());
}

const cookiePair = (response) => response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
const json = (method, body, headers = {}) => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});

async function body(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function login(app, email, password = PASSWORD, headers = {}) {
  const response = await fetch(`${app.origin}/api/session/login`, json('POST', { email, password }, headers));
  return { response, cookie: cookiePair(response) };
}

try {
  const app = await start('default');
  try {
    let response = await fetch(`${app.origin}/api/session`);
    assert.equal(response.status, 200);
    assert.deepEqual(await body(response), { admin: null, totpPending: false });
    response = await fetch(`${app.origin}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await body(response), { error: { code: 'NOT_FOUND', message: 'route not found' } });

    response = await fetch(`${app.origin}/api/session/login`, json('POST', {}));
    assert.equal(response.status, 400);
    assert.deepEqual(await body(response), { error: { code: 'VALIDATION_FAILED', message: "body must have required property 'email'", details: [{ path: '', message: "must have required property 'email'" }] } });
    response = await fetch(`${app.origin}/api/session/login`, json('POST', '{'));
    assert.equal(response.status, 400);
    assert.deepEqual(await body(response), { error: { code: 'FST_ERR_CTP_INVALID_JSON_BODY', message: "Body is not valid JSON but content-type is set to 'application/json'" } });
    response = await fetch(`${app.origin}/api/session/login`, json('POST', { email: 'admin@m3.test', password: PASSWORD, extra: true }));
    assert.equal(response.status, 400);
    assert.deepEqual((await body(response)).error.details, [{ path: '', message: 'must NOT have additional properties' }]);
    response = await fetch(`${app.origin}/api/session/login`, json('POST', { email: 'admin@m3.test', password: 'x'.repeat(70_000) }));
    assert.equal(response.status, 413);
    assert.deepEqual(await body(response), { error: { code: 'FST_ERR_CTP_BODY_TOO_LARGE', message: 'Request body is too large' } });

    const invalid = await login(app, 'nobody@m3.test', 'wrong');
    assert.equal(invalid.response.status, 401);
    assert.deepEqual(await body(invalid.response), { error: { code: 'INVALID_CREDENTIALS', message: 'email or password is incorrect' } });

    const signedIn = await login(app, 'admin@m3.test', PASSWORD, { 'x-forwarded-for': '203.0.113.7' });
    assert.equal(signedIn.response.status, 200);
    const setCookie = signedIn.response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /^console_session=[A-Za-z0-9_-]+; Max-Age=43200; Path=\/; HttpOnly; SameSite=Strict$/);
    const token = decodeURIComponent(signedIn.cookie.slice(signedIn.cookie.indexOf('=') + 1));
    const loginBody = await body(signedIn.response);
    assert.equal(loginBody.admin.role, 'admin');
    assert.equal(JSON.stringify(loginBody).includes(PASSWORD), false);
    assert.equal(JSON.stringify(loginBody).includes(token), false);

    response = await fetch(`${app.origin}/api/session`, { headers: { cookie: signedIn.cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('set-cookie'), null, 'session reads do not renew the browser cookie');
    assert.equal((await body(response)).admin.role, 'admin');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
    assert.match(response.headers.get('traceparent') ?? '', TRACE);
    assert.equal(response.headers.get('x-request-id'), null);

    const db = new Database(app.dbPath);
    const sessions = new SessionStore(db);
    try {
      const stored = sessions.byToken(token);
      assert.ok(stored);
      assert.notEqual(stored.token_hash, token);
      assert.equal(stored.ip === '127.0.0.1' || stored.ip === '::ffff:127.0.0.1', true, `untrusted XFF was used: ${stored.ip}`);
    } finally {
      db.close();
    }

    response = await fetch(`${app.origin}/api/me/sessions`, { headers: { cookie: signedIn.cookie } });
    assert.equal(response.status, 200);
    assert.equal((await body(response)).items[0].current, true);
    response = await fetch(`${app.origin}/api/me/sessions`);
    assert.equal(response.status, 401);
    assert.deepEqual(await body(response), { error: { code: 'UNAUTHENTICATED', message: 'sign in required' } });

    response = await fetch(`${app.origin}/api/me/sessions/logout-others`, { method: 'POST', headers: { cookie: signedIn.cookie } });
    assert.equal(response.status, 403);
    assert.deepEqual(await body(response), { error: { code: 'FORBIDDEN', message: 'missing x-console-request header' } });
    response = await fetch(`${app.origin}/api/me/password`, json('POST', {}, { cookie: signedIn.cookie }));
    assert.equal(response.status, 400, 'schema validation remains ahead of the authenticated route gate');
    assert.equal((await body(response)).error.code, 'VALIDATION_FAILED');
    response = await fetch(`${app.origin}/api/me/sessions/logout-others`, { method: 'POST', headers: { cookie: signedIn.cookie, 'x-console-request': 'no' } });
    assert.equal(response.status, 403);
    response = await fetch(`${app.origin}/api/me/sessions/logout-others`, { method: 'POST', headers: { cookie: signedIn.cookie, 'x-console-request': '1' } });
    assert.equal(response.status, 200);

    const viewer = await login(app, 'viewer@m3.test');
    assert.equal(viewer.response.status, 200);
    response = await fetch(`${app.origin}/api/me/sessions`, { headers: { cookie: viewer.cookie } });
    assert.equal(response.status, 200);
    const enrol = await fetch(`${app.origin}/api/me/totp/start`, { method: 'POST', headers: { cookie: viewer.cookie, 'x-console-request': '1' } });
    assert.equal(enrol.status, 200);
    const enrolment = await body(enrol);
    assert.match(enrolment.secret, /^[A-Z2-7]+$/);
    const enrolCode = Totp.code(enrolment.secret, Math.floor(Date.now() / 30_000));
    response = await fetch(`${app.origin}/api/me/totp/confirm`, json('POST', { code: enrolCode }, { cookie: viewer.cookie, 'x-console-request': '1' }));
    assert.equal(response.status, 204);
    response = await fetch(`${app.origin}/api/me/totp/disable`, json('POST', { password: PASSWORD, code: enrolCode }, { cookie: viewer.cookie, 'x-console-request': '1' }));
    assert.equal(response.status, 204);
    response = await fetch(`${app.origin}/api/me/password`, json('POST', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, { cookie: viewer.cookie, 'x-console-request': '1' }));
    assert.equal(response.status, 204);
    assert.equal((await login(app, 'viewer@m3.test', NEW_PASSWORD)).response.status, 200);

    const pending = await login(app, 'totp@m3.test');
    assert.equal(pending.response.status, 200);
    assert.deepEqual(await body(pending.response), { totpRequired: true, admin: null });
    response = await fetch(`${app.origin}/api/session`, { headers: { cookie: pending.cookie } });
    assert.deepEqual(await body(response), { admin: null, totpPending: true });
    response = await fetch(`${app.origin}/api/me/sessions`, { headers: { cookie: pending.cookie } });
    assert.equal(response.status, 401);
    assert.deepEqual(await body(response), { error: { code: 'TOTP_REQUIRED', message: 'second factor required' } });
    const correctCode = Totp.code(app.secret, Math.floor(Date.now() / 30_000));
    const wrongCode = correctCode === '000000' ? '000001' : '000000';
    response = await fetch(`${app.origin}/api/session/totp`, json('POST', { code: wrongCode }, { cookie: pending.cookie }));
    assert.equal(response.status, 401);
    assert.equal((await body(response)).error.code, 'INVALID_TOTP');
    response = await fetch(`${app.origin}/api/session/totp`, json('POST', { code: correctCode }, { cookie: pending.cookie }));
    assert.equal(response.status, 200, 'pre-session TOTP remains exempt from CSRF');

    const expiring = await login(app, 'expiry@m3.test');
    const expiringToken = decodeURIComponent(expiring.cookie.slice(expiring.cookie.indexOf('=') + 1));
    const expiryDb = new Database(app.dbPath);
    try {
      const store = new SessionStore(expiryDb);
      const row = store.byToken(expiringToken);
      assert.ok(row);
      expiryDb.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1, row.id);
    } finally { expiryDb.close(); }
    response = await fetch(`${app.origin}/api/session`, { headers: { cookie: expiring.cookie } });
    assert.deepEqual(await body(response), { admin: null, totpPending: false });

    const idle = await login(app, 'expiry@m3.test');
    const idleToken = decodeURIComponent(idle.cookie.slice(idle.cookie.indexOf('=') + 1));
    const idleDb = new Database(app.dbPath);
    try {
      const store = new SessionStore(idleDb);
      const row = store.byToken(idleToken);
      assert.ok(row);
      idleDb.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now() - (61 * 60_000), row.id);
    } finally { idleDb.close(); }
    response = await fetch(`${app.origin}/api/session`, { headers: { cookie: idle.cookie } });
    assert.deepEqual(await body(response), { admin: null, totpPending: false });

    const revoked = await login(app, 'expiry@m3.test');
    const revokedToken = decodeURIComponent(revoked.cookie.slice(revoked.cookie.indexOf('=') + 1));
    const revokeDb = new Database(app.dbPath);
    try { new SessionStore(revokeDb).remove(new SessionStore(revokeDb).byToken(revokedToken).id); } finally { revokeDb.close(); }
    response = await fetch(`${app.origin}/api/session`, { headers: { cookie: revoked.cookie } });
    assert.deepEqual(await body(response), { admin: null, totpPending: false });

    const inbound = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01';
    response = await fetch(`${app.origin}/api/session`, { headers: { traceparent: inbound, 'x-request-id': 'caller-controlled' } });
    assert.match(response.headers.get('traceparent') ?? '', TRACE);
    assert.notEqual(response.headers.get('traceparent')?.slice(3, 35), 'a'.repeat(32));
    assert.equal(response.headers.get('x-request-id'), null);

    response = await fetch(`${app.origin}/api/session/logout`, { method: 'POST', headers: { cookie: signedIn.cookie } });
    assert.equal(response.status, 403, 'M3 correction: authenticated logout requires CSRF');
    response = await fetch(`${app.origin}/api/session`, { headers: { cookie: signedIn.cookie } });
    assert.notEqual((await body(response)).admin, null, 'rejected logout did not revoke the session');
    response = await fetch(`${app.origin}/api/session/logout`, { method: 'POST', headers: { cookie: signedIn.cookie, 'x-console-request': '1' } });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie') ?? '', /^console_session=; Max-Age=0; Path=\/; HttpOnly; SameSite=Strict$/);
    response = await fetch(`${app.origin}/api/session/logout`, { method: 'POST' });
    assert.equal(response.status, 204, 'anonymous cookie clearing remains idempotent');
  } finally {
    await stop(app);
  }

  const trusted = await start('trusted', { TRUST_PROXY: 'true', COOKIE_SECURE: 'true' });
  try {
    const inbound = '00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01';
    const signedIn = await login(trusted, 'admin@m3.test', PASSWORD, { 'x-forwarded-for': '203.0.113.44', traceparent: inbound });
    assert.equal(signedIn.response.status, 200);
    assert.match(signedIn.response.headers.get('set-cookie') ?? '', /; Secure$/);
    assert.equal(signedIn.response.headers.get('traceparent')?.slice(3, 35), 'c'.repeat(32));
    const token = decodeURIComponent(signedIn.cookie.slice(signedIn.cookie.indexOf('=') + 1));
    const db = new Database(trusted.dbPath);
    try {
      const session = new SessionStore(db).byToken(token);
      assert.ok(session);
      assert.equal(session.ip, '203.0.113.44');
    } finally { db.close(); }
  } finally {
    await stop(trusted);
  }

  console.log('SvelteKit M3 auth, session, TOTP, roles, CSRF, cookie, validation, trace and proxy contracts: OK');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
