import { ConsoleError, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, record } from '$lib/server/m4';

const body = Schemas.body(['polling'], { polling: Schemas.body(['enabled', 'intervalSec'], { enabled: { type: 'boolean' }, intervalSec: { type: 'integer', minimum: 5, maximum: 3600 } }) });

export const PATCH = jsonRoute({
  auth: 'admin', params: Schemas.serviceParams, body,
  handler: (context) => {
    const { runtime, params } = context;
    if (!runtime.registry.get(params.sid)) throw new ConsoleError('NOT_FOUND', `unknown service "${params.sid}"`);
    runtime.registry.updatePolling(params.sid, context.body.polling);
    runtime.registry.save();
    record(context, 'service.settings.update', params.sid, { polling: context.body.polling });
    return { service: runtime.registry.describe().find((service) => service.id === params.sid) };
  },
});
