import { Runtime } from '$lib/server/runtime.js';
import { OperationalResponse } from '$lib/server/operational';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
  const runtime = Runtime.get();
  return OperationalResponse.json(request, runtime.config, { status: 'ok' });
};
