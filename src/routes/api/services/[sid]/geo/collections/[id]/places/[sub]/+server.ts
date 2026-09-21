import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, GeoClient).deletePlace(context.params.id, context.params.sub); record(context, 'geo.place.delete', context.params.sub, { service: context.params.sid, collection: context.params.id }); } });

