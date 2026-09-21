import { AuthClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, AuthClient).revokeAllSessions(context.params.id); record(context, 'auth.user.sessions.revoke_all', context.params.id, { service: context.params.sid }); return output; } });

