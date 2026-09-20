import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { Config } from '../../src/config.js';
import { ConsoleRuntime, Runtime } from '../../src/lib/server/runtime.js';

const config = Config.fromEnv({
  DB_PATH: ':memory:',
  LOG_LEVEL: 'silent',
  COOKIE_SECURE: 'false',
  SCRYPT_LOG_N: '14',
});
const runtime = Runtime.initialize({ config, start: false });

after(() => runtime.finishShutdown());

test('M2 runtime owns one process-scoped database and one maintenance lifecycle', () => {
  const again = Runtime.initialize({ config, start: false });
  assert.equal(again, runtime);
  assert.equal(again.db, runtime.db);
  assert.deepEqual(Runtime.diagnostics(), {
    initializations: 1,
    state: 'initialized',
    maintenanceActive: false,
  });

  runtime.start();
  const timer = runtime.maintenance.timer;
  assert.ok(timer);
  runtime.start();
  assert.equal(runtime.maintenance.timer, timer);
  assert.equal(runtime.db.schemaVersion, 2);
  runtime.checkReadiness();
  assert.deepEqual(Runtime.diagnostics(), {
    initializations: 1,
    state: 'ready',
    maintenanceActive: true,
  });
});

test('M2 runtime shutdown stops maintenance and closes resources idempotently', () => {
  runtime.beginShutdown();
  runtime.beginShutdown();
  assert.equal(runtime.maintenance.timer, null);
  runtime.finishShutdown();
  runtime.finishShutdown();
  assert.equal(runtime.state, 'stopped');
  assert.throws(() => runtime.db.ping());
});

test('M2 readiness fails when the shared database connection is unavailable', () => {
  const broken = new ConsoleRuntime(config);
  broken.start();
  broken.db.close();
  broken.closed = true;
  assert.throws(() => broken.checkReadiness());
  broken.finishShutdown();
});

test('M2 wrapper is adapter-node only and operational routes contain no proxy or application API', () => {
  const wrapper = readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
  assert.match(wrapper, /build\/handler\.js/);
  assert.match(wrapper, /createHttpServer\(handler\)/);
  assert.match(wrapper, /createHttpsServer/);
  assert.doesNotMatch(wrapper, /from\s+['"](?:fastify|express)|\bproxy\s*\(|\broute\s*\(/i);

  const routeFiles = [
    '../../src/routes/health/+server.ts',
    '../../src/routes/ready/+server.ts',
    '../../src/routes/v1/info/+server.ts',
    '../../src/routes/openapi.yaml/+server.ts',
  ];
  for (const file of routeFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /export const GET/);
    assert.doesNotMatch(source, /from\s+['"].*fastify|\bfetch\s*\(|event\.locals|\/api\//i);
  }
});
