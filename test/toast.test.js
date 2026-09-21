// @ts-nocheck -- this test supplies Svelte's compile-time `$state` rune at runtime.
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('toast queue represents success and API errors as text without interpreting markup', async () => {
  /** @type {any} */ (globalThis).$state = (/** @type {any} */ value) => value;
  const nativeTimeout = globalThis.setTimeout;
  globalThis.setTimeout = /** @type {typeof globalThis.setTimeout} */ (() => /** @type {any} */ (0));
  try {
    const { Toasts } = await import('../src/lib/client/toast.svelte.js?m7-test');
    const queue = new Toasts();
    queue.ok('saved');
    queue.error({ message: '<b>downstream failed</b>', service: 'fixture' });
    assert.deepEqual(queue.items.map(({ kind, text }) => ({ kind, text })), [
      { kind: 'ok', text: 'saved' },
      { kind: 'danger', text: '<b>downstream failed</b> (fixture)' },
    ]);
  } finally {
    globalThis.setTimeout = nativeTimeout;
    delete /** @type {any} */ (globalThis).$state;
  }
});
