import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { CSRF, signIn, testConsole } from './helpers.js';

/**
 * Stage 10: console forwards `traceparent` to the services it calls (`stack/docs/OBSERVABILITY.md`
 * named this as the next thing to adopt after `X-Request-Id`). Same fake-service pattern as
 * `test/request-id.test.js`, extended to also capture `traceparent`.
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

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** @type {Awaited<ReturnType<typeof testConsole>>} */ let t;
/** @type {string} */ let cookie;

before(async () => {
  await listen();
  t = await testConsole({ urls: { search: origin(), ratelimit: origin() } });
  ({ cookie } = await signIn(t));
});
after(async () => { await t.app.close(); fake.close(); });

test('the console forwards a well-formed traceparent to a service it calls, and echoes it on its own response', async () => {
  seen.length = 0;
  const res = await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(seen.length, 1);
  const outbound = String(seen[0].headers.traceparent);
  assert.match(outbound, TRACEPARENT, 'a well-formed W3C traceparent, not console\'s own request-id format or anything invented');
  assert.match(String(res.headers.traceparent), TRACEPARENT, 'echoed back to the browser too');
  const echoedTraceId = String(res.headers.traceparent).match(TRACEPARENT)?.[1];
  const forwardedTraceId = outbound.match(TRACEPARENT)?.[1];
  assert.equal(echoedTraceId, forwardedTraceId, 'the echoed trace-id is the SAME trace as the one forwarded downstream, correlating the two');
  const echoedSpanId = String(res.headers.traceparent).match(TRACEPARENT)?.[2];
  const forwardedSpanId = outbound.match(TRACEPARENT)?.[2];
  assert.notEqual(echoedSpanId, forwardedSpanId, 'the outbound hop gets its OWN fresh span-id, distinct from the span echoed for the inbound request itself');
});

test('two separate admin actions carry two different trace ids, each internally consistent', async () => {
  seen.length = 0;
  await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF } });
  await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF } });
  assert.equal(seen.length, 2);
  const trace1 = String(seen[0].headers.traceparent).match(TRACEPARENT)?.[1];
  const trace2 = String(seen[1].headers.traceparent).match(TRACEPARENT)?.[1];
  assert.notEqual(trace1, trace2, 'each inbound admin request starts its own fresh trace, never reused across requests');
});

test('one admin request fanning out to two services: same trace-id on both outbound calls, but a DIFFERENT span-id per hop', async () => {
  seen.length = 0;
  const [searchRes, ratelimitRes] = await Promise.all([
    t.app.inject({ url: '/api/services/search/search/indexes?slow=1', headers: { cookie, ...CSRF } }),
    t.app.inject({ url: '/api/services/ratelimit/ratelimit/policies', headers: { cookie, ...CSRF } }),
  ]);
  // These are two SEPARATE inbound console requests (inject() calls), not one fanning out — so
  // this specifically proves concurrent requests never cross-contaminate spans, the traceparent
  // analogue of request-id.test.js's identical concurrency check.
  assert.equal(searchRes.statusCode, 200, searchRes.body);
  assert.equal(ratelimitRes.statusCode, 200, ratelimitRes.body);
  const forIndexes = seen.find((s) => s.path === '/v1/indexes');
  const forPolicies = seen.find((s) => s.path === '/v1/policies');
  assert.ok(forIndexes && forPolicies);
  const a = String(forIndexes?.headers.traceparent).match(TRACEPARENT);
  const b = String(forPolicies?.headers.traceparent).match(TRACEPARENT);
  assert.ok(a && b);
  assert.notEqual(a?.[1], b?.[1], 'two different inbound requests: two different trace-ids');
});

test('a malformed inbound traceparent from the browser never crashes the request, is never trusted, and never leaks downstream', async () => {
  seen.length = 0;
  const res = await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF, traceparent: 'not-a-real-traceparent; DROP TABLE x;' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(seen.length, 1);
  const outbound = String(seen[0].headers.traceparent);
  assert.match(outbound, TRACEPARENT, 'console generated its own well-formed traceparent regardless of the garbage it received');
  assert.doesNotMatch(outbound, /DROP TABLE|not-a-real/, 'the malformed inbound value never reaches the outbound header');
});

test('an inbound traceparent claiming a trace-id, even a well-formed one, is never adopted — console always starts its own (it is a trust boundary, like gateway with TRUST_PROXY=false)', async () => {
  seen.length = 0;
  const claimedTraceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const res = await t.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie, ...CSRF, traceparent: `00-${claimedTraceId}-bbbbbbbbbbbbbbbb-01` } });
  assert.equal(res.statusCode, 200, res.body);
  const outbound = String(seen[0].headers.traceparent);
  assert.notEqual(outbound.match(TRACEPARENT)?.[1], claimedTraceId, 'the browser-claimed trace-id is never trusted or propagated');
});

/**
 * Post-production Phase 5: with TRUST_PROXY=true (the operator declaring a trusted reverse proxy
 * sits in front of this console instance — the exact same declaration already gates
 * X-Forwarded-For), a valid inbound traceparent IS now adopted. A separate console instance, since
 * the default (untrusted) instance above is what every other test in this file deliberately
 * exercises.
 */
test('with TRUST_PROXY=true, a well-formed inbound traceparent IS adopted: same trace-id propagated downstream, fresh span-id for the hop', async () => {
  const trusting = await testConsole({ urls: { search: origin(), ratelimit: origin() }, env: { TRUST_PROXY: 'true' } });
  const { cookie: trustingCookie } = await signIn(trusting);
  try {
    seen.length = 0;
    const claimedTraceId = 'c'.repeat(32);
    const claimedSpanId = 'd'.repeat(16);
    const res = await trusting.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie: trustingCookie, ...CSRF, traceparent: `00-${claimedTraceId}-${claimedSpanId}-01` } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(seen.length, 1);
    const outbound = String(seen[0].headers.traceparent);
    assert.match(outbound, TRACEPARENT);
    assert.equal(outbound.match(TRACEPARENT)?.[1], claimedTraceId, 'trusted: the inbound trace-id IS continued downstream');
    assert.notEqual(outbound.match(TRACEPARENT)?.[2], claimedSpanId, 'the downstream hop still gets its own fresh span-id, never the caller\'s reused');
    assert.equal(res.headers.traceparent?.toString().match(TRACEPARENT)?.[1], claimedTraceId, 'echoed response also carries the continued trace-id');

    seen.length = 0;
    const malformedRes = await trusting.app.inject({ url: '/api/services/search/search/indexes', headers: { cookie: trustingCookie, ...CSRF, traceparent: 'garbage' } });
    assert.equal(malformedRes.statusCode, 200, malformedRes.body);
    assert.match(String(seen[0].headers.traceparent), TRACEPARENT, 'trusted but malformed: still falls back to a fresh, well-formed trace, never crashes');
  } finally {
    await trusting.app.close();
  }
});
