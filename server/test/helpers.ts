/**
 * LuDraw server — utilitários dos testes (Chat 07).
 *
 * Por padrão cada teste usa um PostgreSQL embutido novo (PGlite, em memória). Com TEST_DATABASE_URL
 * (um Postgres DESCARTÁVEL — nunca o de desenvolvimento), o MESMO teste roda no Postgres real: o esquema é
 * apagado e recriado antes de cada teste. Nunca aponte TEST_DATABASE_URL para um banco com dados.
 *
 * Chat 09 · R1 (S-37): no Postgres, TEST_DATABASE_URL é o ADMINISTRADOR do banco descartável. Os testes criam os
 * papéis `ludraw_owner`/`ludraw_migrator`/`ludraw_app` (src/db/roles.ts), migram com o migrador e rodam a
 * APLICAÇÃO com `ludraw_app` (sem CREATE). `TEST_DB_ROLES=off` volta ao usuário único.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, FastifyServerOptions, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createLimiters, type AppContext } from '../src/context';
import { migrateDatabase, openDatabase, type Database } from '../src/db/client';
import { clusterRolesSql, DEFAULT_ROLES, schemaGrantsSql } from '../src/db/roles';
import { loadServerKeys } from '../src/lib/secrets';
import { MemoryMailer } from '../src/mail/memory';
import { issueSetupToken } from '../src/setup/boot';
import { readSetup } from '../src/setup/provision';
import { CLIENT_HEADER, CLIENT_HEADER_VALUE, REFRESH_COOKIE } from '../../src/utils/apiContract';

const RAW_TEST_URL = process.env.TEST_DATABASE_URL ?? null;
export const ON_POSTGRES = !!RAW_TEST_URL && RAW_TEST_URL.startsWith('postgres');
/** Chat 09 · R1: aplicação no papel sem DDL (padrão no Postgres). */
export const WITH_ROLES = ON_POSTGRES && process.env.TEST_DB_ROLES !== 'off';
// senha dos papéis de TESTE (banco descartável); o run-tests.mjs passa uma só para todos os processos
const ROLE_PASSWORD = process.env.TEST_DB_ROLE_PASSWORD ?? randomBytes(18).toString('hex');

