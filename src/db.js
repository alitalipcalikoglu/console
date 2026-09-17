import { Database as CoreDatabase } from '@atc-web/service-core/db';

/** SQLite connection with schema migrations applied on open. */
export class Database extends CoreDatabase {
  static MIGRATIONS = [
    `
    CREATE TABLE admins (
      id               TEXT PRIMARY KEY,
      email            TEXT NOT NULL UNIQUE,
      name             TEXT NOT NULL,
      password_hash    TEXT NOT NULL,
      role             TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
      status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      totp_secret      TEXT,
      totp_enabled_at  INTEGER,
      failed_logins    INTEGER NOT NULL DEFAULT 0,
      locked_until     INTEGER,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL,
      last_login_at    INTEGER
    );

    CREATE TABLE sessions (
      id            TEXT PRIMARY KEY,
      admin_id      TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL UNIQUE,
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      totp_pending  INTEGER NOT NULL DEFAULT 0,
      ip            TEXT,
      user_agent    TEXT
    );
    CREATE INDEX sessions_admin ON sessions (admin_id);
    CREATE INDEX sessions_expiry ON sessions (expires_at);

    CREATE TABLE totp_used (
      admin_id  TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      step      INTEGER NOT NULL,
      PRIMARY KEY (admin_id, step)
    );

    CREATE TABLE audit (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id     TEXT,
      admin_email  TEXT,
      action       TEXT NOT NULL,
      target       TEXT,
      meta         TEXT,
      ip           TEXT,
      at           INTEGER NOT NULL
    );
    CREATE INDEX audit_at ON audit (at);
    CREATE INDEX audit_admin ON audit (admin_id, at DESC);
    `,
    `
    -- Stage 4.1: a one-way ratchet, set once AdminStore.reseal() has confirmed every totp_secret is
    -- sealed under the current key (including a database that never had any TOTP secret at all —
    -- there being nothing to reseal counts as "fully sealed" too). Never unset. Once this row
    -- exists, a plaintext totp_secret found on any later read is treated as corrupt/unexpected
    -- rather than tolerated as "not yet migrated" — see ConsoleAuth's strictSealing.
    CREATE TABLE totp_seal_state (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      fully_sealed_at  INTEGER NOT NULL
    );
    `,
  ];
}
