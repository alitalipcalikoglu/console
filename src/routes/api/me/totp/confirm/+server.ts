import { ApiEndpoint, ApiRequest, AuthSchemas } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime } from '$lib/server/runtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const runtime = Runtime.get();
  return ApiEndpoint.run(runtime, async () => {
    const body = await ApiRequest.json(event.request, AuthSchemas.totp);
    const { admin } = AuthRequest.requireSession(runtime, event.locals);
    runtime.auth.confirmTotp(admin, body.code, AuthRequest.context(event));
    return new Response(null, { status: 204 });
  });
};
