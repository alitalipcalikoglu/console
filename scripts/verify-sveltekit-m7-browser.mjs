import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Config } from '../src/config.js';
import { ConsoleRuntime } from '../src/lib/server/runtime.js';

const PASSWORD = 'CorrectHorseBattery1!';
const SECRETS_KEY = '47'.repeat(32);
const SERVICE_KEY = 'm7-service-key-'.padEnd(40, 'x');
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const scratch = mkdtempSync(join(tmpdir(), 'console-m7-browser-'));
const artifacts = process.env.M7_ARTIFACT_DIR || join(scratch, 'evidence');
mkdirSync(artifacts, { recursive: true });

const freePort = () => new Promise((resolvePort, reject) => {
  const server = createTcpServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('could not allocate port'));
    server.close((error) => error ? reject(error) : resolvePort(address.port));
  });
});

const waitUntil = async (fn, label, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { last = error; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 75));
  }
  throw new Error(`${label} timed out${last ? `: ${last.message}` : ''}`);
};

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() { this.socket.close(); }
}

const childExit = (child) => child.exitCode !== null
  ? Promise.resolve(child.exitCode)
  : Promise.race([once(child, 'exit').then(([code]) => code), new Promise((_, reject) => setTimeout(() => reject(new Error('child exit timed out')), 10_000))]);

