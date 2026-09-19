import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceClient, ServiceError } from '../src/services/client.js';
import { OpenApiDocuments } from '../src/services/openapi-documents.js';

const VALID = 'openapi: 3.1.0\ninfo:\n  title: Notify\n  version: 1.0.0\npaths: {}\n';

/** @param {(...args: any[]) => Promise<Response>} request */
function subject(request) {
  const def = { id: 'notify-prod', type: 'notify', label: 'Notify prod' };
  return new OpenApiDocuments(/** @type {any} */ ({
    registry: {
      get: (/** @type {string} */ id) => id === def.id ? def : undefined,
      describe: () => [def],
    },
    any: (/** @type {string} */ id) => {
      if (id !== def.id) throw new Error('unexpected id');
      return { request };
    },
  }));
}

test('OpenApiDocuments: console is local, list is public metadata only, remote fetch is parsed', async () => {
  /** @type {any} */
  let options = null;
  const docs = subject(async (/** @type {string} */ _method, /** @type {string} */ _path, /** @type {any} */ o) => { options = o; return new Response(VALID, { status: 200, headers: { 'content-type': 'text/yaml' } }); });
  assert.deepEqual(docs.list().map((x) => x.id), ['console', 'notify-prod']);
  assert.equal((await docs.get('console')).document.info.title, 'console');
  assert.equal((await docs.get('notify-prod')).document.info.title, 'Notify');
  assert.equal(options.auth, 'none');
  assert.equal(options.timeoutMs, 3000);
  assert.equal(options.distinguishTimeout, true);
});

test('OpenApiDocuments: unknown and known-but-unconfigured ids are differentiated', async () => {
  const docs = subject(async () => new Response(VALID));
  await assert.rejects(() => docs.get('mystery'), (e) => e instanceof ServiceError && e.statusCode === 404 && e.code === 'DOCS_UNKNOWN_SERVICE');
  await assert.rejects(() => docs.get('notify'), (e) => e instanceof ServiceError && e.statusCode === 404 && e.code === 'DOCS_SERVICE_UNCONFIGURED');
});

test('OpenApiDocuments: timeout, reachability, non-2xx, empty, malformed and oversized documents are safe errors', async () => {
  const cases = [
    [async () => { throw new ServiceError('secret timeout detail', { statusCode: 504, code: 'UPSTREAM_TIMEOUT' }); }, 'DOCS_UPSTREAM_TIMEOUT', 504],
    [async () => { throw new Error('connection string with secret'); }, 'DOCS_UPSTREAM_UNREACHABLE', 502],
    [async () => new Response('Bearer super-secret-value', { status: 503 }), 'DOCS_UPSTREAM_ERROR', 502],
    [async () => new Response(''), 'DOCS_INVALID_DOCUMENT', 502],
    [async () => new Response('openapi: [not valid'), 'DOCS_INVALID_DOCUMENT', 502],
    [async () => new Response('openapi: 3.0.3\ninfo: { title: old }\npaths: {}'), 'DOCS_INVALID_DOCUMENT', 502],
    [async () => new Response('x', { headers: { 'content-length': String(OpenApiDocuments.MAX_BYTES + 1) } }), 'DOCS_DOCUMENT_TOO_LARGE', 502],
  ];
  for (const [request, code, status] of cases) {
    await assert.rejects(() => subject(/** @type {any} */ (request)).get('notify-prod'), (e) => {
      assert.ok(e instanceof ServiceError);
      assert.equal(e.code, code);
      assert.equal(e.statusCode, status);
      assert.equal(e.message.includes('super-secret-value'), false);
      return true;
    });
  }
});

test('ServiceClient only exposes the timeout distinction when the caller explicitly requests it', async () => {
  const timeoutFetch = async () => { throw Object.assign(new Error('timed out with a secret'), { name: 'TimeoutError' }); };
  const client = new ServiceClient(/** @type {any} */ ({ id: 'notify', url: 'http://notify.invalid' }), {
    timeoutMs: 10, fetch: /** @type {any} */ (timeoutFetch),
  });
  await assert.rejects(() => client.request('GET', '/health'), (e) => e instanceof ServiceError && e.code === 'UPSTREAM_UNREACHABLE' && e.statusCode === 502);
  await assert.rejects(() => client.request('GET', '/openapi.yaml', { distinguishTimeout: true }), (e) => e instanceof ServiceError && e.code === 'UPSTREAM_TIMEOUT' && e.statusCode === 504);
});
