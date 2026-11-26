/**
 * LuDraw server — Chat 08.7 · R2 (S-27): "restaurar versão"/PUT não podem ser desfeitos por um cliente atrasado,
 * e a edição offline legítima (mesma "vida" do documento) continua entrando.
 *
 * Antes da correção: depois de um PUT/restauração o `resetBoard` apagava `board_ydocs`; enquanto ninguém reabria o
 * board, o servidor não sabia a época atual e o `onAuthenticate` pulava a conferência (`cred.e && epoch && …`):
 * a cópia antiga entrava, juntava-se ao documento novo e era gravada por cima do conteúdo restaurado.
 * Roda no PGlite e no Postgres real (`npm run test:server:pg`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { docEpoch, readSlice, rootsOf } from '../../src/collab/codec';
import { boards } from '../src/db/schema';
import { connectClient, listen, sleep, until, type TestClient } from './collab-helpers';
import { api, createBoard, emptyBoard, json, startConfigured, sticky, type Person } from './helpers';

async function scenario() {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: emptyBoard({ s1: sticky('s1', 'original', { createdBy: admin.user.id }) }) });
  const url = await listen(server);
  const hub = server.ctx.collab!;
  const clients: TestClient[] = [];
  const open = (doc?: Y.Doc, e?: string | null) => {
    const c = connectClient(url, board.id, { t: owner.token, ...(e !== undefined ? { e } : {}) } as never, doc ? { doc } : {});
    clients.push(c);
    return c;
  };
  const dbText = async () => {
    await hub.flush(board.id).catch(() => undefined);
    const [row] = await server.ctx.db.select().from(boards).where(eq(boards.id, board.id));
    return (row.data as { elements: Record<string, { text: string }> }).elements.s1?.text;
  };
  /** espera a sala fechar (ninguém conectado, documento descarregado) */
  const roomClosed = () => until(() => !hub.rooms.has(board.id), 'sala fechada', 8000);
  const close = async () => {
    clients.forEach((c) => c.destroy());
    await server.close();
  };
  return { server, owner, board, hub, open, dbText, roomClosed, close };
}
type S = Awaited<ReturnType<typeof scenario>>;

/** Um cliente que estava conectado sai "sem rede" levando a cópia local (estado + época). */
async function goOffline(s: S): Promise<{ doc: Y.Doc; epoch: string }> {
  const a = s.open();
  await until(() => a.synced, 'sync');
  const epoch = docEpoch(a.doc)!;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(a.doc));
  a.destroy();
  await s.roomClosed();
  return { doc, epoch };
}

function setText(doc: Y.Doc, id: string, text: string) {
  doc.transact(() => {
    const el = rootsOf(doc).els.get(id) as Y.Map<unknown>;
    const t = el.get('text') as Y.Text;
    t.delete(0, t.length);
    t.insert(0, text);
  });
}

/** Resultado de uma reconexão: entrou (sincronizou) ou foi recusada (motivo). */
async function reconnect(s: S, doc: Y.Doc, e: string | null | undefined) {
  const c = s.open(doc, e);
  try {
    await until(() => c.synced || !!c.authFailed || c.closes.length > 0, 'reconexão', 8000);
  } catch {
    /* tempo */
  }
  await sleep(400);
  return { synced: c.synced && !c.authFailed && c.closes.length === 0, authFailed: c.authFailed, client: c };
}

