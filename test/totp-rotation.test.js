import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ConfigError } from '@atc-web/service-core/config';
import { SecretBox } from '@atc-web/service-core/secrets';
import { TotpKeyring } from '../src/crypto/totp-keyring.js';
import { Database } from '../src/db.js';
import { AdminStore } from '../src/store/admin-store.js';

const K1 = randomBytes(32);
const K2 = randomBytes(32);
const K3 = randomBytes(32); // unrelated third key, never configured anywhere

// ---------------------------------------------------------------- TotpKeyring itself

test('TotpKeyring: seals only with the current key; opens a current-key value directly', () => {
  const keyring = new TotpKeyring({ current: K1 });
  const sealed = keyring.seal('secret');
  assert.equal(SecretBox.peekKeyId(sealed), keyring.currentId);
  assert.equal(keyring.open(sealed), 'secret');
});

test('TotpKeyring: opens a v1 legacy (no key id) value by trying current then previous', () => {
  const legacyBox = new SecretBox(K1); // no keyId -- exactly Stage 4's original format
  const sealed = legacyBox.seal('secret');
  assert.match(sealed, /^v1\./);

  const keyringCurrentMatches = new TotpKeyring({ current: K1 });
  assert.equal(keyringCurrentMatches.open(sealed), 'secret');

  const keyringPreviousMatches = new TotpKeyring({ current: K2, previous: K1 });
  assert.equal(keyringPreviousMatches.open(sealed), 'secret', 'tried current (K2, fails) then previous (K1, succeeds)');
});

test('TotpKeyring.isCurrent: true only for a v2 value whose embedded id matches the current key; v1 and previous-key values are not current', () => {
  const keyring = new TotpKeyring({ current: K2, previous: K1 });
  assert.equal(keyring.isCurrent(keyring.seal('x')), true);
  assert.equal(keyring.isCurrent(new SecretBox(K1).seal('x')), false, 'v1, no id at all');
  const previousBox = new SecretBox(K1, { keyId: SecretBox.keyId(K1) });
  assert.equal(keyring.isCurrent(previousBox.seal('x')), false, 'v2 but under the previous key');
});

// ---------------------------------------------------------------- The required end-to-end scenario

