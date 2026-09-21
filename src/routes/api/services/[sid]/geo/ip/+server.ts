import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, text } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.geoIpQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, GeoClient).ip(text(query.ip)!, { lang: text(query.lang) }) });

