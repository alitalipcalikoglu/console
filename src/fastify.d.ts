// Type-only augmentation for request decorators set by SessionAuth. No runtime code.
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    admin: import("./types.js").AdminRow | null;
    consoleSession: import("./types.js").SessionRow | null;
  }
}
