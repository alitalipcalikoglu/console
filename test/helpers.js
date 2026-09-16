import { Config } from '../src/config.js';
import { Database } from '../src/db.js';
import { ServiceRegistry } from '../src/services/registry.js';

export const SECRET = 'k'.repeat(40);

/** @param {Record<string, string>} [overrides] */
export function testConfig(overrides = {}) {
  return Config.fromEnv({ LOG_LEVEL: 'silent', DB_PATH: ':memory:', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', ...overrides });
}

export function testDb() {
  return new Database(':memory:');
}

/** @param {Partial<Record<'notify'|'auth'|'media'|'gateway', string>>} [urls] */
export function servicesDoc(urls = {}) {
  return {
    services: [
      { id: 'notify', type: 'notify', url: urls.notify ?? 'http://127.0.0.1:1', apiKeyEnv: 'NOTIFY_API_KEY' },
      { id: 'auth', type: 'auth', url: urls.auth ?? 'http://127.0.0.1:1', apiKeyEnv: 'AUTH_API_KEY', publicUrl: 'https://api.test.local', label: 'Auth (prod)' },
      { id: 'media', type: 'media', url: urls.media ?? 'http://127.0.0.1:1', apiKeyEnv: 'MEDIA_API_KEY' },
      { id: 'gateway', type: 'gateway', url: urls.gateway ?? 'http://127.0.0.1:1', metricsTokenEnv: 'GATEWAY_METRICS_TOKEN' },
    ],
  };
}

export const servicesEnv = { NOTIFY_API_KEY: SECRET, AUTH_API_KEY: 'a'.repeat(40), MEDIA_API_KEY: 'm'.repeat(40), GATEWAY_METRICS_TOKEN: 'g'.repeat(40) };

/** @param {Parameters<typeof servicesDoc>[0]} [urls] */
export function testRegistry(urls) {
  return ServiceRegistry.parse(servicesDoc(urls), servicesEnv);
}

/** Silent pino-compatible logger. */
export const silentLog = /** @type {any} */ (new Proxy({}, {
  get: (_t, prop) => (prop === 'child' ? () => silentLog : () => {}),
}));
