import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConsoleLogger } from '@atc-web/service-core/log';
import { Config } from '../../config.js';
import { PasswordHasher } from '../../crypto/password.js';
import { TotpKeyring } from '../../crypto/totp-keyring.js';
import { Database } from '../../db.js';
import { ConsoleAuth } from '../../domain/console-auth.js';
import { Maintenance } from '../../maintenance.js';
import { RateLimiter } from '../../rate-limiter.js';
import { AdminStore } from '../../store/admin-store.js';
import { AuditStore } from '../../store/audit-store.js';
import { SessionStore } from '../../store/session-store.js';

const RUNTIME_STATE = Symbol.for('atc.console.sveltekit.runtime');

class SilentLogger {
  trace() {}
  debug() {}
  info() {}
  warn() {}
  error() {}
  fatal() {}
  child() { return this; }
}

/** Process-owned resources shared by every SvelteKit request. */
export class ConsoleRuntime {
  /** @param {Config} config */
  constructor(config) {
    this.config = config;
    this.log = /** @type {any} */ (config.logLevel === 'silent'
      ? new SilentLogger()
      : new ConsoleLogger({ level: /** @type {any} */ (config.logLevel), bindings: { service: 'console', runtime: 'sveltekit' } }));
    this.version = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')).version;
    const serviceCoreSource = import.meta.resolve('@atc-web/service-core/config');
    this.serviceCoreVersion = JSON.parse(readFileSync(new URL('../package.json', serviceCoreSource), 'utf8')).version;
    this.openapi = readFileSync(resolve(process.cwd(), 'openapi.yaml'));
    this.state = 'initialized';
    this.closed = false;

    this.db = new Database(config.dbPath, { backupDir: config.dbBackupDir });
    try {
      const keyring = config.secretsKey
        ? new TotpKeyring({ current: config.secretsKey, previous: config.secretsPreviousKey })
        : null;
      AdminStore.reseal(this.db, keyring);
      this.admins = new AdminStore(this.db, keyring);
      this.sessions = new SessionStore(this.db);
      this.audit = new AuditStore(this.db);
      this.hasher = new PasswordHasher({ logN: config.scryptLogN });
      this.auth = new ConsoleAuth({
        admins: this.admins,
        sessions: this.sessions,
        audit: this.audit,
        hasher: this.hasher,
        keyring,
        strictSealing: AdminStore.hasFullySealed(this.db),
        log: this.log.child({ component: 'auth' }),
        options: {
          sessionTtlMs: config.sessionTtlMin * 60_000,
          sessionIdleMs: config.sessionIdleMin * 60_000,
          loginMaxFailures: config.loginMaxFailures,
          lockoutMs: config.loginLockoutMin * 60_000,
          totpIssuer: config.totpIssuer,
        },
      });
      this.limiter = new RateLimiter();
      this.maintenance = new Maintenance({
        sessions: this.sessions,
        audit: this.audit,
        log: this.log.child({ component: 'maintenance' }),
        options: {
          sessionIdleMs: config.sessionIdleMin * 60_000,
          auditRetentionDays: config.auditRetentionDays,
        },
      });
    } catch (err) {
      this.db.close();
      this.closed = true;
      this.state = 'failed';
      throw err;
    }
  }

  start() {
    if (this.state === 'ready') return;
    if (this.state !== 'initialized') throw new Error(`runtime cannot start from ${this.state}`);
    this.maintenance.start();
    this.state = 'ready';
  }

  checkReadiness() {
    if (this.state !== 'ready') throw new Error('runtime is not ready');
    this.db.ping();
  }

  /** @returns {number} */
  get schemaVersion() {
    return this.db.schemaVersion;
  }

  beginShutdown() {
    if (this.state === 'stopped' || this.state === 'stopping') return;
    this.state = 'stopping';
    this.maintenance.stop();
  }

  finishShutdown() {
    this.beginShutdown();
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
    this.state = 'stopped';
  }
}

/** Process-wide access to the single runtime instance. */
export class Runtime {
  static #holder() {
    const globalState = /** @type {any} */ (globalThis);
    if (!globalState[RUNTIME_STATE]) globalState[RUNTIME_STATE] = { runtime: null, initializations: 0 };
    return /** @type {{ runtime: ConsoleRuntime|null, initializations: number }} */ (globalState[RUNTIME_STATE]);
  }

  /**
   * Resolve the process runtime exactly once. The global symbol keeps the singleton intact when
   * adapter-node bundles this module while the process wrapper imports its source copy.
   * @param {{ config?: Config, env?: NodeJS.ProcessEnv, start?: boolean }} [options]
   */
  static initialize({ config, env = process.env, start = true } = {}) {
    const state = Runtime.#holder();
    if (!state.runtime) {
      state.runtime = new ConsoleRuntime(config ?? Config.fromEnv(env));
      state.initializations += 1;
    }
    if (start && state.runtime.state === 'initialized') state.runtime.start();
    return state.runtime;
  }

  static get() {
    const runtime = Runtime.initialize();
    if (runtime.state === 'stopping' || runtime.state === 'stopped') throw new Error('runtime is shutting down');
    return runtime;
  }

  static diagnostics() {
    const state = Runtime.#holder();
    return {
      initializations: state.initializations,
      state: state.runtime?.state ?? 'absent',
      maintenanceActive: Boolean(state.runtime?.maintenance.timer),
    };
  }
}
