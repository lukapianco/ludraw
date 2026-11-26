/**
 * Chat 08.2 · A-2 (1): imagens do Modo Servidor fora do documento ao vivo.
 * Limite de 12 MB conferido no campo REAL (`dataUrl`, e o legado `src`) em PUT, criação, importação e veto; envio
 * (`board.edit`, tipo pelos bytes, SVG disfarçado, excesso, disco com falha); leitura (`can('board.view')`, lixeira,
 * conta suspensa, visitante só do próprio board e com token válido, hash adulterado, arquivo adulterado, cabeçalhos);
 * prova de acesso entre boards; migração preguiçosa não destrutiva com época nova; veto; órfãos; subida sem pasta.
 */
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { applyLocalChange, readElement, readSlice, rootsOf, seedDoc, boardDataToSlice } from '../../src/collab/codec';
import type { BoardData, CanvasElement } from '../../src/types/canvas';
import { assetRef, ASSET_MAX_BYTES } from '../../src/utils/assetRefs';
import { collectOrphanAssets, ORPHAN_GRACE_MS } from '../src/assets/service';
import { AssetStoreError } from '../src/assets/store';
import { signVisitorToken } from '../src/auth/tokens';
import { boardAssetLinks, boardAssets, boards, boardYdocs, orgMemberships, templates } from '../src/db/schema';
import { sha256Hex as sha256Text } from '../src/assets/store';
import { sha256Hex as sha256OfText } from '../src/lib/crypto';
import { connectClient, listen, until } from './collab-helpers';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, startServer, sticky, type Person } from './helpers';

/** Bytes que começam como PNG (o servidor confere a assinatura, não decodifica a imagem). */
function pngBytes(size: number, seed = 1): Buffer {
  const b = Buffer.alloc(size, seed);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b;
}
const dataUrlOf = (b: Buffer, mime = 'image/png') => `data:${mime};base64,${b.toString('base64')}`;
const image = (id: string, dataUrl: string, extra: Record<string, unknown> = {}) => ({ id, type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, createdAt: 1, updatedAt: 1, dataUrl, naturalWidth: 10, naturalHeight: 10, ...extra });
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function scenario(env: Record<string, string> = {}) {
  const { server, admin } = await startConfigured(env);
  const ana: Person = { token: admin.accessToken, id: admin.user.id };
  const edi = await invitePerson(server.app, ana, { email: 'edi@example.com', name: 'Edi Tor' });
  const caio = await invitePerson(server.app, ana, { email: 'caio@example.com', name: 'Caio Leitor' });
  const board = await createBoard(server.app, ana, { data: emptyBoard({ s1: sticky('s1', 'oi', { createdBy: ana.id }) }) });
  await api(server.app, ana).op({ type: 'setBoardMember', boardId: board.id, userId: edi.id, role: 'editor' });
  await api(server.app, ana).op({ type: 'setBoardMember', boardId: board.id, userId: caio.id, role: 'commenter' });
  const upload = (who: Person | string, boardId: string, bytes: Buffer, contentType = 'application/octet-stream', query = '') =>
    server.app.inject({ method: 'POST', url: `/api/v1/boards/${boardId}/assets${query}`, payload: bytes, headers: { 'content-type': contentType, authorization: `Bearer ${typeof who === 'string' ? who : who.token}` } });
  const get = (who: Person | string | null, hash: string, query = '') =>
    server.app.inject({ method: 'GET', url: `/api/v1/assets/${hash}${query}`, headers: who ? { authorization: `Bearer ${typeof who === 'string' ? who : who.token}` } : {} });
  const dataOf = async (id: string) => (await server.ctx.db.select().from(boards).where(eq(boards.id, id)))[0].data as unknown as BoardData;
  return { server, ana, edi, caio, board, upload, get, dataOf };
}

