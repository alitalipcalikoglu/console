import { readFileSync } from 'node:fs';
import { ConfigError } from '../config.js';

/** @typedef {import('../types.js').ServiceDef} ServiceDef */
/** @typedef {import('../types.js').ServiceType} ServiceType */

const TYPES = new Set(['notify', 'auth', 'media', 'gateway']);

/** Loads and validates services.json; resolves secrets from the environment. */
export class ServiceRegistry {
  /** @param {ServiceDef[]} services */
  constructor(services) {
    this.services = services;
    /** @type {Map<string, ServiceDef>} */
    this.byId = new Map(services.map((s) => [s.id, s]));
  }

  /**
   * @param {string} path
   * @param {NodeJS.ProcessEnv} [env]
   */
  static load(path, env = process.env) {
    let raw;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (err) {
      throw new ConfigError(`cannot read services file ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      throw new ConfigError(`services file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    return ServiceRegistry.parse(doc, env);
  }

  /**
   * @param {unknown} doc
   * @param {NodeJS.ProcessEnv} env
   */
  static parse(doc, env) {
    if (typeof doc !== 'object' || doc === null || !Array.isArray(/** @type {any} */ (doc).services)) throw new ConfigError('services file must be an object with a "services" array');
    const list = /** @type {unknown[]} */ (/** @type {any} */ (doc).services);
    if (list.length === 0) throw new ConfigError('services must contain at least one service');
    const services = list.map((item, i) => ServiceRegistry.#service(item, `services[${i}]`, env));
    if (new Set(services.map((s) => s.id)).size !== services.length) throw new ConfigError('service ids must be unique');
    return new ServiceRegistry(services);
  }

  /**
   * @param {unknown} item
   * @param {string} where
   * @param {NodeJS.ProcessEnv} env
   * @returns {ServiceDef}
   */
  static #service(item, where, env) {
    if (typeof item !== 'object' || item === null) throw new ConfigError(`${where} must be an object`);
    const o = /** @type {Record<string, unknown>} */ (item);
    const id = ServiceRegistry.#string(o.id, `${where}.id`, 1, 40);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new ConfigError(`${where}.id must be lower-case letters, digits and dashes`);
    const type = ServiceRegistry.#string(o.type, `${where}.type`, 1, 20);
    if (!TYPES.has(type)) throw new ConfigError(`${where}.type must be one of ${[...TYPES].join(', ')}`);
    const url = ServiceRegistry.#origin(o.url, `${where}.url`);
    const publicUrl = o.publicUrl === undefined || o.publicUrl === null ? null : ServiceRegistry.#origin(o.publicUrl, `${where}.publicUrl`);
    const label = o.label === undefined ? id : ServiceRegistry.#string(o.label, `${where}.label`, 1, 60);
    let apiKey = null;
    let metricsToken = null;
    if (type === 'gateway') {
      if (o.metricsTokenEnv !== undefined && o.metricsTokenEnv !== null) metricsToken = ServiceRegistry.#secret(o.metricsTokenEnv, `${where}.metricsTokenEnv`, env);
    } else {
      if (o.apiKeyEnv === undefined) throw new ConfigError(`${where}.apiKeyEnv is required for type "${type}"`);
      apiKey = ServiceRegistry.#secret(o.apiKeyEnv, `${where}.apiKeyEnv`, env);
    }
    return { id, type: /** @type {ServiceType} */ (type), url, apiKey, metricsToken, publicUrl, label };
  }

  /**
   * @param {unknown} v
   * @param {string} where
   * @param {NodeJS.ProcessEnv} env
   */
  static #secret(v, where, env) {
    const name = ServiceRegistry.#string(v, where, 1, 100);
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new ConfigError(`${where} must name an environment variable (UPPER_SNAKE_CASE)`);
    const value = env[name]?.trim();
    if (!value) throw new ConfigError(`${where} refers to ${name}, which is not set`);
    if (value.length < 32) throw new ConfigError(`${name} must be at least 32 characters`);
    return value;
  }

  /**
   * @param {unknown} v
   * @param {string} where
   * @param {number} min
   * @param {number} max
   */
  static #string(v, where, min, max) {
    if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new ConfigError(`${where} must be a string of ${min}..${max} characters`);
    return v.trim();
  }

  /**
   * @param {unknown} v
   * @param {string} where
   */
  static #origin(v, where) {
    const s = ServiceRegistry.#string(v, where, 1, 500);
    let u;
    try {
      u = new URL(s);
    } catch {
      throw new ConfigError(`${where} must be an absolute URL`);
    }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) {
      throw new ConfigError(`${where} must be a bare origin like http://host:port`);
    }
    return u.origin;
  }

  /**
   * @param {string} id
   * @returns {ServiceDef|undefined}
   */
  get(id) {
    return this.byId.get(id);
  }

  /** @param {ServiceType} type */
  ofType(type) {
    return this.services.filter((s) => s.type === type);
  }

  /** Public description without secrets. */
  describe() {
    return this.services.map((s) => ({ id: s.id, type: s.type, label: s.label, url: s.url, publicUrl: s.publicUrl, hasMetrics: s.type !== 'gateway' || s.metricsToken !== null }));
  }
}
