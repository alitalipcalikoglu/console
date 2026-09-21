import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const PUT = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, body: Schemas.rlOverride, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, RateLimitClient).setOverride(context.params.id, context.params.sub, context.body); record(context, 'ratelimit.override.set', context.params.sub, { service: context.params.sid, policy: context.params.id, body: context.body }); return output; } });
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdSubParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, RateLimitClient).deleteOverride(context.params.id, context.params.sub); record(context, 'ratelimit.override.delete', context.params.sub, { service: context.params.sid, policy: context.params.id }); } });

