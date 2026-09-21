import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swaggerOptions } from '../src/lib/client/swagger-config.js';

test('Swagger renderer is local-document-only with validation and request execution disabled', async () => {
  const spec = { openapi: '3.1.0' };
  const node = {};
  const options = swaggerOptions(spec, /** @type {any} */ (node));
  assert.equal(options.spec, spec);
  assert.equal(options.domNode, node);
  assert.equal(options.url, null);
  assert.equal(options.validatorUrl, null);
  assert.deepEqual(options.supportedSubmitMethods, []);
  assert.equal(options.tryItOutEnabled, false);
  assert.equal(options.persistAuthorization, false);
  assert.equal(options.withCredentials, false);
  await assert.rejects(() => options.requestInterceptor(), /request execution is disabled/i);
});
