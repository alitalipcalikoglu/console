import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the geo API. */
export class GeoClient extends ServiceClient {
  /**
   * @param {Record<string, string|number|boolean|undefined>} q
   * @param {readonly string[]} keys
   */
  static params(q, keys) {
    const p = new URLSearchParams();
    for (const k of keys) if (q[k] !== undefined && q[k] !== '') p.set(k, String(q[k]));
    return p;
  }

  /** @param {string} name */
  static #c(name) {
    return `/v1/collections/${encodeURIComponent(name)}`;
  }

  /** @param {string} ip @param {{ lang?: string }} q */
  ip(ip, q) {
    return this.json('GET', `/v1/ip/${encodeURIComponent(ip)}?${GeoClient.params(q, ['lang'])}`);
  }

  /** @param {string[]} ips @param {string} [lang] */
  ipBatch(ips, lang) {
    return this.json('POST', '/v1/ip/batch', { body: { ips, ...(lang ? { lang } : {}) } });
  }

  database() {
    return this.json('GET', '/v1/database');
  }

  reloadDatabase() {
    return this.json('POST', '/v1/database/reload');
  }

  /** @param {{ q?: string, continent?: string, eu?: string, currency?: string, lang?: string }} q */
  countries(q) {
    return this.json('GET', `/v1/countries?${GeoClient.params(q, ['q', 'continent', 'eu', 'currency', 'lang'])}`);
  }

  /** @param {string} code @param {{ lang?: string }} q */
  country(code, q) {
    return this.json('GET', `/v1/countries/${encodeURIComponent(code)}?${GeoClient.params(q, ['lang'])}`);
  }

  /** @param {{ lang?: string }} q */
  currencies(q) {
    return this.json('GET', `/v1/currencies?${GeoClient.params(q, ['lang'])}`);
  }

  /** @param {{ country?: string, q?: string, lang?: string }} q */
  timezones(q) {
    return this.json('GET', `/v1/timezones?${GeoClient.params(q, ['country', 'q', 'lang'])}`);
  }

  /** @param {string} name @param {{ lang?: string }} q */
  timezone(name, q) {
    return this.json('GET', `/v1/timezones/${name.split('/').map(encodeURIComponent).join('/')}?${GeoClient.params(q, ['lang'])}`);
  }

  /** @param {{ number: string, country?: string }} q */
  phone(q) {
    return this.json('GET', `/v1/phone?${GeoClient.params(q, ['number', 'country'])}`);
  }

  /** @param {{ from: string, to: string }} q */
  distance(q) {
    return this.json('GET', `/v1/distance?${GeoClient.params(q, ['from', 'to'])}`);
  }

  listCollections() {
    return this.json('GET', '/v1/collections');
  }

  /** @param {string} name */
  getCollection(name) {
    return this.json('GET', GeoClient.#c(name));
  }

  /** @param {object} body */
  createCollection(body) {
    return this.json('POST', '/v1/collections', { body });
  }

  /** @param {string} name @param {object} patch */
  patchCollection(name, patch) {
    return this.json('PATCH', GeoClient.#c(name), { body: patch });
  }

  /** @param {string} name */
  deleteCollection(name) {
    return this.json('DELETE', GeoClient.#c(name));
  }

  /** @param {string} name */
  clearCollection(name) {
    return this.json('POST', `${GeoClient.#c(name)}/clear`);
  }

  /** @param {string} name @param {object[]} places */
  upsertPlaces(name, places) {
    return this.json('PUT', `${GeoClient.#c(name)}/places`, { body: { places } });
  }

  /** @param {string} name @param {{ limit?: number, offset?: number }} q */
  places(name, q) {
    return this.json('GET', `${GeoClient.#c(name)}/places?${GeoClient.params(q, ['limit', 'offset'])}`);
  }

  /** @param {string} name @param {string} id */
  deletePlace(name, id) {
    return this.json('DELETE', `${GeoClient.#c(name)}/places/${encodeURIComponent(id)}`);
  }

  /** @param {string} name @param {{ lat: string, lng: string, radius?: string, limit?: string }} q */
  nearby(name, q) {
    return this.json('GET', `${GeoClient.#c(name)}/nearby?${GeoClient.params(q, ['lat', 'lng', 'radius', 'limit'])}`);
  }

  stats() {
    return this.json('GET', '/v1/stats');
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    const lookups = Object.fromEntries(s.filter((x) => x.name === 'geo_ip_lookups_total').map((x) => [x.labels.result, x.value]));
    return {
      lookups,
      lookupsTotal: Object.values(lookups).reduce((a, n) => a + n, 0),
      databaseLoaded: PrometheusText.value(s, 'geo_database_loaded') === 1,
      databaseBuildEpoch: PrometheusText.value(s, 'geo_database_build_epoch'),
      collections: PrometheusText.value(s, 'geo_collections'),
      places: PrometheusText.value(s, 'geo_places_total'),
      dbBytes: PrometheusText.value(s, 'geo_db_bytes'),
      uptimeSec: PrometheusText.value(s, 'geo_process_uptime_seconds'),
    };
  }
}
