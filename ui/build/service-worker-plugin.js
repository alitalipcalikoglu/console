/**
 * Vite plugin that writes `sw.js` into the build with the list of hashed assets to precache.
 * The service worker source is `ui/build/sw.template.js`; `__ASSETS__` and `__VERSION__` are replaced.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function serviceWorkerPlugin() {
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    name: 'atc-service-worker',
    apply: /** @type {const} */ ('build'),
    /** @param {any} _options @param {Record<string, { type: string, fileName: string }>} bundle */
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map((item) => item.fileName)
        .filter((name) => /\.(js|css|svg|png|woff2)$/.test(name) && !name.endsWith('sw.js'))
        .map((name) => `/${name}`);
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(join(here, 'sw.template.js'), 'utf8')
        .replace('__ASSETS__', JSON.stringify(['/', '/index.html', '/manifest.webmanifest', ...assets]))
        .replace('__VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
