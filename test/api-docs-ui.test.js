import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchDocServices, fetchOpenApi } from '../ui/src/lib/api-docs.js';

test('API Docs UI boundary preserves a valid selection and falls back to the first allowlisted service', async () => {
  const get = async () => ({ items: [
    { id: 'console', type: 'console', label: 'Console' },
    { id: 'notify-prod', type: 'notify', label: 'Notify' },
  ] });
  assert.equal((await fetchDocServices(get, 'notify-prod')).selected, 'notify-prod');
  assert.equal((await fetchDocServices(get, 'missing')).selected, 'console');
});

test('API Docs UI boundary renders a healthy service after a different service fails', async () => {
  const get = async (/** @type {string} */ path) => {
    if (path.includes('broken')) throw new Error('service unavailable');
    return { document: { openapi: '3.1.0', info: { title: 'Healthy' }, paths: {} } };
  };
  await assert.rejects(() => fetchOpenApi(get, 'broken'), /unavailable/);
  const document = /** @type {{ info: { title: string } }} */ (await fetchOpenApi(get, 'healthy'));
  assert.equal(document.info.title, 'Healthy');
});
