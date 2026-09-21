import { MediaClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number } from '$lib/server/m4';
const query = { type: 'object', properties: { ttl: { type: 'string', pattern: '^[0-9]{1,7}$' } } };
export const POST = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, query, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, MediaClient).urls(params.id, number(query.ttl)) });

