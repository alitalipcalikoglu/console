import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { AdminService } from '../domain/admin-service.js';
import { ConsoleError } from '../domain/errors.js';
import { AuthClient } from '../services/auth-client.js';
import { ServiceError } from '../services/client.js';
import { GatewayClient } from '../services/gateway-client.js';
import { MediaClient } from '../services/media-client.js';
import { NotifyClient } from '../services/notify-client.js';
import { SessionAuth } from './session-auth.js';

/** @typedef {import('../config.js').Config} Config */
/** @typedef {import('fastify').FastifyInstance} FastifyInstance */
/** @typedef {import('fastify').FastifyRequest} FastifyRequest */
/** @typedef {import('fastify').FastifyReply} FastifyReply */
/** @typedef {import('../types.js').AdminRow} AdminRow */

/** JSON Schemas for the console's own API. */
class Schemas {
  static email = { type: 'string', format: 'email', maxLength: 254 };
  static password = { type: 'string', minLength: 1, maxLength: 1024 };
  static code = { type: 'string', pattern: '^[0-9]{6}$' };
  static uuid = { type: 'string', format: 'uuid' };
  static id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_.:-]+$' };
  static sid = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', maxLength: 40 };

  /** @param {string[]} required @param {Record<string, object>} properties */
  static body(required, properties) {
    return { type: 'object', additionalProperties: false, required, properties };
  }

  static login = Schemas.body(['email', 'password'], { email: Schemas.email, password: Schemas.password });
  static totp = Schemas.body(['code'], { code: Schemas.code });
  static changePassword = Schemas.body(['currentPassword', 'newPassword'], { currentPassword: Schemas.password, newPassword: Schemas.password });
  static disableTotp = Schemas.body(['password', 'code'], { password: Schemas.password, code: Schemas.code });
  static createAdmin = Schemas.body(['email', 'password', 'role'], { email: Schemas.email, password: Schemas.password, name: { type: 'string', maxLength: 80 }, role: { type: 'string', enum: ['admin', 'viewer'] } });
  static patchAdmin = { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, role: { type: 'string', enum: ['admin', 'viewer'] }, status: { type: 'string', enum: ['active', 'disabled'] } } };
  static setPassword = Schemas.body(['password'], { password: Schemas.password });
  static serviceParams = { type: 'object', properties: { sid: Schemas.sid }, required: ['sid'] };
  static serviceIdParams = { type: 'object', properties: { sid: Schemas.sid, id: Schemas.id }, required: ['sid', 'id'] };
  static serviceIdSubParams = { type: 'object', properties: { sid: Schemas.sid, id: Schemas.id, sub: Schemas.id }, required: ['sid', 'id', 'sub'] };
  static paging = { type: 'object', additionalProperties: true, properties: { limit: { type: 'string', pattern: '^([1-9]|[1-9][0-9]|100)$' }, cursor: { type: 'string', maxLength: 200 }, status: { type: 'string', maxLength: 20 }, email: { type: 'string', maxLength: 254 }, before: { type: 'string', maxLength: 30 }, action: { type: 'string', maxLength: 60 } } };
}

/**
 * The console's HTTP surface: its own session/admin endpoints, typed pass-through operations for
 * each service (never a generic proxy), and the static Svelte app with SPA fallback.
 */
export class ConsoleApi {
  /** Svelte needs inline style attributes; scripts and connections stay same-origin. */
  static APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  /** Content types the browser may render inline from the file proxy; everything else downloads as an opaque blob. */
  static INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

  /**
   * @param {object} deps
   * @param {Config} deps.config
   * @param {import('../domain/console-auth.js').ConsoleAuth} deps.auth
   * @param {AdminService} deps.adminService
   * @param {import('../store/audit-store.js').AuditStore} deps.audit
   * @param {import('../services/clients.js').ServiceClients} deps.clients
   * @param {import('../db.js').Database} deps.db
   * @param {import('../rate-limiter.js').RateLimiter} deps.limiter
   * @param {import('../types.js').Logger} [deps.logger]
   */
  constructor({ config, auth, adminService, audit, clients, db, limiter, logger }) {
    this.config = config;
    this.auth = auth;
    this.adminService = adminService;
    this.audit = audit;
    this.clients = clients;
    this.db = db;
    this.limiter = limiter;
    this.logger = logger;
    this.session = new SessionAuth(auth, { secure: config.cookieSecure, ttlMs: config.sessionTtlMin * 60_000 });
  }

