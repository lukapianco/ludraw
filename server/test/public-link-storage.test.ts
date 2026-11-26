/**
 * LuDraw server — Chat 08.7 · R5 (S-17): token do link público fora do banco em texto.
 *
 *  - Busca pelo hash (`token_hash`, sha256 hex). Texto puro nunca é gravado em link novo.
 *  - Cópia cifrada (`token_enc`) SÓ quando a chave vem do ambiente (LUDRAW_JWT_SECRET): quem compartilha continua
 *    copiando o link. Com a chave guardada no próprio banco a cifra não protegeria nada: só o hash, e o endereço
 *    aparece uma única vez (na criação), como no link de convite geral.
 *  - Migração 0009 em DUAS FASES: o SQL só acrescenta e preenche o hash; o passo do boot (`secureLegacyPublicLinks`)
 *    só zera o texto depois de conferir que todo link tem hash e que o hash confere com o token — senão o boot para
 *    com erro e nada é apagado. Links antigos e acessos de visitante já emitidos continuam valendo.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { buildApp } from '../src/app';
import { hashPassword } from '../src/auth/passwords';
import { signVisitorToken } from '../src/auth/tokens';
import { publicLinks } from '../src/db/schema';
import { Sealer, sha256Hex } from '../src/lib/crypto';
import { api, clientHeaders, createBoard, json, startConfigured, withSchemaOwner, type Person } from './helpers';

const JWT = `r5-${randomBytes(30).toString('base64url')}`;
const newToken = () => randomBytes(24).toString('base64url'); // 32 caracteres (S-18)

type Started = Awaited<ReturnType<typeof startConfigured>> & { owner: Person };

async function boot(envMode: boolean): Promise<Started & { owner: Person }> {
  const s = await startConfigured(envMode ? { LUDRAW_JWT_SECRET: JWT } : {});
  return { ...s, owner: { token: s.admin.accessToken, id: s.admin.user.id } };
}

async function rawLinks(s: Started) {
  const r = await s.server.ctx.db.execute(sql.raw('select board_id, token, token_hash, token_enc from public_links order by board_id'));
  return ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as Array<{ board_id: string; token: string | null; token_hash: string | null; token_enc: string | null }>;
}

const resolve = (s: Started, token: string) => s.server.app.inject({ url: `/api/v1/public/links/${token}` });
const openSession = (s: Started, token: string, password?: string) =>
  s.server.app.inject({ method: 'POST', url: `/api/v1/public/links/${token}/session`, payload: password === undefined ? {} : { password }, headers: clientHeaders });

async function modules() {
  const m = await import('../src/public/linkStorage').catch(() => null);
  assert.ok(m, 'server/src/public/linkStorage.ts existe (secureLegacyPublicLinks)');
  return m!;
}

test('S-17 · chave do ambiente: banco sem o token em texto; hash + cópia cifrada; quem compartilha recebe o token', async () => {
  const s = await boot(true);
  try {
    const board = await createBoard(s.server.app, s.owner);
    const token = newToken();
    const r = await api(s.server.app, s.owner).op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true, accessLevel: 'viewer' }, token });
    assert.equal(r.statusCode, 200, r.body);
    const [row] = await rawLinks(s);
    assert.equal(row.token, null, 'nada de texto puro');
    assert.equal(row.token_hash, sha256Hex(token));
    assert.ok(row.token_enc, 'cópia cifrada (chave do ambiente)');
    assert.equal(new Sealer(JWT, 'public-link-token').open(row.token_enc!), token);
    const st = (await api(s.server.app, s.owner).state()) as { boards: Array<{ id: string; publicLink?: { token: string } }> };
    assert.equal(st.boards.find((b) => b.id === board.id)?.publicLink?.token, token, '"Copiar link" continua funcionando');
    assert.equal(json(await resolve(s, token)).status, 'ok');
  } finally {
    await s.server.close();
  }
});

test('S-17 · chave no banco: só o hash; o endereço aparece só na criação (estado traz "" e a impressão)', async () => {
  const s = await boot(false);
  try {
    const board = await createBoard(s.server.app, s.owner);
    const token = newToken();
    const r = await api(s.server.app, s.owner).op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true, accessLevel: 'viewer' }, token });
    assert.equal(r.statusCode, 200, r.body);
    const [row] = await rawLinks(s);
    assert.equal(row.token, null);
    assert.equal(row.token_enc, null, 'sem cópia cifrada: a chave está no próprio banco');
    assert.equal(row.token_hash, sha256Hex(token));
    const st = (await api(s.server.app, s.owner).state()) as { boards: Array<{ id: string; publicLink?: { token: string; tokenPrint?: string } }> };
    const link = st.boards.find((b) => b.id === board.id)?.publicLink;
    assert.equal(link?.token, '');
    assert.equal(link?.tokenPrint, sha256Hex(token).slice(0, 12));
    assert.equal(json(await resolve(s, token)).status, 'ok', 'o link abre');
    assert.equal((await openSession(s, token)).statusCode, 200);
    // mudar o nível não troca o link (o cliente não conhece o token depois de recarregar)
    assert.equal((await api(s.server.app, s.owner).op({ type: 'setPublicLink', boardId: board.id, patch: { accessLevel: 'commenter' }, token: newToken() })).statusCode, 200);
    assert.equal((await rawLinks(s))[0].token_hash, sha256Hex(token), 'mesmo link');
    // gerar de novo: o antigo para de abrir, o novo abre
    const fresh = newToken();
    assert.equal((await api(s.server.app, s.owner).op({ type: 'regeneratePublicLink', boardId: board.id, token: fresh })).statusCode, 200);
    assert.notEqual(json(await resolve(s, token)).status, 'ok');
    assert.equal(json(await resolve(s, fresh)).status, 'ok');
  } finally {
    await s.server.close();
  }
});

/** Volta o banco ao estado anterior à 0009 e grava links como o código antigo gravava (texto puro). */
async function legacyLinks(s: Started) {
  const db = s.server.ctx.db;
  const a = await createBoard(s.server.app, s.owner, { name: 'Antigo aberto' });
  const b = await createBoard(s.server.app, s.owner, { name: 'Antigo com senha' });
  for (const st of [
    'DROP INDEX IF EXISTS "public_links_token_hash"',
    'ALTER TABLE "public_links" DROP COLUMN "token_hash"',
    'ALTER TABLE "public_links" DROP COLUMN "token_enc"',
    'ALTER TABLE "public_links" ALTER COLUMN "token" SET NOT NULL',
    'ALTER TABLE "oidc_requests" DROP COLUMN "browser_hash"',
  ])
    // Chat 09 · R1: DDL pelo papel de migração (a aplicação não muda o esquema)
    await withSchemaOwner(s.server, (owner) => owner.execute(sql.raw(st)));
  const tokA = `legado${randomBytes(9).toString('base64url')}`; // tokens antigos tinham 18–24 caracteres
  const tokB = randomBytes(18).toString('base64url');
  const pw = await hashPassword('Senha-Do-Link-Antigo-1');
  await db.execute(sql`insert into public_links (board_id, token, enabled, access_level, created_by) values (${a.id}, ${tokA}, true, 'viewer', ${s.owner.id})`);
  await db.execute(sql`insert into public_links (board_id, token, enabled, access_level, password_hash, created_by) values (${b.id}, ${tokB}, true, 'viewer', ${pw}, ${s.owner.id})`);
  // um acesso de visitante emitido ANTES da migração (impressão = sha256(token) como o código antigo calculava)
  const visitor = await signVisitorToken(s.server.ctx.keys.jwt, { boardId: a.id, visitorId: 'visitante:antes', linkPrint: sha256Hex(tokA).slice(0, 24) });
  return { a, b, tokA, tokB, visitor };
}

