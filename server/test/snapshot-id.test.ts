/**
 * LuDraw server — Chat 08.7 · R2 (S-02): o id proposto para uma versão nunca alcança outro board.
 *
 * Antes: `POST /boards/:id/snapshots` gravava com `onConflictDoNothing()` e relia SÓ por `snapshots.id` — com o id
 * de uma versão de outro board, devolvia a versão alheia inteira (com os dados), redigida com o papel de quem pediu
 * no board DELE. Agora: id que já existe NESTE board = a mesma versão (nova tentativa, sem duplicar); id de outro
 * board ou inédito = id novo gerado pelo servidor. A resposta tem a mesma forma nos três casos.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { snapshots } from '../src/db/schema';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, sticky, type Person } from './helpers';

async function scenario() {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const other = await invitePerson(server.app, owner, { email: 'outra@example.com', name: 'Outra Pessoa' });
  const foreign = await createBoard(server.app, owner, { name: 'Board alheio', place: { kind: 'personal' }, data: emptyBoard({ s: sticky('s', 'CONTEUDO ALHEIO') }) });
  const mine = await createBoard(server.app, other, { name: 'Meu board', place: { kind: 'personal' }, data: emptyBoard({ m: sticky('m', 'meu conteúdo') }) });
  return { server, owner, other, foreign, mine };
}

const shape = (snap: Record<string, unknown>) => Object.keys(snap).sort().join(',');

test('id de versão de OUTRO board: cria versão nova neste board, sem devolver nem tocar a alheia', async () => {
  const s = await scenario();
  try {
    const alheia = json(await api(s.server.app, s.owner).post(`/boards/${s.foreign.id}/snapshots`, { name: 'versão alheia', kind: 'manual' })).snapshot;
    const res = await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, { id: alheia.id, name: 'minha', kind: 'manual' });
    assert.equal(res.statusCode, 200);
    const snap = json(res).snapshot;
    assert.equal(snap.boardId, s.mine.id, 'a versão devolvida é do board de quem pediu');
    assert.notEqual(snap.id, alheia.id, 'id novo');
    assert.equal(snap.name, 'minha');
    assert.equal(JSON.stringify(snap).includes('CONTEUDO ALHEIO'), false, 'nada do board alheio');
    const [still] = await s.server.ctx.db.select().from(snapshots).where(eq(snapshots.id, alheia.id));
    assert.equal(still.boardId, s.foreign.id);
    assert.equal(still.name, 'versão alheia', 'a versão alheia continua intacta');
    // mesma forma de resposta de um pedido com id inédito
    const fresh = json(await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, { id: 'inedito-0000000001', name: 'outra', kind: 'manual' })).snapshot;
    assert.equal(shape(snap), shape(fresh), 'mesma forma');
  } finally {
    await s.server.close();
  }
});

test('nova tentativa com o mesmo id neste board devolve a mesma versão e não duplica', async () => {
  const s = await scenario();
  try {
    const body = { id: 'tentativa-0000000001', name: 'manual', kind: 'manual' };
    const first = json(await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, body)).snapshot;
    const again = json(await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, body)).snapshot;
    assert.equal(again.id, first.id, 'mesma versão');
    const rows = await s.server.ctx.db.select().from(snapshots).where(eq(snapshots.boardId, s.mine.id));
    assert.equal(rows.filter((r) => r.name === 'manual').length, 1, 'sem duplicar');
    // id que já é deste board (ex.: devolvido pela lista) também volta a mesma versão
    const byOwnId = json(await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, { id: first.id, name: 'manual', kind: 'manual' })).snapshot;
    assert.equal(byOwnId.id, first.id);
    assert.equal((await s.server.ctx.db.select().from(snapshots).where(eq(snapshots.boardId, s.mine.id))).filter((r) => r.name === 'manual').length, 1);
  } finally {
    await s.server.close();
  }
});

test('o id devolvido não revela se o id proposto existe noutro board', async () => {
  const s = await scenario();
  try {
    const alheia = json(await api(s.server.app, s.owner).post(`/boards/${s.foreign.id}/snapshots`, { name: 'x', kind: 'manual' })).snapshot;
    const a = json(await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, { id: alheia.id, name: 'a', kind: 'manual' })).snapshot;
    const b = json(await api(s.server.app, s.other).post(`/boards/${s.mine.id}/snapshots`, { id: 'naoexiste00000000001', name: 'b', kind: 'manual' })).snapshot;
    // nos dois casos o id é outro (derivado deste board), então quem pede não distingue "existe lá" de "não existe"
    assert.notEqual(a.id, alheia.id);
    assert.notEqual(b.id, 'naoexiste00000000001');
  } finally {
    await s.server.close();
  }
});
