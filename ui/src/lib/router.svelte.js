/**
 * Minimal History-API router. Patterns like `/auth/:sid/users/:id`; `params` and `path` are
 * reactive state. Links call `router.go()`; the browser back button is honoured.
 */
export class Router {
  /** @param {string[]} patterns */
  constructor(patterns) {
    this.patterns = patterns.map((p) => ({ pattern: p, re: new RegExp(`^${p.replace(/\//g, '\\/').replace(/:([a-zA-Z]+)/g, '(?<$1>[^/]+)')}\\/?$`) }));
    this.path = $state(location.pathname);
    this.query = $state(new URLSearchParams(location.search));
    window.addEventListener('popstate', () => this.#sync());
  }

  #sync() {
    this.path = location.pathname;
    this.query = new URLSearchParams(location.search);
  }

  /** Matched pattern and params for the current path. */
  get match() {
    for (const { pattern, re } of this.patterns) {
      const m = re.exec(this.path);
      if (m) return { pattern, params: Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)])) };
    }
    return { pattern: null, params: /** @type {Record<string, string>} */ ({}) };
  }

  /**
   * @param {string} to
   * @param {{ replace?: boolean }} [o]
   */
  go(to, { replace = false } = {}) {
    if (to === this.path + location.search) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', to);
    this.#sync();
    window.scrollTo({ top: 0 });
  }

  /** Update the query string without adding history entries (filters, search). @param {Record<string, string|null|undefined>} patch */
  setQuery(patch) {
    const q = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '') q.delete(k); else q.set(k, v); }
    const s = q.toString();
    history.replaceState({}, '', `${this.path}${s ? `?${s}` : ''}`);
    this.#sync();
  }

  /**
   * Click handler for <a> elements: intercepts same-origin navigations.
   * @param {MouseEvent} e
   */
  link = (e) => {
    const a = /** @type {HTMLElement|null} */ (e.target)?.closest?.('a');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || a.target === '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    this.go(href);
  };
}

export const router = new Router([
  '/login', '/', '/notify/:sid', '/notify/:sid/messages/:id', '/auth/:sid', '/auth/:sid/users/:id',
  '/media/:sid', '/media/:sid/files/:id', '/gateway/:sid', '/audit/:sid', '/audit/:sid/events/:id', '/shortlink/:sid', '/shortlink/:sid/links/:id', '/flags/:sid', '/flags/:sid/flags/:id', '/scheduler/:sid', '/scheduler/:sid/jobs/:id', '/scheduler/:sid/runs/:id', '/webhook-out/:sid', '/webhook-out/:sid/subscriptions/:id', '/webhook-out/:sid/deliveries/:id', '/webhook-out/:sid/events/:id', '/audit', '/admins', '/account',
]);
