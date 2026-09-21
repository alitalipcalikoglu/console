import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, RateLimitClient).listPolicies() });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: Schemas.rlPolicyCreate, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, RateLimitClient).createPolicy(context.body); record(context, 'ratelimit.policy.create', context.body.name, { service: context.params.sid }); return output; } });

