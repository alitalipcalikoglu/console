import { RateLimitClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, query: Schemas.rlStatsQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, RateLimitClient).policyStats(params.id, { hours: number(query.hours) }) });

