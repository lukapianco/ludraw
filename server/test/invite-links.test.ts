/**
 * Chat 08.5 · B — link de convite geral e convite por e-mail, no servidor:
 *  - só o hash do token no banco; o estado nunca leva o token; só a administração vê os links;
 *  - com e-mail: conta nova conclui o cadastro pelo e-mail; conta existente recebe a MESMA resposta;
 *  - limite de usos sob corrida (organização + link travados, uses++ na mesma transação que cria a conta);
 *  - sem e-mail: vira pedido na fila (sem senha), aprovar gera convite e conta um uso;
 *  - convite por e-mail (criar, aprovar, reenviar), com os limites de envio, e e-mail confirmado ao aceitar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { accessRequests, invitations, inviteLinks, users, workspaceAudit } from '../src/db/schema';
import { sha256Hex } from '../src/lib/crypto';
import { MemoryMailer } from '../src/mail/memory';
import { api, clientHeaders, invitePerson, json, startConfigured, startWithMail, STRONG_PASSWORD, type Person } from './helpers';

const join = (app: FastifyInstance, token: string, body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/v1/join/${token}`, payload: body, headers: clientHeaders });
const complete = (app: FastifyInstance, token: string, name: string, password = STRONG_PASSWORD) =>
  app.inject({ method: 'POST', url: `/api/v1/signup/${token}/complete`, payload: { name, password }, headers: clientHeaders });

function shape(res: LightMyRequestResponse) {
  const headers = { ...res.headers };
  for (const h of ['date', 'x-ratelimit-remaining', 'x-ratelimit-reset']) delete headers[h];
  return { status: res.statusCode, body: res.body, headers };
}

async function createLink(app: FastifyInstance, owner: Person, input: Record<string, unknown> = {}) {
  const res = await api(app, owner).op({ type: 'createInviteLink', input: { role: 'member', maxUses: 5, expiresInDays: 7, ...input } });
  assert.equal(res.statusCode, 200, res.body);
  return { id: json(res).id as string, token: json(res).token as string };
}

test('link geral: só o hash no banco; o estado não leva token; só a administração vê; prévia pública', async () => {
  const { server, admin } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    assert.equal((await api(server.app, bia).op({ type: 'createInviteLink', input: { role: 'member', maxUses: 5, expiresInDays: 7 } })).statusCode, 403, 'membro não cria link geral');
    assert.equal((await api(server.app, owner).op({ type: 'createInviteLink', input: { role: 'admin', maxUses: 5, expiresInDays: 7 } })).statusCode, 400, 'papel admin recusado');

    const { id, token } = await createLink(server.app, owner, { allowedDomain: 'example.com' });
    const [row] = await server.ctx.db.select().from(inviteLinks).where(eq(inviteLinks.id, id));
    assert.equal(row.tokenHash, sha256Hex(token));
    assert.doesNotMatch(JSON.stringify(row), new RegExp(token), 'nenhuma coluna guarda o token');
    assert.ok(!('tokenEnc' in row), 'sem cópia cifrada');

    const adminState = (await api(server.app, owner).state()) as { inviteLinks?: { id: string; token?: string }[] };
    assert.equal(adminState.inviteLinks?.[0].id, id);
    assert.equal(adminState.inviteLinks?.[0].token, undefined);
    assert.doesNotMatch(JSON.stringify(adminState), new RegExp(token));
    const memberState = (await api(server.app, bia).state()) as { inviteLinks?: unknown; accessRequests?: unknown };
    assert.equal(memberState.inviteLinks, undefined);
    assert.equal(memberState.accessRequests, undefined);

    const preview = json(await server.app.inject({ url: `/api/v1/join/${token}` }));
    assert.deepEqual(preview, { organizationName: 'Empresa Exemplo', role: 'member', allowedDomain: 'example.com', status: 'active', mode: 'email' });
    assert.equal((await server.app.inject({ url: '/api/v1/join/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })).statusCode, 404);
  } finally {
    await server.close();
  }
});

test('link geral com e-mail: conta nova conclui o cadastro; conta existente recebe a MESMA resposta e um aviso por e-mail', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const { id, token } = await createLink(server.app, owner);
    mailer.delayMs = 300; // SMTP lento: a resposta não pode esperar o envio
    const fresh = await join(server.app, token, { email: 'nova@example.com' });
    const known = await join(server.app, token, { email: 'ana@example.com' });
    assert.equal(fresh.statusCode, 202);
    assert.deepEqual(shape(known), shape(fresh), 'status, corpo e cabeçalhos idênticos');
    assert.deepEqual(json(fresh), { ok: true, mode: 'email' });
    assert.equal(mailer.sent.length, 0, 'o envio sai depois da resposta');
    await flush();
    mailer.delayMs = 0;
    const toKnown = mailer.last('ana@example.com')!;
    assert.match(toKnown.subject, /já tem conta/);
    assert.doesNotMatch(toKnown.text, /#\/signup\//, 'conta existente nunca recebe link de cadastro');

    const signupMail = mailer.last('nova@example.com')!;
    assert.match(MemoryMailer.linkOf(signupMail)!, /^https:\/\/draw\.example\.com\/#\/signup\//);
    const signupToken = MemoryMailer.tokenOf(signupMail)!;
    const preview = json(await server.app.inject({ url: `/api/v1/signup/${signupToken}` }));
    assert.deepEqual(preview, { email: 'nova@example.com', organizationName: 'Empresa Exemplo', role: 'member' });

    assert.equal((await complete(server.app, signupToken, 'Nova Pessoa', 'curta')).statusCode, 400, 'senha fraca');
    const done = await complete(server.app, signupToken, 'Nova Pessoa');
    assert.equal(done.statusCode, 200, done.body);
    const user = json(done).user;
    assert.equal(user.role, 'member');
    assert.equal(user.emailVerified, true, 'o e-mail foi comprovado pelo link');
    const [link] = await server.ctx.db.select().from(inviteLinks).where(eq(inviteLinks.id, id));
    assert.equal(link.uses, 1);
    const [u] = await server.ctx.db.select().from(users).where(eq(users.email, 'nova@example.com'));
    assert.equal(u.createdVia, 'invite_link');
    const used = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'invite_link_used'));
    assert.equal(used.length, 1);
    assert.equal((await complete(server.app, signupToken, 'Nova Pessoa')).statusCode, 400, 'link de cadastro é de uso único');
  } finally {
    await server.close();
  }
});

test('limite de usos sob corrida: dois cadastros ao mesmo tempo num link de 1 uso → só um entra', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const { id, token } = await createLink(server.app, owner, { maxUses: 1 });
    await join(server.app, token, { email: 'um@example.com' });
    await join(server.app, token, { email: 'dois@example.com' });
    await flush();
    const t1 = MemoryMailer.tokenOf(mailer.last('um@example.com')!)!;
    const t2 = MemoryMailer.tokenOf(mailer.last('dois@example.com')!)!;
    const [a, b] = await Promise.all([complete(server.app, t1, 'Pessoa Um'), complete(server.app, t2, 'Pessoa Dois')]);
    const statuses = [a.statusCode, b.statusCode].sort();
    assert.deepEqual(statuses, [200, 422]);
    const loser = a.statusCode === 422 ? a : b;
    assert.equal(json(loser).error.message.key, 'workspace.errors.inviteLinkExhausted');
    const [link] = await server.ctx.db.select().from(inviteLinks).where(eq(inviteLinks.id, id));
    assert.equal(link.uses, 1);
    assert.equal((await server.ctx.db.select().from(users)).length, 2, 'admin + uma conta nova: a outra nem foi criada');
    // o link esgotado aparece assim na prévia, e novos pedidos são recusados
    assert.equal(json(await server.app.inject({ url: `/api/v1/join/${token}` })).status, 'exhausted');
    assert.equal((await join(server.app, token, { email: 'tres@example.com' })).statusCode, 422);
  } finally {
    await server.close();
  }
});

test('domínio do link, link revogado e vencido, limites de envio', async () => {
  const { server, admin } = await startWithMail({ LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR: '2' });
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const { id, token } = await createLink(server.app, owner, { allowedDomain: 'example.com' });
    const wrong = await join(server.app, token, { email: 'alguem@outra.com' });
    assert.equal(wrong.statusCode, 422);
    assert.equal(json(wrong).error.message.key, 'workspace.errors.inviteLinkDomainMismatch');
    assert.equal((await join(server.app, token, { email: 'x@example.com' })).statusCode, 202);
    assert.equal((await join(server.app, token, { email: 'x@example.com' })).statusCode, 202);
    assert.equal((await join(server.app, token, { email: 'x@example.com' })).statusCode, 429, 'limite por destinatário');

    await server.ctx.db.update(inviteLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(inviteLinks.id, id));
    assert.equal(json(await join(server.app, token, { email: 'y@example.com' })).error.message.key, 'workspace.errors.inviteLinkExpired');
    await server.ctx.db.update(inviteLinks).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(inviteLinks.id, id));
    assert.equal((await api(server.app, owner).op({ type: 'revokeInviteLink', id })).statusCode, 200);
    assert.equal(json(await join(server.app, token, { email: 'z@example.com' })).error.message.key, 'workspace.errors.inviteLinkRevoked');
  } finally {
    await server.close();
  }
});

test('link geral SEM e-mail: vira pedido sem senha, resposta igual para quem tem conta; aprovar gera convite e conta um uso', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const { id, token } = await createLink(server.app, owner, { maxUses: 1 });
    assert.equal(json(await server.app.inject({ url: `/api/v1/join/${token}` })).mode, 'approval');
    assert.equal((await join(server.app, token, { email: 'nova@example.com' })).statusCode, 400, 'sem e-mail o nome é obrigatório');
    const fresh = await join(server.app, token, { email: 'nova@example.com', name: 'Nova Pessoa' });
    const known = await join(server.app, token, { email: 'ana@example.com', name: 'Ana Outra' });
    assert.deepEqual(shape(known), shape(fresh));
    assert.deepEqual(json(fresh), { ok: true, mode: 'approval' });
    assert.equal((await join(server.app, token, { email: 'nova@example.com', name: 'X', password: STRONG_PASSWORD })).statusCode, 400, 'o pedido nunca aceita senha');
    await server.ctx.later!.flush();

    const rows = await server.ctx.db.select().from(accessRequests);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.kind === 'link' && r.status === 'pending' && r.inviteLinkId === id));
    assert.equal(rows.find((r) => r.email === 'ana@example.com')!.existingAccount, true);
    assert.equal(rows.find((r) => r.email === 'nova@example.com')!.existingAccount, false);
    assert.ok(!Object.keys(rows[0]).some((k) => /password/i.test(k)), 'tabela sem coluna de senha');

    const st = (await api(server.app, owner).state()) as { accessRequests: { id: string; email: string; existingAccount: boolean }[] };
    const novaReq = st.accessRequests.find((r) => r.email === 'nova@example.com')!;
    const approved = await api(server.app, owner).op({ type: 'approveAccessRequest', id: novaReq.id });
    assert.equal(approved.statusCode, 200, approved.body);
    const inviteToken = json(approved).token as string;
    assert.equal(json(approved).emailed, undefined, 'sem e-mail o convite só existe como link');
    const [link] = await server.ctx.db.select().from(inviteLinks).where(eq(inviteLinks.id, id));
    assert.equal(link.uses, 1);
    // a pessoa define a senha ao aceitar o convite (entregue pela administração)
    const accepted = await server.app.inject({ method: 'POST', url: `/api/v1/invitations/${inviteToken}/accept`, payload: { name: 'Nova Pessoa', email: 'nova@example.com', password: STRONG_PASSWORD } });
    assert.equal(accepted.statusCode, 200);
    assert.equal(json(accepted).user.emailVerified, false, 'convite entregue por link não comprova o e-mail');

    const anaReq = st.accessRequests.find((r) => r.email === 'ana@example.com')!;
    assert.equal(anaReq.existingAccount, true);
    const closed = await api(server.app, owner).op({ type: 'approveAccessRequest', id: anaReq.id });
    assert.equal(closed.statusCode, 200);
    assert.equal(json(closed).token, undefined, 'quem já tem conta não ganha convite');
  } finally {
    await server.close();
  }
});

test('convite por e-mail: sai ao criar (desligável), marca emailed_at e registra; aceitar comprova o e-mail; reenviar com permissão e limites', async () => {
  const { server, admin, mailer } = await startWithMail({ LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR: '2' });
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const off = await api(server.app, owner).op({ type: 'createInvitation', input: { email: 'sem@example.com', role: 'member', expiresInDays: 7, sendEmail: false } });
    assert.equal(off.statusCode, 200);
    assert.equal(json(off).emailed, undefined);
    assert.equal(mailer.last('sem@example.com'), undefined);

    const res = await api(server.app, owner).op({ type: 'createInvitation', input: { email: 'cora@example.com', role: 'member', expiresInDays: 7 } });
    assert.equal(json(res).emailed, true);
    const msg = mailer.last('cora@example.com')!;
    assert.match(msg.subject, /Convite para o LuDraw de Empresa Exemplo/);
    assert.match(msg.text, /Ana Admin convidou você/);
    assert.match(msg.text, /como membro/);
    const token = json(res).token as string;
    assert.equal(MemoryMailer.linkOf(msg), `https://draw.example.com/#/invite/${token}`);
    const [row] = await server.ctx.db.select().from(invitations).where(eq(invitations.id, json(res).id));
    assert.ok(row.emailedAt);
    assert.equal((await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'invitation_emailed'))).length, 1);
    const st = (await api(server.app, owner).state()) as { invitations: { id: string; emailedAt?: number | null }[] };
    assert.ok(st.invitations.find((i) => i.id === row.id)!.emailedAt);

    // reenviar: segunda mensagem; a terceira passa do limite por destinatário (2/h)
    const resend = (who: Person | string) => api(server.app, who).post(`/invitations/${row.id}/resend`, { lang: 'en' });
    assert.equal((await resend(owner)).statusCode, 200);
    assert.match(mailer.last('cora@example.com')!.subject, /Invitation to the Empresa Exemplo LuDraw/);
    assert.equal((await resend(owner)).statusCode, 429);
    // o mesmo limite vale para criar um convite novo para o mesmo endereço (recusa antes de criar)
    const blocked = await api(server.app, owner).op({ type: 'createInvitation', input: { email: 'cora@example.com', role: 'member', expiresInDays: 7, boardId: undefined } });
    assert.equal(blocked.statusCode, 429);

    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    assert.equal((await resend(bia)).statusCode, 403, 'quem não criou nem gerencia membros não reenvia');

    const accepted = await server.app.inject({ method: 'POST', url: `/api/v1/invitations/${token}/accept`, payload: { name: 'Cora', email: 'cora@example.com', password: STRONG_PASSWORD } });
    assert.equal(accepted.statusCode, 200);
    assert.equal(json(accepted).user.emailVerified, true, 'quem abriu o convite do e-mail comprovou o endereço');
    assert.equal((await resend(owner)).statusCode, 422, 'convite aceito não é reenviado');
  } finally {
    await server.close();
  }
});
