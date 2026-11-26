/**
 * Tempo real (Chat 08 · A-2): o servidor VETA antes de aplicar e de transmitir. Um teste por requisito do pedido:
 * (a) nota privada · (b) desbloqueio protegido · (c) votação anônima · (d) papel com motivo do explain() ·
 * (e) Activity Log e Audit Log pelo servidor · suspensão/link revogado derrubam a conexão — e os extras pedidos
 * pelo usuário: rebaixar com o board aberto, enxurrada de mensagens, token de visitante vencendo, imagem acima do
 * limite do WebSocket, versão com o estado de agora e restauração avisando quem está conectado, board invisível,
 * objeto em uso, limites do estado resultante.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { applyLocalChange, readElement, readSlice, rootsOf } from '../../src/collab/codec';
import type { CanvasElement, VotingState } from '../../src/types/canvas';
import { BOARD_LIMITS } from '../../src/utils/boardLimits';
import { boardActivity, snapshots, users, workspaceAudit } from '../src/db/schema';
import { connectClient, listen, sleep, until, type TestClient } from './collab-helpers';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, sticky, type Person, linkTokenOf } from './helpers';

type Server = Awaited<ReturnType<typeof startConfigured>>['server'];

async function scenario(env: Record<string, string> = {}, data?: Record<string, unknown>) {
  const { server, admin } = await startConfigured(env);
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: data ?? emptyBoard({ s1: sticky('s1', 'ideia', { createdBy: admin.user.id }) }) });
  const editor = await invitePerson(server.app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  const commenter = await invitePerson(server.app, owner, { email: 'co@example.com', name: 'Co Mentador' });
  await api(server.app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: commenter.id, role: 'commenter' });
  const url = await listen(server);
  const clients: TestClient[] = [];
  const open = (who: Person, extra: Record<string, unknown> = {}) => {
    const c = connectClient(url, board.id, { t: who.token, ...extra } as never);
    clients.push(c);
    return c;
  };
  const room = () => server.ctx.collab!.rooms.get(board.id)!;
  const close = async () => {
    clients.forEach((c) => c.destroy());
    await server.close();
  };
  return { server, owner, editor, commenter, board, url, open, room, close };
}

/** Escreve no documento local como o binding faria (patch num elemento). */
function patchEl(c: TestClient, id: string, patch: Partial<CanvasElement> & Record<string, unknown>) {
  const before = readSlice(c.doc);
  applyLocalChange(c.doc, before, { ...before, elements: { ...before.elements, [id]: { ...before.elements[id], ...patch } as CanvasElement } });
}
function addEl(c: TestClient, el: Record<string, unknown>) {
  const before = readSlice(c.doc);
  applyLocalChange(c.doc, before, { ...before, elements: { ...before.elements, [el.id as string]: el as unknown as CanvasElement }, elementOrder: [...before.elementOrder, el.id as string] });
}
const docText = (doc: Y.Doc, id: string) => {
  const y = rootsOf(doc).els.get(id);
  return y ? (readElement(y) as { text?: string }).text : undefined;
};
const denied = (c: TestClient) => c.messages.filter((m) => m.t === 'denied' && m.scope === 'document').map((m) => (m as { reason: { key: string } }).reason.key);

test('(b) editor sem ser facilitador tenta destravar o bloqueio protegido → VETO com o motivo do explain(); ninguém recebe', async () => {
  const s = await scenario({}, undefined);
  const a = s.open(s.owner);
  await until(() => a.synced, 'sync dono');
  patchEl(a, 's1', { locked: true, lockMode: 'protected', lockedBy: s.owner.id });
  await until(() => readElement(rootsOf(s.room().doc).els.get('s1')!).lockMode === 'protected', 'travado no servidor');
  const e = s.open(s.editor);
  try {
    await until(() => e.synced, 'sync editor');
    patchEl(e, 's1', { locked: false, lockMode: 'none', lockedBy: null });
    await until(() => denied(e).length > 0, 'recusa');
    assert.deepEqual(denied(e), ['permissions.denied.unlockProtected']);
    await sleep(300);
    assert.equal(readElement(rootsOf(s.room().doc).els.get('s1')!).lockMode, 'protected');
    assert.equal(readElement(rootsOf(a.doc).els.get('s1')!).lockMode, 'protected', 'a escrita recusada não chegou ao dono');
    // mexer no CONTEÚDO do objeto protegido também é recusado
    const e2 = s.open(s.editor);
    await until(() => e2.synced, 'sync 2');
    patchEl(e2, 's1', { text: 'mexi' });
    await until(() => denied(e2).length > 0, 'recusa 2');
    assert.equal(docText(s.room().doc, 's1'), 'ideia');
  } finally {
    await s.close();
  }
});

