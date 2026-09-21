import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

/** @param {string} path */
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('M1 foundation keeps production and SvelteKit runtimes separate', () => {
  const pkg = JSON.parse(read('../../package.json'));
  assert.equal(pkg.scripts.start, 'node --disable-warning=ExperimentalWarning src/index.js');
  assert.equal(pkg.scripts.build, 'vite build --config vite.legacy.config.js');
  assert.equal(pkg.scripts['kit:build'], 'vite build');
  assert.match(read('../../vite.config.ts'), /sveltekit\(\)/);
  assert.doesNotMatch(read('../../vite.config.ts'), /fastify|proxy|fallback/i);
  assert.match(read('../../vite.legacy.config.js'), /root:\s*'ui'/);
  assert.match(read('../../svelte.config.js'), /adapter\(\)/);
  assert.doesNotMatch(read('../../svelte.config.js'), /adapter-static|ssr\s*:\s*false/);
});

test('SvelteKit owns the M1-M4 explicit endpoints without migrating legacy pages', () => {
  assert.equal(existsSync(new URL('../../src/app.html', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../src/routes/+layout.svelte', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../src/routes/+page.svelte', import.meta.url)), true);
  assert.equal(existsSync(new URL('../../src/routes/+page.server.ts', import.meta.url)), true);
  const routeFiles = readdirSync(new URL('../../src/routes/', import.meta.url), { recursive: true });
  assert.equal(routeFiles.filter((path) => String(path).endsWith('+server.ts')).length, 119);
  assert.equal(routeFiles.filter((path) => String(path).endsWith('+page.svelte')).length, 1);
  assert.match(read('../../src/routes/+page.server.ts'), /\$lib\/server\/foundation/);
  assert.doesNotMatch(read('../../src/routes/+page.svelte'), /\$lib\/server/);
  assert.match(routeFiles.map(String).join('\n'), /\[sid\]/);
  assert.match(routeFiles.map(String).join('\n'), /\[id\]/);
  assert.doesNotMatch(routeFiles.map(String).join('\n'), /\[\.\.\./);
});
