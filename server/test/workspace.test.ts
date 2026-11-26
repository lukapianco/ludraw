/**
 * Regras do Workspace no servidor (Chat 07): as MESMAS de `src/utils/workspaceRules.ts` que o slice do modo
 * local usa — times, projetos, convites (aceite com domínio e e-mail), papéis com proteção do último
 * administrador, suspensão que derruba a sessão, remoção com transferência antes, convidado B2B isolado,
 * políticas aplicadas e Audit Log.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { organizations, sessions, users, workspaceAudit } from '../src/db/schema';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, STRONG_PASSWORD, type Person } from './helpers';

async function setup() {
  const { server, admin } = await startConfigured();
  const me: Person = { token: admin.accessToken, id: admin.user.id };
  return { server, app: server.app, admin: me };
}

const auditActions = async (server: Awaited<ReturnType<typeof setup>>['server']) => (await server.ctx.db.select().from(workspaceAudit)).map((a) => a.action);

test('estado inicial do admin e operação com forma inválida', async () => {
  const { server, app, admin } = await setup();
  try {
    const st = await api(app, admin).state();
    assert.equal(st.workspace.name, 'Empresa Exemplo');
    assert.equal(st.directory.length, 1);
    assert.equal(st.directory[0].workspaceRole, 'admin');
    assert.equal(st.me.role, 'admin');
    assert.ok(st.auditLog.some((e: { action: string }) => e.action === 'setup_completed'));
    for (const bad of [{ type: 'naoExiste' }, { type: 'createTeam', input: { name: 'x', extra: 1 } }, { type: 'createTeam', input: { name: 42 } }, { type: 'emptyTrash', id: 'x' }]) {
      const r = await api(app, admin).op(bad);
      assert.equal(r.statusCode, 400, JSON.stringify(bad));
      assert.equal(json(r).error.code, 'invalidOperation');
    }
  } finally {
    await server.close();
  }
});

test('times e projetos: criar, renomear (boards acompanham o texto legado), membros, arquivar, mover', async () => {
  const { server, app, admin } = await setup();
  try {
    const a = api(app, admin);
    const team = json(await a.op({ type: 'createTeam', input: { name: 'Engenharia' } }));
    const teamId = team.id as string;
    assert.equal(team.state.teams[0].memberIds[0], admin.id, 'quem cria entra no time');
    const project = json(await a.op({ type: 'createProject', input: { teamId, name: 'Q3' } }));
    const board = await createBoard(app, admin, { place: { kind: 'team', teamId, projectId: project.id } });
    const renamed = json(await a.op({ type: 'updateProject', id: project.id, patch: { name: 'Q4' } }));
    const meta = renamed.state.boards.find((b: { id: string }) => b.id === board.id);
    assert.equal(meta.space, 'Q4');
    assert.equal(json(await a.op({ type: 'updateTeam', id: teamId, patch: { name: '' } })).error.message.key, 'workspace.errors.nameRequired');
    const t2 = json(await a.op({ type: 'createTeam', input: { name: 'Produto' } })).id;
    const moved = json(await a.op({ type: 'moveProject', id: project.id, teamId: t2 }));
    assert.equal(moved.state.boards.find((b: { id: string }) => b.id === board.id).teamId, t2, 'boards vão junto com o projeto');
    const archived = json(await a.op({ type: 'setTeamArchived', id: teamId, archived: true }));
    assert.ok(archived.state.teams.find((t: { id: string }) => t.id === teamId).archivedAt);
    const notFound = await a.op({ type: 'updateTeam', id: 'inexistente', patch: { name: 'x' } });
    assert.equal(notFound.statusCode, 404);
    const actions = await auditActions(server);
    for (const x of ['team_created', 'project_created', 'project_updated', 'team_archived', 'board_created']) assert.ok(actions.includes(x), x);
  } finally {
    await server.close();
  }
});

test('convites: e-mail diferente, domínio, senha fraca, aceite, reuso; membro não convida admin', async () => {
  const { server, app, admin } = await setup();
  try {
    const a = api(app, admin);
    await a.op({ type: 'updateWorkspace', patch: { allowedEmailDomains: ['example.com'], requireDomainForMembers: true } });
    const outside = await a.op({ type: 'createInvitation', input: { email: 'x@outra.org', role: 'member', expiresInDays: 7 } });
    assert.equal(outside.statusCode, 422);
    assert.equal(json(outside).error.message.key, 'workspace.errors.emailNotAllowedDomain');
    const inv = json(await a.op({ type: 'createInvitation', input: { email: 'Bruno@Example.com', role: 'member', expiresInDays: 7 } }));
    assert.ok(inv.token.length >= 24);
    assert.equal(inv.state.invitations[0].token, inv.token, 'admin vê o token para copiar o link de novo');
    const preview = json(await app.inject({ url: `/api/v1/invitations/${inv.token}` }));
    assert.equal(preview.email, 'bruno@example.com');
    assert.equal(preview.status, 'pending');
    assert.equal(preview.accountExists, false);
    const accept = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/v1/invitations/${inv.token}/accept`, payload });
    assert.equal(json(await accept({ name: 'Bruno', email: 'outro@example.com', password: STRONG_PASSWORD })).error.message.key, 'workspace.errors.inviteEmailMismatch');
    assert.equal(json(await accept({ name: 'Bruno', email: 'bruno@example.com', password: 'fraca' })).error.message.key, 'server.password.tooShort');
    const ok = await accept({ name: 'Bruno', email: 'bruno@example.com', password: STRONG_PASSWORD });
    assert.equal(ok.statusCode, 200);
    assert.equal(json(ok).user.role, 'member');
    const again = await accept({ name: 'Bruno', email: 'bruno@example.com', password: STRONG_PASSWORD });
    assert.equal(json(again).error.message.key, 'workspace.errors.inviteAccepted');
    const bruno = { token: json(ok).accessToken, id: json(ok).user.id };
    const asAdmin = await api(app, bruno).op({ type: 'createInvitation', input: { email: 'c@example.com', role: 'admin', expiresInDays: 7 } });
    assert.equal(asAdmin.statusCode, 403);
    assert.ok(json(asAdmin).error.message.key.startsWith('permissions.'));
    const asMember = await api(app, bruno).op({ type: 'createInvitation', input: { email: 'c@example.com', role: 'member', expiresInDays: 7 } });
    assert.equal(asMember.statusCode, 200);
    const brunoState = await api(app, bruno).state();
    assert.equal(brunoState.invitations.length, 1, 'membro vê só os convites que criou');
    assert.equal(brunoState.auditLog.length, 0, 'membro não vê o Audit Log');
    assert.ok((await auditActions(server)).includes('member_joined'));
  } finally {
    await server.close();
  }
});

test('último administrador: não rebaixa, não suspende, não remove; com dois admins pode', async () => {
  const { server, app, admin } = await setup();
  try {
    const a = api(app, admin);
    const demote = await a.op({ type: 'setAccountRole', id: admin.id, role: 'member' });
    assert.equal(demote.statusCode, 403);
    assert.equal(json(demote).error.message.key, 'permissions.denied.lastAdmin');
    assert.equal((await a.op({ type: 'suspendAccount', id: admin.id })).statusCode, 403);
    assert.equal((await a.op({ type: 'removeAccount', id: admin.id })).statusCode, 403);
    const second = await invitePerson(app, admin, { email: 'dani@example.com', role: 'admin', name: 'Dani' });
    const ok = await api(app, second).op({ type: 'setAccountRole', id: admin.id, role: 'member' });
    assert.equal(ok.statusCode, 200);
  } finally {
    await server.close();
  }
});

test('suspender derruba as sessões na hora (com registro); reativar devolve o acesso', async () => {
  const { server, app, admin } = await setup();
  try {
    const bia = await invitePerson(app, admin, { email: 'bia@example.com', name: 'Bia' });
    assert.equal((await api(app, bia).get('/workspace/state')).statusCode, 200);
    assert.equal((await api(app, admin).op({ type: 'suspendAccount', id: bia.id })).statusCode, 200);
    const after = await api(app, bia).get('/workspace/state');
    assert.equal(after.statusCode, 401, 'sessão revogada');
    const open = await server.ctx.db.select().from(sessions).where(eq(sessions.userId, bia.id));
    assert.ok(open.every((s) => s.revokedAt));
    assert.ok((await auditActions(server)).includes('sessions_revoked'));
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'bia@example.com', password: STRONG_PASSWORD } });
    assert.equal(json(login).error.code, 'accountSuspended');
    await api(app, admin).op({ type: 'reactivateAccount', id: bia.id });
    const back = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'bia@example.com', password: STRONG_PASSWORD } });
    assert.equal(back.statusCode, 200);
  } finally {
    await server.close();
  }
});

test('remover exige transferir antes; depois anonimiza e o id fica no Audit Log', async () => {
  const { server, app, admin } = await setup();
  try {
    const caio = await invitePerson(app, admin, { email: 'caio@example.com', name: 'Caio' });
    const board = await createBoard(app, caio);
    const blocked = await api(app, admin).op({ type: 'removeAccount', id: caio.id });
    assert.equal(json(blocked).error.message.key, 'workspace.errors.ownsBoards');
    const moved = await api(app, admin).op({ type: 'transferBoardOwnership', fromId: caio.id, toId: admin.id, boardIds: [board.id] });
    assert.equal(moved.statusCode, 200);
    assert.equal(json(moved).state.boards.find((b: { id: string }) => b.id === board.id).ownerId, admin.id);
    assert.equal((await api(app, admin).op({ type: 'removeAccount', id: caio.id })).statusCode, 200);
    const [u] = await server.ctx.db.select().from(users).where(eq(users.id, caio.id));
    assert.ok(u.anonymizedAt);
    assert.equal(u.email, `removed-${caio.id}@removed.invalid`);
    assert.notEqual(u.name, 'Caio');
    const st = await api(app, admin).state();
    assert.equal(st.directory.find((d: { id: string }) => d.id === caio.id).status, 'removed');
    assert.ok(st.auditLog.some((e: { action: string; targetId?: string }) => e.action === 'member_anonymized' && e.targetId === caio.id));
  } finally {
    await server.close();
  }
});

test('convidado B2B: só vê o board compartilhado, sem times nem e-mails alheios; política desligada bloqueia', async () => {
  const { server, app, admin } = await setup();
  try {
    const shared = await createBoard(app, admin, { name: 'Do cliente' });
    const secret = await createBoard(app, admin, { name: 'Interno' });
    await api(app, admin).op({ type: 'createTeam', input: { name: 'Interno' } });
    const guest = await invitePerson(app, admin, { email: 'cliente@parceiro.com', role: 'guest_b2b', boardId: shared.id, boardRole: 'commenter', name: 'Cliente' });
    const st = await api(app, guest).state();
    assert.deepEqual(st.boards.map((b: { id: string }) => b.id), [shared.id]);
    assert.equal(st.teams.length, 0);
    assert.ok(st.directory.every((d: { id: string; email: string }) => d.id === guest.id || d.email === ''));
    assert.equal((await api(app, guest).get(`/boards/${shared.id}/data`)).statusCode, 200);
    const other = await api(app, guest).get(`/boards/${secret.id}/data`);
    assert.equal(other.statusCode, 403);
    await api(app, admin).op({ type: 'updatePolicies', patch: { allowGuests: false } });
    assert.equal((await api(app, guest).get(`/boards/${shared.id}/data`)).statusCode, 403, 'política desligada vale na hora');
  } finally {
    await server.close();
  }
});

test('políticas: links públicos desligados, senha obrigatória e alteração registrada com antes/depois', async () => {
  const { server, app, admin } = await setup();
  try {
    const board = await createBoard(app, admin);
    const a = api(app, admin);
    await a.op({ type: 'updatePolicies', patch: { requirePasswordOnPublicLinks: true } });
    const noPw = await a.op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true } });
    assert.equal(json(noPw).error.message.key, 'workspace.errors.passwordRequired');
    const forged = await a.op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true, passwordHash: 'x' } });
    assert.equal(forged.statusCode, 400, 'o hash nunca vem do cliente');
    await a.op({ type: 'updatePolicies', patch: { allowPublicLinks: false } });
    const off = await a.op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true } }, 'Senha-Do-Link-1');
    assert.equal(off.statusCode, 403);
    const [audit] = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'policy_changed'));
    assert.deepEqual(audit.changes?.[0], { field: 'requirePasswordOnPublicLinks', before: false, after: true });
    const [org] = await server.ctx.db.select().from(organizations);
    assert.equal(org.policies.allowPublicLinks, false);
  } finally {
    await server.close();
  }
});

test('lixeira: excluir manda para a lixeira; restaurar e excluir de vez pelas regras', async () => {
  const { server, app, admin } = await setup();
  try {
    const board = await createBoard(app, admin);
    const a = api(app, admin);
    assert.equal((await a.del(`/boards/${board.id}`)).statusCode, 200);
    let st = await a.state();
    assert.ok(st.boards.find((b: { id: string }) => b.id === board.id).deletedAt, 'admin vê na lixeira');
    // o titular ainda lê (regra do Chat 06: "titular sempre alcança"), mas ninguém grava num board na lixeira
    assert.equal((await a.put(`/boards/${board.id}/data`, emptyBoard(), 0)).statusCode, 404, 'não grava na lixeira');
    assert.equal((await a.op({ type: 'restoreBoard', id: board.id })).statusCode, 200);
    st = await a.state();
    assert.equal(st.boards.find((b: { id: string }) => b.id === board.id).deletedAt, null);
    await a.del(`/boards/${board.id}`);
    assert.equal((await a.op({ type: 'purgeBoard', id: board.id })).statusCode, 200);
    assert.equal((await a.get(`/boards/${board.id}/data`)).statusCode, 404);
    // favorito e último acesso são por pessoa
    const b2 = await createBoard(app, admin);
    await a.patch(`/boards/${b2.id}`, { favorite: true, lastOpenedAt: 123 });
    const fav = (await a.state()).boards.find((b: { id: string }) => b.id === b2.id);
    assert.equal(fav.favorite, true);
    assert.equal(fav.lastOpenedAt, 123);
    void emptyBoard;
  } finally {
    await server.close();
  }
});

test('Modo Servidor otimista: id e token propostos pelo cliente são usados; repetidos são recusados', async () => {
  const { server, app, admin } = await setup();
  try {
    const a = api(app, admin);
    const team = await a.op({ type: 'createTeam', input: { name: 'Proposto' }, clientId: 'cliente-time-001' });
    assert.equal(json(team).id, 'cliente-time-001');
    assert.equal((await a.op({ type: 'createTeam', input: { name: 'Outro' }, clientId: 'cliente-time-001' })).statusCode, 409);
    const inv = await a.op({ type: 'createInvitation', input: { email: 'p@example.com', role: 'member', expiresInDays: 7 }, clientId: 'cliente-conv-001', token: 'TokenDoClienteComMaisDe32Caracteres' });
    assert.equal(json(inv).token, 'TokenDoClienteComMaisDe32Caracteres');
    assert.equal(json(await app.inject({ url: '/api/v1/invitations/TokenDoClienteComMaisDe32Caracteres' })).email, 'p@example.com');
    const weak = await a.op({ type: 'createInvitation', input: { email: 'q@example.com', role: 'member', expiresInDays: 7 }, token: 'curto' });
    assert.equal(weak.statusCode, 400, 'token curto demais nem passa pela forma');
    const dup = await a.op({ type: 'createInvitation', input: { email: 'r@example.com', role: 'member', expiresInDays: 7 }, token: 'TokenDoClienteComMaisDe32Caracteres' });
    assert.equal(dup.statusCode, 409);
  } finally {
    await server.close();
  }
});
