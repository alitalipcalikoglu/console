/** Service-worker registration, update prompt, install prompt and online state. */
export class Pwa {
  constructor() {
    this.updateReady = $state(false);
    this.online = $state(navigator.onLine);
    this.canInstall = $state(false);
    /** @type {any} */
    this.installEvent = null;
    /** @type {ServiceWorkerRegistration|null} */
    this.registration = null;
  }

  init() {
    window.addEventListener('online', () => { this.online = true; });
    window.addEventListener('offline', () => { this.online = false; });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installEvent = e; this.canInstall = true; });
    window.addEventListener('appinstalled', () => { this.canInstall = false; });
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      this.registration = reg;
      const watch = (/** @type {ServiceWorker|null} */ w) => {
        if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) this.updateReady = true; });
      };
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) return; refreshing = true; location.reload(); });
  }

  applyUpdate() {
    this.registration?.waiting?.postMessage('skipWaiting');
  }

  async install() {
    if (!this.installEvent) return;
    this.installEvent.prompt();
    await this.installEvent.userChoice;
    this.installEvent = null;
    this.canInstall = false;
  }
}

export const pwa = new Pwa();
