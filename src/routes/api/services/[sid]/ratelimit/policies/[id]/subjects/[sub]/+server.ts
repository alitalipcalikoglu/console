import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdSubParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, RateLimitClient).subject(params.id, params.sub) });

