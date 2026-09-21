import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.geoPhoneQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, GeoClient).phone(query as any) });

