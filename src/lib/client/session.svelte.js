import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { getContext, setContext } from 'svelte';
import { api } from './api.js';

const SESSION_CONTEXT = Symbol('console-session');

/**
 * Who is signed in. Loaded once at start; kept in sync by login/logout and by 401s.
 * @typedef {{ id: string, email: string, name: string, role: 'admin'|'viewer', totpEnabled: boolean, lastLoginAt: string|null }} Admin
 */
export class Session {
  /** @param {{ admin: Admin|null, totpPending: boolean }} initial */
  constructor(initial) {
    /** @type {Admin|null} */
    this.admin = $state(initial.admin);
    this.totpPending = $state(initial.totpPending);
    this.loaded = $state(true);
    /** True while the sign-out confirmation is open; the Shell renders it. */
    this.logoutPending = $state(false);
    if (browser) {
      api.onUnauthenticated = (code) => {
        if (code === 'TOTP_REQUIRED') { this.totpPending = true; this.admin = null; } else { this.admin = null; }
        void goto('/login', { replaceState: true, invalidateAll: true });
      };
    }
  }

  get isAdmin() { return this.admin?.role === 'admin'; }

  /** @param {{ admin: Admin|null, totpPending: boolean }} next */
  sync(next) {
    this.admin = next.admin;
    this.totpPending = next.totpPending;
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

/** @param {() => { admin: Admin|null, totpPending: boolean }} initial */
export const provideSession = (initial) => {
  const session = new Session(initial());
  setContext(SESSION_CONTEXT, session);
  return session;
};

export const useSession = () => {
  const session = getContext(SESSION_CONTEXT);
  if (!(session instanceof Session)) throw new Error('session context is unavailable');
  return session;
};
