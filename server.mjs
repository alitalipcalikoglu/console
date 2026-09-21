import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { ConfigError } from './src/config.js';
import { CONSOLE_UPLOAD_LIMIT_BYTES } from './src/services/upload-stream.js';
import { Runtime } from './src/lib/server/runtime.js';

const FORCE_EXIT_MS = 30_000;
process.env.BODY_SIZE_LIMIT ??= String(CONSOLE_UPLOAD_LIMIT_BYTES);
const { handler } = await import('./build/handler.js');

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

let runtime;
let server;
let shutdownPromise;

async function shutdown(reason) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    runtime?.log.info({ reason }, 'shutting down');
    const forceExit = setTimeout(() => {
      runtime?.log.error('shutdown timed out, exiting');
      server?.closeAllConnections?.();
      process.exit(1);
    }, FORCE_EXIT_MS).unref();
    try {
      runtime?.beginShutdown();
      server?.closeIdleConnections?.();
      if (server?.listening) await close(server);
      await runtime?.finishShutdown();
      clearTimeout(forceExit);
      runtime?.log.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      runtime?.log.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  })();
  return shutdownPromise;
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('unhandledRejection', (reason) => {
  runtime?.log.fatal({ err: reason }, 'unhandled rejection');
  void shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  runtime?.log.fatal({ err }, 'uncaught exception');
  process.exit(1);
});

try {
  runtime = Runtime.initialize({ start: false });
  server = runtime.config.tls
    ? createHttpsServer({
      cert: readFileSync(runtime.config.tls.certPath),
      key: readFileSync(runtime.config.tls.keyPath),
      minVersion: 'TLSv1.2',
    }, handler)
    : createHttpServer(handler);
  await listen(server, runtime.config.port, runtime.config.host);
  runtime.start();
  runtime.log.info({ tls: runtime.config.tls !== null }, runtime.config.tls
    ? 'serving HTTPS'
    : 'serving plain HTTP, terminate TLS at a reverse proxy');
  if (process.send) process.send('ready');
} catch (err) {
  await runtime?.finishShutdown();
  if (err instanceof ConfigError) console.error(`configuration error: ${err.message}`);
  else console.error(err);
  process.exit(1);
}