test('(d) comentador editando texto e visitante editor forjando autoria → recusados com motivo traduzível', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const c = s.open(s.commenter);
  try {
    await until(() => a.synced && c.synced, 'sync');
    patchEl(c, 's1', { text: 'do comentador' });
    await until(() => denied(c).length > 0, 'recusa');
    assert.match(denied(c)[0], /^permissions\./);
    assert.equal(docText(a.doc, 's1'), 'ideia');

    // visitante com link de editor: cria com o próprio id (aceito) e com o do dono (forjado: recusado)
    const linkOp = await api(s.server.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, accessLevel: 'editor' } });
    const link = linkTokenOf(linkOp, s.board.id); // Chat 08.7 · R5 (S-17): o token vem da resposta, o banco só tem o hash
    const sess = json(await s.server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, payload: {} }));
    const v = s.open({ token: sess.visitorToken, id: '' }, { k: 'v' });
    await until(() => v.synced, 'sync visitante');
    const vid = v.last('hello')!.userId;
    assert.match(vid, /^visitante:/);
    addEl(v, sticky('v1', 'do visitante', { createdBy: vid }));
    await until(() => !!rootsOf(a.doc).els.get('v1'), 'criação do visitante aceita');
    addEl(v, sticky('v2', 'forjado', { createdBy: s.owner.id }));
    await until(() => denied(v).length > 0, 'autoria forjada recusada');
    assert.deepEqual(denied(v), ['server.errors.collabInvalidChange']);
    assert.equal(rootsOf(a.doc).els.has('v2'), false);
  } finally {
    await s.close();
  }
});

test('(a) nota privada alheia: mexer no texto é recusado; revelar (facilitador) traz o texto e grava no Audit Log', async () => {
  const s = await scenario();
  const e = s.open(s.editor);
  await until(() => e.synced, 'sync editor');
  addEl(e, sticky('p1', '', { createdBy: s.editor.id, isPrivateDraft: true }));
  await until(() => !!rootsOf(s.room().doc).els.get('p1'), 'nota privada no servidor');
  e.send({ t: 'me.draft', id: 'p1', text: 'segredo do Edi', tags: [], rev: 1 });
  await until(() => s.room().secrets.drafts.get('p1')?.text === 'segredo do Edi', 'segredo guardado');
  const c = s.open(s.commenter);
  const a = s.open(s.owner);
  try {
    await until(() => c.synced && a.synced, 'sync');
    assert.equal(docText(a.doc, 'p1'), '');
    assert.equal(JSON.stringify([...a.messages, ...c.messages]).includes('segredo'), false);
    // o dono (facilitador) tenta escrever no texto da nota alheia sem revelar: recusado
    patchEl(a, 'p1', { text: 'sobrescrevi' });
    await until(() => denied(a).length > 0, 'recusa');
    assert.deepEqual(denied(a), ['server.errors.collabInvalidChange']);
    // revelar
    const a2 = s.open(s.owner);
    await until(() => a2.synced, 'sync 2');
    patchEl(a2, 'p1', { isPrivateDraft: false });
    await until(() => docText(c.doc, 'p1') === 'segredo do Edi', 'o texto chega a todos depois de revelar');
    await until(async () => (await s.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'private_notes_revealed'))).length === 1, 'audit');
    const [row] = await s.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'private_notes_revealed'));
    assert.equal(row.actorId, s.owner.id);
    assert.equal(row.targetId, s.board.id);
  } finally {
    await s.close();
  }
});

