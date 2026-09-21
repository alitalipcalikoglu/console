/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import {
  CACHE_PREFIX,
  isCacheableAssetRequest,
  isOwnedCache,
  isPublicStaticFile,
} from '$lib/service-worker-policy.js';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `${CACHE_PREFIX}${version}`;
const PRECACHE = files.filter(isPublicStaticFile);
const ASSETS = [...new Set([...build, ...PRECACHE])];
const ASSET_PATHS = new Set(ASSETS.map((asset) => new URL(asset, worker.location.origin).pathname));

worker.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && isOwnedCache(key)).map((key) => caches.delete(key))))
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event) => {
  if (!isCacheableAssetRequest(event.request, worker.location.origin, ASSET_PATHS)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(event.request, { ignoreSearch: true });
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});

worker.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') void worker.skipWaiting();
});
