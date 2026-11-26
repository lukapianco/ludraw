/**
 * Tempo real — correções do Chat 08.2 · A-1:
 *  (2) o servidor arbitra a seleção/edição (quem chega primeiro na ordem de processamento fica; o outro é recusado),
 *      solta a seleção de quem desconecta (inclusive só uma aba) ou fica ocioso;
 *  (3) reenvio offline OBJETO POR OBJETO: só o que está em uso/negado é recusado, o resto entra; nada recusado chega a
 *      outro cliente; clientIDs novos só no reenvio; teto de atualizações por lote; objeto apagado por outra pessoa;
 *  (4) recusas esperadas não poluem o console (debug + contador); erros que não são nossos continuam aparecendo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Y from 'yjs';
import { applyLocalChange, readElement, readSlice, rootsOf, type BoardSlice } from '../../src/collab/codec';
import { RATE, type ServerMessage } from '../../src/collab/protocol';
import { planReplay, sendReplay, type ReplayChannel } from '../../src/collab/replay';
import type { CanvasElement } from '../../src/types/canvas';
import { classifyConsoleError, CollabRefusal, refusalFilterActive } from '../src/collab/quietLog';
import { connectClient, listen, sleep, until, type TestClient } from './collab-helpers';
import { api, createBoard, emptyBoard, invitePerson, startConfigured, sticky, type Person } from './helpers';

async function scenario(env: Record<string, string> = {}, ids = ['s1']) {
  const { server, admin } = await startConfigured(env);
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const els = Object.fromEntries(ids.map((id) => [id, sticky(id, `texto ${id}`, { createdBy: admin.user.id })]));
  const board = await createBoard(server.app, owner, { data: emptyBoard(els) });
  const editor = await invitePerson(server.app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  await api(server.app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: editor.id, role: 'editor' });
  const url = await listen(server);
  const clients: TestClient[] = [];
  const open = (who: Person, doc?: Y.Doc) => {
    const c = connectClient(url, board.id, { t: who.token } as never, doc ? { doc } : {});
    clients.push(c);
    return c;
  };
  const room = () => server.ctx.collab!.rooms.get(board.id)!;
  const close = async () => {
    clients.forEach((c) => c.destroy());
    await server.close();
  };
  return { server, owner, editor, board, url, open, room, close };
}

const of = <T extends ServerMessage['t']>(c: TestClient, t: T) => c.messages.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
const textOf = (doc: Y.Doc, id: string) => {
  const y = rootsOf(doc).els.get(id);
  return y ? (readElement(y) as { text?: string }).text : undefined;
};

/** Canal do lote para um cliente de teste: `batch off` espera o `batch.result`. */
function channel(c: TestClient): ReplayChannel {
  return {
    batch: async (on) => {
      const before = of(c, 'batch.result').length;
      c.send({ t: 'batch', on });
      if (on) return { accepted: 0, denied: [] };
      await until(() => of(c, 'batch.result').length > before, 'batch.result');
      const r = of(c, 'batch.result')[before];
      return { accepted: r.accepted, denied: r.denied };
    },
  };
}

/* ------------------------------ (2) seleção arbitrada pelo servidor ------------------------------ */

test('(2) duas pessoas selecionam o mesmo objeto no MESMO instante → só uma fica; a outra recebe a recusa com o nome', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    // mesmo tick: as duas mensagens saem juntas; o servidor decide pela ordem em que processa
    a.send({ t: 'select', ids: ['s1'] });
    e.send({ t: 'select', ids: ['s1'] });
    await until(() => of(a, 'select.denied').length + of(e, 'select.denied').length > 0, 'uma recusa');
    await sleep(200);
    const deniedA = of(a, 'select.denied');
    const deniedE = of(e, 'select.denied');
    assert.equal(deniedA.length + deniedE.length, 1, 'exatamente uma pessoa é recusada');
    const loser = deniedA.length ? s.owner : s.editor;
    const winnerName = deniedA.length ? 'Edi Tor' : 'Ana Admin';
    const msg = (deniedA[0] ?? deniedE[0])!;
    assert.deepEqual(msg.ids, ['s1']);
    assert.equal(msg.reason, 'inUse');
    assert.equal(msg.by, winnerName);
    // para quem perdeu, o objeto continua em uso pela outra pessoa (o veto também recusaria a escrita)
    assert.equal(s.room().inUseBy(loser.id, 's1'), winnerName);
    // edição: quem perdeu também não consegue marcar como "editando"
    (deniedA.length ? a : e).send({ t: 'editing', id: 's1' });
    await until(() => of(deniedA.length ? a : e, 'select.denied').length === 2, 'recusa da edição');
  } finally {
    await s.close();
  }
});