test('(c) votação anônima: cédulas alheias e cursores não saem até revelar; depois a revelação vai ao Audit Log', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    const v: VotingState = { active: true, title: 'Prioridades', dotsPerUser: 3, anonymous: true, hideCursors: true, revealed: false, votesByElement: {}, startedBy: s.owner.id, startedAt: 1794196559252 };
    const before = readSlice(a.doc);
    applyLocalChange(a.doc, before, { ...before, fac: { ...before.fac, voting: v } });
    await until(() => e.last('cursors.hidden')?.hidden === true || e.last('hello')?.hideCursors === true, 'cursores ocultos');
    e.send({ t: 'me.ballot', session: 1794196559252, ballot: { s1: 2 } });
    e.send({ t: 'cursor', x: 10, y: 20 });
    e.send({ t: 'select', ids: ['s1'] });
    await sleep(600);
    assert.equal(a.messages.some((m) => m.t === 'pointers' && (s.editor.id in (m.cursors ?? {}) || s.editor.id in (m.selection ?? {}))), false, 'nenhum cursor/seleção do editor chegou');
    assert.equal(JSON.stringify(rootsOf(a.doc).fac.toJSON()).includes(s.editor.id), false, 'nenhuma cédula alheia no documento');
    // editor (não facilitador) tenta revelar: recusado
    const b2 = readSlice(e.doc);
    applyLocalChange(e.doc, b2, { ...b2, fac: { ...b2.fac, voting: { ...v, revealed: true, revealedAt: 2 } } });
    await until(() => denied(e).length > 0, 'recusa');
    assert.match(denied(e)[0], /^permissions\./);
    // dono revela
    const b3 = readSlice(a.doc);
    applyLocalChange(a.doc, b3, { ...b3, fac: { ...b3.fac, voting: { ...v, revealed: true, revealedAt: 3 } } });
    await until(() => (rootsOf(a.doc).fac.get('tally') as { votesByElement?: Record<string, number> } | undefined)?.votesByElement?.s1 === 2, 'totais revelados');
    await until(async () => (await s.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'voting_revealed'))).length === 1, 'audit');
  } finally {
    await s.close();
  }
});

test('(e) Activity Log gravado pelo servidor com autor carimbado; recusas agrupadas no Audit Log', async () => {
  const s = await scenario();
  const e = s.open(s.editor);
  try {
    await until(() => e.synced, 'sync');
    addEl(e, sticky('n1', 'novo', { createdBy: s.editor.id }));
    // entrada com autor FORJADO: o servidor troca pelo de quem está conectado
    e.send({ t: 'me.activity', entries: [{ id: 'act1', timestamp: Date.now(), actorId: s.owner.id, actorName: 'Ana Admin', actorRole: 'admin', action: 'created', targetType: 'sticky', targetCount: 1, elementIds: ['n1'], message: { key: 'board.activity.created' } } as never] });
    await until(() => s.room().activity.some((x) => x.id === 'act1'), 'entrada aceita');
    await s.server.ctx.collab!.flush(s.board.id);
    const [row] = await s.server.ctx.db.select().from(boardActivity).where(and(eq(boardActivity.boardId, s.board.id), eq(boardActivity.id, 'act1')));
    assert.equal(row.actorId, s.editor.id);
    assert.equal((row.entry as { actorName: string }).actorName, 'Edi Tor');
    // o editor não pode reescrever a entrada de outra pessoa
    const c = s.open(s.commenter);
    await until(() => c.synced, 'sync 2');
    c.send({ t: 'me.activity', entries: [{ id: 'act1', timestamp: Date.now(), action: 'deleted', message: { key: 'x' } } as never] });
    await sleep(300);
    assert.equal(s.room().activity.find((x) => x.id === 'act1')!.actorId, s.editor.id);
    // recusas (o comentador tentando editar) viram UMA linha agrupada no Audit Log
    patchEl(c, 's1', { text: 'x' });
    await until(() => denied(c).length > 0, 'recusa');
    await (s.room() as unknown as { writeDenials(uid: string): Promise<void> }).writeDenials(s.commenter.id);
    await until(async () => (await s.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'collab_write_denied'))).length === 1, 'audit da recusa');
    const [audit] = await s.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'collab_write_denied'));
    assert.equal(audit.actorId, s.commenter.id);
    assert.equal(audit.count, 1);
  } finally {
    await s.close();
  }
});