test('(1) limite de 12 MB no campo real (dataUrl e src) em PUT, criação, importação; 1 MB aceito e vira arquivo', async () => {
  const s = await scenario();
  try {
    const huge = `data:image/png;base64,${'A'.repeat(12 * 1024 * 1024 + 16)}`;
    for (const field of ['dataUrl', 'src']) {
      const el = { ...image('big', ''), dataUrl: undefined, [field]: huge };
      const put = await api(s.server.app, s.ana).put(`/boards/${s.board.id}/data`, emptyBoard({ big: el }), 0);
      assert.equal(put.statusCode, 422, field);
      assert.equal(json(put).error.message.key, 'server.errors.imageTooLarge', `PUT ${field}`);
      const created = await api(s.server.app, s.ana).post('/boards', { name: 'X', place: { kind: 'personal' }, data: emptyBoard({ big: el }) });
      assert.equal(json(created).error.message.key, 'server.errors.imageTooLarge', `criação ${field}`);
      const imported = await api(s.server.app, s.ana).post('/boards', { name: 'X', place: { kind: 'personal' }, data: emptyBoard({ big: el }), importFrom: { kind: 'local', sourceId: `big-${field}` } });
      assert.equal(json(imported).error.message.key, 'server.errors.imageTooLarge', `importação ${field}`);
    }
    // regressão do Chat 07: imagem de 200 mil caracteres NÃO é "texto longo demais"
    const mb = pngBytes(1024 * 1024);
    const put = await api(s.server.app, s.ana).put(`/boards/${s.board.id}/data`, emptyBoard({ i1: image('i1', dataUrlOf(mb), { createdBy: s.ana.id }) }), 0);
    assert.equal(put.statusCode, 200, put.body);
    const stored = (await s.dataOf(s.board.id)).elements.i1 as unknown as { dataUrl: string };
    assert.equal(stored.dataUrl, assetRef(sha256Text(mb)), 'a imagem de 1 MB virou referência');
    const created = await api(s.server.app, s.ana).post('/boards', { name: 'Com imagem', place: { kind: 'personal' }, data: emptyBoard({ i1: image('i1', dataUrlOf(mb)) }) });
    assert.equal(created.statusCode, 200);
    const imported = await api(s.server.app, s.ana).post('/boards', { name: 'Importado', place: { kind: 'personal' }, data: emptyBoard({ i1: image('i1', dataUrlOf(pngBytes(1024 * 1024, 7))) }), importFrom: { kind: 'local', sourceId: 'mb' } });
    assert.equal(imported.statusCode, 200);
    assert.match(((await s.dataOf(json(imported).board.id)).elements.i1 as unknown as { dataUrl: string }).dataUrl, /^asset:[a-f0-9]{64}$/);
    // envio direto: 1 MB aceito, 12 MB + 1 recusado
    assert.equal((await s.upload(s.ana, s.board.id, pngBytes(1024 * 1024, 3))).statusCode, 200);
    const over = await s.upload(s.ana, s.board.id, pngBytes(ASSET_MAX_BYTES + 1));
    assert.equal(over.statusCode, 413);
    assert.equal(json(over).error.message.key, 'server.errors.imageTooLarge');
  } finally {
    await s.server.close();
  }
});

test('(1) envio: exige board.edit; tipo pelos bytes (SVG disfarçado de PNG recusado); falha de disco = erro claro e nada referenciado', async () => {
  const s = await scenario();
  try {
    assert.equal((await s.upload(s.caio, s.board.id, pngBytes(100))).statusCode, 403, 'comentador não envia');
    assert.equal((await s.server.app.inject({ method: 'POST', url: `/api/v1/boards/${s.board.id}/assets`, payload: pngBytes(100), headers: { 'content-type': 'application/octet-stream' } })).statusCode, 401);
    const disguised = await s.upload(s.ana, s.board.id, SVG, 'image/png');
    assert.equal(disguised.statusCode, 415);
    assert.equal(json(disguised).error.message.key, 'server.errors.unsupportedImage');
    assert.equal((await s.upload(s.ana, s.board.id, SVG, 'image/svg+xml')).statusCode, 415);
    const ok = await s.upload(s.edi, s.board.id, pngBytes(500));
    assert.equal(ok.statusCode, 200);
    assert.equal(json(ok).mime, 'image/png');
    // disco cheio
    const store = s.server.ctx.assets!;
    const original = store.put.bind(store);
    store.put = async () => {
      throw new AssetStoreError('writeFailed', 'ENOSPC');
    };
    const bytes = pngBytes(600, 9);
    const failed = await s.upload(s.ana, s.board.id, bytes);
    store.put = original;
    assert.equal(failed.statusCode, 507);
    assert.equal(json(failed).error.message.key, 'server.errors.storageFailed');
    const rows = await s.server.ctx.db.select().from(boardAssets).where(eq(boardAssets.sha256, sha256Text(bytes)));
    assert.equal(rows.length, 0, 'nenhum registro da imagem que não foi gravada');
    const links = await s.server.ctx.db.select().from(boardAssetLinks).where(eq(boardAssetLinks.sha256, sha256Text(bytes)));
    assert.equal(links.length, 0, 'nenhuma referência');
  } finally {
    await s.server.close();
  }
});