  /** @returns {Promise<FastifyInstance>} */
  async build() {
    const { config } = this;
    const app = Fastify({
      ...(config.tls ? { https: { cert: readFileSync(config.tls.certPath), key: readFileSync(config.tls.keyPath), minVersion: 'TLSv1.2' } } : {}),
      loggerInstance: this.logger,
      logger: this.logger ? undefined : { level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie'] },
      trustProxy: config.trustProxy,
      bodyLimit: 64 * 1024,
      requestIdHeader: false,
      genReqId: () => randomUUID(),
      ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    });
    app.decorateRequest('admin', null);
    app.decorateRequest('consoleSession', null);
    app.setErrorHandler(this.#errorHandler);
    app.addHook('onRequest', this.session.attach);
    app.addHook('onSend', async (request, reply) => {
      reply.header('x-content-type-options', 'nosniff');
      reply.header('referrer-policy', 'same-origin');
      reply.header('x-frame-options', 'DENY');
      // Strict CSP for the app; file-byte responses set their own sandboxed policy.
      if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', ConsoleApi.APP_CSP);
      if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
      if (config.tls) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    });

    app.get('/health', { logLevel: 'warn' }, async () => ({ status: 'ok' }));
    app.get('/ready', { logLevel: 'warn' }, async (_request, reply) => {
      try {
        this.db.ping();
        return { status: 'ok' };
      } catch (err) {
        return reply.code(503).send({ status: 'unavailable', error: err instanceof Error ? err.message : String(err) });
      }
    });

    await app.register((api) => this.#registerApi(api), { prefix: '/api' });
    await this.#registerStatic(app);
    return app;
  }

  /**
   * @param {import('fastify').FastifyError} rawErr
   * @param {FastifyRequest} request
   * @param {FastifyReply} reply
   */
  #errorHandler = (rawErr, request, reply) => {
    const err = /** @type {import('fastify').FastifyError & { validation?: { instancePath: string, message?: string, params: object }[] }} */ (rawErr);
    if (err instanceof ConsoleError) {
      const retry = /** @type {{ retryAfterSec?: number }|undefined} */ (err.details)?.retryAfterSec;
      if (retry) reply.header('retry-after', String(retry));
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    if (err instanceof ServiceError) {
      return reply.code(err.statusCode === 502 ? 502 : err.statusCode).send({ error: { code: err.code, message: err.message, service: err.service, ...(err.details ? { details: err.details } : {}) } });
    }
    if (err.validation) {
      return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: err.message, details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })) } });
    }
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) request.log.error({ err }, 'unhandled error');
    return reply.code(status).send({ error: { code: status >= 500 ? 'INTERNAL_ERROR' : (err.code ?? 'REQUEST_ERROR'), message: status >= 500 ? 'internal error' : err.message } });
  };

  /**
   * Serve the built Svelte app. Unknown non-API paths fall back to index.html (client routing).
   * @param {FastifyInstance} app
   */
  async #registerStatic(app) {
    const root = resolve(process.cwd(), this.config.publicDir);
    // wildcard serving: files added by a later `npm run build` are picked up without a restart.
    await app.register(fastifyStatic, {
      root, wildcard: true, index: 'index.html',
      cacheControl: false,
      setHeaders(reply, path) {
        // Hashed assets are immutable; everything else must revalidate so deploys show up.
        reply.header('cache-control', /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.\w+$/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
        if (path.endsWith('sw.js')) reply.header('service-worker-allowed', '/');
      },
    });
    // Anything the static plugin cannot find: API paths and file-like paths are JSON 404s,
    // every other GET is a client-side route and receives index.html.
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0];
      if (request.method !== 'GET' && request.method !== 'HEAD') return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'route not found' } });
      if (path.startsWith('/api/')) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'route not found' } });
      if (/\.[a-z0-9]{2,8}$/i.test(path)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'file not found' } });
      reply.header('cache-control', 'no-cache');
      return reply.sendFile('index.html');
    });
  }

  /** @param {FastifyInstance} api */
  #registerApi(api) {
    const s = this.session;
    const ctx = SessionAuth.ctx;
    const me = (/** @type {FastifyRequest} */ r) => /** @type {AdminRow} */ (r.admin);
    const sess = (/** @type {FastifyRequest} */ r) => /** @type {import('../types.js').SessionRow} */ (r.consoleSession);
    const record = (/** @type {FastifyRequest} */ r, /** @type {string} */ action, /** @type {string|null} */ target, /** @type {object|null} */ meta = null) => {
      this.audit.record({ adminId: me(r).id, adminEmail: me(r).email, action, target, meta, ip: r.ip });
    };

    // ---------------------------------------------------------------- session
    api.post('/session/login', { schema: { body: Schemas.login } }, async (request, reply) => {
      const limit = this.limiter.hit(`login:${request.ip}`, this.config.rateLimitMax);
      if (!limit.allowed) throw new ConsoleError('RATE_LIMITED', 'too many attempts, slow down', { retryAfterSec: limit.retryAfterSec });
      const { token, totpRequired, admin } = await this.auth.login(/** @type {any} */ (request.body), ctx(request));
      s.setCookie(reply, token);
      return { totpRequired, admin: totpRequired ? null : AdminService.view(admin) };
    });

    api.post('/session/totp', { schema: { body: Schemas.totp } }, async (request) => {
      const limit = this.limiter.hit(`totp:${request.ip}`, this.config.rateLimitMax);
      if (!limit.allowed) throw new ConsoleError('RATE_LIMITED', 'too many attempts, slow down', { retryAfterSec: limit.retryAfterSec });
      if (!request.admin || !request.consoleSession) throw new ConsoleError('UNAUTHENTICATED', 'sign in first');
      this.auth.completeTotp(request.consoleSession, /** @type {{ code: string }} */ (request.body).code, ctx(request));
      return { admin: AdminService.view(/** @type {AdminRow} */ (this.adminService.admins.byId(request.admin.id))) };
    });

    api.get('/session', async (request) => {
      if (!request.admin || !request.consoleSession) return { admin: null, totpPending: false };
      if (request.consoleSession.totp_pending === 1) return { admin: null, totpPending: true };
      return { admin: AdminService.view(request.admin), totpPending: false };
    });

    api.post('/session/logout', async (request, reply) => {
      if (request.admin && request.consoleSession) this.auth.logout(request.consoleSession, request.admin, ctx(request));
      s.setCookie(reply, null);
      return reply.code(204).send();
    });

    // ---------------------------------------------------------------- my account
    api.get('/me/sessions', async (request) => { s.requireSession(request); return { items: this.auth.listSessions(me(request), sess(request)) }; });
    api.post('/me/sessions/logout-others', async (request) => { s.requireSession(request); return { revoked: this.auth.logoutOthers(me(request), sess(request), ctx(request)) }; });
    api.post('/me/password', { schema: { body: Schemas.changePassword } }, async (request, reply) => {
      s.requireSession(request);
      await this.auth.changePassword(me(request), sess(request), /** @type {any} */ (request.body), ctx(request));
      return reply.code(204).send();
    });
    api.post('/me/totp/start', async (request) => { s.requireSession(request); return this.auth.startTotp(me(request)); });
    api.post('/me/totp/confirm', { schema: { body: Schemas.totp } }, async (request, reply) => {
      s.requireSession(request);
      this.auth.confirmTotp(me(request), /** @type {{ code: string }} */ (request.body).code, ctx(request));
      return reply.code(204).send();
    });
    api.post('/me/totp/disable', { schema: { body: Schemas.disableTotp } }, async (request, reply) => {
      s.requireSession(request);
      await this.auth.disableTotp(me(request), /** @type {any} */ (request.body), ctx(request));
      return reply.code(204).send();
    });

    // ---------------------------------------------------------------- admins
    api.get('/admins', async (request) => { s.requireSession(request); return { items: this.adminService.list() }; });
    api.post('/admins', { schema: { body: Schemas.createAdmin } }, async (request, reply) => {
      s.requireAdmin(request);
      const created = await this.adminService.create(/** @type {any} */ (request.body), me(request), ctx(request));
      return reply.code(201).send({ admin: created });
    });
    api.patch('/admins/:id', { schema: { params: { type: 'object', properties: { id: Schemas.uuid }, required: ['id'] }, body: Schemas.patchAdmin } }, async (request) => {
      s.requireAdmin(request);
      return { admin: this.adminService.update(/** @type {{ id: string }} */ (request.params).id, /** @type {any} */ (request.body), me(request), ctx(request)) };
    });
    api.post('/admins/:id/password', { schema: { params: { type: 'object', properties: { id: Schemas.uuid }, required: ['id'] }, body: Schemas.setPassword } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.adminService.resetPassword(/** @type {{ id: string }} */ (request.params).id, /** @type {{ password: string }} */ (request.body).password, me(request), ctx(request));
      return reply.code(204).send();
    });
    api.post('/admins/:id/unlock', { schema: { params: { type: 'object', properties: { id: Schemas.uuid }, required: ['id'] } } }, async (request, reply) => {
      s.requireAdmin(request);
      this.adminService.unlock(/** @type {{ id: string }} */ (request.params).id, me(request), ctx(request));
      return reply.code(204).send();
    });
    api.delete('/admins/:id', { schema: { params: { type: 'object', properties: { id: Schemas.uuid }, required: ['id'] } } }, async (request, reply) => {
      s.requireAdmin(request);
      this.adminService.remove(/** @type {{ id: string }} */ (request.params).id, me(request), ctx(request));
      return reply.code(204).send();
    });

    // ---------------------------------------------------------------- audit
    api.get('/audit', { schema: { querystring: Schemas.paging } }, async (request) => {
      s.requireSession(request);
      const q = /** @type {{ limit?: string, before?: string, action?: string }} */ (request.query);
      const limit = q.limit ? Number(q.limit) : 50;
      const rows = this.audit.list({ limit: limit + 1, beforeId: q.before ? Number(q.before) : undefined, action: q.action });
      const items = rows.slice(0, limit).map((e) => ({ id: e.id, adminId: e.admin_id, adminEmail: e.admin_email, action: e.action, target: e.target, meta: e.meta ? JSON.parse(e.meta) : null, ip: e.ip, at: new Date(e.at).toISOString() }));
      return { items, nextBefore: rows.length > limit ? String(items.at(-1)?.id) : null };
    });

    // ---------------------------------------------------------------- services: overview
    api.get('/services', async (request) => { s.requireSession(request); return { items: this.clients.registry.describe() }; });
    api.get('/services/overview', async (request) => { s.requireSession(request); return { items: await this.clients.overview() }; });
    api.get('/services/:sid/status', { schema: { params: Schemas.serviceParams } }, async (request) => {
      s.requireSession(request);
      const c = this.clients.any(/** @type {{ sid: string }} */ (request.params).sid);
      const [status, summary] = await Promise.all([c.status(), /** @type {any} */ (c).summary().catch((/** @type {Error} */ e) => ({ error: e.message }))]);
      return { ...status, summary };
    });

    const P = Schemas.serviceParams;
    const PI = Schemas.serviceIdParams;
    const PIS = Schemas.serviceIdSubParams;
    const Q = Schemas.paging;
    const sid = (/** @type {FastifyRequest} */ r) => /** @type {{ sid: string }} */ (r.params).sid;
    const pid = (/** @type {FastifyRequest} */ r) => /** @type {{ id: string }} */ (r.params).id;
    const psub = (/** @type {FastifyRequest} */ r) => /** @type {{ sub: string }} */ (r.params).sub;
    const query = (/** @type {FastifyRequest} */ r) => /** @type {Record<string, string|undefined>} */ (r.query);
    const num = (/** @type {string|undefined} */ v) => (v ? Number(v) : undefined);

    // ---------------------------------------------------------------- notify
    api.get('/services/:sid/notify/messages', { schema: { params: P, querystring: Q } }, async (request) => {
      s.requireSession(request);
      const q = query(request);
      return this.clients.get(sid(request), NotifyClient).listMessages({ status: q.status, limit: num(q.limit), cursor: q.cursor });
    });
    api.get('/services/:sid/notify/messages/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), NotifyClient).getMessage(pid(request)); });
    api.post('/services/:sid/notify/messages/:id/retry', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), NotifyClient).retry(pid(request));
      record(request, 'notify.message.retry', pid(request), { service: sid(request) });
      return out;
    });
    api.get('/services/:sid/notify/templates', { schema: { params: P } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), NotifyClient).templates(); });
    api.post('/services/:sid/notify/messages', { schema: { params: P, body: { type: 'object' } } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {any} */ (request.body);
      const out = await this.clients.get(sid(request), NotifyClient).send(body);
      record(request, 'notify.message.send', /** @type {any} */ (out)?.id ?? null, { service: sid(request), channel: body.channel, template: body.template, to: body.to });
      return reply.code(202).send(out);
    });

    // ---------------------------------------------------------------- auth
    api.get('/services/:sid/auth/users', { schema: { params: P, querystring: Q } }, async (request) => {
      s.requireSession(request);
      const q = query(request);
      return this.clients.get(sid(request), AuthClient).listUsers({ email: q.email, limit: num(q.limit), cursor: q.cursor });
    });
    api.post('/services/:sid/auth/users', { schema: { params: P, body: Schemas.body(['email', 'password'], { email: Schemas.email, password: Schemas.password, name: { type: 'string', maxLength: 120 } }) } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {any} */ (request.body);
      const out = await this.clients.get(sid(request), AuthClient).createUser(body);
      record(request, 'auth.user.create', body.email, { service: sid(request) });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/auth/users/:id', { schema: { params: PI } }, async (request) => {
      s.requireSession(request);
      const c = this.clients.get(sid(request), AuthClient);
      const [user, sessions, events] = await Promise.all([c.getUser(pid(request)), c.sessions(pid(request)), c.events(pid(request), { limit: 50 })]);
      return { ...user, sessions: /** @type {any} */ (sessions).items, events: /** @type {any} */ (events).items, eventsNextBefore: /** @type {any} */ (events).nextBefore };
    });
    api.get('/services/:sid/auth/users/:id/events', { schema: { params: PI, querystring: Q } }, async (request) => {
      s.requireSession(request);
      const q = query(request);
      return this.clients.get(sid(request), AuthClient).events(pid(request), { limit: num(q.limit), before: q.before });
    });
    api.patch('/services/:sid/auth/users/:id', { schema: { params: PI, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: { type: 'string', maxLength: 120, nullable: true }, status: { type: 'string', enum: ['active', 'disabled'] } } } } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), AuthClient).patchUser(pid(request), /** @type {any} */ (request.body));
      record(request, 'auth.user.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/auth/users/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), AuthClient).deleteUser(pid(request));
      record(request, 'auth.user.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.delete('/services/:sid/auth/users/:id/sessions', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), AuthClient).revokeAllSessions(pid(request));
      record(request, 'auth.user.sessions.revoke_all', pid(request), { service: sid(request) });
      return out;
    });
    api.delete('/services/:sid/auth/users/:id/sessions/:sub', { schema: { params: PIS } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), AuthClient).revokeSession(pid(request), psub(request));
      record(request, 'auth.user.session.revoke', pid(request), { service: sid(request), sessionId: psub(request) });
      return reply.code(204).send();
    });
    api.post('/services/:sid/auth/users/:id/resend-verification', { schema: { params: PI, body: Schemas.body(['email'], { email: Schemas.email }) } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), AuthClient).resendVerification(/** @type {{ email: string }} */ (request.body).email);
      record(request, 'auth.user.resend_verification', pid(request), { service: sid(request) });
      return reply.code(202).send({ accepted: true });
    });
    api.post('/services/:sid/auth/users/:id/password-reset-email', { schema: { params: PI, body: Schemas.body(['email'], { email: Schemas.email }) } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), AuthClient).forgotPassword(/** @type {{ email: string }} */ (request.body).email);
      record(request, 'auth.user.password_reset_email', pid(request), { service: sid(request) });
      return reply.code(202).send({ accepted: true });
    });
    api.get('/services/:sid/auth/jwks', { schema: { params: P } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), AuthClient).jwks(); });

    // ---------------------------------------------------------------- media
    api.get('/services/:sid/media/files', { schema: { params: P, querystring: Q } }, async (request) => {
      s.requireSession(request);
      const q = query(request);
      return this.clients.get(sid(request), MediaClient).listFiles({ limit: num(q.limit), cursor: q.cursor });
    });
    api.get('/services/:sid/media/files/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), MediaClient).getFile(pid(request)); });
    api.get('/services/:sid/media/files/:id/bytes/:sub', { schema: { params: PIS }, logLevel: 'warn' }, async (request, reply) => {
      s.requireSession(request);
      const res = await this.clients.get(sid(request), MediaClient).bytes(pid(request), psub(request));
      // Same-origin proxy: never let non-raster content (SVG, HTML, PDF) execute or render here.
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const inline = ConsoleApi.INLINE_TYPES.has(type);
      reply.header('content-type', inline ? type : 'application/octet-stream');
      const disposition = res.headers.get('content-disposition');
      reply.header('content-disposition', inline && disposition ? disposition : `attachment; filename="${pid(request)}.bin"`);
      for (const h of ['content-length', 'etag']) {
        const v = res.headers.get(h);
        if (v) reply.header(h, v);
      }
      reply.header('content-security-policy', "default-src 'none'; sandbox");
      reply.header('cache-control', 'private, max-age=300');
      return reply.send(res.body ? /** @type {any} */ (await import('node:stream')).Readable.fromWeb(/** @type {any} */ (res.body)) : Buffer.alloc(0));
    });
    api.patch('/services/:sid/media/files/:id', { schema: { params: PI, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { name: { type: 'string', minLength: 1, maxLength: 255 }, visibility: { type: 'string', enum: ['public', 'private'] } } } } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), MediaClient).patchFile(pid(request), /** @type {any} */ (request.body));
      record(request, 'media.file.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/media/files/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), MediaClient).deleteFile(pid(request));
      record(request, 'media.file.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.post('/services/:sid/media/files/:id/restore', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), MediaClient).restoreFile(pid(request));
      record(request, 'media.file.restore', pid(request), { service: sid(request) });
      return out;
    });
    api.post('/services/:sid/media/files/:id/urls', { schema: { params: PI, querystring: { type: 'object', properties: { ttl: { type: 'string', pattern: '^[0-9]{1,7}$' } } } } }, async (request) => {
      s.requireSession(request);
      return this.clients.get(sid(request), MediaClient).urls(pid(request), num(query(request).ttl));
    });
    api.post('/services/:sid/media/tickets', { schema: { params: P, body: { type: 'object' } } }, async (request, reply) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), MediaClient).createTicket(/** @type {any} */ (request.body));
      record(request, 'media.ticket.create', null, { service: sid(request) });
      return reply.code(201).send(out);
    });

    return api;
  }

  /**
   * Streaming upload lives outside the JSON body limit: registered on the root instance.
   * @param {FastifyInstance} app
   */
  registerUpload(app) {
    app.addContentTypeParser('*', { bodyLimit: 512 * 1024 * 1024 }, (_request, payload, done) => done(null, payload));
    app.put('/api/services/:sid/media/files', { schema: { params: Schemas.serviceParams, querystring: { type: 'object', additionalProperties: false, properties: { visibility: { type: 'string', enum: ['public', 'private'] }, name: { type: 'string', maxLength: 255 } } } }, bodyLimit: 512 * 1024 * 1024 }, async (request, reply) => {
      this.session.requireAdmin(request);
      const q = /** @type {{ visibility?: string, name?: string }} */ (request.query);
      const c = this.clients.get(/** @type {{ sid: string }} */ (request.params).sid, MediaClient);
      const out = /** @type {any} */ (await c.upload(/** @type {NodeJS.ReadableStream} */ (request.raw), { name: q.name, visibility: q.visibility, contentType: request.headers['content-type'], contentLength: request.headers['content-length'] }));
      this.audit.record({ adminId: /** @type {AdminRow} */ (request.admin).id, adminEmail: /** @type {AdminRow} */ (request.admin).email, action: 'media.file.upload', target: out?.file?.id ?? null, meta: { service: c.id, name: out?.file?.name, size: out?.file?.size }, ip: request.ip });
      return reply.code(201).send(out);
    });
  }
}
