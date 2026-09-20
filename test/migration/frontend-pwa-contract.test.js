import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import ts from 'typescript';
import { startConsole } from './helpers.js';

const expectedRoutes = JSON.parse(readFileSync(new URL('./fixtures/frontend-routes.json', import.meta.url), 'utf8'));

/** @returns {string[]|null} */
function currentRouterPatterns() {
  const file = new URL('../../ui/src/lib/router.svelte.js', import.meta.url);
  const source = readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {string[]|null} */ let routes = null;
  /** @param {import('typescript').Node} node */
  function visit(node) {
    if (ts.isNewExpression(node) && node.expression.getText(tree) === 'Router' && node.arguments?.[0] && ts.isArrayLiteralExpression(node.arguments[0])) {
      routes = node.arguments[0].elements.filter(ts.isStringLiteral).map((element) => element.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return routes;
}

/** @type {Awaited<ReturnType<typeof startConsole>>} */ let consoleApp;
before(async () => { consoleApp = await startConsole(); });
after(async () => consoleApp.close());

test('frontend oracle: the current router exposes exactly the frozen 34 browser patterns', () => {
  const actual = currentRouterPatterns();
  assert.ok(actual);
  assert.equal(actual.length, 34);
  assert.deepEqual(actual, expectedRoutes);
});

test('frontend oracle: all 34 representative deep links resolve through the current SPA', async () => {
  /** @param {string} pattern */
  const materialize = (pattern) => pattern.replaceAll(':sid', 'fixture-service').replaceAll(':id', 'fixture-id');
  const index = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
  for (const pattern of expectedRoutes) {
    const response = await fetch(`${consoleApp.origin}${materialize(pattern)}`);
    assert.equal(response.status, 200, pattern);
    assert.equal(await response.text(), index, pattern);
  }
});

test('frontend oracle: unknown non-file URLs use SPA fallback while API/file URLs stay JSON 404', async () => {
  let response = await fetch(`${consoleApp.origin}/unknown/deep/link`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<div id="app"><\/div>/);
  response = await fetch(`${consoleApp.origin}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'route not found' } });
  response = await fetch(`${consoleApp.origin}/missing.js`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'file not found' } });
});

test('frontend oracle: login/auth routing is client-side today and API access remains server-enforced', async () => {
  const appSource = readFileSync(new URL('../../ui/src/App.svelte', import.meta.url), 'utf8');
  assert.match(appSource, /!signedIn && router\.path !== '\/login'.*router\.go\('\/login'/s);
  assert.match(appSource, /signedIn && router\.path === '\/login'.*router\.go\('\/'/s);
  const deepLink = await fetch(`${consoleApp.origin}/admins`);
  assert.equal(deepLink.status, 200, 'SSR does not exist yet; the static shell is delivered before the client guard');
  const protectedApi = await fetch(`${consoleApp.origin}/api/admins`);
  assert.equal(protectedApi.status, 401);
});

test('PWA oracle: manifest, registration, cache boundary, offline fallback and update protocol', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../ui/public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual({ id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, display: manifest.display }, { id: '/', start_url: '/', scope: '/', display: 'standalone' });
  assert.ok(manifest.icons.some((/** @type {{ src: string }} */ icon) => icon.src === '/icons/icon.svg'));
  const pwa = readFileSync(new URL('../../ui/src/lib/pwa.svelte.js', import.meta.url), 'utf8');
  assert.match(pwa, /register\('\/sw\.js'\)/);
  assert.match(pwa, /postMessage\('skipWaiting'\)/);
  const worker = readFileSync(new URL('../../ui/build/sw.template.js', import.meta.url), 'utf8');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /req\.mode === 'navigate'/);
  assert.match(worker, /caches\.match\('\/index\.html'\)/);
  const plugin = readFileSync(new URL('../../ui/build/service-worker-plugin.js', import.meta.url), 'utf8');
  assert.match(plugin, /\['\/', '\/index\.html', '\/manifest\.webmanifest'/);
});
