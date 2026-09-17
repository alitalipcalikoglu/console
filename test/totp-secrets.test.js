import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ConfigError } from '@atc-web/service-core/config';
import { SecretBox } from '@atc-web/service-core/secrets';
import { Totp } from '../src/crypto/totp.js';
import { TotpKeyring } from '../src/crypto/totp-keyring.js';
import { Database } from '../src/db.js';
import { ConsoleAuth } from '../src/domain/console-auth.js';
import { AdminStore } from '../src/store/admin-store.js';
import { AuditStore } from '../src/store/audit-store.js';
import { SessionStore } from '../src/store/session-store.js';
import { PasswordHasher } from '../src/crypto/password.js';
import { silentLog } from './helpers.js';

const key1 = randomBytes(32);

/** @param {import('../src/db.js').Database} db @param {TotpKeyring|null} keyring @param {boolean} [strictSealing] */
function fullAuth(db, keyring, strictSealing = false) {
  const admins = new AdminStore(db, keyring);
  const sessions = new SessionStore(db);
  const audit = new AuditStore(db);
  const hasher = new PasswordHasher({ logN: 14 });
  return new ConsoleAuth({
    admins, sessions, audit, hasher, keyring, strictSealing, log: silentLog,
    options: { sessionTtlMs: 3_600_000, sessionIdleMs: 3_600_000, loginMaxFailures: 5, lockoutMs: 60_000, totpIssuer: 'test' },
  });
}

test('seal/unseal round trip through the real enrolment and verification path', () => {
  const db = new Database(':memory:');
  const keyring = new TotpKeyring({ current: key1 });
  const admins = new AdminStore(db, keyring);
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);

  const auth = fullAuth(db, keyring);
  const { secret } = auth.startTotp(admin);
  const stored = /** @type {string} */ (admins.byId(admin.id)?.totp_secret);
  assert.notEqual(stored, secret, 'the raw column is sealed, not the plaintext secret');
  assert.equal(SecretBox.isSealed(stored), true);
  assert.equal(keyring.open(stored), secret, 'opening it recovers the exact enrolled secret');
});

test('migration: plaintext rows from before Stage 4 are re-sealed at startup, idempotently, without ever losing or regenerating the secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'console-totp-migrate-'));
  const path = join(dir, 'console.db');
  try {
    // Simulate a pre-Stage-4 database: write totp_secret in plaintext, bypassing AdminStore's seal.
    const db1 = new Database(path);
    const admins1 = new AdminStore(db1, null);
    const admin = admins1.create({ email: 'legacy@b.co', name: 'Legacy', passwordHash: 'h', role: 'admin' }, 1000);
    db1.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?').run('LEGACYSECRETXYZ', admin.id);
    db1.close();

    const keyring = new TotpKeyring({ current: key1 });
    const db2 = new Database(path);
    const resealed = AdminStore.reseal(db2, keyring);
    assert.equal(resealed, 1);
    assert.equal(AdminStore.hasFullySealed(db2), true);
    const admins2 = new AdminStore(db2, keyring);
    const sealedNow = /** @type {string} */ (admins2.byId(admin.id)?.totp_secret);
    assert.equal(SecretBox.isSealed(sealedNow), true);
    assert.equal(keyring.open(sealedNow), 'LEGACYSECRETXYZ', 'exact original secret preserved, not regenerated');

    // Idempotent: running it again finds nothing left to reseal.
    assert.equal(AdminStore.reseal(db2, keyring), 0);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration refuses to start (ConfigError) when plaintext rows exist and SECRETS_KEY is missing -- never silently keeps plaintext or drops the secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'console-totp-nokey-'));
  const path = join(dir, 'console.db');
  try {
    const db1 = new Database(path);
    const admins1 = new AdminStore(db1, null);
    const admin = admins1.create({ email: 'legacy2@b.co', name: 'Legacy2', passwordHash: 'h', role: 'admin' }, 1000);
    db1.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?').run('STILLPLAINTEXT', admin.id);
    db1.close();

    const db2 = new Database(path);
    assert.throws(() => AdminStore.reseal(db2, null), ConfigError);
    // Refused -- the row is exactly as it was, not silently left running, not dropped, not regenerated.
    const raw = /** @type {any} */ (db2.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(admin.id)).totp_secret;
    assert.equal(raw, 'STILLPLAINTEXT');
    assert.equal(AdminStore.hasFullySealed(db2), false, 'the ratchet never flips on a refused reseal');
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration is a no-op (no ConfigError even without a keyring) when there is nothing to reseal, and it still marks the database fully sealed', () => {
  const db = new Database(':memory:');
  assert.equal(AdminStore.reseal(db, null), 0, 'a fresh install with zero TOTP rows never demands SECRETS_KEY');
  assert.equal(AdminStore.hasFullySealed(db), true, 'nothing to reseal counts as fully sealed too');
});