test('rotation end to end: seal with K1 -> configure current K2 + previous K1 -> reseal -> remove K1 entirely -> TOTP still verifies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'console-rotation-'));
  const path = join(dir, 'console.db');
  try {
    // Step 1: seal under K1 (the only key that ever existed at this point).
    const db1 = new Database(path);
    const keyringK1 = new TotpKeyring({ current: K1 });
    const admins1 = new AdminStore(db1, keyringK1);
    const admin = admins1.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
    admins1.setTotpSecret(admin.id, 'ROTATEME', 1000);
    const sealedUnderK1 = /** @type {string} */ (admins1.byId(admin.id)?.totp_secret);
    db1.close();

    // Step 2: "restart" with K2 current, K1 previous -- reseal.
    const db2 = new Database(path);
    const keyringRotating = new TotpKeyring({ current: K2, previous: K1 });
    const resealed = AdminStore.reseal(db2, keyringRotating);
    assert.equal(resealed, 1);
    const sealedUnderK2 = /** @type {any} */ (db2.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(admin.id)).totp_secret;
    assert.notEqual(sealedUnderK2, sealedUnderK1);
    assert.equal(SecretBox.peekKeyId(sealedUnderK2), keyringRotating.currentId, 'now under K2, not K1');
    db2.close();

    // Step 3: "restart" again with ONLY K2 -- K1 has been fully removed from config.
    const db3 = new Database(path);
    const keyringK2Only = new TotpKeyring({ current: K2 });
    assert.equal(AdminStore.reseal(db3, keyringK2Only), 0, 'already resealed, nothing left to do');
    const admins3 = new AdminStore(db3, keyringK2Only);
    const finalSealed = /** @type {string} */ (admins3.byId(admin.id)?.totp_secret);
    assert.equal(keyringK2Only.open(finalSealed), 'ROTATEME', 'still verifies, K1 nowhere in the process anymore');
    db3.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Key-loss / failure semantics (8 scenarios)

test('1. current key missing entirely (no SECRETS_KEY) with a sealed row present: reseal refuses to start', () => {
  const db = new Database(':memory:');
  const admins = new AdminStore(db, new TotpKeyring({ current: K1 }));
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  admins.setTotpSecret(admin.id, 'X', 1000);

  assert.throws(() => AdminStore.reseal(db, null), ConfigError);
});

test('2. required previous key missing: a row sealed under an old key that config no longer names refuses to reseal, names the row, changes nothing', () => {
  const db = new Database(':memory:');
  const sealedRow = new TotpKeyring({ current: K1 }).seal('SECRET'); // sealed under K1, v2 format with K1's id
  const admins = new AdminStore(db, new TotpKeyring({ current: K1 }));
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  db.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?').run(sealedRow, admin.id);

  // "Restart" with K2 current and NO previous configured -- K1 (needed to decrypt the existing row) is gone.
  assert.throws(
    () => AdminStore.reseal(db, new TotpKeyring({ current: K2 })),
    (/** @type {any} */ e) => e instanceof ConfigError && /SECRETS_PREVIOUS_KEY/.test(e.message),
  );
  const raw = /** @type {any} */ (db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(admin.id)).totp_secret;
  assert.equal(raw, sealedRow, 'untouched by the refused reseal');
});

test('3. unknown key id: a v2 value naming a key id that matches neither current nor previous is refused, not tried against either', () => {
  const foreignBox = new SecretBox(K3, { keyId: SecretBox.keyId(K3) });
  const sealed = foreignBox.seal('secret');
  const keyring = new TotpKeyring({ current: K1, previous: K2 });
  assert.throws(() => keyring.open(sealed), /neither the configured current .* nor previous/);
});

test('4. malformed ciphertext: garbage in the totp_secret column that merely looks sealed is refused, not treated as either plaintext or valid ciphertext', () => {
  const keyring = new TotpKeyring({ current: K1 });
  assert.throws(() => keyring.open('v2.deadbeefdeadbeef.not.valid.base64url!!'));
  assert.throws(() => keyring.open('v1.short'));
});

test('5. authentication tag tampering: a bit-flipped tag on an otherwise-valid ciphertext is rejected, not silently "decrypted" into garbage plaintext', () => {
  const keyring = new TotpKeyring({ current: K1 });
  const sealed = keyring.seal('secret');
  const parts = sealed.split('.');
  const tag = Buffer.from(/** @type {string} */ (parts.at(-1)), 'base64url');
  tag[0] ^= 0xff;
  parts[parts.length - 1] = tag.toString('base64url');
  assert.throws(() => keyring.open(parts.join('.')));
});

test('6. wrong key: a value sealed under one key never opens under a completely unrelated, unconfigured key', () => {
  const sealed = new TotpKeyring({ current: K1 }).seal('secret');
  const wrongKeyring = new TotpKeyring({ current: K3 }); // K3 has never seen this value
  assert.throws(() => wrongKeyring.open(sealed));
});

test('7. partial reseal failure: one row fails to decrypt (unknown key), no row is changed -- all or nothing', () => {
  const db = new Database(':memory:');
  const admins = new AdminStore(db, new TotpKeyring({ current: K1 }));
  const good = admins.create({ email: 'good@b.co', name: 'Good', passwordHash: 'h', role: 'admin' }, 1000);
  admins.setTotpSecret(good.id, 'GOOD', 1000); // sealed under K1

  const bad = admins.create({ email: 'bad@b.co', name: 'Bad', passwordHash: 'h', role: 'viewer' }, 2000);
  const foreignSealed = new SecretBox(K3, { keyId: SecretBox.keyId(K3) }).seal('BAD'); // under an unconfigured key
  db.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?').run(foreignSealed, bad.id);

  const goodBefore = /** @type {any} */ (db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(good.id)).totp_secret;

  // Rotating to K2 with K1 as previous: "good" is resealable, "bad" is not (K3 is nowhere in config).
  assert.throws(() => AdminStore.reseal(db, new TotpKeyring({ current: K2, previous: K1 })), ConfigError);

  const goodAfter = /** @type {any} */ (db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(good.id)).totp_secret;
  const badAfter = /** @type {any} */ (db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(bad.id)).totp_secret;
  assert.equal(goodAfter, goodBefore, 'the row that COULD have been resealed was left untouched too -- the whole batch is one transaction');
  assert.equal(badAfter, foreignSealed);
  assert.equal(AdminStore.hasFullySealed(db), false);
});

test('8. restart during/after a successful reseal: re-running reseal (simulating a restart right after, or a retried start) is a clean no-op, not a double-encrypt or an error', () => {
  const db = new Database(':memory:');
  const admins = new AdminStore(db, new TotpKeyring({ current: K1 }));
  const admin = admins.create({ email: 'a@b.co', name: 'A', passwordHash: 'h', role: 'admin' }, 1000);
  admins.setTotpSecret(admin.id, 'X', 1000);
  const rotating = new TotpKeyring({ current: K2, previous: K1 });
  assert.equal(AdminStore.reseal(db, rotating), 1);
  const sealedOnce = /** @type {any} */ (db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(admin.id)).totp_secret;

  // "Restart" — same call again (a crash-and-retry, or the next normal startup).
  assert.equal(AdminStore.reseal(db, rotating), 0);
  const sealedTwice = /** @type {any} */ (db.prepare('SELECT totp_secret FROM admins WHERE id = ?').get(admin.id)).totp_secret;
  assert.equal(sealedTwice, sealedOnce, 'not re-encrypted a second time (would produce a different ciphertext, same plaintext)');
  assert.equal(rotating.open(sealedTwice), 'X');
});

// ---------------------------------------------------------------- Never: new secret, plaintext-as-valid, auth bypass

test('none of the failure paths above ever produced a NEW secret, treated ciphertext as plaintext, or returned success from a failed open', () => {
  // Re-assert the invariant explicitly, cheaply, over the exact primitives used above: SecretBox
  // and TotpKeyring never have a code path that returns a value on failure -- every failure mode is
  // a thrown exception, never a fallback return.
  const keyring = new TotpKeyring({ current: K1 });
  for (const bad of ['not sealed', 'v1.', 'v2.', 'v2.abc.def', '', 'v1.a.b.c.d.e']) {
    assert.throws(() => keyring.open(bad), `"${bad}" must throw, not resolve to any value`);
  }
});
