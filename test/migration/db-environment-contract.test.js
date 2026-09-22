import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Config } from '../../src/config.js';
import { TotpKeyring } from '../../src/crypto/totp-keyring.js';
import { Database } from '../../src/db.js';
import { AdminStore } from '../../src/store/admin-store.js';
import { AuditStore } from '../../src/store/audit-store.js';
import { SessionStore } from '../../src/store/session-store.js';

const scratch = mkdtempSync(join(tmpdir(), 'console-m0-db-'));
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
after(() => rmSync(scratch, { recursive: true, force: true }));

test(`DB oracle: a current package (${PACKAGE_VERSION}) database reopens without schema or state drift`, () => {
  assert.match(PACKAGE_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  const path = join(scratch, 'compat.db');
  const keyring = new TotpKeyring({ current: Buffer.alloc(32, 7) });
  let db = new Database(path);
  let admins = new AdminStore(db, keyring);
  const admin = admins.create({ email: 'compat@migration.test', name: 'Compatibility', passwordHash: 'fixture-hash-not-a-secret', role: 'admin' }, 1_700_000_000_000);
  admins.setTotpSecret(admin.id, 'JBSWY3DPEHPK3PXP', 1_700_000_000_100);
  admins.enableTotp(admin.id, 1_700_000_000_200);
  const sessions = new SessionStore(db);
  const created = sessions.create({ adminId: admin.id, ttlMs: 60_000, totpPending: false, ip: '192.0.2.10', userAgent: 'migration-oracle' }, 1_700_000_000_300);
  new AuditStore(db).record({ adminId: admin.id, adminEmail: admin.email, action: 'fixture.created', target: 'compat', meta: { safe: true }, ip: '192.0.2.10' }, 1_700_000_000_400);
  const version = db.schemaVersion;
  assert.equal(version, 2);
  db.close();

  db = new Database(path);
  try {
    assert.equal(db.schemaVersion, version);
    admins = new AdminStore(db, keyring);
    const reopened = admins.byId(admin.id);
    assert.ok(reopened);
    assert.equal(reopened.email, 'compat@migration.test');
    assert.equal(reopened.totp_enabled_at, 1_700_000_000_200);
    const sealedSecret = reopened.totp_secret;
    if (typeof sealedSecret !== 'string') throw new Error('expected sealed TOTP metadata');
    assert.match(sealedSecret, /^v2\./);
    assert.equal(keyring.open(sealedSecret), 'JBSWY3DPEHPK3PXP');
    const reopenedSession = new SessionStore(db).byToken(created.token);
    assert.ok(reopenedSession);
    assert.equal(reopenedSession.admin_id, admin.id);
    const audit = new AuditStore(db).list({ limit: 10 });
    assert.deepEqual(audit.map((entry) => [entry.action, entry.target, entry.meta]), [['fixture.created', 'compat', '{"safe":true}']]);
    assert.deepEqual(
      db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((row) => ({ ...row })),
      [{ version: 1, name: 'v1' }, { version: 2, name: 'v2' }],
    );
  } finally {
    db.close();
  }
});

test('environment oracle: every documented variable is classified and defaults remain exact', () => {
  const inventory = JSON.parse(readFileSync(new URL('./fixtures/environment.json', import.meta.url), 'utf8'));
  const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
  assert.deepEqual(documented.sort(), Object.keys(inventory).sort());
  const config = Config.fromEnv({});
  assert.deepEqual({
    PORT: String(config.port), HOST: config.host, LOG_LEVEL: config.logLevel,
    TRUST_PROXY: String(config.trustProxy), COOKIE_SECURE: String(config.cookieSecure),
    DB_PATH: config.dbPath, SERVICES_FILE: config.servicesFile, PUBLIC_DIR: config.publicDir,
    AUDIT_RETENTION_DAYS: String(config.auditRetentionDays), CONSOLE_SESSION_TTL_MIN: String(config.sessionTtlMin),
    CONSOLE_SESSION_IDLE_MIN: String(config.sessionIdleMin), CONSOLE_LOGIN_MAX_FAILURES: String(config.loginMaxFailures),
    CONSOLE_LOGIN_LOCKOUT_MIN: String(config.loginLockoutMin), SCRYPT_LOG_N: String(config.scryptLogN),
    TOTP_ISSUER: config.totpIssuer, RATE_LIMIT_MAX: String(config.rateLimitMax), SERVICE_TIMEOUT_MS: String(config.serviceTimeoutMs),
  }, Object.fromEntries(Object.entries(inventory).filter(([, value]) => value.default !== undefined).map(([name, value]) => [name, value.default])));
  assert.equal(config.tls, null);
  assert.equal(config.dbBackupDir, undefined);
  assert.equal(config.secretsKey, null);
  assert.equal(config.secretsPreviousKey, null);
});
