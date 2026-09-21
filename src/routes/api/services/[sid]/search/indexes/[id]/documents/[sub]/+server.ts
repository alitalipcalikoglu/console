import { Schemas, SearchClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdSubParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, SearchClient).getDocument(params.id, params.sub) });
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, SearchClient).deleteDocument(context.params.id, context.params.sub); record(context, 'search.document.delete', context.params.sub, { service: context.params.sid, index: context.params.id }); } });

