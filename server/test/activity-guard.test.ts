/**
 * LuDraw server — Chat 08.7 · R2 (S-03): o Activity Log do board só aceita o que a pessoa poderia ter feito.
 *
 * Antes: o tempo real (`me.activity`) e o PUT (`activityLog`) gravavam qualquer entrada nova com a identidade de
 * quem mandou — inclusive de leitor, convidado leitor e visitante anônimo ("excluiu 42 objetos") — sem teto e sem
 * poda de `board_activity`. Agora: cada entrada exige a ação de `can()` correspondente ao tipo (comentário = comentar,
 * objetos = editar, votação = gerenciar votação…), forma e tamanhos validados, teto de ids novos por conexão e poda
 * da tabela (5.000 linhas por board; o Audit Log da organização nunca é podado aqui).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { boardActivity, workspaceAudit } from '../src/db/schema';
import { runMaintenance } from '../src/maintenance';
import { connectClient, listen, sleep, until, type TestClient } from './collab-helpers';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, sticky, type Person, linkTokenOf } from './helpers';

async function scenario() {
  const { server, admin } = await startConfigured();
  const app = server.app;
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(app, owner, { data: emptyBoard({ s1: sticky('s1', 'ideia', { createdBy: admin.user.id }) }) });
  const editor = await invitePerson(app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  const commenter = await invitePerson(app, owner, { email: 'co@example.com', name: 'Co Mentador' });
  const reader = await invitePerson(app, owner, { email: 'le@example.com', name: 'Le Itor' });
  const guest = await invitePerson(app, owner, { email: 'g@partner.example', name: 'Convidado', role: 'guest_b2b', boardId: board.id, boardRole: 'viewer' });
  await api(app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: commenter.id, role: 'commenter' });
  await api(app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: reader.id, role: 'viewer' });
  const linkOp = await api(app, owner).op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true, accessLevel: 'viewer' } });
  const link = linkTokenOf(linkOp, board.id); // Chat 08.7 · R5 (S-17): o token vem da resposta, o banco só tem o hash
  const visitor = json(await app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, payload: {} })).visitorToken as string;
  const url = await listen(server);
  const clients: TestClient[] = [];
  const open = (token: string, visitorLink = false) => {
    const c = connectClient(url, board.id, { t: token, ...(visitorLink ? { k: 'v' } : {}) } as never);
    clients.push(c);
    return c;
  };
  const rows = async () => {
    await server.ctx.collab!.flush(board.id).catch(() => undefined);
    return (await server.ctx.db.select().from(boardActivity).where(eq(boardActivity.boardId, board.id))).map((r) => r.id);
  };
  const close = async () => {
    clients.forEach((c) => c.destroy());
    await server.close();
  };
  return { server, app, owner, editor, commenter, reader, guest, visitor, board, open, rows, close };
}

const entry = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  timestamp: Date.now(),
  action: 'deleted',
  targetType: 'sticky',
  targetCount: 42,
  elementIds: ['s1'],
  message: { key: 'board.activity.element.deleted', params: { things: { key: 'board.activity.nouns.sticky', params: { count: 42 } } } },
  ...over,
});

test('tempo real: leitor, convidado leitor e visitante não registram atividade; comentarista só a de comentário; editor registra', async () => {
  const s = await scenario();
  try {
    const watcher = s.open(s.owner.token);
    const reader = s.open(s.reader.token);
    const guest = s.open(s.guest.token);
    const visitor = s.open(s.visitor, true);
    const commenter = s.open(s.commenter.token);
    const editor = s.open(s.editor.token);
    await until(() => [watcher, reader, guest, visitor, commenter, editor].every((c) => c.synced), 'todos conectados');
    reader.send({ t: 'me.activity', entries: [entry('leitor-1')] as never });
    guest.send({ t: 'me.activity', entries: [entry('convidado-1')] as never });
    visitor.send({ t: 'me.activity', entries: [entry('visitante-1')] as never });
    commenter.send({ t: 'me.activity', entries: [entry('coment-apagou-1'), entry('coment-ok-1', { action: 'commented', targetType: 'comment', message: { key: 'board.activity.commented' } })] as never });
    editor.send({ t: 'me.activity', entries: [entry('editor-ok-1')] as never });
    await sleep(700);
    const seen = watcher.messages.filter((m) => m.t === 'activity').flatMap((m) => (m as unknown as { entries: { id: string }[] }).entries.map((e) => e.id));
    assert.deepEqual(seen.sort(), ['coment-ok-1', 'editor-ok-1'], 'só as entradas permitidas são transmitidas');
    const ids = await s.rows();
    for (const bad of ['leitor-1', 'convidado-1', 'visitante-1', 'coment-apagou-1']) assert.ok(!ids.includes(bad), `${bad} não pode ser gravada`);
    assert.ok(ids.includes('coment-ok-1') && ids.includes('editor-ok-1'), 'as permitidas são gravadas');
  } finally {
    await s.close();
  }
});

test('tempo real: forma e tamanhos validados (chave da mensagem, parâmetros, strings, tipo)', async () => {
  const s = await scenario();
  try {
    const watcher = s.open(s.owner.token);
    const editor = s.open(s.editor.token);
    await until(() => watcher.synced && editor.synced, 'conectados');
    const bad = [
      entry('chave-alheia', { message: { key: 'permissions.denied.noAccess' } }),
      entry('muitos-params', { message: { key: 'board.activity.element.deleted', params: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, i])) } }),
      entry('string-longa', { message: { key: 'board.activity.element.deleted', params: { title: 'x'.repeat(5000) } } }),
      entry('tipo-inventado', { action: 'hacked' }),
      entry('alvo-inventado', { targetType: 'banco-de-dados' }),
      entry('detalhe-livre', { detail: 'texto qualquer que não é chave' }),
      entry('aninhado-fundo', { message: { key: 'board.activity.a', params: { a: { key: 'board.activity.b', params: { b: { key: 'board.activity.c', params: { c: { key: 'board.activity.d', params: { d: { key: 'board.activity.e' } } } } } } } } } }),
    ];
    editor.send({ t: 'me.activity', entries: [...bad, entry('valida-1')] as never });
    await sleep(700);
    const ids = await s.rows();
    for (const b of bad) assert.ok(!ids.includes(b.id), `${b.id} recusada`);
    assert.ok(ids.includes('valida-1'), 'a entrada válida entra');
  } finally {
    await s.close();
  }
});

test('tempo real: teto de 120 entradas NOVAS por conexão por minuto (atualizar a própria entrada agrupada não conta)', async () => {
  const s = await scenario();
  try {
    const editor = s.open(s.editor.token);
    await until(() => editor.synced, 'conectado');
    for (let batch = 0; batch < 8; batch++) {
      editor.send({ t: 'me.activity', entries: Array.from({ length: 20 }, (_, i) => entry(`massa-${batch}-${i}`)) as never });
      await sleep(60);
    }
    // a mesma entrada agrupada atualizada muitas vezes (arrastar, colar em sequência) continua aceita
    for (let k = 0; k < 30; k++) {
      editor.send({ t: 'me.activity', entries: [entry('massa-0-0', { targetCount: 100 + k, lastTimestamp: Date.now() })] as never });
      await sleep(30);
    }
    await sleep(500);
    const ids = (await s.rows()).filter((id) => id.startsWith('massa-'));
    assert.equal(ids.length, 120, `ids novos gravados: ${ids.length}`);
    const [agrupada] = await s.server.ctx.db.select().from(boardActivity).where(eq(boardActivity.id, 'massa-0-0'));
    assert.equal((agrupada.entry as { targetCount: number }).targetCount, 129, 'a atualização da própria entrada continua passando');
  } finally {
    await s.close();
  }
});

test('PUT: leitor e convidado leitor não acrescentam entradas; comentarista só a de comentário; editor sim', async () => {
  const s = await scenario();
  try {
    const put = async (who: Person, extra: unknown[]) => {
      const cur = json(await api(s.app, who).get(`/boards/${s.board.id}/data`));
      const res = await api(s.app, who).put(`/boards/${s.board.id}/data`, { ...cur.data, activityLog: [...extra, ...(cur.data.activityLog ?? [])] }, cur.revision);
      return res.statusCode;
    };
    await put(s.reader, [entry('put-leitor')]);
    await put(s.guest, [entry('put-convidado')]);
    await put(s.commenter, [entry('put-coment-apagou'), entry('put-coment-ok', { action: 'commented', targetType: 'comment', message: { key: 'board.activity.commented' } })]);
    await put(s.editor, [entry('put-editor-ok'), entry('put-editor-chave-alheia', { message: { key: 'workspace.audit.msg.boardPurged' } })]);
    const ids = (await s.server.ctx.db.select().from(boardActivity).where(eq(boardActivity.boardId, s.board.id))).map((r) => r.id);
    for (const bad of ['put-leitor', 'put-convidado', 'put-coment-apagou', 'put-editor-chave-alheia']) assert.ok(!ids.includes(bad), `${bad} não pode ser gravada`);
    assert.ok(ids.includes('put-coment-ok'), 'comentário do comentarista');
    assert.ok(ids.includes('put-editor-ok'), 'entrada do editor');
  } finally {
    await s.close();
  }
});

test('poda: board_activity fica com as 5.000 entradas mais novas por board; o Audit Log da organização não é tocado', async () => {
  const s = await scenario();
  try {
    const base = Date.now() - 10_000_000;
    const rows = Array.from({ length: 5200 }, (_, i) => ({
      boardId: s.board.id,
      id: `poda-${String(i).padStart(5, '0')}-${randomUUID().slice(0, 4)}`,
      actorId: s.owner.id,
      action: 'updated',
      timestamp: new Date(base + i * 1000),
      entry: { i },
    }));
    for (let i = 0; i < rows.length; i += 500) await s.server.ctx.db.insert(boardActivity).values(rows.slice(i, i + 500));
    const auditBefore = (await s.server.ctx.db.select().from(workspaceAudit)).length;
    await runMaintenance(s.server.ctx);
    const left = await s.server.ctx.db.select().from(boardActivity).where(eq(boardActivity.boardId, s.board.id));
    const poda = left.filter((r) => r.id.startsWith('poda-'));
    assert.ok(left.length <= 5000, `linhas no board: ${left.length}`);
    assert.ok(poda.some((r) => (r.entry as { i: number }).i === 5199), 'a mais nova fica');
    assert.ok(!poda.some((r) => (r.entry as { i: number }).i === 0), 'a mais antiga sai');
    assert.equal((await s.server.ctx.db.select().from(workspaceAudit)).length, auditBefore, 'Audit Log da organização intacto');
  } finally {
    await s.close();
  }
});
