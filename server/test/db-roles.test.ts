/**
 * Chat 09 · R1 (S-37, S-20, S-15) — papéis do banco, migração fora do boot e tempos limite.
 *
 * Parte 1 (sempre, PGlite): configuração, SQL dos papéis e CLI `db:roles`.
 * Parte 2 (só com TEST_DATABASE_URL de um Postgres DESCARTÁVEL e os papéis ligados): a aplicação roda como
 * `ludraw_app` e NÃO consegue mudar o esquema; o migrador cria tudo como `ludraw_owner`; `statement_timeout`
 * do pool e do papel; resposta genérica no HTTP; boot recusa migração pendente; duas migrações ao mesmo tempo.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { DB_DEFAULTS, loadConfig } from '../src/config';
import { prepareDatabase } from '../src/db/boot';
import { migrateDatabase, migrationStamps, openDatabase } from '../src/db/client';
import { clusterRolesSql, ident, INIT_SCRIPT_PATH, initScriptSql, schemaGrantsSql } from '../src/db/roles';
import { json, resetPostgres, startConfigured, TEST_ADMIN_URL, TEST_DB_URL, TEST_MIGRATE_URL, WITH_ROLES } from './helpers';

const PG_ONLY = { skip: !WITH_ROLES && 'só com TEST_DATABASE_URL (Postgres descartável) e os papéis ligados' };
const BASE = { DATABASE_URL: 'pglite://memory' };

// ───────────────────────── Parte 1 — sempre ─────────────────────────

test('R1: padrões — migra no boot fora de produção, NÃO em produção; tempos 15 s / 30 s', () => {
  const dev = loadConfig(BASE).database;
  assert.equal(dev.migrateOnBoot, true);
  assert.equal(dev.migrateUrl, null);
  assert.equal(dev.statementTimeoutMs, DB_DEFAULTS.statementTimeoutMs);
  assert.equal(dev.statementTimeoutMs, 15_000);
  assert.equal(dev.idleInTransactionTimeoutMs, 30_000);
  assert.equal(dev.poolMax, 10);
  const prod = loadConfig({ ...BASE, NODE_ENV: 'production', LUDRAW_PUBLIC_URL: 'https://draw.example.com' });
  assert.equal(prod.database.migrateOnBoot, false);
  assert.ok(!prod.warnings.some((w) => /MIGRATE_ON_BOOT/.test(w)));
});

test('R1: produção com migração no boot e sem papel de migração = aviso; variáveis e _FILE', () => {
  const prod = loadConfig({ ...BASE, NODE_ENV: 'production', LUDRAW_PUBLIC_URL: 'https://draw.example.com', LUDRAW_MIGRATE_ON_BOOT: 'true' });
  assert.equal(prod.database.migrateOnBoot, true);
  assert.ok(prod.warnings.some((w) => /LUDRAW_MIGRATE_ON_BOOT=true without LUDRAW_MIGRATE_DATABASE_URL/.test(w)));
  const dir = mkdtempSync(join(tmpdir(), 'ludraw-r1-'));
  try {
    const file = join(dir, 'migrate-url');
    writeFileSync(file, 'postgres://ludraw_migrator:x@db:5432/ludraw\n');
    const withFile = loadConfig({ ...BASE, NODE_ENV: 'production', LUDRAW_PUBLIC_URL: 'https://draw.example.com', LUDRAW_MIGRATE_ON_BOOT: 'true', LUDRAW_MIGRATE_DATABASE_URL_FILE: file });
    assert.equal(withFile.database.migrateUrl, 'postgres://ludraw_migrator:x@db:5432/ludraw');
    assert.ok(!withFile.warnings.some((w) => /MIGRATE_ON_BOOT/.test(w)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const tuned = loadConfig({ ...BASE, LUDRAW_DB_STATEMENT_TIMEOUT_MS: '0', LUDRAW_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '5000', LUDRAW_DB_POOL_MAX: '4', LUDRAW_MIGRATE_ON_BOOT: 'off' }).database;
  assert.deepEqual([tuned.statementTimeoutMs, tuned.idleInTransactionTimeoutMs, tuned.poolMax, tuned.migrateOnBoot], [0, 5000, 4, false]);
  assert.throws(() => loadConfig({ ...BASE, LUDRAW_MIGRATE_DATABASE_URL: 'mysql://x' }), /must be a postgres:\/\/ URL/);
  assert.throws(() => loadConfig({ ...BASE, LUDRAW_DB_POOL_MAX: '0' }), /at least 1/);
  assert.throws(() => loadConfig({ ...BASE, LUDRAW_DB_STATEMENT_TIMEOUT_MS: '-1' }), /non-negative integer/);
});

test('R3: deploy/postgres — o SQL da primeira subida do contêiner é o que roles.ts monta; senhas só pelos secrets (LF)', () => {
  const root = new URL('../../', import.meta.url);
  const file = readFileSync(new URL(INIT_SCRIPT_PATH, root), 'utf8');
  assert.equal(file.replace(/\r\n/g, '\n'), initScriptSql('ludraw'), `rode: npm --prefix server run db:roles -- --database ludraw --init-script > ${INIT_SCRIPT_PATH}`);
  assert.doesNotMatch(file, /PASSWORD/i);
  const sh = readFileSync(new URL('deploy/postgres/20-ludraw-passwords.sh', root), 'utf8');
  assert.ok(!sh.includes('\r'), 'o script do contêiner precisa de fim de linha LF');
  // a senha é lida pelo próprio psql (\set com crase), nunca por argumento ou variável de ambiente
  assert.match(sh, /\\set app_password `cat \/run\/secrets\/db_app_password`/);
  assert.match(sh, /ALTER ROLE ludraw_app PASSWORD :'app_password';/);
  assert.doesNotMatch(sh, /PGPASSWORD|-v\s+\w*password|export\s+\w*PASSWORD/i);
  const cli = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'db:roles', '--database', 'ludraw', '--init-script'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, initScriptSql('ludraw'));
});

test('R1: SQL dos papéis — dono sem login, app sem CREATE/TRUNCATE, nenhuma senha, nomes conferidos', () => {
  const cluster = clusterRolesSql('ludraw');
  const grants = schemaGrantsSql();
  assert.match(cluster, /CREATE ROLE "ludraw_owner" NOLOGIN/);
  assert.match(cluster, /ALTER ROLE "ludraw_migrator" SET role = 'ludraw_owner'/);
  assert.match(cluster, /ALTER ROLE "ludraw_app" SET statement_timeout = 15000/);
  assert.match(cluster, /ALTER ROLE "ludraw_app" SET idle_in_transaction_session_timeout = 30000/);
  assert.match(cluster, /REVOKE ALL ON DATABASE "ludraw" FROM PUBLIC/);
  assert.doesNotMatch(cluster + grants, /PASSWORD/i, 'senha nunca no SQL gerado');
  // a única permissão de esquema do app é USAGE; nada de CREATE nem TRUNCATE
  for (const line of (cluster + grants).split('\n').filter((l) => l.includes('"ludraw_app"') && /^\s*GRANT/.test(l))) {
    assert.doesNotMatch(line, /\bCREATE\b|\bTRUNCATE\b|\bALL PRIVILEGES\b/, line);
  }
  assert.throws(() => ident('x"; drop table users; --'), /Invalid/);
  assert.throws(() => clusterRolesSql('Ludraw'), /Invalid/);
});

test('R1: CLI db:roles imprime o SQL sem conectar em banco nenhum', () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_URL_FILE;
  const res = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'db:roles', '--database', 'ludraw'], { env, encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /CREATE ROLE "ludraw_app" LOGIN/);
  assert.match(res.stdout, /\\password ludraw_app/);
  const missing = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'db:roles'], { env, encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--database/);
});

test('R1: PGlite (só testes) continua migrando ao abrir e não tem pendência', async () => {
  const db = await openDatabase('pglite://memory');
  try {
    assert.equal(await db.pendingMigrations(), 0);
  } finally {
    await db.close();
  }
});

// ───────────────────────── Parte 2 — Postgres descartável com papéis ─────────────────────────

async function asUrl<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code ?? 'sem-código';
  }
  return 'sem-erro';
}

test('R1 · S-37: a aplicação (ludraw_app) faz DML mas NÃO muda o esquema', PG_ONLY, async () => {
  const { server } = await startConfigured();
  try {
    // o app inteiro subiu e configurou com o papel sem DDL
    assert.equal(json((await server.app.inject({ method: 'GET', url: '/api/v1/info' }))).setupRequired, false);
    await asUrl(TEST_DB_URL, async (c) => {
      assert.equal((await c.query('select current_user as u')).rows[0].u, 'ludraw_app');
      assert.ok(Number((await c.query('select count(*)::int as n from users')).rows[0].n) >= 1);
      assert.equal(await pgError(c.query('create table intruso (x int)')), '42501');
      assert.equal(await pgError(c.query('create schema intruso')), '42501');
      assert.equal(await pgError(c.query('alter table users add column intruso int')), '42501');
      assert.equal(await pgError(c.query('drop table users')), '42501');
      assert.equal(await pgError(c.query('truncate users')), '42501');
      assert.equal(await pgError(c.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', 1)")), '42501');
      assert.equal(await pgError(c.query('create temp table intruso (x int)')), '42501');
      // lê a tabela de controle (o boot confere pendências)
      assert.ok(Number((await c.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n) > 0);
    });
  } finally {
    await server.close();
  }
});

test('R1 · S-37: o migrador age como ludraw_owner; todas as tabelas pertencem ao dono; tempos do papel', PG_ONLY, async () => {
  await resetPostgres();
  await asUrl(TEST_MIGRATE_URL as string, async (c) => {
    const r = (await c.query('select session_user as s, current_user as u')).rows[0];
    assert.deepEqual([r.s, r.u], ['ludraw_migrator', 'ludraw_owner']);
    assert.equal((await c.query('show statement_timeout')).rows[0].statement_timeout, '0');
  });
  await asUrl(TEST_ADMIN_URL as string, async (c) => {
    const owners = (await c.query("select distinct tableowner as o from pg_tables where schemaname in ('public','drizzle')")).rows.map((x) => x.o);
    assert.deepEqual(owners, ['ludraw_owner']);
  });
  // conexão crua do app, sem parâmetros: valem os padrões do PAPEL
  await asUrl(TEST_DB_URL, async (c) => {
    assert.equal((await c.query('show statement_timeout')).rows[0].statement_timeout, '15s');
    assert.equal((await c.query('show idle_in_transaction_session_timeout')).rows[0].idle_in_transaction_session_timeout, '30s');
  });
});

test('R1 · S-20: statement_timeout do pool corta a consulta lenta; HTTP responde genérico, sem SQL', PG_ONLY, async () => {
  await resetPostgres();
  const db = await openDatabase(TEST_DB_URL, { statementTimeoutMs: 200 });
  try {
    const t0 = Date.now();
    assert.equal(await pgError(db.db.execute(sql`select pg_sleep(2)`)), '57014');
    assert.ok(Date.now() - t0 < 1500, 'cortou antes dos 2 s');
    assert.equal(await db.ping(), true, 'o pool continua usável');
  } finally {
    await db.close();
  }
  const { server } = await startConfigured({ LUDRAW_DB_STATEMENT_TIMEOUT_MS: '200' }, (app, ctx) => {
    app.get('/api/v1/__r1/slow', async () => {
      await ctx.db.execute(sql`select pg_sleep(2)`);
      return { ok: true };
    });
  });
  try {
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/__r1/slow' });
    assert.equal(res.statusCode, 500);
    assert.equal(json(res).error.code, 'internal');
    assert.doesNotMatch(res.body, /pg_sleep|statement|select|canceling/i);
  } finally {
    await server.close();
  }
});

test('R1 · S-20: transação parada é encerrada pelo banco e o processo continua', PG_ONLY, async () => {
  await resetPostgres();
  const dropped: string[] = [];
  const db = await openDatabase(TEST_DB_URL, { idleInTransactionTimeoutMs: 200, onPoolError: (e) => dropped.push(e.message) });
  try {
    const outcome = await pgError(
      db.db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        await new Promise((r) => setTimeout(r, 700));
        await tx.execute(sql`select 1`);
      }),
    );
    assert.notEqual(outcome, 'sem-erro', 'a transação parada não pode continuar');
    assert.equal(await db.ping(), true, 'o pool abre outra conexão');
  } finally {
    await db.close();
  }
});

const BOOT_OFF = { migrateUrl: null, migrateOnBoot: false, statementTimeoutMs: 15_000, idleInTransactionTimeoutMs: 30_000, poolMax: 2 };

test('R1 · S-37: boot com migração pendente e sem migração no boot NÃO sobe; com ela, migra pelo papel de migração', PG_ONLY, async () => {
  const total = migrationStamps().length;
  await resetPostgres({ migrate: false });
  await assert.rejects(prepareDatabase({ databaseUrl: TEST_DB_URL, database: BOOT_OFF }), new RegExp(`${total} pending migration\\(s\\)`));
  // a aplicação sozinha não consegue migrar (sem CREATE): o caminho certo é o papel de migração
  await assert.rejects(migrateDatabase(TEST_DB_URL));
  const first = await prepareDatabase({ databaseUrl: TEST_DB_URL, database: { ...BOOT_OFF, migrateOnBoot: true, migrateUrl: TEST_MIGRATE_URL } });
  assert.equal(first.migratedNow, total);
  await first.database.close();
  const again = await prepareDatabase({ databaseUrl: TEST_DB_URL, database: BOOT_OFF });
  assert.equal(again.migratedNow, 0);
  await again.database.close();
  // uma migração "nova" no repositório (simulada: o banco perde o registro da última) → 1 pendente
  await asUrl(TEST_ADMIN_URL as string, (c) => c.query('delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)'));
  await assert.rejects(prepareDatabase({ databaseUrl: TEST_DB_URL, database: BOOT_OFF }), /1 pending migration\(s\)/);
});

test('R1: duas instâncias migrando ao mesmo tempo — uma espera a outra, nada aplicado duas vezes', PG_ONLY, async () => {
  const total = migrationStamps().length;
  await resetPostgres({ migrate: false });
  const [a, b] = await Promise.all([migrateDatabase(TEST_MIGRATE_URL as string), migrateDatabase(TEST_MIGRATE_URL as string)]);
  assert.equal(a.applied + b.applied, total);
  await asUrl(TEST_ADMIN_URL as string, async (c) => {
    assert.equal(Number((await c.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n), total);
  });
});

test('R1: erro de boot/CLI mostra o SQL e o motivo do banco, nunca os parâmetros', async () => {
  const { describeBootError } = await import('../src/lib/errors');
  const cause = Object.assign(new Error('permission denied for database r1'), { code: '42501' });
  const wrapped = Object.assign(new Error('Failed query: insert into users (email) values ($1)\nparams: segredo@example.com'), { cause });
  const text = describeBootError(wrapped);
  assert.match(text, /^Failed query: insert into users/);
  assert.match(text, /permission denied for database r1 \(42501\)/);
  assert.doesNotMatch(text, /segredo@example\.com|params/);
  assert.equal(describeBootError(new Error('linha 1\nlinha 2')), 'linha 1\nlinha 2', 'outras mensagens saem inteiras');
});
