import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'session', params: Schemas.serviceParams, body: Schemas.geoIpBatch, handler: ({ runtime, params, body }) => runtime.clients.get(params.sid, GeoClient).ipBatch(body.ips, body.lang) });

