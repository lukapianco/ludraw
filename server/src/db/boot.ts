/**
 * LuDraw server — preparo do banco no boot (Chat 09 · R1, S-37).
 *
 * 1. Migração só quando permitida (`LUDRAW_MIGRATE_ON_BOOT`; padrão: fora de produção), com o papel de migração
 *    (`LUDRAW_MIGRATE_DATABASE_URL`) ou, sem ele, com o `DATABASE_URL`.
 * 2. Abre a conexão da aplicação (com os tempos limite).
 * 3. Confere que nenhuma migração ficou pendente; se ficou, NÃO sobe — a aplicação rodaria sobre um esquema velho.
 */
import type { ServerConfig } from '../config';
import { migrateDatabase, openDatabase, type Database } from './client';

export interface BootLog {
  info(msg: string): void;
  warn(msg: string): void;
}

export const PENDING_HELP =
  'Run the migrations first: "node dist/cli.js db:migrate" (or "npm --prefix server run db:migrate") with LUDRAW_MIGRATE_DATABASE_URL pointing to the migration role, or set LUDRAW_MIGRATE_ON_BOOT=true.';

export async function prepareDatabase(config: Pick<ServerConfig, 'databaseUrl' | 'database'>, log?: BootLog): Promise<{ database: Database; migratedNow: number }> {
  const { database: opts, databaseUrl } = config;
  let migratedNow = 0;
  const embedded = databaseUrl.startsWith('pglite://');
  if (!embedded && opts.migrateOnBoot) {
    migratedNow = (await migrateDatabase(opts.migrateUrl ?? databaseUrl)).applied;
  }
  const database = await openDatabase(databaseUrl, {
    statementTimeoutMs: opts.statementTimeoutMs,
    idleInTransactionTimeoutMs: opts.idleInTransactionTimeoutMs,
    poolMax: opts.poolMax,
    onPoolError: (err) => log?.warn(`database connection dropped: ${err.message}`),
  });
  try {
    const pending = await database.pendingMigrations();
    if (pending > 0) throw new Error(`The database has ${pending} pending migration(s) and migrations on boot are off. ${PENDING_HELP}`);
  } catch (err) {
    await database.close();
    throw err;
  }
  if (migratedNow > 0) log?.info(`Applied ${migratedNow} database migration(s) on boot.`);
  return { database, migratedNow };
}
