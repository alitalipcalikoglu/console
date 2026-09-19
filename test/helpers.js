import { Config } from '../src/config.js';
import { TotpKeyring } from '../src/crypto/totp-keyring.js';
import { Database } from '../src/db.js';
import { ServiceRegistry } from '../src/services/registry.js';

export const SECRET = 'k'.repeat(40);
export const SECRETS_KEY = 'ab'.repeat(32);

/** @param {Record<string, string>} [overrides] */
export function testConfig(overrides = {}) {
  return Config.fromEnv({ LOG_LEVEL: 'silent', DB_PATH: ':memory:', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SECRETS_KEY, ...overrides });
}

export function testDb() {
  return new Database(':memory:');
}

/** @param {Partial<Record<'notify'|'auth'|'media'|'gateway'|'audit'|'shortlink'|'flags'|'scheduler'|'webhook-out'|'search'|'ratelimit'|'geo', string>>} [urls] */
export function servicesDoc(urls = {}) {
  return {
    services: [
      { id: 'notify', type: 'notify', url: urls.notify ?? 'http://127.0.0.1:1', apiKeyEnv: 'NOTIFY_API_KEY' },
      { id: 'auth', type: 'auth', url: urls.auth ?? 'http://127.0.0.1:1', apiKeyEnv: 'AUTH_API_KEY', publicUrl: 'https://api.test.local', label: 'Auth (prod)' },
      { id: 'media', type: 'media', url: urls.media ?? 'http://127.0.0.1:1', apiKeyEnv: 'MEDIA_API_KEY' },
      { id: 'gateway', type: 'gateway', url: urls.gateway ?? 'http://127.0.0.1:1', metricsTokenEnv: 'GATEWAY_METRICS_TOKEN' },
      { id: 'audit', type: 'audit', url: urls.audit ?? 'http://127.0.0.1:1', apiKeyEnv: 'AUDIT_API_KEY' },
      { id: 'shortlink', type: 'shortlink', url: urls.shortlink ?? 'http://127.0.0.1:1', apiKeyEnv: 'SHORTLINK_API_KEY' },
      { id: 'flags', type: 'flags', url: urls.flags ?? 'http://127.0.0.1:1', apiKeyEnv: 'FLAGS_API_KEY' },
      { id: 'scheduler', type: 'scheduler', url: urls.scheduler ?? 'http://127.0.0.1:1', apiKeyEnv: 'SCHEDULER_API_KEY' },
      { id: 'webhooks', type: 'webhook-out', url: urls['webhook-out'] ?? 'http://127.0.0.1:1', apiKeyEnv: 'WEBHOOK_OUT_API_KEY' },
      { id: 'search', type: 'search', url: urls.search ?? 'http://127.0.0.1:1', apiKeyEnv: 'SEARCH_API_KEY' },
      { id: 'ratelimit', type: 'ratelimit', url: urls.ratelimit ?? 'http://127.0.0.1:1', apiKeyEnv: 'RATELIMIT_API_KEY' },
      { id: 'geo', type: 'geo', url: urls.geo ?? 'http://127.0.0.1:1', apiKeyEnv: 'GEO_API_KEY' },
    ],
  };
}

export const servicesEnv = { NOTIFY_API_KEY: SECRET, AUTH_API_KEY: 'a'.repeat(40), MEDIA_API_KEY: 'm'.repeat(40), GATEWAY_METRICS_TOKEN: 'g'.repeat(40), AUDIT_API_KEY: 'd'.repeat(40), SHORTLINK_API_KEY: 's'.repeat(40), FLAGS_API_KEY: 'f'.repeat(40), SCHEDULER_API_KEY: 'j'.repeat(40), WEBHOOK_OUT_API_KEY: 'h'.repeat(40), SEARCH_API_KEY: 'q'.repeat(40), RATELIMIT_API_KEY: 'l'.repeat(40), GEO_API_KEY: 'e'.repeat(40) };

