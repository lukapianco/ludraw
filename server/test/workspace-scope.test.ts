/**
 * LuDraw server — Chat 08.7 · R1 (S-01, S-26): TODA operação do `POST /workspace/ops` × perfis.
 *
 * Para cada uma das 32 variantes de `WorkspaceOp` (a lista é um `Record<WorkspaceOpType, …>`: operação nova sem
 * caso faz o typecheck falhar), cada perfil tenta a operação num alvo novo. O teste exige 2xx SE E SOMENTE SE o
 * perfil está no conjunto esperado, e que uma recusa não mude nada no estado da organização. Operações de board
 * rodam com dois alvos (board do time X e Espaço Pessoal do membro X); convites rodam com `teamIds`,
 * `projectId` e `boardId`. Também conferimos que o servidor nunca usa o "Visualizar como…" e que o estado
 * devolvido ao membro do time Y não mostra boards que ele não alcança.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkspaceOpType } from '../../src/utils/workspaceRules';
import { VIEW_AS_PROFILES } from '../../src/utils/permissions';
import { authenticateToken } from '../src/auth/authenticate';
import { loadRulesState } from '../src/workspace/state';
import { viewerOf } from '../src/workspace/service';
import { api, clientHeaders, createBoard, emptyBoard, invitePerson, json, startConfigured, sticky, type Person } from './helpers';

type Profile = 'admin' | 'mX' | 'mY' | 'guest' | 'susp' | 'rem';
const PROFILES: Profile[] = ['admin', 'mX', 'mY', 'guest', 'susp', 'rem'];

/** Cenário: times X e Y, projeto P (time X), convidado leitor de um board do time X, conta suspensa e removida. */
async function scenario() {
  const { server, admin } = await startConfigured();
  const app = server.app;
  // Muitas chamadas seguidas do mesmo IP batem no teto geral (600/min): cada chamada deste teste usa um IP próprio.
  // A autorização não depende do IP; os limitadores têm testes próprios.
  const inject = app.inject.bind(app);
  let n = 0;
  (app as unknown as { inject: unknown }).inject = (o: Record<string, unknown>) => inject({ remoteAddress: `10.87.${(n >> 8) & 255}.${n++ & 255}`, ...o } as never);

  const A: Person = { token: admin.accessToken, id: admin.user.id };
  const ops = api(app, A);
  const X = json(await ops.op({ type: 'createTeam', input: { name: 'Time X' } })).id as string;
  const Y = json(await ops.op({ type: 'createTeam', input: { name: 'Time Y' } })).id as string;
  const P = json(await ops.op({ type: 'createProject', input: { teamId: X, name: 'Projeto P' } })).id as string;
  const mX = await invitePerson(app, A, { email: 'mx@example.com', name: 'Membro X', teamIds: [X] });
  const mY = await invitePerson(app, A, { email: 'my@example.com', name: 'Membro Y', teamIds: [Y] });
  const susp = await invitePerson(app, A, { email: 'susp@example.com', name: 'Suspensa', teamIds: [X] });
  const rem = await invitePerson(app, A, { email: 'rem@example.com', name: 'Removida', teamIds: [X] });
  const BX = (await createBoard(app, mX, { name: 'Board X', place: { kind: 'team', teamId: X } })).id;
  const guest = await invitePerson(app, A, { email: 'convidado@partner.example', name: 'Convidado', role: 'guest_b2b', boardId: BX, boardRole: 'viewer' });
  assert.equal((await ops.op({ type: 'suspendAccount', id: susp.id })).statusCode, 200);
  assert.equal((await ops.op({ type: 'removeAccount', id: rem.id })).statusCode, 200);
  assert.equal((await ops.op({ type: 'updatePolicies', patch: { allowAccessRequests: true } })).statusCode, 200);
  const who: Record<Profile, Person> = { admin: A, mX, mY, guest, susp, rem };
  const orgId = admin.user.organizationId;
  return { server, app, A, mX, mY, guest, who, X, Y, P, BX, orgId };
}
type S = Awaited<ReturnType<typeof scenario>>;

/* ------------------------------ fábricas de alvos novos ------------------------------ */

