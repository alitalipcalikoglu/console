import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const workerPath = 'build/client/service-worker.js';
assert.equal(existsSync(workerPath), true, 'canonical SvelteKit service worker must be emitted');
const worker = readFileSync(workerPath, 'utf8');
assert.match(worker, /atc-console-static-/);
assert.match(worker, /console-/);
assert.match(worker, /\/api/);
assert.match(worker, /navigate/);
assert.doesNotMatch(worker, /prerendered|index\.html/);
for (const forbidden of ['SECRETS_KEY', 'SERVICE_API_KEY', 'console_session=', 'BEGIN PRIVATE KEY']) {
  assert.equal(worker.includes(forbidden), false, `${forbidden} leaked into the public worker`);
}

const manifest = JSON.parse(readFileSync('build/client/manifest.webmanifest', 'utf8'));
assert.deepEqual(
  { name: manifest.name, short_name: manifest.short_name, id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, display: manifest.display },
  { name: 'Console', short_name: 'Console', id: '/', start_url: '/', scope: '/', display: 'standalone' },
);
assert.ok(manifest.icons.some((icon) => String(icon.purpose).split(' ').includes('maskable')));
for (const icon of manifest.icons) {
  const path = join('build/client', icon.src.replace(/^\//, ''));
  assert.equal(existsSync(path), true, `missing manifest icon ${icon.src}`);
  assert.ok(statSync(path).size > 0, `empty manifest icon ${icon.src}`);
}

const viteManifest = JSON.parse(readFileSync('.svelte-kit/output/client/.vite/manifest.json', 'utf8'));
const swagger = viteManifest['node_modules/swagger-ui-dist/swagger-ui-es-bundle.js'];
assert.ok(swagger, 'Swagger UI production chunk is missing');
assert.equal(swagger.isDynamicEntry, true, 'Swagger UI must remain a dynamic route-level import');
const swaggerPath = join('.svelte-kit/output/client', swagger.file);
assert.ok(statSync(swaggerPath).size > 1_000_000, 'expected local Swagger renderer measurement');
for (const entry of Object.values(viteManifest).filter((value) => value.isEntry)) {
  assert.notEqual(entry.file, swagger.file, 'Swagger must not be an application entry');
  assert.equal(entry.imports?.includes('node_modules/swagger-ui-dist/swagger-ui-es-bundle.js') ?? false, false, 'entry eagerly imports Swagger');
}

const sourceWorker = readFileSync('src/service-worker.ts', 'utf8');
assert.match(sourceWorker, /cache\.addAll\(PRECACHE\)/);
assert.doesNotMatch(sourceWorker, /cache\.addAll\(ASSETS\)/);
assert.doesNotMatch(sourceWorker, /from ['"]\$lib\/server/);

console.log(`SvelteKit M7 build: SW ${statSync(workerPath).size} B; local lazy Swagger ${statSync(swaggerPath).size} B; manifest/icons/security policy OK`);
