import { AuditClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, AuditClient).getEvent(params.id) });

