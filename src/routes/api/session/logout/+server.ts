import { ApiEndpoint } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, () => {
    const resolved = AuthRequest.resolved(runtime, event.locals);
    if (resolved?.session.totp_pending === 0) AuthRequest.requireCsrf(event.locals);
    if (resolved) runtime.auth.logout(resolved.session, resolved.admin, AuthRequest.context(event));
    AuthRequest.setCookie(event.cookies, runtime, null);
    return new Response(null, { status: 204 });
  });
};
