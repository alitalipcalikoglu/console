import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { SecretBox } from '@atc-web/service-core/secrets';
import { Config, ConfigError } from '../src/config.js';
import { Totp } from '../src/crypto/totp.js';
import { TotpKeyring } from '../src/crypto/totp-keyring.js';
import { ServiceRegistry } from '../src/services/registry.js';
import { AdminStore } from '../src/store/admin-store.js';
import { AuditStore } from '../src/store/audit-store.js';
import { SessionStore } from '../src/store/session-store.js';
import { servicesDoc, servicesEnv, testConfig, testDb, testRegistry } from './helpers.js';

test('Config defaults and validation', () => {
  const c = testConfig();
  assert.equal(c.port, 3004);
  assert.equal(c.sessionTtlMin, 720);
  assert.equal(c.cookieSecure, false);
  assert.equal(Config.fromEnv({}).cookieSecure, true, 'secure cookies by default');
  for (const o of [{ TLS_CERT_PATH: '/c' }, { CONSOLE_SESSION_IDLE_MIN: '999999' }, { PORT: 'x' }, { SCRYPT_LOG_N: '10' }]) {
    assert.throws(() => Config.fromEnv(o), ConfigError, JSON.stringify(o));
  }
});

test('Totp generates RFC 6238 codes, tolerates one step of drift, rejects garbage', () => {
  // RFC 6238 test vector: secret "12345678901234567890", T=59 → 287082 (SHA-1, 8 digits → last 6 = 287082 % 10^6 = 287082)
  const secret = Totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(Totp.code(secret, Math.floor(59 / 30)), '287082');
  assert.equal(Totp.code(secret, Math.floor(1111111109 / 30)), '081804');
  const now = 1_111_111_109_000;
  assert.equal(Totp.verify(secret, '081804', now), Math.floor(1111111109 / 30));
  assert.equal(Totp.verify(secret, Totp.code(secret, Math.floor(1111111109 / 30) - 1), now), Math.floor(1111111109 / 30) - 1, 'previous step accepted');
  assert.equal(Totp.verify(secret, Totp.code(secret, Math.floor(1111111109 / 30) + 5), now), null, 'far future rejected');
  assert.equal(Totp.verify(secret, '12345', now), null);
  assert.equal(Totp.verify(secret, 'abcdef', now), null);
  assert.match(Totp.generateSecret(), /^[A-Z2-7]{32}$/);
  assert.equal(Totp.uri({ secret: 'ABC', account: 'ali@example.com', issuer: 'atc console' }), 'otpauth://totp/atc%20console%3Aali%40example.com?secret=ABC&issuer=atc%20console&algorithm=SHA1&digits=6&period=30');
  assert.ok(Totp.base32Decode('gezd gnbv-gy3tqojq').equals(Buffer.from('1234567890')));
});

test('AdminStore: create, lookup, lockout, TOTP enrolment flags, admin count', () => {
  const db = testDb();
  const keyring = new TotpKeyring({ current: randomBytes(32) });
  const admins = new AdminStore(db, keyring);
  const a = admins.create({ email: ' Ali@Example.com ', name: ' Ali ', passwordHash: 'h', role: 'admin' }, 1000);
  assert.equal(a.email, 'ali@example.com');
  assert.equal(a.name, 'Ali');
  assert.equal(admins.byEmail('ALI@example.com')?.id, a.id);
  assert.throws(() => admins.create({ email: 'ali@example.com', name: 'x', passwordHash: 'h', role: 'viewer' }), /UNIQUE/);
  const v = admins.create({ email: 'v@example.com', name: 'V', passwordHash: 'h', role: 'viewer' }, 2000);
  assert.equal(admins.all().length, 2);
  assert.equal(admins.activeAdminCount(), 1);
  admins.setRole(v.id, 'admin');
  assert.equal(admins.activeAdminCount(), 2);
  admins.setStatus(v.id, 'disabled');
  assert.equal(admins.activeAdminCount(), 1);

  let r = admins.recordLoginFailure(a.id, { maxFailures: 2, lockoutMs: 1000, now: 10 });
  assert.deepEqual({ ...r }, { failed_logins: 1, locked_until: null });
  r = admins.recordLoginFailure(a.id, { maxFailures: 2, lockoutMs: 1000, now: 10 });
  assert.deepEqual({ ...r }, { failed_logins: 2, locked_until: 1010 });
  admins.recordLoginSuccess(a.id, 20);
  assert.equal(admins.byId(a.id)?.last_login_at, 20);
  assert.equal(admins.byId(a.id)?.locked_until, null);

  admins.setTotpSecret(a.id, 'SECRET');
  const stored = admins.byId(a.id)?.totp_secret;
  assert.ok(stored && SecretBox.isSealed(stored), 'stored sealed, not plaintext');
  assert.equal(keyring.open(/** @type {string} */ (stored)), 'SECRET');
  assert.equal(admins.byId(a.id)?.totp_enabled_at, null, 'enrolling, not enabled');
  assert.throws(() => new AdminStore(db, null).setTotpSecret(a.id, 'X'), /TotpKeyring/, 'without a keyring, enrolment refuses rather than storing plaintext');
  assert.equal(admins.enableTotp(a.id, 30), true);
  assert.equal(admins.byId(a.id)?.totp_enabled_at, 30);
  admins.disableTotp(a.id);
  assert.equal(admins.byId(a.id)?.totp_secret, null);
  assert.equal(admins.enableTotp(a.id), false, 'cannot enable without a secret');
  assert.equal(admins.remove(v.id), true);
  assert.equal(admins.remove(v.id), false);
});

