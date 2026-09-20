import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const CLIENT_ROOT = 'build/client';
const SERVER_SENTINEL = 'M1_SERVER_ONLY_BOUNDARY_6f0d44b1';

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('could not allocate a TCP port'));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function fetchReady(origin, child, diagnostics) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`adapter-node exited early (${child.exitCode}): ${diagnostics()}`);
    try {
      return await fetch(origin);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`adapter-node did not become ready: ${diagnostics()}`);
}

assert.equal(existsSync('build/index.js'), true, 'adapter-node entrypoint must exist');
assert.equal(existsSync('build/handler.js'), true, 'adapter-node handler must exist');
assert.equal(existsSync(CLIENT_ROOT), true, 'hydration client output must exist');
assert.equal(existsSync('build/index.html'), false, 'adapter-node must not produce a static SPA entrypoint');

const browserBundle = files(CLIENT_ROOT).map((path) => readFileSync(path)).join('\n');
const serverBundle = files('build/server').map((path) => readFileSync(path)).join('\n');
assert.equal(browserBundle.includes(SERVER_SENTINEL), false, 'server-only module leaked into the browser bundle');
assert.equal(serverBundle.includes(SERVER_SENTINEL), true, 'server-only proof must remain in the server output');
assert.equal(browserBundle.includes('data-hydration-status'), true, 'the interactive page was not emitted into the hydration client');

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['build/index.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ORIGIN: origin },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout?.on('data', (chunk) => { output += chunk; });
child.stderr?.on('data', (chunk) => { output += chunk; });

try {
  const response = await fetchReady(origin, child, () => output);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  const html = await response.text();
  assert.match(html, /data-m1-foundation/);
  assert.match(html, /M1 · adapter-node/);
  assert.match(html, /data-hydrated="false"/);
  assert.match(html, /awaiting hydration/);
  assert.match(html, /Hydration proof: 0/);
  assert.match(html, /<script/);
  assert.match(html, /\/_app\/immutable\//);
  assert.equal(html.includes(SERVER_SENTINEL), false);
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('adapter-node did not stop')), 5_000)),
  ]);
}

console.log('SvelteKit SSR, hydration bootstrap, adapter-node output and server-only boundary: OK');
