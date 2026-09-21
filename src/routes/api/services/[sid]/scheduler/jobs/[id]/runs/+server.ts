import { SchedulerClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, text } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, query: Schemas.schedulerQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, SchedulerClient).runs(params.id, { status: text(query.status), limit: number(query.limit), before: text(query.before) }) });

