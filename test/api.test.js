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
    if (p === '/metrics') return res.writeHead(200, { 'content-type': 'text/plain' }).end('notify_messages{status="queued"} 3\nnotify_messages{status="failed"} 1\nnotify_oldest_queued_age_seconds 4.5\nauth_users{status="active"} 12\nmedia_files 7\ngateway_requests_total{route="web",status="2xx"} 10\ngateway_request_duration_ms_bucket{route="web",le="50"} 8\ngateway_request_duration_ms_bucket{route="web",le="+Inf"} 10\ngateway_request_duration_ms_count{route="web"} 10\ngateway_rejected_total{reason="rate_limited"} 2\naudit_events_total 42\naudit_events_by_source{source="auth"} 40\naudit_events_received_last_hour 5\naudit_chain_head_seq 42\naudit_db_bytes 8192\nshortlink_links{state="active"} 9\nshortlink_links{state="inactive"} 1\nshortlink_clicks_total 120\nshortlink_clicks_last_hour 4\nflags_total{state="active"} 3\nflags_total{state="archived"} 1\nflags_enabled{env="prod"} 2\nflags_evaluations_total{env="prod"} 77\n');
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
    if (p === '/files/f1/thumb') return res.writeHead(200, { 'content-type': 'image/webp', 'content-length': '3', 'content-disposition': 'inline; filename="a-thumb.webp"' }).end('img');
    if (p === '/v1/files/f2/urls') return json(200, { urls: { original: { url: `http://127.0.0.1:${/** @type {any} */ (fake.address()).port}/files/f2/original?exp=1&sig=x` } } });
    if (p === '/files/f2/original') return res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-disposition': 'inline; filename="evil.svg"' }).end('<svg onload="alert(1)"/>');
    if (p === '/v1/files/f1' && req.method === 'DELETE') return res.writeHead(204).end();
    if (p === '/v1/uploads') return json(201, { token: 't', uploadUrl: 'https://media/v1/uploads/t' });
    if (p === '/v1/events' && req.method === 'GET') return json(200, { items: [{ id: 'e1', seq: 42, action: 'auth.login', outcome: 'failure', source: 'auth' }], nextCursor: null });
    if (p === '/v1/events/export') return res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'content-disposition': 'attachment; filename="audit-x.ndjson"' }).end('{"seq":1}\n{"seq":2}\n');
    if (p === '/v1/events/e1') return json(200, { event: { id: 'e1', seq: 42, action: 'auth.login', meta: { k: 1 } } });
    if (p === '/v1/stats' && String(req.headers.authorization).endsWith('f'.repeat(40))) return json(200, { flags: { total: 4, archived: 1 }, environments: [{ env: 'prod', version: 5, enabled: 2, evaluations: 77 }] });
    if (p === '/v1/stats' && String(req.headers.authorization).endsWith('s'.repeat(40))) return json(200, { days: 7, links: { total: 10, active: 9, clicks: 120 }, clicksInWindow: 40, topLinks: [] });
    if (p === '/v1/stats') return json(200, { windowHours: 24, total: 42, byOutcome: { success: 40, failure: 2 }, bySource: [], topActions: [], topActors: [], topFailures: [] });
    if (p === '/v1/chain/head') return json(200, { seq: 42, hash: 'ab'.repeat(32) });
    if (p === '/v1/chain/verify') return json(200, { ok: true, checked: 42, fromSeq: 1, toSeq: 42, firstBroken: null, head: { seq: 42, hash: 'ab'.repeat(32) } });
    if (p === '/v1/links' && req.method === 'GET') return json(200, { items: [{ code: 'abc1234', url: 'https://example.com', status: 'active' }], nextCursor: null });
    if (p === '/v1/links' && req.method === 'POST') return json(201, { link: { code: 'new1234', url: JSON.parse(body).url, status: 'active' } });
    if (p === '/v1/links/abc1234' && req.method === 'GET') return json(200, { link: { code: 'abc1234', url: 'https://example.com', clicks: 3 } });
    if (p === '/v1/links/abc1234/stats') return json(200, { code: 'abc1234', total: 3, clicks: 3, visitors: 2, bots: 0, byDay: [], byReferrer: [], byDevice: {}, recent: [] });
    if (p === '/v1/links/abc1234' && req.method === 'PATCH') return json(200, { link: { code: 'abc1234', enabled: false, status: 'disabled' } });
    if (p === '/v1/links/abc1234' && req.method === 'DELETE') return res.writeHead(204).end();
    if (p === '/v1/links/abc1234/qr') return res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (p === '/v1/environments') return json(200, { items: [{ env: 'dev', version: 1 }, { env: 'prod', version: 5 }] });
    if (p === '/v1/flags' && req.method === 'GET') return json(200, { items: [{ key: 'checkout.new', kind: 'boolean', environments: { prod: { enabled: true } } }], nextCursor: null });
    if (p === '/v1/flags' && req.method === 'POST') return json(201, { flag: { key: JSON.parse(body).key, kind: 'boolean' } });
    if (p === '/v1/flags/checkout.new' && req.method === 'GET') return json(200, { flag: { key: 'checkout.new', kind: 'boolean', environments: {} } });
    if (p === '/v1/flags/checkout.new/history') return json(200, { items: [{ id: 3, action: 'env.update' }], nextBefore: null });
    if (p === '/v1/flags/checkout.new' && req.method === 'PATCH') return json(200, { flag: { key: 'checkout.new', archived: true } });
    if (p === '/v1/flags/checkout.new' && req.method === 'DELETE') return res.writeHead(204).end();
    if (p === '/v1/flags/checkout.new/envs/prod' && req.method === 'PATCH') return json(200, { env: 'prod', state: { enabled: true, percentage: 25 } });
    if (p === '/v1/flags/checkout.new/envs/staging/copy') return json(200, { env: 'prod', state: { enabled: true } });
    if (p === '/v1/evaluate' && req.method === 'POST') return json(200, { env: 'prod', version: 5, flags: { 'checkout.new': { value: true, reason: 'rule', ruleId: 'staff' } } });
    if (p === '/v1/users' && req.method === 'POST') return json(409, { error: { code: 'EMAIL_TAKEN', message: 'exists' } });
    json(404, { error: { code: 'NOT_FOUND', message: 'nope' } });
  });
});
const pub = mkdtempSync(join(tmpdir(), 'console-public-'));
mkdirSync(join(pub, 'assets'));
writeFileSync(join(pub, 'index.html'), '<!doctype html><title>console</title><script>try{document.documentElement.dataset.theme="dark"}catch{}</script><script type="module" src="/assets/app-abc123def.js"></script>');
writeFileSync(join(pub, 'assets', 'app-abc123def.js'), 'console.log(1)');
writeFileSync(join(pub, 'sw.js'), '// sw');

