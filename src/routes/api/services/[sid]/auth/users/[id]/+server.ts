import { AuthClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';

const patch = { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: { type: 'string', maxLength: 120, nullable: true }, status: { type: 'string', enum: ['active', 'disabled'] } } };
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, handler: async ({ runtime, params }) => { const client = runtime.clients.get(params.sid, AuthClient); const [user, sessions, events] = await Promise.all([client.getUser(params.id), client.sessions(params.id), client.events(params.id, { limit: 50 })]); return { ...(user as object), sessions: (sessions as any).items, events: (events as any).items, eventsNextBefore: (events as any).nextBefore }; } });
export const PATCH = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: patch, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, AuthClient).patchUser(context.params.id, context.body); record(context, 'auth.user.update', context.params.id, { service: context.params.sid, patch: context.body }); return output; } });
export const DELETE = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, status: 204, handler: async (context) => { await context.runtime.clients.get(context.params.sid, AuthClient).deleteUser(context.params.id); record(context, 'auth.user.delete', context.params.id, { service: context.params.sid }); } });

