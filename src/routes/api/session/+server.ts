import { ApiEndpoint } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, () => {
    const resolved = AuthRequest.resolved(runtime, locals);
    if (!resolved) return Response.json({ admin: null, totpPending: false });
    if (resolved.session.totp_pending === 1) return Response.json({ admin: null, totpPending: true });
    return Response.json({ admin: AuthRequest.adminView(resolved.admin), totpPending: false });
  });
};
