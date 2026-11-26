/**
 * Regras puras compartilhadas (as mesmas do slice local) e manutenção periódica do servidor.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { UserAccount } from '../../src/types/workspace';
import { DEFAULT_WORKSPACE_POLICIES } from '../../src/utils/permissions';
import { viewerFor } from '../../src/utils/workspace';
import { applyWorkspaceOp, isWorkspaceOp, validateInvitationAcceptance, type WorkspaceRulesState } from '../../src/utils/workspaceRules';
import { boards, snapshots, workspaceAudit } from '../src/db/schema';
import { runMaintenance } from '../src/maintenance';
import { api, createBoard, startConfigured, type Person } from './helpers';

const DAY = 86_400_000;
const acc = (id: string, role: UserAccount['workspaceRole'], extra: Partial<UserAccount> = {}): UserAccount => ({
  id,
  name: id,
  email: `${id}@example.com`,
  avatarColor: '#194B32',
  status: 'active',
  workspaceRole: role,
  teamIds: [],
  authProvider: 'local',
  ...extra,
});

function baseState(): WorkspaceRulesState {
  return {
    workspace: { id: 'org', name: 'Org', slug: 'org', allowedEmailDomains: [], requireDomainForMembers: false, createdAt: 0, ownerId: 'ana', policies: { ...DEFAULT_WORKSPACE_POLICIES } },
    directory: [acc('ana', 'admin'), acc('bia', 'member')],
    teams: [],
    projects: [],
    invitations: [],
    boards: [],
  };
}

const env = { now: 1_000_000, newId: () => 'novo', newToken: () => 'TOKEN-DE-TESTE-123', anonymizedName: () => 'anon' };
const actorOf = (s: WorkspaceRulesState, id: string, simulating = false) => ({ viewer: viewerFor({ userId: id, workspaceRole: 'member', viewAs: null }, s, 'org'), actorId: id, simulating });

test('regras puras: coleções que não mudam mantêm a referência (o cliente compara por referência)', () => {
  const s = baseState();
  const r = applyWorkspaceOp(s, { type: 'createTeam', input: { name: 'Time' } }, actorOf(s, 'ana'), env);
  assert.ok(r.ok);
  assert.notEqual(r.state.teams, s.teams);
  assert.equal(r.state.boards, s.boards);
  assert.equal(r.state.invitations, s.invitations);
  assert.equal(r.audit[0].action, 'team_created');
  const same = applyWorkspaceOp(r.state, { type: 'setTeamArchived', id: 'novo', archived: false }, actorOf(r.state, 'ana'), env);
  assert.ok(same.ok && same.state === r.state && same.audit.length === 0, 'nada muda → nada grava');
});

test('regras puras: revogar convite alheio exige gerenciar membros; "Visualizar como" nunca usa o atalho do autor', () => {
  let s = baseState();
  const created = applyWorkspaceOp(s, { type: 'createInvitation', input: { email: 'novo@example.com', role: 'member', expiresInDays: 7 } }, actorOf(s, 'bia'), env);
  assert.ok(created.ok);
  s = created.state;
  assert.equal(s.invitations[0].invitedBy, 'bia');
  assert.equal(created.token, 'TOKEN-DE-TESTE-123');
  const simulated = applyWorkspaceOp(s, { type: 'revokeInvitation', id: 'novo' }, actorOf(s, 'bia', true), env);
  assert.ok(!simulated.ok && simulated.error.key.startsWith('permissions.'));
  const own = applyWorkspaceOp(s, { type: 'revokeInvitation', id: 'novo' }, actorOf(s, 'bia'), env);
  assert.ok(own.ok);
  assert.equal(validateInvitationAcceptance(own.state, own.state.invitations[0], 'novo@example.com', env.now)?.key, 'workspace.errors.inviteRevoked');
});

test('regras puras: link público respeita o teto de validade da política', () => {
  const s = baseState();
  s.workspace = { ...s.workspace, policies: { ...DEFAULT_WORKSPACE_POLICIES, maxPublicLinkLifetimeDays: 1 } };
  s.boards = [{ id: 'b', name: 'B', createdAt: 0, updatedAt: 0, lastOpenedAt: 0, favorite: false, ownerName: 'ana', ownerId: 'ana', team: '', space: '', color: '#000000', template: 'blank' }];
  const tooLong = applyWorkspaceOp(s, { type: 'setPublicLink', boardId: 'b', patch: { enabled: true, lifetime: '7d' } }, actorOf(s, 'ana'), env);
  assert.ok(!tooLong.ok && tooLong.error.key === 'workspace.errors.lifetimeNotAllowed');
  const capped = applyWorkspaceOp(s, { type: 'setPublicLink', boardId: 'b', patch: { enabled: true } }, actorOf(s, 'ana'), env);
  assert.ok(capped.ok);
  const link = capped.state.boards[0].publicLink!;
  assert.equal(link.expiresAt, env.now + DAY, 'primeiro uso começa no maior prazo permitido');
  assert.equal(capped.audit[0].action, 'public_link_created');
  assert.equal(isWorkspaceOp({ type: 'setPublicLink', boardId: 'b', patch: { lifetime: '99y' } }), false);
});

test('manutenção: lixeira vencida sai (com registro), versões além da retenção saem, IP antigo do Audit Log é apagado', async () => {
  const { server, admin } = await startConfigured({ LUDRAW_AUDIT_IP_RETENTION_DAYS: '30' });
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const keep = await createBoard(server.app, owner);
    const old = await createBoard(server.app, owner);
    await api(server.app, owner).del(`/boards/${old.id}`);
    await server.ctx.db.update(boards).set({ deletedAt: new Date(Date.now() - 31 * DAY) }).where(eq(boards.id, old.id));
    for (let i = 0; i < 3; i++) await api(server.app, owner).post(`/boards/${keep.id}/snapshots`, { name: '', kind: 'auto' });
    await api(server.app, owner).post(`/boards/${keep.id}/snapshots`, { name: 'Nomeada', kind: 'manual' });
    const all = await server.ctx.db.select().from(snapshots).where(eq(snapshots.boardId, keep.id));
    for (const s of all) await server.ctx.db.update(snapshots).set({ createdAt: new Date(Date.now() - 40 * DAY - all.indexOf(s) * 1000) }).where(eq(snapshots.id, s.id));
    await server.ctx.db.update(workspaceAudit).set({ timestamp: new Date(Date.now() - 31 * DAY), ip: '203.0.113.5' });
    await runMaintenance(server.ctx);
    assert.equal((await server.ctx.db.select().from(boards).where(eq(boards.id, old.id))).length, 0);
    assert.equal((await server.ctx.db.select().from(boards).where(eq(boards.id, keep.id))).length, 1);
    const left = await server.ctx.db.select().from(snapshots).where(eq(snapshots.boardId, keep.id));
    assert.ok(left.some((s) => s.kind === 'manual'), 'nomeada fica');
    assert.equal(left.filter((s) => s.kind === 'auto').length, 1, 'só a mais nova das automáticas vencidas fica');
    const audit = await server.ctx.db.select().from(workspaceAudit);
    assert.ok(audit.some((a) => a.action === 'trash_emptied' && a.origin === 'system'));
    assert.ok(audit.filter((a) => a.timestamp.getTime() < Date.now() - 30 * DAY).every((a) => a.ip === null), 'IP apagado após a retenção');
  } finally {
    await server.close();
  }
});
