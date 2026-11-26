/**
 * Bootstrap por variáveis e CLI de recuperação (WORKSPACE_ADMIN_SPEC §5, §6 e §9).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { count, eq } from 'drizzle-orm';
import { CliError, createAdmin, generatePassword, newSetupToken, resetPassword } from '../src/cli/commands';
import { loadConfig, readSecret } from '../src/config';
import { organizations, orgMemberships, sessions, users, workspaceAudit } from '../src/db/schema';
import { runBootSetup } from '../src/setup/boot';
import { checkPasswordStrength } from '../../src/utils/passwordPolicy';
import { bearer, json, ON_POSTGRES, startConfigured, startServer, STRONG_PASSWORD, TEST_DB_URL } from './helpers';

const BOOT_ENV = {
  DATABASE_URL: TEST_DB_URL,
  LUDRAW_ORG_NAME: 'Homelab da Ana',
  LUDRAW_ADMIN_EMAIL: 'Root@Example.com',
  LUDRAW_ADMIN_PASSWORD: 'Senha-Do-Env-2026',
  LUDRAW_ALLOWED_DOMAINS: 'example.com, @Sub.Example.org',
};

test('bootstrap por variáveis: cria org + admin com troca obrigatória, uma única vez', async () => {
  const s = await startServer();
  try {
    assert.equal(await runBootSetup(s.ctx.db, loadConfig(BOOT_ENV), s.app.log), 'bootstrapped');
    const [org] = await s.ctx.db.select().from(organizations);
    assert.equal(org.name, 'Homelab da Ana');
    assert.deepEqual(org.allowedEmailDomains, ['example.com', 'sub.example.org']);
    const [admin] = await s.ctx.db.select().from(users);
    assert.equal(admin.email, 'root@example.com');
    assert.equal(admin.mustChangePassword, true);
    assert.equal(admin.createdVia, 'env');
    const [audit] = await s.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'setup_completed'));
    assert.equal(audit.origin, 'env');

    // reinício com variáveis diferentes: nada muda
    const changed = loadConfig({ ...BOOT_ENV, LUDRAW_ORG_NAME: 'Outro Nome', LUDRAW_ADMIN_EMAIL: 'outro@example.com' });
    assert.equal(await runBootSetup(s.ctx.db, changed, s.app.log), 'completed');
    assert.equal((await s.ctx.db.select({ n: count() }).from(users))[0].n, 1);
    assert.equal((await s.ctx.db.select().from(organizations))[0].name, 'Homelab da Ana');

    // o admin do env entra, mas precisa trocar a senha
    const res = await s.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'root@example.com', password: 'Senha-Do-Env-2026' } });
    assert.equal(res.statusCode, 200);
    assert.equal(json(res).user.mustChangePassword, true);
    const info = json(await s.app.inject({ url: '/api/v1/info' }));
    assert.equal(info.setupRequired, false);
    assert.equal((await s.app.inject({ url: '/api/v1/setup/status' })).statusCode, 404);
  } finally {
    await s.close();
  }
});

test('bootstrap: banco já com dados é ignorado; variáveis incompletas caem no assistente; senha fraca recusa', async () => {
  const s = await startServer();
  try {
    await s.ctx.db.insert(users).values({ id: 'u1', email: 'x@example.com', name: 'X', avatarColor: '#194B32', createdVia: 'cli' });
    assert.equal(await runBootSetup(s.ctx.db, loadConfig(BOOT_ENV), s.app.log), 'bootstrap_skipped_not_empty');
    assert.equal((await s.ctx.db.select({ n: count() }).from(organizations))[0].n, 0);
  } finally {
    await s.close();
  }
  const s2 = await startServer();
  try {
    const partial = loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_ORG_NAME: 'Só o nome' });
    assert.deepEqual(partial.bootstrapIncomplete, ['LUDRAW_ORG_NAME']);
    const stdout = process.stdout as unknown as { write: (c: string) => boolean };
    const original = stdout.write;
    stdout.write = () => true;
    try {
      assert.equal(await runBootSetup(s2.ctx.db, partial, s2.app.log), 'token_issued');
    } finally {
      stdout.write = original;
    }
    await assert.rejects(runBootSetup(s2.ctx.db, loadConfig({ ...BOOT_ENV, LUDRAW_ADMIN_PASSWORD: 'fraca' }), s2.app.log), /Bootstrap rejected \(weakPassword/);
  } finally {
    await s2.close();
  }
});

test('LUDRAW_ADMIN_PASSWORD_FILE (Docker secrets) tem precedência e não aparece na configuração', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ludraw-secret-'));
  const file = join(dir, 'admin_password');
  writeFileSync(file, 'Senha-Do-Arquivo-2026\n');
  const cfg = loadConfig({ ...BOOT_ENV, LUDRAW_ADMIN_PASSWORD: 'ignorada', LUDRAW_ADMIN_PASSWORD_FILE: file });
  assert.equal(cfg.bootstrap?.adminPassword, 'Senha-Do-Arquivo-2026');
  assert.equal(readSecret({ X_FILE: file }, 'X'), 'Senha-Do-Arquivo-2026');
});

test('CLI admin:create — antes do setup recusa; cria admin novo; existente só com --promote', async () => {
  const s = await startServer();
  try {
    await assert.rejects(createAdmin(s.ctx.db, { email: 'novo@example.com', password: STRONG_PASSWORD }), CliError);
  } finally {
    await s.close();
  }
  const { server } = await startConfigured();
  try {
    const created = await createAdmin(server.ctx.db, { email: 'Bia@Example.com', name: 'Bia', password: 'Temporaria-Forte-1' });
    const [bia] = await server.ctx.db.select().from(users).where(eq(users.id, created.userId));
    assert.equal(bia.mustChangePassword, true);
    assert.equal(bia.createdVia, 'cli');
    const [m] = await server.ctx.db.select().from(orgMemberships).where(eq(orgMemberships.userId, created.userId));
    assert.equal(m.role, 'admin');
    const [audit] = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'admin_created_via_cli'));
    assert.equal(audit.origin, 'cli');
    assert.equal(audit.targetId, created.userId);

    await assert.rejects(createAdmin(server.ctx.db, { email: 'bia@example.com', password: STRONG_PASSWORD }), /already exists/);
    await server.ctx.db.update(orgMemberships).set({ role: 'member', status: 'suspended' }).where(eq(orgMemberships.userId, created.userId));
    const promoted = await createAdmin(server.ctx.db, { email: 'bia@example.com', password: '', promote: true });
    assert.equal(promoted.promoted, true);
    const [m2] = await server.ctx.db.select().from(orgMemberships).where(eq(orgMemberships.userId, created.userId));
    assert.equal(m2.role, 'admin');
    assert.equal(m2.status, 'active');
    await assert.rejects(createAdmin(server.ctx.db, { email: 'fraco@example.com', password: 'fraca' }), /Password rejected/);
  } finally {
    await server.close();
  }
});

test('CLI admin:reset-password — troca a senha, exige troca no login, derruba sessões e registra', async () => {
  const { server, admin } = await startConfigured();
  try {
    const res = await resetPassword(server.ctx.db, { email: 'ana@example.com', password: 'Recuperada-Forte-2' });
    assert.equal(res.sessionsEnded, 1);
    const me = await server.app.inject({ url: '/api/v1/auth/me', headers: bearer(admin.accessToken) });
    assert.equal(me.statusCode, 401, 'a sessão antiga caiu');
    const login = await server.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'ana@example.com', password: 'Recuperada-Forte-2' } });
    assert.equal(login.statusCode, 200);
    assert.equal(json(login).user.mustChangePassword, true);
    const actions = (await server.ctx.db.select().from(workspaceAudit)).filter((a) => a.origin === 'cli').map((a) => a.action);
    assert.deepEqual(actions.sort(), ['password_reset_via_cli', 'sessions_revoked']);
    await assert.rejects(resetPassword(server.ctx.db, { email: 'ninguem@example.com', password: STRONG_PASSWORD }), /No account/);
  } finally {
    await server.close();
  }
});

test('CLI setup:token — só com setup pendente; o token novo substitui o anterior', async () => {
  const s = await startServer();
  try {
    const first = await newSetupToken(s.ctx.db);
    const second = await newSetupToken(s.ctx.db);
    assert.notEqual(first, second);
    assert.equal((await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: first } })).statusCode, 403);
    assert.equal((await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: second } })).statusCode, 200);
  } finally {
    await s.close();
  }
  const { server } = await startConfigured();
  try {
    await assert.rejects(newSetupToken(server.ctx.db), /already configured/);
  } finally {
    await server.close();
  }
});

test('senha gerada pela CLI sempre passa na regra', () => {
  for (let i = 0; i < 50; i++) assert.equal(checkPasswordStrength(generatePassword(), { email: 'a@example.com', name: 'Ana' }), null);
});

test('CLI de verdade (processo): senha por argumento é recusada; reset por --password-stdin funciona', { skip: !ON_POSTGRES && 'só com TEST_DATABASE_URL (Postgres compartilhado entre processos)' }, async () => {
  const { server } = await startConfigured();
  try {
    const env = { ...process.env, DATABASE_URL: TEST_DB_URL };
    const run = (args: string[], input?: string) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { env, input, encoding: 'utf8', cwd: new URL('..', import.meta.url) });
    const refused = run(['admin:reset-password', '--email', 'ana@example.com', '--password', 'x']);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /not allowed/);
    const ok = run(['admin:reset-password', '--email', 'ana@example.com', '--password-stdin'], 'Pelo-Stdin-Forte-3\n');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Password reset for ana@example.com/);
    assert.doesNotMatch(ok.stdout + ok.stderr, /Pelo-Stdin-Forte-3/, 'a senha nunca é impressa');
    const gen = run(['admin:create', '--email', 'gen@example.com', '--name', 'Gen Teste', '--generate']);
    assert.equal(gen.status, 0, gen.stderr);
    const temp = /Temporary password \(shown only now\): (\S+)/.exec(gen.stdout)?.[1];
    assert.ok(temp);
    const login = await server.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'gen@example.com', password: temp } });
    assert.equal(login.statusCode, 200);
    const all = await server.ctx.db.select().from(sessions);
    assert.ok(all.length >= 1);
  } finally {
    await server.close();
  }
});
