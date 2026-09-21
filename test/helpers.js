import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

export function testDb() { return new Database(':memory:'); }

/** @param {Partial<Record<'notify'|'auth'|'media'|'gateway'|'audit'|'shortlink'|'flags'|'scheduler'|'webhook-out'|'search'|'ratelimit'|'geo', string>>} [urls] */
export function servicesDoc(urls = {}) {
  return { services: [
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
  ] };
}

export const servicesEnv = { NOTIFY_API_KEY: SECRET, AUTH_API_KEY: 'a'.repeat(40), MEDIA_API_KEY: 'm'.repeat(40), GATEWAY_METRICS_TOKEN: 'g'.repeat(40), AUDIT_API_KEY: 'd'.repeat(40), SHORTLINK_API_KEY: 's'.repeat(40), FLAGS_API_KEY: 'f'.repeat(40), SCHEDULER_API_KEY: 'j'.repeat(40), WEBHOOK_OUT_API_KEY: 'h'.repeat(40), SEARCH_API_KEY: 'q'.repeat(40), RATELIMIT_API_KEY: 'l'.repeat(40), GEO_API_KEY: 'e'.repeat(40) };

/** @param {Parameters<typeof servicesDoc>[0]} [urls] */
export function testRegistry(urls) { return ServiceRegistry.parse(servicesDoc(urls), servicesEnv); }

export const silentLog = /** @type {any} */ (new Proxy({}, {
  get: (_t, prop) => (prop === 'child' ? () => silentLog : () => {}),
}));

/**
 * Framework-neutral domain fixture for unit tests that need a controllable clock.
 * @param {{ urls?: Parameters<typeof servicesDoc>[0], env?: Record<string, string>, dbPath?: string }} [options]
 */
export async function testRuntime({ urls, env = {}, dbPath = ':memory:' } = {}) {
  const { PasswordHasher } = await import('../src/crypto/password.js');
  const { AdminService } = await import('../src/domain/admin-service.js');
  const { ConsoleAuth } = await import('../src/domain/console-auth.js');
  const { ServiceClients } = await import('../src/services/clients.js');
  const { OpenApiDocuments } = await import('../src/services/openapi-documents.js');
  const { AdminStore } = await import('../src/store/admin-store.js');
  const { AuditStore } = await import('../src/store/audit-store.js');
  const { SessionStore } = await import('../src/store/session-store.js');
  const config = testConfig({ DB_PATH: dbPath, ...env });
  const db = new Database(config.dbPath);
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
  return { config, db, admins, sessions, audit, hasher, auth, adminService, clients, docs, clock, keyring, close: () => db.close() };
}

async function freePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = /** @type {import('node:net').AddressInfo} */ (socket.address()).port;
  socket.close();
  await once(socket, 'close');
  return port;
}

/**
 * Start the canonical built adapter-node application with an inject-compatible HTTP client.
 * @param {{ urls?: Parameters<typeof servicesDoc>[0], env?: Record<string, string> }} [options]
 */
export async function testConsole({ urls, env = {} } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'console-test-'));
  const dbPath = join(scratch, 'console.db');
  const servicesFile = join(scratch, 'services.json');
  writeFileSync(servicesFile, JSON.stringify(servicesDoc(urls)));
  const fixture = await testRuntime({ urls, env, dbPath });
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: { ...process.env, ...servicesEnv, PORT: String(port), HOST: '127.0.0.1', ORIGIN: origin, LOG_LEVEL: 'silent', DB_PATH: dbPath, SERVICES_FILE: servicesFile, COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SERVICE_TIMEOUT_MS: '3000', SECRETS_KEY, ...env },
    execArgv: ['--disable-warning=ExperimentalWarning'],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += chunk; });
  try {
    await Promise.race([
      once(child, 'message').then(([message]) => { if (message !== 'ready') throw new Error(`unexpected IPC message: ${String(message)}`); }),
      once(child, 'exit').then(([code, signal]) => { throw new Error(`console exited before ready (${code ?? signal}): ${stderr}`); }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('console ready IPC timed out')), 10_000)),
    ]);
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    fixture.close();
    rmSync(scratch, { recursive: true, force: true });
    throw error;
  }

  let closed = false;
  const app = {
    /** @param {string|{ method?: string, url: string, headers?: Record<string, string>, payload?: unknown }} input */
    async inject(input) {
      const options = typeof input === 'string' ? { url: input } : input;
      const headers = { ...(options.headers ?? {}) };
      let body;
      if (options.payload !== undefined) {
        if (Buffer.isBuffer(options.payload) || typeof options.payload === 'string') body = options.payload;
        else {
          body = JSON.stringify(options.payload);
          if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
        }
      }
      const response = await fetch(`${origin}${options.url}`, { method: options.method ?? 'GET', headers, body: /** @type {any} */ (body), redirect: 'manual' });
      const rawPayload = Buffer.from(await response.arrayBuffer());
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const responseBody = rawPayload.toString('utf8');
      return { statusCode: response.status, headers: responseHeaders, body: responseBody, rawPayload, json: () => JSON.parse(responseBody) };
    },
    async close() {
      if (closed) return;
      closed = true;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
      fixture.close();
      rmSync(scratch, { recursive: true, force: true });
    },
  };
  return { ...fixture, app, origin, servicesFile, scratch };
}

export const ADMIN_PASSWORD = 'a very long console password';
export const CSRF = { 'x-console-request': '1' };

/**
 * @param {Awaited<ReturnType<typeof testConsole>>} t
 * @param {{ email?: string, role?: 'admin'|'viewer' }} [options]
 */
export async function signIn(t, { email = 'root@console.local', role = 'admin' } = {}) {
  if (!t.admins.byEmail(email)) await t.adminService.create({ email, name: 'Root', password: ADMIN_PASSWORD, role }, null, { ip: null, userAgent: null });
  const res = await t.app.inject({ method: 'POST', url: '/api/session/login', payload: { email, password: ADMIN_PASSWORD } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return { cookie: String(res.headers['set-cookie']).split(';')[0], body: res.json() };
}
