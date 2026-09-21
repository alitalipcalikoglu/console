import { Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';

export const GET = jsonRoute({
  auth: 'session',
  handler: ({ runtime }) => ({ items: runtime.adminService.list() }),
});

export const POST = jsonRoute({
  auth: 'admin', body: Schemas.createAdmin, status: 201,
  handler: async ({ runtime, body, admin, event }) => ({
    admin: await runtime.adminService.create(body, admin, { ip: event.locals.clientIp, userAgent: event.request.headers.get('user-agent')?.slice(0, 300) ?? null }),
  }),
});
