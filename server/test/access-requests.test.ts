/**
 * Chat 08.5 · B — fila de pedidos de acesso: política desligada por padrão (rota "não existe"), resposta igual
 * para quem já é membro, pedido não confirmado invisível até o link do e-mail, tetos (abertos, não confirmados no
 * total e por IP), aprovar → convite por e-mail → aceitar, recusar, permissões, limpeza em 24 h.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { ACCESS_REQUEST_LIMITS } from '../../src/utils/apiContract';
import { createId } from '../../src/utils/id';
import { accessRequests } from '../src/db/schema';
import { MemoryMailer } from '../src/mail/memory';
import { runMaintenance } from '../src/maintenance';
import { api, clientHeaders, invitePerson, json, startConfigured, startWithMail, STRONG_PASSWORD, type Person } from './helpers';

const ask = (app: FastifyInstance, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/access-requests', payload: body, headers: { ...clientHeaders, ...headers } });
const confirm = (app: FastifyInstance, token: string) => app.inject({ method: 'POST', url: '/api/v1/access-requests/confirm', payload: { token }, headers: clientHeaders });

function shape(res: LightMyRequestResponse) {
  const headers = { ...res.headers };
  for (const h of ['date', 'x-ratelimit-remaining', 'x-ratelimit-reset']) delete headers[h];
  return { status: res.statusCode, body: res.body, headers };
}

async function enable(app: FastifyInstance, owner: Person) {
  const r = await api(app, owner).op({ type: 'updatePolicies', patch: { allowAccessRequests: true } });
  assert.equal(r.statusCode, 200, r.body);
}

test('política desligada por padrão: /info sem pedidos e a rota responde 404', async () => {
  const { server, admin } = await startWithMail();
  try {
    assert.equal(json(await server.app.inject({ url: '/api/v1/info' })).accessRequests, false);
    assert.equal((await ask(server.app, { name: 'Caio', email: 'caio@example.com' })).statusCode, 404);
    await enable(server.app, { token: admin.accessToken, id: admin.user.id });
    assert.equal(json(await server.app.inject({ url: '/api/v1/info' })).accessRequests, true);
  } finally {
    await server.close();
  }
});

test('com e-mail: resposta igual para membro e não membro; não confirmado invisível; confirmar põe na fila; aprovar → convite por e-mail → aceitar', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    await enable(server.app, owner);
    mailer.delayMs = 200;
    const outsider = await ask(server.app, { name: 'Caio Silva', email: 'Caio@Example.com', message: 'Sou do time de vendas.' });
    const member = await ask(server.app, { name: 'Ana', email: 'ana@example.com' });
    assert.equal(outsider.statusCode, 202);
    assert.deepEqual(shape(member), shape(outsider));
    assert.equal(mailer.sent.length, 0, 'a resposta não espera nada');
    await flush();
    mailer.delayMs = 0;
    assert.match(mailer.last('ana@example.com')!.subject, /já tem acesso/);
    const confirmMail = mailer.last('caio@example.com')!;
    assert.match(MemoryMailer.linkOf(confirmMail)!, /^https:\/\/draw\.example\.com\/#\/access\//);

    const [row] = await server.ctx.db.select().from(accessRequests);
    assert.equal(row.status, 'unconfirmed');
    assert.ok(row.requesterIpHash && !row.requesterIpHash.includes('127.0.0.1'), 'IP só como HMAC');
    const before = (await api(server.app, owner).state()) as { accessRequests: unknown[] };
    assert.equal(before.accessRequests.length, 0, 'não confirmado não aparece para a administração');

    assert.equal((await confirm(server.app, MemoryMailer.tokenOf(confirmMail)!)).statusCode, 200);
    const [confirmed] = await server.ctx.db.select().from(accessRequests);
    assert.equal(confirmed.status, 'pending');
    assert.equal(confirmed.requesterIpHash, null, 'o IP sai ao confirmar');
    assert.equal((await confirm(server.app, MemoryMailer.tokenOf(confirmMail)!)).statusCode, 400, 'uso único');

    const st = (await api(server.app, owner).state()) as { accessRequests: { id: string; email: string; name: string; message: string; emailConfirmed: boolean }[] };
    assert.equal(st.accessRequests.length, 1);
    assert.deepEqual({ ...st.accessRequests[0], id: '' }, { ...st.accessRequests[0], id: '', email: 'caio@example.com', name: 'Caio Silva', message: 'Sou do time de vendas.', emailConfirmed: true });

    // só membro ou convidado; admin só por convite direto
    const reqId = st.accessRequests[0].id;
    assert.equal((await api(server.app, owner).op({ type: 'approveAccessRequest', id: reqId, grant: { role: 'admin', expiresInDays: 7 } })).statusCode, 400);
    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    assert.equal((await api(server.app, bia).op({ type: 'approveAccessRequest', id: reqId, grant: { role: 'member', expiresInDays: 7 } })).statusCode, 403);
    const approved = await api(server.app, owner).op({ type: 'approveAccessRequest', id: reqId, grant: { role: 'member', expiresInDays: 7 } }, undefined);
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(json(approved).emailed, true);
    const invite = mailer.last('caio@example.com')!;
    assert.match(invite.subject, /Convite para o LuDraw/);
    const accepted = await server.app.inject({ method: 'POST', url: `/api/v1/invitations/${MemoryMailer.tokenOf(invite)}/accept`, payload: { name: 'Caio Silva', email: 'caio@example.com', password: STRONG_PASSWORD } });
    assert.equal(accepted.statusCode, 200);
    assert.equal(json(accepted).user.role, 'member');
    assert.equal(json(accepted).user.emailVerified, true);
    assert.equal((await api(server.app, owner).op({ type: 'rejectAccessRequest', id: reqId })).statusCode, 422, 'já decidido');
  } finally {
    await server.close();
  }
});

test('sem e-mail: o pedido entra direto, marcado "não confirmado"; um aberto por e-mail; recusar', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    await enable(server.app, owner);
    assert.equal((await ask(server.app, { name: 'Caio', email: 'caio@example.com', password: 'x' })).statusCode, 400, 'pedido nunca leva senha');
    assert.equal((await ask(server.app, { name: 'Caio', email: 'caio@example.com' })).statusCode, 202);
    assert.equal((await ask(server.app, { name: 'Caio de novo', email: 'caio@example.com' })).statusCode, 202);
    await server.ctx.later!.flush();
    const st = (await api(server.app, owner).state()) as { accessRequests: { id: string; name: string; emailConfirmed: boolean; status: string }[] };
    assert.equal(st.accessRequests.length, 1, 'um pedido aberto por e-mail');
    assert.equal(st.accessRequests[0].name, 'Caio');
    assert.equal(st.accessRequests[0].emailConfirmed, false);
    const rejected = await api(server.app, owner).op({ type: 'rejectAccessRequest', id: st.accessRequests[0].id });
    assert.equal(rejected.statusCode, 200);
    const after = (await api(server.app, owner).state()) as typeof st;
    assert.equal(after.accessRequests[0].status, 'rejected');
  } finally {
    await server.close();
  }
});

test('tetos: pedidos abertos, não confirmados por IP e no total — o excedente é descartado com a mesma resposta', async () => {
  // proxy confiável: o teste simula IPs diferentes por X-Forwarded-For
  const { server, admin, mailer, flush } = await startWithMail({ LUDRAW_MAIL_MAX_PER_IP_HOUR: '1000', LUDRAW_TRUST_PROXY: 'true' });
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    await enable(server.app, owner);
    // por IP: só os primeiros não confirmados vindos do mesmo endereço
    for (let i = 0; i < ACCESS_REQUEST_LIMITS.maxUnconfirmedPerIp + 2; i++) assert.equal((await ask(server.app, { name: 'Pessoa', email: `p${i}@example.com` }, { 'x-forwarded-for': '10.0.0.1' })).statusCode, 202);
    await flush();
    const unconfirmed = await server.ctx.db.select().from(accessRequests).where(eq(accessRequests.status, 'unconfirmed'));
    assert.equal(unconfirmed.length, ACCESS_REQUEST_LIMITS.maxUnconfirmedPerIp);
    assert.equal(mailer.sent.length, ACCESS_REQUEST_LIMITS.maxUnconfirmedPerIp, 'o excedente não recebe e-mail');

    // outro IP passa (é o teto POR IP)
    assert.equal((await ask(server.app, { name: 'Outra', email: 'outra@example.com' }, { 'x-forwarded-for': '10.0.0.9' })).statusCode, 202);
    await flush();
    assert.equal((await server.ctx.db.select().from(accessRequests).where(eq(accessRequests.email, 'outra@example.com'))).length, 1, 'o teto por IP não atinge outro IP');

    // no total: com o teto geral cheio, ninguém mais entra
    const orgId = admin.user.organizationId;
    const filler = Array.from({ length: ACCESS_REQUEST_LIMITS.maxUnconfirmed }, (_, i) => ({ id: createId(16), organizationId: orgId, kind: 'email' as const, email: `f${i}@example.com`, name: 'F', status: 'unconfirmed' as const, requesterIpHash: `ip${i}` }));
    await server.ctx.db.insert(accessRequests).values(filler);
    const sentBefore = mailer.sent.length;
    assert.equal((await ask(server.app, { name: 'Mais', email: 'mais@example.com' }, { 'x-forwarded-for': '10.0.0.10' })).statusCode, 202);
    await flush();
    assert.equal(mailer.sent.length, sentBefore);
    assert.equal((await server.ctx.db.select().from(accessRequests).where(eq(accessRequests.email, 'mais@example.com'))).length, 0);

    // limpeza: não confirmados com mais de 24 h somem
    await server.ctx.db.update(accessRequests).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(accessRequests.status, 'unconfirmed'));
    await runMaintenance(server.ctx);
    assert.equal((await server.ctx.db.select().from(accessRequests)).length, 0);
  } finally {
    await server.close();
  }
});

test('teto da fila: com 200 pedidos esperando, confirmar responde "fila cheia" e o pedido sem e-mail é descartado', async () => {
  const noMail = await startConfigured();
  try {
    const owner: Person = { token: noMail.admin.accessToken, id: noMail.admin.user.id };
    await enable(noMail.server.app, owner);
    const orgId = noMail.admin.user.organizationId;
    await noMail.server.ctx.db.insert(accessRequests).values(Array.from({ length: ACCESS_REQUEST_LIMITS.maxOpen }, (_, i) => ({ id: createId(16), organizationId: orgId, kind: 'email' as const, email: `q${i}@example.com`, name: 'Q', status: 'pending' as const })));
    assert.equal((await ask(noMail.server.app, { name: 'Caio', email: 'caio@example.com' })).statusCode, 202);
    await noMail.server.ctx.later!.flush();
    assert.equal((await noMail.server.ctx.db.select().from(accessRequests).where(eq(accessRequests.email, 'caio@example.com'))).length, 0);
  } finally {
    await noMail.server.close();
  }

  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    await enable(server.app, owner);
    await ask(server.app, { name: 'Caio', email: 'caio@example.com' });
    await flush();
    const orgId = admin.user.organizationId;
    await server.ctx.db.insert(accessRequests).values(Array.from({ length: ACCESS_REQUEST_LIMITS.maxOpen }, (_, i) => ({ id: createId(16), organizationId: orgId, kind: 'email' as const, email: `q${i}@example.com`, name: 'Q', status: 'pending' as const })));
    const res = await confirm(server.app, MemoryMailer.tokenOf(mailer.last('caio@example.com')!)!);
    assert.equal(res.statusCode, 503);
    assert.equal(json(res).error.code, 'accessQueueFull');
  } finally {
    await server.close();
  }
});
