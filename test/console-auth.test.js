import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Totp } from '../src/crypto/totp.js';
import { ConsoleAuth } from '../src/domain/console-auth.js';
import { ConsoleError } from '../src/domain/errors.js';
import { ADMIN_PASSWORD, testConsole } from './helpers.js';

const ctx = { ip: '203.0.113.9', userAgent: 'test' };
/** @param {Promise<unknown>} p @param {string} code */
const rejectsWith = (p, code) => assert.rejects(p, (e) => e instanceof ConsoleError && e.code === code ? true : (console.error(e), false));

test('login, session resolution, idle and absolute expiry, logout', async () => {
  const t = await testConsole({ env: { CONSOLE_SESSION_TTL_MIN: '60', CONSOLE_SESSION_IDLE_MIN: '10' } });
  await t.adminService.create({ email: 'a@console.local', name: 'A', password: ADMIN_PASSWORD, role: 'admin' }, null, ctx);
  await rejectsWith(t.auth.login({ email: 'a@console.local', password: 'wrong password!!' }, ctx), 'INVALID_CREDENTIALS');
  await rejectsWith(t.auth.login({ email: 'nobody@console.local', password: ADMIN_PASSWORD }, ctx), 'INVALID_CREDENTIALS');
  const { token, totpRequired } = await t.auth.login({ email: 'A@console.local', password: ADMIN_PASSWORD }, ctx);
  assert.equal(totpRequired, false);
  const resolved = t.auth.resolve(token);
  assert.equal(resolved?.admin.email, 'a@console.local');
  assert.equal(t.auth.resolve('nope'), null);
  assert.equal(t.auth.resolve(undefined), null);

  t.clock.now += 9 * 60_000;
  assert.ok(t.auth.resolve(token), 'still within idle window');
  t.clock.now += 11 * 60_000;
  assert.equal(t.auth.resolve(token), null, 'idle timeout');

  const second = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  for (let i = 0; i < 6; i++) { t.clock.now += 9 * 60_000; assert.ok(t.auth.resolve(second.token), `keep-alive ${i}`); }
  t.clock.now += 9 * 60_000;
  assert.equal(t.auth.resolve(second.token), null, 'absolute 60 min ttl reached at 63 min');

  const third = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  const r = /** @type {NonNullable<ReturnType<typeof t.auth.resolve>>} */ (t.auth.resolve(third.token));
  t.auth.logout(r.session, r.admin, ctx);
  assert.equal(t.auth.resolve(third.token), null);
  const types = t.audit.list({ limit: 20 }).map((e) => e.action);
  assert.ok(types.includes('logout') && types.includes('login.succeeded') && types.includes('login.failed'));
});

test('lockout after repeated failures, disabled accounts refused', async () => {
  const t = await testConsole({ env: { CONSOLE_LOGIN_MAX_FAILURES: '3', CONSOLE_LOGIN_LOCKOUT_MIN: '15' } });
  const a = await t.adminService.create({ email: 'a@console.local', name: 'A', password: ADMIN_PASSWORD, role: 'admin' }, null, ctx);
  for (let i = 0; i < 3; i++) await rejectsWith(t.auth.login({ email: 'a@console.local', password: 'wrong password!!' }, ctx), 'INVALID_CREDENTIALS');
  const locked = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx).catch((e) => e);
  assert.equal(locked.code, 'ACCOUNT_LOCKED');
  assert.ok(locked.details.retryAfterSec <= 900);
  t.clock.now += 15 * 60_000 + 1;
  await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  await t.adminService.create({ email: 'b@console.local', name: 'B', password: ADMIN_PASSWORD, role: 'admin' }, null, ctx);
  const actor = /** @type {any} */ (t.admins.byEmail('b@console.local'));
  t.adminService.update(a.id, { status: 'disabled' }, actor, ctx);
  await rejectsWith(t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx), 'ACCOUNT_DISABLED');
});

test('TOTP enrolment, second step, replay refusal, disable', async () => {
  const t = await testConsole();
  await t.adminService.create({ email: 'a@console.local', name: 'A', password: ADMIN_PASSWORD, role: 'admin' }, null, ctx);
  let admin = /** @type {any} */ (t.admins.byEmail('a@console.local'));
  const { secret, uri } = t.auth.startTotp(admin);
  assert.match(uri, /^otpauth:\/\/totp\/test%20console%3Aa%40console\.local\?secret=/);
  assert.equal(t.auth.resolve((await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx)).token)?.admin.email, 'a@console.local', 'not enforced before confirmation');
  assert.throws(() => t.auth.confirmTotp(admin, '000000', ctx), (e) => e instanceof ConsoleError && e.code === 'INVALID_TOTP');
  const step = Math.floor(t.clock.now / 1000 / 30);
  t.auth.confirmTotp(admin, Totp.code(secret, step), ctx);
  admin = t.admins.byId(admin.id);
  assert.ok(admin.totp_enabled_at);

  const login = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  assert.equal(login.totpRequired, true);
  const pending = /** @type {NonNullable<ReturnType<typeof t.auth.resolve>>} */ (t.auth.resolve(login.token));
  assert.equal(pending.session.totp_pending, 1);
  t.clock.now += 60_000;
  const step2 = Math.floor(t.clock.now / 1000 / 30);
  assert.throws(() => t.auth.completeTotp(pending.session, '123456', ctx), (e) => e instanceof ConsoleError && e.code === 'INVALID_TOTP');
  t.auth.completeTotp(pending.session, Totp.code(secret, step2), ctx);
  assert.equal(t.auth.resolve(login.token)?.session.totp_pending, 0);

  const login2 = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  const pending2 = /** @type {NonNullable<ReturnType<typeof t.auth.resolve>>} */ (t.auth.resolve(login2.token));
  assert.throws(() => t.auth.completeTotp(pending2.session, Totp.code(secret, step2), ctx), (e) => e instanceof ConsoleError && e.code === 'INVALID_TOTP', 'same code cannot be replayed');

  await rejectsWith(t.auth.disableTotp(admin, { password: 'wrong password!!', code: Totp.code(secret, step2 + 1) }, ctx), 'INVALID_CREDENTIALS');
  t.clock.now += 30_000;
  await t.auth.disableTotp(admin, { password: ADMIN_PASSWORD, code: Totp.code(secret, Math.floor(t.clock.now / 1000 / 30)) }, ctx);
  assert.equal(t.admins.byId(admin.id)?.totp_secret, null);
  assert.equal((await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx)).totpRequired, false);
});