const uniq = () => Math.random().toString(36).slice(2, 10);
const boardX = async (s: S) => (await createBoard(s.app, s.mX, { name: `Alvo X ${uniq()}`, place: { kind: 'team', teamId: s.X } })).id;
const personalX = async (s: S) => (await createBoard(s.app, s.mX, { name: `Pessoal X ${uniq()}`, place: { kind: 'personal' } })).id;
const trashed = async (s: S, make: (s: S) => Promise<string>) => {
  const id = await make(s);
  assert.equal((await api(s.app, s.mX).del(`/boards/${id}`)).statusCode, 200);
  return id;
};
const withLink = async (s: S, id: string) => {
  assert.equal((await api(s.app, s.mX).op({ type: 'setPublicLink', boardId: id, patch: { enabled: true } })).statusCode, 200);
  return id;
};
const withMember = async (s: S, id: string, userId: string) => {
  assert.equal((await api(s.app, s.mX).op({ type: 'setBoardMember', boardId: id, userId, role: 'viewer' })).statusCode, 200);
  return id;
};
const freshMember = async (s: S) => invitePerson(s.app, s.A, { email: `alvo-${uniq()}@example.com`, name: 'Alvo', teamIds: [s.X] });
const accessRequest = async (s: S) => {
  const email = `pedido-${uniq()}@example.com`;
  const r = await s.app.inject({ method: 'POST', url: '/api/v1/access-requests', headers: clientHeaders, payload: { name: 'Pedido', email, lang: 'pt-BR' } });
  assert.equal(r.statusCode, 202);
  await s.server.ctx.later?.flush();
  const st = await loadRulesState(s.server.ctx.db, s.orgId, s.server.ctx.keys.inviteSealer);
  const req = (st.accessRequests ?? []).find((x) => x.email === email && x.status === 'pending');
  assert.ok(req, 'pedido pendente criado');
  return req!.id;
};
const inviteLink = async (s: S) => json(await api(s.app, s.A).op({ type: 'createInviteLink', input: { role: 'member', expiresInDays: 7, maxUses: 5 } })).id as string;

/* ------------------------------ casos: op × alvo × quem pode ------------------------------ */

interface Case {
  label: string;
  /** quem PODE (todo o resto tem de ser recusado sem mudar nada) */
  allowed: Profile[];
  op: (s: S) => Promise<Record<string, unknown>>;
  /** conferência extra depois de um aceite (ex.: escopo filtrado) */
  after?: (s: S, who: Profile, body: Record<string, unknown>) => Promise<void> | void;
}

