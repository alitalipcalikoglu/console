import { Schemas, ServiceError, ShortlinkClient } from '$lib/server/m4-contract';
import { number } from '$lib/server/m4';
import { SPECIAL_CONTENT_SECURITY_POLICY, specialRoute } from '$lib/server/m5';

export const GET = specialRoute({
  auth: 'session',
  params: Schemas.serviceIdParams,
  query: Schemas.shortlinkQuery,
  handler: async ({ runtime, params, query }) => {
    const downstream = await runtime.clients.get(params.sid, ShortlinkClient)
      .qrPng(params.id, { scale: number(query.scale), margin: number(query.margin) });
    if (!downstream.ok) {
      throw new ServiceError(`${params.sid} qr responded ${downstream.status}`, {
        statusCode: downstream.status,
        service: params.sid,
      });
    }
    const bytes = await downstream.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.byteLength),
        'content-disposition': `inline; filename="${params.id}.png"`,
        'content-security-policy': SPECIAL_CONTENT_SECURITY_POLICY,
        'cache-control': 'private, max-age=3600',
      },
    });
  },
});
