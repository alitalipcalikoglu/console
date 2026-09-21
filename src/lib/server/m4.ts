import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { ValidateFunction } from 'ajv';
import { ApiEndpoint, ApiRequest, ApiRequestError } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime, type ConsoleRuntime } from '$lib/server/runtime.js';
import type { AdminRow, SessionRow } from '../../types.js';

type Schema = Record<string, unknown>;
type Auth = 'session' | 'admin';
type Params = Record<string, string>;
type Query = Record<string, string | string[] | undefined>;

export type M4Context = {
  runtime: ConsoleRuntime;
  event: RequestEvent;
  params: Params;
  query: Query;
  body: any;
  admin: AdminRow;
  session: SessionRow;
};

type Route = {
  auth: Auth;
  params?: Schema;
  query?: Schema;
  body?: Schema;
  status?: number;
  handler: (context: M4Context) => unknown | Promise<unknown>;
};

const validators = new WeakMap<Schema, ValidateFunction>();
const compile = (schema?: Schema) => {
  if (!schema) return undefined;
  let validate = validators.get(schema);
  if (!validate) {
    validate = ApiRequest.compile(schema as never);
    validators.set(schema, validate);
  }
  return validate;
};

const validateValue = (where: 'params' | 'querystring', value: unknown, validate?: ValidateFunction) => {
  if (!validate || validate(value)) return value;
  const details = (validate.errors ?? []).map((error) => ({
    path: error.instancePath,
    message: error.message,
  }));
  throw new ApiRequestError(400, 'VALIDATION_FAILED', `${where} ${details[0]?.message ?? 'is invalid'}`, details);
};

const queryObject = (url: URL): Query => {
  const query: Query = {};
  for (const [name, value] of url.searchParams) {
    const previous = query[name];
    query[name] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
  }
  return query;
};

/** Explicit filesystem endpoints share mechanics only; each +server.ts owns its route semantics. */
export const jsonRoute = (route: Route): RequestHandler => {
  const paramsValidator = compile(route.params);
  const queryValidator = compile(route.query);
  const bodyValidator = compile(route.body);
  return async (event) => {
    const runtime = Runtime.get();
    return ApiEndpoint.run(runtime, async () => {
      const params = validateValue('params', { ...event.params }, paramsValidator) as Params;
      const query = validateValue('querystring', queryObject(event.url), queryValidator) as Query;
      const body = bodyValidator ? await ApiRequest.json(event.request, bodyValidator) : undefined;
      const resolved = route.auth === 'admin'
        ? AuthRequest.requireAdmin(runtime, event.locals)
        : AuthRequest.requireSession(runtime, event.locals);
      runtime.prepareM4();
      const output = await route.handler({ runtime, event, params, query, body, ...resolved });
      if (output instanceof Response) return output;
      if (route.status === 204) return new Response(null, { status: 204 });
      return Response.json(output, { status: route.status ?? 200 });
    });
  };
};

export const number = (value: string | string[] | undefined) => (
  typeof value === 'string' && value ? Number(value) : undefined
);

export const text = (value: string | string[] | undefined) => (
  typeof value === 'string' ? value : undefined
);

export const record = (
  context: Pick<M4Context, 'runtime' | 'admin' | 'event'>,
  action: string,
  target: string | null,
  meta: object | null = null,
) => {
  context.runtime.audit.record({
    adminId: context.admin.id,
    adminEmail: context.admin.email,
    action,
    target,
    meta,
    ip: context.event.locals.clientIp,
  });
};