test('a legacy plaintext secret still verifies with no keyring configured, before the first successful reseal -- an incomplete migration never locks anyone out', () => {
  const db = new Database(':memory:');
  const admins = new AdminStore(db, null);
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  db.prepare('UPDATE admins SET totp_secret = ?, totp_enabled_at = ? WHERE id = ?').run('PLAINLEGACY', 500, admin.id);

  const auth = fullAuth(db, null, false); // strictSealing false: this database has never completed a reseal
  const now = Date.now();
  const step = Math.floor(now / 1000 / 30);
  const code = Totp.code('PLAINLEGACY', step);
  const session = { id: 's1', admin_id: admin.id, totp_pending: 1 };
  assert.doesNotThrow(() => auth.completeTotp(/** @type {any} */ (session), code, { ip: null, userAgent: null }));
});

test('after a successful reseal, a plaintext totp_secret is treated as corruption (TOTP_SECRET_CORRUPT), not a tolerated migration state', () => {
  const db = new Database(':memory:');
  const admins = new AdminStore(db, null);
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  AdminStore.reseal(db, null); // nothing to reseal yet -- marks fully sealed
  assert.equal(AdminStore.hasFullySealed(db), true);
  // Something (a bug, a bypassed write path) leaves a plaintext secret after that point.
  db.prepare('UPDATE admins SET totp_secret = ?, totp_enabled_at = ? WHERE id = ?').run('SHOULDNOTBEHERE', 500, admin.id);

  const auth = fullAuth(db, null, true); // strictSealing true
  const session = { id: 's1', admin_id: admin.id, totp_pending: 1 };
  assert.throws(
    () => auth.completeTotp(/** @type {any} */ (session), '123456', { ip: null, userAgent: null }),
    (/** @type {any} */ err) => err.code === 'TOTP_SECRET_CORRUPT' && err.statusCode === 500,
  );
});

test('a sealed secret throws TOTP_UNAVAILABLE (not a wrong-code failure) when the keyring is missing', () => {
  const db = new Database(':memory:');
  const keyring = new TotpKeyring({ current: key1 });
  const admins = new AdminStore(db, keyring);
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  admins.setTotpSecret(admin.id, 'REALSECRET', 1000);
  admins.enableTotp(admin.id, 1000);

  const authNoKeyring = fullAuth(db, null);
  const session = { id: 's1', admin_id: admin.id, totp_pending: 1 };
  assert.throws(
    () => authNoKeyring.completeTotp(/** @type {any} */ (session), '123456', { ip: null, userAgent: null }),
    (/** @type {any} */ err) => err.code === 'TOTP_UNAVAILABLE' && err.statusCode === 503,
  );
});

test('enrolment refuses (does not silently store plaintext) when SECRETS_KEY is not configured', () => {
  const db = new Database(':memory:');
  const admins = new AdminStore(db, null);
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  const auth = fullAuth(db, null);
  assert.throws(
    () => auth.startTotp(admin),
    (/** @type {any} */ err) => err.code === 'TOTP_UNAVAILABLE',
  );
  assert.equal(admins.byId(admin.id)?.totp_secret, null, 'nothing was written');
});

test('the raw database file never contains the plaintext secret after sealing (no leakage into backups either, same file)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'console-totp-leak-'));
  const path = join(dir, 'console.db');
  try {
    const db = new Database(path);
    const keyring = new TotpKeyring({ current: key1 });
    const admins = new AdminStore(db, keyring);
    const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
    const auth = fullAuth(db, keyring);
    const { secret } = auth.startTotp(admin);
    db.close();

    const bytes = readFileSync(path);
    assert.equal(bytes.includes(secret), false, 'the plaintext secret does not appear anywhere in the database file, including any WAL/page slack captured by a raw file read');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