test('restaurar versão não é desfeito por um cliente atrasado (época antiga, sem ninguém com o board aberto)', async () => {
  const s = await scenario();
  try {
    const { doc, epoch } = await goOffline(s);
    // versão "boa" + edição + restaurar a versão boa (o servidor apaga a vida antiga do documento)
    const snap = json(await api(s.server.app, s.owner).post(`/boards/${s.board.id}/snapshots`, { name: 'boa', kind: 'manual' })).snapshot;
    const cur = json(await api(s.server.app, s.owner).get(`/boards/${s.board.id}/data`));
    cur.data.elements.s1.text = 'estragado';
    assert.equal((await api(s.server.app, s.owner).put(`/boards/${s.board.id}/data`, cur.data, cur.revision)).statusCode, 200);
    assert.equal((await api(s.server.app, s.owner).post(`/boards/${s.board.id}/snapshots/${snap.id}/restore`)).statusCode, 200);
    assert.equal(await s.dbText(), 'original', 'restaurado');
    // a pessoa que estava sem rede volta com a cópia antiga (e mexeu nela)
    setText(doc, 's1', 'cópia antiga');
    const r = await reconnect(s, doc, epoch);
    assert.equal(r.authFailed, 'reset:epoch', 'a cópia de outra época é recusada');
    assert.equal(await s.dbText(), 'original', 'o conteúdo restaurado continua no banco');
  } finally {
    await s.close();
  }
});

test('gravar por PUT também não é desfeito por um cliente atrasado', async () => {
  const s = await scenario();
  try {
    const { doc, epoch } = await goOffline(s);
    const cur = json(await api(s.server.app, s.owner).get(`/boards/${s.board.id}/data`));
    cur.data.elements.s1.text = 'por PUT';
    assert.equal((await api(s.server.app, s.owner).put(`/boards/${s.board.id}/data`, cur.data, cur.revision)).statusCode, 200);
    setText(doc, 's1', 'cópia antiga');
    const r = await reconnect(s, doc, epoch);
    assert.equal(r.authFailed, 'reset:epoch');
    assert.equal(await s.dbText(), 'por PUT');
  } finally {
    await s.close();
  }
});

test('cliente antigo SEM época que sincroniza o documento velho é recusado pelo veto (banco intacto)', async () => {
  const s = await scenario();
  try {
    const { doc } = await goOffline(s);
    const cur = json(await api(s.server.app, s.owner).get(`/boards/${s.board.id}/data`));
    cur.data.elements.s1.text = 'por PUT';
    assert.equal((await api(s.server.app, s.owner).put(`/boards/${s.board.id}/data`, cur.data, cur.revision)).statusCode, 200);
    // alguém abre o board (época nova) e o cliente antigo chega sem dizer a época, com o documento velho
    const fresh = s.open();
    await until(() => fresh.synced, 'sync novo');
    const r = await reconnect(s, doc, undefined);
    await sleep(300);
    assert.equal((readSlice(fresh.doc).elements.s1 as { text: string }).text, 'por PUT', 'quem está no board continua vendo o conteúdo do PUT');
    assert.equal(await s.dbText(), 'por PUT', 'banco intacto');
    assert.ok(!r.synced || r.client.messages.some((m) => m.t === 'denied'), 'a sincronização do documento velho foi recusada');
  } finally {
    await s.close();
  }
});

test('edição offline legítima (mesma época) continua entrando — com a sala fechada e com a sala aberta', async () => {
  const s = await scenario();
  try {
    // sala fechada: a pessoa volta sozinha
    const first = await goOffline(s);
    setText(first.doc, 's1', 'editado sem rede');
    const r1 = await reconnect(s, first.doc, first.epoch);
    assert.equal(r1.authFailed, null);
    assert.ok(r1.synced, 'reconectou com a mesma época');
    await until(async () => (await s.dbText()) === 'editado sem rede', 'edição offline gravada', 8000);
    r1.client.destroy();
    await s.roomClosed();
    // sala aberta por outra pessoa enquanto ela estava sem rede
    const second = await goOffline(s);
    const other = s.open();
    await until(() => other.synced, 'outra pessoa no board');
    setText(second.doc, 's1', 'segunda edição sem rede');
    const r2 = await reconnect(s, second.doc, second.epoch);
    assert.ok(r2.synced, 'reconectou com a sala aberta');
    await until(() => (readSlice(other.doc).elements.s1 as { text: string }).text === 'segunda edição sem rede', 'a outra pessoa recebe a edição', 8000);
    assert.equal(await s.dbText(), 'segunda edição sem rede');
  } finally {
    await s.close();
  }
});
