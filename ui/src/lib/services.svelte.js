import { api } from './api.js';

/** @typedef {{ id: string, type: 'notify'|'auth'|'media'|'gateway', label: string, url: string, publicUrl: string|null, hasMetrics: boolean }} ServiceInfo */
/** @typedef {ServiceInfo & { health: boolean, ready: boolean, readyDetail: unknown, latencyMs: number, summary: any }} ServiceOverview */

/** Configured services and their latest health, shared by the navigation and the overview page. */
export class Services {
  constructor() {
    /** @type {ServiceInfo[]} */
    this.items = $state([]);
    /** @type {Record<string, ServiceOverview>} */
    this.overview = $state({});
    this.loaded = $state(false);
    this.overviewAt = $state(0);
  }

  async load() {
    const r = /** @type {{ items: ServiceInfo[] }} */ (await api.get('/services'));
    this.items = r.items;
    this.loaded = true;
  }

  async refreshOverview() {
    const r = /** @type {{ items: ServiceOverview[] }} */ (await api.get('/services/overview'));
    this.overview = Object.fromEntries(r.items.map((i) => [i.id, i]));
    this.overviewAt = Date.now();
  }

  /** @param {string} id */
  get(id) {
    return this.items.find((s) => s.id === id);
  }

  /** @param {ServiceInfo['type']} type */
  ofType(type) {
    return this.items.filter((s) => s.type === type);
  }

  /** @param {string} id */
  health(id) {
    const o = this.overview[id];
    if (!o) return 'unknown';
    if (o.health && o.ready) return 'ok';
    if (o.health) return 'warn';
    return 'danger';
  }

  reset() {
    this.items = [];
    this.overview = {};
    this.loaded = false;
  }
}

export const services = new Services();
