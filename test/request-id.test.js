import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { CSRF, signIn, testConsole } from './helpers.js';

/**
 * Fake search + ratelimit service: records every request it sees. `/v1/indexes` (search) can be
 * asked to delay its response via `?slow=1`, so a concurrency test can force two outbound console
 * calls to genuinely overlap in time.
 * @type {{ path: string, headers: import('node:http').IncomingHttpHeaders }[]}
 */
const seen = [];
const fake = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://fake.test');
    seen.push({ path: url.pathname, headers: req.headers });
    const json = (/** @type {unknown} */ data) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (url.pathname === '/health' || url.pathname === '/ready') return res.writeHead(200).end('{"status":"ok"}');
    if (url.pathname === '/v1/indexes') {
      const send = () => json({ items: [] });
      return url.searchParams.get('slow') ? setTimeout(send, 120) : send();
    }
    if (url.pathname === '/v1/policies') return json({ items: [] });
    return res.writeHead(404).end('{}');
  });
});
const listen = () => new Promise((resolve) => fake.listen(0, '127.0.0.1', () => resolve(undefined)));
const origin = () => `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (fake.address()).port}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @type {Awaited<ReturnType<typeof testConsole>>} */ let t;
/** @type {string} */ let cookie;

before(async () => {
  await listen();
  t = await testConsole({ urls: { search: origin(), ratelimit: origin() } });
  ({ cookie } = await signIn(t));
});
after(async () => { await t.app.close(); fake.close(); });

test('the console forwards its own per-request id to a service it calls', async () => {
  seen.length = 0;
  const res = await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(seen.length, 1);
  assert.match(String(seen[0].headers['x-request-id']), UUID, 'a well-formed id was attached, not left blank');
});

test('two separate admin actions carry two different request ids', async () => {
  seen.length = 0;
  await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF } });
  await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF } });
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0].headers['x-request-id'], seen[1].headers['x-request-id'], 'each inbound admin request gets its own id, not a fixed or process-wide one');
});

test('two concurrent admin actions to different services do not cross-contaminate their request ids', async () => {
  seen.length = 0;
  // The search call is held open by the fake server (?slow=1) while the ratelimit call answers
  // immediately, so the two outbound calls genuinely overlap: this is the scenario a shared
  // mutable "current request id" variable (instead of true per-request context) would get wrong.
  const [searchRes, ratelimitRes] = await Promise.all([
    t.app.inject({ url: '/api/services/search/search/indexes?slow=1', headers: { cookie, ...CSRF } }),
    t.app.inject({ url: '/api/services/ratelimit/ratelimit/policies', headers: { cookie, ...CSRF } }),
  ]);
  assert.equal(searchRes.statusCode, 200, searchRes.body);
  assert.equal(ratelimitRes.statusCode, 200, ratelimitRes.body);
  const forIndexes = seen.find((s) => s.path === '/v1/indexes');
  const forPolicies = seen.find((s) => s.path === '/v1/policies');
  assert.ok(forIndexes && forPolicies, 'both outbound calls reached the fake service');
  const idA = String(forIndexes?.headers['x-request-id']);
  const idB = String(forPolicies?.headers['x-request-id']);
  assert.match(idA, UUID);
  assert.match(idB, UUID);
  assert.notEqual(idA, idB, 'the delayed search call still carries its own request’s id, not the ratelimit call’s');
});
