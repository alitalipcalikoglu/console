import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { signIn } from '../helpers.js';
import { startConsole } from './helpers.js';

const expectedRoutes = JSON.parse(readFileSync(new URL('./fixtures/frontend-routes.json', import.meta.url), 'utf8'));

function svelteKitPagePatterns() {
  const files = readdirSync(new URL('../../src/routes/', import.meta.url), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith('+page.svelte'));
  return files.map((file) => {
    const raw = file.split('/').slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment));
    const directories = raw.map((segment) => /^\[([^\]]+)\]$/.exec(segment)?.[1]).map((parameter, index) => parameter ? `:${parameter}` : raw[index]);
    return directories.length ? `/${directories.join('/')}` : '/';
  });
}

/** @param {string} pattern */
function materialize(pattern) {
  const service = pattern.split('/')[1];
  return pattern.replaceAll(':sid', service === 'webhook-out' ? 'webhooks' : service).replaceAll(':id', 'fixture-id');
}

/** @type {Awaited<ReturnType<typeof startConsole>>} */ let consoleApp;
/** @type {string} */ let cookie;
before(async () => {
  consoleApp = await startConsole();
  cookie = (await signIn(consoleApp)).cookie;
});
after(async () => consoleApp.close());

test('final frontend gate: filesystem pages own exactly the frozen 34 browser patterns', () => {
  const actual = svelteKitPagePatterns();
  assert.equal(actual.length, 34);
  assert.deepEqual(actual.sort(), [...expectedRoutes].sort());
});

test('all 34 representative routes load directly through adapter-node', async () => {
  for (const pattern of expectedRoutes) {
    const response = await fetch(`${consoleApp.origin}${materialize(pattern)}`, { headers: pattern === '/login' ? {} : { cookie }, redirect: 'manual' });
    assert.equal(response.status, 200, pattern);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  }
});

test('filesystem guards and 404 behavior replace the legacy SPA fallback', async () => {
  let response = await fetch(`${consoleApp.origin}/admins`, { redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login');
  response = await fetch(`${consoleApp.origin}/unknown/deep/link`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  response = await fetch(`${consoleApp.origin}/api/not-a-route`, { headers: { cookie } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'route not found' } });
});

test('canonical source has no custom router, App switch or SPA fallback dependency', () => {
  const source = readdirSync(new URL('../../src/', import.meta.url), { recursive: true })
    .map(String)
    .filter((path) => /\.(?:svelte|js|ts)$/.test(path))
    .map((path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /router\.svelte|ui\/src\/App\.svelte|serve\s+index\.html/i);
  assert.doesNotMatch(source, /export\s+const\s+ssr\s*=\s*false/);
});

test('canonical PWA caches assets only and retains legacy-cache cleanup', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../../static/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual({ id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, display: manifest.display }, { id: '/', start_url: '/', scope: '/', display: 'standalone' });
  assert.ok(manifest.icons.some((/** @type {{ src: string }} */ icon) => icon.src === '/icons/icon.svg'));
  const pwa = readFileSync(new URL('../../src/lib/client/pwa.svelte.js', import.meta.url), 'utf8');
  assert.match(pwa, /postMessage\('skipWaiting'\)/);
  const worker = readFileSync(new URL('../../src/service-worker.ts', import.meta.url), 'utf8');
  const policy = readFileSync(new URL('../../src/lib/service-worker-policy.js', import.meta.url), 'utf8');
  assert.match(worker, /isCacheableAssetRequest/);
  assert.match(policy, /LEGACY_CACHE_PREFIX\s*=\s*'console-'/);
  assert.match(policy, /request\.mode === 'navigate'/);
  assert.match(policy, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(worker, /index\.html|respondWith\([^)]*navigate/s);
  const response = await fetch(`${consoleApp.origin}/service-worker.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /javascript/);
});
