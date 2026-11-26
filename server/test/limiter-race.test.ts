/**
 * LuDraw server — Chat 08.7 · R3 (S-04, S-05): limites de tentativa que não caem com pedidos em paralelo.
 *
 * Antes: as rotas faziam `check()` → argon2 (await) → `hit()` só na falha — todas as tentativas simultâneas passavam
 * no `check()` antes do primeiro `hit()` (30 logins errados em paralelo = 30 verificações de senha, limite 8). O
 * contador de senha do link público lia, somava 1 e gravava fora de transação (20 erros simultâneos = 1 contado).
 * Agora a tentativa é RESERVADA antes da verificação (e devolvida/zerada só no sucesso); o link público usa
 * `UPDATE … RETURNING` atômico; e há um limite só por e-mail (30 erros em 15 min somando todos os IPs).
 * Roda no PGlite e no Postgres real (`npm run test:server:pg`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { AttemptLimiter } from '../src/lib/limiter';
import { publicLinks } from '../src/db/schema';
import { api, createBoard, invitePerson, issueTestSetupToken, json, startConfigured, startServer, STRONG_PASSWORD, type Person, linkTokenOf } from './helpers';

const count = (rs: { statusCode: number }[]) => rs.reduce((m: Record<number, number>, r) => ((m[r.statusCode] = (m[r.statusCode] ?? 0) + 1), m), {});

test('login: 30 senhas erradas SIMULTÂNEAS do mesmo IP param no limite (8 por IP+conta)', async () => {
  const { server } = await startConfigured();
  try {
    const rs = await Promise.all(Array.from({ length: 30 }, () => server.app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: '192.0.2.10', payload: { email: 'ana@example.com', password: 'senha-errada-000' } })));
    const c = count(rs);
    assert.ok((c[401] ?? 0) <= 8, `verificações de senha feitas: ${c[401] ?? 0} (respostas: ${JSON.stringify(c)})`);
    assert.equal((c[401] ?? 0) + (c[429] ?? 0), 30);
  } finally {
    await server.close();
  }
});

test('login: limite só por e-mail — 30 erros de IPs diferentes travam a conta (429 próprio + auditoria); depois da janela o login certo entra', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const victim = await invitePerson(server.app, owner, { email: 'vitima@example.com', name: 'Vítima' });
    let now = Date.now();
    // relógio controlado só neste limitador (a janela de 15 min passa sem esperar)
    (server.ctx.limiters as unknown as Record<string, AttemptLimiter>).loginEmail = new AttemptLimiter(30, 15 * 60_000, () => now);
    const login = (ip: string, password: string) => server.app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: ip, payload: { email: 'vitima@example.com', password } });
    for (let i = 0; i < 30; i++) assert.equal((await login(`198.51.100.${i + 1}`, 'senha-errada-000')).statusCode, 401, `tentativa ${i + 1}`);
    // 31ª, de outro IP e com a senha CERTA: a conta está travada
    const locked = await login('203.0.113.77', STRONG_PASSWORD);
    assert.equal(locked.statusCode, 429);
    assert.equal(json(locked).error.code, 'accountLocked');
    assert.equal(json(locked).error.message.key, 'server.errors.accountLocked', 'mensagem própria (aponta "Esqueci minha senha")');
    // e-mail inexistente recebe a mesma resposta (sem enumeração) depois de 30 erros
    for (let i = 0; i < 30; i++) await server.app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: `198.51.100.${100 + i}`, payload: { email: 'ninguem@example.com', password: 'x-errada-0000' } });
    const ghost = await server.app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: '203.0.113.78', payload: { email: 'ninguem@example.com', password: 'x-errada-0000' } });
    assert.equal(ghost.statusCode, 429);
    assert.equal(json(ghost).error.code, 'accountLocked');
    // auditoria visível ao admin
    const audit = json(await api(server.app, owner).get('/audit?limit=100'));
    const entries = (audit.entries ?? audit) as { action: string; targetId?: string; message?: { key: string } }[];
    const lockEntry = entries.find((e) => e.action === 'login_locked' && e.targetId === victim.id);
    assert.ok(lockEntry, 'entrada "muitas tentativas na conta" no Audit Log');
    assert.equal(lockEntry!.message?.key, 'workspace.audit.msg.loginLocked');
    // depois da janela de 15 min, o login certo entra
    now += 15 * 60_000 + 1;
    assert.equal((await login('203.0.113.79', STRONG_PASSWORD)).statusCode, 200);
  } finally {
    await server.close();
  }
});

test('aceitar convite com conta existente: senhas erradas simultâneas param no limite (10 por IP+convite)', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const member = await invitePerson(server.app, owner, { email: 'membro@example.com', name: 'Membro' });
    const board = await createBoard(server.app, owner, { name: 'Compartilhado' });
    const inv = json(await api(server.app, owner).op({ type: 'createInvitation', input: { email: 'membro@example.com', role: 'member', boardId: board.id, boardRole: 'editor', expiresInDays: 7, sendEmail: false } }));
    assert.ok(inv.token, 'convite para a conta existente');
    void member;
    const rs = await Promise.all(Array.from({ length: 25 }, () => server.app.inject({ method: 'POST', url: `/api/v1/invitations/${inv.token}/accept`, remoteAddress: '192.0.2.20', payload: { name: 'Membro', email: 'membro@example.com', password: 'senha-errada-000' } })));
    const c = count(rs);
    const verified = rs.length - (c[429] ?? 0);
    assert.ok(verified <= 10, `verificações de senha feitas: ${verified} (respostas: ${JSON.stringify(c)})`);
  } finally {
    await server.close();
  }
});

test('primeiro acesso: tokens errados simultâneos param no limite (5 por IP)', async () => {
  const server = await startServer();
  try {
    await issueTestSetupToken(server);
    const rs = await Promise.all(Array.from({ length: 15 }, () => server.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', remoteAddress: '192.0.2.30', payload: { token: 'ERRADO-ABCDEFGHJKLMNPQRS' } })));
    const c = count(rs);
    const verified = rs.length - (c[429] ?? 0);
    assert.ok(verified <= 5, `tokens conferidos: ${verified} (respostas: ${JSON.stringify(c)})`);
  } finally {
    await server.close();
  }
});

test('link público: 20 senhas erradas SIMULTÂNEAS (20 IPs) contam 20 e travam; a senha certa depois da trava entra e zera', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const board = await createBoard(server.app, owner, { name: 'Com senha' });
    const linkOp = await api(server.app, owner).op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true } }, 'Senha-Do-Link-1');
    assert.equal(linkOp.statusCode, 200);
    const link = linkTokenOf(linkOp, board.id); // Chat 08.7 · R5 (S-17): o token vem da resposta, o banco só tem o hash
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, remoteAddress: `198.51.100.${i + 1}`, payload: { password: `errada-${i}` } })));
    assert.equal(rs.filter((r) => r.statusCode === 200).length, 0);
    const [after] = await server.ctx.db.select().from(publicLinks).where(eq(publicLinks.boardId, board.id));
    assert.equal(after.failedAttempts, 20, 'cada erro simultâneo conta');
    assert.ok(after.lockedUntil && after.lockedUntil.getTime() > Date.now(), 'link travado');
    // trava vencida (simulada) → senha certa entra e zera o contador
    await server.ctx.db.update(publicLinks).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(publicLinks.boardId, board.id));
    const ok = await server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, remoteAddress: '203.0.113.5', payload: { password: 'Senha-Do-Link-1' } });
    assert.equal(ok.statusCode, 200, ok.body);
    const [reset] = await server.ctx.db.select().from(publicLinks).where(eq(publicLinks.boardId, board.id));
    assert.equal(reset.failedAttempts, 0);
  } finally {
    await server.close();
  }
});

test('limitador: reservar antes, devolver no sucesso (unidade)', () => {
  let now = 1_000;
  const l = new AttemptLimiter(3, 60_000, () => now);
  const r = l as unknown as { reserve: (k: string) => { allowed: boolean }; release: (k: string) => void };
  assert.equal(typeof r.reserve, 'function', 'reserve existe');
  assert.equal(r.reserve('k').allowed, true);
  assert.equal(r.reserve('k').allowed, true);
  assert.equal(r.reserve('k').allowed, true);
  assert.equal(r.reserve('k').allowed, false, '4ª reserva recusada');
  r.release('k');
  assert.equal(r.reserve('k').allowed, true, 'vaga devolvida no sucesso');
  now += 60_001;
  assert.equal(r.reserve('k').allowed, true, 'janela nova');
});
