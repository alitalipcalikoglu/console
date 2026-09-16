import { ConsoleError } from '../domain/errors.js';

/** @typedef {import('fastify').FastifyRequest} FastifyRequest */
/** @typedef {import('fastify').FastifyReply} FastifyReply */
/** @typedef {import('../domain/console-auth.js').ConsoleAuth} ConsoleAuth */

/**
 * Cookie-based session handling for Fastify: parses the session cookie, resolves the admin,
 * and offers role gates. CSRF defence: SameSite=Strict cookie plus a required custom header
 * on every state-changing request (browsers cannot add it cross-site without CORS approval).
 */
export class SessionAuth {
  static COOKIE = 'console_session';
  static CSRF_HEADER = 'x-console-request';

  /**
   * @param {ConsoleAuth} auth
   * @param {{ secure: boolean, ttlMs: number }} o
   */
  constructor(auth, o) {
    this.auth = auth;
    this.secure = o.secure;
    this.ttlMs = o.ttlMs;
  }

  /**
   * @param {string|undefined} header
   * @returns {string|undefined}
   */
  static readCookie(header) {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i === -1) continue;
      if (part.slice(0, i).trim() === SessionAuth.COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return undefined;
  }

  /**
   * @param {FastifyReply} reply
   * @param {string|null} token  Null clears the cookie.
   */
  setCookie(reply, token) {
    const attrs = ['Path=/', 'HttpOnly', 'SameSite=Strict', this.secure ? 'Secure' : ''].filter(Boolean);
    const value = token ? `${SessionAuth.COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(this.ttlMs / 1000)}` : `${SessionAuth.COOKIE}=; Max-Age=0`;
    reply.header('set-cookie', `${value}; ${attrs.join('; ')}`);
  }

  /** Resolve the session on every request; never rejects by itself. @type {(request: FastifyRequest) => Promise<void>} */
  attach = async (request) => {
    const resolved = this.auth.resolve(SessionAuth.readCookie(request.headers.cookie));
    request.admin = resolved?.admin ?? null;
    request.consoleSession = resolved?.session ?? null;
  };

  /**
   * Requires a fully signed-in admin (TOTP step done) and the CSRF header on mutations.
   * @param {FastifyRequest} request
   */
  requireSession(request) {
    if (!request.admin || !request.consoleSession) throw new ConsoleError('UNAUTHENTICATED', 'sign in required');
    if (request.consoleSession.totp_pending === 1) throw new ConsoleError('TOTP_REQUIRED', 'second factor required');
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers[SessionAuth.CSRF_HEADER] !== '1') {
      throw new ConsoleError('FORBIDDEN', `missing ${SessionAuth.CSRF_HEADER} header`);
    }
  }

  /** Requires the `admin` role for anything that changes state. @param {FastifyRequest} request */
  requireAdmin(request) {
    this.requireSession(request);
    if (/** @type {import('../types.js').AdminRow} */ (request.admin).role !== 'admin') throw new ConsoleError('FORBIDDEN', 'viewers cannot change anything');
  }

  /** @param {FastifyRequest} request */
  static ctx(request) {
    const ua = request.headers['user-agent'];
    return { ip: request.ip || null, userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null };
  }
}
