import { Schemas, SearchClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, SearchClient).getIndex(params.id) });
export const PATCH = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: Schemas.searchIndexPatch, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, SearchClient).patchIndex(context.params.id, context.body); record(context, 'search.index.update', context.params.id, { service: context.params.sid, patch: context.body }); return output; } });
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, SearchClient).deleteIndex(context.params.id); record(context, 'search.index.delete', context.params.id, { service: context.params.sid }); } });

