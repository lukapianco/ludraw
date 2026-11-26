/**
 * Chat 08.5 · B — regras PURAS (mesmas no cliente e no servidor): links de convite gerais, fila de pedidos de acesso,
 * `grantAccess` compartilhado com o aceite de convite e a forma das operações novas (`isWorkspaceOp`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccessRequest, InviteLink, UserAccount, WorkspaceEntity } from '../../src/types/workspace';
import type { Viewer } from '../../src/utils/workspace';
import {
  applyDomainSignup,
  applyInvitationAcceptance,
  applyInviteLinkJoin,
  applyWorkspaceOp,
  emailInLinkDomain,
  inviteLinkStatus,
  isWorkspaceOp,
  LINK_REQUEST_INVITE_DAYS,
  validateInviteLinkJoin,
  type RuleEnv,
  type WorkspaceRulesState,
} from '../../src/utils/workspaceRules';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const env = (): RuleEnv => ({ now: NOW, newId: () => `id${++seq}`, newToken: () => `tok-${'x'.repeat(20)}${++seq}`, anonymizedName: (u) => `#${u}` });

const account = (id: string, role: UserAccount['workspaceRole'], email = `${id}@empresa.com`): UserAccount => ({ id, name: id, email, avatarColor: '#194B32', status: 'active', workspaceRole: role, teamIds: [], authProvider: 'local' });
const viewer = (a: UserAccount): Viewer => ({ userId: a.id, workspaceRole: a.workspaceRole, teamIds: a.teamIds, status: a.status });

const ANA = account('ana', 'admin');
const BIA = account('bia', 'member');

function state(extra: Partial<WorkspaceRulesState> = {}, ws: Partial<WorkspaceEntity> = {}): WorkspaceRulesState {
  return {
    workspace: { id: 'org', name: 'Empresa', slug: 'empresa', allowedEmailDomains: [], requireDomainForMembers: false, createdAt: 0, ownerId: 'ana', ...ws },
    directory: [ANA, BIA],
    teams: [{ id: 'eng', workspaceId: 'org', name: 'Engenharia', color: '#194B32', memberIds: [], createdAt: 0 } as never],
    projects: [{ id: 'q3', workspaceId: 'org', teamId: 'eng', name: 'Q3', invitedGuestIds: [], createdAt: 0 } as never],
    invitations: [],
    boards: [],
    inviteLinks: [],
    accessRequests: [],
    ...extra,
  };
}

const asAdmin = { viewer: viewer(ANA), actorId: 'ana' };
const asMember = { viewer: viewer(BIA), actorId: 'bia' };

const link = (over: Partial<InviteLink> = {}): InviteLink => ({ id: 'l1', role: 'member', maxUses: 2, uses: 0, createdBy: 'ana', createdAt: NOW - DAY, expiresAt: NOW + DAY, ...over });
const request = (over: Partial<AccessRequest> = {}): AccessRequest => ({ id: 'r1', kind: 'email', email: 'caio@fora.com', name: 'Caio', status: 'pending', emailConfirmed: true, existingAccount: false, createdAt: NOW - 1000, ...over });

test('createInviteLink: só administração; nunca papel admin; convidado exige escopo; domínio normalizado; token só no resultado', () => {
  const input = { role: 'member' as const, maxUses: 5, expiresInDays: 7, teamIds: ['eng', 'nao-existe'], allowedDomain: 'EMPRESA.com' };
  const denied = applyWorkspaceOp(state(), { type: 'createInviteLink', input }, asMember, env());
  assert.equal(denied.ok, false, 'membro não cria link geral (members.invite não basta)');

  const adminRole = applyWorkspaceOp(state(), { type: 'createInviteLink', input: { ...input, role: 'admin' as never } }, asAdmin, env());
  assert.equal(adminRole.ok, false);
  assert.equal(!adminRole.ok && adminRole.error.key, 'workspace.errors.inviteLinkAdminRole');

  const guestNoScope = applyWorkspaceOp(state(), { type: 'createInviteLink', input: { ...input, role: 'guest_b2b' } }, asAdmin, env());
  assert.equal(!guestNoScope.ok && guestNoScope.error.key, 'workspace.errors.guestScopeRequired');

  const ok = applyWorkspaceOp(state(), { type: 'createInviteLink', input }, asAdmin, env());
  assert.ok(ok.ok);
  const created = ok.state.inviteLinks![0];
  assert.equal(created.allowedDomain, 'empresa.com');
  assert.deepEqual(created.teamIds, ['eng'], 'times inexistentes descartados');
  assert.equal(created.uses, 0);
  assert.equal(created.expiresAt, NOW + 7 * DAY);
  assert.ok(ok.token && created.token === ok.token, 'o token só existe na criação');
  assert.equal(ok.audit[0].action, 'invite_link_created');

  const badDomain = applyWorkspaceOp(state(), { type: 'createInviteLink', input: { ...input, allowedDomain: 'não é domínio' } }, asAdmin, env());
  assert.equal(!badDomain.ok && badDomain.error.key, 'workspace.errors.inviteLinkDomain');
  const outsideOrg = applyWorkspaceOp(state({}, { allowedEmailDomains: ['empresa.com'], requireDomainForMembers: true }), { type: 'createInviteLink', input: { ...input, allowedDomain: 'outra.com' } }, asAdmin, env());
  assert.equal(!outsideOrg.ok && outsideOrg.error.key, 'workspace.errors.emailNotAllowedDomain');

  const full = state({ inviteLinks: Array.from({ length: 50 }, (_, i) => link({ id: `l${i}` })) });
  const limit = applyWorkspaceOp(full, { type: 'createInviteLink', input }, asAdmin, env());
  assert.equal(!limit.ok && limit.error.key, 'workspace.errors.inviteLinkLimit');
});

test('revokeInviteLink: só administração; revogar de novo não muda nada', () => {
  const s = state({ inviteLinks: [link()] });
  assert.equal(applyWorkspaceOp(s, { type: 'revokeInviteLink', id: 'l1' }, asMember, env()).ok, false);
  const r = applyWorkspaceOp(s, { type: 'revokeInviteLink', id: 'l1' }, asAdmin, env());
  assert.ok(r.ok);
  assert.equal(r.state.inviteLinks![0].revokedAt, NOW);
  const again = applyWorkspaceOp(r.state, { type: 'revokeInviteLink', id: 'l1' }, asAdmin, env());
  assert.ok(again.ok && again.state === r.state && again.audit.length === 0);
});

test('situação do link e regras de entrada (domínio do link, domínio da organização, convidados)', () => {
  assert.equal(inviteLinkStatus(link(), NOW), 'active');
  assert.equal(inviteLinkStatus(link({ revokedAt: NOW - 1 }), NOW), 'revoked');
  assert.equal(inviteLinkStatus(link({ expiresAt: NOW }), NOW), 'expired');
  assert.equal(inviteLinkStatus(link({ uses: 2 }), NOW), 'exhausted');
  assert.equal(emailInLinkDomain('a@empresa.com', 'empresa.com'), true);
  assert.equal(emailInLinkDomain('a@rh.empresa.com', 'empresa.com'), true);
  assert.equal(emailInLinkDomain('a@empresa.com.br', 'empresa.com'), false);
  assert.equal(emailInLinkDomain('a@xempresa.com', 'empresa.com'), false);

  const s = state();
  assert.equal(validateInviteLinkJoin(s, link({ allowedDomain: 'empresa.com' }), 'a@outra.com', NOW)?.key, 'workspace.errors.inviteLinkDomainMismatch');
  assert.equal(validateInviteLinkJoin(s, link({ uses: 2 }), 'a@empresa.com', NOW)?.key, 'workspace.errors.inviteLinkExhausted');
  assert.equal(validateInviteLinkJoin(s, undefined, 'a@empresa.com', NOW)?.key, 'workspace.errors.inviteLinkNotFound');
  const noGuests = state({}, { policies: { allowGuests: false } as never });
  assert.equal(validateInviteLinkJoin(noGuests, link({ role: 'guest_b2b', projectId: 'q3' }), 'a@empresa.com', NOW)?.key, 'permissions.denied.guestsDisabled');
  assert.equal(validateInviteLinkJoin(s, link(), 'A@Empresa.com ', NOW), null);
});

test('applyInviteLinkJoin: conta nova com o acesso do link, uses + 1 e auditoria; grantAccess dá o mesmo resultado do convite', () => {
  const s = state({ inviteLinks: [link({ teamIds: ['eng'] })] });
  const r = applyInviteLinkJoin(s, s.inviteLinks![0], { id: 'novo', name: 'Novo', email: 'novo@empresa.com', avatarColor: '#000' }, env());
  assert.ok(r.ok);
  assert.equal(r.state.inviteLinks![0].uses, 1);
  const entry = r.state.directory.find((a) => a.id === 'novo')!;
  assert.equal(entry.workspaceRole, 'member');
  assert.equal(entry.createdVia, 'invite_link');
  assert.equal(entry.invitedBy, 'ana');
  assert.ok(r.state.teams[0].memberIds.includes('novo'));
  assert.equal(r.audit[0].action, 'invite_link_used');

  // o aceite de convite continua igual depois da extração do grantAccess
  const inv = { id: 'i1', workspaceId: 'org', email: 'novo@empresa.com', role: 'member' as const, teamIds: ['eng'], token: 't', invitedBy: 'ana', createdAt: NOW - 1, expiresAt: NOW + DAY };
  const viaInvite = applyInvitationAcceptance(state({ invitations: [inv] }), inv, { id: 'novo', name: 'Novo', email: 'novo@empresa.com', avatarColor: '#000' }, env());
  assert.ok(viaInvite.ok);
  const fromInvite = viaInvite.state.directory.find((a) => a.id === 'novo')!;
  assert.deepEqual({ ...fromInvite, createdVia: undefined }, { ...entry, createdVia: undefined });
  assert.equal(fromInvite.createdVia, 'invite');
  assert.equal(viaInvite.state.invitations[0].acceptedBy, 'novo');
  assert.equal(viaInvite.audit[0].action, 'member_joined');
});

test('aprovar pedido pela tela: vira convite (membro ou convidado, nunca admin); recusar; só administração', () => {
  const s = state({ accessRequests: [request()] });
  const grant = { role: 'member' as const, expiresInDays: 7, teamIds: ['eng'] };
  assert.equal(applyWorkspaceOp(s, { type: 'approveAccessRequest', id: 'r1', grant }, asMember, env()).ok, false);
  const noGrant = applyWorkspaceOp(s, { type: 'approveAccessRequest', id: 'r1' }, asAdmin, env());
  assert.equal(!noGrant.ok && noGrant.error.key, 'workspace.errors.accessRequestGrantRequired');
  const admin = applyWorkspaceOp(s, { type: 'approveAccessRequest', id: 'r1', grant: { ...grant, role: 'admin' as never } }, asAdmin, env());
  assert.equal(!admin.ok && admin.error.key, 'workspace.errors.accessRequestAdminRole');

  const ok = applyWorkspaceOp(s, { type: 'approveAccessRequest', id: 'r1', grant }, asAdmin, env());
  assert.ok(ok.ok);
  const inv = ok.state.invitations[0];
  assert.equal(inv.email, 'caio@fora.com');
  assert.equal(inv.role, 'member');
  assert.equal(ok.id, inv.id);
  assert.equal(ok.token, inv.token);
  const req = ok.state.accessRequests![0];
  assert.equal(req.status, 'approved');
  assert.equal(req.invitationId, inv.id);
  assert.deepEqual(ok.audit.map((a) => a.action), ['member_invited', 'access_request_approved']);

  const twice = applyWorkspaceOp(ok.state, { type: 'approveAccessRequest', id: 'r1', grant }, asAdmin, env());
  assert.equal(!twice.ok && twice.error.key, 'workspace.errors.accessRequestDecided');

  const rejected = applyWorkspaceOp(s, { type: 'rejectAccessRequest', id: 'r1' }, asAdmin, env());
  assert.ok(rejected.ok);
  assert.equal(rejected.state.accessRequests![0].status, 'rejected');
  assert.equal(rejected.state.invitations.length, 0);
  assert.equal(applyWorkspaceOp(s, { type: 'rejectAccessRequest', id: 'r1' }, asMember, env()).ok, false);

  // não confirmado não existe para a administração
  const hidden = state({ accessRequests: [request({ status: 'unconfirmed' })] });
  const nf = applyWorkspaceOp(hidden, { type: 'approveAccessRequest', id: 'r1', grant }, asAdmin, env());
  assert.equal(!nf.ok && nf.error.key, 'workspace.errors.accessRequestNotFound');
});

test('aprovar pedido feito pelo link (servidor sem e-mail): convite com o acesso do link, uses + 1; link esgotado recusa; quem já tem conta só fecha', () => {
  const l = link({ maxUses: 1, teamIds: ['eng'] });
  const s = state({ inviteLinks: [l], accessRequests: [request({ kind: 'link', inviteLinkId: 'l1', email: 'caio@empresa.com', emailConfirmed: false })] });
  const r = applyWorkspaceOp(s, { type: 'approveAccessRequest', id: 'r1' }, asAdmin, env());
  assert.ok(r.ok);
  assert.equal(r.state.inviteLinks![0].uses, 1);
  const inv = r.state.invitations[0];
  assert.equal(inv.role, 'member');
  assert.deepEqual(inv.teamIds, ['eng']);
  assert.equal(inv.expiresAt, NOW + LINK_REQUEST_INVITE_DAYS * DAY);
  assert.ok(!('password' in inv) && !JSON.stringify(r.state.accessRequests).includes('password'), 'nenhum pedido leva senha');

  const second = state({ inviteLinks: [l, link({ id: 'l2' })].map((x) => (x.id === 'l1' ? { ...x, uses: 1 } : x)), accessRequests: [request({ kind: 'link', inviteLinkId: 'l1', email: 'dani@empresa.com' })] });
  const exhausted = applyWorkspaceOp(second, { type: 'approveAccessRequest', id: 'r1' }, asAdmin, env());
  assert.equal(!exhausted.ok && exhausted.error.key, 'workspace.errors.inviteLinkExhausted');

  const existing = state({ inviteLinks: [l], accessRequests: [request({ kind: 'link', inviteLinkId: 'l1', email: 'bia@empresa.com', existingAccount: true })] });
  const closed = applyWorkspaceOp(existing, { type: 'approveAccessRequest', id: 'r1' }, asAdmin, env());
  assert.ok(closed.ok);
  assert.equal(closed.state.invitations.length, 0, 'quem já tem conta não ganha convite');
  assert.equal(closed.state.inviteLinks![0].uses, 0, 'nem gasta um uso do link');
  assert.equal(closed.state.accessRequests![0].status, 'approved');
  assert.deepEqual(closed.audit[0].message, { key: 'workspace.audit.msg.accessRequestClosedExisting' });
});

test('isWorkspaceOp: forma das operações novas e do sendEmail', () => {
  const linkInput = { role: 'member', maxUses: 10, expiresInDays: 30 };
  assert.equal(isWorkspaceOp({ type: 'createInviteLink', input: linkInput }), true);
  assert.equal(isWorkspaceOp({ type: 'createInviteLink', input: { ...linkInput, role: 'admin' } }), false, 'admin recusado já na forma');
  assert.equal(isWorkspaceOp({ type: 'createInviteLink', input: { ...linkInput, maxUses: 0 } }), false);
  assert.equal(isWorkspaceOp({ type: 'createInviteLink', input: { ...linkInput, maxUses: 1.5 } }), false);
  assert.equal(isWorkspaceOp({ type: 'createInviteLink', input: { ...linkInput, expiresInDays: 91 } }), false);
  assert.equal(isWorkspaceOp({ type: 'createInviteLink', input: { ...linkInput, token: 'x' } }), false, 'token não vai dentro da entrada');
  assert.equal(isWorkspaceOp({ type: 'revokeInviteLink', id: 'l1' }), true);
  assert.equal(isWorkspaceOp({ type: 'rejectAccessRequest', id: 'r1', extra: 1 }), false);
  assert.equal(isWorkspaceOp({ type: 'approveAccessRequest', id: 'r1' }), true);
  assert.equal(isWorkspaceOp({ type: 'approveAccessRequest', id: 'r1', grant: { role: 'guest_b2b', expiresInDays: 7, projectId: 'q3', sendEmail: false } }), true);
  assert.equal(isWorkspaceOp({ type: 'approveAccessRequest', id: 'r1', grant: { role: 'admin', expiresInDays: 7 } }), false);
  assert.equal(isWorkspaceOp({ type: 'approveAccessRequest', id: 'r1', grant: { role: 'member', expiresInDays: 7, password: 'x' } }), false, 'pedido nunca leva senha');
  assert.equal(isWorkspaceOp({ type: 'createInvitation', input: { email: 'a@b.com', role: 'member', expiresInDays: 7, sendEmail: false } }), true);
  assert.equal(isWorkspaceOp({ type: 'createInvitation', input: { email: 'a@b.com', role: 'member', expiresInDays: 7, sendEmail: 'sim' } }), false);
  assert.equal(isWorkspaceOp({ type: 'updatePolicies', patch: { allowAccessRequests: true } }), true);
  assert.equal(isWorkspaceOp({ type: 'updatePolicies', patch: { allowAccessRequests: 'sim' } }), false);
});

test('Chat 08.5 · C: cadastro pelo domínio — política, domínio exato, sempre membro sem time, auditoria; políticas aceitam a chave', () => {
  const nova = { id: 'nova', name: 'Nova', email: 'nova@empresa.com', avatarColor: '#194B32' };
  const on = (domains: string[]) => state({}, { allowedEmailDomains: domains, policies: { allowDomainSignup: true } as never });
  assert.equal(applyDomainSignup(state({}, { allowedEmailDomains: ['empresa.com'] }), nova, env()).ok, false, 'política desligada');
  assert.equal(applyDomainSignup(on(['empresa.com']), { ...nova, email: 'nova@vendas.empresa.com' }, env()).ok, false, 'subdomínio');
  assert.equal(applyDomainSignup(on(['outra.com']), nova, env()).ok, false, 'domínio fora');
  assert.equal(applyDomainSignup(on(['empresa.com']), { ...nova, email: 'bia@empresa.com' }, env()).ok, false, 'e-mail já no diretório');
  const r = applyDomainSignup(on(['EMPRESA.com.']), nova, env());
  assert.ok(r.ok);
  if (!r.ok) return;
  const entry = r.state.directory.find((a) => a.id === 'nova')!;
  assert.equal(entry.workspaceRole, 'member');
  assert.deepEqual(entry.teamIds, []);
  assert.equal(entry.createdVia, 'signup');
  assert.equal(entry.invitedBy, undefined);
  assert.deepEqual(r.audit.map((a) => a.action), ['domain_signup']);
  assert.ok(isWorkspaceOp({ type: 'updatePolicies', patch: { allowDomainSignup: true } }), 'a política nova passa na validação de forma');
  assert.equal(isWorkspaceOp({ type: 'updatePolicies', patch: { allowDomainSignup: 'sim' } }), false);
});
