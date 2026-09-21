import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

test('fixture safety oracle: migration fixtures contain no credentials or machine-local paths', () => {
  const fixtureDir = new URL('./fixtures/', import.meta.url);
  const fixtures = readdirSync(fixtureDir).filter((name) => name.endsWith('.json'));
  assert.ok(fixtures.length > 0);
  const forbidden = [
    /\/Users\//,
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
    /console_session=[A-Za-z0-9_-]+/,
    /\b(?:[0-9a-fA-F]{64})\b/,
    /JBSWY3DPEHPK3PXP/,
    /(?:passwordHash|apiKey|encryptionKey|privateKey)"\s*:\s*"[^\"]+/i,
  ];
  for (const name of fixtures) {
    const contents = readFileSync(new URL(name, fixtureDir), 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(contents, pattern, `${name} must remain safe to commit`);
  }
});

test('M3 locals expose only safe request, principal and session summaries', () => {
  const locals = readFileSync(new URL('../../src/app.d.ts', import.meta.url), 'utf8');
  for (const name of ['password', 'password_hash', 'token_hash', 'totp_secret', 'apiKey', 'privateKey', 'encryptionKey']) {
    assert.doesNotMatch(locals, new RegExp(name, 'i'));
  }
  for (const name of ['requestId', 'trace', 'clientIp', 'principal', 'session', 'role', 'totpPending']) {
    assert.match(locals, new RegExp(`\\b${name}\\b`));
  }
});

test('M4 hook keeps body parsing out of the global lifecycle and protects API mutations except authentication entry points', () => {
  const hook = readFileSync(new URL('../../src/hooks.server.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(hook, /arrayBuffer\(|request\.json\(|request\.body/);
  assert.match(hook, /mutation/);
  assert.match(hook, /event\.route\.id\?\.startsWith\('\/api\/'\)/);
  assert.match(hook, /CSRF_EXEMPT/);
  assert.match(hook, /'\/api\/session\/login'/);
  assert.match(hook, /'\/api\/session\/totp'/);
});
