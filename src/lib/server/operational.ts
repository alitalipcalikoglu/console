import type { Config } from '../../config.js';

/** Frozen response headers and serialization for the four migrated operational routes. */
export class OperationalResponse {
  static contentSecurityPolicy() {
    return "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  }

  static securityHeaders(config: Config) {
    return {
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...(config.tls ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
    };
  }

  static headers(config: Config, contentType: string) {
    return {
      'content-type': contentType,
      'content-security-policy': OperationalResponse.contentSecurityPolicy(),
      ...OperationalResponse.securityHeaders(config),
    };
  }

  static json(config: Config, body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: OperationalResponse.headers(config, 'application/json; charset=utf-8'),
    });
  }
}
