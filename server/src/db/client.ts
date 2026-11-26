/**
 * LuDraw server — conexão com o banco (Chat 07; Chat 09 · R1: migração separada da conexão).
 *
 * `postgres://…` → node-postgres (produção). `pglite://memory` → PostgreSQL embutido em WebAssembly,
 * usado SÓ pelos testes automáticos (dependência de desenvolvimento). Migrações em `server/drizzle/`.
 *
 * Chat 09 · R1 (S-37, S-20): `openDatabase` NÃO migra mais o Postgres. A migração é `migrateDatabase(url)`, chamada
 * pelo boot só quando permitido (`LUDRAW_MIGRATE_ON_BOOT`) ou pela CLI `db:migrate`, idealmente com um papel
 * próprio (`LUDRAW_MIGRATE_DATABASE_URL`). O pool da aplicação manda `statement_timeout` e
 * `idle_in_transaction_session_timeout` na abertura de cada conexão. O PGlite (memória, só testes) continua
 * migrando ao abrir: é sempre um banco novo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { DB_DEFAULTS } from '../config';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export interface Database {
  db: Db;
  kind: 'postgres' | 'pglite';
  close(): Promise<void>;
  /** Confere se o banco responde (rota /health). */
  ping(): Promise<boolean>;
  /** Chat 09 · R1: quantas migrações do `server/drizzle/` ainda não foram aplicadas neste banco. */
  pendingMigrations(): Promise<number>;
  /**
   * Chat 09 · R4: roda `fn` só se nenhuma outra instância estiver rodando a mesma tarefa (trava consultiva do Postgres,
   * presa a uma conexão própria enquanto `fn` roda). Devolve false quando outra instância já está nela.
   */
  runExclusive(task: string, fn: () => Promise<void>): Promise<boolean>;
}

/** Opções da conexão da APLICAÇÃO (Chat 09 · R1). Tempo 0 = não manda (vale o padrão do papel/banco). */
export interface OpenOptions {
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
  poolMax?: number;
  /** Erro numa conexão OCIOSA do pool (banco reiniciado, sessão encerrada pelo tempo limite). Sem isto o Node encerraria o processo. */
  onPoolError?: (err: Error) => void;
}

/** Pasta das migrações tanto rodando do código-fonte (`src/db`) quanto do build (`dist`). */
export function migrationsFolder(): string {
  const candidates = [new URL('../../drizzle', import.meta.url), new URL('../drizzle', import.meta.url), new URL('./drizzle', import.meta.url)];
  for (const c of candidates) {
    const dir = fileURLToPath(c);
    if (existsSync(`${dir}/meta/_journal.json`)) return dir;
  }
  throw new Error('Migrations folder not found (expected server/drizzle/meta/_journal.json)');
}

/** Marcas de tempo (`when`) das migrações do repositório, em ordem — a mesma regra do migrador do Drizzle. */
export function migrationStamps(): number[] {
  const journal = JSON.parse(readFileSync(`${migrationsFolder()}/meta/_journal.json`, 'utf8')) as { entries: { when: number }[] };
  return journal.entries.map((e) => e.when);
}

/** Tabela de controle do migrador do Drizzle (`drizzle.__drizzle_migrations`). */
export const MIGRATIONS_TABLE = '"drizzle"."__drizzle_migrations"';

/** Erros do Postgres que significam "a tabela/esquema de controle ainda não existe" (banco novo). */
const MISSING_CODES = new Set(['42P01', '3F000']);

function countPending(lastApplied: number | null): number {
  const stamps = migrationStamps();
  if (lastApplied === null) return stamps.length;
  return stamps.filter((w) => w > lastApplied).length;
}

/** Chave da trava que impede duas instâncias de migrarem ao mesmo tempo. */
const MIGRATE_LOCK_SQL = "select pg_advisory_lock(hashtext('ludraw:migrate'))";
const MIGRATE_UNLOCK_SQL = "select pg_advisory_unlock(hashtext('ludraw:migrate'))";

/**
 * Chat 09 · R1: aplica as migrações pendentes com o papel de migração. Conexão própria, fechada no fim; sem
 * `statement_timeout` (uma migração pode demorar). Duas instâncias ao mesmo tempo: a segunda espera a trava e
 * encontra tudo aplicado. Devolve quantas foram aplicadas agora.
 */
