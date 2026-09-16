export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Validated process configuration. Service connections live in services.json (see ServiceRegistry). */
export class Config {
  /** @param {import('./types.js').ConfigValues} v */
  constructor(v) {
    this.port = v.port;
    this.host = v.host;
    this.logLevel = v.logLevel;
    this.trustProxy = v.trustProxy;
    this.tls = v.tls;
    this.dbPath = v.dbPath;
    this.servicesFile = v.servicesFile;
    this.publicDir = v.publicDir;
    this.cookieSecure = v.cookieSecure;
    this.sessionTtlMin = v.sessionTtlMin;
    this.sessionIdleMin = v.sessionIdleMin;
    this.loginMaxFailures = v.loginMaxFailures;
    this.loginLockoutMin = v.loginLockoutMin;
    this.scryptLogN = v.scryptLogN;
    this.totpIssuer = v.totpIssuer;
    this.auditRetentionDays = v.auditRetentionDays;
    this.serviceTimeoutMs = v.serviceTimeoutMs;
    this.rateLimitMax = v.rateLimitMax;
    Object.freeze(this);
  }

  /**
   * @param {NodeJS.ProcessEnv} [env]
   * @returns {Config}
   */
  static fromEnv(env = process.env) {
    const r = new EnvReader(env);
    const certPath = r.optional('TLS_CERT_PATH');
    const keyPath = r.optional('TLS_KEY_PATH');
    if (Boolean(certPath) !== Boolean(keyPath)) throw new ConfigError('TLS_CERT_PATH and TLS_KEY_PATH must be set together');
    const sessionTtlMin = r.integer('CONSOLE_SESSION_TTL_MIN', 720, { min: 5, max: 43_200 });
    const sessionIdleMin = r.integer('CONSOLE_SESSION_IDLE_MIN', 60, { min: 1, max: sessionTtlMin });
    return new Config({
      port: r.integer('PORT', 3004, { min: 1, max: 65535 }),
      host: r.optional('HOST') || '0.0.0.0',
      logLevel: r.optional('LOG_LEVEL') || 'info',
      trustProxy: r.boolean('TRUST_PROXY', false),
      tls: certPath ? { certPath, keyPath } : null,
      dbPath: r.optional('DB_PATH') || './data/console.db',
      servicesFile: r.optional('SERVICES_FILE') || './services.json',
      publicDir: r.optional('PUBLIC_DIR') || './public',
      cookieSecure: r.boolean('COOKIE_SECURE', true),
      sessionTtlMin,
      sessionIdleMin,
      loginMaxFailures: r.integer('CONSOLE_LOGIN_MAX_FAILURES', 5, { min: 3, max: 50 }),
      loginLockoutMin: r.integer('CONSOLE_LOGIN_LOCKOUT_MIN', 15, { min: 1 }),
      scryptLogN: r.integer('SCRYPT_LOG_N', 15, { min: 14, max: 20 }),
      totpIssuer: r.optional('TOTP_ISSUER') || 'atc console',
      auditRetentionDays: r.integer('AUDIT_RETENTION_DAYS', 365, { min: 30 }),
      serviceTimeoutMs: r.integer('SERVICE_TIMEOUT_MS', 10_000, { min: 500, max: 120_000 }),
      rateLimitMax: r.integer('RATE_LIMIT_MAX', 30, { min: 1 }),
    });
  }
}

/** Typed accessors over a raw environment map. */
class EnvReader {
  /** @param {NodeJS.ProcessEnv} env */
  constructor(env) {
    this.env = env;
  }

  /** @param {string} name */
  optional(name) {
    return this.env[name]?.trim() ?? '';
  }

  /**
   * @param {string} name
   * @param {number} fallback
   * @param {{ min?: number, max?: number }} [range]
   */
  integer(name, fallback, range = {}) {
    const raw = this.optional(name);
    if (raw === '') return fallback;
    if (!/^-?\d+$/.test(raw)) throw new ConfigError(`${name} must be an integer, got "${raw}"`);
    const n = Number(raw);
    if (range.min !== undefined && n < range.min) throw new ConfigError(`${name} must be >= ${range.min}`);
    if (range.max !== undefined && n > range.max) throw new ConfigError(`${name} must be <= ${range.max}`);
    return n;
  }

  /**
   * @param {string} name
   * @param {boolean} fallback
   */
  boolean(name, fallback) {
    const raw = this.optional(name);
    if (raw === '') return fallback;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new ConfigError(`${name} must be true or false, got "${raw}"`);
  }
}
