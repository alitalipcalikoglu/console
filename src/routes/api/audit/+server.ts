import { Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, text } from '$lib/server/m4';

export const GET = jsonRoute({
  auth: 'session', query: Schemas.paging,
  handler: ({ runtime, query }) => {
    const limit = number(query.limit) ?? 50;
    const rows = runtime.audit.list({ limit: limit + 1, beforeId: number(query.before), action: text(query.action) });
    const items = rows.slice(0, limit).map((entry) => ({
      id: entry.id, adminId: entry.admin_id, adminEmail: entry.admin_email, action: entry.action,
      target: entry.target, meta: entry.meta ? JSON.parse(entry.meta) : null, ip: entry.ip,
      at: new Date(entry.at).toISOString(),
    }));
    return { items, nextBefore: rows.length > limit ? String(items.at(-1)?.id) : null };
  },
});
