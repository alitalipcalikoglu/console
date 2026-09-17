/** @typedef {import('../net/audit-client.js').AuditEvent} AuditEvent */

/**
 * Maps console log entries onto audit-service events: `console.<action>` with the admin as actor.
 * The target type is taken from the action (`ratelimit.policy.create` → `policy`), the target id is
 * the entry's target. Sign-in failures and lockouts are failures.
 */
export class AuditEvents {
  static FAILURES = new Set(['login.failed', 'login.locked', 'totp.failed']);

  /**
   * @param {{ adminId: string|null, adminEmail: string|null, action: string, target: string|null, meta: object|null, ip: string|null }} e
   * @param {number} at
   * @returns {AuditEvent & { at: string }}
   */
  static fromLogEntry(e, at) {
    const parts = e.action.split('.');
    const targetType = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    return {
      action: `console.${e.action}`,
      outcome: AuditEvents.FAILURES.has(e.action) ? 'failure' : 'success',
      actor: e.adminId ? { type: 'admin', id: e.adminId, ...(e.adminEmail ? { name: e.adminEmail } : {}) } : undefined,
      target: e.target ? { type: targetType.replace(/[^a-z0-9_-]/g, '-').slice(0, 32) || 'target', id: String(e.target).slice(0, 128) } : undefined,
      ip: e.ip ?? undefined,
      meta: e.meta ?? undefined,
      at: new Date(at).toISOString(),
    };
  }
}
