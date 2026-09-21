import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, WebhookOutClient).rotate(context.params.id); record(context, 'webhook.subscription.rotate', context.params.id, { service: context.params.sid }); return output; } });

