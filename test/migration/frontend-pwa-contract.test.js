import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

function svelteKitPagePatterns() {
  const files = readdirSync(new URL('../../src/routes/', import.meta.url), { recursive: true })
    .map(String)
    .filter((path) => path.endsWith('+page.svelte'));
  return files.map((file) => {
    const directories = file.split('/').slice(0, -1)
      .filter((segment) => !/^\(.+\)$/.test(segment))
      .map((segment) => /^\[([^\]]+)\]$/.exec(segment)?.[1])
      .map((parameter, index) => parameter ? `:${parameter}` : file.split('/').slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment))[index]);
    return directories.length ? `/${directories.join('/')}` : '/';
  });
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

test('M6 gate: SvelteKit filesystem pages own exactly the frozen 34 browser patterns', () => {
  const actual = svelteKitPagePatterns();
  assert.equal(actual.length, 34);
  assert.deepEqual(actual.sort(), [...expectedRoutes].sort());
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

test('frontend oracle: legacy routing remains compatibility source while M6 guards are server-side', async () => {
  const appLayout = readFileSync(new URL('../../src/routes/(app)/+layout.server.ts', import.meta.url), 'utf8');
  const login = readFileSync(new URL('../../src/routes/(public)/login/+page.server.ts', import.meta.url), 'utf8');
  assert.match(appLayout, /redirect\(303, '\/login'\)/);
  assert.match(login, /redirect\(303, '\/'\)/);
  const deepLink = await fetch(`${consoleApp.origin}/admins`);
  assert.equal(deepLink.status, 200, 'legacy production compatibility still serves the SPA until M8');
  const protectedApi = await fetch(`${consoleApp.origin}/api/admins`);
  assert.equal(protectedApi.status, 401);
});

test('M6 canonical source has no custom router, App switch or SPA fallback dependency', () => {
  const source = readdirSync(new URL('../../src/', import.meta.url), { recursive: true })
    .map(String)
    .filter((path) => /\.(?:svelte|js|ts)$/.test(path))
    .map((path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /router\.svelte|pushState|popstate|ui\/src\/App\.svelte/);
  assert.doesNotMatch(source, /export\s+const\s+ssr\s*=\s*false/);
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