const ADMIN: Profile[] = ['admin'];
const CASES: Record<WorkspaceOpType, Case[]> = {
  updateWorkspace: [{ label: 'nome da organização', allowed: ADMIN, op: async () => ({ type: 'updateWorkspace', patch: { name: `Org ${uniq()}` } }) }],
  updatePolicies: [{ label: 'política', allowed: ADMIN, op: async () => ({ type: 'updatePolicies', patch: { allowViewerExport: Math.random() < 2 } }) }],
  createTeam: [{ label: 'time novo', allowed: ADMIN, op: async () => ({ type: 'createTeam', input: { name: `T ${uniq()}` } }) }],
  updateTeam: [{ label: 'time X', allowed: ADMIN, op: async (s) => ({ type: 'updateTeam', id: s.X, patch: { description: uniq() } }) }],
  setTeamArchived: [{ label: 'time Y', allowed: ADMIN, op: async (s) => ({ type: 'setTeamArchived', id: s.Y, archived: false }) }],
  setTeamMembers: [{ label: 'time Y', allowed: ADMIN, op: async (s) => ({ type: 'setTeamMembers', id: s.Y, memberIds: [s.mY.id] }) }],
  createProject: [{ label: 'no time X', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'createProject', input: { teamId: s.X, name: `P ${uniq()}` } }) }],
  updateProject: [{ label: 'projeto P (time X)', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'updateProject', id: s.P, patch: { description: uniq() } }) }],
  setProjectArchived: [{ label: 'projeto P', allowed: ADMIN, op: async (s) => ({ type: 'setProjectArchived', id: s.P, archived: false }) }],
  moveProject: [{ label: 'projeto P → time X', allowed: ADMIN, op: async (s) => ({ type: 'moveProject', id: s.P, teamId: s.X }) }],
  moveBoard: [
    { label: 'board do time X', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'moveBoard', boardId: await boardX(s), place: { kind: 'team', teamId: s.X } }) },
    { label: 'Espaço Pessoal do membro X', allowed: ['mX'], op: async (s) => ({ type: 'moveBoard', boardId: await personalX(s), place: { kind: 'personal' } }) },
  ],
  restoreBoard: [
    { label: 'board do time X na lixeira', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'restoreBoard', id: await trashed(s, boardX) }) },
    { label: 'Espaço Pessoal de X na lixeira (lixeira do workspace)', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'restoreBoard', id: await trashed(s, personalX) }) },
  ],
  purgeBoard: [
    { label: 'board do time X na lixeira', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'purgeBoard', id: await trashed(s, boardX) }) },
    { label: 'Espaço Pessoal de X na lixeira (lixeira do workspace)', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'purgeBoard', id: await trashed(s, personalX) }) },
  ],
  emptyTrash: [{ label: 'esvaziar', allowed: ADMIN, op: async () => ({ type: 'emptyTrash' }) }],
  setAccountRole: [{ label: 'membro novo', allowed: ADMIN, op: async (s) => ({ type: 'setAccountRole', id: (await freshMember(s)).id, role: 'admin' }) }],
  suspendAccount: [{ label: 'membro novo', allowed: ADMIN, op: async (s) => ({ type: 'suspendAccount', id: (await freshMember(s)).id }) }],
  reactivateAccount: [
    {
      label: 'membro suspenso',
      allowed: ADMIN,
      op: async (s) => {
        const p = await freshMember(s);
        assert.equal((await api(s.app, s.A).op({ type: 'suspendAccount', id: p.id })).statusCode, 200);
        return { type: 'reactivateAccount', id: p.id };
      },
    },
  ],
  removeAccount: [{ label: 'membro novo', allowed: ADMIN, op: async (s) => ({ type: 'removeAccount', id: (await freshMember(s)).id }) }],
  createInvitation: [
    { label: 'membro sem escopo', allowed: ['admin', 'mX', 'mY'], op: async () => ({ type: 'createInvitation', input: { email: `m-${uniq()}@example.com`, role: 'member', expiresInDays: 7, sendEmail: false } }) },
    {
      label: 'membro com teamIds [time X] (quem não é do time tem o time descartado)',
      allowed: ['admin', 'mX', 'mY'],
      op: async (s) => ({ type: 'createInvitation', input: { email: `t-${uniq()}@example.com`, role: 'member', teamIds: [s.X], expiresInDays: 7, sendEmail: false } }),
      after: async (s, who, body) => {
        const st = await loadRulesState(s.server.ctx.db, s.orgId, s.server.ctx.keys.inviteSealer);
        const inv = st.invitations.find((i) => i.id === body.id);
        assert.ok(inv, 'convite criado');
        if (who === 'mY') assert.ok(!(inv!.teamIds ?? []).includes(s.X), 'membro do time Y não põe ninguém no time X');
      },
    },
    { label: 'convidado no projeto P (time X)', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'createInvitation', input: { email: `g-${uniq()}@partner.example`, role: 'guest_b2b', projectId: s.P, expiresInDays: 7, sendEmail: false } }) },
    { label: 'convidado num board do time X', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'createInvitation', input: { email: `g-${uniq()}@partner.example`, role: 'guest_b2b', boardId: await boardX(s), boardRole: 'editor', expiresInDays: 7, sendEmail: false } }) },
    { label: 'convidado no Espaço Pessoal de X', allowed: ['mX'], op: async (s) => ({ type: 'createInvitation', input: { email: `g-${uniq()}@partner.example`, role: 'guest_b2b', boardId: await personalX(s), boardRole: 'editor', expiresInDays: 7, sendEmail: false } }) },
    { label: 'administrador', allowed: ADMIN, op: async () => ({ type: 'createInvitation', input: { email: `a-${uniq()}@example.com`, role: 'admin', expiresInDays: 7, sendEmail: false } }) },
  ],
  revokeInvitation: [
    {
      label: 'convite feito pelo membro X',
      allowed: ['admin', 'mX'],
      op: async (s) => ({ type: 'revokeInvitation', id: json(await api(s.app, s.mX).op({ type: 'createInvitation', input: { email: `r-${uniq()}@example.com`, role: 'member', expiresInDays: 7, sendEmail: false } })).id }),
    },
  ],
  extendGuest: [{ label: 'convidado', allowed: ADMIN, op: async (s) => ({ type: 'extendGuest', userId: s.guest.id, days: 7 }) }],
  revokeGuest: [
    {
      label: 'convidado novo',
      allowed: ADMIN,
      op: async (s) => ({ type: 'revokeGuest', userId: (await invitePerson(s.app, s.A, { email: `rg-${uniq()}@partner.example`, role: 'guest_b2b', boardId: s.BX, boardRole: 'viewer' })).id }),
    },
  ],
  setBoardMember: [
    { label: 'board do time X (dar acesso ao membro Y)', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'setBoardMember', boardId: await boardX(s), userId: s.mY.id, role: 'editor' }) },
    { label: 'Espaço Pessoal de X (dar acesso ao membro Y)', allowed: ['mX'], op: async (s) => ({ type: 'setBoardMember', boardId: await personalX(s), userId: s.mY.id, role: 'editor' }) },
  ],
  removeBoardMember: [
    { label: 'board do time X (tirar o convidado)', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'removeBoardMember', boardId: await withMember(s, await boardX(s), s.guest.id), userId: s.guest.id }) },
    { label: 'Espaço Pessoal de X (tirar o membro Y)', allowed: ['mX'], op: async (s) => ({ type: 'removeBoardMember', boardId: await withMember(s, await personalX(s), s.mY.id), userId: s.mY.id }) },
  ],
  setPublicLink: [
    { label: 'board do time X', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'setPublicLink', boardId: await boardX(s), patch: { enabled: true, accessLevel: 'editor' } }) },
    { label: 'Espaço Pessoal de X', allowed: ['mX'], op: async (s) => ({ type: 'setPublicLink', boardId: await personalX(s), patch: { enabled: true, accessLevel: 'editor' } }) },
  ],
  revokePublicLink: [
    { label: 'board do time X', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'revokePublicLink', boardId: await withLink(s, await boardX(s)) }) },
    { label: 'Espaço Pessoal de X', allowed: ['mX'], op: async (s) => ({ type: 'revokePublicLink', boardId: await withLink(s, await personalX(s)) }) },
  ],
  regeneratePublicLink: [
    { label: 'board do time X', allowed: ['admin', 'mX'], op: async (s) => ({ type: 'regeneratePublicLink', boardId: await withLink(s, await boardX(s)) }) },
    { label: 'Espaço Pessoal de X', allowed: ['mX'], op: async (s) => ({ type: 'regeneratePublicLink', boardId: await withLink(s, await personalX(s)) }) },
  ],
  transferBoardOwnership: [{ label: 'board do membro X → membro Y', allowed: ADMIN, op: async (s) => ({ type: 'transferBoardOwnership', fromId: s.mX.id, toId: s.mY.id, boardIds: [await boardX(s)] }) }],
  createInviteLink: [
    { label: 'membro', allowed: ADMIN, op: async () => ({ type: 'createInviteLink', input: { role: 'member', expiresInDays: 7, maxUses: 5 } }) },
    { label: 'convidado no projeto P', allowed: ADMIN, op: async (s) => ({ type: 'createInviteLink', input: { role: 'guest_b2b', projectId: s.P, expiresInDays: 7, maxUses: 5 } }) },
    { label: 'convidado no Espaço Pessoal de X (ninguém além do dono alcança; o dono não cria links)', allowed: [], op: async (s) => ({ type: 'createInviteLink', input: { role: 'guest_b2b', boardId: await personalX(s), boardRole: 'viewer', expiresInDays: 7, maxUses: 5 } }) },
  ],
  revokeInviteLink: [{ label: 'link da organização', allowed: ADMIN, op: async (s) => ({ type: 'revokeInviteLink', id: await inviteLink(s) }) }],
  approveAccessRequest: [
    { label: 'pedido → membro', allowed: ADMIN, op: async (s) => ({ type: 'approveAccessRequest', id: await accessRequest(s), grant: { role: 'member', expiresInDays: 7, sendEmail: false } }) },
    { label: 'pedido → convidado no projeto P', allowed: ADMIN, op: async (s) => ({ type: 'approveAccessRequest', id: await accessRequest(s), grant: { role: 'guest_b2b', projectId: s.P, expiresInDays: 7, sendEmail: false } }) },
  ],
  rejectAccessRequest: [{ label: 'pedido', allowed: ADMIN, op: async (s) => ({ type: 'rejectAccessRequest', id: await accessRequest(s) }) }],
};

