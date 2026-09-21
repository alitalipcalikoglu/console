import { Schemas, ShortlinkClient } from '$lib/server/m4-contract';
import { jsonRoute, number } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.shortlinkQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, ShortlinkClient).stats(number(query.days)) });

