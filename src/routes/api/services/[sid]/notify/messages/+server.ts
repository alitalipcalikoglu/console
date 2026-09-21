import { NotifyClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, record, text } from '$lib/server/m4';

export const GET = jsonRoute({
  auth: 'session', params: Schemas.serviceParams, query: Schemas.paging,
  handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, NotifyClient).listMessages({ status: text(query.status), limit: number(query.limit), cursor: text(query.cursor) }),
});

export const POST = jsonRoute({
  auth: 'admin', params: Schemas.serviceParams, body: { type: 'object' }, status: 202,
  handler: async (context) => {
    const output = await context.runtime.clients.get(context.params.sid, NotifyClient).send(context.body);
    record(context, 'notify.message.send', (output as any)?.id ?? null, { service: context.params.sid, channel: context.body.channel, template: context.body.template, to: context.body.to });
    return output;
  },
});

