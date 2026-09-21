import { MediaClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, text } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.paging, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, MediaClient).listFiles({ limit: number(query.limit), cursor: text(query.cursor) }) });

