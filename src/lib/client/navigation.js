import { replaceState } from '$app/navigation';

/** Query-string updates that preserve the current filesystem route and browser history entry. */
export class Navigation {
  /**
   * @param {URL} url
   * @param {Record<string, string|null|undefined>} patch
   */
  static replaceQuery(url, patch) {
    const query = new URLSearchParams(url.searchParams);
    for (const [name, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') query.delete(name);
      else query.set(name, value);
    }
    const serialized = query.toString();
    const next = `${url.pathname}${serialized ? `?${serialized}` : ''}${url.hash}`;
    if (next === `${url.pathname}${url.search}${url.hash}`) return;
    replaceState(next, {});
  }
}