let runtime;
let chrome;
let downstream;
let cdp;
try {
  const downstreamPort = await freePort();
  let downstreamSawKey = false;
  const spec = JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'M7 Fixture API', version: '1.0.0', description: 'Local browser fixture' },
    paths: { '/v1/fixture': { get: { operationId: 'getFixture', responses: { 200: { description: 'Fixture response' } } } } },
  });
  downstream = createHttpServer((request, response) => {
    if (request.headers['x-api-key'] === SERVICE_KEY || request.headers.authorization === `Bearer ${SERVICE_KEY}`) downstreamSawKey = true;
    if (request.url === '/openapi.yaml') {
      response.writeHead(200, { 'content-type': 'application/yaml', 'content-length': Buffer.byteLength(spec) });
      response.end(spec);
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":{"code":"FIXTURE_NOT_FOUND","message":"fixture route not found"}}');
  });
  await new Promise((resolveListen, reject) => downstream.listen(downstreamPort, '127.0.0.1', (error) => error ? reject(error) : resolveListen()));

  const dbPath = join(scratch, 'console.db');
  const servicesFile = join(scratch, 'services.json');
  const types = ['notify', 'auth', 'media', 'gateway', 'audit', 'shortlink', 'flags', 'scheduler', 'webhook-out', 'search', 'ratelimit', 'geo'];
  writeFileSync(servicesFile, JSON.stringify({ services: types.map((type) => ({
    id: type,
    type,
    label: `${type[0].toUpperCase()}${type.slice(1)}`,
    url: `http://127.0.0.1:${downstreamPort}`,
    ...(type === 'gateway' ? { metricsTokenEnv: 'M7_SERVICE_KEY' } : { apiKeyEnv: 'M7_SERVICE_KEY' }),
  })) }));
  const seed = new ConsoleRuntime(Config.fromEnv({ DB_PATH: dbPath, SERVICES_FILE: servicesFile, LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SECRETS_KEY, M7_SERVICE_KEY: SERVICE_KEY }));
  await seed.adminService.create({ email: 'admin@m7.test', name: 'M7 Admin', password: PASSWORD, role: 'admin' }, null, { ip: null, userAgent: null });
  await seed.adminService.create({ email: 'viewer@m7.test', name: 'M7 Viewer', password: PASSWORD, role: 'viewer' }, null, { ip: null, userAgent: null });
  seed.finishShutdown();

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  runtime = fork(resolve('server.mjs'), [], {
    cwd: resolve('.'),
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', ORIGIN: origin,
      DB_PATH: dbPath, SERVICES_FILE: servicesFile, M7_SERVICE_KEY: SERVICE_KEY,
      LOG_LEVEL: 'silent', COOKIE_SECURE: 'false', SCRYPT_LOG_N: '14', SECRETS_KEY,
      SERVICE_TIMEOUT_MS: '1000', PUBLIC_DIR: join(scratch, 'missing-public'),
    },
    execArgv: ['--disable-warning=ExperimentalWarning'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let runtimeOutput = '';
  runtime.stdout?.on('data', (chunk) => { runtimeOutput += chunk; });
  runtime.stderr?.on('data', (chunk) => { runtimeOutput += chunk; });
  const ready = await Promise.race([once(runtime, 'message').then(([message]) => message), childExit(runtime).then(() => { throw new Error(runtimeOutput); })]);
  assert.equal(ready, 'ready');

  const debuggerPort = await freePort();
  chrome = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-default-apps', '--disable-sync', '--metrics-recording-only',
    '--safebrowsing-disable-auto-update', '--remote-allow-origins=*', `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${join(scratch, 'chrome')}`, '--window-size=1440,900',
    '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeOutput = '';
  chrome.stderr?.on('data', (chunk) => { chromeOutput += chunk; });
  await waitUntil(async () => (await fetch(`http://127.0.0.1:${debuggerPort}/json/version`)).ok, 'Chrome debugger');
  const target = await fetch(`http://127.0.0.1:${debuggerPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((response) => response.json());
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable'), cdp.send('Log.enable')]);
  const requests = [];
  const browserErrors = [];
  cdp.on('Network.requestWillBeSent', ({ request }) => requests.push({ url: request.url, headers: request.headers, method: request.method }));
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => browserErrors.push(exceptionDetails.text));
  cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') browserErrors.push(entry.text); });

  const evaluate = async (expression) => {
    const result = await Promise.race([
      cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('browser evaluation timed out')), 40_000)),
    ]);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async (path) => {
    await cdp.send('Page.navigate', { url: `${origin}${path}` });
    await waitUntil(() => evaluate(`document.readyState === 'complete' && location.origin === ${JSON.stringify(origin)}`), `navigate ${path}`);
  };
  const waitJs = (expression, label, timeout) => waitUntil(() => evaluate(expression), label, timeout);
  const screenshot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(artifacts, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const loginCookie = async (email, password) => {
    const response = await fetch(`${origin}/api/session/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    const pair = response.headers.get('set-cookie').split(';', 1)[0];
    const [name, value] = pair.split('=');
    await cdp.send('Network.setCookie', { name, value, url: origin, httpOnly: true, sameSite: 'Strict' });
  };

  await navigate('/docs?service=notify');
  await waitJs(`location.pathname === '/login'`, 'anonymous docs redirect');
  assert.equal(await evaluate(`document.querySelector('.shell') === null`), true);
  await screenshot('01-login-light-en');
  console.log('M7 browser: anonymous redirect/login OK');

  await loginCookie('admin@m7.test', PASSWORD);
  const viteManifest = JSON.parse(readFileSync('.svelte-kit/output/client/.vite/manifest.json', 'utf8'));
  const swaggerFile = viteManifest['node_modules/swagger-ui-dist/swagger-ui-es-bundle.js'].file;
  await navigate('/');
  await waitJs(`document.querySelector('.shell') !== null`, 'admin overview hydration');
  assert.equal(requests.some(({ url }) => url.endsWith(swaggerFile)), false, 'ordinary page downloaded Swagger');
  assert.equal(await evaluate(`document.querySelectorAll('.toasts').length`), 1);
  await screenshot('02-overview-light-en');
  console.log('M7 browser: overview/lazy Swagger boundary OK');

  const docsRequestStart = requests.length;
  await navigate('/docs?service=notify');
  await waitJs(`document.querySelectorAll('#docs-service option').length === 13`, 'fixed docs catalog');
  await waitJs(`document.querySelectorAll('.swagger-ui .opblock').length > 0`, 'Swagger operations', 30_000);
  assert.equal(await evaluate(`document.querySelector('.swagger-ui .info .title')?.textContent.includes('M7 Fixture API')`), true);
  assert.equal(requests.slice(docsRequestStart).some(({ url }) => url.endsWith(swaggerFile)), true, 'docs did not load local Swagger chunk');
  assert.equal(await evaluate(`[...document.querySelectorAll('.try-out,.authorize,.authorization__btn,.execute-wrapper')].every((node) => getComputedStyle(node).display === 'none')`), true);
  assert.equal(await evaluate(`document.querySelector('.download-url-wrapper') === null`), true);
  assert.equal(await evaluate(`document.querySelector('#docs-service').tagName === 'SELECT'`), true);
  await evaluate(`(() => { const select = document.querySelector('#docs-service'); select.value = 'auth'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitJs(`location.search === '?service=auth' && document.querySelectorAll('.swagger-ui .opblock').length > 0`, 'second docs service', 30_000);
  assert.ok(requests.some(({ url }) => url === `${origin}/api/docs/services/notify/openapi`));
  assert.ok(requests.some(({ url }) => url === `${origin}/api/docs/services/auth/openapi`));
  assert.equal(downstreamSawKey, true, 'server did not authenticate downstream docs request');
  const browserRequestDump = JSON.stringify(requests);
  assert.equal(browserRequestDump.includes(SERVICE_KEY), false, 'downstream service key reached browser requests');
  assert.equal(requests.some(({ url }) => !url.startsWith(origin) && !url.startsWith('data:')), false, 'page contacted an external origin');
  await screenshot('03-docs-light-en');
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitJs(`location.search === '?service=auth' && document.querySelectorAll('.swagger-ui .opblock').length > 0`, 'docs deep-link refresh', 30_000);
  console.log('M7 browser: docs catalog/render/switch/deep-link/network OK');

  await waitJs(`navigator.serviceWorker.ready.then(() => true)`, 'service worker ready', 30_000);
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitJs(`navigator.serviceWorker.controller?.scriptURL.includes('/service-worker.js')`, 'service worker controller', 30_000);
  let cacheAudit = await evaluate(`(async () => Promise.all((await caches.keys()).map(async (name) => ({ name, urls: (await (await caches.open(name)).keys()).map((request) => request.url) }))))()`);
  assert.ok(cacheAudit.some(({ name }) => name.startsWith('atc-console-static-')));
  assert.ok(cacheAudit.flatMap(({ urls }) => urls).some((url) => url.endsWith('/manifest.webmanifest')));
  const forbiddenCache = (url) => new URL(url).pathname.startsWith('/api') || ['/', '/account', '/docs', '/login'].includes(new URL(url).pathname);
  assert.equal(cacheAudit.flatMap(({ urls }) => urls).some(forbiddenCache), false);
  await evaluate(`Promise.allSettled([
    fetch('/api/session'),
    fetch('/api/docs/services'),
    fetch('/api/services/media/media/files/id/bytes/original'),
    fetch('/api/services/audit/audit/events/export'),
    fetch('/api/services/shortlink/shortlink/links/id/qr.png'),
    fetch('/api/services/media/media/files', { method: 'PUT', headers: { 'x-console-request': '1', 'content-type': 'application/octet-stream' }, body: new Uint8Array([1,2,3]) })
  ])`);
  cacheAudit = await evaluate(`(async () => Promise.all((await caches.keys()).map(async (name) => ({ name, urls: (await (await caches.open(name)).keys()).map((request) => request.url) }))))()`);
  assert.equal(cacheAudit.flatMap(({ urls }) => urls).some((url) => new URL(url).pathname.startsWith('/api')), false);
  console.log('M7 browser: canonical SW activation/static cache/API+binary bypass OK');

  await evaluate(`(async () => {
    await (await caches.open('console-legacy-m7')).put('/legacy-sensitive', new Response('legacy'));
    await (await caches.open('unrelated-m7')).put('/keep', new Response('keep'));
    const previous = await navigator.serviceWorker.getRegistration('/');
    await previous.unregister();
    const next = await navigator.serviceWorker.register('/service-worker.js?migration=m7', { scope: '/' });
    const worker = next.installing || next.waiting || next.active;
    const state = (wanted) => worker.state === wanted ? Promise.resolve() : new Promise((resolveState) => worker.addEventListener('statechange', () => worker.state === wanted && resolveState()));
    if (worker.state === 'installing') await state('installed');
    if (worker.state === 'installed') worker.postMessage('skipWaiting');
    if (worker.state !== 'activated') await state('activated');
  })()`);
  await waitJs(`caches.keys().then((keys) => !keys.includes('console-legacy-m7') && keys.includes('unrelated-m7'))`, 'legacy cache migration');
  assert.equal(await evaluate(`navigator.serviceWorker.getRegistration('/').then((registration) => !registration.active.scriptURL.includes('/sw.js'))`), true);
  console.log('M7 browser: legacy worker/cache migration ownership OK');

  await navigate('/account');
  await waitJs(`document.querySelector('#cp') !== null`, 'account hydration');
  const clickAccountChoice = (group, choice) => evaluate(`(() => { const button = document.querySelectorAll('.seg')[${group}]?.querySelectorAll('button')[${choice}]; if (!button) return false; button.click(); return true; })()`);
  const chooseAccount = (group, choice, condition, label) => waitUntil(async () => {
    if (!await clickAccountChoice(group, choice)) return false;
    return evaluate(condition);
  }, label);
  await chooseAccount(0, 2, `localStorage.getItem('console.theme') === 'dark'`, 'dark theme selection');
  assert.deepEqual(await evaluate(`({ attr: document.documentElement.dataset.theme, stored: localStorage.getItem('console.theme') })`), { attr: 'dark', stored: 'dark' });
  await screenshot('04-account-dark-en');
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitJs(`document.documentElement.dataset.theme === 'dark' && document.querySelector('#cp')`, 'dark theme reload');
  await chooseAccount(0, 0, `localStorage.getItem('console.theme') === null`, 'system theme selection');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  assert.deepEqual(await evaluate(`({ attr: document.documentElement.hasAttribute('data-theme'), stored: localStorage.getItem('console.theme'), scheme: getComputedStyle(document.documentElement).colorScheme })`), { attr: false, stored: null, scheme: 'dark' });
  await chooseAccount(1, 0, `localStorage.getItem('console.lang') === 'tr'`, 'Turkish selection');
  assert.equal(await evaluate(`document.documentElement.lang`), 'tr');
  assert.equal(await evaluate(`localStorage.getItem('console.lang')`), 'tr');
  await navigate('/notify/notify?status=sent');
  await waitJs(`document.documentElement.lang === 'tr' && location.search === '?status=sent'`, 'Turkish dynamic deep link');
  await screenshot('05-dynamic-dark-tr');
  console.log('M7 browser: theme/system/i18n persistence and dynamic query OK');
  await navigate('/account');
  await chooseAccount(1, 1, `localStorage.getItem('console.lang') === 'en'`, 'English selection');
  await chooseAccount(0, 1, `localStorage.getItem('console.theme') === 'light'`, 'light theme selection');
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await waitJs(`document.querySelector('.toast.info') !== null`, 'service-worker update toast');
  assert.equal(await evaluate(`document.querySelectorAll('.toasts').length`), 1);
  await evaluate(`document.querySelector('nav.nav a[href="/docs"]').click()`);
  await waitJs(`location.pathname === '/docs'`, 'client navigation with toast');
  assert.equal(await evaluate(`document.querySelector('.toast.info') !== null && document.querySelectorAll('.toasts').length === 1`), true);
  console.log('M7 browser: singleton/navigation toast lifecycle OK');
  await evaluate(`(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration.waiting) return;
    const changed = new Promise((resolveChange) => navigator.serviceWorker.addEventListener('controllerchange', resolveChange, { once: true }));
    registration.waiting.postMessage('skipWaiting');
    await changed;
  })()`);

  await navigate('/docs?service=notify');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await waitJs(`document.querySelector('.swagger-ui .opblock') !== null`, 'narrow docs', 30_000);
  const overflow = await evaluate(`({ body: document.body.scrollWidth, viewport: document.documentElement.clientWidth })`);
  assert.ok(overflow.body <= overflow.viewport + 1, JSON.stringify(overflow));
  await screenshot('06-docs-narrow-light-en');
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  const storage = await evaluate(`(async () => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    indexedDb: indexedDB.databases ? (await indexedDB.databases()).map((db) => db.name) : [],
    cookiesVisibleToScript: document.cookie,
    caches: await Promise.all((await caches.keys()).map(async (name) => ({ name, urls: (await (await caches.open(name)).keys()).map((request) => request.url) })))
  }))()`);
  assert.deepEqual(Object.keys(storage.local).sort(), ['console.lang', 'console.theme']);
  assert.ok(Object.keys(storage.session).every((key) => key.startsWith('sveltekit:')));
  assert.deepEqual(storage.indexedDb, []);
  assert.equal(storage.cookiesVisibleToScript, '');
  assert.equal(JSON.stringify(storage).includes(PASSWORD), false);
  assert.equal(JSON.stringify(storage).includes(SERVICE_KEY), false);
  assert.equal(storage.caches.flatMap(({ urls }) => urls).some((url) => new URL(url).pathname.startsWith('/api')), false);
  console.log('M7 browser: narrow viewport and browser storage audit OK');

  await navigate('/account');
  await evaluate(`document.querySelector('.page-actions button').click()`);
  await waitJs(`document.querySelector('[role="dialog"]') !== null`, 'logout confirmation');
  await evaluate(`document.querySelector('.dialog-foot button:last-child').click()`);
  await waitJs(`location.pathname === '/login' && document.querySelector('.shell') === null`, 'logout');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Page.navigate', { url: `${origin}/account` });
  await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  assert.equal(await evaluate(`document.body.textContent.includes('M7 Admin') || document.querySelector('.shell') !== null`).catch(() => false), false, 'offline navigation recovered protected HTML');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await cdp.send('Network.clearBrowserCookies');
  await loginCookie('viewer@m7.test', PASSWORD);
  await navigate('/docs?service=notify');
  await waitJs(`document.querySelector('.swagger-ui .opblock') !== null`, 'viewer docs access', 30_000);
  await cdp.send('Network.clearBrowserCookies');
  await navigate('/docs');
  await waitJs(`location.pathname === '/login'`, 'final anonymous redirect');

  assert.equal(browserErrors.some((message) => /hydration|Content Security Policy|Refused to execute|unsafe-eval/i.test(message)), false, browserErrors.join('\n'));
  console.log(`M7 real Chrome: docs/admin/viewer/SW/cache/theme/i18n/toast/logout/offline/storage passed; evidence ${artifacts}`);
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await childExit(chrome).catch(async () => {
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
      await childExit(chrome).catch(() => {});
    });
  }
  if (runtime && runtime.exitCode === null) {
    runtime.kill('SIGTERM');
    await childExit(runtime).catch(() => runtime.kill('SIGKILL'));
  }
  if (downstream) await new Promise((resolveClose) => downstream.close(() => resolveClose()));
  if (!process.env.M7_ARTIFACT_DIR) rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
