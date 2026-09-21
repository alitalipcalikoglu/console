import { AuditClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.auditQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, AuditClient).stats(number(query.hours)) });

