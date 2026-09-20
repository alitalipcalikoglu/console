import { Runtime } from '$lib/server/runtime.js';
import { OperationalResponse } from '$lib/server/operational';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
  const runtime = Runtime.get();
  try {
    runtime.checkReadiness();
    return OperationalResponse.json(request, runtime.config, { status: 'ok' });
  } catch (err) {
    return OperationalResponse.json(request, runtime.config, {
      status: 'unavailable',
      error: err instanceof Error ? err.message : String(err),
    }, 503);
  }
};