test('password change keeps the current session and drops the others; policy enforced', async () => {
  const t = await testConsole();
  await t.adminService.create({ email: 'a@console.local', name: 'A', password: ADMIN_PASSWORD, role: 'admin' }, null, ctx);
  const s1 = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  const s2 = await t.auth.login({ email: 'a@console.local', password: ADMIN_PASSWORD }, ctx);
  const r1 = /** @type {NonNullable<ReturnType<typeof t.auth.resolve>>} */ (t.auth.resolve(s1.token));
  assert.equal(t.auth.listSessions(r1.admin, r1.session).length, 2);
  await rejectsWith(t.auth.changePassword(r1.admin, r1.session, { currentPassword: 'nope nope nope!', newPassword: 'another very long one' }, ctx), 'INVALID_CREDENTIALS');
  await rejectsWith(t.auth.changePassword(r1.admin, r1.session, { currentPassword: ADMIN_PASSWORD, newPassword: 'short' }, ctx), 'WEAK_PASSWORD');
  await rejectsWith(t.auth.changePassword(r1.admin, r1.session, { currentPassword: ADMIN_PASSWORD, newPassword: 'aaaaaaaaaaaaaa' }, ctx), 'WEAK_PASSWORD');
  assert.throws(() => ConsoleAuth.assertPassword('alice has a long password', 'alice@console.local'), (e) => e instanceof ConsoleError && e.code === 'WEAK_PASSWORD', 'email local part refused');
  await t.auth.changePassword(r1.admin, r1.session, { currentPassword: ADMIN_PASSWORD, newPassword: 'another very long one' }, ctx);
  assert.ok(t.auth.resolve(s1.token));
  assert.equal(t.auth.resolve(s2.token), null);
  await t.auth.login({ email: 'a@console.local', password: 'another very long one' }, ctx);
});

test('AdminService protects the last active administrator and self-demotion', async () => {
  const t = await testConsole();
  const root = await t.adminService.create({ email: 'root@console.local', name: 'Root', password: ADMIN_PASSWORD, role: 'admin' }, null, ctx);
  const actor = /** @type {any} */ (t.admins.byId(root.id));
  await rejectsWith(t.adminService.create({ email: 'root@console.local', name: 'Dup', password: ADMIN_PASSWORD, role: 'viewer' }, actor, ctx), 'EMAIL_TAKEN');
  await rejectsWith(t.adminService.create({ email: 'not-an-email', name: 'x', password: ADMIN_PASSWORD, role: 'viewer' }, actor, ctx), 'INVALID_ARGUMENT');
  const v = await t.adminService.create({ email: 'v@console.local', name: 'V', password: ADMIN_PASSWORD, role: 'viewer' }, actor, ctx);
  assert.throws(() => t.adminService.update(root.id, { role: 'viewer' }, actor, ctx), (e) => e instanceof ConsoleError && (e.code === 'LAST_ADMIN' || e.code === 'CONFLICT'));
  assert.throws(() => t.adminService.remove(root.id, actor, ctx), (e) => e instanceof ConsoleError && e.code === 'CONFLICT');
  t.adminService.update(v.id, { role: 'admin', name: 'Vee' }, actor, ctx);
  assert.equal(t.admins.byId(v.id)?.role, 'admin');
  assert.equal(t.admins.byId(v.id)?.name, 'Vee');
  const vActor = /** @type {any} */ (t.admins.byId(v.id));
  t.adminService.update(root.id, { role: 'viewer' }, vActor, ctx);
  assert.throws(() => t.adminService.update(v.id, { status: 'disabled' }, vActor, ctx), (e) => e instanceof ConsoleError && (e.code === 'CONFLICT' || e.code === 'LAST_ADMIN'));
  await t.adminService.resetPassword(root.id, 'reset to something long', vActor, ctx);
  await t.auth.login({ email: 'root@console.local', password: 'reset to something long' }, ctx);
  t.adminService.remove(root.id, vActor, ctx);
  assert.equal(t.admins.byId(root.id), undefined);
  assert.ok(t.audit.list({ limit: 50, action: 'admin.' }).length >= 5);
});
