import { MediaClient, Schemas } from '$lib/server/m4-contract';
import { SPECIAL_CONTENT_SECURITY_POLICY, specialRoute } from '$lib/server/m5';

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export const GET = specialRoute({
  auth: 'session',
  params: Schemas.serviceIdSubParams,
  handler: async ({ runtime, params }) => {
    const downstream = await runtime.clients.get(params.sid, MediaClient).bytes(params.id, params.sub);
    const type = (downstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const inline = INLINE_TYPES.has(type);
    const disposition = downstream.headers.get('content-disposition');
    const headers = new Headers({
      'content-type': inline ? type : 'application/octet-stream',
      'content-disposition': inline && disposition ? disposition : `attachment; filename="${params.id}.bin"`,
      'content-security-policy': SPECIAL_CONTENT_SECURITY_POLICY,
      'cache-control': 'private, max-age=300',
    });
    for (const name of ['content-length', 'etag']) {
      const value = downstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(downstream.body, { status: 200, headers });
  },
});