test('(1) leitura: can(board.view), lixeira, conta suspensa, visitante só do próprio board, token vencido, hash/arquivo adulterados, cabeçalhos', async () => {
  const s = await scenario();
  try {
    const bytes = pngBytes(2048);
    const hash = json(await s.upload(s.ana, s.board.id, bytes)).hash as string;
    const res = await s.get(s.ana, hash);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Buffer.from(res.rawPayload), bytes);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.match(String(res.headers['cache-control']), /^private/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(String(res.headers['content-security-policy']), /sandbox/);
    assert.equal((await s.get(s.edi, hash)).statusCode, 200, 'editor do board');
    // pessoa sem acesso ao board
    const zoe = await invitePerson(s.server.app, s.ana, { email: 'zoe@example.com', name: 'Zoe' });
    const priv = await createBoard(s.server.app, s.ana, { place: { kind: 'personal' } });
    const privHash = json(await s.upload(s.ana, priv.id, pngBytes(3000, 4))).hash as string;
    assert.equal((await s.get(zoe, privHash)).statusCode, 404, 'board pessoal de outra pessoa');
    assert.equal((await s.get(null, hash)).statusCode, 401);
    assert.equal((await s.get(s.ana, 'zz')).statusCode, 400, 'hash malformado');
    assert.equal((await s.get(s.ana, 'a'.repeat(64))).statusCode, 404, 'hash inexistente');
    // conta suspensa
    await s.server.ctx.db.update(orgMemberships).set({ status: 'suspended', suspendedAt: new Date() }).where(eq(orgMemberships.userId, s.edi.id));
    assert.notEqual((await s.get(s.edi, hash)).statusCode, 200, 'suspensa não lê');
    // visitante: só imagens do board do próprio link, com token válido
    const setLink = await api(s.server.app, s.ana).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, accessLevel: 'viewer' } });
    // Chat 08.7 · R5 (S-17): o banco guarda só o hash; o token aparece para quem cria, na resposta da criação
    const link = { token: (json(setLink).state.boards as Array<{ id: string; publicLink: { token: string } }>).find((b) => b.id === s.board.id)!.publicLink.token };
    const vt = json(await s.server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, payload: {} })).visitorToken as string;
    assert.equal((await s.get(vt, hash, `?board=${s.board.id}&as=visitor`)).statusCode, 200);
    assert.equal((await s.get(vt, privHash, `?board=${s.board.id}&as=visitor`)).statusCode, 404, 'imagem de outro board');
    assert.equal((await s.get(vt, privHash, `?board=${priv.id}&as=visitor`)).statusCode, 401, 'token de outro board');
    const expired = await signVisitorToken(s.server.ctx.keys.jwt, { boardId: s.board.id, visitorId: 'visitante:x', linkPrint: sha256OfText(link.token).slice(0, 24) }, Date.now() - 3 * 60 * 60 * 1000);
    assert.equal((await s.get(expired, hash, `?board=${s.board.id}&as=visitor`)).statusCode, 401, 'token vencido');
    // arquivo adulterado no disco: não sai
    writeFileSync(s.server.ctx.assets!.pathFor(hash), Buffer.concat([bytes, Buffer.from('x')]));
    assert.equal((await s.get(s.ana, hash)).statusCode, 404);
    // lixeira
    const trashHash = json(await s.upload(s.ana, priv.id, pngBytes(3100, 5))).hash as string;
    await api(s.server.app, s.ana).del(`/boards/${priv.id}`);
    assert.equal((await s.get(s.ana, trashHash)).statusCode, 404, 'board na lixeira');
  } finally {
    await s.server.close();
  }
});

test('(1) prova de acesso entre boards: vincular, referenciar no PUT e modelo com a imagem embutida', async () => {
  const s = await scenario();
  try {
    const priv = await createBoard(s.server.app, s.ana, { place: { kind: 'personal' } });
    const h = json(await s.upload(s.ana, priv.id, pngBytes(4000, 6))).hash as string;
    // Edi não vê o board pessoal da Ana → não consegue vincular nem referenciar
    const tryLink = json(await api(s.server.app, s.edi).post(`/boards/${s.board.id}/assets/link`, { hashes: [h] }));
    assert.deepEqual(tryLink, { linked: [], missing: [h] });
    const forged = await api(s.server.app, s.edi).put(`/boards/${s.board.id}/data`, emptyBoard({ s1: sticky('s1', 'oi', { createdBy: s.ana.id }), i: image('i', assetRef(h), { createdBy: s.edi.id }) }), 0);
    assert.equal(forged.statusCode, 403);
    assert.equal(json(forged).error.message.key, 'server.errors.imageNotAvailable');
    assert.equal((await s.get(s.edi, h)).statusCode, 404);
    // a Ana vê os dois boards → vincula
    assert.deepEqual(json(await api(s.server.app, s.ana).post(`/boards/${s.board.id}/assets/link`, { hashes: [h] })), { linked: [h], missing: [] });
    assert.equal((await s.get(s.edi, h)).statusCode, 200, 'agora o Edi vê pelo board compartilhado');
    // modelo: a imagem vai embutida
    await api(s.server.app, s.ana).put(`/boards/${s.board.id}/data`, emptyBoard({ i: image('i', assetRef(h)) }), 0);
    const tpl = await api(s.server.app, s.ana).post('/templates', { name: 'Com imagem', scope: 'personal', data: await s.dataOf(s.board.id) });
    assert.equal(tpl.statusCode, 200, tpl.body);
    const [row] = await s.server.ctx.db.select().from(templates).where(eq(templates.id, json(tpl).template.id));
    assert.match(((row.data as unknown as BoardData).elements.i as unknown as { dataUrl: string }).dataUrl, /^data:image\/png;base64,/);
  } finally {
    await s.server.close();
  }
});

