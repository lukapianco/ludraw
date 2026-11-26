/**
 * Autenticação (Chat 07): login e Audit Log, limite de tentativas, cookie, rotação do refresh com janela
 * de tolerância entre abas, reuso, suspensão imediata, saída, troca de senha, proxy confiável, cookie Secure.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '../src/auth/authenticate';
import { loadConfig } from '../src/config';
import { orgMemberships, refreshTokens, sessions, users, workspaceAudit } from '../src/db/schema';
import { sha256Hex } from '../src/lib/crypto';
import { bearer, clientHeaders, json, refreshCookieOf, startConfigured, STRONG_PASSWORD, TEST_DB_URL } from './helpers';

const protectedRoute = (app: import('fastify').FastifyInstance, ctx: import('../src/context').AppContext) => {
  app.get('/api/v1/test/protected', { preHandler: requireAuth(ctx) }, async (req) => ({ userId: req.auth!.userId, ip: req.ip }));
};

const login = (app: import('fastify').FastifyInstance, email: string, password: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password }, headers });

const refresh = (app: import('fastify').FastifyInstance, cookie: string | null, headers: Record<string, string> = clientHeaders) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers, cookies: cookie ? { ld_rt: cookie } : {} });

test('login: senha errada → 401 genérico + login_failed; e-mail desconhecido não grava auditoria; certo → login + cookie', async () => {
  const { server } = await startConfigured();
  try {
    const wrong = await login(server.app, 'ana@example.com', 'errada');
    assert.equal(wrong.statusCode, 401);
    assert.equal(json(wrong).error.message.key, 'server.errors.invalidCredentials');
    const unknown = await login(server.app, 'ninguem@example.com', 'x');
    assert.equal(unknown.statusCode, 401);
    assert.deepEqual(json(unknown).error, json(wrong).error, 'mesma resposta para conta inexistente');
    const failed = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'login_failed'));
    assert.equal(failed.length, 1);
    assert.equal(failed[0].ip, '127.0.0.1');

    const ok = await login(server.app, 'ANA@example.com ', STRONG_PASSWORD);
    assert.equal(ok.statusCode, 200);
    const body = json(ok);
    assert.equal(body.user.email, 'ana@example.com');
    assert.equal(body.expiresIn, 600);
    assert.ok(refreshCookieOf(ok));
    const logins = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'login'));
    assert.equal(logins.length, 1);
    assert.deepEqual(logins[0].message, { key: 'workspace.audit.msg.login', params: { method: { key: 'server.audit.method.password' } } });
    const me = await server.app.inject({ url: '/api/v1/auth/me', headers: bearer(body.accessToken) });
    assert.equal(json(me).user.role, 'admin');
  } finally {
    await server.close();
  }
});

test('login: 8 erros pelo mesmo IP + e-mail bloqueiam por 15 min (429 com Retry-After)', async () => {
  const { server } = await startConfigured();
  try {
    for (let i = 0; i < 8; i++) assert.equal((await login(server.app, 'ana@example.com', `errada-${i}`)).statusCode, 401);
    const blocked = await login(server.app, 'ana@example.com', STRONG_PASSWORD);
    assert.equal(blocked.statusCode, 429, 'nem a senha certa passa durante o bloqueio');
    assert.ok(Number(blocked.headers['retry-after']) > 800);
    assert.equal(json(blocked).error.code, 'tooManyAttempts');
  } finally {
    await server.close();
  }
});

test('refresh: exige o cabeçalho do cliente e origem permitida; rotaciona o cookie', async () => {
  const { server, adminCookie } = await startConfigured();
  try {
    assert.equal((await refresh(server.app, adminCookie, {})).statusCode, 403, 'sem cabeçalho');
    assert.equal((await refresh(server.app, adminCookie, { ...clientHeaders, origin: 'https://evil.example.com' })).statusCode, 403, 'origem estranha');
    const ok = await refresh(server.app, adminCookie, { ...clientHeaders, origin: 'http://localhost:5173' });
    assert.equal(ok.statusCode, 200);
    const next = refreshCookieOf(ok);
    assert.ok(next && next !== adminCookie, 'cookie novo');
    assert.ok(json(ok).accessToken);
    assert.equal((await refresh(server.app, null)).statusCode, 401, 'sem cookie');
  } finally {
    await server.close();
  }
});

test('várias abas: duas renovações simultâneas com o mesmo token não derrubam a sessão e convergem', async () => {
  const { server, adminCookie } = await startConfigured();
  try {
    const [a, b] = await Promise.all([refresh(server.app, adminCookie), refresh(server.app, adminCookie)]);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    const ca = refreshCookieOf(a);
    const cb = refreshCookieOf(b);
    assert.equal(ca, cb, 'as duas abas recebem o mesmo sucessor');
    // terceira aba ainda com o token antigo, dentro da janela
    const late = await refresh(server.app, adminCookie);
    assert.equal(late.statusCode, 200);
    assert.equal(refreshCookieOf(late), ca);
    // o sucessor continua válido e a sessão não foi revogada
    const again = await refresh(server.app, ca);
    assert.equal(again.statusCode, 200);
    const all = await server.ctx.db.select().from(sessions);
    assert.equal(all.filter((s) => s.revokedAt).length, 0);
  } finally {
    await server.close();
  }
});

test('reuso do token antigo depois da janela derruba a sessão inteira', async () => {
  const { server, adminCookie } = await startConfigured();
  try {
    const first = await refresh(server.app, adminCookie);
    const current = refreshCookieOf(first)!;
    // envelhece a troca para fora da janela de 20 s
    await server.ctx.db
      .update(refreshTokens)
      .set({ replacedAt: new Date(Date.now() - 30_000) })
      .where(eq(refreshTokens.hash, sha256Hex(adminCookie)));
    const reuse = await refresh(server.app, adminCookie);
    assert.equal(reuse.statusCode, 401);
    const stillCurrent = await refresh(server.app, current);
    assert.equal(stillCurrent.statusCode, 401, 'a família inteira caiu');
    const [s] = await server.ctx.db.select().from(sessions);
    assert.equal(s.revokedReason, 'refresh_reuse');
  } finally {
    await server.close();
  }
});

test('suspender a participação derruba o acesso na hora (JWT ainda válido) e impede renovar', async () => {
  const { server, admin, adminCookie } = await startConfigured({}, protectedRoute);
  try {
    assert.equal((await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(admin.accessToken) })).statusCode, 200);
    await server.ctx.db
      .update(orgMemberships)
      .set({ status: 'suspended', suspendedAt: new Date() })
      .where(and(eq(orgMemberships.userId, admin.user.id), eq(orgMemberships.organizationId, admin.user.organizationId)));
    const res = await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(admin.accessToken) });
    assert.equal(res.statusCode, 403);
    assert.equal(json(res).error.code, 'accountSuspended');
    const r = await refresh(server.app, adminCookie);
    assert.equal(r.statusCode, 403);
    const relogin = await login(server.app, 'ana@example.com', STRONG_PASSWORD);
    assert.equal(relogin.statusCode, 403);
    assert.equal(json(relogin).error.code, 'accountSuspended');
  } finally {
    await server.close();
  }
});

test('logout encerra a sessão do cookie; logout-all encerra todas e registra', async () => {
  const { server, admin, adminCookie } = await startConfigured({}, protectedRoute);
  try {
    const second = await login(server.app, 'ana@example.com', STRONG_PASSWORD);
    const secondCookie = refreshCookieOf(second)!;
    const out = await server.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: clientHeaders, cookies: { ld_rt: secondCookie } });
    assert.equal(out.statusCode, 204);
    assert.equal((await refresh(server.app, secondCookie)).statusCode, 401);
    assert.equal((await refresh(server.app, adminCookie)).statusCode, 200, 'a outra sessão segue');

    const third = json(await login(server.app, 'ana@example.com', STRONG_PASSWORD));
    const all = await server.app.inject({ method: 'POST', url: '/api/v1/auth/logout-all', headers: bearer(third.accessToken) });
    assert.equal(all.statusCode, 204);
    assert.equal((await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(admin.accessToken) })).statusCode, 401);
    const audit = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'sessions_revoked'));
    assert.equal(audit.length, 1);
    assert.ok((audit[0].count ?? 0) >= 2);
  } finally {
    await server.close();
  }
});

test('troca de senha: confere a atual, aplica a regra, derruba as outras sessões e registra', async () => {
  const { server, admin, adminCookie } = await startConfigured({}, protectedRoute);
  try {
    const other = json(await login(server.app, 'ana@example.com', STRONG_PASSWORD));
    const change = (currentPassword: string, newPassword: string) =>
      server.app.inject({ method: 'POST', url: '/api/v1/auth/change-password', headers: bearer(admin.accessToken), payload: { currentPassword, newPassword } });
    assert.equal(json(await change('errada', 'Outra-Senha-Forte-9')).error.code, 'currentPasswordWrong');
    assert.equal(json(await change(STRONG_PASSWORD, STRONG_PASSWORD)).error.code, 'samePassword');
    assert.equal(json(await change(STRONG_PASSWORD, 'fraca')).error.message.key, 'server.password.tooShort');
    const ok = await change(STRONG_PASSWORD, 'Outra-Senha-Forte-9');
    assert.equal(ok.statusCode, 200);
    assert.equal(json(ok).sessionsEnded, 1);
    assert.equal((await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(other.accessToken) })).statusCode, 401, 'outra sessão caiu');
    assert.equal((await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(admin.accessToken) })).statusCode, 200, 'a atual continua');
    assert.equal((await refresh(server.app, adminCookie)).statusCode, 200);
    assert.equal((await login(server.app, 'ana@example.com', 'Outra-Senha-Forte-9')).statusCode, 200);
    const audit = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'password_changed'));
    assert.equal(audit.length, 1);
  } finally {
    await server.close();
  }
});

test('Chat 08.5: sair de todos e trocar a senha conferem de novo, na hora, o tempo real da própria pessoa', async () => {
  const { server, admin } = await startConfigured({}, protectedRoute);
  try {
    const hub = server.ctx.collab!;
    const seen: boolean[][] = [];
    const original = hub.recheckWhere.bind(hub);
    hub.recheckWhere = async (filter) => {
      const conn = (userId: string) => ({ principal: { userId, kind: 'member' } }) as never;
      seen.push([filter(conn(admin.user.id)), filter(conn('outra-pessoa'))]);
      return original(filter);
    };
    const change = await server.app.inject({ method: 'POST', url: '/api/v1/auth/change-password', headers: bearer(admin.accessToken), payload: { currentPassword: STRONG_PASSWORD, newPassword: 'Outra-Senha-Forte-9' } });
    assert.equal(change.statusCode, 200);
    assert.deepEqual(seen, [[true, false]], 'troca de senha');
    const all = await server.app.inject({ method: 'POST', url: '/api/v1/auth/logout-all', headers: bearer(admin.accessToken) });
    assert.equal(all.statusCode, 204);
    assert.deepEqual(seen, [[true, false], [true, false]], 'sair de todos');
  } finally {
    await server.close();
  }
});

test('troca obrigatória: só /auth/me, troca de senha e saída funcionam até trocar', async () => {
  const { server, admin } = await startConfigured({}, protectedRoute);
  try {
    await server.ctx.db.update(users).set({ mustChangePassword: true }).where(eq(users.id, admin.user.id));
    const blocked = await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(admin.accessToken) });
    assert.equal(blocked.statusCode, 403);
    assert.equal(json(blocked).error.code, 'mustChangePassword');
    assert.equal(json(await server.app.inject({ url: '/api/v1/auth/me', headers: bearer(admin.accessToken) })).user.mustChangePassword, true);
    const ok = await server.app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: bearer(admin.accessToken),
      payload: { currentPassword: STRONG_PASSWORD, newPassword: 'Nova-Senha-Forte-77' },
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(json(ok).user.mustChangePassword, false);
    assert.equal((await server.app.inject({ url: '/api/v1/test/protected', headers: bearer(admin.accessToken) })).statusCode, 200);
  } finally {
    await server.close();
  }
});

test('LUDRAW_TRUST_PROXY: desligado ignora X-Forwarded-For; ligado usa o IP do cliente no limite e no Audit Log', async () => {
  const off = await startConfigured({}, protectedRoute);
  try {
    const r = await off.server.app.inject({ url: '/api/v1/test/protected', headers: { ...bearer(off.admin.accessToken), 'x-forwarded-for': '203.0.113.9' } });
    assert.equal(json(r).ip, '127.0.0.1');
  } finally {
    await off.server.close();
  }
  const on = await startConfigured({ LUDRAW_TRUST_PROXY: 'true' }, protectedRoute);
  try {
    const r = await on.server.app.inject({ url: '/api/v1/test/protected', headers: { ...bearer(on.admin.accessToken), 'x-forwarded-for': '203.0.113.9' } });
    assert.equal(json(r).ip, '203.0.113.9');
    await login(on.server.app, 'ana@example.com', 'errada', { 'x-forwarded-for': '198.51.100.7' });
    const [failed] = await on.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'login_failed'));
    assert.equal(failed.ip, '198.51.100.7');
    // o limite por IP usa o IP real do cliente: outro IP não é afetado
    for (let i = 0; i < 8; i++) await login(on.server.app, 'ana@example.com', 'errada', { 'x-forwarded-for': '198.51.100.8' });
    assert.equal((await login(on.server.app, 'ana@example.com', 'errada', { 'x-forwarded-for': '198.51.100.8' })).statusCode, 429);
    assert.equal((await login(on.server.app, 'ana@example.com', STRONG_PASSWORD, { 'x-forwarded-for': '198.51.100.20' })).statusCode, 200);
  } finally {
    await on.server.close();
  }
  assert.deepEqual(loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_TRUST_PROXY: '2' }).trustProxy, 2);
  assert.deepEqual(loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).trustProxy, ['10.0.0.0/8', '127.0.0.1']);
});

test('cookie Secure: padrão em produção; aviso claro com URL pública http fora de localhost', () => {
  const prod = loadConfig({ DATABASE_URL: TEST_DB_URL, NODE_ENV: 'production', LUDRAW_PUBLIC_URL: 'https://draw.example.com' });
  assert.equal(prod.cookie.secure, true);
  assert.equal(prod.warnings.length, 0);
  const dev = loadConfig({ DATABASE_URL: TEST_DB_URL });
  assert.equal(dev.cookie.secure, false);
  const lan = loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_PUBLIC_URL: 'http://draw.example.com' });
  assert.equal(lan.warnings.length, 1);
  assert.match(lan.warnings[0], /plain http/);
  assert.match(lan.warnings[0], /WITHOUT the Secure flag/);
  const prodHttp = loadConfig({ DATABASE_URL: TEST_DB_URL, NODE_ENV: 'production', LUDRAW_PUBLIC_URL: 'http://192.168.0.10:3001' });
  assert.match(prodHttp.warnings[0], /will NOT be sent over http/);
  const local = loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_PUBLIC_URL: 'http://localhost:3001' });
  assert.equal(local.warnings.length, 0);
  assert.throws(() => loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_COOKIE_SAMESITE: 'none' }), /requires LUDRAW_COOKIE_SECURE/);
});
