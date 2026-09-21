import Ajv, { type ErrorObject, type JSONSchemaType, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ConsoleError } from '../../domain/errors.js';
import { ServiceError } from '../../services/client.js';

const BODY_LIMIT = 64 * 1024;
const ajv = new Ajv({ coerceTypes: false, removeAdditional: false });
addFormats(ajv);

export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message?: string }[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class ApiRequest {
  static compile<T>(schema: JSONSchemaType<T>) {
    return ajv.compile(schema);
  }

  static async json<T>(request: Request, validate: ValidateFunction<T>): Promise<T> {
    const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
    const jsonMedia = mediaType === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType);
    if (mediaType && mediaType !== 'text/plain' && !jsonMedia) {
      throw new ApiRequestError(415, 'FST_ERR_CTP_INVALID_MEDIA_TYPE', 'Unsupported Media Type');
    }
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > BODY_LIMIT) {
      throw new ApiRequestError(413, 'FST_ERR_CTP_BODY_TOO_LARGE', 'Request body is too large');
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BODY_LIMIT) {
          await reader.cancel();
          throw new ApiRequestError(413, 'FST_ERR_CTP_BODY_TOO_LARGE', 'Request body is too large');
        }
        chunks.push(value);
      }
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder().decode(bytes);
    let body: unknown = size === 0 ? undefined : text;
    if (jsonMedia) {
      if (size === 0) throw new ApiRequestError(400, 'FST_ERR_CTP_EMPTY_JSON_BODY', "Body cannot be empty when content-type is set to 'application/json'");
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiRequestError(
          400,
          'FST_ERR_CTP_INVALID_JSON_BODY',
          "Body is not valid JSON but content-type is set to 'application/json'",
        );
      }
    }
    if (validate(body)) return body;

    const errors = (validate.errors ?? []).map((error: ErrorObject) => ({
      path: error.instancePath,
      message: error.message,
    }));
    const message = `body ${errors[0]?.message ?? 'is invalid'}`;
    throw new ApiRequestError(400, 'VALIDATION_FAILED', message, errors);
  }
}

export class ApiResponse {
  static error(error: unknown, log: { error: (...args: unknown[]) => void }) {
    const consoleError = error instanceof ConsoleError || (
      error instanceof Error
      && error.name === 'ConsoleError'
      && 'code' in error
      && 'statusCode' in error
      && typeof error.code === 'string'
      && typeof error.statusCode === 'number'
    ) ? error as ConsoleError : null;
    if (consoleError) {
      const retryAfterSec = (consoleError.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
      return Response.json(
        { error: { code: consoleError.code, message: consoleError.message, ...(consoleError.details ? { details: consoleError.details } : {}) } },
        { status: consoleError.statusCode, headers: retryAfterSec ? { 'retry-after': String(retryAfterSec) } : undefined },
      );
    }
    if (error instanceof ApiRequestError) {
      return Response.json(
        { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
        { status: error.statusCode },
      );
    }
    if (error instanceof ServiceError || (
      error instanceof Error
      && error.name === 'ServiceError'
      && 'statusCode' in error
      && 'code' in error
    )) {
      const serviceError = error as ServiceError;
      return Response.json({
        error: {
          code: serviceError.code,
          message: serviceError.message,
          service: serviceError.service,
          ...(serviceError.details ? { details: serviceError.details } : {}),
        },
      }, { status: serviceError.statusCode });
    }
    log.error({ err: error }, 'unhandled API error');
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'internal error' } }, { status: 500 });
  }
}

export class ApiEndpoint {
  static async run(runtime: { log: { error: (...args: unknown[]) => void } }, handler: () => Response | Promise<Response>) {
    try {
      return await handler();
    } catch (error) {
      return ApiResponse.error(error, runtime.log);
    }
  }
}

const object = <T extends Record<string, unknown>>(
  required: (keyof T)[],
  properties: JSONSchemaType<T>['properties'],
): JSONSchemaType<T> => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
} as unknown as JSONSchemaType<T>);

const password = { type: 'string', minLength: 1, maxLength: 1024 } as const;
const code = { type: 'string', pattern: '^[0-9]{6}$' } as const;

export const AuthSchemas = {
  login: ApiRequest.compile(object<{ email: string; password: string }>(['email', 'password'], {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password,
  })),
  totp: ApiRequest.compile(object<{ code: string }>(['code'], { code })),
  changePassword: ApiRequest.compile(object<{ currentPassword: string; newPassword: string }>(
    ['currentPassword', 'newPassword'],
    { currentPassword: password, newPassword: password },
  )),
  disableTotp: ApiRequest.compile(object<{ password: string; code: string }>(
    ['password', 'code'],
    { password, code },
  )),
};
