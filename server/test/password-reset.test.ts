/**
 * Recuperação de senha por e-mail (Chat 08.5): a resposta não revela se a conta existe (estrutura e
 * tempo), só o hash do token fica no banco, uso único, validade, senha fraca não gasta o link,
 * sessões e tempo real derrubados, conta só-SSO, conta suspensa, limites por endereço e por IP.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { emailTokens, users, workspaceAudit } from '../src/db/schema';
import { sha256Hex } from '../src/lib/crypto';
import { issueEmailToken } from '../src/mail/emailTokens';
import { MemoryMailer } from '../src/mail/memory';
import { api, bearer, clientHeaders, invitePerson, json, startWithMail, STRONG_PASSWORD, type Person } from './helpers';

const NEW_PASSWORD = 'Outra-Senha-Forte-2027!';
const forgot = (app: FastifyInstance, email: string) => app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', payload: { email }, headers: clientHeaders });
const reset = (app: FastifyInstance, token: string, password: string) => app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token, password }, headers: clientHeaders });
const check = async (app: FastifyInstance, token: string) => json(await app.inject({ url: `/api/v1/auth/password/reset/${token}` })).valid as boolean;
const login = (app: FastifyInstance, email: string, password: string) => app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

/** O que o cliente enxerga da resposta, menos o que muda a cada pedido por natureza. */
function shape(res: LightMyRequestResponse) {
  const headers = { ...res.headers };
  for (const h of ['date', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-request-id']) delete headers[h];
  return { status: res.statusCode, body: res.body, headers };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test('esqueci a senha: mesma resposta para conta existente e inexistente; a resposta sai ANTES de o servidor procurar a conta', async () => {
  const { server, mailer, flush } = await startWithMail({ LUDRAW_MAIL_MAX_PER_IP_HOUR: '1000', LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR: '1000' });
  try {
    mailer.delayMs = 120; // SMTP lento: se a rota esperasse o envio, a diferença apareceria
    const known = await forgot(server.app, 'ana@example.com');
    assert.equal(known.statusCode, 202);
    assert.equal(mailer.sent.length, 0, 'a resposta saiu sem esperar o envio');
    assert.equal((await server.ctx.db.select().from(emailTokens)).length, 0, 'nem o token existia ainda: a rota não consultou a conta');
    await flush();
    assert.equal(mailer.sent.length, 1);

    const unknown = await forgot(server.app, 'ninguem@example.com');
    await flush();
    assert.equal(mailer.sent.length, 1, 'conta inexistente não recebe nada');
    assert.deepEqual(shape(unknown), shape(known), 'status, corpo e cabeçalhos idênticos');
    assert.equal(known.body, '{"ok":true}');

    // Conferência auxiliar de tempo. A garantia é a estrutura acima (a rota não toca o banco pelo e-mail);
    // aqui a margem é larga de propósito: os dois caminhos fazem só validação e contagem em memória (< 5 ms).
    mailer.delayMs = 0;
    const time = async (email: string) => {
      const t0 = process.hrtime.bigint();
      await forgot(server.app, email);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      await flush();
      return ms;
    };
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < 15; i++) {
      a.push(await time('ana@example.com'));
      b.push(await time(`ninguem${i}@example.com`));
    }
    assert.ok(Math.abs(median(a) - median(b)) < 25, `medianas próximas (existente ${median(a).toFixed(2)} ms × inexistente ${median(b).toFixed(2)} ms)`);
  } finally {
    await server.close();
  }
});

test('fluxo completo: só o hash no banco, senha fraca não gasta o link, uso único, sessões encerradas, auditoria, e-mail confirmado', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    await forgot(server.app, ' ANA@example.com ');
    await flush();
    const token = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    const rows = await server.ctx.db.select().from(emailTokens);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tokenHash, sha256Hex(token));
    assert.equal(rows[0].purpose, 'reset_password');
    assert.doesNotMatch(JSON.stringify(rows[0]), new RegExp(token), 'o token em claro não está em nenhuma coluna');
    const minutes = (rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()) / 60_000;
    assert.equal(minutes, 30);
    assert.equal(await check(server.app, token), true);
    assert.equal(await check(server.app, `${token.slice(0, -2)}zz`), false);

    const weak = await reset(server.app, token, 'curta');
    assert.equal(weak.statusCode, 400);
    assert.equal(json(weak).error.code, 'weakPassword');
    assert.equal(await check(server.app, token), true, 'o link continua valendo depois de uma senha recusada');

    const done = await reset(server.app, token, NEW_PASSWORD);
    assert.equal(done.statusCode, 200);
    assert.deepEqual(json(done), { ok: true }, 'não abre sessão: a pessoa entra com a senha nova');
    assert.equal(done.cookies.length, 0);

    assert.equal((await server.app.inject({ url: '/api/v1/auth/me', headers: bearer(admin.accessToken) })).statusCode, 401, 'sessão antiga encerrada');
    assert.equal((await login(server.app, 'ana@example.com', STRONG_PASSWORD)).statusCode, 401, 'senha antiga não entra');
    const again = await login(server.app, 'ana@example.com', NEW_PASSWORD);
    assert.equal(again.statusCode, 200);
    assert.equal(json(again).user.emailVerified, true, 'quem abriu o link provou que recebe o e-mail');

    const reused = await reset(server.app, token, 'Mais-Uma-Senha-Forte-2028!');
    assert.equal(reused.statusCode, 400);
    assert.equal(json(reused).error.message.key, 'server.errors.tokenInvalid');
    assert.equal(await check(server.app, token), false);
    assert.equal((await login(server.app, 'ana@example.com', NEW_PASSWORD)).statusCode, 200, 'a segunda tentativa não mudou nada');

    const audit = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'password_reset_email'));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorId, admin.user.id);
    assert.equal(audit[0].count, 1, 'uma sessão encerrada');
    assert.deepEqual(audit[0].message, { key: 'workspace.audit.msg.passwordResetEmail' });
  } finally {
    await server.close();
  }
});