test('suspender o membro derruba o WebSocket; revogar o link derruba o visitante', async () => {
  const s = await scenario();
  const linkOp = await api(s.server.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, accessLevel: 'viewer' } });
  const link = linkTokenOf(linkOp, s.board.id); // Chat 08.7 · R5 (S-17): o token vem da resposta, o banco só tem o hash
  const sess = json(await s.server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, payload: {} }));
  const e = s.open(s.editor);
  const v = s.open({ token: sess.visitorToken, id: '' }, { k: 'v' });
  try {
    await until(() => e.synced && v.synced, 'sync');
    await api(s.server.app, s.owner).op({ type: 'suspendAccount', id: s.editor.id });
    await until(() => e.closes.length > 0, 'editor caiu');
    await api(s.server.app, s.owner).op({ type: 'revokePublicLink', boardId: s.board.id });
    await until(() => v.closes.length > 0, 'visitante caiu');
    assert.equal(v.last('reload')?.reason, 'access');
  } finally {
    await s.close();
  }
});

test('rebaixar editor→leitor com o board aberto: aviso na hora, conexão só de leitura, próxima escrita não entra', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    patchEl(e, 's1', { text: 'antes de rebaixar' });
    await until(() => docText(a.doc, 's1') === 'antes de rebaixar', 'edição aceita');
    await api(s.server.app, s.owner).op({ type: 'setBoardMember', boardId: s.board.id, userId: s.editor.id, role: 'viewer' });
    await until(() => denied(e).length > 0, 'aviso de rebaixamento');
    const conn = [...s.room().conns.values()].find((c) => c.principal.userId === s.editor.id)!;
    assert.equal(conn.hp.readOnly, true);
    patchEl(e, 's1', { text: 'depois de rebaixar' });
    await sleep(500);
    assert.equal(docText(a.doc, 's1'), 'antes de rebaixar');
    assert.equal(docText(s.room().doc, 's1'), 'antes de rebaixar');
  } finally {
    await s.close();
  }
});

test('enxurrada: atualizações demais derrubam na hora; mensagens de presença demais por várias janelas também', async () => {
  const s = await scenario();
  const e = s.open(s.editor);
  try {
    await until(() => e.synced, 'sync');
    for (let i = 0; i < 400; i++) patchEl(e, 's1', { x: i });
    await until(() => e.closes.some((c) => c.code === 4429) || e.messages.some((m) => m.t === 'denied' && m.scope === 'rate'), 'limite de atualizações');
    const p = s.open(s.editor);
    await until(() => p.synced, 'sync 2');
    const end = Date.now() + 7000;
    while (Date.now() < end && p.closes.length === 0) {
      for (let i = 0; i < 40; i++) p.send({ t: 'cursor', x: i, y: i });
      await sleep(100);
    }
    assert.ok(p.closes.length > 0, 'presença em excesso por várias janelas derruba a conexão');
  } finally {
    await s.close();
  }
});

test('token de visitante vencendo com o board aberto: a conferência periódica derruba a conexão', async () => {
  const s = await scenario();
  const linkOp = await api(s.server.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, accessLevel: 'viewer' } });
  const link = linkTokenOf(linkOp, s.board.id); // Chat 08.7 · R5 (S-17): o token vem da resposta, o banco só tem o hash
  const sess = json(await s.server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, payload: {} }));
  const v = s.open({ token: sess.visitorToken, id: '' }, { k: 'v' });
  try {
    await until(() => v.synced, 'sync');
    const conn = [...s.room().conns.values()].find((c) => c.principal.kind === 'visitor')!;
    conn.principal.expiresAt = Date.now() - 1; // o token venceu
    await s.server.ctx.collab!.recheckAll();
    await until(() => v.closes.length > 0, 'visitante caiu');
  } finally {
    await s.close();
  }
});

test('imagem maior que o limite do WebSocket: conexão fecha (1009), nada entra; o servidor continua inteiro', async () => {
  const s = await scenario({ LUDRAW_COLLAB_MAX_PAYLOAD_MB: '1' });
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    assert.equal(e.last('hello')!.maxPayloadMb, 1);
    addEl(e, { id: 'img1', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 0, createdAt: 1, updatedAt: 1, createdBy: s.editor.id, dataUrl: `data:image/png;base64,${'A'.repeat(1_500_000)}` });
    await until(() => e.closes.some((c) => c.code === 1009), 'fechou por tamanho');
    await sleep(300);
    assert.equal(rootsOf(s.room().doc).els.has('img1'), false);
    assert.equal(rootsOf(a.doc).els.has('img1'), false);
  } finally {
    await s.close();
  }
});

