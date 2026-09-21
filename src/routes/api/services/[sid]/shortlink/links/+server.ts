import { Schemas, ShortlinkClient } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';
const body = Schemas.body(['url'], { url: Schemas.shortlinkBody.url, slug: Schemas.shortlinkBody.slug, permanent: Schemas.shortlinkBody.permanent, expiresAt: Schemas.shortlinkBody.expiresAt, maxClicks: Schemas.shortlinkBody.maxClicks, tags: Schemas.shortlinkBody.tags, note: Schemas.shortlinkBody.note });
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.shortlinkQuery, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, ShortlinkClient).listLinks(query as Record<string, string | undefined>) });
export const POST = jsonRoute({ auth: 'admin', params: Schemas.serviceParams, body, status: 201, handler: async (context) => { const output: any = await context.runtime.clients.get(context.params.sid, ShortlinkClient).createLink(context.body); record(context, 'shortlink.link.create', output?.link?.code ?? null, { service: context.params.sid, url: output?.link?.url }); return output; } });

