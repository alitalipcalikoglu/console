import { api } from './api.js';

/**
 * Who is signed in. Loaded once at start; kept in sync by login/logout and by 401s.
 * @typedef {{ id: string, email: string, name: string, role: 'admin'|'viewer', totpEnabled: boolean, lastLoginAt: string|null }} Admin
 */
export class Session {
  constructor() {
    /** @type {Admin|null} */
    this.admin = $state(null);
    this.totpPending = $state(false);
    this.loaded = $state(false);
    /** True while the sign-out confirmation is open; the Shell renders it. */
    this.logoutPending = $state(false);
    api.onUnauthenticated = (code) => {
      if (code === 'TOTP_REQUIRED') { this.totpPending = true; this.admin = null; } else { this.admin = null; }
    };
  }

  get isAdmin() { return this.admin?.role === 'admin'; }

  async load() {
    try {
      const r = /** @type {{ admin: Admin|null, totpPending: boolean }} */ (await api.get('/session', { quiet401: true }));
      this.admin = r.admin;
      this.totpPending = r.totpPending;
    } catch {
      this.admin = null;
    } finally {
      this.loaded = true;
    }
  }

  /** @param {string} email @param {string} password */
  async login(email, password) {
    const r = /** @type {{ totpRequired: boolean, admin: Admin|null }} */ (await api.post('/session/login', { email, password }));
    this.totpPending = r.totpRequired;
    this.admin = r.admin;
    return r;
  }

  /** @param {string} code */
  async completeTotp(code) {
    const r = /** @type {{ admin: Admin }} */ (await api.post('/session/totp', { code }));
    this.admin = r.admin;
    this.totpPending = false;
  }

  /** Ask before signing out; every sign-out button calls this, never `logout()` directly. */
  requestLogout() { this.logoutPending = true; }

  async logout() {
    try { await api.post('/session/logout'); } finally { this.admin = null; this.totpPending = false; this.logoutPending = false; }
  }

  /** Refresh the profile after account changes. */
  async refresh() {
    const r = /** @type {{ admin: Admin|null }} */ (await api.get('/session', { quiet401: true }));
    this.admin = r.admin;
  }
}

export const session = new Session();
