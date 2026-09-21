import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, WebhookOutClient).cancelDelivery(context.params.id); record(context, 'webhook.delivery.cancel', context.params.id, { service: context.params.sid }); return output; } });

