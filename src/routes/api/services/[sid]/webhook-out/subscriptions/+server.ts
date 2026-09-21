import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.webhookQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, WebhookOutClient).listSubscriptions(query as any) });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: Schemas.webhookCreate, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, WebhookOutClient).createSubscription(context.body); record(context, 'webhook.subscription.create', context.body.name, { service: context.params.sid, url: context.body.url, events: context.body.events }); return output; } });

