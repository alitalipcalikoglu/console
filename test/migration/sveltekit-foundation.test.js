import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

/** @param {string} path */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('M8 final architecture has one SvelteKit application and adapter-node runtime', () => {
  const pkg = JSON.parse(read('../../package.json'));
  assert.equal(pkg.main, 'server.mjs');
  assert.equal(pkg.scripts.start, 'node --disable-warning=ExperimentalWarning server.mjs');
  assert.equal(pkg.scripts.dev, 'vite dev');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.scripts['dev:ui'], undefined);
  assert.equal(pkg.dependencies.fastify, undefined);
  assert.equal(pkg.dependencies['@fastify/static'], undefined);
  assert.equal(existsSync(new URL('../../ui/', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../vite.legacy.config.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../src/index.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../src/http/console-api.js', import.meta.url)), false);
  assert.match(read('../../vite.config.ts'), /sveltekit\(\)/);
  assert.doesNotMatch(read('../../vite.config.ts'), /fastify|proxy|fallback/i);
  assert.match(read('../../svelte.config.js'), /adapter\(\)/);
  assert.doesNotMatch(read('../../svelte.config.js'), /adapter-static|ssr\s*:\s*false/);
});

test('SvelteKit owns all explicit endpoints and filesystem pages', () => {
  assert.equal(existsSync(new URL('../../src/app.html', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../src/routes/+layout.svelte', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../src/routes/(app)/+page.svelte', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../src/routes/(app)/+layout.server.ts', import.meta.url)), true);
  const routeFiles = readdirSync(new URL('../../src/routes/', import.meta.url), { recursive: true });
  assert.equal(routeFiles.filter((path) => String(path).endsWith('+server.ts')).length, 122);
  assert.equal(routeFiles.filter((path) => String(path).endsWith('+page.svelte')).length, 34);
  assert.doesNotMatch(read('../../src/routes/(app)/+page.svelte'), /\$lib\/server/);
  assert.match(routeFiles.map(String).join('\n'), /\[sid\]/);
  assert.match(routeFiles.map(String).join('\n'), /\[id\]/);
  assert.doesNotMatch(routeFiles.map(String).join('\n'), /\[\.\.\./);
});
