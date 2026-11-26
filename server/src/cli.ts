/**
 * LuDraw server — linha de comando de operação e recuperação (Chat 07).
 *
 *   npm run db:migrate                  (Chat 09 · R1: usa LUDRAW_MIGRATE_DATABASE_URL, se houver)
 *   npm run db:roles -- --database ludraw   (imprime o SQL dos papéis; não conecta em nada)
 *   npm run admin:create -- --email ana@empresa.com [--name "Ana"] [--generate | --password-stdin] [--promote]
 *   npm run admin:reset-password -- --email ana@empresa.com [--generate | --password-stdin]
 *   npm run setup:token
 *
 * No contêiner (Chat 09 · R3): `docker compose exec app ludraw admin:reset-password --email …` (o comando
 * `ludraw` da imagem roda este arquivo; a imagem não tem npm).
 * A senha NUNCA vai como argumento (ficaria no histórico do shell e na lista de processos): é pedida
 * sem eco no terminal, lida da entrada padrão (--password-stdin) ou gerada (--generate, mostrada uma vez).
 */
import { loadConfig } from './config';
import { loadDotEnv } from './env';
import { migrateDatabase, openDatabase } from './db/client';
import { PENDING_HELP } from './db/boot';
import { clusterRolesSql, initScriptSql, schemaGrantsSql } from './db/roles';
import { CliError, createAdmin, generatePassword, newSetupToken, resetPassword } from './cli/commands';
import { displayToken } from './setup/boot';
import { describeBootError } from './lib/errors';

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string | undefined; flags: Flags } {
  const [command, ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new CliError(`Unexpected argument: ${a}`);
    const name = a.slice(2);
    if (name === 'password') throw new CliError('Passing the password as an argument is not allowed. Use the prompt, --password-stdin or --generate.');
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      i++;
    } else flags[name] = true;
  }
  return { command, flags };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new CliError('No terminal available to type the password. Use --password-stdin or --generate.'));
      return;
    }
    process.stderr.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') {
          stdin.setRawMode(false);
          process.stderr.write('\n');
          reject(new CliError('Cancelled.'));
          return;
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function obtainPassword(flags: Flags): Promise<{ password: string; generated: boolean }> {
  if (flags.generate) return { password: generatePassword(), generated: true };
  if (flags['password-stdin']) {
    const password = await readStdin();
    if (!password) throw new CliError('Empty password on standard input.');
    return { password, generated: false };
  }
  const first = await promptHidden('New password: ');
  const second = await promptHidden('Repeat the password: ');
  if (first !== second) throw new CliError('The passwords do not match.');
  return { password: first, generated: false };
}

function requireEmail(flags: Flags): string {
  const email = flags.email;
  if (typeof email !== 'string' || !email) throw new CliError('Missing --email.');
  return email;
}

const HELP = `LuDraw server CLI
  db:migrate                         apply database migrations (uses LUDRAW_MIGRATE_DATABASE_URL when set)
  db:roles --database <name>         print the SQL that creates the least-privilege roles (does not connect)
           [--init-script]           only the SQL, in the format of deploy/postgres/10-ludraw-roles.sql
  admin:create --email <e> [--name <n>] [--generate | --password-stdin] [--promote]
  admin:reset-password --email <e> [--generate | --password-stdin]
  setup:token                        issue a new first-run setup token (only while setup is pending)
In the Docker image: docker compose exec app ludraw <command> [options]`;

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (command === 'db:roles') {
    const name = flags.database;
    if (typeof name !== 'string' || !name) throw new CliError('Missing --database <name> (the database the application uses).');
    // Chat 09 · R3: só o SQL, no formato do script de inicialização do contêiner do Postgres
    if (flags['init-script'] === true) {
      process.stdout.write(initScriptSql(name));
      return;
    }
    process.stdout.write(
      `-- 1) As a superuser, connected to any database:\n${clusterRolesSql(name)}\n` +
        `-- 2) As a superuser, connected to the "${name}" database:\n${schemaGrantsSql()}\n` +
        '-- 3) Set the passwords yourself (never in a file you share): \\password ludraw_migrator  and  \\password ludraw_app\n',
    );
    return;
  }
  loadDotEnv();
  const config = loadConfig();
  if (command === 'db:migrate') {
    if (config.databaseUrl.startsWith('pglite://')) throw new CliError('db:migrate needs PostgreSQL (pglite:// is the in-memory test database).');
    const { applied } = await migrateDatabase(config.database.migrateUrl ?? config.databaseUrl);
    process.stdout.write(applied > 0 ? `Applied ${applied} migration(s). Database migrations are up to date.\n` : 'Database migrations are up to date.\n');
    return;
  }
  // Chat 09 · R1: a CLI não migra; comando de operação sobre esquema velho é recusado
  const database = await openDatabase(config.databaseUrl, { statementTimeoutMs: config.database.statementTimeoutMs, poolMax: 2 });
  try {
    const pending = await database.pendingMigrations();
    if (pending > 0) throw new CliError(`The database has ${pending} pending migration(s). ${PENDING_HELP}`);
    switch (command) {
      case 'admin:create': {
        const email = requireEmail(flags);
        const promote = flags.promote === true;
        const { password, generated } = promote ? { password: '', generated: false } : await obtainPassword(flags);
        const res = await createAdmin(database.db, { email, name: typeof flags.name === 'string' ? flags.name : undefined, password, promote });
        if (res.promoted) process.stdout.write(`${email} is now an active administrator. Recorded in the audit log.\n`);
        else {
          process.stdout.write(`Administrator ${email} created. They must change the password at first sign-in. Recorded in the audit log.\n`);
          if (generated) process.stdout.write(`Temporary password (shown only now): ${password}\n`);
        }
        break;
      }
      case 'admin:reset-password': {
        const email = requireEmail(flags);
        const { password, generated } = await obtainPassword(flags);
        const res = await resetPassword(database.db, { email, password });
        process.stdout.write(`Password reset for ${email}. ${res.sessionsEnded} open session(s) ended; a password change is required at next sign-in. Recorded in the audit log.\n`);
        if (generated) process.stdout.write(`Temporary password (shown only now): ${password}\n`);
        break;
      }
      case 'setup:token': {
        const token = await newSetupToken(database.db);
        process.stdout.write(`New setup token (the previous one no longer works):\n\n   ${displayToken(token)}\n\n`);
        break;
      }
      default:
        throw new CliError(`Unknown command: ${command}\n${HELP}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof CliError ? err.message : `Error: ${describeBootError(err)}`}\n`);
  process.exit(1);
});