test('(2) seleção solta quando a pessoa desconecta — inclusive quando só a aba que selecionou fecha', async () => {
  const s = await scenario();
  const a1 = s.open(s.owner);
  const a2 = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a1.synced && a2.synced && e.synced, 'sync');
    a1.send({ t: 'select', ids: ['s1'] });
    await until(() => s.room().inUseBy(s.editor.id, 's1') !== null, 'dono segura s1');
    a1.destroy();
    // a pessoa continua no board (outra aba), mas o objeto da aba que fechou ficou livre
    await until(() => s.room().inUseBy(s.editor.id, 's1') === null, 'solto ao fechar a aba');
    e.send({ t: 'select', ids: ['s1'] });
    await sleep(200);
    assert.equal(of(e, 'select.denied').length, 0, 'a outra pessoa consegue selecionar');
    // e quando a última conexão da pessoa sai
    e.destroy();
    await until(() => s.room().inUseBy(s.owner.id, 's1') === null, 'solto ao sair');
  } finally {
    await s.close();
  }
});

test('(2) seleção de quem fica ocioso é solta e a tela da pessoa é avisada', async () => {
  const s = await scenario({ LUDRAW_COLLAB_SELECTION_IDLE_SECONDS: '1' });
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    a.send({ t: 'select', ids: ['s1'] });
    await until(() => s.room().inUseBy(s.editor.id, 's1') !== null, 'dono segura s1');
    // a outra pessoa continua ativa (cursor), o dono fica parado
    const keepAlive = setInterval(() => e.send({ t: 'cursor', x: 1, y: 1 }), 200);
    try {
      await until(() => of(a, 'select.denied').some((m) => m.reason === 'idle'), 'aviso de ociosidade', 5000);
    } finally {
      clearInterval(keepAlive);
    }
    assert.deepEqual(of(a, 'select.denied').find((m) => m.reason === 'idle')?.ids, ['s1']);
    assert.equal(of(e, 'select.denied').length, 0, 'quem está ativo não perde nada');
    assert.equal(s.room().inUseBy(s.editor.id, 's1'), null);
    e.send({ t: 'select', ids: ['s1'] });
    await sleep(200);
    assert.equal(of(e, 'select.denied').length, 0, 'objeto livre para os outros');
  } finally {
    await s.close();
  }
});

/* ------------------------------ (3) reenvio offline por objeto ------------------------------ */

/** Cliente do editor que "voltou da rede": base confirmada antes de cair × o que ele fez sem rede. */
function offlineEdits(base: BoardSlice, edits: Record<string, string | null>): BoardSlice {
  const elements = { ...base.elements };
  for (const [id, text] of Object.entries(edits)) {
    if (text === null) delete elements[id];
    else elements[id] = { ...elements[id], text, updatedAt: Date.now() } as CanvasElement;
  }
  return { ...base, elements, elementOrder: base.elementOrder.filter((id) => elements[id]) };
}

