import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { registerInfo, registerOpenApi, registerRequestContext } from '@atc-web/service-core/fastify';
import { RequestContext } from '@atc-web/service-core/request-context';
import { AdminService } from '../domain/admin-service.js';
import { ConsoleError } from '../domain/errors.js';
import { AuditClient } from '../services/audit-client.js';
import { AuthClient } from '../services/auth-client.js';
import { FlagsClient } from '../services/flags-client.js';
import { SchedulerClient } from '../services/scheduler-client.js';
import { GeoClient } from '../services/geo-client.js';
import { RateLimitClient } from '../services/ratelimit-client.js';
import { SearchClient } from '../services/search-client.js';
import { ServiceError } from '../services/client.js';
import { GatewayClient } from '../services/gateway-client.js';
import { MediaClient } from '../services/media-client.js';
import { NotifyClient } from '../services/notify-client.js';
import { ShortlinkClient } from '../services/shortlink-client.js';
import { WebhookOutClient } from '../services/webhook-out-client.js';
import { SessionAuth } from './session-auth.js';
import { Schemas } from './schemas.js';

/** @typedef {import('../config.js').Config} Config */
/** @typedef {import('fastify').FastifyInstance} FastifyInstance */
/** @typedef {import('fastify').FastifyRequest} FastifyRequest */
/** @typedef {import('fastify').FastifyReply} FastifyReply */
/** @typedef {import('../types.js').AdminRow} AdminRow */


/**
 * The console's HTTP surface: its own session/admin endpoints, typed pass-through operations for
 * each service (never a generic proxy), and the static Svelte app with SPA fallback.
 */