/** Estado da organização sem carimbos que mudam a cada requisição (último acesso etc.). */
async function orgSnapshot(s: S): Promise<string> {
  const st = await loadRulesState(s.server.ctx.db, s.orgId, s.server.ctx.keys.inviteSealer);
  return JSON.stringify(st, (k, v) => (/^last(Seen|Active|Opened)/.test(k) ? undefined : v));
}

test('workspace/ops: as 32 operações × 6 perfis — só quem alcança o alvo (e tem a permissão) consegue', async () => {
  const s = await scenario();
  const problems: string[] = [];
  let attempts = 0;
  try {
    const types = Object.keys(CASES) as WorkspaceOpType[];
    assert.equal(types.length, 32, 'as 32 variantes de WorkspaceOp têm caso');
    for (const type of types) {
      for (const c of CASES[type]) {
        for (const p of PROFILES) {
          const op = await c.op(s);
          const before = await orgSnapshot(s);
          const res = await api(s.app, s.who[p]).op(op);
          attempts++;
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          const should = c.allowed.includes(p);
          if (ok !== should) problems.push(`${type} · ${c.label} · ${p}: esperado ${should ? 'aceitar' : 'recusar'}, veio ${res.statusCode} ${res.body.slice(0, 120)}`);
          if (!ok && (await orgSnapshot(s)) !== before) problems.push(`${type} · ${c.label} · ${p}: recusou (${res.statusCode}) mas o estado mudou`);
          if (ok && c.after) await c.after(s, p, json(res));
        }
      }
    }
    assert.ok(attempts >= 32 * PROFILES.length, `tentativas: ${attempts}`);
    assert.deepEqual(problems, [], `${problems.length} problema(s)`);
  } finally {
    await s.server.close();
  }
});

