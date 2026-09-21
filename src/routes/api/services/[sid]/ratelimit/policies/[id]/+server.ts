import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, RateLimitClient).getPolicy(params.id) });
export const PATCH = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: Schemas.rlPolicyPatch, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, RateLimitClient).patchPolicy(context.params.id, context.body); record(context, 'ratelimit.policy.update', context.params.id, { service: context.params.sid, patch: context.body }); return output; } });
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, RateLimitClient).deletePolicy(context.params.id); record(context, 'ratelimit.policy.delete', context.params.id, { service: context.params.sid }); } });

