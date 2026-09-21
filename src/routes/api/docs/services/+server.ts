import { jsonRoute } from '$lib/server/m4';

export const GET = jsonRoute({ auth: 'session', handler: ({ runtime }) => ({ items: runtime.docs.list() }) });