test('(3) 3 objetos editados sem rede, 1 em uso por outra pessoa → 2 entram, 1 recusado; a conexão continua e nada recusado chega ao outro', async () => {
  const s = await scenario({}, ['o1', 'o2', 'o3']);
  const a = s.open(s.owner);
  const first = s.open(s.editor);
  try {
    await until(() => a.synced && first.synced, 'sync');
    const base = readSlice(first.doc);
    // o editor cai; enquanto isso a dona seleciona o2
    first.destroy();
    a.send({ t: 'select', ids: ['o2'] });
    await until(() => s.room().inUseBy(s.editor.id, 'o2') !== null, 'o2 em uso');
    // tudo o que a dona recebe de o2 fica registrado (nada recusado pode passar)
    const seenO2 = new Set<string>();
    a.doc.on('update', () => {
      const t = textOf(a.doc, 'o2');
      if (t !== undefined) seenO2.add(t);
    });
    const desired = offlineEdits(base, { o1: 'o1 offline', o2: 'o2 offline', o3: 'o3 offline' });
    // volta: documento NOVO vindo do servidor e reenvio por objeto
    const back = s.open(s.editor, new Y.Doc());
    await until(() => back.synced, 'sync de volta');
    const plan = planReplay(base, desired);
    assert.equal(plan.steps.length, 3);
    const result = await sendReplay(back.doc, plan, channel(back), { origin: 'od:replay', lot: 300, pace: 100, windowMs: RATE.windowMs });
    assert.deepEqual(result.denied.map((d) => d.ids), [['o2']]);
    assert.equal(result.denied[0].reason.key, 'server.errors.objectInUse');
    assert.equal(result.gone.length, 0);
    // conexão aberta: nenhuma recusa de documento, nenhum fechamento
    assert.equal(back.messages.filter((m) => m.t === 'denied' && m.scope === 'document').length, 0);
    assert.equal(back.closes.length, 0);
    const room = s.room().doc;
    assert.equal(textOf(room, 'o1'), 'o1 offline');
    assert.equal(textOf(room, 'o3'), 'o3 offline');
    assert.equal(textOf(room, 'o2'), 'texto o2', 'o recusado não entrou');
    await until(() => textOf(a.doc, 'o1') === 'o1 offline' && textOf(a.doc, 'o3') === 'o3 offline', 'a dona recebe o que entrou');
    await sleep(300);
    assert.equal(seenO2.has('o2 offline'), false, 'o texto recusado nunca chegou à dona');
    assert.equal(textOf(a.doc, 'o2'), 'texto o2');
    // clientIDs novos só no reenvio: um por transação escrita, todos diferentes
    assert.equal(result.clientIds.length, 3);
    assert.equal(new Set(result.clientIds).size, 3);
    // e depois do lote a recusa volta a fechar a conexão (fora do lote não há "recusa parcial")
    a.send({ t: 'select', ids: ['o3'] });
    await until(() => s.room().inUseBy(s.editor.id, 'o3') !== null, 'o3 em uso');
    const before = readSlice(back.doc);
    applyLocalChange(back.doc, before, { ...before, elements: { ...before.elements, o3: { ...before.elements.o3, color: '#FFC2C8' } as CanvasElement } });
    await until(() => back.messages.some((m) => m.t === 'denied' && m.scope === 'document'), 'recusa normal');
    await until(() => back.closes.length > 0, 'conexão fechada');
  } finally {
    await s.close();
  }
});

test('(3) objeto apagado por outra pessoa enquanto eu estava sem rede: minha edição NÃO o ressuscita', async () => {
  const s = await scenario({}, ['g1', 'k1']);
  const a = s.open(s.owner);
  const first = s.open(s.editor);
  try {
    await until(() => a.synced && first.synced, 'sync');
    const base = readSlice(first.doc);
    first.destroy();
    // a dona apaga g1
    const cur = readSlice(a.doc);
    const { g1: _g, ...rest } = cur.elements;
    void _g;
    applyLocalChange(a.doc, cur, { ...cur, elements: rest, elementOrder: cur.elementOrder.filter((id) => id !== 'g1') });
    await until(() => !rootsOf(s.room().doc).els.has('g1'), 'apagado no servidor');
    const back = s.open(s.editor, new Y.Doc());
    await until(() => back.synced, 'sync de volta');
    const plan = planReplay(base, offlineEdits(base, { g1: 'editei offline', k1: 'k1 offline' }));
    const result = await sendReplay(back.doc, plan, channel(back), { origin: 'od:replay', lot: 300, pace: 100, windowMs: RATE.windowMs });
    assert.deepEqual(result.gone, ['g1']);
    assert.equal(result.denied.length, 0);
    assert.equal(rootsOf(s.room().doc).els.has('g1'), false, 'não voltou');
    assert.equal(textOf(s.room().doc, 'k1'), 'k1 offline', 'o resto entrou');
  } finally {
    await s.close();
  }
});

