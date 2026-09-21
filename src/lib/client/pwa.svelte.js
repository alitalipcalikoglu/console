/** Service-worker registration, update prompt, install prompt and online state. */
export class Pwa {
  constructor() {
    this.updateReady = $state(false);
    this.online = $state(true);
    this.canInstall = $state(false);
    /** @type {any} */
    this.installEvent = null;
    /** @type {ServiceWorkerRegistration|null} */
    this.registration = null;
  }

  init() {
    this.online = navigator.onLine;
    window.addEventListener('online', () => { this.online = true; });
    window.addEventListener('offline', () => { this.online = false; });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installEvent = e; this.canInstall = true; });
    window.addEventListener('appinstalled', () => { this.canInstall = false; });
    // M7 replaces the legacy SPA worker. Canonical SSR pages deliberately do not register it.
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
