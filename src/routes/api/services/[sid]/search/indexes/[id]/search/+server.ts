import { Schemas, SearchClient } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'session', params: Schemas.serviceIdParams, body: Schemas.searchBody, handler: ({ runtime, params, body }) => runtime.clients.get(params.sid, SearchClient).search(params.id, body ?? {}) });