/** @param {Parameters<typeof servicesDoc>[0]} [urls] */
export function testRegistry(urls) {
  return ServiceRegistry.parse(servicesDoc(urls), servicesEnv);
}

/** Silent pino-compatible logger. */
export const silentLog = /** @type {any} */ (new Proxy({}, {
  get: (_t, prop) => (prop === 'child' ? () => silentLog : () => {}),
}));

/**
 * Fully wired console on in-memory storage. Service URLs point at whatever the test provides.
 * @param {{ urls?: Parameters<typeof servicesDoc>[0], env?: Record<string, string>, publicDir?: string }} [o]
 */
export async function testConsole({ urls, env = {}, publicDir } = {}) {
  const { PasswordHasher } = await import('../src/crypto/password.js');
  const { AdminService } = await import('../src/domain/admin-service.js');
  const { ConsoleAuth } = await import('../src/domain/console-auth.js');
  const { ConsoleApi } = await import('../src/http/console-api.js');
  const { RateLimiter } = await import('../src/rate-limiter.js');
  const { ServiceClients } = await import('../src/services/clients.js');
  const { OpenApiDocuments } = await import('../src/services/openapi-documents.js');
  const { AdminStore } = await import('../src/store/admin-store.js');
  const { AuditStore } = await import('../src/store/audit-store.js');
  const { SessionStore } = await import('../src/store/session-store.js');
  const config = testConfig({ ...(publicDir ? { PUBLIC_DIR: publicDir } : {}), ...env });
  const db = testDb();
  const keyring = config.secretsKey ? new TotpKeyring({ current: config.secretsKey, previous: config.secretsPreviousKey }) : null;
  AdminStore.reseal(db, keyring);
  const admins = new AdminStore(db, keyring);
  const sessions = new SessionStore(db);
  const audit = new AuditStore(db);
  const hasher = new PasswordHasher({ logN: 14 });
  const clock = { now: Date.now() };
  const auth = new ConsoleAuth({
    admins, sessions, audit, hasher, keyring, strictSealing: AdminStore.hasFullySealed(db), log: silentLog,
    options: { sessionTtlMs: config.sessionTtlMin * 60_000, sessionIdleMs: config.sessionIdleMin * 60_000, loginMaxFailures: config.loginMaxFailures, lockoutMs: config.loginLockoutMin * 60_000, totpIssuer: 'test console' },
    now: () => clock.now,
  });
  const adminService = new AdminService({ admins, sessions, audit, hasher, now: () => clock.now });
  const clients = new ServiceClients(testRegistry(urls), { timeoutMs: 3000 });
  const docs = new OpenApiDocuments(clients);
  const api = new ConsoleApi({ config, auth, adminService, audit, clients, docs, db, limiter: new RateLimiter(), version: '1.0.0', logger: silentLog });
  const app = await api.build();
  api.registerUpload(app);
  await app.ready();
  return { app, config, db, admins, sessions, audit, hasher, auth, adminService, clients, docs, clock, keyring };
}

export const ADMIN_PASSWORD = 'a very long console password';
export const CSRF = { 'x-console-request': '1' };

/**
 * Create an admin and sign in; returns the cookie header to reuse.
 * @param {Awaited<ReturnType<typeof testConsole>>} t
 * @param {{ email?: string, role?: 'admin'|'viewer' }} [o]
 */
export async function signIn(t, { email = 'root@console.local', role = 'admin' } = {}) {
  if (!t.admins.byEmail(email)) await t.adminService.create({ email, name: 'Root', password: ADMIN_PASSWORD, role }, null, { ip: null, userAgent: null });
  const res = await t.app.inject({ method: 'POST', url: '/api/session/login', payload: { email, password: ADMIN_PASSWORD } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  const cookie = String(res.headers['set-cookie']).split(';')[0];
  return { cookie, body: res.json() };
}
