import { SecretBox } from '@atc-web/service-core/secrets';
import { Totp } from '../crypto/totp.js';
import { AdminStore } from '../store/admin-store.js';
import { ConsoleError } from './errors.js';

/** @typedef {import('../crypto/totp-keyring.js').TotpKeyring} TotpKeyring */

/** @typedef {import('../types.js').AdminRow} AdminRow */
/** @typedef {import('../types.js').SessionRow} SessionRow */
/** @typedef {import('../store/session-store.js').SessionStore} SessionStore */
/** @typedef {import('../store/audit-store.js').AuditStore} AuditStore */
/** @typedef {import('../crypto/password.js').PasswordHasher} PasswordHasher */
/** @typedef {import('../types.js').Logger} Logger */

/** @typedef {{ ip: string|null, userAgent: string|null }} Ctx */

/**
 * Console sign-in, sessions and second factor. Sessions are server-side; the browser only holds
 * an opaque cookie token.
 */
export class ConsoleAuth {
  static MIN_PASSWORD = 12;
  static DUMMY_HASH = 'scrypt$14$8$1$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  /**
   * @param {object} deps
   * @param {AdminStore} deps.admins
   * @param {SessionStore} deps.sessions
   * @param {AuditStore} deps.audit
   * @param {PasswordHasher} deps.hasher
   * @param {TotpKeyring|null} deps.keyring
   *   Opens a sealed `totp_secret` for verification (current key, or previous during a rotation).
   *   `null` when `SECRETS_KEY` is not configured — verification then works only for admins whose
   *   secret is still legacy plaintext (not yet sealed); a sealed admin's TOTP step throws
   *   `TOTP_UNAVAILABLE` instead of silently failing as a wrong code. Enrollment (`startTotp`) needs
   *   no keyring here — `AdminStore.setTotpSecret` seals on write and enforces this itself.
   * @param {boolean} [deps.strictSealing] Set once `AdminStore.reseal` has ever confirmed every
   *   `totp_secret` is sealed under the current key (Stage 4.1 — see `AdminStore.hasFullySealed`).
   *   Once true, a plaintext `totp_secret` found on a later read is corruption, not a tolerated
   *   pre-migration state — `#totpSecret` then throws `TOTP_SECRET_CORRUPT` instead of using it.
   * @param {Logger} deps.log
   * @param {{ sessionTtlMs: number, sessionIdleMs: number, loginMaxFailures: number, lockoutMs: number, totpIssuer: string }} deps.options
   * @param {() => number} [deps.now]
   */
  constructor({ admins, sessions, audit, hasher, keyring, strictSealing = false, log, options, now = Date.now }) {
    this.admins = admins;
    this.sessions = sessions;
    this.audit = audit;
    this.hasher = hasher;
    this.keyring = keyring;
    this.strictSealing = strictSealing;
    this.log = log;
    this.options = options;
    this.now = now;
  }

