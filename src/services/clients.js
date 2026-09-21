import { AuditClient } from './audit-client.js';
import { AuthClient } from './auth-client.js';
import { FlagsClient } from './flags-client.js';
import { GatewayClient } from './gateway-client.js';
import { GeoClient } from './geo-client.js';
import { MediaClient } from './media-client.js';
import { NotifyClient } from './notify-client.js';
import { RateLimitClient } from './ratelimit-client.js';
import { SchedulerClient } from './scheduler-client.js';
import { SearchClient } from './search-client.js';
import { ShortlinkClient } from './shortlink-client.js';
import { WebhookOutClient } from './webhook-out-client.js';
import { ServiceClient, ServiceError } from './client.js';

const CLIENT_TYPES = new Map([
  ['NotifyClient', 'notify'], ['AuthClient', 'auth'], ['MediaClient', 'media'],
  ['GatewayClient', 'gateway'], ['AuditClient', 'audit'], ['ShortlinkClient', 'shortlink'],
  ['FlagsClient', 'flags'], ['SchedulerClient', 'scheduler'], ['WebhookOutClient', 'webhook-out'],
  ['SearchClient', 'search'], ['RateLimitClient', 'ratelimit'], ['GeoClient', 'geo'],
]);

/** @typedef {import('./registry.js').ServiceRegistry} ServiceRegistry */

/** One client per configured service, by id and by type. */
export class ServiceClients {
  /**
   * @param {ServiceRegistry} registry
   * @param {{ timeoutMs: number, fetch?: typeof fetch }} o
   */
  constructor(registry, o) {
    this.registry = registry;
    /** @type {Map<string, ServiceClient>} */
    this.clients = new Map();
    for (const def of registry.services) this.clients.set(def.id, ServiceClients.#build(def, o));
  }

  /**
   * @param {import('../types.js').ServiceDef} def
   * @param {{ timeoutMs: number, fetch?: typeof fetch }} o
   * @returns {ServiceClient}
   */
  static #build(def, o) {
    switch (def.type) {
      case 'notify': return new NotifyClient(def, o);
      case 'auth': return new AuthClient(def, o);
      case 'media': return new MediaClient(def, o);
      case 'gateway': return new GatewayClient(def, o);
      case 'audit': return new AuditClient(def, o);
      case 'shortlink': return new ShortlinkClient(def, o);
      case 'flags': return new FlagsClient(def, o);
      case 'scheduler': return new SchedulerClient(def, o);
      case 'webhook-out': return new WebhookOutClient(def, o);
      case 'search': return new SearchClient(def, o);
      case 'ratelimit': return new RateLimitClient(def, o);
      case 'geo': return new GeoClient(def, o);
      default: throw new Error(`unknown service type ${def.type}`);
    }
  }

  /**
   * @template {ServiceClient} T
   * @param {string} id
   * @param {new (...args: any[]) => T} type
   * @returns {T}
   */
  get(id, type) {
    const c = this.clients.get(id);
    // Adapter-node may place the route-side constructor and the composition-root constructor in
    // separate chunks, so class identity is not a safe service-type discriminator there. The
    // registry's validated fixed type remains the authority in both runtimes.
    const expected = CLIENT_TYPES.get(type.name.replace(/\$\d+$/, ''));
    if (!c || !expected || c.def.type !== expected) throw new ServiceError(`no ${type.name.replace('Client', '').toLowerCase()} service "${id}"`, { statusCode: 404, code: 'UNKNOWN_SERVICE' });
    return /** @type {T} */ (c);
  }

  /** @param {string} id */
  any(id) {
    const c = this.clients.get(id);
    if (!c) throw new ServiceError(`unknown service "${id}"`, { statusCode: 404, code: 'UNKNOWN_SERVICE' });
    return c;
  }

  /**
   * `/v1/info` for every configured service, in parallel — Stage 7's About view. Never throws for
   * one bad service: an unreachable, too-old (no route yet) or malformed response just becomes
   * `{ ok: false, error }` for that one entry, same as {@link ServiceClient#info}.
   */
  async about() {
    return Promise.all(this.registry.services.map(async (def) => {
      const client = /** @type {ServiceClient} */ (this.clients.get(def.id));
      const info = await client.info();
      return { id: def.id, type: def.type, label: def.label, url: def.url, ...info };
    }));
  }

  /** Health, readiness and headline numbers for every service, in parallel; failures are per service. */
  async overview() {
    return Promise.all(this.registry.services.map(async (def) => {
      const client = /** @type {any} */ (this.clients.get(def.id));
      const [status, summary] = await Promise.all([
        client.status(),
        client.summary().catch((/** @type {unknown} */ err) => ({ error: err instanceof Error ? err.message : String(err) })),
      ]);
      return { id: def.id, type: def.type, label: def.label, url: def.url, ...status, summary };
    }));
  }
}
