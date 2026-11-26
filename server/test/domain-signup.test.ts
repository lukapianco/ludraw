/**
 * Chat 08.5 · C — cadastro com o e-mail da organização.
 *
 *  - política: desligada por padrão (404, registration=invite_only); o servidor recusa ligar sem e-mail, sem domínio
 *    ou em multi_org; e-mail que some depois → inativa (404 e invite_only); aviso para a administração;
 *  - e-mail: domínio pelo ÚLTIMO "@", exato (subdomínio não), normalizado (maiúsculas, ponto final, punycode);
 *  - respostas idênticas (status, corpo, cabeçalhos) para domínio fora, subdomínio, conta existente, removido e
 *    teto do dia, e a resposta sai antes de qualquer trabalho;
 *  - suspenso não reentra; removido não volta sozinho (só por convite, que apaga a marca);
 *  - token de uso único; política/domínio mudando entre o envio e a conclusão; conta criada como membro;
 *  - teto do dia conta CONTAS CRIADAS na conclusão (pedir e-mails para terceiros não o esgota).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { asciiDomain, parseSignupEmail, signupDomainAllowed } from '../../src/utils/workspaceRules';
import { users, workspaceAudit } from '../src/db/schema';
import { disabledMailer } from '../src/mail/mailer';
import { MemoryMailer } from '../src/mail/memory';
import { api, clientHeaders, completeSetup, invitePerson, issueTestSetupToken, json, MAIL_ENV, startConfigured, startServer, startWithMail, STRONG_PASSWORD, type Person } from './helpers';

const LOOSE = { LUDRAW_MAIL_MAX_PER_IP_HOUR: '500', LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR: '50' };

const request = (app: FastifyInstance, email: string) => app.inject({ method: 'POST', url: '/api/v1/signup', payload: { email, lang: 'pt-BR' }, headers: clientHeaders });
const complete = (app: FastifyInstance, token: string, name = 'Nova Pessoa', password = 'Lousa-Verde-Pistache-77') =>
  app.inject({ method: 'POST', url: `/api/v1/signup/${token}/complete`, payload: { name, password }, headers: clientHeaders });
const info = async (app: FastifyInstance) => json((await app.inject({ url: '/api/v1/info' })) as never) as { registration: string };

function shape(res: LightMyRequestResponse) {
  const headers = { ...res.headers };
  for (const h of ['date', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-request-id']) delete headers[h];
  return { status: res.statusCode, body: res.body, headers };
}

async function startDomain(env: Record<string, string> = {}, domains = ['empresa.com']) {
  const started = await startWithMail({ ...LOOSE, ...env });
  const owner: Person = { token: started.admin.accessToken, id: started.admin.user.id };
  assert.equal((await api(started.server.app, owner).op({ type: 'updateWorkspace', patch: { allowedEmailDomains: domains } })).statusCode, 200);
  const on = await api(started.server.app, owner).op({ type: 'updatePolicies', patch: { allowDomainSignup: true } });
  assert.equal(on.statusCode, 200, on.body);
  return { ...started, owner };
}

test('e-mail: domínio pelo último "@", normalizado (maiúsculas, ponto final, punycode), exato — subdomínio não vale', () => {
  assert.deepEqual(parseSignupEmail('Ana@Empresa.COM'), { email: 'ana@empresa.com', domain: 'empresa.com' });
  assert.deepEqual(parseSignupEmail('ana@empresa.com.'), { email: 'ana@empresa.com', domain: 'empresa.com' });
  assert.equal(parseSignupEmail('"a@empresa.com"@fora.com')?.domain ?? null, null, 'aspas/arroba na parte local: fora');
  assert.equal(parseSignupEmail('a@b@empresa.com'), null, 'vários "@" sem aspas: fora');
  assert.equal(parseSignupEmail('sem-arroba'), null);
  assert.equal(parseSignupEmail('@empresa.com'), null);
  const idn = parseSignupEmail('ana@empresá.com');
  assert.equal(idn?.domain, asciiDomain('empresá.com'));
  assert.match(idn!.domain, /^xn--/);
  assert.ok(signupDomainAllowed(idn!.domain, ['EMPRESÁ.com.']), 'lista e e-mail normalizados do mesmo jeito');
  assert.ok(signupDomainAllowed('empresa.com', ['empresa.com']));
  assert.equal(signupDomainAllowed('vendas.empresa.com', ['empresa.com']), false, 'subdomínio não entra pelo cadastro aberto');
  assert.equal(signupDomainAllowed('empresa.com.br', ['empresa.com']), false);
  // o último "@" decide: um endereço "de dentro" escondido na parte local não passa
  assert.equal(parseSignupEmail('x@empresa.com@fora.com'), null);
});

test('política: desligada por padrão; o servidor recusa ligar sem e-mail, sem domínio ou em multi_org', async () => {
  const noMail = await startConfigured({ LUDRAW_APP_URL: 'https://draw.example.com' });
  try {
    const owner: Person = { token: noMail.admin.accessToken, id: noMail.admin.user.id };
    assert.equal((await request(noMail.server.app, 'ana@empresa.com')).statusCode, 404, 'desligada: a rota não existe');
    assert.equal((await info(noMail.server.app)).registration, 'invite_only');
    await api(noMail.server.app, owner).op({ type: 'updateWorkspace', patch: { allowedEmailDomains: ['empresa.com'] } });
    const r = await api(noMail.server.app, owner).op({ type: 'updatePolicies', patch: { allowDomainSignup: true } });
    assert.equal(r.statusCode, 409);
    assert.equal(json(r).error.message.key, 'server.errors.domainSignupNeedsMail');
  } finally {
    await noMail.server.close();
  }

  const noDomain = await startWithMail(LOOSE);
  try {
    const owner: Person = { token: noDomain.admin.accessToken, id: noDomain.admin.user.id };
    const r = await api(noDomain.server.app, owner).op({ type: 'updatePolicies', patch: { allowDomainSignup: true } });
    assert.equal(r.statusCode, 409);
    assert.equal(json(r).error.message.key, 'server.errors.domainSignupNeedsDomain');
    const bia = await invitePerson(noDomain.server.app, owner, { email: 'bia@example.com' });
    assert.equal((await api(noDomain.server.app, bia).get('/admin/signup/status')).statusCode, 403, 'estado só para quem gerencia políticas');
  } finally {
    await noDomain.server.close();
  }

  const multi = await startServer({ ...MAIL_ENV, ...LOOSE });
  try {
    multi.ctx.mailer = new MemoryMailer();
    await issueTestSetupToken(multi);
    const setupRes = await completeSetup(multi.app, { mode: 'multi_org', domains: ['example.com'] });
    assert.equal(setupRes.statusCode, 200, setupRes.body);
    const token = json(setupRes).accessToken as string;
    const r = await api(multi.app, token).op({ type: 'updatePolicies', patch: { allowDomainSignup: true } });
    assert.equal(r.statusCode, 409);
    assert.equal(json(r).error.message.key, 'server.errors.domainSignupMultiOrg');
  } finally {
    await multi.close();
  }
});

test('ligada: Login oferece o cadastro; o e-mail some depois → inativa (404, invite_only) e a administração vê o que falta', async () => {
  const { server, owner } = await startDomain();
  try {
    assert.equal((await info(server.app)).registration, 'domain');
    assert.equal((await request(server.app, 'nova@empresa.com')).statusCode, 202);
    const status = json(await api(server.app, owner).get('/admin/signup/status'));
    assert.deepEqual({ policy: status.policy, active: status.active, missing: status.missing, reached: status.reached }, { policy: true, active: true, missing: [], reached: [] });

    server.ctx.mailer = disabledMailer;
    assert.equal((await request(server.app, 'nova@empresa.com')).statusCode, 404, 'sem e-mail: a rota some');
    assert.equal((await info(server.app)).registration, 'invite_only');
    const off = json(await api(server.app, owner).get('/admin/signup/status'));
    assert.equal(off.policy, true);
    assert.equal(off.active, false);
    assert.deepEqual(off.missing, ['mail']);
    // outras políticas continuam salvando com a de cadastro ligada (a recusa é só ao LIGAR)
    assert.equal((await api(server.app, owner).op({ type: 'updatePolicies', patch: { allowDomainSignup: true, allowGuests: true } })).statusCode, 200);
  } finally {
    await server.close();
  }
});

test('respostas idênticas e nada enviado: domínio fora, subdomínio, "@" escondido, conta suspensa; conta ativa recebe "já tem conta"; resposta antes do trabalho', async () => {
  const { server, owner, mailer, flush } = await startDomain({}, ['empresa.com', 'example.com']);
  try {
    const bia = await invitePerson(server.app, owner, { email: 'bia@empresa.com' });
    const caio = await invitePerson(server.app, owner, { email: 'caio@empresa.com' });
    assert.equal((await api(server.app, owner).op({ type: 'suspendAccount', id: caio.id })).statusCode, 200);
    void bia;

    mailer.delayMs = 150;
    const responses = {
      novo: await request(server.app, 'nova@empresa.com'),
      fora: await request(server.app, 'zeca@fora.com'),
      subdominio: await request(server.app, 'vera@vendas.empresa.com'),
      escondido: await request(server.app, '"x@empresa.com"@fora.com'),
      ativa: await request(server.app, 'bia@empresa.com'),
      suspensa: await request(server.app, 'caio@empresa.com'),
    };
    assert.equal(mailer.sent.length, 0, 'a resposta sai antes de qualquer envio');
    const base = shape(responses.novo);
    assert.equal(base.status, 202);
    for (const [k, r] of Object.entries(responses)) assert.deepEqual(shape(r), base, `${k}: mesma resposta`);
    await flush();
    assert.deepEqual(mailer.sent.map((m) => m.to).sort(), ['bia@empresa.com', 'nova@empresa.com']);
    assert.match(mailer.last('bia@empresa.com')!.subject, /já tem conta/i);
    assert.match(mailer.last('nova@empresa.com')!.subject, /Conclua seu cadastro/);
    assert.match(MemoryMailer.linkOf(mailer.last('nova@empresa.com')!)!, /^https:\/\/draw\.example\.com\/#\/signup\//);
  } finally {
    await server.close();
  }
});

test('conclusão: membro sem time, e-mail verificado, createdVia signup, auditoria; token de uso único; corrida de dois tokens', async () => {
  const { server, mailer, flush } = await startDomain();
  try {
    await request(server.app, 'Nova@Empresa.com.');
    await flush();
    const first = MemoryMailer.tokenOf(mailer.last('nova@empresa.com')!)!;
    const preview = json(await server.app.inject({ url: `/api/v1/signup/${first}` }));
    assert.deepEqual(preview, { email: 'nova@empresa.com', organizationName: 'Empresa Exemplo', role: 'member' });
    // um segundo pedido substitui o primeiro link (só o mais novo vale)
    await request(server.app, 'nova@empresa.com');
    await flush();
    const second = MemoryMailer.tokenOf(mailer.last('nova@empresa.com')!)!;
    assert.notEqual(first, second);
    assert.equal((await complete(server.app, first)).statusCode, 400, 'link antigo não vale');

    const done = await complete(server.app, second);
    assert.equal(done.statusCode, 200, done.body);
    const auth = json(done);
    assert.equal(auth.user.email, 'nova@empresa.com');
    const [row] = await server.ctx.db.select().from(users).where(eq(users.email, 'nova@empresa.com'));
    assert.equal(row.createdVia, 'signup');
    assert.ok(row.emailVerifiedAt);
    const state = await api(server.app, auth.accessToken).state();
    const me = state.directory.find((a: { email: string }) => a.email === 'nova@empresa.com');
    assert.equal(me.workspaceRole, 'member');
    assert.deepEqual(me.teamIds, []);
    const audits = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'domain_signup'));
    assert.equal(audits.length, 1);
    assert.equal((await complete(server.app, second)).statusCode, 400, 'uso único');
    // pedir de novo com a conta criada: "já tem conta", nunca outro cadastro
    await request(server.app, 'nova@empresa.com');
    await flush();
    assert.match(mailer.last('nova@empresa.com')!.subject, /já tem conta/i);
  } finally {
    await server.close();
  }
});

test('mudanças entre o envio e a conclusão: política desligada ou domínio removido → o link não vale', async () => {
  const { server, owner, mailer, flush } = await startDomain();
  try {
    await request(server.app, 'a1@empresa.com');
    await request(server.app, 'a2@empresa.com');
    await flush();
    const t1 = MemoryMailer.tokenOf(mailer.last('a1@empresa.com')!)!;
    const t2 = MemoryMailer.tokenOf(mailer.last('a2@empresa.com')!)!;
    await api(server.app, owner).op({ type: 'updatePolicies', patch: { allowDomainSignup: false } });
    assert.equal((await complete(server.app, t1)).statusCode, 400);
    await api(server.app, owner).op({ type: 'updatePolicies', patch: { allowDomainSignup: true } });
    await api(server.app, owner).op({ type: 'updateWorkspace', patch: { allowedEmailDomains: ['outra.com'] } });
    assert.equal((await complete(server.app, t2)).statusCode, 400);
    assert.equal((await server.ctx.db.select().from(users).where(eq(users.email, 'a2@empresa.com'))).length, 0);
  } finally {
    await server.close();
  }
});

test('removido não volta sozinho (mesma resposta, nada enviado); convite da administração apaga a marca', async () => {
  const { server, owner, mailer, flush } = await startDomain();
  try {
    const dani = await invitePerson(server.app, owner, { email: 'dani@empresa.com' });
    const removed = await api(server.app, owner).op({ type: 'removeAccount', id: dani.id });
    assert.equal(removed.statusCode, 200, removed.body);
    const before = mailer.sent.length;
    const fresh = shape(await request(server.app, 'zeta@empresa.com'));
    const blocked = shape(await request(server.app, 'Dani@Empresa.com'));
    assert.deepEqual(blocked, fresh, 'removido: mesma resposta');
    await flush();
    assert.deepEqual(mailer.sent.slice(before).map((m) => m.to), ['zeta@empresa.com'], 'nada para o removido');
    // a administração convida de volta → a pessoa entra e a marca sai
    await invitePerson(server.app, owner, { email: 'dani@empresa.com', name: 'Dani Volta' });
    const again = await invitePerson(server.app, owner, { email: 'dani2@empresa.com' });
    void again;
    const { removedEmailMarks } = await import('../src/db/schema');
    const marks = await server.ctx.db.select().from(removedEmailMarks);
    assert.equal(marks.length, 0, 'convite aceito apagou a marca');
    assert.ok(!JSON.stringify(marks).includes('dani'), 'só HMAC, nunca o e-mail');
  } finally {
    await server.close();
  }
});

test('teto do dia: conta CONTAS CRIADAS na conclusão; pedidos para terceiros não o esgotam; resposta idêntica e aviso à administração', async () => {
  const { server, owner, mailer, flush } = await startDomain({ LUDRAW_DOMAIN_SIGNUP_MAX_PER_DAY: '2' });
  try {
    // muitos pedidos (inclusive para terceiros) não gastam o teto: só contas criadas contam
    for (const n of [1, 2, 3, 4]) await request(server.app, `p${n}@empresa.com`);
    await flush();
    assert.equal(mailer.sent.length, 4, 'pedidos não consomem o teto');
    const tokens = [1, 2, 3].map((n) => MemoryMailer.tokenOf(mailer.last(`p${n}@empresa.com`)!)!);
    assert.equal((await complete(server.app, tokens[0], 'Pessoa Um')).statusCode, 200);
    assert.equal((await complete(server.app, tokens[1], 'Pessoa Dois')).statusCode, 200);
    const third = await complete(server.app, tokens[2], 'Pessoa Tres');
    assert.equal(third.statusCode, 429, 'a 3ª conta do dia é recusada na conclusão');
    assert.equal(json(third).error.message.key, 'server.errors.domainSignupDailyLimit');

    // com o teto atingido: mesma resposta do pedido e nada enviado
    const sentBefore = mailer.sent.length;
    const open = shape(await request(server.app, 'zz@fora.com'));
    const capped = shape(await request(server.app, 'p9@empresa.com'));
    assert.deepEqual(capped, open, 'teto atingido: mesma resposta');
    await flush();
    assert.equal(mailer.sent.length, sentBefore, 'teto atingido: nada enviado');

    const status = json(await api(server.app, owner).get('/admin/signup/status'));
    assert.deepEqual(status.reached, [{ domain: 'empresa.com', count: 2 }], 'aviso visível em Políticas');
    assert.equal(status.maxPerDay, 2);
  } finally {
    await server.close();
  }
});

test('limites de envio continuam valendo no pedido (por endereço)', async () => {
  const { server } = await startDomain({ LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR: '2' });
  try {
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await request(server.app, 'lim@empresa.com')).statusCode);
    assert.deepEqual(codes, [202, 202, 429]);
    void STRONG_PASSWORD;
  } finally {
    await server.close();
  }
});