test('token vencido, de outro tipo, substituído por um pedido novo ou de e-mail que mudou: todos dão o mesmo erro', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const invalid = async (token: string) => {
      const r = await reset(server.app, token, NEW_PASSWORD);
      assert.equal(r.statusCode, 400);
      assert.equal(json(r).error.message.key, 'server.errors.tokenInvalid');
    };
    // pedir de novo invalida o link anterior
    await forgot(server.app, 'ana@example.com');
    await flush();
    const first = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    await forgot(server.app, 'ana@example.com');
    await flush();
    const second = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    assert.notEqual(first, second);
    await invalid(first);
    assert.equal(await check(server.app, second), true);

    // vencido
    await server.ctx.db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailTokens.tokenHash, sha256Hex(second)));
    assert.equal(await check(server.app, second), false);
    await invalid(second);

    // token de outro tipo (verificar e-mail) não redefine senha
    const other = await issueEmailToken(server.ctx.db, { purpose: 'verify_email', organizationId: admin.user.organizationId, userId: admin.user.id, email: 'ana@example.com', ttlMinutes: 60 });
    await invalid(other);

    // o e-mail da conta mudou depois do pedido
    await forgot(server.app, 'ana@example.com');
    await flush();
    const third = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    await server.ctx.db.update(users).set({ email: 'ana.nova@example.com' }).where(eq(users.id, admin.user.id));
    await invalid(third);

    // formato inválido nem chega ao banco
    assert.equal((await reset(server.app, 'curto', NEW_PASSWORD)).statusCode, 400);
    assert.equal((await login(server.app, 'ana.nova@example.com', STRONG_PASSWORD)).statusCode, 200, 'nenhuma dessas tentativas trocou a senha');
  } finally {
    await server.close();
  }
});