test('workspace/ops nunca usa o "Visualizar como…": o servidor decide com o contexto real de quem age', async () => {
  const s = await scenario();
  try {
    // 1) o Viewer que o servidor monta para cada conta ativa não tem perfil simulado e é a própria pessoa
    const st = await loadRulesState(s.server.ctx.db, s.orgId, s.server.ctx.keys.inviteSealer);
    for (const p of ['admin', 'mX', 'mY', 'guest'] as const) {
      const auth = await authenticateToken(s.server.ctx, s.who[p].token);
      const v = viewerOf(st, auth);
      assert.equal(v.profile ?? null, null, `${p}: sem perfil simulado`);
      assert.equal(v.userId, s.who[p].id, `${p}: o autor é a própria pessoa`);
    }
    const asAdmin = { label: 'Admin', workspaceRole: 'admin', isFacilitator: true };
    const asVisitor = VIEW_AS_PROFILES.find((x) => x.id === 'visitor-viewer')!.profile;
    const forge = (who: Person, op: unknown, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
      s.app.inject({ method: 'POST', url: '/api/v1/workspace/ops', headers: { authorization: `Bearer ${who.token}`, ...headers }, payload: { op, ...extra } as never });
    // 2) campo "visualizar como" no corpo ou dentro da operação → recusado pelo formato (nada é aplicado)
    const pers = await personalX(s);
    const grant = { type: 'setBoardMember', boardId: pers, userId: s.mY.id, role: 'editor' };
    const before = await orgSnapshot(s);
    assert.equal((await forge(s.mY, grant, { viewAs: asAdmin })).statusCode, 400, 'viewAs no corpo');
    assert.equal((await forge(s.mY, { ...grant, viewAs: asAdmin })).statusCode, 400, 'viewAs dentro da operação');
    assert.equal((await forge(s.mY, { ...grant, simulating: false, profile: asAdmin })).statusCode, 400, 'profile dentro da operação');
    // 3) cabeçalho forjado é ignorado: o membro Y continua sem alcance; o admin continua admin
    const forged = { 'x-ludraw-view-as': JSON.stringify(asAdmin), 'x-view-as': 'admin' };
    assert.equal((await forge(s.mY, grant, {}, forged)).statusCode, 403, 'membro Y com cabeçalho de admin');
    assert.equal(await orgSnapshot(s), before, 'nada mudou com as tentativas forjadas');
    const own = await boardX(s);
    const asVisitorHeader = { 'x-ludraw-view-as': JSON.stringify(asVisitor) };
    assert.equal((await forge(s.A, { type: 'setBoardMember', boardId: own, userId: s.mY.id, role: 'viewer' }, {}, asVisitorHeader)).statusCode, 200, 'admin com cabeçalho de visitante continua admin');
  } finally {
    await s.server.close();
  }
});

test('o membro do time Y não recebe id nem título de boards que não alcança (estado, erros, listas, atividade)', async () => {
  const s = await scenario();
  try {
    const secretNames = ['SEGREDO-PESSOAL-DO-MEMBRO-X', 'SEGREDO-DO-TIME-X', 'SEGREDO-DO-PROJETO-P'];
    const pers = (await createBoard(s.app, s.mX, { name: secretNames[0], place: { kind: 'personal' }, data: emptyBoard({ a: sticky('a', 'texto') }) })).id;
    const team = (await createBoard(s.app, s.mX, { name: secretNames[1], place: { kind: 'team', teamId: s.X } })).id;
    const proj = (await createBoard(s.app, s.mX, { name: secretNames[2], place: { kind: 'team', teamId: s.X, projectId: s.P } })).id;
    const secrets = [...secretNames, pers, team, proj];
    // atividade de outras pessoas nesses boards (link, ACL, versão) e um convite do membro X para um deles
    await api(s.app, s.mX).op({ type: 'setPublicLink', boardId: team, patch: { enabled: true } });
    await api(s.app, s.mX).op({ type: 'setBoardMember', boardId: proj, userId: s.guest.id, role: 'viewer' });
    await api(s.app, s.mX).post(`/boards/${pers}/snapshots`, { name: 'versão', kind: 'manual' });
    await api(s.app, s.mX).op({ type: 'createInvitation', input: { email: `x-${uniq()}@partner.example`, role: 'guest_b2b', boardId: team, boardRole: 'viewer', expiresInDays: 7, sendEmail: false } });

    const y = api(s.app, s.mY);
    const responses: Record<string, string> = {
      state: (await y.get('/workspace/state')).body,
      me: (await y.get('/auth/me')).body,
      ownOp: (await y.op({ type: 'createInvitation', input: { email: `y-${uniq()}@example.com`, role: 'member', expiresInDays: 7, sendEmail: false } })).body,
      audit: (await y.get('/audit?limit=200')).body,
      signupStatus: (await y.get('/admin/signup/status')).body,
    };
    for (const id of [pers, team, proj]) {
      responses[`data:${id}`] = (await y.get(`/boards/${id}/data`)).body;
      responses[`activity:${id}`] = (await y.get(`/boards/${id}/activity`)).body;
      responses[`snapshots:${id}`] = (await y.get(`/boards/${id}/snapshots`)).body;
      responses[`revision:${id}`] = (await y.get(`/boards/${id}/revision`)).body;
      responses[`opShare:${id}`] = (await y.op({ type: 'setPublicLink', boardId: id, patch: { enabled: true } })).body;
    }
    const leaks: string[] = [];
    for (const [where, body] of Object.entries(responses)) for (const secret of secrets) if (body.includes(secret)) leaks.push(`${where} contém ${secret}`);
    assert.deepEqual(leaks, [], 'vazamento para o membro do time Y');
    // controle: o próprio membro X enxerga os três no estado (o teste não está "cego")
    const xs = (await api(s.app, s.mX).get('/workspace/state')).body;
    for (const id of [pers, team, proj]) assert.ok(xs.includes(id), 'o dono vê o próprio board');
  } finally {
    await s.server.close();
  }
});
