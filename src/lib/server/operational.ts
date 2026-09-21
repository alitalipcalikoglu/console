import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Config } from '../../config.js';

/** Frozen response headers and serialization for the four migrated operational routes. */
export class OperationalResponse {
  static #contentSecurityPolicy(publicDir: string) {
    const indexPath = resolve(process.cwd(), publicDir, 'index.html');
    const hashes = existsSync(indexPath)
      ? [...readFileSync(indexPath, 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
        .map((match) => createHash('sha256').update(match[1]).digest('base64'))
      : [];
    const scripts = ["'self'", ...hashes.map((hash) => `'sha256-${hash}'`)].join(' ');
    return `default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
  }

  static securityHeaders(config: Config) {
    return {
      'content-security-policy': OperationalResponse.#contentSecurityPolicy(config.publicDir),
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...(config.tls ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
    };
  }

  static headers(config: Config, contentType: string) {
    return { 'content-type': contentType, ...OperationalResponse.securityHeaders(config) };
  }

  static json(config: Config, body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: OperationalResponse.headers(config, 'application/json; charset=utf-8'),
    });
  }
}
