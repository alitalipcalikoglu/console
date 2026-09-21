import { FlagsClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';
export const POST = jsonRoute({ auth: 'session', params: Schemas.serviceParams, body: Schemas.flagsEvaluate, handler: ({ runtime, params, body }) => runtime.clients.get(params.sid, FlagsClient).evaluate(body) });

