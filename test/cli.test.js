import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminCli } from '../scripts/admin.js';
import { ADMIN_PASSWORD, testConsole } from './helpers.js';

test('AdminCli creates, lists and resets passwords with hidden prompts', async () => {
  const t = await testConsole();
  /** @type {string[]} */
  const out = [];
  let answers = [ADMIN_PASSWORD, ADMIN_PASSWORD];
  const cli = new AdminCli({ admins: t.admins, service: t.adminService, out: (s) => out.push(s), prompt: async () => /** @type {string} */ (answers.shift()) });
  assert.equal(await cli.run(['create', 'root@console.local', '--role', 'admin', '--name', 'Root']), 0);
  assert.match(out.at(-1) ?? '', /created admin root@console.local/);
  assert.equal(await cli.run(['list']), 0);
  assert.match(out.at(-1) ?? '', /root@console.local\tadmin\tactive\ttotp=off/);
  answers = ['another long password', 'mismatch'];
  await assert.rejects(cli.run(['reset-password', 'root@console.local']), /do not match/);
  answers = ['another long password', 'another long password'];
  assert.equal(await cli.run(['reset-password', 'root@console.local']), 0);
  await t.auth.login({ email: 'root@console.local', password: 'another long password' }, { ip: null, userAgent: null });
  await assert.rejects(cli.run(['create', 'x@console.local', '--role', 'god']), /--role/);
  assert.equal(await cli.run(['nope']), 2);
  await t.app.close();
});
