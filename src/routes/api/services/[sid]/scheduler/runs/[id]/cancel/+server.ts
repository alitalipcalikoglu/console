import { SchedulerClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, SchedulerClient).cancelRun(context.params.id); record(context, 'scheduler.run.cancel', context.params.id, { service: context.params.sid }); return output; } });

