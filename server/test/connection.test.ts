/**
 * Detecção automática do servidor (Chat 07 · B): `/info` público e mínimo, política `localMode`
 * (variável de ambiente + política da organização), a decisão pura do cliente (`decideConnection`) e as
 * consultas de revisão usadas para avisar na hora sobre mudanças remotas e links revogados.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideConnection, type ConnectionInputs } from '../../src/utils/connectionRules';
import type { ServerInfo } from '../../src/utils/apiContract';
import { api, createBoard, emptyBoard, invitePerson, issueTestSetupToken, json, startConfigured, startServer, sticky, type Person, linkTokenOf } from './helpers';

const INFO_KEYS = ['accessRequests', 'apiVersion', 'designSystem', 'email', 'localMode', 'mode', 'name', 'organizationName', 'realtime', 'registration', 'setupRequired', 'sso', 'version'];

test('/info responde sem login, só com os campos públicos, e bloqueia o Modo Local por padrão', async () => {
  const server = await startServer();
  try {
    await issueTestSetupToken(server);
    const res = await server.app.inject({ url: '/api/v1/info' });
    assert.equal(res.statusCode, 200);
    const info = json(res);
    assert.deepEqual(Object.keys(info).sort(), INFO_KEYS, 'só os campos públicos');
    assert.equal(info.name, 'ludraw');
    assert.equal(typeof info.apiVersion, 'number');
    assert.equal(info.localMode, 'blocked');
    assert.equal(info.setupRequired, true);
    // Chat 08.5 · C: o valor mudou de tipo ('invite_only' | 'domain'), as chaves não
    assert.ok(['invite_only', 'domain'].includes(info.registration));
    assert.equal(info.registration, 'invite_only', 'servidor sem organização nunca oferece cadastro');
    assert.doesNotMatch(res.body, /TESTTOKEN|argon2|secret|@/i, 'nada de token, hash, segredo ou e-mail');
  } finally {
    await server.close();
  }
});

test('LUDRAW_ALLOW_LOCAL_MODE libera; a política da organização prevalece sobre a variável', async () => {
  const { server, admin } = await startConfigured({ LUDRAW_ALLOW_LOCAL_MODE: 'true' });
  try {
    const info = async () => json(await server.app.inject({ url: '/api/v1/info' }));
    assert.equal((await info()).localMode, 'allowed');
    const a = api(server.app, { token: admin.accessToken, id: admin.user.id });
    const off = await a.op({ type: 'updatePolicies', patch: { allowLocalMode: false } });
    assert.equal(off.statusCode, 200, off.body);
    assert.equal((await info()).localMode, 'blocked');
    await a.op({ type: 'updatePolicies', patch: { allowLocalMode: true } });
    assert.equal((await info()).localMode, 'allowed');
    const bad = await a.op({ type: 'updatePolicies', patch: { allowLocalMode: 'sim' } });
    assert.notEqual(bad.statusCode, 200, 'valor não booleano é recusado');
  } finally {
    await server.close();
  }
});

test('só admin muda a política do Modo Local', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const member = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    const res = await api(server.app, member).op({ type: 'updatePolicies', patch: { allowLocalMode: true } });
    assert.equal(res.statusCode, 403);
    assert.equal(json(await server.app.inject({ url: '/api/v1/info' })).localMode, 'blocked');
  } finally {
    await server.close();
  }
});

test('revisão do board: quem vê consulta; sem login não; o visitante perde na hora quando o link é revogado', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const a = api(server.app, owner);
    const board = await createBoard(server.app, owner, { data: emptyBoard({ s1: sticky('s1', 'um') }) });
    const rev0 = json(await a.get(`/boards/${board.id}/revision`)).revision as number;
    assert.equal(typeof rev0, 'number');
    const saved = await a.put(`/boards/${board.id}/data`, emptyBoard({ s1: sticky('s1', 'dois') }), rev0);
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(json(await a.get(`/boards/${board.id}/revision`)).revision, rev0 + 1, 'outra janela vê a revisão nova');
    assert.equal((await server.app.inject({ url: `/api/v1/boards/${board.id}/revision` })).statusCode, 401);

    const linkOp = await a.op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true, accessLevel: 'viewer' } });
    const link = linkTokenOf(linkOp, board.id); // Chat 08.7 · R5 (S-17): o token vem da resposta, o banco só tem o hash
    const sess = json(await server.app.inject({ method: 'POST', url: `/api/v1/public/links/${link.token}/session`, payload: {} }));
    const visitorRev = () => api(server.app, sess.visitorToken).get(`/public/boards/${board.id}/revision`);
    const before = await visitorRev();
    assert.equal(before.statusCode, 200, before.body);
    assert.equal(json(before).revision, rev0 + 1);
    await a.op({ type: 'revokePublicLink', boardId: board.id });
    assert.equal((await visitorRev()).statusCode, 401, 'revogado → a próxima consulta já recusa');
  } finally {
    await server.close();
  }
});

/* ------------------------------ decisão pura do cliente ------------------------------ */