test('(1) migração preguiçosa ao abrir: converte o que dá (época nova), mantém SVG e o que não converte; veto', async () => {
  const s = await scenario();
  try {
    const png = pngBytes(5000, 8);
    const svgUrl = dataUrlOf(SVG, 'image/svg+xml');
    const bad = `data:image/png;base64,${Buffer.from('não é imagem').toString('base64')}`;
    const legacy = emptyBoard({ p: image('p', dataUrlOf(png), { createdBy: s.ana.id }), v: image('v', svgUrl, { createdBy: s.ana.id }), b: image('b', bad, { createdBy: s.ana.id }) }) as unknown as BoardData;
    // board antigo gravado direto no banco (como estava antes do 08.2) + documento ao vivo da época "velha"
    await s.server.ctx.db.update(boards).set({ data: legacy as unknown as Record<string, unknown> }).where(eq(boards.id, s.board.id));
    const [row] = await s.server.ctx.db.select().from(boards).where(eq(boards.id, s.board.id));
    const old = new Y.Doc();
    seedDoc(old, boardDataToSlice(legacy), 'velha');
    await s.server.ctx.db.insert(boardYdocs).values({ boardId: s.board.id, state: Y.encodeStateAsUpdate(old), epoch: 'velha', baseRevision: row.revision });
    const url = await listen(s.server);
    const stale = connectClient(url, s.board.id, { t: s.ana.token, e: 'velha' } as never);
    await until(() => !!stale.authFailed || stale.synced, 'cópia velha');
    assert.equal(stale.authFailed, 'reset:epoch', 'quem tinha a cópia da época velha é recusado (não mistura)');
    stale.destroy();
    const a = connectClient(url, s.board.id, { t: s.ana.token } as never);
    try {
      await until(() => a.synced, 'sync');
      const doc = readSlice(a.doc).elements;
      assert.equal((doc.p as unknown as { dataUrl: string }).dataUrl, assetRef(sha256Text(png)), 'PNG virou referência');
      assert.equal((doc.v as unknown as { dataUrl: string }).dataUrl, svgUrl, 'SVG fica embutido');
      assert.equal((doc.b as unknown as { dataUrl: string }).dataUrl, bad, 'o que não converte fica como está');
      assert.notEqual(rootsOf(a.doc).meta.get('epoch'), 'velha', 'época nova');
      // veto: mover a imagem antiga ainda embutida é permitido; imagem NOVA embutida, não
      const cur = readSlice(a.doc);
      applyLocalChange(a.doc, cur, { ...cur, elements: { ...cur.elements, v: { ...cur.elements.v, x: 50 } as CanvasElement } });
      await until(() => readElement(rootsOf(s.server.ctx.collab!.rooms.get(s.board.id)!.doc).els.get('v')!).x === 50, 'movida');
      const cur2 = readSlice(a.doc);
      applyLocalChange(a.doc, cur2, { ...cur2, elements: { ...cur2.elements, n: image('n', dataUrlOf(pngBytes(300, 2)), { createdBy: s.ana.id }) as unknown as CanvasElement }, elementOrder: [...cur2.elementOrder, 'n'] });
      await until(() => a.messages.some((m) => m.t === 'denied'), 'recusa');
      assert.equal((a.messages.find((m) => m.t === 'denied') as { reason: { key: string } }).reason.key, 'server.errors.imageMustUpload');
    } finally {
      a.destroy();
    }
    // referência a imagem não vinculada a este board: recusada; vinculada: aceita
    const b2 = connectClient(url, s.board.id, { t: s.ana.token } as never);
    try {
      await until(() => b2.synced, 'sync 2');
      const priv = await createBoard(s.server.app, s.ana, { place: { kind: 'personal' } });
      const other = json(await s.upload(s.ana, priv.id, pngBytes(700, 11))).hash as string;
      const cur = readSlice(b2.doc);
      applyLocalChange(b2.doc, cur, { ...cur, elements: { ...cur.elements, r: image('r', assetRef(other), { createdBy: s.ana.id }) as unknown as CanvasElement }, elementOrder: [...cur.elementOrder, 'r'] });
      await until(() => b2.messages.some((m) => m.t === 'denied'), 'recusa da referência');
      assert.equal((b2.messages.find((m) => m.t === 'denied') as { reason: { key: string } }).reason.key, 'server.errors.imageNotAvailable');
    } finally {
      b2.destroy();
    }
    const b3 = connectClient(url, s.board.id, { t: s.ana.token } as never);
    try {
      await until(() => b3.synced, 'sync 3');
      const mine = json(await s.upload(s.ana, s.board.id, pngBytes(800, 12))).hash as string;
      const cur = readSlice(b3.doc);
      applyLocalChange(b3.doc, cur, { ...cur, elements: { ...cur.elements, ok: image('ok', assetRef(mine), { createdBy: s.ana.id }) as unknown as CanvasElement }, elementOrder: [...cur.elementOrder, 'ok'] });
      await until(() => rootsOf(s.server.ctx.collab!.rooms.get(s.board.id)!.doc).els.has('ok'), 'aceita');
      assert.equal(b3.messages.some((m) => m.t === 'denied'), false);
    } finally {
      b3.destroy();
    }
  } finally {
    await s.server.close();
  }
});