function withUser(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

/** URL do administrador do banco descartável (só Postgres). */
export const TEST_ADMIN_URL = ON_POSTGRES ? (RAW_TEST_URL as string) : null;
/** URL que a APLICAÇÃO usa nos testes (no Postgres com papéis: ludraw_app). */
export const TEST_DB_URL = !ON_POSTGRES ? 'pglite://memory' : WITH_ROLES ? withUser(RAW_TEST_URL as string, DEFAULT_ROLES.app, ROLE_PASSWORD) : (RAW_TEST_URL as string);
/** URL das migrações nos testes (no Postgres com papéis: ludraw_migrator). */
export const TEST_MIGRATE_URL = !ON_POSTGRES ? null : WITH_ROLES ? withUser(RAW_TEST_URL as string, DEFAULT_ROLES.migrator, ROLE_PASSWORD) : (RAW_TEST_URL as string);

export const STRONG_PASSWORD = 'Quadro-Verde-2026!';
export const SETUP_TOKEN = 'TESTTOKEN-ABCDEFGHJKLMNPQRS';

let rolesReady = false;

/** Cria (uma vez por processo) os papéis de teste e define a senha. Só no Postgres descartável. */
export async function ensureTestRoles(): Promise<void> {
  if (!WITH_ROLES || rolesReady) return;
  const admin = TEST_ADMIN_URL as string;
  const dbName = decodeURIComponent(new URL(admin).pathname.replace(/^\//, ''));
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  try {
    await client.query(clusterRolesSql(dbName));
    // senha hexadecimal gerada aqui (sem aspas possíveis)
    await client.query(`ALTER ROLE ${DEFAULT_ROLES.migrator} PASSWORD '${ROLE_PASSWORD}'`);
    await client.query(`ALTER ROLE ${DEFAULT_ROLES.app} PASSWORD '${ROLE_PASSWORD}'`);
  } finally {
    await client.end();
  }
  rolesReady = true;
}

/** Apaga e recria os esquemas (como administrador), refaz as permissões e aplica as migrações (como migrador). */
export async function resetPostgres(options: { migrate?: boolean } = {}): Promise<void> {
  await ensureTestRoles();
  const client = new pg.Client({ connectionString: TEST_ADMIN_URL as string });
  await client.connect();
  try {
    await client.query('drop schema if exists drizzle cascade; drop schema public cascade; create schema public;');
    if (WITH_ROLES) await client.query(schemaGrantsSql());
  } finally {
    await client.end();
  }
  if (options.migrate !== false) await migrateDatabase(TEST_MIGRATE_URL as string);
}

/**
 * Chat 09 · R1: testes que simulam um esquema ANTIGO (desfazem e reaplicam uma migração) precisam de DDL, que a
 * aplicação não tem mais no Postgres. Esta conexão é a do papel de migração (no PGlite, o próprio banco do teste),
 * exatamente como uma migração de verdade roda.
 */
export async function withSchemaOwner<T>(server: TestServer, fn: (db: TestServer['ctx']['db']) => Promise<T>): Promise<T> {
  if (!WITH_ROLES) return fn(server.ctx.db);
  const owner = await openDatabase(TEST_MIGRATE_URL as string, { statementTimeoutMs: 0, poolMax: 1 });
  try {
    return await fn(owner.db);
  } finally {
    await owner.close();
  }
}

export interface TestServer {
  app: FastifyInstance;
  ctx: AppContext;
  database: Database;
  close(): Promise<void>;
}

export async function startServer(env: Record<string, string> = {}, extra?: (app: FastifyInstance, ctx: AppContext) => void, logger: FastifyServerOptions['logger'] = false): Promise<TestServer> {
  if (ON_POSTGRES) await resetPostgres();
  // Chat 08.2: cada servidor de teste tem a própria pasta de imagens (apagada ao fechar)
  const assetsDir = env.LUDRAW_ASSETS_DIR ? null : mkdtempSync(join(tmpdir(), 'ludraw-assets-'));
  const config = loadConfig({ DATABASE_URL: TEST_DB_URL, NODE_ENV: 'test', LUDRAW_CORS_ORIGINS: 'http://localhost:5173', ...(assetsDir ? { LUDRAW_ASSETS_DIR: assetsDir } : {}), ...env });
  const database = await openDatabase(config.databaseUrl, {
    statementTimeoutMs: config.database.statementTimeoutMs,
    idleInTransactionTimeoutMs: config.database.idleInTransactionTimeoutMs,
    poolMax: config.database.poolMax,
  });
  const keys = await loadServerKeys(database.db, config.jwtSecret);
  const ctx: AppContext = { config, db: database.db, keys, limiters: createLimiters(config.mailEnv), version: '0.0.0-test' };
  const { app } = await buildApp(ctx, logger);
  extra?.(app, ctx);
  await app.ready();
  return {
    app,
    ctx,
    database,
    close: async () => {
      await app.close();
      await database.close();
      if (assetsDir) rmSync(assetsDir, { recursive: true, force: true });
    },
  };
}

export function refreshCookieOf(res: LightMyRequestResponse): string | null {
  const c = res.cookies.find((x) => x.name === REFRESH_COOKIE);
  return c && c.value ? c.value : null;
}

export const clientHeaders = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export function json<T = any>(res: LightMyRequestResponse): T {
  return JSON.parse(res.body) as T;
}

/** Conclui o primeiro acesso pelo assistente e devolve o resultado do login do admin. */
export async function completeSetup(app: FastifyInstance, overrides: Partial<{ email: string; name: string; password: string; domains: string[]; mode: string; orgName: string }> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/setup/complete',
    payload: {
      token: SETUP_TOKEN,
      mode: overrides.mode ?? 'single_org',
      organization: { name: overrides.orgName ?? 'Empresa Exemplo', allowedEmailDomains: overrides.domains ?? [] },
      admin: { name: overrides.name ?? 'Ana Admin', email: overrides.email ?? 'ana@example.com', password: overrides.password ?? STRONG_PASSWORD },
    },
  });
  return res;
}

/** Deixa o servidor com o setup pendente e o token de teste conhecido. */
export async function issueTestSetupToken(server: TestServer): Promise<void> {
  await readSetup(server.ctx.db);
  await issueSetupToken(server.ctx.db, SETUP_TOKEN);
}

/** Servidor já configurado pelo assistente, com o admin logado. */
export async function startConfigured(env: Record<string, string> = {}, extra?: (app: FastifyInstance, ctx: AppContext) => void, logger: FastifyServerOptions['logger'] = false) {
  const server = await startServer(env, extra, logger);
  await issueTestSetupToken(server);
  const res = await completeSetup(server.app);
  if (res.statusCode !== 200) throw new Error(`setup failed: ${res.statusCode} ${res.body}`);
  const auth = json(res) as { accessToken: string; user: { id: string; organizationId: string } };
  return { server, admin: auth, adminCookie: refreshCookieOf(res)! };
}

/** Chat 08.5: servidor configurado, com e-mail ligado e um carteiro em memória no lugar do SMTP. */
export const MAIL_ENV = { LUDRAW_SMTP_HOST: 'smtp.example.com', LUDRAW_SMTP_FROM: 'LuDraw <no-reply@example.com>', LUDRAW_APP_URL: 'https://draw.example.com' };

export async function startWithMail(env: Record<string, string> = {}, extra?: (app: FastifyInstance, ctx: AppContext) => void) {
  const started = await startConfigured({ ...MAIL_ENV, ...env }, extra);
  const mailer = new MemoryMailer();
  started.server.ctx.mailer = mailer;
  /** espera o que a rota deixou para depois da resposta (busca da conta, token, envio) */
  const flush = () => started.server.ctx.later!.flush();
  return { ...started, mailer, flush };
}

/* ------------------------------ A-2: chamadas da API ------------------------------ */

export interface Person {
  token: string;
  id: string;
}

export function api(app: FastifyInstance, who: Person | string) {
  const token = typeof who === 'string' ? who : who.token;
  const headers = (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });
  return {
    get: (url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: headers() }),
    post: (url: string, payload?: unknown) => app.inject({ method: 'POST', url: `/api/v1${url}`, headers: headers(), payload: payload as never }),
    patch: (url: string, payload: unknown) => app.inject({ method: 'PATCH', url: `/api/v1${url}`, headers: headers(), payload: payload as never }),
    put: (url: string, payload: unknown, revision?: number) =>
      app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: headers(revision === undefined ? {} : { 'if-match': `"${revision}"` }), payload: payload as never }),
    del: (url: string) => app.inject({ method: 'DELETE', url: `/api/v1${url}`, headers: headers() }),
    op: (op: unknown, password?: string | null) => app.inject({ method: 'POST', url: '/api/v1/workspace/ops', headers: headers(), payload: (password === undefined ? { op } : { op, password }) as never }),
    state: async () => json((await app.inject({ method: 'GET', url: '/api/v1/workspace/state', headers: headers() })) as never),
  };
}

