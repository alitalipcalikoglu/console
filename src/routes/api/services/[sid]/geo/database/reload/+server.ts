import { GeoClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, GeoClient).reloadDatabase(); record(context, 'geo.database.reload', context.params.sid, { service: context.params.sid, type: output?.city?.type ?? null }); return output; } });

