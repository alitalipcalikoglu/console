import { Schemas } from '$lib/server/m4-contract';
import { jsonRoute } from '$lib/server/m4';

const params = { type: 'object', properties: { id: Schemas.uuid }, required: ['id'] };

export const PATCH = jsonRoute({
  auth: 'admin', params, body: Schemas.patchAdmin,
  handler: ({ runtime, body, params, admin, event }) => ({ admin: runtime.adminService.update(params.id, body, admin, { ip: event.locals.clientIp, userAgent: event.request.headers.get('user-agent')?.slice(0, 300) ?? null }) }),
});

export const DELETE = jsonRoute({
  auth: 'admin', params, status: 204,
  handler: ({ runtime, params, admin, event }) => runtime.adminService.remove(params.id, admin, { ip: event.locals.clientIp, userAgent: event.request.headers.get('user-agent')?.slice(0, 300) ?? null }),
});
