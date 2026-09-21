import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, GeoClient).getCollection(params.id) });
export const PATCH = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: Schemas.geoCollectionPatch, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, GeoClient).patchCollection(context.params.id, context.body); record(context, 'geo.collection.update', context.params.id, { service: context.params.sid, patch: context.body }); return output; } });
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, GeoClient).deleteCollection(context.params.id); record(context, 'geo.collection.delete', context.params.id, { service: context.params.sid }); } });

