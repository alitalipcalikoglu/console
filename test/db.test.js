import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Database } from '../src/db.js';

test('Stage 4.1 migration v1 -> v2: an existing database gains totp_seal_state on upgrade, with its v1 admins intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'console-db-v1v2-'));
  const path = join(dir, 'console.db');
  try {
    class V1Only extends Database {
      static MIGRATIONS = [Database.MIGRATIONS[0]];
    }
    const v1 = new V1Only(path);
    assert.equal(v1.schemaVersion, 1);
    v1.prepare(`INSERT INTO admins (id, email, name, password_hash, role, created_at, updated_at) VALUES ('a1','a@b.co','A','h','admin',0,0)`).run();
    v1.close();

    const v2 = new Database(path); // this checkout's real MIGRATIONS: v1 admins/sessions/... + v2 totp_seal_state
    assert.equal(v2.schemaVersion, 2);
    assert.equal(/** @type {any} */ (v2.prepare("SELECT email FROM admins WHERE id = 'a1'").get()).email, 'a@b.co', 'v1 admin survived the upgrade');
    assert.equal(/** @type {any} */ (v2.prepare("SELECT COUNT(*) n FROM totp_seal_state").get()).n, 0, 'totp_seal_state exists, empty (AdminStore.reseal sets it, not the migration itself)');
    v2.prepare(`INSERT INTO totp_seal_state (id, fully_sealed_at) VALUES (1, 1000)`).run();
    assert.equal(/** @type {any} */ (v2.prepare("SELECT COUNT(*) n FROM totp_seal_state").get()).n, 1);
    v2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
