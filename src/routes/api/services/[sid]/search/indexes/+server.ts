import { Schemas, SearchClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, SearchClient).listIndexes() });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: Schemas.searchIndexCreate, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, SearchClient).createIndex(context.body); record(context, 'search.index.create', context.body.name, { service: context.params.sid }); return output; } });

