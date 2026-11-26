/**
 * Tempo real (Chat 08 · A-1): sincronização Yjs pelo WebSocket, persistência, autenticação, nomes de
 * documento aceitos, somente leitura para quem só vê, e segredos (nota privada) fora do documento público.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { applyLocalChange, boardDataToSlice, docEpoch, readSlice, ORIGIN } from '../../src/collab/codec';
import { boardDocName } from '../../src/collab/protocol';
import type { CanvasElement } from '../../src/types/canvas';
import { boards, boardYdocs } from '../src/db/schema';
import { connectClient, listen, until } from './collab-helpers';
import { api, createBoard, emptyBoard, invitePerson, startConfigured, sticky, type Person } from './helpers';

async function scenario(data: Record<string, unknown> = emptyBoard({ s1: sticky('s1', 'ideia', { createdBy: 'x' }) })) {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data });
  const editor = await invitePerson(server.app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  const viewer = await invitePerson(server.app, owner, { email: 'vi@example.com', name: 'Vi Leitora' });
  await api(server.app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: viewer.id, role: 'viewer' });
  const url = await listen(server);
  const open = (who: Person, extra: Record<string, unknown> = {}) => connectClient(url, board.id, { t: who.token, ...extra } as never);
  return { server, owner, editor, viewer, board, url, open };
}

const slice = (c: { doc: import('yjs').Doc }) => readSlice(c.doc);

test('dois clientes convergem e o servidor grava no banco (boards.data + board_ydocs)', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const b = s.open(s.editor);
  try {
    await until(() => a.synced && b.synced, 'sincronização inicial');
    assert.equal(slice(a).elements.s1.type, 'sticky');
    assert.equal((slice(b).elements.s1 as { text: string }).text, 'ideia');
    assert.equal(docEpoch(a.doc), docEpoch(b.doc));
    assert.ok(docEpoch(a.doc));

    // A edita o texto e cria um elemento; B enxerga
    const before = slice(a);
    const after = { ...before, elements: { ...before.elements, s1: { ...before.elements.s1, text: 'ideia melhor' } as CanvasElement, s2: sticky('s2', 'segunda', { createdBy: s.owner.id }) as unknown as CanvasElement }, elementOrder: [...before.elementOrder, 's2'] };
    applyLocalChange(a.doc, before, after);
    await until(() => (slice(b).elements.s2 as { text?: string } | undefined)?.text === 'segunda' && (slice(b).elements.s1 as { text: string }).text === 'ideia melhor', 'B recebe a edição de A');
    assert.deepEqual(slice(b).elementOrder, ['s1', 's2']);

    // grava no banco (flush)
    await s.server.ctx.collab!.flush(s.board.id);
    const [row] = await s.server.ctx.db.select().from(boards).where(eq(boards.id, s.board.id));
    const data = row.data as { elements: Record<string, { text: string }>; elementOrder: string[] };
    assert.equal(data.elements.s1.text, 'ideia melhor');
    assert.deepEqual(data.elementOrder, ['s1', 's2']);
    assert.ok(row.revision >= 1);
    const [saved] = await s.server.ctx.db.select().from(boardYdocs).where(eq(boardYdocs.boardId, s.board.id));
    assert.equal(saved.baseRevision, row.revision);
    assert.equal(saved.epoch, docEpoch(a.doc));
  } finally {
    a.destroy();
    b.destroy();
    await s.server.close();
  }
});

test('o estado sobrevive: sala fecha, reabre e é a mesma "vida" do documento (mesma época)', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  try {
    await until(() => a.synced, 'sync');
    const epoch = docEpoch(a.doc)!;
    const before = slice(a);
    applyLocalChange(a.doc, before, { ...before, elements: { ...before.elements, s1: { ...before.elements.s1, text: 'gravada' } as CanvasElement } });
    await s.server.ctx.collab!.flush(s.board.id);
    a.destroy();
    await until(() => s.server.ctx.collab!.rooms.size === 0, 'sala descarregada');
    const b = s.open(s.owner, { e: epoch });
    try {
      await until(() => b.synced, 'sync 2');
      assert.equal(docEpoch(b.doc), epoch);
      assert.equal((slice(b).elements.s1 as { text: string }).text, 'gravada');
    } finally {
      b.destroy();
    }
  } finally {
    await s.server.close();
  }
});

test('somente o nome board:<id> é aceito; :me, id desconhecido e sem credencial são recusados com motivo genérico', async () => {
  const s = await scenario();
  const tries = [
    connectClient(s.url, s.board.id, { t: s.owner.token }, { name: `${boardDocName(s.board.id)}:me` }),
    connectClient(s.url, s.board.id, { t: s.owner.token }, { name: 'board:../../etc' }),
    connectClient(s.url, 'nao-existe-12345', { t: s.owner.token }),
    connectClient(s.url, s.board.id, { t: 'lixo' }),
  ];
  try {
    await until(() => tries.every((c) => c.authFailed !== null), 'todas recusadas');
    assert.deepEqual(tries.map((c) => c.synced), [false, false, false, false]);
    // quem não pode ver o board não distingue "não existe" de "sem permissão"
    assert.equal(tries[0].authFailed, 'denied');
    assert.equal(tries[2].authFailed, 'denied');
    assert.equal(tries[3].authFailed, 'unauthorized');
  } finally {
    tries.forEach((c) => c.destroy());
    await s.server.close();
  }
});

test('época antiga do documento local é recusada (não se junta histórias diferentes)', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  await until(() => a.synced, 'sync');
  const stale = s.open(s.editor, { e: 'epoca-velha' });
  try {
    await until(() => stale.authFailed !== null, 'recusada');
    assert.equal(stale.authFailed, 'reset:epoch');
  } finally {
    a.destroy();
    stale.destroy();
    await s.server.close();
  }
});

test('quem só vê (leitor) conecta em modo somente leitura: o que escreve não chega a ninguém', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const v = s.open(s.viewer);
  try {
    await until(() => a.synced && v.synced, 'sync');
    assert.equal(v.messages.find((m) => m.t === 'hello' && m.readOnly) !== undefined, true);
    const before = slice(v);
    applyLocalChange(v.doc, before, { ...before, elements: { ...before.elements, s1: { ...before.elements.s1, text: 'vandalismo' } as CanvasElement } });
    await new Promise((r) => setTimeout(r, 400));
    assert.equal((slice(a).elements.s1 as { text: string }).text, 'ideia');
    const room = s.server.ctx.collab!.rooms.get(s.board.id)!;
    assert.equal((readSlice(room.doc).elements.s1 as { text: string }).text, 'ideia');
  } finally {
    a.destroy();
    v.destroy();
    await s.server.close();
  }
});

test('nota privada: o texto não entra no documento público; só a própria pessoa o recebe (canal me.*)', async () => {
  const draft = sticky('p1', 'segredo do Edi', { createdBy: 'EDI', isPrivateDraft: true, tags: [{ id: 't', label: 'x', color: '#fff' }], authorName: 'Edi Tor', createdByName: 'Edi Tor' });
  const s = await scenario();
  // o dono do rascunho precisa ser o editor real: recria o board com createdBy certo
  const own = await createBoard(s.server.app, s.owner, { data: emptyBoard({ p1: { ...draft, createdBy: s.editor.id } }) });
  const url = s.url;
  const a = connectClient(url, own.id, { t: s.owner.token });
  const e = connectClient(url, own.id, { t: s.editor.token });
  try {
    await until(() => a.synced && e.synced, 'sync');
    // público: texto em branco para todos
    assert.equal((slice(a).elements.p1 as { text: string }).text, '');
    assert.equal((slice(e).elements.p1 as { text: string }).text, '');
    assert.deepEqual((slice(a).elements.p1 as { tags: unknown[] }).tags, []);
    // o próprio autor recebe o texto pelo canal privado; o dono do board não
    await until(() => e.last('me.state') !== undefined, 'me.state do autor');
    assert.equal(e.last('me.state')!.drafts.p1.text, 'segredo do Edi');
    assert.equal(a.last('me.state')!.drafts.p1, undefined);
    // o autor muda o texto privado
    e.send({ t: 'me.draft', id: 'p1', text: 'segredo v2', tags: [], rev: 1 });
    await until(() => s.server.ctx.collab!.rooms.get(own.id)?.secrets.drafts.get('p1')?.text === 'segredo v2', 'segredo atualizado na sala');
    await s.server.ctx.collab!.flush(own.id);
    const [row] = await s.server.ctx.db.select().from(boards).where(eq(boards.id, own.id));
    assert.equal((row.data as { elements: Record<string, { text: string }> }).elements.p1.text, 'segredo v2');
    // o dono NUNCA viu o texto em nenhuma mensagem
    assert.equal(JSON.stringify(a.messages).includes('segredo'), false);
    assert.equal(JSON.stringify(slice(a)).includes('segredo'), false);
    // nota de outra pessoa: me.draft de quem não é o autor é recusado
    a.send({ t: 'me.draft', id: 'p1', text: 'forjado', tags: [], rev: 9 });
    await until(() => a.last('denied') !== undefined, 'recusa do rascunho alheio');
    await s.server.ctx.collab!.flush(own.id);
    const [row2] = await s.server.ctx.db.select().from(boards).where(eq(boards.id, own.id));
    assert.equal((row2.data as { elements: Record<string, { text: string }> }).elements.p1.text, 'segredo v2');
  } finally {
    a.destroy();
    e.destroy();
    await s.server.close();
  }
});

test('gravar o board por PUT derruba a "vida" do documento: os conectados recebem reload e recomeçam', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  try {
    await until(() => a.synced, 'sync');
    const oldEpoch = docEpoch(a.doc)!;
    await s.server.ctx.collab!.flush(s.board.id);
    const read = await api(s.server.app, s.owner).get(`/boards/${s.board.id}/data`);
    const { data, revision } = JSON.parse(read.body);
    data.elements.s1.text = 'por PUT';
    const put = await api(s.server.app, s.owner).put(`/boards/${s.board.id}/data`, data, revision);
    assert.equal(put.statusCode, 200);
    await until(() => a.last('reload') !== undefined, 'reload');
    assert.equal(a.last('reload')!.reason, 'replaced');
    // Chat 08.7 · R2: como o cliente real (`session.ts` → `restart` → fecha o provider), quem recebe `reload` larga a
    // cópia antiga. Antes o cliente de teste continuava vivo e reconectava sozinho, sem época, com o documento velho.
    a.destroy();
    const [gone] = await s.server.ctx.db.select().from(boardYdocs).where(eq(boardYdocs.boardId, s.board.id));
    assert.equal(gone, undefined);
    const b = s.open(s.owner);
    try {
      await until(() => b.synced, 'sync novo');
      assert.notEqual(docEpoch(b.doc), oldEpoch);
      assert.equal((slice(b).elements.s1 as { text: string }).text, 'por PUT');
    } finally {
      b.destroy();
    }
  } finally {
    a.destroy();
    await s.server.close();
  }
});

test('o codec é fiel: BoardData → documento → BoardData mantém os campos (e não leva zIndex)', () => {
  assert.equal(typeof boardDataToSlice, 'function');
  const data = emptyBoard({ s1: sticky('s1', 'a', { zIndex: 3 }) }) as never;
  const s = boardDataToSlice(data);
  assert.equal((s.elements.s1 as { text: string }).text, 'a');
  assert.ok(ORIGIN.server);
});
