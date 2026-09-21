import { ApiEndpoint } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, () => {
    const { admin, session } = AuthRequest.requireSession(runtime, locals);
    return Response.json({ items: runtime.auth.listSessions(admin, session) });
  });
};
