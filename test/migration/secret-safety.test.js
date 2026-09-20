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
