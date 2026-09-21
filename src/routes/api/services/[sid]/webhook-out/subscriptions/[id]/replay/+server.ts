import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: Schemas.webhookReplay, status: 202, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, WebhookOutClient).replay(context.params.id, context.body); record(context, 'webhook.subscription.replay', context.params.id, { service: context.params.sid, ...context.body, queued: output?.queued ?? null }); return output; } });

