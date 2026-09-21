import { FlagsClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.flagsQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, FlagsClient).listFlags(query as any) });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: Schemas.flagsCreate, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, FlagsClient).createFlag(context.body); record(context, 'flags.flag.create', context.body.key, { service: context.params.sid, kind: context.body.kind }); return output; } });

