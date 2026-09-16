/** Console-side error with a stable code and HTTP status. */
export class ConsoleError extends Error {
  /** @type {Record<string, number>} */
  static STATUS = {
    INVALID_CREDENTIALS: 401,
    UNAUTHENTICATED: 401,
    TOTP_REQUIRED: 401,
    INVALID_TOTP: 401,
    ACCOUNT_LOCKED: 423,
    ACCOUNT_DISABLED: 403,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    EMAIL_TAKEN: 409,
    CONFLICT: 409,
    WEAK_PASSWORD: 400,
    INVALID_ARGUMENT: 400,
    LAST_ADMIN: 409,
    RATE_LIMITED: 429,
  };

  /**
   * @param {keyof typeof ConsoleError.STATUS} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'ConsoleError';
    this.code = code;
    this.statusCode = ConsoleError.STATUS[code];
    this.details = details;
  }
}
