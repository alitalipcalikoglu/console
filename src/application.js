import { Config } from './config.js';
import { PasswordHasher } from './crypto/password.js';
import { TotpKeyring } from './crypto/totp-keyring.js';
import { Database } from './db.js';
import { AdminService } from './domain/admin-service.js';
import { ConsoleAuth } from './domain/console-auth.js';
import { ConsoleApi } from './http/console-api.js';
import { Maintenance } from './maintenance.js';
import { RateLimiter } from './rate-limiter.js';
import { ServiceClients } from './services/clients.js';
import { ServiceRegistry } from './services/registry.js';
import { AdminStore } from './store/admin-store.js';
import { AuditStore } from './store/audit-store.js';
import { AuditEvents } from './domain/audit-events.js';
import { AuditClient } from '@atc-web/service-core/audit';
import { readServiceVersion } from '@atc-web/service-core/fastify';
import { Lifecycle } from '@atc-web/service-core/lifecycle';
import { SessionStore } from './store/session-store.js';

/** Composition root: wires storage, domain, service clients and HTTP; owns the process lifecycle. */
export class Application {
  /**
   * @param {Config} config
   * @param {ServiceRegistry} registry
   */
  constructor(config, registry) {
    this.config = config;
    this.registry = registry;
    this.version = readServiceVersion(import.meta.url);
    this.db = new Database(config.dbPath, { backupDir: config.dbBackupDir });
    const keyring = config.secretsKey ? new TotpKeyring({ current: config.secretsKey, previous: config.secretsPreviousKey }) : null;
    // Stage 4/4.1: reseal any totp_secret not already sealed under the current key (plaintext, or
    // sealed under the previous key during a rotation); no-op once nothing is left to reseal.
    AdminStore.reseal(this.db, keyring);
    this.admins = new AdminStore(this.db, keyring);
    this.sessions = new SessionStore(this.db);
    this.audit = new AuditStore(this.db);
    // The console log is also forwarded to the first configured audit service (its key must have the write role).
    const auditService = registry.ofType('audit')[0];
    this.forwarder = new AuditClient({ target: auditService?.apiKey ? { url: auditService.url, apiKey: auditService.apiKey } : null });
    this.audit.onRecord = (e, at) => { this.forwarder.record(AuditEvents.fromLogEntry(e, at)); };
    this.hasher = new PasswordHasher({ logN: config.scryptLogN });
    this.auth = new ConsoleAuth({
      admins: this.admins, sessions: this.sessions, audit: this.audit, hasher: this.hasher, keyring,
      strictSealing: AdminStore.hasFullySealed(this.db), log: /** @type {any} */ (console),
      options: { sessionTtlMs: config.sessionTtlMin * 60_000, sessionIdleMs: config.sessionIdleMin * 60_000, loginMaxFailures: config.loginMaxFailures, lockoutMs: config.loginLockoutMin * 60_000, totpIssuer: config.totpIssuer },
    });
    this.adminService = new AdminService({ admins: this.admins, sessions: this.sessions, audit: this.audit, hasher: this.hasher });
    this.clients = new ServiceClients(registry, { timeoutMs: config.serviceTimeoutMs });
    this.api = new ConsoleApi({ config, auth: this.auth, adminService: this.adminService, audit: this.audit, clients: this.clients, db: this.db, limiter: new RateLimiter(), version: this.version });
    /** @type {import('fastify').FastifyInstance|null} */
    this.app = null;
    /** @type {Maintenance|null} */
    this.maintenance = null;
    /** @type {(reason: string) => Promise<void>} */
    this.shutdown = async () => {};
  }

  static fromEnv() {
    try {
      const config = Config.fromEnv();
      return new Application(config, ServiceRegistry.load(config.servicesFile));
    } catch (err) {
      if (err instanceof Error && err.name === 'ConfigError') {
        console.error(`configuration error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  }

  async start() {
    const app = await this.api.build();
    this.api.registerUpload(app);
    this.app = app;
    this.auth.log = app.log.child({ component: 'auth' });
    this.maintenance = new Maintenance({ sessions: this.sessions, audit: this.audit, log: app.log.child({ component: 'maintenance' }), options: { sessionIdleMs: this.config.sessionIdleMin * 60_000, auditRetentionDays: this.config.auditRetentionDays } });
    const { shutdown } = Lifecycle.install({
      forceExitMs: 30_000,
      log: app.log,
      steps: [
        () => this.maintenance?.stop(),
        () => this.app?.close(),
        () => this.forwarder.close(),
        () => this.db.close(),
      ],
    });
    this.shutdown = shutdown;
    this.forwarder.logger = app.log;
    this.forwarder.start();
    await app.listen({ port: this.config.port, host: this.config.host });
    if (this.admins.activeAdminCount() === 0) app.log.warn('no administrator exists yet: run `npm run admin -- create <email>`');
    app.log.info({ tls: this.config.tls !== null, services: this.registry.describe().map((s) => `${s.id}(${s.type})`) }, this.config.tls ? 'serving HTTPS' : 'serving plain HTTP, terminate TLS at a reverse proxy');
    this.maintenance.start();
    if (process.send) process.send('ready'); // PM2 wait_ready
  }

}