test('SessionStore: opaque tokens, TOTP pending flag, replay guard, purge by expiry and idleness', () => {
  const db = testDb();
  const admins = new AdminStore(db);
  const sessions = new SessionStore(db);
  const a = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' });
  const { session, token } = sessions.create({ adminId: a.id, ttlMs: 1000, totpPending: true, ip: '1.2.3.4', userAgent: 'ua' }, 0);
  assert.equal(session.totp_pending, 1);
  assert.equal(sessions.byToken(token)?.id, session.id);
  assert.equal(sessions.byToken('garbage'), undefined);
  assert.equal(sessions.forAdmin(a.id, 10).length, 0, 'pending sessions are not listed');
  sessions.completeTotp(session.id, 5);
  assert.equal(sessions.forAdmin(a.id, 10).length, 1);
  sessions.touch(session.id, 50);
  assert.equal(sessions.byToken(token)?.last_seen_at, 50);

  assert.equal(sessions.claimTotpStep(a.id, 100), true);
  assert.equal(sessions.claimTotpStep(a.id, 100), false, 'same code twice refused');

  const other = sessions.create({ adminId: a.id, ttlMs: 1000, totpPending: false, ip: null, userAgent: null }, 0);
  assert.equal(sessions.removeOthers(a.id, session.id), 1);
  assert.equal(sessions.byToken(other.token), undefined);
  assert.equal(sessions.purge(500, 40), 0, 'not expired (1000 > 500) and not idle (last seen 50 >= 40)');
  assert.equal(sessions.purge(500, 60), 1, 'idle: last seen 50 < 60');
  assert.equal(sessions.byToken(token), undefined);
});

test('AuditStore records and pages, filters by action prefix', () => {
  const audit = new AuditStore(testDb());
  audit.record({ adminId: 'a', adminEmail: 'a@b.co', action: 'login.succeeded', ip: '1.1.1.1' }, 1);
  audit.record({ adminId: 'a', adminEmail: 'a@b.co', action: 'auth.user.disable', target: 'u1', meta: { reason: 'x' } }, 2);
  audit.record({ action: 'login.failed', ip: '2.2.2.2' }, 3);
  const all = audit.list({ limit: 10 });
  assert.deepEqual(all.map((e) => e.action), ['login.failed', 'auth.user.disable', 'login.succeeded']);
  assert.deepEqual(audit.list({ limit: 10, action: 'login' }).map((e) => e.at), [3, 1]);
  assert.deepEqual(audit.list({ limit: 10, beforeId: all[0].id }).map((e) => e.at), [2, 1]);
  assert.deepEqual(JSON.parse(all[1].meta ?? ''), { reason: 'x' });
  assert.equal(audit.purge(3), 2);
});

