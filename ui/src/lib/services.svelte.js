import { untrack } from 'svelte';
import { api } from './api.js';

/** @typedef {{ enabled: boolean, intervalSec: number }} Polling */
/** @typedef {{ id: string, type: 'notify'|'auth'|'media'|'gateway'|'audit'|'shortlink'|'flags'|'scheduler', label: string, url: string, publicUrl: string|null, hasMetrics: boolean, polling: Polling }} ServiceInfo */
/** @typedef {ServiceInfo & { health: boolean, ready: boolean, readyDetail: unknown, latencyMs: number, summary: any }} ServiceOverview */

/** Configured services and their latest health, shared by the navigation and the overview page. */
export class Services {
  /** Navigation icon per service type. @type {Record<ServiceInfo['type'], string>} */
  static ICONS = { notify: 'bell', auth: 'users', media: 'image', gateway: 'route', audit: 'history', shortlink: 'link', flags: 'flag', scheduler: 'clock' };

  constructor() {
    /** @type {ServiceInfo[]} */
    this.items = $state([]);
    /** @type {Record<string, ServiceOverview>} */
    this.overview = $state({});
    /** @type {Record<string, number>} */
    this.refreshedAt = $state({});
    /** @type {Record<string, boolean>} */
    this.refreshing = $state({});
    this.loaded = $state(false);
  }

  async load() {
    const r = /** @type {{ items: ServiceInfo[] }} */ (await api.get('/services'));
    this.items = r.items;
    this.loaded = true;
  }

  /**
   * Refresh one service only: one probe pair plus one metrics call, nothing else.
   * @param {string} id
   */
  async refreshOne(id) {
    const def = this.get(id);
    if (!def) return;
    // Read-modify-write of reactive maps runs untracked: callers may sit inside an $effect, and
    // tracking the read would make that effect depend on its own write (infinite loop).
    untrack(() => { this.refreshing = { ...this.refreshing, [id]: true }; });
    try {
      const r = /** @type {Omit<ServiceOverview, keyof ServiceInfo>} */ (await api.get(`/services/${id}/status`));
      this.overview = { ...this.overview, [id]: { ...def, ...r } };
      this.refreshedAt = { ...this.refreshedAt, [id]: Date.now() };
    } finally {
      untrack(() => { this.refreshing = { ...this.refreshing, [id]: false }; });
    }
  }

  /**
   * Persist a service's auto-refresh setting (written to services.json by the server).
   * @param {string} id
   * @param {Polling} polling
   */
  async updatePolling(id, polling) {
    const r = /** @type {{ service: ServiceInfo }} */ (await api.patch(`/services/${id}/settings`, { polling }));
    this.items = this.items.map((s) => (s.id === id ? r.service : s));
    const { poller } = await import('./poller.svelte.js');
    poller.for(id).reconfigure();
  }

  /** Services never probed in this session (first paint of the overview). */
  async refreshMissing() {
    const missing = untrack(() => this.items.filter((s) => !this.overview[s.id]));
    await Promise.all(missing.map((s) => this.refreshOne(s.id).catch(() => {})));
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
    this.refreshedAt = {};
    this.refreshing = {};
    this.loaded = false;
  }
}

export const services = new Services();
