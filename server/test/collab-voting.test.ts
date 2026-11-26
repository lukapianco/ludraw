/**
 * Votação no tempo real (Chat 08): cédulas pelo canal privado; o servidor decide o que aparece em `fac.tally`
 * (aberta = todos veem; anônima = nada de cédula alheia até revelar).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLocalChange, readFac, readSlice } from '../../src/collab/codec';
import type { VotingState } from '../../src/types/canvas';
import { connectClient, listen, until, sleep } from './collab-helpers';
import { createBoard, emptyBoard, invitePerson, startConfigured, sticky, type Person } from './helpers';

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

const voting = (anonymous: boolean): VotingState => ({ active: true, title: 'v', dotsPerUser: 5, anonymous, hideCursors: anonymous, revealed: false, votesByElement: {}, allowMultiplePerItem: true, startedBy: 'x', startedAt: 1794196559252 });

function startVoting(client: { doc: import('yjs').Doc }, v: VotingState) {
  const before = readSlice(client.doc);
  applyLocalChange(client.doc, before, { ...before, fac: { ...before.fac, voting: v } });
}

test('votação aberta: o total e as cédulas de todos chegam a todos pelo documento', async () => {
  const s = await scenario();
  try {
    startVoting(s.a, voting(false));
    await until(() => readFac(s.e.doc.getMap('fac')).voting?.startedAt === 1794196559252, 'votação chega ao outro');
    s.e.send({ t: 'me.ballot', session: 1794196559252, ballot: { s1: 2 } });
    await until(() => readFac(s.a.doc.getMap('fac')).tally?.votesByElement?.s1 === 2, 'a Ana vê os 2 votos');
    assert.deepEqual(readFac(s.a.doc.getMap('fac')).tally?.ballots?.[s.editor.id], { s1: 2 });
    s.a.send({ t: 'me.ballot', session: 1794196559252, ballot: { s1: 1 } });
    await until(() => readFac(s.e.doc.getMap('fac')).tally?.votesByElement?.s1 === 3, 'o Edi vê 3');
  } finally {
    s.a.destroy();
    s.e.destroy();
    await s.server.close();
  }
});

test('votação anônima: nenhuma cédula no documento até revelar; depois todas aparecem', async () => {
  const s = await scenario();
  try {
    startVoting(s.a, voting(true));
    await until(() => readFac(s.e.doc.getMap('fac')).voting?.anonymous === true, 'votação anônima chega');
    s.e.send({ t: 'me.ballot', session: 1794196559252, ballot: { s1: 2 } });
    s.a.send({ t: 'me.ballot', session: 1794196559252, ballot: { s1: 1 } });
    await until(() => s.server.ctx.collab!.rooms.get(s.board.id)?.secrets.ballots[s.editor.id]?.s1 === 2, 'servidor guardou a cédula');
    await sleep(300);
    for (const c of [s.a, s.e]) {
      const tally = readFac(c.doc.getMap('fac')).tally;
      assert.equal(tally?.ballots, undefined);
      assert.deepEqual(tally?.votesByElement, {});
    }
    // revelar (a Ana é a facilitadora)
    const before = readSlice(s.a.doc);
    applyLocalChange(s.a.doc, before, { ...before, fac: { ...before.fac, voting: { ...voting(true), revealed: true, revealedAt: 2000 } } });
    await until(() => readFac(s.e.doc.getMap('fac')).tally?.votesByElement?.s1 === 3, 'depois de revelar, o Edi vê 3');
    assert.equal(readFac(s.a.doc.getMap('fac')).tally?.votesByElement?.s1, 3);
  } finally {
    s.a.destroy();
    s.e.destroy();
    await s.server.close();
  }
});
