import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, status: 202, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, WebhookOutClient).redeliver(context.params.id); record(context, 'webhook.delivery.redeliver', context.params.id, { service: context.params.sid, delivery: output?.delivery?.id ?? null }); return output; } });

