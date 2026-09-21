import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('Docker production image runs one canonical non-root runtime on the configured port', () => {
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^CMD \["node", "--disable-warning=ExperimentalWarning", "server\.mjs"\]$/m);
  assert.match(dockerfile, /127\.0\.0\.1:\$\{PORT\}\/health/);
  assert.doesNotMatch(dockerfile, /127\.0\.0\.1:3004\/health/);
  assert.doesNotMatch(dockerfile, /^COPY scripts \.\/scripts$/m);
  assert.match(dockerfile, /^COPY scripts\/admin\.js \.\/scripts\/admin\.js$/m);
});

test('container admin command accepts injected environment without requiring a physical .env', () => {
  assert.equal(pkg.scripts.admin, 'node --disable-warning=ExperimentalWarning --env-file-if-exists=.env scripts/admin.js');
});

test('PM2 runs exactly one canonical Console process with readiness and shutdown budgets', () => {
  const file = new URL('../ecosystem.config.cjs', import.meta.url);
  delete require.cache[require.resolve(file.pathname)];
  const config = require(file.pathname);
  assert.equal(config.apps.length, 1);
  assert.deepEqual({
    name: config.apps[0].name,
    script: config.apps[0].script,
    mode: config.apps[0].exec_mode,
    instances: config.apps[0].instances,
    waitReady: config.apps[0].wait_ready,
    listenTimeout: config.apps[0].listen_timeout,
    killTimeout: config.apps[0].kill_timeout,
  }, {
    name: 'console', script: 'server.mjs', mode: 'fork', instances: 1,
    waitReady: true, listenTimeout: 10_000, killTimeout: 35_000,
  });
});
