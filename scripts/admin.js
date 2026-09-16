import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Config } from '../src/config.js';
import { PasswordHasher } from '../src/crypto/password.js';
import { Database } from '../src/db.js';
import { AdminService } from '../src/domain/admin-service.js';
import { AdminStore } from '../src/store/admin-store.js';
import { AuditStore } from '../src/store/audit-store.js';
import { SessionStore } from '../src/store/session-store.js';

/**
 * Console administrator CLI, run on the server where the console's database lives.
 *   npm run admin -- create <email> [--role admin|viewer] [--name "Full Name"]
 *   npm run admin -- reset-password <email>
 *   npm run admin -- list
 * Passwords are prompted without echo, never taken from arguments.
 */
export class AdminCli {
  /**
   * @param {{ admins: AdminStore, service: AdminService, prompt: (q: string, hidden: boolean) => Promise<string>, out: (s: string) => void }} deps
   */
  constructor({ admins, service, prompt, out }) {
    this.admins = admins;
    this.service = service;
    this.prompt = prompt;
    this.out = out;
  }

  /** @param {string[]} argv */
  async run(argv) {
    const [cmd, ...rest] = argv;
    switch (cmd) {
      case 'create': return this.#create(rest);
      case 'reset-password': return this.#resetPassword(rest);
      case 'list': return this.#list();
      default:
        this.out('usage: admin create <email> [--role admin|viewer] [--name "Name"] | reset-password <email> | list');
        return 2;
    }
  }

  /** @param {string[]} args */
  async #create(args) {
    const email = args.find((a) => !a.startsWith('--'));
    if (!email) throw new Error('email is required');
    const role = /** @type {'admin'|'viewer'} */ (AdminCli.#flag(args, '--role') ?? 'admin');
    if (role !== 'admin' && role !== 'viewer') throw new Error('--role must be admin or viewer');
    const password = await this.#newPassword();
    const admin = await this.service.create({ email, name: AdminCli.#flag(args, '--name') ?? '', password, role }, null, { ip: null, userAgent: 'cli' });
    this.out(`created ${admin.role} ${admin.email} (${admin.id})`);
    return 0;
  }

  /** @param {string[]} args */
  async #resetPassword(args) {
    const admin = args[0] ? this.admins.byEmail(args[0]) : undefined;
    if (!admin) throw new Error('no admin with that email');
    const password = await this.#newPassword();
    const actor = { ...admin, email: 'cli' };
    await this.service.resetPassword(admin.id, password, /** @type {any} */ (actor), { ip: null, userAgent: 'cli' });
    this.out(`password updated for ${admin.email}; their sessions were signed out`);
    return 0;
  }

  #list() {
    for (const a of this.service.list()) this.out(`${a.email}\t${a.role}\t${a.status}\ttotp=${a.totpEnabled ? 'on' : 'off'}\tlast login ${a.lastLoginAt ?? '-'}`);
    return 0;
  }

  async #newPassword() {
    const a = await this.prompt('New password (min 12 chars): ', true);
    const b = await this.prompt('Repeat password: ', true);
    if (a !== b) throw new Error('passwords do not match');
    return a;
  }

  /**
   * @param {string[]} args
   * @param {string} name
   */
  static #flag(args, name) {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === (await import('node:path')).resolve(process.argv[1])) {
  const config = Config.fromEnv();
  const db = new Database(config.dbPath);
  const admins = new AdminStore(db);
  const service = new AdminService({ admins, sessions: new SessionStore(db), audit: new AuditStore(db), hasher: new PasswordHasher({ logN: config.scryptLogN }) });
  const muted = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  const cli = new AdminCli({
    admins, service, out: (s) => console.log(s),
    prompt: async (q, hidden) => {
      process.stdout.write(q);
      const rl = createInterface({ input: process.stdin, output: hidden ? muted : process.stdout, terminal: true });
      const answer = await rl.question('');
      rl.close();
      if (hidden) process.stdout.write('\n');
      return answer;
    },
  });
  try {
    process.exitCode = await cli.run(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
