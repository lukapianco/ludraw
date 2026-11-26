/**
 * Links públicos reais (Chat 07): senha argon2id com limite por link e por IP, validade, revogação,
 * novo token, política, nível de acesso e `allowDownload`; o token e o hash não vazam para quem não pode.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicLinks } from '../src/db/schema';
import { lockMinutes } from '../src/public/routes';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, sticky, type Person } from './helpers';

/**
 * Chat 08.7 · R5 (S-17): o banco não guarda mais o token em texto. Aqui o servidor roda com a chave no ambiente (cópia
 * cifrada) e o token vem de onde o titular o vê — o estado da organização. O modo "só hash" (chave no banco) tem
 * testes próprios em `public-link-storage.test.ts`.
 */
const LINK_KEY_ENV = { LUDRAW_JWT_SECRET: 'public-test-jwt-K7qL2vX9pR4mW8zT1nB6cY3hJ5sD0fG' };

async function scenario() {
  const { server, admin } = await startConfigured(LINK_KEY_ENV);
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: emptyBoard({ s1: sticky('s1', 'público') }) });
  return { server, app: server.app, owner, board };
}

const linkToken = async (s: Awaited<ReturnType<typeof scenario>>): Promise<string> =>
  ((await api(s.app, s.owner).state()) as { boards: Array<{ id: string; publicLink?: { token: string } }> }).boards.find((b) => b.id === s.board.id)!.publicLink!.token;
const session = (s: Awaited<ReturnType<typeof scenario>>, token: string, password?: string, ip = '127.0.0.1') =>
  s.app.inject({ method: 'POST', url: `/api/v1/public/links/${token}/session`, payload: password === undefined ? {} : { password }, remoteAddress: ip });
const visitor = (s: Awaited<ReturnType<typeof scenario>>, vt: string) => api(s.app, vt);

test('senha: pede, recusa a errada, bloqueia com espera crescente e o hash nunca sai', async () => {
  const s = await scenario();
  try {
    const set = await api(s.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, accessLevel: 'viewer' } }, 'Senha-Do-Link-9');
    assert.equal(set.statusCode, 200, set.body);
    const meta = json(set).state.boards.find((b: { id: string }) => b.id === s.board.id);
    assert.equal(meta.publicLink.passwordHash, 'set', 'o hash vira um marcador');
    const token = await linkToken(s);
    assert.equal(meta.publicLink.token, token, 'o titular vê o token');
    const [row] = await s.server.ctx.db.select().from(publicLinks);
    assert.match(row.passwordHash!, /^\$argon2id\$/);

    assert.equal(json(await s.app.inject({ url: `/api/v1/public/links/${token}` })).status, 'password');
    assert.equal(json(await session(s, token)).error.code, 'linkPasswordRequired');
    for (let i = 0; i < 4; i++) assert.equal(json(await session(s, token, 'errada', `10.0.0.${i}`)).error.code, 'linkWrongPassword');
    const fifth = await session(s, token, 'errada', '10.0.0.9');
    assert.equal(fifth.statusCode, 429, 'a 5ª errada bloqueia o link (vale para qualquer IP)');
    const locked = await session(s, token, 'Senha-Do-Link-9', '10.0.0.10');
    assert.equal(locked.statusCode, 429, 'nem a senha certa passa durante a espera');
    assert.ok(Number(locked.headers['retry-after']) > 0);
    assert.deepEqual([4, 5, 6, 7, 11, 20].map(lockMinutes), [0, 1, 2, 4, 60, 60]);
    // espera vencida → a certa entra e zera o contador
    await s.server.ctx.db.update(publicLinks).set({ lockedUntil: new Date(Date.now() - 1000) });
    const ok = await session(s, token, 'Senha-Do-Link-9', '10.0.0.11');
    assert.equal(ok.statusCode, 200, ok.body);
    const [after] = await s.server.ctx.db.select().from(publicLinks);
    assert.equal(after.failedAttempts, 0);
    assert.ok(after.lastUsedAt);
  } finally {
    await s.server.close();
  }
});

test('limite por IP: muitas senhas erradas do mesmo IP bloqueiam esse IP (mesmo com o contador do link zerado)', async () => {
  const s = await scenario();
  try {
    await api(s.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true } }, 'Senha-Do-Link-9');
    const token = await linkToken(s);
    for (let i = 0; i < 30; i++) {
      await s.server.ctx.db.update(publicLinks).set({ failedAttempts: 0, lockedUntil: null });
      await session(s, token, 'errada', '192.0.2.1');
    }
    assert.equal((await session(s, token, 'Senha-Do-Link-9', '192.0.2.1')).statusCode, 429);
    assert.equal((await session(s, token, 'Senha-Do-Link-9', '192.0.2.2')).statusCode, 200, 'outro IP segue');
  } finally {
    await s.server.close();
  }
});

