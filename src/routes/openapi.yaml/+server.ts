import { Runtime } from '$lib/server/runtime.js';
import { OperationalResponse } from '$lib/server/operational';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
  const runtime = Runtime.get();
  return new Response(runtime.openapi, {
    headers: OperationalResponse.headers(request, runtime.config, 'text/yaml; charset=utf-8'),
  });
};
