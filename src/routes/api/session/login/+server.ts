import { ConsoleError } from '../../../../domain/errors.js';
import { ApiEndpoint, ApiRequest, AuthSchemas } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, async () => {
    const limit = runtime.limiter.hit(`login:${event.locals.clientIp}`, runtime.config.rateLimitMax);
    if (!limit.allowed) throw new ConsoleError('RATE_LIMITED', 'too many attempts, slow down', { retryAfterSec: limit.retryAfterSec });
    const body = await ApiRequest.json(event.request, AuthSchemas.login);
    const { token, totpRequired, admin } = await runtime.auth.login(body, AuthRequest.context(event));
    AuthRequest.setCookie(event.cookies, runtime, token);
    return Response.json({ totpRequired, admin: totpRequired ? null : AuthRequest.adminView(admin) });
  });
};
