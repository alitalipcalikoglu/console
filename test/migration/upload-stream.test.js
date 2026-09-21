import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONSOLE_UPLOAD_LIMIT_BYTES, UploadLimitError, UploadStream } from '../../src/services/upload-stream.js';

test('M5 upload cap is exactly 512 MiB', () => {
  assert.equal(CONSOLE_UPLOAD_LIMIT_BYTES, 536_870_912);
});

test('UploadStream rejects unknown-length overflow without accumulating the body', async () => {
  let sent = 0;
  const source = new ReadableStream({
    pull(controller) {
      sent += 1;
      if (sent <= 3) controller.enqueue(new Uint8Array(4).fill(sent));
      else controller.close();
    },
  });
  const upload = UploadStream.limit(source, 10);
  assert.ok(upload.body);
  const reader = upload.body.getReader();
  assert.deepEqual(await reader.read(), { done: false, value: new Uint8Array(4).fill(1) });
  assert.deepEqual(await reader.read(), { done: false, value: new Uint8Array(4).fill(2) });
  await assert.rejects(() => reader.read(), UploadLimitError);
  assert.equal(upload.exceeded, true);
  assert.equal(upload.signal.aborted, true);
});

test('UploadStream cancellation propagates to its source', async () => {
  let reason;
  const source = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1])); },
    cancel(value) { reason = value; },
  });
  const upload = UploadStream.limit(source, 10);
  assert.ok(upload.body);
  const reader = upload.body.getReader();
  await reader.cancel('client-gone');
  assert.equal(reason, 'client-gone');
});
