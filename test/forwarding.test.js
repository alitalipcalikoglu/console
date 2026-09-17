import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Database } from '../src/db.js';
import { AuditEvents } from '../src/domain/audit-events.js';
import { AuditClient } from '../src/net/audit-client.js';
import { AuditStore } from '../src/store/audit-store.js';

test('console log entries are forwarded as console.* audit events', () => {
  const store = new AuditStore(new Database(':memory:'));
  const client = new AuditClient({ target: { url: 'http://audit.test', apiKey: 'a'.repeat(40) }, logger: { warn() {}, error() {} } });
  store.onRecord = (e, at) => { client.record(AuditEvents.fromLogEntry(e, at)); };
  const at = Date.parse('2026-09-17T10:00:00Z');
  store.record({ adminId: 'ad1', adminEmail: 'admin@console.local', action: 'ratelimit.policy.create', target: 'api', meta: { service: 'ratelimit' }, ip: '10.0.0.9' }, at);
  store.record({ adminEmail: 'x@console.local', action: 'login.failed', ip: '10.0.0.9' }, at);
  const [a, b] = client.buffer;
  assert.deepEqual([a.action, a.outcome, a.actor, a.target, a.meta, a.ip, a.at], ['console.ratelimit.policy.create', 'success', { type: 'admin', id: 'ad1', name: 'admin@console.local' }, { type: 'policy', id: 'api' }, { service: 'ratelimit' }, '10.0.0.9', '2026-09-17T10:00:00.000Z']);
  assert.deepEqual([b.action, b.outcome, b.actor, b.target], ['console.login.failed', 'failure', undefined, undefined]);
  assert.equal(store.list({ limit: 10 }).length, 2, 'local log still written');
  const off = new AuditClient({ target: null });
  assert.equal(off.record({ action: 'x' }), false);
});
