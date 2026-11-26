/**
 * LuDraw server — Chat 08.7 · R3 (S-12): pedido de acesso duplicado em corrida.
 *
 * Antes: o pedido conferia "já existe um aberto?" e depois inseria, dentro do trabalho adiado (`ctx.later`) — pedidos
 * simultâneos do mesmo e-mail entravam todos na fila (Postgres: 4 iguais em 12). Agora o banco garante: índice único
 * parcial `(organization_id, email)` enquanto `unconfirmed`/`pending` (migração 0008, que transforma em `rejected`
 * as duplicatas abertas que já existam, ficando a mais antiga) e insert com `onConflictDoNothing`. A resposta continua
 * 202 genérico (não revela se o pedido já existia). Roda no PGlite e no Postgres real.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { accessRequests } from '../src/db/schema';
import { api, clientHeaders, json, startConfigured, withSchemaOwner, type Person } from './helpers';

const N = 12;

test('pedidos simultâneos do mesmo e-mail (pedido direto e link de convite) deixam UM pedido aberto; respostas iguais', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    assert.equal((await api(server.app, owner).op({ type: 'updatePolicies', patch: { allowAccessRequests: true } })).statusCode, 200);
    // pedido direto (sem e-mail no servidor: entra direto na fila)
    const direct = await Promise.all(Array.from({ length: N }, (_, i) => server.app.inject({ method: 'POST', url: '/api/v1/access-requests', remoteAddress: `198.51.100.${i + 1}`, headers: clientHeaders, payload: { name: 'Pessoa', email: 'pede@example.com', lang: 'pt-BR' } })));
    await server.ctx.later?.flush();
    const accepted = direct.filter((r) => r.statusCode === 202);
    assert.ok(accepted.length >= 1);
    assert.equal(new Set(accepted.map((r) => r.body)).size, 1, 'mesmo corpo em todas as respostas aceitas');
    const open = await server.ctx.db.select().from(accessRequests).where(and(eq(accessRequests.email, 'pede@example.com')));
    assert.equal(open.filter((r) => r.status === 'pending' || r.status === 'unconfirmed').length, 1, `pedidos abertos: ${open.length}`);
    // pelo link de convite geral (sem e-mail no servidor: vira pedido na fila)
    const link = json(await api(server.app, owner).op({ type: 'createInviteLink', input: { role: 'member', expiresInDays: 7, maxUses: 50 } }));
    const joins = await Promise.all(Array.from({ length: N }, (_, i) => server.app.inject({ method: 'POST', url: `/api/v1/join/${link.token}`, remoteAddress: `198.51.100.${50 + i}`, headers: clientHeaders, payload: { email: 'pelo-link@example.com', name: 'Pelo Link', lang: 'pt-BR' } })));
    await server.ctx.later?.flush();
    assert.equal(new Set(joins.filter((r) => r.statusCode === 202).map((r) => r.body)).size, 1);
    const viaLink = await server.ctx.db.select().from(accessRequests).where(eq(accessRequests.email, 'pelo-link@example.com'));
    assert.equal(viaLink.filter((r) => r.status === 'pending' || r.status === 'unconfirmed').length, 1, `pedidos abertos pelo link: ${viaLink.length}`);
  } finally {
    await server.close();
  }
});

test('migração 0008: duplicatas abertas que já existiam viram "rejected" (fica a mais antiga) e o índice passa a valer', async () => {
  const { server, admin } = await startConfigured();
  try {
    const dir = join(import.meta.dirname, '..', 'drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0008_') && f.endsWith('.sql'));
    assert.ok(file, 'migração 0008 existe');
    const statements = readFileSync(join(dir, file!), 'utf8').split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    const db = server.ctx.db;
    const org = admin.user.organizationId;
    // volta ao estado anterior à 0008 (sem o índice) e cria duplicatas como as que a corrida deixava
    // Chat 09 · R1: DDL e a migração pelo papel de migração (a aplicação não muda o esquema)
    await withSchemaOwner(server, (owner) => owner.execute(sql.raw('DROP INDEX IF EXISTS "access_requests_open_email"')));
    const base = Date.now() - 60_000;
    const row = (id: string, email: string, status: 'pending' | 'unconfirmed' | 'approved', t: number) => ({ id, organizationId: org, kind: 'email' as const, email, name: 'Dup', status, createdAt: new Date(base + t) });
    await db.insert(accessRequests).values([
      row('dup-antigo-1', 'dup@example.com', 'pending', 0),
      row('dup-novo-2', 'dup@example.com', 'pending', 1000),
      row('dup-novo-3', 'dup@example.com', 'unconfirmed', 2000),
      row('outro-unico', 'unico@example.com', 'pending', 0),
      row('ja-aprovado', 'dup@example.com', 'approved', -5000),
    ]);
    await withSchemaOwner(server, async (owner) => {
      for (const st of statements) await owner.execute(sql.raw(st));
    });
    const rows = await db.select().from(accessRequests).where(sql`${accessRequests.id} in ('dup-antigo-1','dup-novo-2','dup-novo-3','outro-unico','ja-aprovado')`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    assert.deepEqual(byId, { 'dup-antigo-1': 'pending', 'dup-novo-2': 'rejected', 'dup-novo-3': 'rejected', 'outro-unico': 'pending', 'ja-aprovado': 'approved' });
    // o índice vale: outro pedido aberto do mesmo e-mail é recusado pelo banco
    await assert.rejects(db.insert(accessRequests).values(row('dup-novo-4', 'dup@example.com', 'pending', 3000)));
  } finally {
    await server.close();
  }
});
