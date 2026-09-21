import { Runtime } from '$lib/server/runtime.js';
import { OperationalResponse } from '$lib/server/operational';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const runtime = Runtime.get();
  return OperationalResponse.json(runtime.config, { status: 'ok' });
};
