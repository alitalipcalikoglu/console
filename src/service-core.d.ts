declare module '@atc-web/service-core/trace' {
  export class TraceContext {
    static forRequest(header: unknown, trusted: boolean): TraceContext;
    toString(): string;
  }
}
