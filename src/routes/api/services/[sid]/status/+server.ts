import { Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';

export const GET = jsonRoute({
  auth: 'session', params: Schemas.serviceParams,
  handler: async ({ runtime, params }) => {
    const client = runtime.clients.any(params.sid) as any;
    const [status, summary] = await Promise.all([client.status(), client.summary().catch((error: Error) => ({ error: error.message }))]);
    return { ...status, summary };
  },
});
