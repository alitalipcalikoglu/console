import { PrometheusText, ServiceClient } from './client.js';

/** Typed wrapper over the auth API. */
export class AuthClient extends ServiceClient {
  /** @param {{ limit?: number, cursor?: string, email?: string }} q */
  listUsers(q) {
    const p = new URLSearchParams();
    if (q.email) p.set('email', q.email);
    if (q.limit) p.set('limit', String(q.limit));
    if (q.cursor) p.set('cursor', q.cursor);
    return this.json('GET', `/v1/users?${p}`);
  }

  /** @param {string} id */
  getUser(id) {
    return this.json('GET', `/v1/users/${encodeURIComponent(id)}`);
  }

  /** @param {{ email: string, password: string, name?: string|null }} body */
  createUser(body) {
    return this.json('POST', '/v1/users', { body });
  }

  /** @param {string} id @param {{ name?: string|null, status?: 'active'|'disabled' }} patch */
  patchUser(id, patch) {
    return this.json('PATCH', `/v1/users/${encodeURIComponent(id)}`, { body: patch });
  }

  /** @param {string} id */
  deleteUser(id) {
    return this.json('DELETE', `/v1/users/${encodeURIComponent(id)}`);
  }

  /** @param {string} id */
  sessions(id) {
    return this.json('GET', `/v1/users/${encodeURIComponent(id)}/sessions`);
  }

  /** @param {string} id @param {string} sid */
  revokeSession(id, sid) {
    return this.json('DELETE', `/v1/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sid)}`);
  }

  /** @param {string} id */
  revokeAllSessions(id) {
    return this.json('DELETE', `/v1/users/${encodeURIComponent(id)}/sessions`);
  }

  /** @param {string} id @param {{ limit?: number, before?: string }} q */
  events(id, q) {
    const p = new URLSearchParams();
    if (q.limit) p.set('limit', String(q.limit));
    if (q.before) p.set('before', q.before);
    return this.json('GET', `/v1/users/${encodeURIComponent(id)}/events?${p}`);
  }

  /** @param {string} email */
  resendVerification(email) {
    return this.json('POST', '/v1/auth/verify-email/resend', { body: { email } });
  }

  /** @param {string} email */
  forgotPassword(email) {
    return this.json('POST', '/v1/auth/password/forgot', { body: { email } });
  }

  jwks() {
    return this.json('GET', '/.well-known/jwks.json', { auth: 'none' });
  }

  async summary() {
    const s = await this.metricsSamples();
    if (!s) return null;
    return {
      activeUsers: PrometheusText.value(s, 'auth_users', { status: 'active' }),
      disabledUsers: PrometheusText.value(s, 'auth_users', { status: 'disabled' }),
      activeSessions: PrometheusText.value(s, 'auth_sessions_active'),
      uptimeSec: PrometheusText.value(s, 'auth_process_uptime_seconds'),
    };
  }
}
