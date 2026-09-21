export const CACHE_PREFIX = 'atc-console-static-';
export const LEGACY_CACHE_PREFIX = 'console-';

/** Only explicitly public static files join SvelteKit's generated immutable build assets. */
/** @param {string} pathname */
export function isPublicStaticFile(pathname) {
  return pathname === '/manifest.webmanifest'
    || pathname === '/robots.txt'
    || pathname.startsWith('/icons/');
}

/** Delete only caches owned by this application, including the legacy SPA cache family. */
/** @param {string} name */
export function isOwnedCache(name) {
  return name.startsWith(CACHE_PREFIX) || name.startsWith(LEGACY_CACHE_PREFIX);
}

/**
 * The worker handles only same-origin GETs for the exact precached asset set. Navigations and
 * every Console API request bypass the worker, so authenticated HTML and API data stay network-only.
 * @param {{ method: string, mode: string, url: string }} request
 * @param {string} origin
 * @param {Set<string>} assetPaths
 */
export function isCacheableAssetRequest(request, origin, assetPaths) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false;
  const url = new URL(request.url);
  if (url.origin !== origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) return false;
  return assetPaths.has(url.pathname);
}
