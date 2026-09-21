import { Schemas, WebhookOutClient } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, WebhookOutClient).getEvent(params.id) });

