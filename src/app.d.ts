declare global {
  namespace App {
    interface Locals {
      requestId: string;
      trace: {
        traceId: string;
        spanId: string;
        parentSpanId: string | null;
        traceparent: string;
      };
      clientIp: string | null;
      csrf: {
        required: boolean;
        valid: boolean;
      };
      principal: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'viewer';
        status: 'active' | 'disabled';
        totpEnabled: boolean;
      } | null;
      session: {
        id: string;
        adminId: string;
        createdAt: number;
        lastSeenAt: number;
        expiresAt: number;
        totpPending: boolean;
      } | null;
    }
  }
}

export {};
