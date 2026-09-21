import { Schemas, SearchClient } from '$lib/server/m4-contract';
import { jsonRoute, number, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, query: Schemas.searchQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, SearchClient).browse(params.id, { limit: number(query.limit), offset: number(query.offset) }) });
export const PUT = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: Schemas.searchUpsert, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, SearchClient).upsert(context.params.id, context.body.documents); record(context, 'search.documents.upsert', context.params.id, { service: context.params.sid, count: context.body.documents.length }); return output; } });

