import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, text } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, query: Schemas.geoTimezonesQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, GeoClient).country(params.id, { lang: text(query.lang) }) });

