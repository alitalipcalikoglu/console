import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, GeoClient).listCollections() });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: Schemas.geoCollectionCreate, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, GeoClient).createCollection(context.body); record(context, 'geo.collection.create', context.body.name, { service: context.params.sid }); return output; } });

