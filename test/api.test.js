import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ADMIN_PASSWORD, CSRF, signIn, testConsole } from './helpers.js';

/** Fake service answering the endpoints the console uses; records every request. */
/** @type {{ method: string|undefined, url: string|undefined, headers: import('node:http').IncomingHttpHeaders, body: string }[]} */
const seen = [];
const fake = createServer((req, res) => {
  const chunks = /** @type {Buffer[]} */ ([]);
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    const p = (req.url ?? '').split('?')[0];
    const json = (/** @type {number} */ status, /** @type {unknown} */ data) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (p === '/health') return res.writeHead(200).end('{"status":"ok"}');
    if (p === '/ready') return res.writeHead(200).end('{"status":"ok"}');
    if (p === '/metrics') return res.writeHead(200, { 'content-type': 'text/plain' }).end('notify_messages{status="queued"} 3\nnotify_messages{status="failed"} 1\nnotify_oldest_queued_age_seconds 4.5\nauth_users{status="active"} 12\nmedia_files 7\ngateway_requests_total{route="web",status="2xx"} 10\ngateway_request_duration_ms_bucket{route="web",le="50"} 8\ngateway_request_duration_ms_bucket{route="web",le="+Inf"} 10\ngateway_request_duration_ms_count{route="web"} 10\ngateway_rejected_total{reason="rate_limited"} 2\n');
    if (p === '/v1/messages' && req.method === 'GET') return json(200, { items: [{ id: 'm1', status: 'failed' }], nextCursor: null });
    if (p === '/v1/messages/m1/retry') return json(200, { id: 'm1', status: 'queued' });
    if (p === '/v1/messages' && req.method === 'POST') return json(202, { id: 'm2', status: 'queued' });
    if (p === '/v1/templates') return json(200, { items: [{ name: 'generic' }] });
    if (p === '/v1/users' && req.method === 'GET') return json(200, { items: [{ id: 'u1', email: 'ali@example.com' }], nextCursor: null });
    if (p === '/v1/users/u1' && req.method === 'GET') return json(200, { user: { id: 'u1', email: 'ali@example.com' } });
    if (p === '/v1/users/u1/sessions' && req.method === 'GET') return json(200, { items: [{ id: 's1' }] });
    if (p === '/v1/users/u1/events') return json(200, { items: [{ id: 1, type: 'login.succeeded' }], nextBefore: null });
    if (p === '/v1/users/u1' && req.method === 'PATCH') return json(200, { user: { id: 'u1', status: 'disabled' } });
    if (p === '/v1/users/u1' && req.method === 'DELETE') return res.writeHead(204).end();
    if (p === '/v1/users/u1/sessions' && req.method === 'DELETE') return json(200, { revoked: 2 });
    if (p === '/v1/auth/verify-email/resend') return json(202, { accepted: true });
    if (p === '/v1/files' && req.method === 'GET') return json(200, { items: [{ id: 'f1', name: 'a.png' }], nextCursor: null });
    if (p === '/v1/files' && req.method === 'PUT') return json(201, { file: { id: 'f2', name: 'up.png', size: body.length } });
    if (p === '/v1/files/f1/urls') return json(200, { urls: { thumb: { url: `http://127.0.0.1:${/** @type {any} */ (fake.address()).port}/files/f1/thumb?exp=1&sig=x` } } });
    if (p === '/files/f1/thumb') return res.writeHead(200, { 'content-type': 'image/webp', 'content-length': '3' }).end('img');
    if (p === '/v1/files/f1' && req.method === 'DELETE') return res.writeHead(204).end();
    if (p === '/v1/uploads') return json(201, { token: 't', uploadUrl: 'https://media/v1/uploads/t' });
    if (p === '/v1/users' && req.method === 'POST') return json(409, { error: { code: 'EMAIL_TAKEN', message: 'exists' } });
    json(404, { error: { code: 'NOT_FOUND', message: 'nope' } });
  });
});
const pub = mkdtempSync(join(tmpdir(), 'console-public-'));
mkdirSync(join(pub, 'assets'));
writeFileSync(join(pub, 'index.html'), '<!doctype html><title>console</title>');
writeFileSync(join(pub, 'assets', 'app-abc123def.js'), 'console.log(1)');
writeFileSync(join(pub, 'sw.js'), '// sw');

/** @type {Awaited<ReturnType<typeof testConsole>>} */
let t;
let origin = '';
before(async () => {
  await new Promise((r) => fake.listen(0, '127.0.0.1', () => r(undefined)));
  origin = `http://127.0.0.1:${/** @type {any} */ (fake.address()).port}`;
  t = await testConsole({ urls: { notify: origin, auth: origin, media: origin, gateway: origin }, publicDir: pub });
});
after(async () => { await t.app.close(); fake.close(); rmSync(pub, { recursive: true, force: true }); });

