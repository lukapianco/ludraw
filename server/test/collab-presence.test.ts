/**
 * Presença e opções do board no tempo real (Chat 08): cores distintas por pessoa, caixa de seleção reenviada,
 * enquete com resultado parcial só quando ligado (para todos) e a política do admin de cores diferentes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorDistance, MIN_COLOR_DISTANCE, pickDistinctColor } from '../../src/collab/colors';
import { applyLocalChange, readFac, readSlice } from '../../src/collab/codec';
import { COLLABORATOR_PALETTE } from '../../src/collab/protocol';
import type { VotingState } from '../../src/types/canvas';
import { connectClient, listen, sleep, until } from './collab-helpers';
import { api, createBoard, emptyBoard, invitePerson, startConfigured, sticky, type Person } from './helpers';

test('cores: mantém a cor da pessoa se ela não se confunde; senão escolhe uma bem diferente', () => {
  assert.equal(pickDistinctColor('#E5484D', ['#2C64A8'], COLLABORATOR_PALETTE), '#E5484D');
  const twin = pickDistinctColor('#E5484D', ['#E5484D'], COLLABORATOR_PALETTE);
  assert.notEqual(twin, '#E5484D');
  assert.ok(colorDistance(twin, '#E5484D') >= MIN_COLOR_DISTANCE);
  // quase igual também conta como igual
  const near = pickDistinctColor('#E5484E', ['#E5484D'], COLLABORATOR_PALETTE);
  assert.ok(colorDistance(near, '#E5484D') >= MIN_COLOR_DISTANCE);
  // muitas pessoas: cada uma nova fica o mais longe possível das outras
  const taken: string[] = [];
  for (let i = 0; i < 10; i++) taken.push(pickDistinctColor('#194B32', taken, COLLABORATOR_PALETTE));
  assert.equal(new Set(taken).size, 10);
});

async function scenario() {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: emptyBoard({ s1: sticky('s1', 'ideia') }) });
  const editor = await invitePerson(server.app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  const url = await listen(server);
  const a = connectClient(url, board.id, { t: owner.token });
  const e = connectClient(url, board.id, { t: editor.token });
  await until(() => a.synced && e.synced, 'sync');
  return { server, owner, editor, a, e, board };
}

test('cores: duas pessoas com a mesma cor de avatar recebem cores diferentes no board', async () => {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: emptyBoard() });
  const editor = await invitePerson(server.app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  // força a mesma cor de avatar nas duas contas
  const { users } = await import('../src/db/schema');
  const { eq } = await import('drizzle-orm');
  await server.ctx.db.update(users).set({ avatarColor: '#E5484D' }).where(eq(users.id, owner.id));
  await server.ctx.db.update(users).set({ avatarColor: '#E5484D' }).where(eq(users.id, editor.id));
  const url = await listen(server);
  const a = connectClient(url, board.id, { t: owner.token });
  await until(() => a.synced, 'sync a');
  const e = connectClient(url, board.id, { t: editor.token });
  try {
    await until(() => (a.last('presence')?.users.length ?? 0) === 2, 'presença com 2');
    const [c1, c2] = a.last('presence')!.users.map((u) => u.color);
    assert.equal(c1, '#E5484D'); // quem chegou primeiro fica com a sua
    assert.ok(colorDistance(c1, c2) >= MIN_COLOR_DISTANCE);
    // a pessoa recebe no "hello" a mesma cor que os outros veem
    assert.equal(e.last('hello')!.color, c2);
  } finally {
    a.destroy();
    e.destroy();
    await server.close();
  }
});

test('caixa de seleção (marquee) chega aos outros, com dono carimbado; some ao soltar', async () => {
  const s = await scenario();
  try {
    s.e.send({ t: 'marquee', rect: { x: 10, y: 20, width: 300, height: 120 } });
    await until(() => s.a.messages.some((m) => m.t === 'pointers' && m.marquee?.[s.editor.id]?.width === 300), 'marquee chegou');
    assert.equal(s.e.messages.some((m) => m.t === 'pointers' && m.marquee?.[s.editor.id]), false); // não volta para quem mandou
    s.e.send({ t: 'marquee', rect: null });
    await until(() => s.a.messages.some((m) => m.t === 'pointers' && s.editor.id in (m.marquee ?? {}) && m.marquee[s.editor.id] === null), 'marquee sumiu');
  } finally {
    s.a.destroy();
    s.e.destroy();
    await s.server.close();
  }
});

const poll = (anonymous: boolean, liveResults: boolean): VotingState => ({
  active: true,
  title: 'Enquete',
  dotsPerUser: 1,
  anonymous,
  hideCursors: false,
  revealed: false,
  votesByElement: {},
  startedBy: 'x',
  startedAt: 1794196559252,
  kind: 'poll',
  poll: { options: [{ id: 'o1', text: 'Sim' }, { id: 'o2', text: 'Não' }], multiple: false, responses: {}, ...(liveResults ? { liveResults: true } : {}) },
});

function setVoting(c: { doc: import('yjs').Doc }, v: VotingState) {
  const before = readSlice(c.doc);
  applyLocalChange(c.doc, before, { ...before, fac: { ...before.fac, voting: v } });
}

test('enquete com "resultado parcial" DESLIGADO: ninguém acompanha, nem quem gerencia, até revelar', async () => {
  const s = await scenario();
  try {
    setVoting(s.a, poll(false, false));
    await until(() => readFac(s.e.doc.getMap('fac')).voting?.kind === 'poll', 'enquete chega');
    s.e.send({ t: 'me.poll', session: 1794196559252, options: ['o1'] });
    await until(() => !!s.server.ctx.collab!.rooms.get(s.board.id)?.secrets.poll.responses[s.editor.id], 'servidor guardou');
    await sleep(300);
    assert.equal(readFac(s.a.doc.getMap('fac')).tally?.poll, undefined);
    assert.equal(s.a.last('me.state')?.pollAll, null);
    assert.equal(JSON.stringify(s.a.messages).includes('"o1"'), false);
    // revelar: aí sim
    setVoting(s.a, { ...poll(false, false), revealed: true, revealedAt: 2 });
    await until(() => !!readFac(s.e.doc.getMap('fac')).tally?.poll?.responses[s.editor.id], 'revelada');
  } finally {
    s.a.destroy();
    s.e.destroy();
    await s.server.close();
  }
});

test('enquete anônima com resultado parcial: a contagem sai sem identidade (chaves opacas)', async () => {
  const s = await scenario();
  try {
    setVoting(s.a, poll(true, true));
    await until(() => readFac(s.e.doc.getMap('fac')).voting?.anonymous === true, 'enquete chega');
    s.e.send({ t: 'me.poll', session: 1794196559252, options: ['o2'] });
    await until(() => Object.keys(readFac(s.a.doc.getMap('fac')).tally?.poll?.responses ?? {}).length === 1, 'contagem chegou');
    const responses = readFac(s.a.doc.getMap('fac')).tally!.poll!.responses;
    const [key] = Object.keys(responses);
    assert.notEqual(key, s.editor.id);
    assert.equal(JSON.stringify(readFac(s.a.doc.getMap('fac')).tally).includes(s.editor.id), false);
    assert.deepEqual(responses[key], ['o2']);
    // a própria pessoa reconhece a sua chave (para não contar duas vezes)
    await until(() => s.e.last('me.state')?.pollKey === key, 'chave própria');
  } finally {
    s.a.destroy();
    s.e.destroy();
    await s.server.close();
  }
});

test('política do admin "cores diferentes": desligada, cada pessoa fica com a sua cor; religada, as cores voltam a se separar', async () => {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: emptyBoard() });
  const editor = await invitePerson(server.app, owner, { email: 'edi@example.com', name: 'Edi Tor' });
  const { users } = await import('../src/db/schema');
  const { eq } = await import('drizzle-orm');
  await server.ctx.db.update(users).set({ avatarColor: '#E5484D' }).where(eq(users.id, owner.id));
  await server.ctx.db.update(users).set({ avatarColor: '#E5484D' }).where(eq(users.id, editor.id));
  const off = await api(server.app, owner).op({ type: 'updatePolicies', patch: { distinctPresenceColors: false } });
  assert.equal(off.statusCode, 200);
  const url = await listen(server);
  const a = connectClient(url, board.id, { t: owner.token });
  await until(() => a.synced, 'sync a');
  const e = connectClient(url, board.id, { t: editor.token });
  try {
    await until(() => (a.last('presence')?.users.length ?? 0) === 2, 'presença com 2');
    assert.deepEqual(a.last('presence')!.users.map((u) => u.color), ['#E5484D', '#E5484D']);
    // religar com o board aberto: as cores se separam sem ninguém reconectar
    await api(server.app, owner).op({ type: 'updatePolicies', patch: { distinctPresenceColors: true } });
    await until(() => {
      const c = a.last('presence')?.users.map((u) => u.color) ?? [];
      return c.length === 2 && colorDistance(c[0], c[1]) >= MIN_COLOR_DISTANCE;
    }, 'cores separadas');
  } finally {
    a.destroy();
    e.destroy();
    await server.close();
  }
});

test('condução ("Trazer todos até mim"): quem conduz saiu do board → a condução acaba sozinha', async () => {
  const s = await scenario();
  try {
    const before = readSlice(s.a.doc);
    applyLocalChange(s.a.doc, before, { ...before, fac: { ...before.fac, leaderUserId: s.owner.id } });
    await until(() => readFac(s.e.doc.getMap('fac')).leaderUserId === s.owner.id, 'condução chegou');
    s.a.destroy();
    await until(() => (readFac(s.e.doc.getMap('fac')).leaderUserId ?? null) === null, 'condução encerrada pelo servidor');
  } finally {
    s.e.destroy();
    await s.server.close();
  }
});
