import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { AdminService } from '../../domain/admin-service.js';
import { ConsoleError } from '../../domain/errors.js';
import type { AdminRow, SessionRow } from '../../types.js';
import type { ConsoleRuntime } from './runtime.js';

export const SESSION_COOKIE = 'console_session';
export const CSRF_HEADER = 'x-console-request';

export class AuthRequest {
  static attach(runtime: ConsoleRuntime, cookies: Cookies, locals: App.Locals) {
    const resolved = runtime.auth.resolve(cookies.get(SESSION_COOKIE));
    if (!resolved) {
      locals.principal = null;
      locals.session = null;
      return;
    }
    const { admin, session } = resolved;
    locals.principal = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: admin.status,
      totpEnabled: admin.totp_enabled_at !== null,
    };
    locals.session = {
      id: session.id,
      adminId: session.admin_id,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
      expiresAt: session.expires_at,
      totpPending: session.totp_pending === 1,
    };
  }

  static resolved(runtime: ConsoleRuntime, locals: App.Locals): { admin: AdminRow; session: SessionRow } | null {
    if (!locals.principal || !locals.session) return null;
    const admin = runtime.admins.byId(locals.principal.id);
    const session = runtime.sessions.byId(locals.session.id);
    return admin && session ? { admin, session } : null;
  }

  static requireSession(runtime: ConsoleRuntime, locals: App.Locals) {
    const resolved = AuthRequest.resolved(runtime, locals);
    if (!resolved) throw new ConsoleError('UNAUTHENTICATED', 'sign in required');
    if (resolved.session.totp_pending === 1) throw new ConsoleError('TOTP_REQUIRED', 'second factor required');
    AuthRequest.requireCsrf(locals);
    return resolved;
  }

  static requireCsrf(locals: App.Locals) {
    if (locals.csrf.required && !locals.csrf.valid) {
      throw new ConsoleError('FORBIDDEN', `missing ${CSRF_HEADER} header`);
    }
  }

  static requireAdmin(runtime: ConsoleRuntime, locals: App.Locals) {
    const resolved = AuthRequest.requireSession(runtime, locals);
    if (resolved.admin.role !== 'admin') throw new ConsoleError('FORBIDDEN', 'viewers cannot change anything');
    return resolved;
  }

  static context(event: Pick<RequestEvent, 'request' | 'locals'>) {
    const userAgent = event.request.headers.get('user-agent');
    return { ip: event.locals.clientIp, userAgent: userAgent ? userAgent.slice(0, 300) : null };
  }

  static adminView(admin: AdminRow) {
    return AdminService.view(admin);
  }

  static setCookie(cookies: Cookies, runtime: ConsoleRuntime, token: string | null) {
    cookies.set(SESSION_COOKIE, token ?? '', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: runtime.config.cookieSecure,
      maxAge: token ? Math.floor(runtime.config.sessionTtlMin * 60) : 0,
    });
  }
}