async function applySql0009(s: Started) {
  const dir = join(import.meta.dirname, '..', 'drizzle');
  const file = readdirSync(dir).find((f) => f.startsWith('0009_') && f.endsWith('.sql'));
  assert.ok(file, 'migração 0009 existe');
  const statements = readFileSync(join(dir, file!), 'utf8').split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean);
  await withSchemaOwner(s.server, async (owner) => {
    for (const st of statements) await owner.execute(sql.raw(st));
  });
}

for (const envMode of [true, false]) {
  test(`S-17 · migração dos links existentes (${envMode ? 'chave do ambiente' : 'chave no banco'}): fase 1 só acrescenta; fase 2 confere e zera; nada quebra`, async () => {
    const s = await boot(envMode);
    try {
      const { secureLegacyPublicLinks } = await modules();
      const old = await legacyLinks(s);
      await applySql0009(s);
      // fase 1: o texto continua lá, o hash foi preenchido pelo SQL
      const phase1 = await rawLinks(s);
      assert.deepEqual(phase1.map((r) => r.token).sort(), [old.tokA, old.tokB].sort(), 'o SQL não apaga o texto');
      assert.ok(phase1.every((r) => r.token && r.token_hash === sha256Hex(r.token)), 'hash preenchido e conferível');
      // fase 2: o passo do boot
      const report = await secureLegacyPublicLinks(s.server.ctx.db, s.server.ctx.keys);
      assert.equal(report.secured, 2);
      const phase2 = await rawLinks(s);
      assert.ok(phase2.every((r) => r.token === null), 'nenhum token em texto depois da fase 2');
      if (envMode) {
        const sealer = new Sealer(JWT, 'public-link-token');
        assert.deepEqual(phase2.map((r) => sealer.open(r.token_enc!)).sort(), [old.tokA, old.tokB].sort(), 'cópia cifrada decifra para o MESMO token');
      } else assert.ok(phase2.every((r) => r.token_enc === null), 'chave no banco: sem cópia cifrada');
      // nada quebrou: os dois links antigos abrem (com senha também) e o visitante de antes continua lendo
      assert.equal(json(await resolve(s, old.tokA)).status, 'ok');
      assert.equal(json(await resolve(s, old.tokB)).status, 'password');
      assert.equal((await openSession(s, old.tokB, 'Senha-Do-Link-Antigo-1')).statusCode, 200);
      const read = await s.server.app.inject({ url: `/api/v1/public/boards/${old.a.id}/data`, headers: { authorization: `Bearer ${old.visitor}` } });
      assert.equal(read.statusCode, 200, `acesso de visitante emitido antes da migração: ${read.body}`);
      // repetir o passo (cada boot) não muda nada
      const again = await secureLegacyPublicLinks(s.server.ctx.db, s.server.ctx.keys);
      assert.equal(again.secured, 0);
      assert.deepEqual(await rawLinks(s), phase2);
      assert.equal(json(await resolve(s, old.tokA)).status, 'ok');
    } finally {
      await s.server.close();
    }
  });
}

