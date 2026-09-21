import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CACHE_PREFIX,
  isCacheableAssetRequest,
  isOwnedCache,
  isPublicStaticFile,
} from '../../src/lib/service-worker-policy.js';

/** @param {string} path */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('M7 canonical service worker caches only explicit public/build assets', () => {
  assert.equal(existsSync(new URL('../../src/service-worker.ts', import.meta.url)), true);
  const assets = new Set(['/_app/immutable/app.js', '/manifest.webmanifest', '/icons/icon.svg']);
  /** @param {string} path @param {Partial<{ method: string, mode: string, url: string }>} [options] */
  const request = (path, options = {}) => ({
    method: 'GET', mode: 'cors', url: `https://console.test${path}`, ...options,
  });
  assert.equal(isCacheableAssetRequest(request('/_app/immutable/app.js'), 'https://console.test', assets), true);
  assert.equal(isCacheableAssetRequest(request('/manifest.webmanifest'), 'https://console.test', assets), true);
  for (const path of [
    '/', '/account', '/login', '/api/session', '/api/docs/services',
    '/api/services/media/media/files/id/bytes/original',
    '/api/services/audit/audit/events/export',
    '/api/services/shortlink/shortlink/links/id/qr.png',
  ]) {
    assert.equal(isCacheableAssetRequest(request(path), 'https://console.test', assets), false, path);
  }
  assert.equal(isCacheableAssetRequest(request('/_app/immutable/app.js', { mode: 'navigate' }), 'https://console.test', assets), false);
  assert.equal(isCacheableAssetRequest(request('/_app/immutable/app.js', { method: 'POST' }), 'https://console.test', assets), false);
  assert.equal(isCacheableAssetRequest({
    ...request('/_app/immutable/app.js'), url: 'https://outside.test/_app/immutable/app.js',
  }, 'https://console.test', assets), false);
  assert.equal(isPublicStaticFile('/manifest.webmanifest'), true);
  assert.equal(isPublicStaticFile('/icons/icon.svg'), true);
  assert.equal(isPublicStaticFile('/private.html'), false);
  const worker = read('../../src/service-worker.ts');
  assert.match(worker, /cache\.addAll\(PRECACHE\)/);
  assert.doesNotMatch(worker, /cache\.addAll\(ASSETS\)/);
});

test('M7 cache migration removes only canonical and legacy Console cache families', () => {
  assert.equal(CACHE_PREFIX, 'atc-console-static-');
  assert.equal(isOwnedCache('atc-console-static-new'), true);
  assert.equal(isOwnedCache('console-legacy-build'), true);
  assert.equal(isOwnedCache('unrelated-application-cache'), false);
});

test('M7 layouts own cross-cutting integration exactly once and preserve CSP', () => {
  const root = read('../../src/routes/+layout.svelte');
  const allLayouts = `${root}\n${read('../../src/routes/(app)/+layout.svelte')}`;
  assert.equal((allLayouts.match(/<Toasts\s*\/>/g) ?? []).length, 1);
  assert.match(root, /return pwa\.init\(\)/);
  const app = read('../../src/app.html');
  assert.match(app, /nonce="%sveltekit\.nonce%"/);
  assert.match(app, /console\.theme/);
  const config = read('../../svelte.config.js');
  assert.doesNotMatch(config, /unsafe-eval|https?:\/\/\*/);
  const copy = read('../../src/lib/components/CopyButton.svelte');
  assert.match(copy, /toasts\.ok\(t\('common\.copied'\)\)/);
  assert.match(copy, /toasts\.warn\(t\('common\.copyFailed'\)\)/);
  assert.doesNotMatch(copy, /toasts\.warn\(text\)/);
});

test('M7 docs renderer remains local, lazy, fixed-endpoint and reference-only', () => {
  const page = read('../../src/lib/pages/ApiDocs.svelte');
  const reference = read('../../src/lib/components/SwaggerReference.svelte');
  const client = read('../../src/lib/client/api-docs.js');
  const options = read('../../src/lib/client/swagger-config.js');
  assert.match(reference, /import\('swagger-ui-dist\/swagger-ui-es-bundle\.js'\)/);
  assert.match(reference, /import\('swagger-ui-dist\/swagger-ui\.css'\)/);
  assert.match(reference, /host\?\.replaceChildren\(\)/);
  assert.doesNotMatch(`${page}\n${client}`, /https?:\/\//);
  assert.match(client, /\/docs\/services\/\$\{encodeURIComponent\(selected\)\}\/openapi/);
  assert.doesNotMatch(page, /type=["']url["']|placeholder=.*url/i);
  assert.match(options, /supportedSubmitMethods:\s*\[\]/);
  assert.match(options, /persistAuthorization:\s*false/);
  assert.match(options, /withCredentials:\s*false/);
});