  /**
   * Plaintext TOTP secret for verification — transparent whether the stored value is sealed (v1
   * legacy-no-id or v2 keyed, current or previous key) or, before this database's first successful
   * {@link AdminStore.reseal}, still plaintext. @param {AdminRow} admin @returns {string|null}
   */
  #totpSecret(admin) {
    const raw = admin.totp_secret;
    if (raw === null) return null;
    if (!SecretBox.isSealed(raw)) {
      if (this.strictSealing) throw new ConsoleError('TOTP_SECRET_CORRUPT', 'stored TOTP secret is plaintext in a database that has already completed sealing — refusing to use it');
      return raw;
    }
    if (!this.keyring) throw new ConsoleError('TOTP_UNAVAILABLE', 'SECRETS_KEY is required to verify this account\'s two-factor code, but is not configured');
    return this.keyring.open(raw);
  }

  /**
   * Password step. Returns a session cookie token; `totpRequired` tells the UI to ask for a code
   * before the session becomes usable.
   * @param {{ email: string, password: string }} input
   * @param {Ctx} ctx
   * @returns {Promise<{ token: string, totpRequired: boolean, admin: AdminRow }>}
   */
  async login(input, ctx) {
    const now = this.now();
    const admin = this.admins.byEmail(input.email);
    const ok = admin ? await this.hasher.verify(input.password, admin.password_hash) : await this.hasher.verify(input.password, ConsoleAuth.DUMMY_HASH).then(() => false);
    if (!admin) {
      this.audit.record({ action: 'login.failed', ip: ctx.ip, meta: { reason: 'unknown_email' } }, now);
      throw new ConsoleError('INVALID_CREDENTIALS', 'email or password is incorrect');
    }
    if (admin.locked_until !== null && admin.locked_until > now) {
      this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'login.failed', ip: ctx.ip, meta: { reason: 'locked' } }, now);
      throw new ConsoleError('ACCOUNT_LOCKED', 'too many failed attempts, try again later', { retryAfterSec: Math.ceil((admin.locked_until - now) / 1000) });
    }
    if (!ok) {
      const r = this.admins.recordLoginFailure(admin.id, { maxFailures: this.options.loginMaxFailures, lockoutMs: this.options.lockoutMs, now });
      this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'login.failed', ip: ctx.ip, meta: { reason: 'bad_password', failures: r.failed_logins } }, now);
      throw new ConsoleError('INVALID_CREDENTIALS', 'email or password is incorrect');
    }
    if (admin.status === 'disabled') {
      this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'login.failed', ip: ctx.ip, meta: { reason: 'disabled' } }, now);
      throw new ConsoleError('ACCOUNT_DISABLED', 'account is disabled');
    }
    const totpRequired = admin.totp_enabled_at !== null;
    const { token } = this.sessions.create({ adminId: admin.id, ttlMs: this.options.sessionTtlMs, totpPending: totpRequired, ip: ctx.ip, userAgent: ctx.userAgent }, now);
    if (!totpRequired) {
      this.admins.recordLoginSuccess(admin.id, now);
      this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'login.succeeded', ip: ctx.ip }, now);
    }
    return { token, totpRequired, admin: /** @type {AdminRow} */ (this.admins.byId(admin.id)) };
  }

  /**
   * Second step for admins with TOTP enabled.
   * @param {SessionRow} session  Pending session resolved from the cookie.
   * @param {string} code
   * @param {Ctx} ctx
   */
  completeTotp(session, code, ctx) {
    const now = this.now();
    const admin = this.admins.byId(session.admin_id);
    if (!admin || !admin.totp_secret || session.totp_pending !== 1) throw new ConsoleError('INVALID_TOTP', 'no second factor pending');
    const step = Totp.verify(/** @type {string} */ (this.#totpSecret(admin)), code, now);
    if (step === null || !this.sessions.claimTotpStep(admin.id, step)) {
      const r = this.admins.recordLoginFailure(admin.id, { maxFailures: this.options.loginMaxFailures, lockoutMs: this.options.lockoutMs, now });
      this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'login.failed', ip: ctx.ip, meta: { reason: 'bad_totp', failures: r.failed_logins } }, now);
      if (r.locked_until) {
        this.sessions.remove(session.id);
        throw new ConsoleError('ACCOUNT_LOCKED', 'too many failed attempts, try again later', { retryAfterSec: Math.ceil((r.locked_until - now) / 1000) });
      }
      throw new ConsoleError('INVALID_TOTP', 'code is incorrect');
    }
    this.sessions.completeTotp(session.id, now);
    this.admins.recordLoginSuccess(admin.id, now);
    this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'login.succeeded', ip: ctx.ip, meta: { totp: true } }, now);
  }

  /**
   * Resolve a cookie token to a live session and its admin. Applies idle and absolute expiry.
   * @param {string|undefined} token
   * @returns {{ admin: AdminRow, session: SessionRow }|null}
   */
  resolve(token) {
    if (!token) return null;
    const session = this.sessions.byToken(token);
    if (!session) return null;
    const now = this.now();
    if (session.expires_at <= now || session.last_seen_at + this.options.sessionIdleMs <= now) {
      this.sessions.remove(session.id);
      return null;
    }
    const admin = this.admins.byId(session.admin_id);
    if (!admin || admin.status !== 'active') {
      this.sessions.remove(session.id);
      return null;
    }
    if (now - session.last_seen_at > 60_000) this.sessions.touch(session.id, now);
    return { admin, session };
  }

  /**
   * @param {SessionRow} session
   * @param {AdminRow} admin
   * @param {Ctx} ctx
   */
  logout(session, admin, ctx) {
    if (this.sessions.remove(session.id)) this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'logout', ip: ctx.ip }, this.now());
  }

  /** @param {AdminRow} admin @param {SessionRow} session */
  listSessions(admin, session) {
    return this.sessions.forAdmin(admin.id, this.now()).map((s) => ({ id: s.id, current: s.id === session.id, createdAt: s.created_at, lastSeenAt: s.last_seen_at, ip: s.ip, userAgent: s.user_agent }));
  }

  /** @param {AdminRow} admin @param {SessionRow} keep @param {Ctx} ctx */
  logoutOthers(admin, keep, ctx) {
    const n = this.sessions.removeOthers(admin.id, keep.id);
    this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'sessions.revoked_others', ip: ctx.ip, meta: { count: n } }, this.now());
    return n;
  }

  /**
   * @param {AdminRow} admin
   * @param {SessionRow} session
   * @param {{ currentPassword: string, newPassword: string }} input
   * @param {Ctx} ctx
   */
  async changePassword(admin, session, input, ctx) {
    if (!(await this.hasher.verify(input.currentPassword, admin.password_hash))) throw new ConsoleError('INVALID_CREDENTIALS', 'current password is incorrect');
    ConsoleAuth.assertPassword(input.newPassword, admin.email);
    this.admins.setPassword(admin.id, await this.hasher.hash(input.newPassword), this.now());
    this.sessions.removeOthers(admin.id, session.id);
    this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'password.changed', ip: ctx.ip }, this.now());
  }

  /**
   * Begin TOTP enrolment: a new secret, not yet enforced until {@link confirmTotp}.
   * @param {AdminRow} admin
   */
  startTotp(admin) {
    if (admin.totp_enabled_at !== null) throw new ConsoleError('CONFLICT', 'two-factor authentication is already enabled');
    if (!this.keyring) throw new ConsoleError('TOTP_UNAVAILABLE', 'SECRETS_KEY is required to enrol two-factor authentication, but is not configured');
    const secret = Totp.generateSecret();
    this.admins.setTotpSecret(admin.id, secret, this.now());
    return { secret, uri: Totp.uri({ secret, account: admin.email, issuer: this.options.totpIssuer }) };
  }

  /**
   * @param {AdminRow} admin
   * @param {string} code
   * @param {Ctx} ctx
   */
  confirmTotp(admin, code, ctx) {
    const fresh = /** @type {AdminRow} */ (this.admins.byId(admin.id));
    if (!fresh.totp_secret || fresh.totp_enabled_at !== null) throw new ConsoleError('CONFLICT', 'no enrolment in progress');
    const step = Totp.verify(/** @type {string} */ (this.#totpSecret(fresh)), code, this.now());
    if (step === null || !this.sessions.claimTotpStep(admin.id, step)) throw new ConsoleError('INVALID_TOTP', 'code is incorrect');
    this.admins.enableTotp(admin.id, this.now());
    this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'totp.enabled', ip: ctx.ip }, this.now());
  }

  /**
   * Disabling needs the current password and a valid code.
   * @param {AdminRow} admin
   * @param {{ password: string, code: string }} input
   * @param {Ctx} ctx
   */
  async disableTotp(admin, input, ctx) {
    if (!(await this.hasher.verify(input.password, admin.password_hash))) throw new ConsoleError('INVALID_CREDENTIALS', 'password is incorrect');
    if (!admin.totp_secret || admin.totp_enabled_at === null) throw new ConsoleError('CONFLICT', 'two-factor authentication is not enabled');
    const step = Totp.verify(/** @type {string} */ (this.#totpSecret(admin)), input.code, this.now());
    if (step === null) throw new ConsoleError('INVALID_TOTP', 'code is incorrect');
    this.admins.disableTotp(admin.id, this.now());
    this.audit.record({ adminId: admin.id, adminEmail: admin.email, action: 'totp.disabled', ip: ctx.ip }, this.now());
  }

  /**
   * @param {string} password
   * @param {string} email
   */
  static assertPassword(password, email) {
    const problems = [];
    if ([...password].length < ConsoleAuth.MIN_PASSWORD) problems.push(`must be at least ${ConsoleAuth.MIN_PASSWORD} characters`);
    if (password.length > 256) problems.push('must be at most 256 characters');
    if (/^(.)\1+$/.test(password)) problems.push('must not repeat a single character');
    const local = AdminStore.normalizeEmail(email).split('@')[0];
    if (local.length >= 4 && password.toLowerCase().includes(local)) problems.push('must not contain your email address');
    if (problems.length) throw new ConsoleError('WEAK_PASSWORD', `password ${problems.join('; ')}`, { problems });
  }
}