/**
 * Chat 08.7 · R5 (S-17): o banco guarda só o hash do token do link público. Quem cria vê o token na resposta da
 * criação (é o que a tela mostra uma vez); os testes pegam o token dali, não do banco.
 */
export function linkTokenOf(res: LightMyRequestResponse, boardId: string): { token: string } {
  const st = json(res) as { state?: { boards?: Array<{ id: string; publicLink?: { token?: string } }> } };
  const token = st.state?.boards?.find((b) => b.id === boardId)?.publicLink?.token;
  if (!token) throw new Error(`link token not in the response: ${res.statusCode} ${res.body.slice(0, 200)}`);
  return { token };
}

/** Convida e aceita (cria a conta e já entra). */
export async function invitePerson(
  app: FastifyInstance,
  inviter: Person | string,
  input: { email: string; name?: string; role?: 'admin' | 'member' | 'guest_b2b'; boardId?: string; projectId?: string; boardRole?: 'editor' | 'commenter' | 'viewer'; teamIds?: string[]; password?: string; sendEmail?: boolean },
): Promise<Person> {
  const created = await api(app, inviter).op({
    type: 'createInvitation',
    // Chat 08.5 · B: com e-mail ligado o convite sairia por e-mail; nos testes, só quando pedido
    input: { email: input.email, role: input.role ?? 'member', expiresInDays: 7, sendEmail: input.sendEmail ?? false, ...(input.boardId ? { boardId: input.boardId } : {}), ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.boardRole ? { boardRole: input.boardRole } : {}), ...(input.teamIds ? { teamIds: input.teamIds } : {}) },
  });
  if (created.statusCode !== 200) throw new Error(`invite failed: ${created.statusCode} ${created.body}`);
  const token = json(created).token as string;
  const accepted = await app.inject({ method: 'POST', url: `/api/v1/invitations/${token}/accept`, payload: { name: input.name ?? 'Pessoa Teste', email: input.email, password: input.password ?? STRONG_PASSWORD } });
  if (accepted.statusCode !== 200) throw new Error(`accept failed: ${accepted.statusCode} ${accepted.body}`);
  const auth = json(accepted);
  return { token: auth.accessToken, id: auth.user.id };
}

/** Board mínimo válido (formato BoardData v1). */
export function emptyBoard(elements: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    elements,
    elementOrder: Object.keys(elements),
    gridSettings: { type: 'dots', size: 20, snap: false },
    backgroundColor: null,
    initialView: null,
    activityLog: [],
    facilitation: { privateMode: { enabled: false, previewOwnNotes: false } },
  };
}

export function sticky(id: string, text: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: 'sticky', x: 0, y: 0, width: 200, height: 200, rotation: 0, zIndex: 1, createdAt: 1, updatedAt: 1, text, color: '#FBED7C', tags: [], reactions: {}, ...extra };
}

export async function createBoard(app: FastifyInstance, who: Person | string, input: { name?: string; place?: unknown; data?: unknown } = {}): Promise<{ id: string }> {
  const res = await api(app, who).post('/boards', { name: input.name ?? 'Quadro', place: input.place ?? { kind: 'workspace' }, data: input.data ?? emptyBoard() });
  if (res.statusCode !== 200) throw new Error(`create board failed: ${res.statusCode} ${res.body}`);
  return { id: json(res).board.id };
}
