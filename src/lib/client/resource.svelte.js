/**
 * Reactive holder for one async load: data, error, loading flag, reload. Pages create one per
 * request so templates can branch on `loading` / `error` / `data` without ad-hoc state.
 * @template T
 */
export class Resource {
  /** @param {() => Promise<T>} loader */
  constructor(loader) {
    this.loader = loader;
    /** @type {T|null} */
    this.data = $state(null);
    /** @type {unknown} */
    this.error = $state(null);
    this.loading = $state(false);
    this.loaded = $state(false);
    this.seq = 0;
  }

  async load() {
    const seq = ++this.seq;
    this.loading = true;
    this.error = null;
    try {
      const d = await this.loader();
      if (seq === this.seq) { this.data = d; this.loaded = true; }
    } catch (err) {
      if (seq === this.seq) this.error = err;
    } finally {
      if (seq === this.seq) this.loading = false;
    }
    return this;
  }

  /** @param {(d: T) => T} fn */
  update(fn) {
    if (this.data !== null) this.data = fn(this.data);
  }
}
