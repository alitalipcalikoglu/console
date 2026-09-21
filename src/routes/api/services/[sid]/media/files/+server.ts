import { MediaClient, Schemas } from '$lib/server/m4-contract';
import { jsonRoute, number, record, text } from '$lib/server/m4';
import { CONSOLE_UPLOAD_LIMIT_BYTES, specialRoute, UploadStream, uploadTooLarge } from '$lib/server/m5';
export const GET = jsonRoute({ auth: 'session', params: Schemas.serviceParams, query: Schemas.paging, handler: ({ runtime, params, query }) => runtime.clients.get(params.sid, MediaClient).listFiles({ limit: number(query.limit), cursor: text(query.cursor) }) });

export const PUT = specialRoute({
  auth: 'admin',
  params: Schemas.serviceParams,
  query: Schemas.mediaUploadQuery,
  handler: async (context) => {
    const contentLength = context.event.request.headers.get('content-length') ?? undefined;
    if (contentLength && Number(contentLength) > CONSOLE_UPLOAD_LIMIT_BYTES) throw uploadTooLarge();
    const upload = UploadStream.limit(context.event.request.body);
    const signal = AbortSignal.any([context.event.request.signal, upload.signal]);
    const client = context.runtime.clients.get(context.params.sid, MediaClient);
    let output: any;
    try {
      output = await client.upload(upload.body, {
        name: text(context.query.name),
        visibility: text(context.query.visibility),
        contentType: context.event.request.headers.get('content-type') ?? undefined,
        contentLength,
      }, signal);
    } catch (error) {
      if (upload.exceeded) throw uploadTooLarge();
      throw error;
    }
    record(context, 'media.file.upload', output?.file?.id ?? null, {
      service: client.id,
      name: output?.file?.name,
      size: output?.file?.size,
    });
    return Response.json(output, { status: 201 });
  },
});
