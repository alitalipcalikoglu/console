import { SchedulerClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, status: 202, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, SchedulerClient).runJob(context.params.id); record(context, 'scheduler.job.run', context.params.id, { service: context.params.sid, run: output?.run?.id ?? null }); return output; } });

