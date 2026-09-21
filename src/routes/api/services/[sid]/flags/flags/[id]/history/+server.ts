import { FlagsClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, text } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, query: Schemas.flagsQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, FlagsClient).history(params.id, { limit: number(query.limit), before: text(query.before) }) });

