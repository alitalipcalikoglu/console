export const CONSOLE_UPLOAD_LIMIT_BYTES = 512 * 1024 * 1024;

export class UploadLimitError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'UploadLimitError';
  }
}

/** A backpressure-preserving byte counter around an upload Web stream. */
export class UploadStream {
  /**
   * @param {ReadableStream<Uint8Array>|null} source
   * @param {number} [maxBytes]
   */
  static limit(source, maxBytes = CONSOLE_UPLOAD_LIMIT_BYTES) {
    const abort = new AbortController();
    let exceeded = false;
    if (!source) return { body: null, signal: abort.signal, get exceeded() { return exceeded; } };

    const reader = source.getReader();
    let received = 0;
    const fail = () => {
      exceeded = true;
      const error = new UploadLimitError();
      if (!abort.signal.aborted) abort.abort(error);
      return error;
    };
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          received += value.byteLength;
          if (received > maxBytes) {
            const error = fail();
            await reader.cancel(error).catch(() => {});
            controller.error(error);
            return;
          }
          controller.enqueue(value);
        } catch (cause) {
          // adapter-node applies the same declared/streaming cap before route code sees a chunk.
          if (cause && typeof cause === 'object' && 'status' in cause && cause.status === 413) {
            controller.error(fail());
            return;
          }
          controller.error(cause);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => {});
      },
    });
    return { body, signal: abort.signal, get exceeded() { return exceeded; } };
  }
}