test('ServiceRegistry parses, resolves secrets, rejects broken files', () => {
  const r = testRegistry({ auth: 'http://10.0.0.2:3002/' });
  assert.deepEqual(r.services.map((s) => s.id), ['notify', 'auth', 'media', 'gateway', 'audit', 'shortlink', 'flags', 'scheduler', 'webhooks', 'search', 'ratelimit', 'geo']);
  assert.equal(r.get('auth')?.url, 'http://10.0.0.2:3002');
  assert.equal(r.get('auth')?.apiKey, servicesEnv.AUTH_API_KEY);
  assert.equal(r.get('auth')?.label, 'Auth (prod)');
  assert.equal(r.get('gateway')?.apiKey, null);
  assert.equal(r.get('gateway')?.metricsToken, servicesEnv.GATEWAY_METRICS_TOKEN);
  assert.equal(r.ofType('media').length, 1);
  assert.equal('apiKey' in r.describe()[0], false, 'describe() has no secrets');
  assert.equal(r.describe()[3].hasMetrics, true);
  /** @param {(d: any) => void} mutate @param {NodeJS.ProcessEnv} [env] */
  const bad = (mutate, env = servicesEnv) => {
    const d = /** @type {any} */ (servicesDoc());
    mutate(d);
    assert.throws(() => ServiceRegistry.parse(d, env), ConfigError);
  };
  bad((d) => { d.services = []; });
  bad((d) => { d.services[0].type = 'redis'; });
  bad((d) => { d.services[0].url = 'http://h:1/path'; });
  bad((d) => { delete d.services[0].apiKeyEnv; });
  bad((d) => { d.services[0].apiKeyEnv = 'lower'; });
  bad((d) => { d.services[1].id = 'notify'; });
  bad((d) => { d.services[0].id = 'Notify'; });
  bad(() => {}, { ...servicesEnv, NOTIFY_API_KEY: 'short' });
  bad(() => {}, { ...servicesEnv, NOTIFY_API_KEY: undefined });
  assert.throws(() => ServiceRegistry.load('/nonexistent.json'), /cannot read/);
  const noMetrics = ServiceRegistry.parse({ services: [{ id: 'gw', type: 'gateway', url: 'http://h:1' }] }, {});
  assert.equal(noMetrics.describe()[0].hasMetrics, false);
});

test('ServiceRegistry polling setting: defaults, validation, update and atomic save round-trip', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'console-registry-'));
  try {
    const path = join(dir, 'services.json');
    const doc = /** @type {any} */ (servicesDoc());
    doc.services[0].polling = { enabled: true, intervalSec: 15 };
    doc.services[1].extraNote = 'kept as-is';
    writeFileSync(path, JSON.stringify(doc));
    const r = ServiceRegistry.load(path, servicesEnv);
    assert.deepEqual(r.get('notify')?.polling, { enabled: true, intervalSec: 15 });
    assert.deepEqual(r.get('auth')?.polling, { enabled: false, intervalSec: 30 }, 'default when absent');
    assert.deepEqual(r.describe()[0].polling, { enabled: true, intervalSec: 15 });
    r.updatePolling('auth', { enabled: true, intervalSec: 60 });
    assert.deepEqual(r.get('auth')?.polling, { enabled: true, intervalSec: 60 });
    r.save();
    const written = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(written.services[1].polling, { enabled: true, intervalSec: 60 });
    assert.equal(written.services[1].extraNote, 'kept as-is', 'unknown fields survive a save');
    assert.equal(written.services[1].apiKeyEnv, 'AUTH_API_KEY', 'secrets stay as env names');
    assert.equal(JSON.stringify(written).includes(servicesEnv.AUTH_API_KEY), false, 'no secret ever written');
    const reloaded = ServiceRegistry.load(path, servicesEnv);
    assert.deepEqual(reloaded.get('auth')?.polling, { enabled: true, intervalSec: 60 });
    assert.throws(() => r.updatePolling('auth', { enabled: true, intervalSec: 1 }), ConfigError);
    assert.throws(() => r.updatePolling('auth', { enabled: 'yes', intervalSec: 30 }), ConfigError);
    assert.throws(() => r.updatePolling('nope', { enabled: true, intervalSec: 30 }), ConfigError);
    assert.throws(() => ServiceRegistry.parse({ services: [{ id: 'a', type: 'gateway', url: 'http://h:1', polling: { intervalSec: 99999 } }] }, {}), ConfigError);
    assert.throws(() => new ServiceRegistry([]).save(), /not loaded from a file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
