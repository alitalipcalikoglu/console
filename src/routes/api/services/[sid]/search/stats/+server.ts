import { Schemas, SearchClient } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, handler: ({ runtime, params }) => runtime.clients.get(params.sid, SearchClient).stats() });