test('static app: index, SPA fallback, hashed assets immutable, API 404 stays JSON', async () => {
  let res = await t.app.inject('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>console/);
  assert.equal(res.headers['cache-control'], 'no-cache');
  res = await t.app.inject('/auth/users/abc');
  assert.equal(res.statusCode, 200, 'client route falls back to index.html');
  res = await t.app.inject('/assets/app-abc123def.js');
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
  res = await t.app.inject('/sw.js');
  assert.equal(res.headers['service-worker-allowed'], '/');
  assert.equal((await t.app.inject('/missing.png')).statusCode, 404);
  res = await t.app.inject('/api/nothing');
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, 'NOT_FOUND');
  assert.equal(res.headers['x-frame-options'], 'DENY');
});

test('session endpoints: login sets an httpOnly cookie, /session reflects state, logout clears', async () => {
  const { cookie, body } = await signIn(t);
  assert.equal(body.totpRequired, false);
  assert.equal(body.admin.email, 'root@console.local');
  const loginRes = await t.app.inject({ method: 'POST', url: '/api/session/login', payload: { email: 'root@console.local', password: ADMIN_PASSWORD } });
  assert.match(String(loginRes.headers['set-cookie']), /console_session=.*HttpOnly.*SameSite=Strict/);
  assert.equal((await t.app.inject('/api/session')).json().admin, null);
  const me = await t.app.inject({ url: '/api/session', headers: { cookie } });
  assert.equal(me.json().admin.role, 'admin');
  assert.equal(me.headers['cache-control'], 'no-store');
  const bad = await t.app.inject({ method: 'POST', url: '/api/session/login', payload: { email: 'root@console.local', password: 'wrong wrong wrong' } });
  assert.equal(bad.statusCode, 401);
  const out = await t.app.inject({ method: 'POST', url: '/api/session/logout', headers: { cookie } });
  assert.equal(out.statusCode, 204);
  assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
  assert.equal((await t.app.inject({ url: '/api/admins', headers: { cookie } })).statusCode, 401);
});

