/**
 * Verificação de e-mail (Chat 08.5): pedir o link (autenticado), confirmar pelo token (sem sessão), uso
 * único, "já confirmado", limites, quem enxerga "e-mail confirmado" no estado da organização e a limpeza
 * dos tokens na manutenção.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { emailTokens, users } from '../src/db/schema';
import { sha256Hex } from '../src/lib/crypto';
import { MemoryMailer } from '../src/mail/memory';
import { runMaintenance } from '../src/maintenance';
import { api, bearer, clientHeaders, invitePerson, json, startWithMail, type Person } from './helpers';

const send = (app: FastifyInstance, token: string, payload: unknown = {}) => app.inject({ method: 'POST', url: '/api/v1/auth/email/verify/send', headers: bearer(token), payload: payload as never });
const verify = (app: FastifyInstance, token: string) => app.inject({ method: 'POST', url: '/api/v1/auth/email/verify', payload: { token }, headers: clientHeaders });
const me = async (app: FastifyInstance, token: string) => json(await app.inject({ url: '/api/v1/auth/me', headers: bearer(token) })).user;

test('verificar e-mail: link pedido pela pessoa, confirmado sem sessão, uso único; depois o servidor diz "já confirmado"', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    assert.equal((await me(server.app, admin.accessToken)).emailVerified, false, 'conta do assistente começa sem confirmação');
    assert.equal((await server.app.inject({ method: 'POST', url: '/api/v1/auth/email/verify/send', payload: {} })).statusCode, 401, 'pedir o link exige sessão');

    const sent = await send(server.app, admin.accessToken, { lang: 'en' });
    assert.equal(sent.statusCode, 202);
    assert.equal(mailer.sent.length, 0, 'envio fora do caminho da resposta');
    await flush();
    const msg = mailer.last('ana@example.com')!;
    assert.match(msg.subject, /Confirm your e-mail/);
    const link = MemoryMailer.linkOf(msg)!;
    assert.match(link, /^https:\/\/draw\.example\.com\/#\/verify\//);
    const token = MemoryMailer.tokenOf(msg)!;
    const [row] = await server.ctx.db.select().from(emailTokens);
    assert.equal(row.tokenHash, sha256Hex(token));
    assert.equal(row.purpose, 'verify_email');
    assert.equal((row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000, 60);

    // token de verificação não serve para redefinir a senha
    const asReset = await server.app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token, password: 'Outra-Senha-Forte-2027!' }, headers: clientHeaders });
    assert.equal(asReset.statusCode, 400);

    const ok = await verify(server.app, token);
    assert.equal(ok.statusCode, 200);
    assert.equal((await me(server.app, admin.accessToken)).emailVerified, true);
    const reused = await verify(server.app, token);
    assert.equal(reused.statusCode, 400);
    assert.equal(json(reused).error.message.key, 'server.errors.tokenInvalid');

    const already = await send(server.app, admin.accessToken);
    assert.equal(already.statusCode, 200);
    assert.deepEqual(json(already), { ok: true, already: true });
    await flush();
    assert.equal(mailer.sent.length, 1, 'nenhuma mensagem nova');
  } finally {
    await server.close();
  }
});

test('verificar e-mail: link vencido não confirma; limite de pedidos pela mesma pessoa', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    await send(server.app, admin.accessToken);
    await flush();
    const token = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    await server.ctx.db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailTokens.tokenHash, sha256Hex(token)));
    assert.equal((await verify(server.app, token)).statusCode, 400);
    assert.equal((await me(server.app, admin.accessToken)).emailVerified, false);

    // 5 mensagens por hora para o mesmo endereço (a primeira já contou)
    for (let i = 0; i < 4; i++) assert.equal((await send(server.app, admin.accessToken)).statusCode, 202);
    const blocked = await send(server.app, admin.accessToken);
    assert.equal(blocked.statusCode, 429);
    await flush();
    assert.equal(mailer.sent.length, 5);
  } finally {
    await server.close();
  }
});

test('"e-mail confirmado" no estado da organização: a administração vê de todos; os demais só o próprio', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    await send(server.app, bia.token);
    await flush();
    assert.equal((await verify(server.app, MemoryMailer.tokenOf(mailer.last('bia@example.com')!)!)).statusCode, 200);

    const asAdmin = (await api(server.app, owner).state()) as { directory: { id: string; emailVerified?: boolean }[]; me: { emailVerified?: boolean } };
    assert.equal(asAdmin.directory.find((a) => a.id === bia.id)!.emailVerified, true);
    assert.equal(asAdmin.directory.find((a) => a.id === admin.user.id)!.emailVerified, false);

    const asBia = (await api(server.app, bia).state()) as typeof asAdmin;
    assert.equal(asBia.directory.find((a) => a.id === bia.id)!.emailVerified, true, 'a própria pessoa vê o seu');
    assert.equal(asBia.directory.find((a) => a.id === admin.user.id)!.emailVerified, undefined, 'o dos outros não chega');
    assert.equal(asBia.me.emailVerified, true);
  } finally {
    await server.close();
  }
});

test('manutenção apaga tokens vencidos ou usados há mais de um dia e mantém os que ainda valem', async () => {
  const { server, admin, mailer, flush } = await startWithMail();
  try {
    await send(server.app, admin.accessToken);
    await flush();
    const live = MemoryMailer.tokenOf(mailer.last('ana@example.com')!)!;
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const base = { purpose: 'reset_password' as const, organizationId: admin.user.organizationId, userId: admin.user.id, email: 'ana@example.com', createdAt: old };
    await server.ctx.db.insert(emailTokens).values([
      { ...base, id: 'vencido', tokenHash: 'h-vencido', expiresAt: old },
      { ...base, id: 'usado', tokenHash: 'h-usado', expiresAt: new Date(Date.now() + 60_000), usedAt: old },
    ]);
    await runMaintenance(server.ctx);
    const left = await server.ctx.db.select().from(emailTokens);
    assert.deepEqual(left.map((r) => r.tokenHash), [sha256Hex(live)]);
    const [u] = await server.ctx.db.select().from(users).where(eq(users.id, admin.user.id));
    assert.equal(u.emailVerifiedAt, null);
  } finally {
    await server.close();
  }
});