test('nível leitor lê mas não grava; editor grava com autoria de visitante; download segue o link e a política', async () => {
  const s = await scenario();
  try {
    await api(s.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, accessLevel: 'viewer', allowDownload: true } });
    const token = await linkToken(s);
    const sess = json(await session(s, token));
    assert.equal(sess.accessLevel, 'viewer');
    assert.equal(sess.allowDownload, true);
    assert.equal(sess.policies.allowViewerExport, false, 'a política (teto) vai junto para o cliente decidir o download');
    const read = await visitor(s, sess.visitorToken).get(`/public/boards/${s.board.id}/data`);
    assert.equal(read.statusCode, 200);
    const { data, revision } = json(read);
    data.elements.s1.text = 'vandalismo';
    assert.equal((await visitor(s, sess.visitorToken).put(`/public/boards/${s.board.id}/data`, data, revision)).statusCode, 403);
    // o token de visitante não abre a API de membros
    assert.equal((await api(s.app, sess.visitorToken).get('/workspace/state')).statusCode, 401);

    await api(s.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { accessLevel: 'editor' } });
    const ed = json(await session(s, token));
    const cur = json(await visitor(s, ed.visitorToken).get(`/public/boards/${s.board.id}/data`));
    cur.data.elements.v1 = sticky('v1', 'do visitante', { createdBy: s.owner.id });
    cur.data.elementOrder.push('v1');
    const put = await visitor(s, ed.visitorToken).put(`/public/boards/${s.board.id}/data`, cur.data, cur.revision);
    assert.equal(put.statusCode, 200, put.body);
    const stored = json(await api(s.app, s.owner).get(`/boards/${s.board.id}/data`)).data;
    assert.match(stored.elements.v1.createdBy, /^visitante:/);
  } finally {
    await s.server.close();
  }
});

test('vencido, revogado, novo token e política desligada derrubam o link e as sessões abertas', async () => {
  const s = await scenario();
  try {
    const a = api(s.app, s.owner);
    await a.op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true, lifetime: '1h' } });
    const token = await linkToken(s);
    const sess = json(await session(s, token));
    const read = () => visitor(s, sess.visitorToken).get(`/public/boards/${s.board.id}/data`);
    assert.equal((await read()).statusCode, 200);

    await s.server.ctx.db.update(publicLinks).set({ expiresAt: new Date(Date.now() - 1000) });
    assert.equal(json(await s.app.inject({ url: `/api/v1/public/links/${token}` })).status, 'expired');
    assert.equal((await read()).statusCode, 401, 'sessão aberta cai quando o link vence');
    assert.equal((await session(s, token)).statusCode, 403);

    await a.op({ type: 'setPublicLink', boardId: s.board.id, patch: { lifetime: '7d' } });
    const s2 = json(await session(s, token));
    await a.op({ type: 'revokePublicLink', boardId: s.board.id });
    assert.equal(json(await s.app.inject({ url: `/api/v1/public/links/${token}` })).status, 'revoked');
    assert.equal((await visitor(s, s2.visitorToken).get(`/public/boards/${s.board.id}/data`)).statusCode, 401);

    await a.op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true } });
    const s3 = json(await session(s, token));
    await a.op({ type: 'regeneratePublicLink', boardId: s.board.id });
    assert.equal(json(await s.app.inject({ url: `/api/v1/public/links/${token}` })).status, 'invalid', 'o token antigo deixa de existir');
    assert.equal((await visitor(s, s3.visitorToken).get(`/public/boards/${s.board.id}/data`)).statusCode, 401);

    const fresh = await linkToken(s);
    assert.equal(json(await s.app.inject({ url: `/api/v1/public/links/${fresh}` })).status, 'ok');
    await a.op({ type: 'updatePolicies', patch: { allowPublicLinks: false } });
    assert.equal(json(await s.app.inject({ url: `/api/v1/public/links/${fresh}` })).status, 'policy');
    assert.equal(json(await s.app.inject({ url: '/api/v1/public/links/naoexiste123' })).status, 'invalid');
  } finally {
    await s.server.close();
  }
});

test('token do link só para quem pode compartilhar', async () => {
  const s = await scenario();
  try {
    await api(s.app, s.owner).op({ type: 'setPublicLink', boardId: s.board.id, patch: { enabled: true } });
    const viewer = await invitePerson(s.app, s.owner, { email: 'leitor@example.com', name: 'Leitor' });
    await api(s.app, s.owner).op({ type: 'setBoardMember', boardId: s.board.id, userId: viewer.id, role: 'viewer' });
    const meta = (await api(s.app, viewer).state()).boards.find((b: { id: string }) => b.id === s.board.id);
    assert.equal(meta.publicLink.token, '');
    assert.equal(meta.publicLink.enabled, true);
  } finally {
    await s.server.close();
  }
});
