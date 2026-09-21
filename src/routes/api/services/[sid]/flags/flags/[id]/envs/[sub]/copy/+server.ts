import { FlagsClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, body: Schemas.body(['to'], { to: Schemas.flagsEnv }), handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, FlagsClient).copyEnv(context.params.id, context.params.sub, context.body.to); record(context, 'flags.env.copy', context.params.id, { service: context.params.sid, from: context.params.sub, to: context.body.to }); return output; } });

