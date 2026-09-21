import { AuditClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, record } from '$lib/server/m4';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.auditQuery, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, AuditClient).verify({ fromSeq: number(context.query.fromSeq), toSeq: number(context.query.toSeq) }); record(context, 'audit.chain.verify', context.params.sid, { ok: output?.ok, checked: output?.checked, firstBroken: output?.firstBroken ?? null }); return output; } });

