import { MediaClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: { type: 'object' }, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, MediaClient).createTicket(context.body); record(context, 'media.ticket.create', null, { service: context.params.sid }); return output; } });

