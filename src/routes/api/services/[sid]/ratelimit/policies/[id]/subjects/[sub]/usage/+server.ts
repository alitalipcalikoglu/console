import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, RateLimitClient).resetSubject(context.params.id, context.params.sub); record(context, 'ratelimit.subject.reset', context.params.sub, { service: context.params.sid, policy: context.params.id }); return output; } });

