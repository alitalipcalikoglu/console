import { AuditClient } from './audit-client.js';
import { AuthClient } from './auth-client.js';
import { GatewayClient } from './gateway-client.js';
import { MediaClient } from './media-client.js';
import { NotifyClient } from './notify-client.js';
import { ShortlinkClient } from './shortlink-client.js';
import { ServiceClient, ServiceError } from './client.js';

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
    if (!c || !(c instanceof type)) throw new ServiceError(`no ${type.name.replace('Client', '').toLowerCase()} service "${id}"`, { statusCode: 404, code: 'UNKNOWN_SERVICE' });
    return c;
  }

  /** @param {string} id */
  any(id) {
    const c = this.clients.get(id);
    if (!c) throw new ServiceError(`unknown service "${id}"`, { statusCode: 404, code: 'UNKNOWN_SERVICE' });
    return c;
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