test('(3) objeto criado sem rede entra na ordem; reenvio respeita o teto de atualizações por lote', async () => {
  const s = await scenario({}, ['o1']);
  const a = s.open(s.owner);
  const first = s.open(s.editor);
  try {
    await until(() => a.synced && first.synced, 'sync');
    const base = readSlice(first.doc);
    first.destroy();
    const n1 = sticky('n1', 'nova offline', { createdBy: s.editor.id }) as unknown as CanvasElement;
    const desired: BoardSlice = { ...base, elements: { ...base.elements, n1 }, elementOrder: [...base.elementOrder, 'n1'] };
    const back = s.open(s.editor, new Y.Doc());
    await until(() => back.synced, 'sync de volta');
    const result = await sendReplay(back.doc, planReplay(base, desired), channel(back), { origin: 'od:replay', lot: 300, pace: 100, windowMs: RATE.windowMs });
    assert.equal(result.denied.length, 0);
    await until(() => rootsOf(a.doc).order.toArray().includes('n1'), 'n1 na ordem da dona');

    // teto: um lote que já passou de `RATE.batchMaxUpdates` deixa de ser lote — a recusa seguinte fecha a conexão
    back.send({ t: 'batch', on: true });
    await sleep(150);
    const conn = [...s.room().conns.values()].find((c) => c.principal.userId === s.editor.id)!;
    conn.batch!.updates = RATE.batchMaxUpdates;
    a.send({ t: 'select', ids: ['o1'] });
    await until(() => s.room().inUseBy(s.editor.id, 'o1') !== null, 'o1 em uso');
    const cur = readSlice(back.doc);
    applyLocalChange(back.doc, cur, { ...cur, elements: { ...cur.elements, o1: { ...cur.elements.o1, text: 'acima do teto' } as CanvasElement } });
    await until(() => back.messages.some((m) => m.t === 'denied' && m.scope === 'document'), 'recusa que fecha');
    await until(() => back.closes.length > 0, 'conexão fechada');
    assert.equal(back.messages.some((m) => m.t === 'denied' && m.scope === 'object'), false);
  } finally {
    await s.close();
  }
});

/* ------------------------------ (4) log do Hocuspocus ------------------------------ */

test('(4) classificação: só as recusas do LuDraw são silenciadas', () => {
  // forma real do Hocuspocus 4.7.1: console.error(`[${hook}]`, erro.message)
  assert.deepEqual(classifyConsoleError(['[beforeSync]', 'od-refusal:denied']), { reason: 'denied', line: 'hook', hook: 'beforeSync' });
  assert.deepEqual(classifyConsoleError(['[onAuthenticate]', 'od-refusal:unauthorized']), { reason: 'unauthorized', line: 'hook', hook: 'onAuthenticate' });
  assert.deepEqual(classifyConsoleError(['[beforeSync] od-refusal:denied']), { reason: 'denied', line: 'hook', hook: 'beforeSync' });
  assert.deepEqual(classifyConsoleError(['[onAuthenticate] od-refusal:reset:epoch']), { reason: 'reset:epoch', line: 'hook', hook: 'onAuthenticate' });
  assert.deepEqual(classifyConsoleError(['closing connection x1 (while handling board:abc) because of exception', new CollabRefusal('denied', 4403)]), { reason: 'denied', line: 'close' });
  // erros que não são nossos passam
  assert.equal(classifyConsoleError(['closing connection x1 (while handling board:abc) because of exception', new Error('boom')]), null);
  assert.equal(classifyConsoleError(['[onAuthenticate] connection refused']), null);
  assert.equal(classifyConsoleError(['[beforeSync] denied']), null);
  assert.equal(classifyConsoleError(['[onStoreDocument]', 'disk full']), null);
  assert.equal(classifyConsoleError(['[beforeSync]', 'od-refusal:inventado']), null);
  assert.equal(classifyConsoleError([new Error('od-refusal:denied')]), null);
});