export class ConsoleApi {
  /**
   * Svelte needs inline style attributes; scripts stay same-origin plus the hashes of the inline
   * scripts found in the built index.html (theme pre-paint).
   * @param {string[]} scriptHashes
   */
  static appCsp(scriptHashes) {
    const scripts = ["'self'", ...scriptHashes.map((h) => `'sha256-${h}'`)].join(' ');
    return `default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
  }

  /**
   * sha256 (base64) of every inline, non-module <script> body in index.html.
   * @param {string} indexPath
   */
  static inlineScriptHashes(indexPath) {
    if (!existsSync(indexPath)) return [];
    const html = readFileSync(indexPath, 'utf8');
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => createHash('sha256').update(m[1]).digest('base64'));
  }
  /** Content types the browser may render inline from the file proxy; everything else downloads as an opaque blob. */
  /** Paths that can only be static files: hashed assets, icons, and top-level files with a web extension. */
  static ASSET_PATH = /^\/(assets\/|icons\/|[^/]+\.(png|jpe?g|gif|webp|svg|ico|js|mjs|css|map|json|webmanifest|txt|xml|woff2?|ttf)$)/i;
  static INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

  /**
   * @param {object} deps
   * @param {Config} deps.config
   * @param {import('../domain/console-auth.js').ConsoleAuth} deps.auth
   * @param {AdminService} deps.adminService
   * @param {import('../store/audit-store.js').AuditStore} deps.audit
   * @param {import('../services/clients.js').ServiceClients} deps.clients
   * @param {import('../services/openapi-documents.js').OpenApiDocuments} deps.docs
   * @param {import('../db.js').Database} deps.db
   * @param {import('../rate-limiter.js').RateLimiter} deps.limiter
   * @param {string} deps.version
   * @param {import('../types.js').Logger} [deps.logger]
   */
  constructor({ config, auth, adminService, audit, clients, docs, db, limiter, version, logger }) {
    this.config = config;
    this.auth = auth;
    this.adminService = adminService;
    this.audit = audit;
    this.clients = clients;
    this.docs = docs;
    this.db = db;
    this.limiter = limiter;
    this.version = version;
    this.logger = logger;
    this.session = new SessionAuth(auth, { secure: config.cookieSecure, ttlMs: config.sessionTtlMin * 60_000 });
    this.csp = ConsoleApi.appCsp(ConsoleApi.inlineScriptHashes(resolve(process.cwd(), config.publicDir, 'index.html')));
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
    // Post-production Phase 5: honours a valid inbound traceparent only when TRUST_PROXY=true —
    // the same trust boundary console already declares for X-Forwarded-For, not a new one. The
    // browser reaches console directly with no boundary to gate by default (TRUST_PROXY=false,
    // console's own established default) — see registerRequestContext's own doc.
    registerRequestContext(app, { trustProxy: config.trustProxy });
    app.addHook('onRequest', this.session.attach);
    app.addHook('onSend', async (request, reply) => {
      reply.header('x-content-type-options', 'nosniff');
      reply.header('referrer-policy', 'same-origin');
      reply.header('x-frame-options', 'DENY');
      const trace = RequestContext.get()?.trace;
      if (trace) reply.header('traceparent', trace.toString());
      // Strict CSP for the app; file-byte responses set their own sandboxed policy.
      if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', this.csp);
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
    registerOpenApi(app, new URL('../../openapi.yaml', import.meta.url));
    registerInfo(app, {
      service: 'console',
      version: this.version,
      capabilities: ['totp', 'admin-roles', 'audit-trail', 'service-proxy'],
      schemaVersion: this.db.schemaVersion,
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
      // Asset-looking paths stay JSON 404s; client routes may contain dots (flag keys, emails), so only known asset shapes count.
      if (ConsoleApi.ASSET_PATH.test(path)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'file not found' } });
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
    api.get('/docs/services', async (request) => { s.requireSession(request); return { items: this.docs.list() }; });
    api.get('/docs/services/:sid/openapi', { schema: { params: Schemas.serviceParams } }, async (request) => {
      s.requireSession(request);
      return this.docs.get(sid(request));
    });
    api.get('/services/overview', async (request) => { s.requireSession(request); return { items: await this.clients.overview() }; });
    api.get('/services/about', async (request) => { s.requireSession(request); return { items: await this.clients.about() }; });
    api.patch('/services/:sid/settings', { schema: { params: Schemas.serviceParams, body: Schemas.body(['polling'], { polling: Schemas.body(['enabled', 'intervalSec'], { enabled: { type: 'boolean' }, intervalSec: { type: 'integer', minimum: 5, maximum: 3600 } }) }) } }, async (request) => {
      s.requireAdmin(request);
      const id = /** @type {{ sid: string }} */ (request.params).sid;
      const registry = this.clients.registry;
      if (!registry.get(id)) throw new ConsoleError('NOT_FOUND', `unknown service "${id}"`);
      const polling = /** @type {{ polling: { enabled: boolean, intervalSec: number } }} */ (request.body).polling;
      registry.updatePolling(id, polling);
      registry.save();
      record(request, 'service.settings.update', id, { polling });
      return { service: registry.describe().find((x) => x.id === id) };
    });
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

    // ---------------------------------------------------------------- audit service
    const AQ = Schemas.auditQuery;
    api.get('/services/:sid/audit/events', { schema: { params: P, querystring: AQ } }, async (request) => {
      s.requireSession(request);
      return this.clients.get(sid(request), AuditClient).listEvents(query(request));
    });
    api.get('/services/:sid/audit/events/export', { schema: { params: P, querystring: AQ }, logLevel: 'warn' }, async (request, reply) => {
      s.requireSession(request);
      const q = query(request);
      const format = /** @type {'ndjson'|'csv'} */ (q.format ?? 'ndjson');
      const res = await this.clients.get(sid(request), AuditClient).export(q, format);
      if (!res.ok) throw new ServiceError(`${sid(request)} export responded ${res.status}`, { statusCode: res.status, service: sid(request) });
      const { format: _f, ...filter } = q;
      record(request, 'audit.events.export', sid(request), { format, filter });
      reply.header('content-type', res.headers.get('content-type') ?? 'application/octet-stream');
      reply.header('content-disposition', res.headers.get('content-disposition') ?? `attachment; filename="audit.${format}"`);
      reply.header('content-security-policy', "default-src 'none'; sandbox");
      return reply.send(res.body ? /** @type {any} */ (await import('node:stream')).Readable.fromWeb(/** @type {any} */ (res.body)) : Buffer.alloc(0));
    });
    api.get('/services/:sid/audit/events/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), AuditClient).getEvent(pid(request)); });
    api.get('/services/:sid/audit/stats', { schema: { params: P, querystring: AQ } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), AuditClient).stats(num(query(request).hours)); });
    api.get('/services/:sid/audit/chain/head', { schema: { params: P } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), AuditClient).chainHead(); });
    api.get('/services/:sid/audit/chain/verify', { schema: { params: P, querystring: AQ } }, async (request) => {
      s.requireSession(request);
      const q = query(request);
      const out = /** @type {any} */ (await this.clients.get(sid(request), AuditClient).verify({ fromSeq: num(q.fromSeq), toSeq: num(q.toSeq) }));
      record(request, 'audit.chain.verify', sid(request), { ok: out?.ok, checked: out?.checked, firstBroken: out?.firstBroken ?? null });
      return out;
    });

    // ---------------------------------------------------------------- shortlink
    const SQ = Schemas.shortlinkQuery;
    const SB = Schemas.shortlinkBody;
    api.get('/services/:sid/shortlink/links', { schema: { params: P, querystring: SQ } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), ShortlinkClient).listLinks(query(request)); });
    api.post('/services/:sid/shortlink/links', { schema: { params: P, body: Schemas.body(['url'], { url: SB.url, slug: SB.slug, permanent: SB.permanent, expiresAt: SB.expiresAt, maxClicks: SB.maxClicks, tags: SB.tags, note: SB.note }) } }, async (request, reply) => {
      s.requireAdmin(request);
      const out = /** @type {any} */ (await this.clients.get(sid(request), ShortlinkClient).createLink(/** @type {any} */ (request.body)));
      record(request, 'shortlink.link.create', out?.link?.code ?? null, { service: sid(request), url: out?.link?.url });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/shortlink/links/:id', { schema: { params: PI, querystring: SQ } }, async (request) => {
      s.requireSession(request);
      const c = this.clients.get(sid(request), ShortlinkClient);
      const [link, stats] = await Promise.all([c.getLink(pid(request)), c.linkStats(pid(request), num(query(request).days))]);
      return { .../** @type {any} */ (link), stats };
    });
    api.get('/services/:sid/shortlink/links/:id/stats', { schema: { params: PI, querystring: SQ } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), ShortlinkClient).linkStats(pid(request), num(query(request).days)); });
    api.patch('/services/:sid/shortlink/links/:id', { schema: { params: PI, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { url: SB.url, permanent: SB.permanent, enabled: SB.enabled, expiresAt: SB.expiresAt, maxClicks: SB.maxClicks, tags: SB.tags, note: SB.note } } } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), ShortlinkClient).patchLink(pid(request), /** @type {any} */ (request.body));
      record(request, 'shortlink.link.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/shortlink/links/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), ShortlinkClient).deleteLink(pid(request));
      record(request, 'shortlink.link.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.get('/services/:sid/shortlink/links/:id/qr.png', { schema: { params: PI, querystring: SQ }, logLevel: 'warn' }, async (request, reply) => {
      s.requireSession(request);
      const q = query(request);
      const res = await this.clients.get(sid(request), ShortlinkClient).qrPng(pid(request), { scale: num(q.scale), margin: num(q.margin) });
      if (!res.ok) throw new ServiceError(`${sid(request)} qr responded ${res.status}`, { statusCode: res.status, service: sid(request) });
      reply.header('content-type', 'image/png');
      reply.header('content-disposition', `inline; filename="${pid(request)}.png"`);
      reply.header('cache-control', 'private, max-age=3600');
      reply.header('content-security-policy', "default-src 'none'; sandbox");
      return reply.send(Buffer.from(await res.arrayBuffer()));
    });
    api.get('/services/:sid/shortlink/stats', { schema: { params: P, querystring: SQ } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), ShortlinkClient).stats(num(query(request).days)); });

    // ---------------------------------------------------------------- flags
    const FQ = Schemas.flagsQuery;
    api.get('/services/:sid/flags/environments', { schema: { params: P } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), FlagsClient).environments(); });
    api.get('/services/:sid/flags/stats', { schema: { params: P } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), FlagsClient).stats(); });
    api.get('/services/:sid/flags/flags', { schema: { params: P, querystring: FQ } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), FlagsClient).listFlags(query(request)); });
    api.post('/services/:sid/flags/flags', { schema: { params: P, body: Schemas.flagsCreate } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {any} */ (request.body);
      const out = await this.clients.get(sid(request), FlagsClient).createFlag(body);
      record(request, 'flags.flag.create', body.key, { service: sid(request), kind: body.kind });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/flags/flags/:id', { schema: { params: PI } }, async (request) => {
      s.requireSession(request);
      const c = this.clients.get(sid(request), FlagsClient);
      const [flag, history] = await Promise.all([c.getFlag(pid(request)), c.history(pid(request), { limit: 20 })]);
      return { .../** @type {any} */ (flag), history: /** @type {any} */ (history).items, historyNextBefore: /** @type {any} */ (history).nextBefore };
    });
    api.get('/services/:sid/flags/flags/:id/history', { schema: { params: PI, querystring: FQ } }, async (request) => { s.requireSession(request); const q = query(request); return this.clients.get(sid(request), FlagsClient).history(pid(request), { limit: num(q.limit), before: q.before }); });
    api.get('/services/:sid/flags/history', { schema: { params: P, querystring: FQ } }, async (request) => { s.requireSession(request); const q = query(request); return this.clients.get(sid(request), FlagsClient).history(null, { limit: num(q.limit), before: q.before }); });
    api.patch('/services/:sid/flags/flags/:id', { schema: { params: PI, body: Schemas.flagsPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), FlagsClient).patchFlag(pid(request), /** @type {any} */ (request.body));
      record(request, 'flags.flag.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/flags/flags/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await this.clients.get(sid(request), FlagsClient).deleteFlag(pid(request));
      record(request, 'flags.flag.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.patch('/services/:sid/flags/flags/:id/envs/:sub', { schema: { params: PIS, body: Schemas.flagsEnvPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await this.clients.get(sid(request), FlagsClient).patchEnv(pid(request), psub(request), /** @type {any} */ (request.body));
      record(request, 'flags.env.update', pid(request), { service: sid(request), env: psub(request), patch: request.body });
      return out;
    });
    api.post('/services/:sid/flags/flags/:id/envs/:sub/copy', { schema: { params: PIS, body: Schemas.body(['to'], { to: Schemas.flagsEnv }) } }, async (request) => {
      s.requireAdmin(request);
      const to = /** @type {{ to: string }} */ (request.body).to;
      const out = await this.clients.get(sid(request), FlagsClient).copyEnv(pid(request), psub(request), to);
      record(request, 'flags.env.copy', pid(request), { service: sid(request), from: psub(request), to });
      return out;
    });
    api.post('/services/:sid/flags/evaluate', { schema: { params: P, body: Schemas.flagsEvaluate } }, async (request) => { s.requireSession(request); return this.clients.get(sid(request), FlagsClient).evaluate(/** @type {any} */ (request.body)); });

    // ---------------------------------------------------------------- scheduler
    const JQ = Schemas.schedulerQuery;
    const sched = (/** @type {FastifyRequest} */ r) => this.clients.get(sid(r), SchedulerClient);
    api.get('/services/:sid/scheduler/stats', { schema: { params: P } }, async (request) => { s.requireSession(request); return sched(request).stats(); });
    api.get('/services/:sid/scheduler/target-keys', { schema: { params: P } }, async (request) => { s.requireSession(request); return sched(request).targetKeys(); });
    api.get('/services/:sid/scheduler/timezones', { schema: { params: P } }, async (request) => { s.requireSession(request); return sched(request).timezones(); });
    api.get('/services/:sid/scheduler/preview', { schema: { params: P, querystring: JQ } }, async (request) => { s.requireSession(request); const q = query(request); return sched(request).preview({ cron: q.cron ?? '', timezone: q.timezone, count: num(q.count) }); });
    api.get('/services/:sid/scheduler/jobs', { schema: { params: P, querystring: JQ } }, async (request) => { s.requireSession(request); return sched(request).listJobs(query(request)); });
    api.post('/services/:sid/scheduler/jobs', { schema: { params: P, body: Schemas.schedulerCreate } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {any} */ (request.body);
      const out = await sched(request).createJob(body);
      record(request, 'scheduler.job.create', body.name, { service: sid(request), schedule: body.schedule, url: body.target.url });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/scheduler/jobs/:id', { schema: { params: PI } }, async (request) => {
      s.requireSession(request);
      const c = sched(request);
      const [job, runs] = await Promise.all([c.getJob(pid(request)), c.runs(pid(request), { limit: 20 })]);
      return { .../** @type {any} */ (job), runs: /** @type {any} */ (runs).items, runsNextBefore: /** @type {any} */ (runs).nextBefore };
    });
    api.patch('/services/:sid/scheduler/jobs/:id', { schema: { params: PI, body: Schemas.schedulerPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await sched(request).patchJob(pid(request), /** @type {any} */ (request.body));
      record(request, 'scheduler.job.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/scheduler/jobs/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await sched(request).deleteJob(pid(request));
      record(request, 'scheduler.job.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.post('/services/:sid/scheduler/jobs/:id/run', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      const out = await sched(request).runJob(pid(request));
      record(request, 'scheduler.job.run', pid(request), { service: sid(request), run: /** @type {any} */ (out)?.run?.id ?? null });
      return reply.code(202).send(out);
    });
    api.get('/services/:sid/scheduler/jobs/:id/runs', { schema: { params: PI, querystring: JQ } }, async (request) => { s.requireSession(request); const q = query(request); return sched(request).runs(pid(request), { status: q.status, limit: num(q.limit), before: q.before }); });
    api.get('/services/:sid/scheduler/runs', { schema: { params: P, querystring: JQ } }, async (request) => { s.requireSession(request); const q = query(request); return sched(request).runs(q.job ?? null, { status: q.status, limit: num(q.limit), before: q.before }); });
    api.get('/services/:sid/scheduler/runs/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return sched(request).getRun(pid(request)); });
    api.post('/services/:sid/scheduler/runs/:id/cancel', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await sched(request).cancelRun(pid(request));
      record(request, 'scheduler.run.cancel', pid(request), { service: sid(request) });
      return out;
    });

    // ---------------------------------------------------------------- webhook-out
    const WQ = Schemas.webhookQuery;
    const wh = (/** @type {FastifyRequest} */ r) => this.clients.get(sid(r), WebhookOutClient);
    api.get('/services/:sid/webhook-out/stats', { schema: { params: P } }, async (request) => { s.requireSession(request); return wh(request).stats(); });
    api.get('/services/:sid/webhook-out/event-types', { schema: { params: P } }, async (request) => { s.requireSession(request); return wh(request).eventTypes(); });
    api.get('/services/:sid/webhook-out/subscriptions', { schema: { params: P, querystring: WQ } }, async (request) => { s.requireSession(request); return wh(request).listSubscriptions(query(request)); });
    api.post('/services/:sid/webhook-out/subscriptions', { schema: { params: P, body: Schemas.webhookCreate } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {any} */ (request.body);
      const out = await wh(request).createSubscription(body);
      record(request, 'webhook.subscription.create', body.name, { service: sid(request), url: body.url, events: body.events });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/webhook-out/subscriptions/:id', { schema: { params: PI } }, async (request) => {
      s.requireSession(request);
      const c = wh(request);
      const [sub, deliveries] = await Promise.all([c.getSubscription(pid(request)), c.deliveries({ subscription: pid(request), limit: 20 })]);
      return { .../** @type {any} */ (sub), deliveries: /** @type {any} */ (deliveries).items, deliveriesNextBefore: /** @type {any} */ (deliveries).nextBefore };
    });
    api.patch('/services/:sid/webhook-out/subscriptions/:id', { schema: { params: PI, body: Schemas.webhookPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await wh(request).patchSubscription(pid(request), /** @type {any} */ (request.body));
      record(request, 'webhook.subscription.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/webhook-out/subscriptions/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await wh(request).deleteSubscription(pid(request));
      record(request, 'webhook.subscription.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.post('/services/:sid/webhook-out/subscriptions/:id/rotate', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await wh(request).rotate(pid(request));
      record(request, 'webhook.subscription.rotate', pid(request), { service: sid(request) });
      return out;
    });
    api.post('/services/:sid/webhook-out/subscriptions/:id/test', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      const out = await wh(request).test(pid(request));
      record(request, 'webhook.subscription.test', pid(request), { service: sid(request), delivery: /** @type {any} */ (out)?.delivery?.id ?? null });
      return reply.code(202).send(out);
    });
    api.post('/services/:sid/webhook-out/subscriptions/:id/replay', { schema: { params: PI, body: Schemas.webhookReplay } }, async (request, reply) => {
      s.requireAdmin(request);
      const out = await wh(request).replay(pid(request), /** @type {any} */ (request.body));
      record(request, 'webhook.subscription.replay', pid(request), { service: sid(request), ...(/** @type {object} */ (request.body)), queued: /** @type {any} */ (out)?.queued ?? null });
      return reply.code(202).send(out);
    });
    api.get('/services/:sid/webhook-out/deliveries', { schema: { params: P, querystring: WQ } }, async (request) => { s.requireSession(request); const q = query(request); return wh(request).deliveries({ status: q.status, subscription: q.subscription, event: q.event, limit: num(q.limit), before: q.before }); });
    api.get('/services/:sid/webhook-out/deliveries/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return wh(request).getDelivery(pid(request)); });
    api.post('/services/:sid/webhook-out/deliveries/:id/redeliver', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      const out = await wh(request).redeliver(pid(request));
      record(request, 'webhook.delivery.redeliver', pid(request), { service: sid(request), delivery: /** @type {any} */ (out)?.delivery?.id ?? null });
      return reply.code(202).send(out);
    });
    api.post('/services/:sid/webhook-out/deliveries/:id/cancel', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await wh(request).cancelDelivery(pid(request));
      record(request, 'webhook.delivery.cancel', pid(request), { service: sid(request) });
      return out;
    });
    api.get('/services/:sid/webhook-out/events', { schema: { params: P, querystring: WQ } }, async (request) => { s.requireSession(request); const q = query(request); return wh(request).events({ type: q.type, limit: num(q.limit), before: q.before }); });
    api.get('/services/:sid/webhook-out/events/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return wh(request).getEvent(pid(request)); });

    // ---------------------------------------------------------------- search
    const se = (/** @type {FastifyRequest} */ r) => this.clients.get(sid(r), SearchClient);
    api.get('/services/:sid/search/stats', { schema: { params: P } }, async (request) => { s.requireSession(request); return se(request).stats(); });
    api.get('/services/:sid/search/indexes', { schema: { params: P } }, async (request) => { s.requireSession(request); return se(request).listIndexes(); });
    api.post('/services/:sid/search/indexes', { schema: { params: P, body: Schemas.searchIndexCreate } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {any} */ (request.body);
      const out = await se(request).createIndex(body);
      record(request, 'search.index.create', body.name, { service: sid(request) });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/search/indexes/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return se(request).getIndex(pid(request)); });
    api.patch('/services/:sid/search/indexes/:id', { schema: { params: PI, body: Schemas.searchIndexPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await se(request).patchIndex(pid(request), /** @type {any} */ (request.body));
      record(request, 'search.index.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/search/indexes/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await se(request).deleteIndex(pid(request));
      record(request, 'search.index.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.post('/services/:sid/search/indexes/:id/clear', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await se(request).clearIndex(pid(request));
      record(request, 'search.index.clear', pid(request), { service: sid(request), removed: /** @type {any} */ (out)?.removed ?? null });
      return out;
    });
    api.post('/services/:sid/search/indexes/:id/search', { schema: { params: PI, body: Schemas.searchBody } }, async (request) => { s.requireSession(request); return se(request).search(pid(request), /** @type {any} */ (request.body ?? {})); });
    api.get('/services/:sid/search/indexes/:id/documents', { schema: { params: PI, querystring: Schemas.searchQuery } }, async (request) => { s.requireSession(request); const q = query(request); return se(request).browse(pid(request), { limit: num(q.limit), offset: num(q.offset) }); });
    api.put('/services/:sid/search/indexes/:id/documents', { schema: { params: PI, body: Schemas.searchUpsert } }, async (request) => {
      s.requireAdmin(request);
      const docs = /** @type {{ documents: any[] }} */ (request.body).documents;
      const out = await se(request).upsert(pid(request), docs);
      record(request, 'search.documents.upsert', pid(request), { service: sid(request), count: docs.length });
      return out;
    });
    api.get('/services/:sid/search/indexes/:id/documents/:sub', { schema: { params: PIS } }, async (request) => { s.requireSession(request); return se(request).getDocument(pid(request), psub(request)); });
    api.delete('/services/:sid/search/indexes/:id/documents/:sub', { schema: { params: PIS } }, async (request, reply) => {
      s.requireAdmin(request);
      await se(request).deleteDocument(pid(request), psub(request));
      record(request, 'search.document.delete', psub(request), { service: sid(request), index: pid(request) });
      return reply.code(204).send();
    });
    // ---------------------------------------------------------------- ratelimit
    const rl = (/** @type {FastifyRequest} */ r) => this.clients.get(sid(r), RateLimitClient);
    api.get('/services/:sid/ratelimit/stats', { schema: { params: P } }, async (request) => { s.requireSession(request); return rl(request).stats(); });
    api.get('/services/:sid/ratelimit/policies', { schema: { params: P } }, async (request) => { s.requireSession(request); return rl(request).listPolicies(); });
    api.post('/services/:sid/ratelimit/policies', { schema: { params: P, body: Schemas.rlPolicyCreate } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {{ name: string }} */ (request.body);
      const out = await rl(request).createPolicy(body);
      record(request, 'ratelimit.policy.create', body.name, { service: sid(request) });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/ratelimit/policies/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return rl(request).getPolicy(pid(request)); });
    api.patch('/services/:sid/ratelimit/policies/:id', { schema: { params: PI, body: Schemas.rlPolicyPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await rl(request).patchPolicy(pid(request), /** @type {any} */ (request.body));
      record(request, 'ratelimit.policy.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/ratelimit/policies/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await rl(request).deletePolicy(pid(request));
      record(request, 'ratelimit.policy.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.get('/services/:sid/ratelimit/policies/:id/stats', { schema: { params: PI, querystring: Schemas.rlStatsQuery } }, async (request) => { s.requireSession(request); return rl(request).policyStats(pid(request), { hours: num(query(request).hours) }); });
    api.get('/services/:sid/ratelimit/policies/:id/top', { schema: { params: PI, querystring: Schemas.rlTopQuery } }, async (request) => { s.requireSession(request); const q = query(request); return rl(request).top(pid(request), { window: num(q.window), limit: num(q.limit) }); });
    api.get('/services/:sid/ratelimit/policies/:id/overrides', { schema: { params: PI, querystring: Schemas.searchQuery } }, async (request) => { s.requireSession(request); const q = query(request); return rl(request).overrides(pid(request), { limit: num(q.limit), offset: num(q.offset) }); });
    api.put('/services/:sid/ratelimit/policies/:id/overrides/:sub', { schema: { params: PIS, body: Schemas.rlOverride } }, async (request) => {
      s.requireAdmin(request);
      const out = await rl(request).setOverride(pid(request), psub(request), /** @type {any} */ (request.body));
      record(request, 'ratelimit.override.set', psub(request), { service: sid(request), policy: pid(request), body: request.body });
      return out;
    });
    api.delete('/services/:sid/ratelimit/policies/:id/overrides/:sub', { schema: { params: PIS } }, async (request, reply) => {
      s.requireAdmin(request);
      await rl(request).deleteOverride(pid(request), psub(request));
      record(request, 'ratelimit.override.delete', psub(request), { service: sid(request), policy: pid(request) });
      return reply.code(204).send();
    });
    api.get('/services/:sid/ratelimit/policies/:id/subjects/:sub', { schema: { params: PIS } }, async (request) => { s.requireSession(request); return rl(request).subject(pid(request), psub(request)); });
    api.delete('/services/:sid/ratelimit/policies/:id/subjects/:sub/usage', { schema: { params: PIS } }, async (request) => {
      s.requireAdmin(request);
      const out = await rl(request).resetSubject(pid(request), psub(request));
      record(request, 'ratelimit.subject.reset', psub(request), { service: sid(request), policy: pid(request) });
      return out;
    });
    api.post('/services/:sid/ratelimit/check', { schema: { params: P, body: Schemas.rlCheck } }, async (request) => {
      s.requireAdmin(request);
      const body = /** @type {{ policy: string, subject: string, peek?: boolean }} */ (request.body);
      const out = await rl(request).check(body);
      if (!body.peek) record(request, 'ratelimit.check', body.subject, { service: sid(request), policy: body.policy, allowed: /** @type {any} */ (out)?.allowed ?? null });
      return out;
    });
    // ---------------------------------------------------------------- geo
    const ge = (/** @type {FastifyRequest} */ r) => this.clients.get(sid(r), GeoClient);
    api.get('/services/:sid/geo/stats', { schema: { params: P } }, async (request) => { s.requireSession(request); return ge(request).stats(); });
    api.get('/services/:sid/geo/database', { schema: { params: P } }, async (request) => { s.requireSession(request); return ge(request).database(); });
    api.post('/services/:sid/geo/database/reload', { schema: { params: P } }, async (request) => {
      s.requireAdmin(request);
      const out = await ge(request).reloadDatabase();
      record(request, 'geo.database.reload', sid(request), { service: sid(request), type: /** @type {any} */ (out)?.city?.type ?? null });
      return out;
    });
    api.get('/services/:sid/geo/ip', { schema: { params: P, querystring: Schemas.geoIpQuery } }, async (request) => { s.requireSession(request); const q = query(request); return ge(request).ip(/** @type {string} */ (q.ip), { lang: q.lang }); });
    api.post('/services/:sid/geo/ip/batch', { schema: { params: P, body: Schemas.geoIpBatch } }, async (request) => { s.requireSession(request); const b = /** @type {{ ips: string[], lang?: string }} */ (request.body); return ge(request).ipBatch(b.ips, b.lang); });
    api.get('/services/:sid/geo/countries', { schema: { params: P, querystring: Schemas.geoCountriesQuery } }, async (request) => { s.requireSession(request); return ge(request).countries(query(request)); });
    api.get('/services/:sid/geo/countries/:id', { schema: { params: PI, querystring: Schemas.geoTimezonesQuery } }, async (request) => { s.requireSession(request); return ge(request).country(pid(request), { lang: query(request).lang }); });
    api.get('/services/:sid/geo/currencies', { schema: { params: P, querystring: Schemas.geoTimezonesQuery } }, async (request) => { s.requireSession(request); return ge(request).currencies({ lang: query(request).lang }); });
    api.get('/services/:sid/geo/timezones', { schema: { params: P, querystring: Schemas.geoTimezonesQuery } }, async (request) => { s.requireSession(request); return ge(request).timezones(query(request)); });
    api.get('/services/:sid/geo/phone', { schema: { params: P, querystring: Schemas.geoPhoneQuery } }, async (request) => { s.requireSession(request); return ge(request).phone(/** @type {any} */ (query(request))); });
    api.get('/services/:sid/geo/distance', { schema: { params: P, querystring: Schemas.geoDistanceQuery } }, async (request) => { s.requireSession(request); return ge(request).distance(/** @type {any} */ (query(request))); });
    api.get('/services/:sid/geo/collections', { schema: { params: P } }, async (request) => { s.requireSession(request); return ge(request).listCollections(); });
    api.post('/services/:sid/geo/collections', { schema: { params: P, body: Schemas.geoCollectionCreate } }, async (request, reply) => {
      s.requireAdmin(request);
      const body = /** @type {{ name: string }} */ (request.body);
      const out = await ge(request).createCollection(body);
      record(request, 'geo.collection.create', body.name, { service: sid(request) });
      return reply.code(201).send(out);
    });
    api.get('/services/:sid/geo/collections/:id', { schema: { params: PI } }, async (request) => { s.requireSession(request); return ge(request).getCollection(pid(request)); });
    api.patch('/services/:sid/geo/collections/:id', { schema: { params: PI, body: Schemas.geoCollectionPatch } }, async (request) => {
      s.requireAdmin(request);
      const out = await ge(request).patchCollection(pid(request), /** @type {any} */ (request.body));
      record(request, 'geo.collection.update', pid(request), { service: sid(request), patch: request.body });
      return out;
    });
    api.delete('/services/:sid/geo/collections/:id', { schema: { params: PI } }, async (request, reply) => {
      s.requireAdmin(request);
      await ge(request).deleteCollection(pid(request));
      record(request, 'geo.collection.delete', pid(request), { service: sid(request) });
      return reply.code(204).send();
    });
    api.post('/services/:sid/geo/collections/:id/clear', { schema: { params: PI } }, async (request) => {
      s.requireAdmin(request);
      const out = await ge(request).clearCollection(pid(request));
      record(request, 'geo.collection.clear', pid(request), { service: sid(request), removed: /** @type {any} */ (out)?.removed ?? null });
      return out;
    });
    api.put('/services/:sid/geo/collections/:id/places', { schema: { params: PI, body: Schemas.geoPlaces } }, async (request) => {
      s.requireAdmin(request);
      const places = /** @type {{ places: object[] }} */ (request.body).places;
      const out = await ge(request).upsertPlaces(pid(request), places);
      record(request, 'geo.places.upsert', pid(request), { service: sid(request), count: places.length });
      return out;
    });
    api.get('/services/:sid/geo/collections/:id/places', { schema: { params: PI, querystring: Schemas.searchQuery } }, async (request) => { s.requireSession(request); const q = query(request); return ge(request).places(pid(request), { limit: num(q.limit), offset: num(q.offset) }); });
    api.delete('/services/:sid/geo/collections/:id/places/:sub', { schema: { params: PIS } }, async (request, reply) => {
      s.requireAdmin(request);
      await ge(request).deletePlace(pid(request), psub(request));
      record(request, 'geo.place.delete', psub(request), { service: sid(request), collection: pid(request) });
      return reply.code(204).send();
    });
    api.get('/services/:sid/geo/collections/:id/nearby', { schema: { params: PI, querystring: Schemas.geoNearbyQuery } }, async (request) => { s.requireSession(request); return ge(request).nearby(pid(request), /** @type {any} */ (query(request))); });

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