test('versão em modo ao vivo sai do estado de AGORA; restaurar avisa os conectados com quem restaurou', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  try {
    await until(() => a.synced, 'sync');
    patchEl(a, 's1', { text: 'só na memória' });
    await until(() => docText(s.room().doc, 's1') === 'só na memória', 'no servidor');
    const snap = await api(s.server.app, s.owner).post(`/boards/${s.board.id}/snapshots`, { name: 'v1', kind: 'manual' });
    assert.equal(snap.statusCode, 200);
    const [row] = await s.server.ctx.db.select().from(snapshots).where(eq(snapshots.id, json(snap).snapshot.id));
    assert.equal((row.data as { elements: Record<string, { text: string }> }).elements.s1.text, 'só na memória');
    patchEl(a, 's1', { text: 'depois da versão' });
    await until(() => docText(s.room().doc, 's1') === 'depois da versão', 'edição seguinte');
    const restored = await api(s.server.app, s.owner).post(`/boards/${s.board.id}/snapshots/${row.id}/restore`);
    assert.equal(restored.statusCode, 200);
    await until(() => a.last('reload') !== undefined, 'aviso');
    assert.deepEqual([a.last('reload')!.reason, a.last('reload')!.by], ['restored', s.owner.id]);
  } finally {
    await s.close();
  }
});

test('board que a pessoa não pode ver: recusa genérica (não revela se existe)', async () => {
  const s = await scenario();
  // convidado externo ligado só a OUTRO board
  const other = await createBoard(s.server.app, s.owner, { name: 'Outro' });
  const guest = await invitePerson(s.server.app, s.owner, { email: 'cliente@example.com', name: 'Cliente', role: 'guest_b2b', boardId: other.id, boardRole: 'viewer' });
  const g = s.open(guest);
  try {
    await until(() => g.authFailed !== null, 'recusa');
    assert.equal(g.authFailed, 'denied');
    assert.equal(g.synced, false);
  } finally {
    await s.close();
  }
});

test('objeto em uso por outra pessoa: escrita recusada com o nome dela; quando ela solta, entra', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    e.send({ t: 'select', ids: ['s1'] });
    await sleep(200);
    patchEl(a, 's1', { text: 'atropelei' });
    await until(() => denied(a).length > 0, 'recusa');
    assert.deepEqual(denied(a), ['server.errors.objectInUse']);
    const reason = a.messages.find((m) => m.t === 'denied') as unknown as { reason: { params: { name: string } } };
    assert.equal(reason.reason.params.name, 'Edi Tor');
    e.send({ t: 'select', ids: [] });
    await sleep(200);
    const a2 = s.open(s.owner);
    await until(() => a2.synced, 'sync 2');
    patchEl(a2, 's1', { text: 'agora pode' });
    await until(() => docText(s.room().doc, 's1') === 'agora pode', 'aceita');
  } finally {
    await s.close();
  }
});

test('limites do estado RESULTANTE: texto acima do teto é recusado com a chave do limite', async () => {
  const s = await scenario();
  const a = s.open(s.owner);
  const e = s.open(s.editor);
  try {
    await until(() => a.synced && e.synced, 'sync');
    patchEl(e, 's1', { text: 'x'.repeat(BOARD_LIMITS.textChars + 1) });
    await until(() => denied(e).length > 0, 'recusa');
    assert.deepEqual(denied(e), ['server.errors.textTooLong']);
    assert.equal(docText(s.room().doc, 's1'), 'ideia');
  } finally {
    await s.close();
  }
});

export type { Server };

test('S-11: senha redefinida pela administração (troca obrigatória) derruba o tempo real na conferência periódica', async () => {
  const s = await scenario();
  const e = s.open(s.editor);
  try {
    await until(() => e.synced, 'sync');
    // o REST já recusa (403) quem precisa trocar a senha; o WebSocket aberto continuava editando
    await s.server.ctx.db.update(users).set({ mustChangePassword: true }).where(eq(users.id, s.editor.id));
    await s.server.ctx.collab!.recheckAll();
    await until(() => e.closes.length > 0, 'conexão de quem precisa trocar a senha caiu');
    assert.equal(e.last('reload')?.reason, 'access');
  } finally {
    await s.close();
  }
});
