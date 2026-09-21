import { AuthClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, record, text } from '$lib/server/m4';

const create = Schemas.body(['email', 'password'], { email: Schemas.email, password: Schemas.password, name: { type: 'string', maxLength: 120 } });
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.paging, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, AuthClient).listUsers({ email: text(query.email), limit: number(query.limit), cursor: text(query.cursor) }) });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body: create, status: 201, handler: async (context) => { const output = await context.runtime.clients.get(context.params.sid, AuthClient).createUser(context.body); record(context, 'auth.user.create', context.body.email, { service: context.params.sid }); return output; } });