test('(4) recusa ao vivo não imprime no console (vai para debug com contador); erro inesperado continua aparecendo; filtro sai ao fechar', async () => {
  const printed: unknown[][] = [];
  const realError = console.error;
  // espião ANTES do servidor: o filtro do hub embrulha este
  console.error = (...args: unknown[]) => {
    printed.push(args);
  };
  try {
    const s = await scenario();
    try {
      assert.equal(refusalFilterActive(), true);
      const a = s.open(s.owner);
      await until(() => a.synced, 'sync');
      // nome de documento inválido e época antiga (recusas na autenticação)
      const bad = connectClient(s.url, s.board.id, { t: s.owner.token } as never, { name: 'board:x' });
      const old = connectClient(s.url, s.board.id, { t: s.owner.token, e: 'outra-epoca' } as never);
      await until(() => !!bad.authFailed && !!old.authFailed, 'recusas na autenticação');
      bad.destroy();
      old.destroy();
      // veto (escrita sem permissão de outra pessoa forjando autoria)
      const e = s.open(s.editor);
      await until(() => e.synced, 'sync editor');
      const cur = readSlice(e.doc);
      applyLocalChange(e.doc, cur, { ...cur, elements: { ...cur.elements, s1: { ...cur.elements.s1, createdBy: 'outra-pessoa' } as CanvasElement } });
      await until(() => e.messages.some((m) => m.t === 'denied'), 'veto');
      await sleep(300);
      const line = (args: unknown[]) => args.map((x) => (x instanceof Error ? x.message : String(x))).join(' ');
      const ours = printed.filter((args) => /od-refusal|because of exception/.test(line(args)));
      assert.deepEqual(ours, [], 'nenhuma linha de recusa esperada no console');
      const counts = s.server.ctx.collab!.refusals;
      assert.ok((counts.get('denied') ?? 0) >= 2, `contador de recusas: ${JSON.stringify([...counts])}`);
      assert.ok((counts.get('reset:epoch') ?? 0) >= 1);
      // erro sem relação continua aparecendo, inalterado
      console.error('[onStoreDocument]', 'disco cheio');
      console.error('closing connection z (while handling board:q) because of exception', new Error('falha real'));
      assert.equal(printed.filter((p) => p[0] === '[onStoreDocument]' && p[1] === 'disco cheio').length, 1);
      assert.equal(printed.filter((p) => (p[1] as Error)?.message === 'falha real').length, 1);
    } finally {
      await s.close();
    }
    assert.equal(refusalFilterActive(), false, 'filtro removido ao fechar');
    console.error('[beforeSync]', 'od-refusal:denied');
    assert.equal(printed.at(-1)?.[1], 'od-refusal:denied', 'sem o servidor, nada é filtrado');
  } finally {
    console.error = realError;
  }
});

test('(4) filtro também sai quando o fechamento do servidor falha', async () => {
  const s = await scenario();
  try {
    assert.equal(refusalFilterActive(), true);
    const hub = s.server.ctx.collab!;
    const original = hub.hocuspocus.closeConnections.bind(hub.hocuspocus);
    hub.hocuspocus.closeConnections = (async () => {
      throw new Error('falhou ao fechar');
    }) as never;
    await assert.rejects(hub.close(), /falhou ao fechar/);
    assert.equal(refusalFilterActive(), false);
    hub.hocuspocus.closeConnections = original;
  } finally {
    await s.server.close().catch(() => undefined);
  }
});

/* ------------------------- Chat 08.2 · B (ajuste): conversa compartilhada ------------------------- */

test('conversa (pin de comentário) não fica presa: outra pessoa abre e responde enquanto a primeira escreve', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    const now = Date.now();
    const comment = { id: 'c1', type: 'comment', x: 0, y: 0, width: 32, height: 32, rotation: 0, zIndex: 0, createdAt: now, updatedAt: now, createdBy: s.owner.id, resolved: false, messages: [{ id: 'm1', author: 'Ana Admin', authorId: s.owner.id, text: 'primeira', createdAt: now }] };
    const before = readSlice(a.doc);
    applyLocalChange(a.doc, before, { ...before, elements: { ...before.elements, c1: comment as unknown as CanvasElement }, elementOrder: [...before.elementOrder, 'c1'] });
    await until(() => !!rootsOf(e.doc).els.get('c1'), 'conversa chegou');
    // a dona abre a conversa e está escrevendo nela
    a.send({ t: 'select', ids: ['c1'] });
    a.send({ t: 'editing', id: 'c1' });
    await sleep(150);
    // a outra pessoa abre a mesma conversa: nada de recusa
    e.send({ t: 'select', ids: ['c1'] });
    await sleep(200);
    assert.equal(of(e, 'select.denied').length, 0, 'abrir a conversa não é recusado');
    assert.equal(s.room().inUseBy(s.editor.id, 'c1'), null);
    // e responde: a resposta chega à dona
    const cur = readSlice(e.doc);
    const el = cur.elements.c1 as unknown as { messages: unknown[] };
    applyLocalChange(e.doc, cur, { ...cur, elements: { ...cur.elements, c1: { ...cur.elements.c1, messages: [...el.messages, { id: 'm2', author: 'Edi Tor', authorId: s.editor.id, text: 'resposta', createdAt: now + 1 }] } as CanvasElement } });
    await until(() => ((readElement(rootsOf(a.doc).els.get('c1')!) as unknown as { messages: unknown[] }).messages.length === 2), 'resposta chegou à dona');
    // objetos comuns continuam exclusivos
    a.send({ t: 'select', ids: ['s1'] });
    await sleep(150);
    e.send({ t: 'select', ids: ['s1'] });
    await until(() => of(e, 'select.denied').length === 1, 'post-it continua exclusivo');
  } finally {
    await s.close();
  }
});
