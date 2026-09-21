import { ApiEndpoint } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, () => {
    const { admin, session } = AuthRequest.requireSession(runtime, event.locals);
    return Response.json({ revoked: runtime.auth.logoutOthers(admin, session, AuthRequest.context(event)) });
  });
};
