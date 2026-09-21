import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, GeoClient).clearCollection(context.params.id); record(context, 'geo.collection.clear', context.params.id, { service: context.params.sid, removed: output?.removed ?? null }); return output; } });

