import { randomUUID } from 'node:crypto';
import { RequestContext } from '@atc-web/service-core/request-context';
import { TraceContext } from '@atc-web/service-core/trace';
import type { Handle } from '@sveltejs/kit';
import { ApiResponse } from '$lib/server/api';
import { AuthRequest, CSRF_HEADER } from '$lib/server/auth';
import { OperationalResponse } from '$lib/server/operational';
import { Runtime } from '$lib/server/runtime.js';

const CSRF_EXEMPT = new Set(['/api/session/login', '/api/session/totp']);

const clientIp = (event: Parameters<Handle>[0]['event'], trustProxy: boolean) => {
  const direct = event.getClientAddress() || null;
  if (!trustProxy) return direct;
  return event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || direct;
};

export const handle: Handle = async ({ event, resolve }) => {
  const runtime = Runtime.get();
  const trace = TraceContext.forRequest(event.request.headers.get('traceparent'), runtime.config.trustProxy);
  const context = new RequestContext({ requestId: randomUUID(), trace });

  return RequestContext.run(context, async () => {
    event.locals.requestId = context.requestId;
    event.locals.trace = {
      traceId: trace.traceId,
      spanId: trace.spanId,
      parentSpanId: trace.parentSpanId,
      traceparent: trace.toString(),
    };
    event.locals.clientIp = clientIp(event, runtime.config.trustProxy);
    AuthRequest.attach(runtime, event.cookies, event.locals);
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method);
    event.locals.csrf = {
      required: mutation && (event.route.id?.startsWith('/api/') ?? false) && !CSRF_EXEMPT.has(event.route.id ?? ''),
      valid: event.request.headers.get(CSRF_HEADER) === '1',
    };

    let response: Response;
    try {
      response = await resolve(event);
    } catch (error) {
      if (!event.url.pathname.startsWith('/api/')) throw error;
      response = ApiResponse.error(error, runtime.log);
    }

    if (event.url.pathname.startsWith('/api/') && event.route.id === null && response.status === 404) {
      response = Response.json({ error: { code: 'NOT_FOUND', message: 'route not found' } }, { status: 404 });
    }

    for (const [name, value] of Object.entries(OperationalResponse.securityHeaders(runtime.config))) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    response.headers.set('traceparent', trace.toString());
    if (event.url.pathname.startsWith('/api/')) {
      response.headers.set('cache-control', 'no-store');
      if (response.headers.get('content-type') === 'application/json') {
        response.headers.set('content-type', 'application/json; charset=utf-8');
      }
    }
    const setCookie = response.headers.get('set-cookie');
    if (setCookie?.startsWith('console_session=')) {
      response.headers.set('set-cookie', setCookie.replace('; Secure; SameSite=Strict', '; SameSite=Strict; Secure'));
    }
    return response;
  });
};
