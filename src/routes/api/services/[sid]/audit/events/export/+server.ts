import { AuditClient, Schemas, ServiceError } from '$lib/server/m4-contract';
import { record, text } from '$lib/server/m4';
import { SPECIAL_CONTENT_SECURITY_POLICY, specialRoute } from '$lib/server/m5';

export const GET = specialRoute({
  auth: 'session',
  params: Schemas.serviceParams,
  query: Schemas.auditQuery,
  handler: async (context) => {
    const format = text(context.query.format) === 'csv' ? 'csv' : 'ndjson';
    const downstream = await context.runtime.clients.get(context.params.sid, AuditClient)
      .export(context.query as Record<string, string | undefined>, format);
    if (!downstream.ok) {
      throw new ServiceError(`${context.params.sid} export responded ${downstream.status}`, {
        statusCode: downstream.status,
        service: context.params.sid,
      });
    }
    const { format: _format, ...filter } = context.query;
    record(context, 'audit.events.export', context.params.sid, { format, filter });
    return new Response(downstream.body, {
      status: 200,
      headers: {
        'content-type': downstream.headers.get('content-type') ?? 'application/octet-stream',
        'content-disposition': downstream.headers.get('content-disposition') ?? `attachment; filename="audit.${format}"`,
        'content-security-policy': SPECIAL_CONTENT_SECURITY_POLICY,
      },
    });
  },
});