test('redefinir a senha derruba o tempo real da pessoa na hora (recheckWhere) — e só o dela', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const hub = server.ctx.collab!;
    assert.ok(hub, 'tempo real ligado nos testes');
    const seen: boolean[][] = [];
    const original = hub.recheckWhere.bind(hub);
    hub.recheckWhere = async (filter) => {
      const conn = (userId: string, kind: 'member' | 'visitor') => ({ principal: { userId, kind } }) as never;
      seen.push([filter(conn(admin.user.id, 'member')), filter(conn('outra-pessoa', 'member')), filter(conn(admin.user.id, 'visitor'))]);
      return original(filter);
    };
    await forgot(server.app, 'ana@example.com');
    await flush();
    const token = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    assert.equal((await reset(server.app, token, NEW_PASSWORD)).statusCode, 200);
    assert.deepEqual(seen, [[true, false, false]]);
  } finally {
    await server.close();
  }
});

test('conta suspensa ou removida não recebe link; conta sem senha própria recebe o aviso do login da empresa', async () => {
  const { server, admin, mailer, flush } = await startWithMail({ OIDC_ISSUER: 'https://id.example.com', OIDC_CLIENT_ID: 'ludraw', OIDC_REDIRECT_URI: 'https://draw.example.com/api/v1/auth/oidc/callback', OIDC_PROVIDER_NAME: 'Login da Empresa' });
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    const caio = await invitePerson(server.app, owner, { email: 'caio@example.com' });

    assert.equal((await api(server.app, owner).op({ type: 'suspendAccount', id: bia.id })).statusCode, 200);
    const suspended = await forgot(server.app, 'bia@example.com');
    assert.equal(suspended.statusCode, 202, 'a resposta é a de sempre');
    await flush();
    assert.equal(mailer.last('bia@example.com'), undefined);

    // conta que só entra pelo provedor da empresa
    await server.ctx.db.update(users).set({ passwordHash: null, authProvider: 'oidc' }).where(eq(users.id, caio.id));
    await forgot(server.app, 'caio@example.com');
    await flush();
    const msg = mailer.last('caio@example.com')!;
    assert.ok(msg);
    assert.match(msg.text, /Login da Empresa/);
    assert.doesNotMatch(msg.text, /#\/reset\//, 'sem link de redefinição');
    assert.equal(MemoryMailer.linkOf(msg), 'https://draw.example.com/#/login');
    assert.equal((await server.ctx.db.select().from(emailTokens)).length, 0, 'nenhum token criado');
  } finally {
    await server.close();
  }
});

test('limites: 5 pedidos por endereço e por hora (exista ou não a conta), teto por IP e teto das rotas que aceitam token', async () => {
  const { server, mailer, flush } = await startWithMail({ LUDRAW_MAIL_MAX_PER_IP_HOUR: '8' });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await forgot(server.app, 'ninguem@example.com')).statusCode, 202);
    const blocked = await forgot(server.app, 'ninguem@example.com');
    assert.equal(blocked.statusCode, 429, 'o limite não depende de a conta existir');
    assert.equal(json(blocked).error.code, 'tooManyAttempts');
    assert.ok(Number(blocked.headers['retry-after']) > 3000);

    // por IP: o 6.º acima também contou; faltam 2 até o teto de 8
    assert.equal((await forgot(server.app, 'a@example.com')).statusCode, 202);
    assert.equal((await forgot(server.app, 'b@example.com')).statusCode, 202);
    assert.equal((await forgot(server.app, 'c@example.com')).statusCode, 429);
    assert.equal((await forgot(server.app, 'nao-e-email')).statusCode, 400);
    await flush();
    assert.equal(mailer.sent.length, 0);

    for (let i = 0; i < 30; i++) assert.equal((await server.app.inject({ url: '/api/v1/auth/password/reset/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })).statusCode, 200);
    assert.equal((await server.app.inject({ url: '/api/v1/auth/password/reset/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })).statusCode, 429);
    assert.equal((await reset(server.app, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', NEW_PASSWORD)).statusCode, 429, 'o mesmo teto vale para todas as rotas de token');
  } finally {
    await server.close();
  }
});