test('(1) órfãos: folga de 24 h a partir da saída do último vínculo; revinculada recomeça; arquivo só sai sem uso', async () => {
  const s = await scenario();
  try {
    const db = s.server.ctx.db;
    const tmp = await createBoard(s.server.app, s.ana, { place: { kind: 'personal' } });
    const bytes = pngBytes(900, 13);
    const hash = json(await s.upload(s.ana, tmp.id, bytes)).hash as string;
    const file = s.server.ctx.assets!.pathFor(hash);
    const t0 = new Date();
    assert.deepEqual(await collectOrphanAssets(s.server.ctx, t0), { marked: 0, removed: 0, filesRemoved: 0 }, 'com vínculo nada acontece');
    // exclusão definitiva do board (vínculo sai em cascata)
    await db.delete(boards).where(eq(boards.id, tmp.id));
    const t1 = new Date(t0.getTime() + 60_000);
    assert.equal((await collectOrphanAssets(s.server.ctx, t1)).marked, 1, 'a folga começa agora');
    assert.equal((await collectOrphanAssets(s.server.ctx, new Date(t1.getTime() + ORPHAN_GRACE_MS - 1000))).removed, 0, 'ainda na folga');
    assert.ok(existsSync(file));
    // revinculada dentro da folga (mesma imagem enviada a outro board): não é apagada depois
    const again = await createBoard(s.server.app, s.ana, { place: { kind: 'personal' } });
    await s.upload(s.ana, again.id, bytes);
    const [meta] = await db.select().from(boardAssets).where(eq(boardAssets.sha256, hash));
    assert.equal(meta.unlinkedAt, null, 'revinculada: folga zerada');
    assert.equal((await collectOrphanAssets(s.server.ctx, new Date(t1.getTime() + ORPHAN_GRACE_MS + 60_000))).removed, 0);
    // sem vínculo de novo → marca → 24 h depois sai, com o arquivo
    await db.delete(boards).where(eq(boards.id, again.id));
    const t2 = new Date(t1.getTime() + 2 * ORPHAN_GRACE_MS);
    assert.equal((await collectOrphanAssets(s.server.ctx, t2)).marked, 1);
    const done = await collectOrphanAssets(s.server.ctx, new Date(t2.getTime() + ORPHAN_GRACE_MS + 1000));
    assert.deepEqual(done, { marked: 0, removed: 1, filesRemoved: 1 });
    assert.equal(existsSync(file), false);
    assert.equal((await db.select().from(boardAssetLinks).where(and(eq(boardAssetLinks.sha256, hash)))).length, 0);
  } finally {
    await s.server.close();
  }
});

test('(1) pasta de imagens inválida ou sem gravação: o servidor não sobe e diz o motivo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ludraw-bad-'));
  const file = join(dir, 'um-arquivo');
  writeFileSync(file, 'x');
  try {
    await assert.rejects(startServer({ LUDRAW_ASSETS_DIR: join(file, 'sub') }), /LUDRAW_ASSETS_DIR/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
