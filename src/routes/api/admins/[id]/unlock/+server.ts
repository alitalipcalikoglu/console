import { Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';

export const POST = jsonRoute({
  auth: 'admin',
  params: { type: 'object', properties: { id: Schemas.uuid }, required: ['id'] },
  status: 204,
  handler: ({ runtime, params, admin, event }) => runtime.adminService.unlock(params.id, admin, { ip: event.locals.clientIp, userAgent: event.request.headers.get('user-agent')?.slice(0, 300) ?? null }),
});