test('CSRF header required on mutations; viewers are read-only; admins are audited', async () => {
  const admin = await signIn(t);
  const viewer = await signIn(t, { email: 'viewer@console.local', role: 'viewer' });
  let res = await t.app.inject({ method: 'POST', url: '/api/services/notify/notify/messages/m1/retry', headers: { cookie: admin.cookie } });
  assert.equal(res.statusCode, 403, 'no CSRF header');
  assert.match(res.json().error.message, /x-console-request/);
  res = await t.app.inject({ method: 'POST', url: '/api/services/notify/notify/messages/m1/retry', headers: { cookie: viewer.cookie, ...CSRF } });
  assert.equal(res.statusCode, 403, 'viewer cannot mutate');
  assert.equal((await t.app.inject({ url: '/api/services/notify/notify/messages?status=failed', headers: { cookie: viewer.cookie } })).statusCode, 200, 'viewer can read');
  res = await t.app.inject({ method: 'POST', url: '/api/services/notify/notify/messages/m1/retry', headers: { cookie: admin.cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().status, 'queued');
  const audit = await t.app.inject({ url: '/api/audit?action=notify.', headers: { cookie: admin.cookie } });
  assert.equal(audit.json().items[0].action, 'notify.message.retry');
  assert.equal(audit.json().items[0].target, 'm1');
  assert.equal(audit.json().items[0].adminEmail, 'root@console.local');
});

test('service endpoints pass through with the service key and map upstream errors', async () => {
  const { cookie } = await signIn(t);
  seen.length = 0;
  let res = await t.app.inject({ url: '/api/services/auth/auth/users?email=ali@example.com', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().items[0].id, 'u1');
  assert.equal(seen.at(-1)?.headers.authorization, `Bearer ${'a'.repeat(40)}`, 'auth key injected');
  assert.equal(seen.at(-1)?.url, '/v1/users?email=ali%40example.com');

  res = await t.app.inject({ url: '/api/services/auth/auth/users/u1', headers: { cookie } });
  assert.equal(res.json().user.email, 'ali@example.com');
  assert.equal(res.json().sessions.length, 1);
  assert.equal(res.json().events[0].type, 'login.succeeded');

  res = await t.app.inject({ method: 'POST', url: '/api/services/auth/auth/users', headers: { cookie, ...CSRF }, payload: { email: 'x@example.com', password: 'whatever long pw' } });
  assert.equal(res.statusCode, 409, 'upstream status relayed');
  assert.equal(res.json().error.code, 'EMAIL_TAKEN');
  assert.equal(res.json().error.service, 'auth');

  res = await t.app.inject({ method: 'PATCH', url: '/api/services/auth/auth/users/u1', headers: { cookie, ...CSRF }, payload: { status: 'disabled' } });
  assert.equal(res.json().user.status, 'disabled');
  assert.equal((await t.app.inject({ method: 'DELETE', url: '/api/services/auth/auth/users/u1/sessions', headers: { cookie, ...CSRF } })).json().revoked, 2);
  assert.equal((await t.app.inject({ method: 'DELETE', url: '/api/services/auth/auth/users/u1', headers: { cookie, ...CSRF } })).statusCode, 204);

  assert.equal((await t.app.inject({ url: '/api/services/media/notify/messages', headers: { cookie } })).statusCode, 404, 'wrong service type');
  assert.equal((await t.app.inject({ url: '/api/services/nope/notify/messages', headers: { cookie } })).statusCode, 404);

  const dead = await testConsole({ urls: { notify: 'http://127.0.0.1:1' } });
  const d = await signIn(dead);
  res = await dead.app.inject({ url: '/api/services/notify/notify/messages', headers: { cookie: d.cookie } });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, 'UPSTREAM_UNREACHABLE');
  await dead.app.close();
});

test('overview aggregates health and parsed metrics per service', async () => {
  const { cookie } = await signIn(t);
  const res = await t.app.inject({ url: '/api/services/overview', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const items = res.json().items;
  assert.equal(items.length, 4);
  const notify = items.find((/** @type {any} */ i) => i.id === 'notify');
  assert.equal(notify.health, true);
  assert.equal(notify.summary.queued, 3);
  assert.equal(notify.summary.oldestQueuedAgeSec, 4.5);
  assert.equal(items.find((/** @type {any} */ i) => i.id === 'auth').summary.activeUsers, 12);
  const gw = items.find((/** @type {any} */ i) => i.id === 'gateway');
  assert.equal(gw.summary.routes.web.requests['2xx'], 10);
  assert.equal(gw.summary.routes.web.p50Ms, 50);
  assert.equal(gw.summary.rejected.rate_limited, 2);
});

test('media: list, thumbnail proxy, streaming upload, delete, ticket', async () => {
  const { cookie } = await signIn(t);
  let res = await t.app.inject({ url: '/api/services/media/media/files', headers: { cookie } });
  assert.equal(res.json().items[0].id, 'f1');
  res = await t.app.inject({ url: '/api/services/media/media/files/f1/bytes/thumb', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/webp');
  assert.equal(res.body, 'img');
  seen.length = 0;
  res = await t.app.inject({ method: 'PUT', url: '/api/services/media/media/files?visibility=public&name=up.png', headers: { cookie, ...CSRF, 'content-type': 'image/png' }, payload: Buffer.alloc(1000, 1) });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().file.size, 1000, 'body streamed through');
  const up = seen.find((s) => s.method === 'PUT');
  assert.equal(up?.headers['x-file-name'], 'up.png');
  assert.equal(up?.headers.authorization, `Bearer ${'m'.repeat(40)}`);
  assert.equal((await t.app.inject({ method: 'DELETE', url: '/api/services/media/media/files/f1', headers: { cookie, ...CSRF } })).statusCode, 204);
  res = await t.app.inject({ method: 'POST', url: '/api/services/media/media/tickets', headers: { cookie, ...CSRF }, payload: { visibility: 'public' } });
  assert.equal(res.statusCode, 201);
  const audit = await t.app.inject({ url: '/api/audit?action=media.', headers: { cookie } });
  assert.deepEqual(audit.json().items.map((/** @type {any} */ e) => e.action).slice(0, 3), ['media.ticket.create', 'media.file.delete', 'media.file.upload']);
});

test('admin management over HTTP', async () => {
  const { cookie } = await signIn(t);
  let res = await t.app.inject({ method: 'POST', url: '/api/admins', headers: { cookie, ...CSRF }, payload: { email: 'new@console.local', password: 'long enough password', role: 'viewer', name: 'New' } });
  assert.equal(res.statusCode, 201, res.body);
  const id = res.json().admin.id;
  res = await t.app.inject({ method: 'PATCH', url: `/api/admins/${id}`, headers: { cookie, ...CSRF }, payload: { role: 'admin' } });
  assert.equal(res.json().admin.role, 'admin');
  assert.equal((await t.app.inject({ method: 'POST', url: `/api/admins/${id}/password`, headers: { cookie, ...CSRF }, payload: { password: 'another long password' } })).statusCode, 204);
  assert.equal((await t.app.inject({ method: 'POST', url: `/api/admins/${id}/unlock`, headers: { cookie, ...CSRF } })).statusCode, 204);
  res = await t.app.inject({ url: '/api/admins', headers: { cookie } });
  assert.ok(res.json().items.some((/** @type {any} */ a) => a.email === 'new@console.local'));
  assert.equal((await t.app.inject({ method: 'DELETE', url: `/api/admins/${id}`, headers: { cookie, ...CSRF } })).statusCode, 204);
  res = await t.app.inject({ method: 'POST', url: '/api/me/totp/start', headers: { cookie, ...CSRF } });
  assert.match(res.json().uri, /^otpauth:/);
  res = await t.app.inject({ url: '/api/me/sessions', headers: { cookie } });
  assert.ok(res.json().items.some((/** @type {any} */ s) => s.current));
});
