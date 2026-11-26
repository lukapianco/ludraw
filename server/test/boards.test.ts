/**
 * Conteúdo do board no servidor (Chat 07): `writeGuard` (cada mudança exige a ação certa do `can()`),
 * redação (nota privada alheia, votação anônima), autoria carimbada, Activity Log, concorrência por
 * revisão, limites de tamanho e versões.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { boards, snapshots, workspaceAudit } from '../src/db/schema';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, sticky, type Person } from './helpers';

type Board = Record<string, any>;

async function scenario() {
  const { server, admin } = await startConfigured();
  const app = server.app;
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(app, owner, { data: emptyBoard({ s1: sticky('s1', 'ideia') }) });
  const editor = await invitePerson(app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  const viewer = await invitePerson(app, owner, { email: 'vi@example.com', name: 'Vi Leitora' });
  const commenter = await invitePerson(app, owner, { email: 'co@example.com', name: 'Co Mentador' });
  await api(app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: viewer.id, role: 'viewer' });
  await api(app, owner).op({ type: 'setBoardMember', boardId: board.id, userId: commenter.id, role: 'commenter' });
  const read = async (who: Person): Promise<{ data: Board; revision: number }> => json(await api(app, who).get(`/boards/${board.id}/data`));
  const write = async (who: Person, mutate: (d: Board) => void) => {
    const { data, revision } = await read(who);
    mutate(data);
    return api(app, who).put(`/boards/${board.id}/data`, data, revision);
  };
  const stored = async (): Promise<Board> => (await server.ctx.db.select().from(boards).where(eq(boards.id, board.id)))[0].data as Board;
  return { server, app, owner, editor, viewer, commenter, board, read, write, stored };
}

const comment = (id: string, authorId: string, text = 'oi') => ({
  id,
  type: 'comment',
  x: 10,
  y: 10,
  width: 0,
  height: 0,
  rotation: 0,
  zIndex: 5,
  createdAt: 1,
  updatedAt: 1,
  resolved: false,
  messages: [{ id: `${id}-m1`, author: 'x', authorId, text, createdAt: 1 }],
});

test('revisão: sem If-Match → 428; desatualizada → 409; certa grava e sobe a revisão', async () => {
  const s = await scenario();
  try {
    const { data, revision } = await s.read(s.editor);
    assert.equal(revision, 0);
    assert.equal((await s.app.inject({ method: 'PUT', url: `/api/v1/boards/${s.board.id}/data`, headers: { authorization: `Bearer ${s.editor.token}` }, payload: data })).statusCode, 428);
    data.elements.s1.text = 'nova';
    const ok = await api(s.app, s.editor).put(`/boards/${s.board.id}/data`, data, 0);
    assert.equal(ok.statusCode, 200);
    assert.equal(json(ok).revision, 1);
    const stale = await api(s.app, s.editor).put(`/boards/${s.board.id}/data`, data, 0);
    assert.equal(stale.statusCode, 409);
    assert.equal(json(stale).error.message.key, 'server.errors.boardConflict');
  } finally {
    await s.server.close();
  }
});

test('leitor só lê; comentador comenta e reage (só o próprio clique), mas não edita', async () => {
  const s = await scenario();
  try {
    const denied = await s.write(s.viewer, (d) => (d.elements.s1.text = 'hack'));
    assert.equal(denied.statusCode, 403);
    assert.ok(json(denied).error.message.key.startsWith('permissions.'));
    const c = await s.write(s.commenter, (d) => {
      d.elements.c1 = comment('c1', s.commenter.id);
      d.elementOrder.push('c1');
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((await s.stored()).elements.c1.createdBy, s.commenter.id);
    const addSticky = await s.write(s.commenter, (d) => {
      d.elements.s2 = sticky('s2', 'x');
      d.elementOrder.push('s2');
    });
    assert.equal(addSticky.statusCode, 403);
    const react = await s.write(s.commenter, (d) => {
      d.elements.s1.reactions = { '👍': 1 };
      d.elements.s1.reactedBy = { '👍': [s.commenter.id] };
    });
    assert.equal(react.statusCode, 200, react.body);
    const forge = await s.write(s.commenter, (d) => {
      d.elements.s1.reactions = { '👍': 2 };
      d.elements.s1.reactedBy = { '👍': [s.commenter.id, s.owner.id] };
    });
    assert.equal(forge.statusCode, 403, 'reagir em nome de outra pessoa exige edição');
    const deleteOthers = await s.write(s.viewer, (d) => {
      delete d.elements.c1;
      d.elementOrder = d.elementOrder.filter((x: string) => x !== 'c1');
    });
    assert.equal(deleteOthers.statusCode, 403);
  } finally {
    await s.server.close();
  }
});

test('bloqueio protegido: editor não mexe nem destrava; facilitador (titular) sim', async () => {
  const s = await scenario();
  try {
    const lock = await s.write(s.owner, (d) => Object.assign(d.elements.s1, { locked: true, lockMode: 'protected', lockedBy: s.owner.id }));
    assert.equal(lock.statusCode, 200);
    const edit = await s.write(s.editor, (d) => (d.elements.s1.text = 'mudou'));
    assert.equal(edit.statusCode, 403);
    assert.equal(json(edit).error.message.key, 'permissions.denied.unlockProtected');
    const unlock = await s.write(s.editor, (d) => Object.assign(d.elements.s1, { locked: false, lockMode: 'none', lockedBy: null }));
    assert.equal(unlock.statusCode, 403);
    const del = await s.write(s.editor, (d) => {
      delete d.elements.s1;
      d.elementOrder = [];
    });
    assert.equal(del.statusCode, 403);
    const editor2 = await s.write(s.editor, (d) => {
      d.elements.s3 = sticky('s3', 'protegido pelo editor', { locked: true, lockMode: 'protected' });
      d.elementOrder.push('s3');
    });
    assert.equal(editor2.statusCode, 403, 'editor não aplica bloqueio protegido');
    assert.equal((await s.write(s.owner, (d) => (d.elements.s1.text = 'ok'))).statusCode, 200);
  } finally {
    await s.server.close();
  }
});

test('Modo Privado: texto alheio não sai; gravar de volta não apaga; só o facilitador revela', async () => {
  const s = await scenario();
  try {
    assert.equal((await s.write(s.editor, (d) => (d.facilitation.privateMode = { enabled: true, previewOwnNotes: false }))).statusCode, 403, 'editor não liga o Modo Privado');
    assert.equal((await s.write(s.owner, (d) => (d.facilitation.privateMode = { enabled: true, previewOwnNotes: false, startedBy: s.owner.id, startedAt: 5 }))).statusCode, 200);
    const draft = await s.write(s.editor, (d) => {
      d.elements.p1 = sticky('p1', 'segredo do Edi', { isPrivateDraft: true });
      d.elementOrder.push('p1');
    });
    assert.equal(draft.statusCode, 200);
    const ownerView = await s.read(s.owner);
    assert.equal(ownerView.data.elements.p1.text, '', 'texto escondido de quem não é o autor');
    assert.equal((await s.read(s.editor)).data.elements.p1.text, 'segredo do Edi', 'o autor vê');
    // o titular grava o board (com o texto redigido) mexendo em outra coisa → o segredo continua
    assert.equal((await s.write(s.owner, (d) => (d.elements.s1.text = 'outra coisa'))).statusCode, 200);
    assert.equal((await s.stored()).elements.p1.text, 'segredo do Edi');
    // tentar mudar a nota alheia não tem efeito
    await s.write(s.owner, (d) => (d.elements.p1.color = '#000000'));
    assert.equal((await s.stored()).elements.p1.color, '#FBED7C');
    // comentador não revela
    assert.equal((await s.write(s.commenter, (d) => (d.elements.p1.isPrivateDraft = false))).statusCode, 403);
    assert.equal((await s.write(s.owner, (d) => (d.elements.p1.isPrivateDraft = false))).statusCode, 200);
    const revealed = await s.read(s.owner);
    assert.equal(revealed.data.elements.p1.text, 'segredo do Edi');
  } finally {
    await s.server.close();
  }
});

test('votação anônima: cada um vê só as próprias cédulas; ninguém forja a do outro; revelar junta tudo', async () => {
  const s = await scenario();
  try {
    const voting = { active: true, title: 'Prioridades', dotsPerUser: 3, anonymous: true, hideCursors: false, revealed: false, votesByElement: {}, ballots: {}, startedAt: 100, startedBy: s.owner.id };
    assert.equal((await s.write(s.editor, (d) => (d.facilitation.voting = voting))).statusCode, 403, 'só facilitador abre votação');
    assert.equal((await s.write(s.owner, (d) => (d.facilitation.voting = voting))).statusCode, 200);
    assert.equal((await s.write(s.editor, (d) => (d.facilitation.voting.ballots = { [s.editor.id]: { s1: 1 } }))).statusCode, 200);
    assert.equal((await s.write(s.owner, (d) => (d.facilitation.voting.ballots = { [s.owner.id]: { s1: 2 } }))).statusCode, 200);
    const ownerView = (await s.read(s.owner)).data.facilitation.voting;
    assert.deepEqual(Object.keys(ownerView.ballots), [s.owner.id]);
    assert.deepEqual(ownerView.votesByElement, { s1: 2 });
    const forged = await s.write(s.editor, (d) => (d.facilitation.voting.ballots = { [s.editor.id]: { s1: 1 }, [s.owner.id]: { s1: 0 } }));
    assert.equal(forged.statusCode, 200);
    const st = (await s.stored()).facilitation.voting;
    assert.deepEqual(st.ballots[s.owner.id], { s1: 2 }, 'a cédula alheia vem do banco');
    assert.deepEqual(st.votesByElement, { s1: 3 });
    assert.equal((await s.write(s.owner, (d) => (d.facilitation.voting.revealed = true))).statusCode, 200);
    assert.deepEqual((await s.read(s.editor)).data.facilitation.voting.votesByElement, { s1: 3 });
  } finally {
    await s.server.close();
  }
});

test('autoria e Activity Log: createdBy e autor carimbados pelo servidor; limpar exige permissão; cronômetro exige facilitador', async () => {
  const s = await scenario();
  try {
    const res = await s.write(s.editor, (d) => {
      d.elements.s9 = sticky('s9', 'x', { createdBy: s.owner.id });
      d.elementOrder.push('s9');
      d.activityLog = [{ id: 'a1', timestamp: 10, actorId: s.owner.id, actorName: 'Ana Admin', actorRole: 'admin', action: 'created', targetType: 'sticky', targetCount: 1 }];
    });
    assert.equal(res.statusCode, 200);
    const st = await s.stored();
    assert.equal(st.elements.s9.createdBy, s.editor.id);
    assert.equal(st.activityLog[0].actorId, s.editor.id);
    assert.equal(st.activityLog[0].actorName, 'Edi Tor');
    const act = json(await api(s.app, s.owner).get(`/boards/${s.board.id}/activity`));
    assert.equal(act.entries[0].actorId, s.editor.id);
    assert.equal((await s.write(s.editor, (d) => (d.activityLog = []))).statusCode, 403);
    assert.equal((await s.write(s.owner, (d) => (d.activityLog = []))).statusCode, 200);
    assert.equal((await s.write(s.editor, (d) => (d.facilitation.timer = { running: true, durationMs: 60000, remainingMs: 60000, musicTrack: 'none' }))).statusCode, 403);
    assert.equal((await s.write(s.editor, (d) => (d.facilitatorIds = [s.owner.id, s.editor.id]))).statusCode, 200, 'membro editor compartilha (política padrão)');
    assert.equal((await s.write(s.viewer, (d) => (d.facilitatorIds = [s.viewer.id]))).statusCode, 403);
  } finally {
    await s.server.close();
  }
});

test('limites: objetos, texto, imagem, contorno e corpo grande são recusados com chave traduzível', async () => {
  const s = await scenario();
  try {
    const put = (data: unknown) => api(s.app, s.owner).put(`/boards/${s.board.id}/data`, data, 0);
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 20_001; i++) many[`e${i}`] = { id: `e${i}`, type: 'text' };
    assert.equal(json(await put(emptyBoard(many))).error.message.key, 'server.errors.tooManyElements');
    assert.equal(json(await put(emptyBoard({ t: sticky('t', 'a'.repeat(100_001)) }))).error.message.key, 'server.errors.textTooLong');
    const img = { id: 'i', type: 'image', x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1, createdAt: 1, updatedAt: 1, src: `data:image/png;base64,${'A'.repeat(12 * 1024 * 1024 + 10)}` };
    const big = await put(emptyBoard({ i: img }));
    assert.equal(big.statusCode, 422);
    assert.equal(json(big).error.message.key, 'server.errors.imageTooLarge');
    const shape = { id: 'p', type: 'shape', customPath: 'M0,0' + 'L1,1'.repeat(20_001) };
    assert.equal(json(await put(emptyBoard({ p: shape }))).error.message.key, 'server.errors.pathTooComplex');
    assert.equal(json(await put({ version: 2 })).error.message.key, 'server.errors.invalidBoard');
    const huge = await put(emptyBoard({ h: { ...img, src: 'x'.repeat(41 * 1024 * 1024) } }));
    assert.equal(huge.statusCode, 413);
    assert.equal(json(huge).error.message.key, 'server.errors.payloadTooLarge');
    // um board grande dentro dos limites passa
    const ok: Record<string, unknown> = {};
    for (let i = 0; i < 3000; i++) ok[`k${i}`] = sticky(`k${i}`, `nota ${i}`);
    const fine = await put(emptyBoard(ok));
    assert.equal(fine.statusCode, 200, fine.body);
  } finally {
    await s.server.close();
  }
});

test('versões: tiradas do conteúdo gravado, listadas com redação; restaurar só titular/admin (com versão de segurança)', async () => {
  const s = await scenario();
  try {
    await s.write(s.owner, (d) => (d.facilitation.privateMode = { enabled: true, previewOwnNotes: false }));
    await s.write(s.editor, (d) => {
      d.elements.p1 = sticky('p1', 'segredo', { isPrivateDraft: true });
      d.elementOrder.push('p1');
    });
    const snap = await api(s.app, s.editor).post(`/boards/${s.board.id}/snapshots`, { name: 'Antes da revisão', kind: 'manual' });
    assert.equal(snap.statusCode, 200);
    const list = json(await api(s.app, s.owner).get(`/boards/${s.board.id}/snapshots`)).snapshots;
    assert.equal(list[0].data.elements.p1.text, '', 'nota privada alheia redigida também nas versões');
    const sid = list[0].id;
    await s.write(s.owner, (d) => (d.elements.s1.text = 'depois'));
    assert.equal((await api(s.app, s.editor).post(`/boards/${s.board.id}/snapshots/${sid}/restore`)).statusCode, 403);
    assert.equal((await api(s.app, s.editor).del(`/boards/${s.board.id}/snapshots/${sid}`)).statusCode, 403);
    const restored = await api(s.app, s.owner).post(`/boards/${s.board.id}/snapshots/${sid}/restore`);
    assert.equal(restored.statusCode, 200);
    const st = await s.stored();
    assert.equal(st.elements.s1.text, 'ideia');
    assert.equal(st.elements.p1.text, 'segredo', 'restaurar não perde o texto privado');
    assert.equal(st.activityLog[0].action, 'snapshot_restored');
    const all = await s.server.ctx.db.select().from(snapshots).where(eq(snapshots.boardId, s.board.id));
    assert.ok(all.some((x) => x.kind === 'safety'), 'versão de segurança antes de restaurar');
    const audit = await s.server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'snapshot_restored'));
    assert.equal(audit.length, 1);
  } finally {
    await s.server.close();
  }
});
