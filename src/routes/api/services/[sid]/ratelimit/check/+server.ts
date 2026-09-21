import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: Schemas.rlCheck, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, RateLimitClient).check(context.body); if (!context.body.peek) record(context, 'ratelimit.check', context.body.subject, { service: context.params.sid, policy: context.body.policy, allowed: output?.allowed ?? null }); return output; } });