/** @type {Awaited<ReturnType<typeof testConsole>>} */
let t;
let origin = '';
before(async () => {
  await new Promise((r) => fake.listen(0, '127.0.0.1', () => r(undefined)));
  origin = `http://127.0.0.1:${/** @type {any} */ (fake.address()).port}`;
  t = await testConsole({ urls: { notify: origin, auth: origin, media: origin, gateway: origin, audit: origin, shortlink: origin, flags: origin }, publicDir: pub });
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
  assert.equal(items.length, 7);
  assert.deepEqual(items.find((/** @type {any} */ i) => i.id === 'flags').summary.enabledByEnv, { prod: 2 });
  assert.equal(items.find((/** @type {any} */ i) => i.id === 'shortlink').summary.activeLinks, 9);
  const audit = items.find((/** @type {any} */ i) => i.id === 'audit');
  assert.equal(audit.summary.total, 42);
  assert.equal(audit.summary.headSeq, 42);
  assert.deepEqual(audit.summary.bySource, { auth: 40 });
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
  assert.match(String(res.headers['content-security-policy']), /sandbox/);
  const svg = await t.app.inject({ url: '/api/services/media/media/files/f2/bytes/original', headers: { cookie } });
  assert.equal(svg.statusCode, 200);
  assert.equal(svg.headers['content-type'], 'application/octet-stream', 'non-raster types are neutralised');
  assert.match(String(svg.headers['content-disposition']), /^attachment/);
  const page = await t.app.inject('/');
  assert.match(String(page.headers['content-security-policy']), /script-src 'self' 'sha256-[A-Za-z0-9+/=]{44}'; style-src/, 'inline theme script is hashed, module script is not');
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

test('PATCH /api/services/:sid/settings writes polling to services.json, audited, admin only', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { ServiceRegistry } = await import('../src/services/registry.js');
  const { servicesDoc, servicesEnv } = await import('./helpers.js');
  const dir = mkdtempSync(join(tmpdir(), 'console-settings-'));
  try {
    const path = join(dir, 'services.json');
    writeFileSync(path, JSON.stringify(servicesDoc({ notify: origin })));
    t.clients.registry = ServiceRegistry.load(path, servicesEnv);
    const { cookie } = await signIn(t);
    const viewer = await signIn(t, { email: 'viewer2@console.local', role: 'viewer' });
    let res = await t.app.inject({ method: 'PATCH', url: '/api/services/notify/settings', headers: { cookie: viewer.cookie, ...CSRF }, payload: { polling: { enabled: true, intervalSec: 30 } } });
    assert.equal(res.statusCode, 403);
    res = await t.app.inject({ method: 'PATCH', url: '/api/services/notify/settings', headers: { cookie, ...CSRF }, payload: { polling: { enabled: true, intervalSec: 2 } } });
    assert.equal(res.statusCode, 400);
    res = await t.app.inject({ method: 'PATCH', url: '/api/services/notify/settings', headers: { cookie, ...CSRF }, payload: { polling: { enabled: true, intervalSec: 60 } } });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json().service.polling, { enabled: true, intervalSec: 60 });
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).services[0].polling, { enabled: true, intervalSec: 60 });
    assert.deepEqual((await t.app.inject({ url: '/api/services', headers: { cookie } })).json().items[0].polling, { enabled: true, intervalSec: 60 });
    assert.equal((await t.app.inject({ method: 'PATCH', url: '/api/services/nope/settings', headers: { cookie, ...CSRF }, payload: { polling: { enabled: false, intervalSec: 30 } } })).statusCode, 404);
    const audit = await t.app.inject({ url: '/api/audit?action=service.', headers: { cookie } });
    assert.equal(audit.json().items[0].action, 'service.settings.update');
    assert.equal(audit.json().items[0].target, 'notify');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('audit service: events with filters, detail, stats, chain, streamed export (audited)', async () => {
  const { cookie } = await signIn(t);
  seen.length = 0;
  let res = await t.app.inject({ url: '/api/services/audit/audit/events?actionPrefix=auth.&outcome=failure&limit=100', headers: { cookie } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().items[0].id, 'e1');
  assert.equal(seen.at(-1)?.url, '/v1/events?actionPrefix=auth.&outcome=failure&limit=100');
  assert.equal(seen.at(-1)?.headers.authorization, `Bearer ${'d'.repeat(40)}`, 'audit key injected');
  assert.equal((await t.app.inject({ url: '/api/services/audit/audit/events?bogus=1', headers: { cookie } })).statusCode, 400, 'unknown filters rejected');
  assert.equal((await t.app.inject({ url: '/api/services/audit/audit/events/e1', headers: { cookie } })).json().event.meta.k, 1);
  res = await t.app.inject({ url: '/api/services/audit/audit/stats?hours=24', headers: { cookie } });
  assert.equal(res.json().total, 42);
  assert.equal(seen.at(-1)?.url, '/v1/stats?hours=24');
  assert.equal((await t.app.inject({ url: '/api/services/audit/audit/chain/head', headers: { cookie } })).json().seq, 42);
  res = await t.app.inject({ url: '/api/services/audit/audit/chain/verify?fromSeq=1', headers: { cookie } });
  assert.equal(res.json().ok, true);
  res = await t.app.inject({ url: '/api/services/audit/audit/events/export?format=csv&source=auth', headers: { cookie } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(seen.at(-1)?.url, '/v1/events/export?source=auth&format=csv');
  assert.equal(res.body, '{"seq":1}\n{"seq":2}\n', 'body streamed through');
  assert.match(String(res.headers['content-disposition']), /^attachment/);
  assert.match(String(res.headers['content-security-policy']), /sandbox/);
  const log = await t.app.inject({ url: '/api/audit?action=audit.', headers: { cookie } });
  assert.deepEqual(log.json().items.map((/** @type {any} */ e) => e.action).slice(0, 2), ['audit.events.export', 'audit.chain.verify']);
  assert.deepEqual(log.json().items[0].meta, { format: 'csv', filter: { source: 'auth' } });
  assert.equal((await t.app.inject({ url: '/api/services/notify/audit/events', headers: { cookie } })).statusCode, 404, 'wrong service type');
});

test('shortlink: list, create, detail with stats, patch, delete, QR proxy, overview', async () => {
  const { cookie } = await signIn(t);
  const viewer = await signIn(t, { email: 'viewer3@console.local', role: 'viewer' });
  seen.length = 0;
  let res = await t.app.inject({ url: '/api/services/shortlink/shortlink/links?status=active&q=example&limit=100', headers: { cookie } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().items[0].code, 'abc1234');
  assert.equal(seen.at(-1)?.url, '/v1/links?q=example&status=active&limit=100');
  assert.equal(seen.at(-1)?.headers.authorization, `Bearer ${'s'.repeat(40)}`);
  res = await t.app.inject({ method: 'POST', url: '/api/services/shortlink/shortlink/links', headers: { cookie: viewer.cookie, ...CSRF }, payload: { url: 'https://example.com/x' } });
  assert.equal(res.statusCode, 403, 'viewer cannot create');
  res = await t.app.inject({ method: 'POST', url: '/api/services/shortlink/shortlink/links', headers: { cookie, ...CSRF }, payload: { url: 'https://example.com/x', tags: ['a'], expiresAt: null } });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().link.code, 'new1234');
  res = await t.app.inject({ url: '/api/services/shortlink/shortlink/links/abc1234?days=7', headers: { cookie } });
  assert.equal(res.json().link.clicks, 3);
  assert.equal(res.json().stats.visitors, 2);
  assert.ok(seen.some((x) => x.url === '/v1/links/abc1234/stats?days=7'));
  res = await t.app.inject({ method: 'PATCH', url: '/api/services/shortlink/shortlink/links/abc1234', headers: { cookie, ...CSRF }, payload: { enabled: false } });
  assert.equal(res.json().link.status, 'disabled');
  assert.equal((await t.app.inject({ method: 'DELETE', url: '/api/services/shortlink/shortlink/links/abc1234', headers: { cookie, ...CSRF } })).statusCode, 204);
  res = await t.app.inject({ url: '/api/services/shortlink/shortlink/links/abc1234/qr.png?scale=6', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.equal(res.rawPayload[0], 0x89);
  assert.equal(seen.at(-1)?.url, '/v1/links/abc1234/qr?format=png&scale=6');
  assert.match(String(res.headers['content-security-policy']), /sandbox/);
  res = await t.app.inject({ url: '/api/services/shortlink/shortlink/stats?days=7', headers: { cookie } });
  assert.equal(res.json().links.active, 9);
  const log = await t.app.inject({ url: '/api/audit?action=shortlink.', headers: { cookie } });
  assert.deepEqual(log.json().items.map((/** @type {any} */ e) => e.action).slice(0, 3), ['shortlink.link.delete', 'shortlink.link.update', 'shortlink.link.create']);
  assert.equal(log.json().items[2].target, 'new1234');
});

test('flags: environments, list, create, detail with history, env patch, copy, evaluate, delete', async () => {
  const { cookie } = await signIn(t);
  const viewer = await signIn(t, { email: 'viewer4@console.local', role: 'viewer' });
  seen.length = 0;
  let res = await t.app.inject({ url: '/api/services/flags/flags/environments', headers: { cookie } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().items[1].env, 'prod');
  assert.equal(seen.at(-1)?.headers.authorization, `Bearer ${'f'.repeat(40)}`);
  res = await t.app.inject({ url: '/api/services/flags/flags/flags?archived=false&q=check', headers: { cookie } });
  assert.equal(res.json().items[0].key, 'checkout.new');
  assert.equal(seen.at(-1)?.url, '/v1/flags?q=check&archived=false');
  assert.equal((await t.app.inject({ method: 'POST', url: '/api/services/flags/flags/flags', headers: { cookie: viewer.cookie, ...CSRF }, payload: { key: 'x.y', kind: 'boolean' } })).statusCode, 403);
  res = await t.app.inject({ method: 'POST', url: '/api/services/flags/flags/flags', headers: { cookie, ...CSRF }, payload: { key: 'x.y', kind: 'boolean', value: true, offValue: false, tags: ['t'] } });
  assert.equal(res.statusCode, 201, res.body);
  res = await t.app.inject({ url: '/api/services/flags/flags/flags/checkout.new', headers: { cookie } });
  assert.equal(res.json().flag.key, 'checkout.new');
  assert.equal(res.json().history[0].action, 'env.update');
  res = await t.app.inject({ method: 'PATCH', url: '/api/services/flags/flags/flags/checkout.new/envs/prod', headers: { cookie, ...CSRF }, payload: { enabled: true, percentage: 25, rules: [] } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().state.percentage, 25);
  res = await t.app.inject({ method: 'POST', url: '/api/services/flags/flags/flags/checkout.new/envs/staging/copy', headers: { cookie, ...CSRF }, payload: { to: 'prod' } });
  assert.equal(res.statusCode, 200, res.body);
  res = await t.app.inject({ method: 'POST', url: '/api/services/flags/flags/evaluate', headers: { cookie: viewer.cookie, ...CSRF }, payload: { env: 'prod', context: { email: 'a@b.c' }, keys: ['checkout.new'] } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().flags['checkout.new'].ruleId, 'staff');
  assert.equal(JSON.parse(seen.at(-1)?.body ?? '{}').details, true);
  assert.equal((await t.app.inject({ method: 'PATCH', url: '/api/services/flags/flags/flags/checkout.new', headers: { cookie, ...CSRF }, payload: { archived: true } })).json().flag.archived, true);
  assert.equal((await t.app.inject({ method: 'DELETE', url: '/api/services/flags/flags/flags/checkout.new', headers: { cookie, ...CSRF } })).statusCode, 204);
  res = await t.app.inject({ url: '/api/services/flags/flags/stats', headers: { cookie } });
  assert.equal(res.json().environments[0].evaluations, 77);
  const log = await t.app.inject({ url: '/api/audit?action=flags.', headers: { cookie } });
  assert.deepEqual(log.json().items.map((/** @type {any} */ e) => e.action).slice(0, 5), ['flags.flag.delete', 'flags.flag.update', 'flags.env.copy', 'flags.env.update', 'flags.flag.create']);
  assert.deepEqual(log.json().items[2].meta, { service: 'flags', from: 'staging', to: 'prod' });
});
