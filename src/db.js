import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** SQLite connection with schema migrations applied on open. */
export class Database {
  /** @type {readonly string[]} */
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
  ];

  /** @param {string} path File path, or ":memory:". */
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    /** @readonly */
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA synchronous = NORMAL');
    this.raw.exec('PRAGMA busy_timeout = 5000');
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.#migrate();
  }

  #migrate() {
    const { user_version: current } = /** @type {{ user_version: number }} */ (this.raw.prepare('PRAGMA user_version').get());
    for (let v = current; v < Database.MIGRATIONS.length; v++) {
      this.raw.exec('BEGIN');
      try {
        this.raw.exec(Database.MIGRATIONS[v]);
        this.raw.exec(`PRAGMA user_version = ${v + 1}`);
        this.raw.exec('COMMIT');
      } catch (err) {
        this.raw.exec('ROLLBACK');
        throw err;
      }
    }
  }

  /** @param {string} sql */
  prepare(sql) {
    return this.raw.prepare(sql);
  }

  /**
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  transaction(fn) {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    }
  }

  ping() {
    this.raw.prepare('SELECT 1').get();
  }

  close() {
    this.raw.close();
  }
}
