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
    /** @type {(() => void)|null} */
    this.cleanup = null;
    this.reloadForUpdate = false;
  }

  init() {
    if (this.cleanup) return this.cleanup;
    this.online = navigator.onLine;
    const online = () => { this.online = true; };
    const offline = () => { this.online = false; };
    const beforeInstall = (/** @type {any} */ event) => {
      event.preventDefault();
      this.installEvent = event;
      this.canInstall = true;
    };
    const installed = () => { this.installEvent = null; this.canInstall = false; };
    const controllerChanged = () => {
      if (!this.reloadForUpdate) return;
      this.reloadForUpdate = false;
      location.reload();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);

    /** @type {ServiceWorkerRegistration|null} */
    let watched = null;
    /** @type {number|undefined} */
    let updateTimer;
    /** @type {(() => void)|null} */
    let removeRegistrationListener = null;
    const attach = (/** @type {ServiceWorkerRegistration} */ registration) => {
      if (watched === registration) return;
      removeRegistrationListener?.();
      watched = registration;
      this.registration = registration;
      if (registration.waiting) this.updateReady = true;
      const watch = (/** @type {ServiceWorker|null} */ worker) => {
        if (!worker) return;
        const stateChanged = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) this.updateReady = true;
        };
        worker.addEventListener('statechange', stateChanged);
      };
      const updateFound = () => watch(registration.installing);
      registration.addEventListener('updatefound', updateFound);
      watch(registration.installing);
      removeRegistrationListener = () => registration.removeEventListener('updatefound', updateFound);
      updateTimer = window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    };

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
      navigator.serviceWorker.getRegistration('/').then((registration) => {
        if (registration) attach(registration);
        else navigator.serviceWorker.ready.then(attach).catch(() => {});
      }).catch(() => {});
    }

    this.cleanup = () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      removeRegistrationListener?.();
      if (updateTimer !== undefined) clearInterval(updateTimer);
      this.cleanup = null;
    };
    return this.cleanup;
  }

  applyUpdate() {
    this.reloadForUpdate = true;
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
