declare module '@atc-web/service-core/trace' {
  export class TraceContext {
    readonly traceId: string;
    readonly spanId: string;
    readonly flags: string;
    readonly parentSpanId: string | null;
    static forRequest(header: unknown, trusted: boolean): TraceContext;
    span(): TraceContext;
    toString(): string;
  }
}

declare module '@atc-web/service-core/request-context' {
  import type { TraceContext } from '@atc-web/service-core/trace';

  export class RequestContext {
    readonly requestId: string;
    readonly trace: TraceContext;
    constructor(options: { requestId: string; trace: TraceContext });
    propagationHeaders(): { 'x-request-id': string; traceparent: string };
    static run<T>(context: RequestContext, callback: () => T): T;
    static get(): RequestContext | null;
  }
}
