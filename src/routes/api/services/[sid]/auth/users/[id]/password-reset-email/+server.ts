import { AuthClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceIdParams, body: Schemas.body(['email'], { email: Schemas.email }), status: 202, handler: async (context) => { await context.runtime.clients.get(context.params.sid, AuthClient).forgotPassword(context.body.email); record(context, 'auth.user.password_reset_email', context.params.id, { service: context.params.sid }); return { accepted: true }; } });

