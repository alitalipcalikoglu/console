import { ConsoleError } from '../../../../domain/errors.js';
import { ApiEndpoint, ApiRequest, AuthSchemas } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, async () => {
    const limit = runtime.limiter.hit(`totp:${event.locals.clientIp}`, runtime.config.rateLimitMax);
    if (!limit.allowed) throw new ConsoleError('RATE_LIMITED', 'too many attempts, slow down', { retryAfterSec: limit.retryAfterSec });
    const body = await ApiRequest.json(event.request, AuthSchemas.totp);
    const resolved = AuthRequest.resolved(runtime, event.locals);
    if (!resolved) throw new ConsoleError('UNAUTHENTICATED', 'sign in first');
    runtime.auth.completeTotp(resolved.session, body.code, AuthRequest.context(event));
    const admin = runtime.admins.byId(resolved.admin.id);
    if (!admin) throw new ConsoleError('UNAUTHENTICATED', 'sign in first');
    return Response.json({ admin: AuthRequest.adminView(admin) });
  });
};
