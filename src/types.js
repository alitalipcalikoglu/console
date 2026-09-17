/** Shared JSDoc typedefs for the console. No runtime exports. */

/**
 * @typedef {object} ConfigValues
 * @property {number} port
 * @property {string} host
 * @property {string} logLevel
 * @property {boolean} trustProxy
 * @property {{ certPath: string, keyPath: string }|null} tls
 * @property {string} dbPath
 * @property {string} [dbBackupDir]
 * @property {string} servicesFile
 * @property {string} publicDir
 * @property {boolean} cookieSecure
 * @property {number} sessionTtlMin        Absolute session lifetime.
 * @property {number} sessionIdleMin       Sliding inactivity timeout.
 * @property {number} loginMaxFailures
 * @property {number} loginLockoutMin
 * @property {number} scryptLogN
 * @property {string} totpIssuer
 * @property {number} auditRetentionDays
 * @property {number} serviceTimeoutMs
 * @property {number} rateLimitMax         Login attempts per IP per minute.
 */

/** @typedef {import('./config.js').Config} Config */

/** @typedef {'admin'|'viewer'} Role */

/**
 * @typedef {object} AdminRow
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} password_hash
 * @property {Role} role
 * @property {'active'|'disabled'} status
 * @property {string|null} totp_secret        Base32; set while enrolling and after.
 * @property {number|null} totp_enabled_at    Null until the first code was confirmed.
 * @property {number} failed_logins
 * @property {number|null} locked_until
 * @property {number} created_at
 * @property {number} updated_at
 * @property {number|null} last_login_at
 */

/**
 * @typedef {object} SessionRow
 * @property {string} id
 * @property {string} admin_id
 * @property {string} token_hash
 * @property {number} created_at
 * @property {number} last_seen_at
 * @property {number} expires_at
 * @property {number} totp_pending           1 while the password step passed but the TOTP step has not.
 * @property {string|null} ip
 * @property {string|null} user_agent
 */

/**
 * @typedef {object} AuditRow
 * @property {number} id
 * @property {string|null} admin_id
 * @property {string|null} admin_email
 * @property {string} action
 * @property {string|null} target
 * @property {string|null} meta
 * @property {string|null} ip
 * @property {number} at
 */

/** @typedef {'notify'|'auth'|'media'|'gateway'|'audit'|'shortlink'|'flags'|'scheduler'|'webhook-out'|'search'|'ratelimit'|'geo'} ServiceType */

/**
 * One entry of services.json after validation and secret resolution.
 * @typedef {object} ServiceDef
 * @property {string} id
 * @property {ServiceType} type
 * @property {string} url             Internal origin, no trailing slash.
 * @property {string|null} apiKey     Resolved secret (null for gateway).
 * @property {string|null} metricsToken
 * @property {string|null} publicUrl  Browser-facing origin, if different.
 * @property {string} label
 * @property {{ enabled: boolean, intervalSec: number }} polling  Auto-refresh of the service's own page in the UI.
 */

/** @typedef {import('fastify').FastifyBaseLogger} Logger */

export {};
