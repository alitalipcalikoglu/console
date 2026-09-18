import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { CSRF, signIn, testConsole } from './helpers.js';

/**
 * Stage 10: re-verifies Stage 7's `GET /api/services/about` (the About/version view) against
 * exactly the mixed-version scenarios the brief names — full current `/v1/info`, missing optional
 * fields, malformed body, and an unreachable service — proving `ClientRegistry#about()` degrades
 * per service and never crashes the whole page for one bad or outdated service, and that console
 * itself asserts nothing about what a service's `capabilities`/`version` "should" look like (it is
 * a pass-through, not a hardcoded source of truth).
 */
let mode = 'full';
const fake = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://fake.test');
  if (url.pathname === '/health' || url.pathname === '/ready') return res.writeHead(200).end('{"status":"ok"}');
  if (url.pathname !== '/v1/info') return res.writeHead(404).end('{}');
  if (mode === 'full') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ service: 'search', version: '3.2.1', apiVersion: 'v1', capabilities: ['fts5', 'facets', 'suggest'], schemaVersion: 2, serviceCore: '1.4.0' }));
  if (mode === 'missing-optional') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ service: 'search', version: '1.0.0' })); // no apiVersion/capabilities/schemaVersion/serviceCore at all
  if (mode === 'malformed-not-object') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(['not', 'an', 'object']));
  if (mode === 'malformed-not-json') return res.writeHead(200, { 'content-type': 'text/plain' }).end('<html>this is not json</html>');
  if (mode === 'no-route') return res.writeHead(404).end('{"error":{"code":"NOT_FOUND"}}'); // a too-old version, before /v1/info existed
  if (mode === 'unreachable') { req.destroy(); return; }
  return res.writeHead(500).end('{}');
});
const listen = () => new Promise((resolve) => fake.listen(0, '127.0.0.1', () => resolve(undefined)));
const origin = () => `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (fake.address()).port}`;

/** @type {Awaited<ReturnType<typeof testConsole>>} */ let t;
/** @type {string} */ let cookie;

before(async () => {
  await listen();
  t = await testConsole({ urls: { search: origin() } });
  ({ cookie } = await signIn(t));
});
after(async () => { await t.app.close(); fake.close(); });

test('About: a service with a full, current /v1/info is passed through as-is — console asserts nothing about the shape', async () => {
  mode = 'full';
  const res = await t.app.inject({ url: '/api/services/about', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  const search = res.json().items.find((/** @type {any} */ x) => x.id === 'search');
  assert.equal(search.ok, true);
  assert.deepEqual(search.data, { service: 'search', version: '3.2.1', apiVersion: 'v1', capabilities: ['fts5', 'facets', 'suggest'], schemaVersion: 2, serviceCore: '1.4.0' }, 'exactly what the service sent, not reshaped, filtered or validated against a fixed capability list');
});

test('About: missing optional fields (an older but still-responding service) never crashes the page', async () => {
  mode = 'missing-optional';
  const res = await t.app.inject({ url: '/api/services/about', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  const search = res.json().items.find((/** @type {any} */ x) => x.id === 'search');
  assert.equal(search.ok, true);
  assert.deepEqual(search.data, { service: 'search', version: '1.0.0' }, 'whatever fields ARE present pass through; no hardcoded required-field validation rejects a legitimately partial response');
});

test('About: a malformed /v1/info body (valid JSON, but not an object) degrades to ok:false for that service only, the request still succeeds', async () => {
  mode = 'malformed-not-object';
  const res = await t.app.inject({ url: '/api/services/about', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  const search = res.json().items.find((/** @type {any} */ x) => x.id === 'search');
  assert.equal(search.ok, false);
  assert.match(search.error, /malformed/i);
});

test('About: a non-JSON /v1/info body degrades to ok:false, never throws or crashes the whole response', async () => {
  mode = 'malformed-not-json';
  const res = await t.app.inject({ url: '/api/services/about', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  const search = res.json().items.find((/** @type {any} */ x) => x.id === 'search');
  assert.equal(search.ok, false);
  assert.match(search.error, /malformed|not json/i);
});

test('About: a too-old service with no /v1/info route (404) is reported distinctly, not confused with a real error', async () => {
  mode = 'no-route';
  const res = await t.app.inject({ url: '/api/services/about', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  const search = res.json().items.find((/** @type {any} */ x) => x.id === 'search');
  assert.equal(search.ok, false);
  assert.match(search.error, /older version|404/i);
});

test('About: an unreachable service is reported per-service, the rest of the page (and this one entry) still renders', async () => {
  mode = 'unreachable';
  const res = await t.app.inject({ url: '/api/services/about', headers: { cookie, ...CSRF } });
  assert.equal(res.statusCode, 200, res.body);
  const search = res.json().items.find((/** @type {any} */ x) => x.id === 'search');
  assert.equal(search.ok, false);
  assert.equal(typeof search.error, 'string');
  assert.equal(res.json().items.length >= 1, true, 'every configured service still gets an entry, good or bad');
});