test('S-17 · fase 2 recusa quando o hash não confere ou falta: o boot para com erro claro e nenhum texto é apagado', async () => {
  const s = await boot(true);
  try {
    const { secureLegacyPublicLinks } = await modules();
    const old = await legacyLinks(s);
    await applySql0009(s);
    await s.server.ctx.db.execute(sql`update public_links set token_hash = ${sha256Hex('outro-token')} where board_id = ${old.a.id}`);
    await assert.rejects(secureLegacyPublicLinks(s.server.ctx.db, s.server.ctx.keys), /public_links[\s\S]*hash/i);
    assert.deepEqual((await rawLinks(s)).map((r) => r.token).sort(), [old.tokA, old.tokB].sort(), 'nada apagado');
    // o boot do app também para (o passo roda no buildApp)
    await assert.rejects(buildApp(s.server.ctx, false), /public_links/);
    // hash vazio = "falta hash": também recusa
    await s.server.ctx.db.execute(sql`update public_links set token_hash = ${sha256Hex(old.tokA)} where board_id = ${old.a.id}`);
    await s.server.ctx.db.execute(sql`update public_links set token_hash = '' where board_id = ${old.b.id}`);
    await assert.rejects(secureLegacyPublicLinks(s.server.ctx.db, s.server.ctx.keys), /public_links/);
    assert.deepEqual((await rawLinks(s)).map((r) => r.token).sort(), [old.tokA, old.tokB].sort(), 'nada apagado');
    // corrigido o hash, o passo conclui
    await s.server.ctx.db.execute(sql`update public_links set token_hash = ${sha256Hex(old.tokB)} where board_id = ${old.b.id}`);
    assert.equal((await secureLegacyPublicLinks(s.server.ctx.db, s.server.ctx.keys)).secured, 2);
    assert.ok((await rawLinks(s)).every((r) => r.token === null));
    assert.ok(await s.server.ctx.db.select().from(publicLinks).where(eq(publicLinks.boardId, old.a.id)));
  } finally {
    await s.server.close();
  }
});

test('S-17 · cliente: o token desta sessão continua enquanto a impressão do servidor for a mesma', async () => {
  const { keepSessionLinkTokens, publicLinkHidden } = await import('../../src/utils/workspace');
  const meta = (id: string, link?: { token: string; tokenPrint?: string }) => ({ id, publicLink: link ? { enabled: true, accessLevel: 'viewer' as const, ...link } : undefined }) as never;
  const T = newToken();
  const P = sha256Hex(T).slice(0, 12);
  const known = new Map();
  // a resposta da criação traz o token (uma vez): a aba guarda na memória
  keepSessionLinkTokens([meta('a', { token: T, tokenPrint: P }), meta('b', { token: 'outro', tokenPrint: 'x' })], known);
  const incoming = [meta('a', { token: '', tokenPrint: P }), meta('b', { token: '', tokenPrint: 'trocado' }), meta('c', { token: '', tokenPrint: 'y' })];
  const out = keepSessionLinkTokens(incoming, known) as Array<{ id: string; publicLink: { token: string } }>;
  assert.equal(out[0].publicLink.token, T, 'mesma impressão: o endereço continua visível nesta sessão');
  assert.equal(out[1].publicLink.token, '', 'link trocado em outro lugar: não reaproveita o token velho');
  assert.equal(out[2].publicLink.token, '');
  assert.equal(publicLinkHidden(out[1].publicLink as never), true, 'a Ficha oferece "Gerar link novo"');
  assert.equal(publicLinkHidden(out[0].publicLink as never), false);
  assert.equal(publicLinkHidden(undefined), false);
  // aba recarregada = memória vazia: o endereço não volta, mesmo que o estado salvo no navegador ainda o tenha
  assert.equal((keepSessionLinkTokens(incoming, new Map()) as Array<{ publicLink: { token: string } }>)[0].publicLink.token, '');
});
