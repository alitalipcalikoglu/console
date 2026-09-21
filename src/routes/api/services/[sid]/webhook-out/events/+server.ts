import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute, number, text } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.webhookQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, WebhookOutClient).events({ type: text(query.type), limit: number(query.limit), before: text(query.before) }) });