export async function migrateDatabase(url: string): Promise<{ applied: number }> {
  if (url.startsWith('pglite://')) throw new Error('migrateDatabase is for PostgreSQL; the embedded test database migrates when opened');
  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const lock = await pool.connect();
  try {
    await lock.query(MIGRATE_LOCK_SQL);
    const before = await pendingOn(pool);
    await migrate(drizzle(pool, { schema }), { migrationsFolder: migrationsFolder() });
    const after = await pendingOn(pool);
    return { applied: before - after };
  } finally {
    await lock.query(MIGRATE_UNLOCK_SQL).catch(() => undefined);
    lock.release();
    await pool.end();
  }
}

type Queryable = { query(sql: string): Promise<{ rows: Record<string, unknown>[] }> };

async function pendingOn(client: Queryable): Promise<number> {
  try {
    // Chat 09 · R3: banco novo sem a tabela de controle → tudo pendente, sem deixar um ERROR no log do Postgres
    const exists = await client.query(`select to_regclass('${MIGRATIONS_TABLE}') is not null as present`);
    if (exists.rows[0]?.present !== true) return countPending(null);
    const r = await client.query(`select max(created_at) as last from ${MIGRATIONS_TABLE}`);
    const last = r.rows[0]?.last;
    return countPending(last === null || last === undefined ? null : Number(last));
  } catch (err) {
    if (MISSING_CODES.has((err as { code?: string }).code ?? '')) return countPending(null);
    if ((err as { code?: string }).code === '42501') {
      throw new Error(`The application database user cannot read ${MIGRATIONS_TABLE}. Grant it SELECT (see "npm run db:roles" / docs) or check DATABASE_URL.`);
    }
    throw err;
  }
}

export async function openDatabase(url: string, options: OpenOptions = {}): Promise<Database> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    return {
      db: db as unknown as Db,
      kind: 'pglite',
      close: async () => {
        await client.close();
      },
      ping: async () => {
        await client.query('select 1');
        return true;
      },
      pendingMigrations: async () => 0,
      // banco embutido: um processo só
      runExclusive: async (_task, fn) => {
        await fn();
        return true;
      },
    };
  }
  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const statementTimeout = options.statementTimeoutMs ?? DB_DEFAULTS.statementTimeoutMs;
  const idleInTx = options.idleInTransactionTimeoutMs ?? DB_DEFAULTS.idleInTransactionTimeoutMs;
  const pool = new pg.Pool({
    connectionString: url,
    max: options.poolMax ?? DB_DEFAULTS.poolMax,
    // parâmetros de início de sessão (o node-postgres não manda quando o valor é 0)
    statement_timeout: statementTimeout > 0 ? statementTimeout : undefined,
    idle_in_transaction_session_timeout: idleInTx > 0 ? idleInTx : undefined,
  });
  // conexão ociosa que cai (reinício do banco, transação parada encerrada pelo servidor) não derruba o processo
  // Chat 09 · R1: o pool só escuta erros das conexões OCIOSAS; uma conexão EMPRESTADA (transação em andamento) cujo
  // servidor encerra a sessão (idle_in_transaction_session_timeout, reinício do banco) emitiria 'error' sem ouvinte e
  // derrubaria o processo. Ouvinte permanente em toda conexão; o do pool fica mudo para não registrar duas vezes.
  pool.on('connect', (client) => {
    client.on('error', (err) => options.onPoolError?.(err));
  });
  pool.on('error', () => undefined);
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    kind: 'postgres',
    close: async () => {
      await pool.end();
    },
    ping: async () => {
      const r = await pool.query('select 1 as ok');
      return r.rows[0]?.ok === 1;
    },
    pendingMigrations: () => pendingOn(pool),
    runExclusive: async (task, fn) => {
      const conn = await pool.connect();
      try {
        const r = await conn.query('select pg_try_advisory_lock(hashtext($1)) as ok', [`ludraw:${task}`]);
        if (r.rows[0]?.ok !== true) return false;
        try {
          await fn();
        } finally {
          await conn.query('select pg_advisory_unlock(hashtext($1))', [`ludraw:${task}`]).catch(() => undefined);
        }
        return true;
      } finally {
        conn.release();
      }
    },
  };
}