const info = (localMode: 'allowed' | 'blocked'): ServerInfo => ({ name: 'ludraw', apiVersion: 1, version: '0.0.0', setupRequired: false, mode: 'single_org', organizationName: 'Empresa', sso: { enabled: false, label: null }, registration: 'invite_only', localMode });
const base: ConnectionInputs = { forceLocal: false, devBuild: false, explicitUrl: null, explicitInfo: null, sameOrigin: 'https://draw.example.com', sameOriginInfo: null, saved: null };

test('decideConnection: servidor na mesma origem trava o Modo Servidor e ignora a escolha salva', () => {
  const c = decideConnection({ ...base, sameOriginInfo: info('blocked'), saved: { mode: 'server', url: 'https://outro.example.com' } });
  assert.equal(c.mode, 'server');
  assert.equal(c.url, 'https://draw.example.com');
  assert.equal(c.locked, true);
  assert.equal(c.localMode, 'blocked');
  assert.equal(c.source, 'same-origin');
});

test('decideConnection: sem servidor (desligado ou ausente) cai no Modo Local ou na conexão manual salva', () => {
  assert.equal(decideConnection(base).mode, 'local');
  assert.equal(decideConnection(base).localMode, 'allowed');
  const manual = decideConnection({ ...base, saved: { mode: 'server', url: 'https://casa.example.com' } });
  assert.deepEqual([manual.mode, manual.url, manual.locked, manual.source], ['server', 'https://casa.example.com', false, 'saved']);
  assert.equal(decideConnection({ ...base, forceLocal: true, saved: { mode: 'server', url: 'https://casa.example.com' } }).mode, 'local', '?local=1 vence a escolha salva');
});

test('decideConnection: Modo Local com servidor só quando o servidor permite (ou em desenvolvimento com ?local=1)', () => {
  const blocked = { ...base, sameOriginInfo: info('blocked') };
  assert.equal(decideConnection({ ...blocked, saved: { mode: 'local', override: true } }).mode, 'server', 'bloqueado: escolha local ignorada');
  assert.equal(decideConnection({ ...blocked, forceLocal: true }).mode, 'server', 'bloqueado em produção: ?local=1 não passa');
  const dev = decideConnection({ ...blocked, forceLocal: true, devBuild: true });
  assert.equal(dev.mode, 'local');
  assert.equal(dev.available?.url, 'https://draw.example.com');

  const allowed = { ...base, sameOriginInfo: info('allowed') };
  const choice = decideConnection({ ...allowed, saved: { mode: 'local', override: true } });
  assert.deepEqual([choice.mode, choice.source, choice.localMode], ['local', 'local-choice', 'allowed']);
  assert.equal(decideConnection(allowed).mode, 'server', 'sem escolha, o padrão é o servidor');
});

test('decideConnection: servidor configurado (config.json / VITE_DEFAULT_SERVER_URL) trava mesmo fora do ar', () => {
  const c = decideConnection({ ...base, explicitUrl: 'https://api.example.com', explicitInfo: null, sameOriginInfo: info('allowed') });
  assert.deepEqual([c.mode, c.url, c.locked, c.source, c.localMode], ['server', 'https://api.example.com', true, 'config', 'blocked']);
});
