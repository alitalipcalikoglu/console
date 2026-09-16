/** Light / dark / system preference, applied to <html data-theme>. */
export class Theme {
  constructor() {
    /** @type {'system'|'light'|'dark'} */
    this.mode = $state(Theme.#initial());
  }

  static #initial() {
    try {
      const v = localStorage.getItem('console.theme');
      if (v === 'light' || v === 'dark') return v;
    } catch { /* ignore */ }
    return 'system';
  }

  /** @param {'system'|'light'|'dark'} mode */
  set(mode) {
    this.mode = mode;
    if (mode === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    try { mode === 'system' ? localStorage.removeItem('console.theme') : localStorage.setItem('console.theme', mode); } catch { /* ignore */ }
  }

  toggle() {
    const dark = this.mode === 'dark' || (this.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    this.set(dark ? 'light' : 'dark');
  }
}

export const theme = new Theme();
