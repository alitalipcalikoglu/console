import { jsonRoute } from '$lib/server/m4';

export const GET = jsonRoute({ auth: 'session', handler: async ({ runtime }) => ({ items: await runtime.clients.overview() }) });
