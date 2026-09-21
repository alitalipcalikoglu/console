import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { ValidateFunction } from 'ajv';
import { ApiEndpoint, ApiRequest, ApiRequestError } from '$lib/server/api';
import { AuthRequest } from '$lib/server/auth';
import { Runtime, type ConsoleRuntime } from '$lib/server/runtime.js';
import type { AdminRow, SessionRow } from '../../types.js';

export { CONSOLE_UPLOAD_LIMIT_BYTES, UploadStream } from '../../services/upload-stream.js';

type Schema = Record<string, unknown>;
type Params = Record<string, string>;
export type SpecialQuery = Record<string, string | string[] | undefined>;

export type SpecialContext = {
  runtime: ConsoleRuntime;
  event: RequestEvent;
  params: Params;
  query: SpecialQuery;
  admin: AdminRow;
  session: SessionRow;
};

type SpecialRoute = {
  auth: 'session' | 'admin';
  params: Schema;
  query?: Schema;
  handler: (context: SpecialContext) => Response | Promise<Response>;
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
  const details = (validate.errors ?? []).map((error) => ({ path: error.instancePath, message: error.message }));
  throw new ApiRequestError(400, 'VALIDATION_FAILED', `${where} ${details[0]?.message ?? 'is invalid'}`, details);
};

const queryObject = (url: URL): SpecialQuery => {
  const query: SpecialQuery = {};
  for (const [name, value] of url.searchParams) {
    const previous = query[name];
    query[name] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
  }
  return query;
};

/** Special endpoints share validation/auth mechanics, never route selection or stream semantics. */
export const specialRoute = (route: SpecialRoute): RequestHandler => {
  const paramsValidator = compile(route.params);
  const queryValidator = compile(route.query);
  return async (event) => {
    const runtime = Runtime.get();
    return ApiEndpoint.run(runtime, async () => {
      const params = validateValue('params', { ...event.params }, paramsValidator) as Params;
      const query = validateValue('querystring', queryObject(event.url), queryValidator) as SpecialQuery;
      const resolved = route.auth === 'admin'
        ? AuthRequest.requireAdmin(runtime, event.locals)
        : AuthRequest.requireSession(runtime, event.locals);
      runtime.prepareM4();
      return route.handler({ runtime, event, params, query, ...resolved });
    });
  };
};

export const uploadTooLarge = () => new ApiRequestError(
  413,
  'FST_ERR_CTP_BODY_TOO_LARGE',
  'Request body is too large',
);

export const SPECIAL_CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";
