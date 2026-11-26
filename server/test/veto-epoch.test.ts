/**
 * LuDraw server — Chat 08.7 · R2 (S-27): `meta.epoch` é campo do SERVIDOR (como `fac.tally`).
 *
 * Um documento de outra "vida" (de antes de um PUT/restauração) que chega sem dizer a época não pode se juntar ao
 * documento novo. No CRDT, a chave `epoch` das duas vidas disputa por id de cliente: quando a cópia antiga GANHA, a
 * época muda (e o conteúdo volta); quando PERDE, a época fica, mas a chave ganha um item vizinho e o que a cópia
 * antiga criou depois entraria. O veto recusa os dois casos — este teste força os dois lados da disputa.
 * Também mede o custo do veto por atualização comum (relatado no console; teto folgado na asserção).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Y from 'yjs';
import { bindYjs, boardDataToSlice, rootsOf, seedDoc } from '../../src/collab/codec';
import type { BoardData } from '../../src/types/canvas';
import type { PermissionContext } from '../../src/utils/permissions';
import { Veto, type VetoActor } from '../src/collab/veto';
import { emptyBoard, sticky } from './helpers';

bindYjs(Y);

const OWNER = 'dono';
const owner: VetoActor = {
  userId: OWNER,
  name: 'Dono',
  role: 'admin',
  context: (extra = {}) => ({ userId: OWNER, workspaceRole: 'admin', boardRole: null, isBoardOwner: true, isFacilitator: true, ...extra }) as PermissionContext,
};
const data = (text: string) => emptyBoard({ s1: sticky('s1', text, { createdBy: OWNER }) }) as unknown as BoardData;

/** Documento semeado como o servidor faz, com o id de cliente escolhido (decide quem "ganha" a disputa). */
function seeded(clientID: number, epoch: string, text: string): Y.Doc {
  const d = new Y.Doc();
  d.clientID = clientID;
  seedDoc(d, boardDataToSlice(data(text)), epoch);
  return d;
}

/** Cópia antiga que, depois da semente, ainda criou um objeto novo (o que entraria se a época "perdesse"). */
function staleWithNewObject(clientID: number): Y.Doc {
  const d = seeded(clientID, 'E-ANTIGA', 'antigo');
  const local = new Y.Doc();
  local.clientID = clientID + 1;
  Y.applyUpdate(local, Y.encodeStateAsUpdate(d));
  local.transact(() => {
    const el = new Y.Map<unknown>();
    rootsOf(local).els.set('s2', el);
    for (const [k, v] of Object.entries(sticky('s2', 'criado na cópia antiga', { createdBy: OWNER }))) if (k !== 'text') el.set(k, v);
    el.set('text', new Y.Text('criado na cópia antiga'));
  });
  return local;
}

for (const [label, oldId, newId] of [
  ['a cópia antiga GANHA a disputa da época', 900_000, 100],
  ['a cópia antiga PERDE a disputa da época', 100, 900_000],
] as const) {
  test(`veto recusa documento de outra época — ${label}`, () => {
    const room = seeded(newId, 'E-NOVA', 'novo');
    const veto = new Veto(room);
    const stale = staleWithNewObject(oldId);
    const result = veto.check(Y.encodeStateAsUpdate(stale), owner, () => null);
    assert.equal(result.ok, false, 'a atualização vinda de outra época é recusada');
    // o documento real não foi tocado
    assert.equal(rootsOf(room).meta.get('epoch'), 'E-NOVA');
    assert.equal(rootsOf(room).els.has('s2'), false);
  });
}

test('controle: edição comum do dono passa pelo veto (e a época não muda)', () => {
  const room = seeded(5, 'E-NOVA', 'novo');
  const veto = new Veto(room);
  const client = new Y.Doc();
  client.clientID = 77;
  Y.applyUpdate(client, Y.encodeStateAsUpdate(room));
  const sv = Y.encodeStateVector(client);
  client.transact(() => {
    const t = (rootsOf(client).els.get('s1') as Y.Map<unknown>).get('text') as Y.Text;
    t.insert(t.length, ' editado');
  });
  const result = veto.check(Y.encodeStateAsUpdate(client, sv), owner, () => null);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('desempenho: custo do veto por atualização comum (texto e posição)', () => {
  const big = emptyBoard(Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`n${i}`, sticky(`n${i}`, `nota ${i}`, { createdBy: OWNER, x: i * 10 })]))) as unknown as BoardData;
  const room = new Y.Doc();
  seedDoc(room, boardDataToSlice(big), 'E-NOVA');
  const veto = new Veto(room);
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(room));
  const N = 400;
  let total = 0;
  for (let i = 0; i < N; i++) {
    const sv = Y.encodeStateVector(client);
    client.transact(() => {
      const el = rootsOf(client).els.get(`n${i % 300}`) as Y.Map<unknown>;
      if (i % 2) el.set('x', i);
      else (el.get('text') as Y.Text).insert(0, 'a');
    });
    const update = Y.encodeStateAsUpdate(client, sv);
    const t0 = performance.now();
    const r = veto.check(update, owner, () => null);
    total += performance.now() - t0;
    assert.equal(r.ok, true);
    Y.applyUpdate(room, update); // como o Hocuspocus faria depois do aceite
  }
  const perUpdate = total / N;
  console.log(`veto: ${perUpdate.toFixed(3)} ms por atualização (média de ${N}, board com 300 objetos)`);
  assert.ok(perUpdate < 25, `veto lento demais: ${perUpdate.toFixed(2)} ms`);
});
