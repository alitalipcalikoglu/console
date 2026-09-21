import { FlagsClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const PATCH = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, body: Schemas.flagsEnvPatch, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, FlagsClient).patchEnv(context.params.id, context.params.sub, context.body); record(context, 'flags.env.update', context.params.id, { service: context.params.sid, env: context.params.sub, patch: context.body }); return output; } });

