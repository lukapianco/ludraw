/**
 * LuDraw — Chat 07: regras PURAS das ações do Workspace, compartilhadas pelo cliente e pelo servidor.
 *
 * O `workspaceSlice` (modo local) e a rota `POST /api/v1/workspace/ops` do servidor chamam a MESMA
 * função `applyWorkspaceOp(estado, operação, quem age, ambiente)`. Ela confere `explain()`/`can()` e a
 * proteção do último administrador, valida, e devolve o novo estado + as entradas de auditoria (ou o
 * motivo da recusa como chave + parâmetros). Nada de React, store, i18n em execução ou armazenamento:
 * efeitos colaterais (apagar dados do board, sessão, Mesa) ficam com quem chama.
 *
 * Referências mantidas sempre que uma coleção não muda (o cliente compara por referência).
 */
import type { MessageDescriptor, StoredMessage } from '../i18n/types';
import type {
  AuditChange,
  BoardMeta,
  AccessRequest,
  BoardRole,
  Invitation,
  InviteLink,
  ProjectFolder,
  PublicShareLink,
  TeamEntity,
  UserAccount,
  WorkspaceAuditAction,
  WorkspaceAuditEntry,
  WorkspaceEntity,
  WorkspacePolicies,
  WorkspaceRole,
} from '../types/workspace';
import {
  BOARD_ROLE_LABEL_KEYS,
  DEFAULT_WORKSPACE_POLICIES,
  WORKSPACE_ROLE_LABEL_KEYS,
  explain,
  explainAccountChange,
  workspaceContext,
  type PermissionAction,
  type PermissionDecision,
} from './permissions';
import { DEFAULT_PERSONAL_TEAM, DEFAULT_SPACE_NAME } from './storedDefaults';
import {
  DAY_MS,
  LINK_LIFETIMES,
  allowedLinkLifetimes,
  boardContextFor,
  canUsePlace,
  emailDomain,
  invitationStatus,
  isValidEmail,
  memberEmailAllowed,
  membershipAccounts,
  normalizeDomain,
  placeFields,
  slugify,
  type Place,
  type Viewer,
  type WorkspaceView,
} from './workspace';

export const TEAM_COLORS = ['#194B32', '#2C64A8', '#C2412D', '#8C4A7A', '#E0A21B', '#3A8156', '#5B6573'];

/* ------------------------------ Tipos ------------------------------ */

/** O que as regras enxergam (mesmos formatos do cliente). */
export interface WorkspaceRulesState {
  workspace: WorkspaceEntity;
  directory: UserAccount[];
  teams: TeamEntity[];
  projects: ProjectFolder[];
  invitations: Invitation[];
  boards: BoardMeta[];
  /** Chat 08.5 · B (só Modo Servidor): links de convite gerais e fila de pedidos de acesso. Ausente = nenhum. */
  inviteLinks?: InviteLink[];
  accessRequests?: AccessRequest[];
}

export interface RuleActor {
  /** Quem está decidindo (no cliente, com "Visualizar como…"; no servidor, sempre a pessoa real) */
  viewer: Viewer;
  /** Pessoa REAL que fica como autora no Audit Log */
  actorId: string;
  /** "Visualizar como…" ativo (só no cliente) */
  simulating?: boolean;
}

export interface RuleEnv {
  now: number;
  newId(): string;
  newToken(): string;
  /** Nome gravado numa conta anonimizada (o cliente usa o idioma ativo; a tela mostra "Usuário removido") */
  anonymizedName(userId: string): string;
}

export type AuditMeta = Partial<Omit<WorkspaceAuditEntry, 'id' | 'timestamp' | 'action' | 'message' | 'workspaceId'>>;

export interface AuditDraft {
  action: WorkspaceAuditAction;
  message: StoredMessage;
  meta?: AuditMeta;
}

export type RuleSuccess = {
  ok: true;
  state: WorkspaceRulesState;
  id?: string;
  /** Token criado (convite) — só volta para quem criou */
  token?: string;
  audit: AuditDraft[];
  /** Boards excluídos de vez: quem chama apaga o conteúdo e as versões */
  purgedBoardIds?: string[];
};
export type RuleFailure = { ok: false; error: MessageDescriptor };
export type RuleResult = RuleSuccess | RuleFailure;

export interface InvitationInput {
  email: string;
  role: Exclude<WorkspaceRole, 'visitor'>;
  teamIds?: string[];
  projectId?: string;
  boardId?: string;
  boardRole?: Exclude<BoardRole, 'owner'>;
  expiresInDays: number;
  /**
   * Chat 08.5 · B: o servidor envia o convite por e-mail (com e-mail configurado). Ausente = envia. As regras
   * não leem este campo: o envio é efeito da rota, depois de gravar.
   */
  sendEmail?: boolean;
}

/** Chat 08.5 · B — o que um link de convite geral concede (papel fixo; nunca admin). */
export interface InviteLinkInput {
  role: 'member' | 'guest_b2b';
  teamIds?: string[];
  projectId?: string;
  boardId?: string;
  boardRole?: Exclude<BoardRole, 'owner'>;
  /** 1–1000 */
  maxUses: number;
  /** 1–90 */
  expiresInDays: number;
  /** só e-mails deste domínio (ex.: empresa.com.br) */
  allowedDomain?: string | null;
}

/** Chat 08.5 · B — aprovar um pedido feito pela tela "Pedir acesso": o convite gerado (nunca admin). */
export interface AccessGrantInput {
  role: 'member' | 'guest_b2b';
  teamIds?: string[];
  projectId?: string;
  boardId?: string;
  boardRole?: Exclude<BoardRole, 'owner'>;
  expiresInDays: number;
  sendEmail?: boolean;
}

/** Limites dos links gerais (as mesmas constantes valem na forma e na regra). */
export const INVITE_LINK_LIMITS = { maxUses: 1000, maxDays: 90, maxActive: 50 } as const;
/** Validade do convite gerado ao aprovar um pedido feito pelo link geral (servidor sem e-mail). */
export const LINK_REQUEST_INVITE_DAYS = 7;

/** Mudança no link público. A senha chega JÁ em hash (local: SHA-256; servidor: argon2id). */
export interface PublicLinkRulePatch {
  enabled?: boolean;
  accessLevel?: PublicShareLink['accessLevel'];
  /** hash = nova senha · null = sem senha · ausente = mantém */
  passwordHash?: string | null;
  lifetime?: (typeof LINK_LIFETIMES)[number]['id'];
  /** true/false = definido no link · null = seguir a política do workspace */
  allowDownload?: boolean | null;
}

/** Uma ação do Workspace (o servidor recebe exatamente isto em `POST /workspace/ops`). */
export type WorkspaceOp =
  | { type: 'updateWorkspace'; patch: { name?: string; allowedEmailDomains?: string[]; requireDomainForMembers?: boolean } }
  | { type: 'updatePolicies'; patch: Partial<WorkspacePolicies> }
  | { type: 'createTeam'; input: { name: string; description?: string; color?: string; memberIds?: string[] }; clientId?: string }
  | { type: 'updateTeam'; id: string; patch: { name?: string; description?: string; color?: string } }
  | { type: 'setTeamArchived'; id: string; archived: boolean }
  | { type: 'setTeamMembers'; id: string; memberIds: string[] }
  | { type: 'createProject'; input: { teamId: string; name: string; description?: string }; clientId?: string }
  | { type: 'updateProject'; id: string; patch: { name?: string; description?: string } }
  | { type: 'setProjectArchived'; id: string; archived: boolean }
  | { type: 'moveProject'; id: string; teamId: string }
  | { type: 'moveBoard'; boardId: string; place: Place }
  | { type: 'restoreBoard'; id: string }
  | { type: 'purgeBoard'; id: string }
  | { type: 'emptyTrash' }
  | { type: 'setAccountRole'; id: string; role: Exclude<WorkspaceRole, 'visitor'> }
  | { type: 'suspendAccount'; id: string }
  | { type: 'reactivateAccount'; id: string }
  | { type: 'removeAccount'; id: string }
  | { type: 'createInvitation'; input: InvitationInput; clientId?: string; token?: string }
  | { type: 'revokeInvitation'; id: string }
  | { type: 'extendGuest'; userId: string; days: number }
  | { type: 'revokeGuest'; userId: string }
  | { type: 'setBoardMember'; boardId: string; userId: string; role: Exclude<BoardRole, 'owner'>; expiresAt?: number | null }
  | { type: 'removeBoardMember'; boardId: string; userId: string }
  | { type: 'setPublicLink'; boardId: string; patch: PublicLinkRulePatch; token?: string }
  | { type: 'revokePublicLink'; boardId: string }
  | { type: 'regeneratePublicLink'; boardId: string; token?: string }
  | { type: 'transferBoardOwnership'; fromId: string; toId: string; boardIds: string[] }
  /* Chat 08.5 · B (Modo Servidor) */
  | { type: 'createInviteLink'; input: InviteLinkInput; clientId?: string; token?: string }
  | { type: 'revokeInviteLink'; id: string }
  | { type: 'approveAccessRequest'; id: string; grant?: AccessGrantInput; clientId?: string; token?: string }
  | { type: 'rejectAccessRequest'; id: string };

export type WorkspaceOpType = WorkspaceOp['type'];

/**
 * Chat 07 · B: no Modo Servidor o cliente aplica a operação na hora e o servidor confirma. Para o id do
 * time/projeto/convite e o token do convite/link serem os MESMOS nos dois lados, a operação pode levar os
 * valores propostos pelo cliente (o servidor confere formato e unicidade). As regras não leem estes campos:
 * quem chama os entrega pelo `RuleEnv` (`newId`/`newToken`).
 */
// Chat 08.7 · R5 (S-18): ≥ 32 caracteres (≈ 192 bits com o alfabeto base64url); tokens já gravados continuam valendo
export const CLIENT_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function opClientValues(op: WorkspaceOp): { clientId?: string; token?: string } {
  const o = op as { clientId?: string; token?: string };
  return { ...(o.clientId ? { clientId: o.clientId } : {}), ...(o.token ? { token: o.token } : {}) };
}

/* ------------------------------ Helpers ------------------------------ */

const err = (key: MessageDescriptor['key'], params?: MessageDescriptor['params']): RuleFailure => ({ ok: false, error: params ? { key, params } : { key } });
const denied = (d: PermissionDecision): RuleFailure => ({ ok: false, error: d.reason ?? { key: 'permissions.denied.unknownAction' } });
const done = (state: WorkspaceRulesState, audit: AuditDraft[] = [], extra: Partial<RuleSuccess> = {}): RuleSuccess => ({ ok: true, state, audit, ...extra });

export const roleMsg = (role: WorkspaceRole): StoredMessage => ({ key: WORKSPACE_ROLE_LABEL_KEYS[role] });
export const boardRoleMsg = (role: BoardRole): StoredMessage => ({ key: BOARD_ROLE_LABEL_KEYS[role] });

export function policiesOfWorkspace(ws: WorkspaceEntity): WorkspacePolicies {
  return { ...DEFAULT_WORKSPACE_POLICIES, ...(ws.policies ?? {}) };
}

export function rulesView(s: WorkspaceRulesState): WorkspaceView {
  return { teams: s.teams, projects: s.projects, policies: policiesOfWorkspace(s.workspace), directory: s.directory };
}

function checkWs(s: WorkspaceRulesState, actor: RuleActor, action: PermissionAction): RuleFailure | null {
  const d = explain(workspaceContext(actor.viewer, policiesOfWorkspace(s.workspace)), action);
  return d.allowed ? null : denied(d);
}

function checkBoard(s: WorkspaceRulesState, actor: RuleActor, meta: BoardMeta, action: PermissionAction): RuleFailure | null {
  const d = explain(boardContextFor(actor.viewer, meta, rulesView(s)), action);
  return d.allowed ? null : denied(d);
}

export function policyValue(v: unknown): AuditChange['before'] {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

/** Lugar como parâmetro de mensagem (nomes de time/projeto são conteúdo do usuário). */
export function placeParam(place: Place, s: Pick<WorkspaceRulesState, 'teams' | 'projects' | 'workspace'>): StoredMessage | string {
  if (place.kind === 'personal') return { key: 'workspace.places.personal' };
  if (place.kind === 'shared') return { key: 'workspace.places.shared' };
  if (place.kind === 'workspace') return { key: 'workspace.places.general', params: { org: s.workspace.name } };
  const team = s.teams.find((x) => x.id === place.teamId)?.name ?? '';
  const project = place.projectId ? s.projects.find((p) => p.id === place.projectId)?.name : undefined;
  return project ? { key: 'workspace.places.teamProject', params: { team, project } } : team;
}

/** Campos legados (`team`/`space`, texto do Chat 01) mantidos em dia para quem ainda os lê. */
export function legacyPlaceText(place: Place, s: Pick<WorkspaceRulesState, 'teams' | 'projects' | 'workspace'>): Pick<BoardMeta, 'team' | 'space'> {
  if (place.kind === 'team') {
    const team = s.teams.find((x) => x.id === place.teamId)?.name ?? '';
    const project = place.projectId ? s.projects.find((p) => p.id === place.projectId)?.name : undefined;
    return { team, space: project ?? team };
  }
  if (place.kind === 'workspace') return { team: s.workspace.name, space: s.workspace.name };
  return { team: DEFAULT_PERSONAL_TEAM, space: DEFAULT_SPACE_NAME };
}

/** Times/projetos/boards de onde a conta participa → tira tudo (convidado revogado, conta removida). */
export function stripGrants(s: WorkspaceRulesState, userId: string): Pick<WorkspaceRulesState, 'teams' | 'projects' | 'boards'> {
  const teams = s.teams.some((tm) => tm.memberIds.includes(userId)) ? s.teams.map((tm) => (tm.memberIds.includes(userId) ? { ...tm, memberIds: tm.memberIds.filter((m) => m !== userId) } : tm)) : s.teams;
  const projects = s.projects.some((p) => p.invitedGuestIds.includes(userId) || p.guestRoles?.[userId])
    ? s.projects.map((p) => {
        if (!p.invitedGuestIds.includes(userId) && !p.guestRoles?.[userId]) return p;
        const guestRoles = { ...(p.guestRoles ?? {}) };
        delete guestRoles[userId];
        return { ...p, invitedGuestIds: p.invitedGuestIds.filter((g) => g !== userId), guestRoles };
      })
    : s.projects;
  const touches = (b: BoardMeta) => !!b.members?.some((m) => m.userId === userId) || !!b.invitedGuestIds?.includes(userId);
  const boards = s.boards.some(touches)
    ? s.boards.map((b) => (touches(b) ? { ...b, members: b.members?.filter((m) => m.userId !== userId), invitedGuestIds: b.invitedGuestIds?.filter((g) => g !== userId) } : b))
    : s.boards;
  return { teams, projects, boards };
}

const patchList = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => T)): T[] =>
  list.map((x) => (x.id === id ? (typeof patch === 'function' ? patch(x) : { ...x, ...patch }) : x));

/* ------------------------------ Convites (aceite) ------------------------------ */

/**
 * Pode aceitar este convite com este e-mail? (status, e-mail igual ao convite, domínio permitido,
 * convidados permitidos). Usado pelo modo local e pelo servidor antes de criar/entrar com a conta.
 */
export function validateInvitationAcceptance(s: WorkspaceRulesState, inv: Invitation | undefined, email: string, now: number): MessageDescriptor | null {
  if (!inv) return { key: 'workspace.errors.inviteNotFound' };
  const status = invitationStatus(inv, now);
  if (status === 'expired') return { key: 'workspace.errors.inviteExpired' };
  if (status === 'revoked') return { key: 'workspace.errors.inviteRevoked' };
  if (status === 'accepted') return { key: 'workspace.errors.inviteAccepted' };
  const normalized = email.trim().toLowerCase();
  if (normalized !== inv.email) return { key: 'workspace.errors.inviteEmailMismatch', params: { email: inv.email } };
  if (!memberEmailAllowed(normalized, inv.role, s.workspace)) return { key: 'workspace.errors.emailNotAllowedDomain', params: { domains: s.workspace.allowedEmailDomains.join(', ') } };
  if (inv.role === 'guest_b2b' && !policiesOfWorkspace(s.workspace).allowGuests) return { key: 'permissions.denied.guestsDisabled' };
  return null;
}

/** O que um convite (ou link geral) concede a quem entra. */
export interface AccessGrant {
  role: Exclude<WorkspaceRole, 'visitor'>;
  teamIds?: string[];
  projectId?: string;
  boardId?: string;
  boardRole?: BoardRole;
  /** null = ninguém convidou (cadastro pelo domínio, Chat 08.5 · C) */
  invitedBy: string | null;
}

export type NewAccount = { id: string; name: string; email: string; avatarColor: string; existing?: UserAccount };

/**
 * Chat 08.5: núcleo comum do aceite de convite e do link geral — participação, times, projeto (convidado) e ACL
 * do board. `account` = conta existente no diretório (precisa estar ativa) ou a nova (papel do que foi concedido).
 */
export function grantAccess(
  s: WorkspaceRulesState,
  grant: AccessGrant,
  account: NewAccount,
  env: RuleEnv,
  createdVia: NonNullable<UserAccount['createdVia']>,
): { ok: true; state: WorkspaceRulesState; entry: UserAccount } | RuleFailure {
  const prev = account.existing ?? s.directory.find((a) => a.id === account.id);
  if (prev && prev.status !== 'active') return err('workspace.errors.accountSuspended');
  const now = env.now;
  const inv = grant;
  const guestDays = policiesOfWorkspace(s.workspace).guestDefaultExpiryDays;
  const guestExpiresAt = inv.role === 'guest_b2b' && guestDays ? now + guestDays * DAY_MS : null;
  const entry: UserAccount = prev
    ? { ...prev, lastSeenAt: now }
    : {
        id: account.id,
        name: account.name,
        email: account.email,
        avatarColor: account.avatarColor,
        status: 'active',
        workspaceRole: inv.role,
        teamIds: [],
        authProvider: 'local',
        lastSeenAt: now,
        createdVia,
        createdAt: now,
        invitedBy: inv.invitedBy ?? undefined,
        guestExpiresAt,
      };
  const role = entry.workspaceRole;
  const boardRole: BoardRole = inv.boardRole ?? 'editor';
  const teamIds = role === 'guest_b2b' ? [] : (inv.teamIds ?? []).filter((id) => s.teams.some((tm) => tm.id === id && !tm.archivedAt));
  const directory = (prev ? s.directory.map((a) => (a.id === entry.id ? entry : a)) : [...s.directory, entry]).map((a) =>
    a.id === entry.id ? { ...a, teamIds: [...new Set([...a.teamIds, ...teamIds])] } : a,
  );
  const state: WorkspaceRulesState = {
    ...s,
    directory,
    teams: teamIds.length ? s.teams.map((tm) => (teamIds.includes(tm.id) && !tm.memberIds.includes(entry.id) ? { ...tm, memberIds: [...tm.memberIds, entry.id] } : tm)) : s.teams,
    projects:
      inv.projectId && role === 'guest_b2b'
        ? s.projects.map((p) =>
            p.id === inv.projectId ? { ...p, invitedGuestIds: [...new Set([...p.invitedGuestIds, entry.id])], guestRoles: { ...(p.guestRoles ?? {}), [entry.id]: boardRole } } : p,
          )
        : s.projects,
    boards: inv.boardId
      ? s.boards.map((b) =>
          b.id === inv.boardId
            ? {
                ...b,
                members: [...(b.members ?? []).filter((m) => m.userId !== entry.id), { boardId: b.id, userId: entry.id, role: boardRole, invitedBy: inv.invitedBy ?? entry.id, invitedAt: now, expiresAt: guestExpiresAt }],
              }
            : b,
        )
      : s.boards,
  };
  return { ok: true, state, entry };
}

/**
 * Aplica um convite já validado: participação, times, projeto (convidado) e ACL do board.
 * `account` = conta existente no diretório (precisa estar ativa) ou a nova (papel do convite).
 */
export function applyInvitationAcceptance(s: WorkspaceRulesState, inv: Invitation, account: NewAccount, env: RuleEnv): RuleResult {
  const g = grantAccess(s, { role: inv.role === 'visitor' ? 'member' : inv.role, teamIds: inv.teamIds, projectId: inv.projectId, boardId: inv.boardId, boardRole: inv.boardRole, invitedBy: inv.invitedBy }, account, env, 'invite');
  if (!g.ok) return g;
  const state: WorkspaceRulesState = { ...g.state, invitations: s.invitations.map((i) => (i.id === inv.id ? { ...i, acceptedAt: env.now, acceptedBy: g.entry.id } : i)) };
  return done(state, [{ action: 'member_joined', message: { key: 'workspace.audit.msg.memberJoined', params: { role: roleMsg(g.entry.workspaceRole) } }, meta: { actorId: g.entry.id, targetType: 'invitation', targetId: inv.id } }], { id: g.entry.id });
}

/* ------------------------------ Chat 08.5 · B: link de convite geral ------------------------------ */

export type InviteLinkStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

export function inviteLinkStatus(link: Pick<InviteLink, 'revokedAt' | 'expiresAt' | 'uses' | 'maxUses'>, now: number): InviteLinkStatus {
  if (link.revokedAt) return 'revoked';
  if (link.expiresAt <= now) return 'expired';
  if (link.uses >= link.maxUses) return 'exhausted';
  return 'active';
}

/** E-mail dentro do domínio do link (o próprio domínio ou um subdomínio). */
export function emailInLinkDomain(email: string, domain: string | null | undefined): boolean {
  if (!domain) return true;
  const d = emailDomain(email);
  return !!d && (d === domain || d.endsWith('.' + domain));
}

const LINK_STATUS_ERRORS: Record<Exclude<InviteLinkStatus, 'active'>, MessageDescriptor['key']> = {
  revoked: 'workspace.errors.inviteLinkRevoked',
  expired: 'workspace.errors.inviteLinkExpired',
  exhausted: 'workspace.errors.inviteLinkExhausted',
};

/**
 * O link ainda vale para este e-mail? (situação, domínio do link, domínio da organização para membros, política de
 * convidados). Não diz nada sobre contas: quem chama decide o que fazer com quem já tem conta.
 */
export function validateInviteLinkJoin(s: WorkspaceRulesState, link: InviteLink | undefined, email: string, now: number): MessageDescriptor | null {
  if (!link) return { key: 'workspace.errors.inviteLinkNotFound' };
  const status = inviteLinkStatus(link, now);
  if (status !== 'active') return { key: LINK_STATUS_ERRORS[status] };
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) return { key: 'common.enterValidEmailAddress' };
  if (!emailInLinkDomain(normalized, link.allowedDomain)) return { key: 'workspace.errors.inviteLinkDomainMismatch', params: { domain: link.allowedDomain ?? '' } };
  if (!memberEmailAllowed(normalized, link.role, s.workspace)) return { key: 'workspace.errors.emailNotAllowedDomain', params: { domains: s.workspace.allowedEmailDomains.join(', ') } };
  if (link.role === 'guest_b2b' && !policiesOfWorkspace(s.workspace).allowGuests) return { key: 'permissions.denied.guestsDisabled' };
  return null;
}

/** Conta NOVA entrando pelo link geral (e-mail já comprovado): concede o acesso e conta um uso. */
export function applyInviteLinkJoin(s: WorkspaceRulesState, link: InviteLink, account: NewAccount, env: RuleEnv): RuleResult {
  const g = grantAccess(s, { role: link.role, teamIds: link.teamIds, projectId: link.projectId, boardId: link.boardId, boardRole: link.boardRole, invitedBy: link.createdBy }, account, env, 'invite_link');
  if (!g.ok) return g;
  const state: WorkspaceRulesState = { ...g.state, inviteLinks: (s.inviteLinks ?? []).map((l) => (l.id === link.id ? { ...l, uses: l.uses + 1 } : l)) };
  return done(
    state,
    [{ action: 'invite_link_used', message: { key: 'workspace.audit.msg.inviteLinkUsed', params: { role: roleMsg(link.role) } }, meta: { actorId: g.entry.id, targetType: 'inviteLink', targetId: link.id } }],
    { id: g.entry.id },
  );
}

/* ---------------- Chat 08.5 · C: cadastro com o e-mail da organização ---------------- */

/** Domínio normalizado (minúsculas, sem ponto final, punycode) — a mesma regra do cadastro de domínios. */
export const asciiDomain = normalizeDomain;

/**
 * E-mail para o cadastro pelo domínio: o domínio é o que vem depois do ÚLTIMO "@" (um `"x@empresa.com"@fora.com`
 * é de fora.com). A parte local não pode ter "@" nem aspas (endereços exóticos ficam de fora, sem erro visível).
 * Devolve o e-mail normalizado (minúsculas, domínio em ASCII) ou null.
 */
export function parseSignupEmail(raw: string): { email: string; domain: string } | null {
  const value = raw.trim();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at).toLowerCase();
  if (/[@"\s<>()[\],;:\\]/.test(local) || local.length > 64) return null;
  const domain = asciiDomain(value.slice(at + 1));
  if (!domain) return null;
  const email = `${local}@${domain}`;
  return email.length <= 254 && isValidEmail(email) ? { email, domain } : null;
}

/** O domínio está EXATAMENTE na lista da organização (subdomínio não vale para o cadastro aberto). */
export function signupDomainAllowed(domain: string, allowedDomains: readonly string[]): boolean {
  return !!domain && allowedDomains.some((d) => asciiDomain(d) === domain);
}

/** Conta NOVA pelo cadastro com o e-mail da organização: sempre membro, sem time, sem convite. */
export function applyDomainSignup(s: WorkspaceRulesState, account: NewAccount, env: RuleEnv): RuleResult {
  if (!policiesOfWorkspace(s.workspace).allowDomainSignup) return err('workspace.errors.domainSignupOff');
  const parsed = parseSignupEmail(account.email);
  if (!parsed || parsed.email !== account.email || !signupDomainAllowed(parsed.domain, s.workspace.allowedEmailDomains)) {
    return err('workspace.errors.emailNotAllowedDomain', { domains: s.workspace.allowedEmailDomains.join(', ') });
  }
  if (account.existing || s.directory.some((a) => a.email === account.email && a.status !== 'removed')) return err('workspace.errors.accountSuspended');
  const g = grantAccess(s, { role: 'member', teamIds: [], invitedBy: null }, account, env, 'signup');
  if (!g.ok) return g;
  return done(
    g.state,
    [{ action: 'domain_signup', message: { key: 'workspace.audit.msg.domainSignup', params: { domain: parsed.domain } }, meta: { actorId: g.entry.id, targetType: 'user', targetId: g.entry.id } }],
    { id: g.entry.id },
  );
}

/* ------------------------------ Ações ------------------------------ */

export function applyWorkspaceOp(s: WorkspaceRulesState, op: WorkspaceOp, actor: RuleActor, env: RuleEnv): RuleResult {
  const now = env.now;
  const policies = policiesOfWorkspace(s.workspace);
  const boardById = (id: string) => s.boards.find((b) => b.id === id);
  const accountById = (id: string) => s.directory.find((a) => a.id === id);
  const membersCtx = () => workspaceContext(actor.viewer, policies);

  switch (op.type) {
    /* ---------------- Organização e políticas ---------------- */
    case 'updateWorkspace': {
      const d = checkWs(s, actor, 'workspace.policies.manage');
      if (d) return d;
      const cur = s.workspace;
      const name = op.patch.name !== undefined ? op.patch.name.trim() : cur.name;
      if (!name) return err('workspace.errors.nameRequired');
      const domains = op.patch.allowedEmailDomains !== undefined ? [...new Set(op.patch.allowedEmailDomains.map(normalizeDomain).filter(Boolean))] : cur.allowedEmailDomains;
      const next: WorkspaceEntity = { ...cur, name, slug: slugify(name) || cur.slug, allowedEmailDomains: domains, requireDomainForMembers: op.patch.requireDomainForMembers ?? cur.requireDomainForMembers };
      const changes: AuditChange[] = [];
      if (next.name !== cur.name) changes.push({ field: 'name', before: cur.name, after: next.name });
      if (next.allowedEmailDomains.join(',') !== cur.allowedEmailDomains.join(',')) changes.push({ field: 'allowedEmailDomains', before: policyValue(cur.allowedEmailDomains), after: policyValue(next.allowedEmailDomains) });
      if (next.requireDomainForMembers !== cur.requireDomainForMembers) changes.push({ field: 'requireDomainForMembers', before: cur.requireDomainForMembers, after: next.requireDomainForMembers });
      if (!changes.length) return done(s);
      return done({ ...s, workspace: next }, [
        { action: 'workspace_updated', message: { key: 'workspace.audit.msg.workspaceUpdated', params: { count: changes.length } }, meta: { targetType: 'workspace', targetId: next.id, targetName: next.name, changes } },
      ]);
    }

    case 'updatePolicies': {
      const d = checkWs(s, actor, 'workspace.policies.manage');
      if (d) return d;
      const cur = policies;
      const next: WorkspacePolicies = { ...cur, ...op.patch };
      next.trashRetentionDays = Math.max(1, Math.round(next.trashRetentionDays));
      next.snapshotRetentionDays = Math.max(1, Math.round(next.snapshotRetentionDays));
      next.autoSnapshotIntervalMin = Math.max(1, Math.round(next.autoSnapshotIntervalMin));
      if (next.maxPublicLinkLifetimeDays !== null) next.maxPublicLinkLifetimeDays = Math.max(1, Math.round(next.maxPublicLinkLifetimeDays));
      if (next.guestDefaultExpiryDays !== null) next.guestDefaultExpiryDays = Math.max(1, Math.round(next.guestDefaultExpiryDays));
      const changes: AuditChange[] = (Object.keys(next) as (keyof WorkspacePolicies)[])
        .filter((k) => policyValue(cur[k]) !== policyValue(next[k]))
        .map((k) => ({ field: k, before: policyValue(cur[k]), after: policyValue(next[k]) }));
      if (!changes.length) return done(s);
      return done({ ...s, workspace: { ...s.workspace, policies: next } }, [
        { action: 'policy_changed', message: { key: 'workspace.audit.msg.policyChanged', params: { count: changes.length } }, meta: { targetType: 'policy', targetId: s.workspace.id, changes } },
      ]);
    }

    /* ---------------- Times ---------------- */
    case 'createTeam': {
      const d = checkWs(s, actor, 'workspace.teams.manage');
      if (d) return d;
      const clean = op.input.name.trim();
      if (!clean) return err('workspace.errors.nameRequired');
      const internal = new Set(s.directory.filter((a) => a.workspaceRole === 'admin' || a.workspaceRole === 'member').map((a) => a.id));
      const members = [...new Set(op.input.memberIds ?? [actor.actorId])].filter((id) => internal.has(id));
      const team: TeamEntity = {
        id: env.newId(),
        workspaceId: s.workspace.id,
        name: clean,
        description: op.input.description?.trim() || undefined,
        color: op.input.color ?? TEAM_COLORS[s.teams.length % TEAM_COLORS.length],
        memberIds: members,
        createdAt: now,
      };
      return done(
        {
          ...s,
          teams: [...s.teams, team],
          directory: s.directory.map((a) => (members.includes(a.id) ? { ...a, teamIds: [...new Set([...a.teamIds, team.id])] } : a)),
        },
        [{ action: 'team_created', message: { key: 'workspace.audit.msg.teamCreated', params: { name: team.name } }, meta: { targetType: 'team', targetId: team.id, targetName: team.name } }],
        { id: team.id },
      );
    }

    case 'updateTeam': {
      const d = checkWs(s, actor, 'workspace.teams.manage');
      if (d) return d;
      const team = s.teams.find((x) => x.id === op.id);
      if (!team) return err('workspace.errors.teamNotFound');
      const name = op.patch.name !== undefined ? op.patch.name.trim() : team.name;
      if (!name) return err('workspace.errors.nameRequired');
      const next: TeamEntity = { ...team, name, description: op.patch.description !== undefined ? op.patch.description.trim() || undefined : team.description, color: op.patch.color ?? team.color };
      const changes: AuditChange[] = [];
      if (next.name !== team.name) changes.push({ field: 'name', before: team.name, after: next.name });
      if ((next.description ?? null) !== (team.description ?? null)) changes.push({ field: 'description', before: team.description ?? null, after: next.description ?? null });
      if (next.color !== team.color) changes.push({ field: 'color', before: team.color, after: next.color });
      if (!changes.length) return done(s, [], { id: op.id });
      const teams = patchList(s.teams, op.id, next);
      const after = { ...s, teams };
      const boards = next.name !== team.name ? s.boards.map((b) => (b.teamId === op.id ? { ...b, ...legacyPlaceText({ kind: 'team', teamId: op.id, projectId: b.projectId }, after) } : b)) : s.boards;
      return done({ ...after, boards }, [{ action: 'team_updated', message: { key: 'workspace.audit.msg.teamUpdated', params: { name: next.name } }, meta: { targetType: 'team', targetId: op.id, targetName: next.name, changes } }], { id: op.id });
    }

    case 'setTeamArchived': {
      const d = checkWs(s, actor, 'workspace.teams.manage');
      if (d) return d;
      const team = s.teams.find((x) => x.id === op.id);
      if (!team) return err('workspace.errors.teamNotFound');
      if (!!team.archivedAt === op.archived) return done(s, [], { id: op.id });
      return done(
        { ...s, teams: patchList(s.teams, op.id, { archivedAt: op.archived ? now : null }) },
        [{ action: 'team_archived', message: { key: op.archived ? 'workspace.audit.msg.teamArchived' : 'workspace.audit.msg.teamUnarchived', params: { name: team.name } }, meta: { targetType: 'team', targetId: op.id, targetName: team.name } }],
        { id: op.id },
      );
    }

    case 'setTeamMembers': {
      const d = checkWs(s, actor, 'workspace.teams.manage');
      if (d) return d;
      const team = s.teams.find((x) => x.id === op.id);
      if (!team) return err('workspace.errors.teamNotFound');
      // convidados B2B não entram em times (só em projetos/boards)
      const internal = new Set(s.directory.filter((a) => a.status !== 'removed' && (a.workspaceRole === 'admin' || a.workspaceRole === 'member')).map((a) => a.id));
      const members = [...new Set(op.memberIds)].filter((m) => internal.has(m));
      return done(
        {
          ...s,
          teams: patchList(s.teams, op.id, { memberIds: members }),
          directory: s.directory.map((a) => {
            const inTeam = members.includes(a.id);
            const had = a.teamIds.includes(op.id);
            if (inTeam === had) return a;
            return { ...a, teamIds: inTeam ? [...a.teamIds, op.id] : a.teamIds.filter((x) => x !== op.id) };
          }),
        },
        [
          {
            action: 'team_updated',
            message: { key: 'workspace.audit.msg.teamMembersChanged', params: { name: team.name, count: members.length } },
            meta: { targetType: 'team', targetId: op.id, targetName: team.name, changes: [{ field: 'memberIds', before: team.memberIds.join(', '), after: members.join(', ') }] },
          },
        ],
        { id: op.id },
      );
    }

    /* ---------------- Projetos ---------------- */
    case 'createProject': {
      const d = checkWs(s, actor, 'workspace.projects.create');
      if (d) return d;
      const team = s.teams.find((x) => x.id === op.input.teamId && !x.archivedAt);
      if (!team) return err('workspace.errors.teamNotFound');
      if (!canUsePlace(actor.viewer, { kind: 'team', teamId: team.id }, s.teams, s.projects)) return err('workspace.errors.placeNotAllowed');
      const clean = op.input.name.trim();
      if (!clean) return err('workspace.errors.nameRequired');
      const project: ProjectFolder = { id: env.newId(), workspaceId: s.workspace.id, teamId: team.id, name: clean, description: op.input.description?.trim() || undefined, invitedGuestIds: [], createdAt: now };
      return done(
        { ...s, projects: [...s.projects, project] },
        [{ action: 'project_created', message: { key: 'workspace.audit.msg.projectCreated', params: { name: project.name, team: team.name } }, meta: { targetType: 'project', targetId: project.id, targetName: project.name } }],
        { id: project.id },
      );
    }

    case 'updateProject': {
      const project = s.projects.find((p) => p.id === op.id);
      if (!project) return err('workspace.errors.projectNotFound');
      // renomear: admin, ou quem pode criar projetos e participa do time
      const manage = checkWs(s, actor, 'workspace.teams.manage');
      if (manage) {
        const create = checkWs(s, actor, 'workspace.projects.create');
        if (create) return create;
        if (!canUsePlace(actor.viewer, { kind: 'team', teamId: project.teamId }, s.teams, s.projects)) return err('workspace.errors.placeNotAllowed');
      }
      const name = op.patch.name !== undefined ? op.patch.name.trim() : project.name;
      if (!name) return err('workspace.errors.nameRequired');
      const next: ProjectFolder = { ...project, name, description: op.patch.description !== undefined ? op.patch.description.trim() || undefined : project.description };
      const changes: AuditChange[] = [];
      if (next.name !== project.name) changes.push({ field: 'name', before: project.name, after: next.name });
      if ((next.description ?? null) !== (project.description ?? null)) changes.push({ field: 'description', before: project.description ?? null, after: next.description ?? null });
      if (!changes.length) return done(s, [], { id: op.id });
      const after = { ...s, projects: patchList(s.projects, op.id, next) };
      const boards = next.name !== project.name ? s.boards.map((b) => (b.projectId === op.id ? { ...b, ...legacyPlaceText({ kind: 'team', teamId: project.teamId, projectId: op.id }, after) } : b)) : s.boards;
      return done({ ...after, boards }, [{ action: 'project_updated', message: { key: 'workspace.audit.msg.projectUpdated', params: { name: next.name } }, meta: { targetType: 'project', targetId: op.id, targetName: next.name, changes } }], { id: op.id });
    }

    case 'setProjectArchived': {
      const d = checkWs(s, actor, 'workspace.teams.manage');
      if (d) return d;
      const project = s.projects.find((p) => p.id === op.id);
      if (!project) return err('workspace.errors.projectNotFound');
      if (!!project.archivedAt === op.archived) return done(s, [], { id: op.id });
      return done(
        { ...s, projects: patchList(s.projects, op.id, { archivedAt: op.archived ? now : null }) },
        [{ action: 'project_archived', message: { key: op.archived ? 'workspace.audit.msg.projectArchived' : 'workspace.audit.msg.projectUnarchived', params: { name: project.name } }, meta: { targetType: 'project', targetId: op.id, targetName: project.name } }],
        { id: op.id },
      );
    }

    case 'moveProject': {
      const d = checkWs(s, actor, 'workspace.teams.manage');
      if (d) return d;
      const project = s.projects.find((p) => p.id === op.id);
      if (!project) return err('workspace.errors.projectNotFound');
      const team = s.teams.find((x) => x.id === op.teamId && !x.archivedAt);
      if (!team) return err('workspace.errors.teamNotFound');
      if (project.teamId === op.teamId) return done(s, [], { id: op.id });
      const projects = patchList(s.projects, op.id, { teamId: op.teamId });
      const view = { ...s, projects };
      return done(
        { ...view, boards: s.boards.map((b) => (b.projectId === op.id ? { ...b, teamId: op.teamId, ...legacyPlaceText({ kind: 'team', teamId: op.teamId, projectId: op.id }, view) } : b)) },
        [
          {
            action: 'project_updated',
            message: { key: 'workspace.audit.msg.projectMoved', params: { name: project.name, team: team.name } },
            meta: { targetType: 'project', targetId: op.id, targetName: project.name, changes: [{ field: 'teamId', before: project.teamId, after: op.teamId }] },
          },
        ],
        { id: op.id },
      );
    }

    /* ---------------- Boards: lugar, lixeira ---------------- */
    case 'moveBoard': {
      const meta = boardById(op.boardId);
      if (!meta || meta.deletedAt) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.move');
      if (d) return d;
      if (!canUsePlace(actor.viewer, op.place, s.teams, s.projects)) return err('workspace.errors.placeNotAllowed');
      return done(
        { ...s, boards: patchList(s.boards, op.boardId, { ...placeFields(op.place, s.workspace.id), ...legacyPlaceText(op.place, s), updatedAt: now }) },
        [{ action: 'board_moved', message: { key: 'workspace.audit.msg.boardMoved', params: { name: meta.name, place: placeParam(op.place, s) } }, meta: { targetType: 'board', targetId: op.boardId, targetName: meta.name } }],
        { id: op.boardId },
      );
    }

    case 'restoreBoard': {
      const meta = boardById(op.id);
      if (!meta || !meta.deletedAt) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.delete') && checkWs(s, actor, 'workspace.trash.manage');
      if (d) return d;
      return done(
        { ...s, boards: patchList(s.boards, op.id, { deletedAt: null, deletedBy: null, updatedAt: now }) },
        [{ action: 'board_restored', message: { key: 'workspace.audit.msg.boardRestored', params: { name: meta.name } }, meta: { targetType: 'board', targetId: op.id, targetName: meta.name } }],
        { id: op.id },
      );
    }

    case 'purgeBoard': {
      const meta = boardById(op.id);
      if (!meta || !meta.deletedAt) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.delete') && checkWs(s, actor, 'workspace.trash.manage');
      if (d) return d;
      return done(
        { ...s, boards: s.boards.filter((b) => b.id !== op.id) },
        [{ action: 'board_purged', message: { key: 'workspace.audit.msg.boardPurged', params: { name: meta.name } }, meta: { targetType: 'board', targetId: op.id, targetName: meta.name } }],
        { id: op.id, purgedBoardIds: [op.id] },
      );
    }

    case 'emptyTrash': {
      const d = checkWs(s, actor, 'workspace.trash.manage');
      if (d) return d;
      const ids = s.boards.filter((b) => b.deletedAt).map((b) => b.id);
      if (!ids.length) return done(s);
      const gone = new Set(ids);
      return done(
        { ...s, boards: s.boards.filter((b) => !gone.has(b.id)) },
        [{ action: 'trash_emptied', message: { key: 'workspace.audit.msg.trashEmptied', params: { count: ids.length } }, meta: { targetType: 'board', count: ids.length } }],
        { purgedBoardIds: ids },
      );
    }

    /* ---------------- Contas (sempre com a proteção do último administrador) ---------------- */
    case 'setAccountRole': {
      const d = explainAccountChange(membersCtx(), membershipAccounts(s.directory, s.workspace.id), op.id, 'role', op.role);
      if (!d.allowed) return denied(d);
      const acc = accountById(op.id);
      if (!acc || acc.status === 'removed') return err('permissions.denied.accountNotFound');
      if (acc.workspaceRole === op.role) return done(s, [], { id: op.id });
      if (!memberEmailAllowed(acc.email, op.role, s.workspace)) return err('workspace.errors.emailNotAllowedDomain', { domains: s.workspace.allowedEmailDomains.join(', ') });
      const directory = patchList(s.directory, op.id, { workspaceRole: op.role, ...(op.role === 'guest_b2b' ? { teamIds: [] } : { guestExpiresAt: null }) });
      // convidado B2B não fica em times
      const teams = op.role === 'guest_b2b' ? s.teams.map((tm) => (tm.memberIds.includes(op.id) ? { ...tm, memberIds: tm.memberIds.filter((m) => m !== op.id) } : tm)) : s.teams;
      return done(
        { ...s, directory, teams },
        [{ action: 'role_changed', message: { key: 'workspace.audit.msg.roleChanged', params: { role: roleMsg(op.role) } }, meta: { targetType: 'user', targetId: op.id, changes: [{ field: 'workspaceRole', before: acc.workspaceRole, after: op.role }] } }],
        { id: op.id },
      );
    }

    case 'suspendAccount': {
      const d = explainAccountChange(membersCtx(), membershipAccounts(s.directory, s.workspace.id), op.id, 'suspend');
      if (!d.allowed) return denied(d);
      const acc = accountById(op.id);
      if (!acc || acc.status !== 'active') return done(s, [], { id: op.id });
      return done({ ...s, directory: patchList(s.directory, op.id, { status: 'suspended', deactivatedAt: now }) }, [
        { action: 'member_suspended', message: { key: 'workspace.audit.msg.memberSuspended' }, meta: { targetType: 'user', targetId: op.id } },
      ], { id: op.id });
    }

    case 'reactivateAccount': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const acc = accountById(op.id);
      if (!acc) return err('permissions.denied.accountNotFound');
      if (acc.status === 'removed') return err('workspace.errors.accountRemoved');
      if (acc.status === 'active') return done(s, [], { id: op.id });
      return done({ ...s, directory: patchList(s.directory, op.id, { status: 'active', deactivatedAt: null }) }, [
        { action: 'member_reactivated', message: { key: 'workspace.audit.msg.memberReactivated' }, meta: { targetType: 'user', targetId: op.id } },
      ], { id: op.id });
    }

    case 'removeAccount': {
      const d = explainAccountChange(membersCtx(), membershipAccounts(s.directory, s.workspace.id), op.id, 'remove');
      if (!d.allowed) return denied(d);
      const acc = accountById(op.id);
      if (!acc || acc.status === 'removed') return done(s, [], { id: op.id });
      const owned = s.boards.filter((b) => b.ownerId === op.id && !b.deletedAt).length;
      if (owned > 0) return err('workspace.errors.ownsBoards', { count: owned });
      const grants = stripGrants(s, op.id);
      return done(
        {
          ...s,
          ...grants,
          directory: s.directory.map((a) =>
            a.id === op.id
              ? {
                  ...a,
                  // dado anonimizado (LGPD): o id continua no Audit Log, o nome e o e-mail não
                  name: env.anonymizedName(op.id),
                  email: `removed-${op.id}@removed.invalid`,
                  avatarColor: '#8A8F98',
                  status: 'removed',
                  teamIds: [],
                  anonymizedAt: now,
                  deactivatedAt: a.deactivatedAt ?? now,
                }
              : a,
          ),
        },
        [{ action: 'member_anonymized', message: { key: 'workspace.audit.msg.memberRemoved' }, meta: { targetType: 'user', targetId: op.id } }],
        { id: op.id },
      );
    }

    /* ---------------- Convites ---------------- */
    case 'createInvitation': {
      const input = op.input;
      const email = input.email.trim().toLowerCase();
      const role = input.role;
      const d = role === 'guest_b2b' ? checkWs(s, actor, 'workspace.guests.invite') : role === 'admin' ? checkWs(s, actor, 'workspace.members.manage') : checkWs(s, actor, 'workspace.members.invite');
      if (d) return d;
      if (!isValidEmail(email)) return err('common.enterValidEmailAddress');
      if (!memberEmailAllowed(email, role, s.workspace)) return err('workspace.errors.emailNotAllowedDomain', { domains: s.workspace.allowedEmailDomains.join(', ') });
      if (role === 'guest_b2b' && !input.projectId && !input.boardId) return err('workspace.errors.guestScopeRequired');
      const existing = s.directory.find((a) => a.email === email && a.status !== 'removed');
      if (existing && role !== 'guest_b2b' && !input.boardId && !input.projectId) return err('common.useAppStore.thatPersonAlreadyMember');
      if (s.invitations.some((i) => i.email === email && invitationStatus(i, now) === 'pending' && (i.boardId ?? null) === (input.boardId ?? null) && (i.projectId ?? null) === (input.projectId ?? null))) {
        return err('common.useAppStore.theresAlreadyPendingInvitationThat');
      }
      let teamIds = (input.teamIds ?? []).filter((id) => s.teams.some((tm) => tm.id === id && !tm.archivedAt));
      // membro só convida para os próprios times; convidado B2B não entra em times
      if (role === 'guest_b2b') teamIds = [];
      else if (actor.viewer.workspaceRole !== 'admin') teamIds = teamIds.filter((id) => actor.viewer.teamIds.includes(id));
      if (input.projectId) {
        const project = s.projects.find((p) => p.id === input.projectId && !p.archivedAt);
        if (!project) return err('workspace.errors.projectNotFound');
        // Chat 08.7 · R1 (S-26): só convida para um projeto quem alcança o time dele (admin alcança todos)
        if (!canUsePlace(actor.viewer, { kind: 'team', teamId: project.teamId, projectId: project.id }, s.teams, s.projects)) return err('workspace.errors.placeNotAllowed');
      }
      if (input.boardId) {
        const meta = boardById(input.boardId);
        if (!meta || meta.deletedAt) return err('workspace.errors.boardNotFound');
        const share = checkBoard(s, actor, meta, 'board.share');
        if (share) return share;
      }
      const days = Math.max(1, Math.round(input.expiresInDays));
      const inv: Invitation = {
        id: env.newId(),
        workspaceId: s.workspace.id,
        email,
        role,
        teamIds: teamIds.length ? teamIds : undefined,
        projectId: input.projectId,
        boardId: input.boardId,
        boardRole: input.boardRole,
        token: env.newToken(),
        invitedBy: actor.actorId,
        createdAt: now,
        expiresAt: now + days * DAY_MS,
      };
      const target = input.boardId ? boardById(input.boardId) : undefined;
      return done(
        { ...s, invitations: [inv, ...s.invitations] },
        [
          {
            action: role === 'guest_b2b' ? 'guest_invited' : 'member_invited',
            message: { key: 'workspace.audit.msg.invitationCreated', params: { role: roleMsg(role), count: days } },
            meta: { targetType: 'invitation', targetId: inv.id, targetName: target?.name ?? (input.projectId ? s.projects.find((p) => p.id === input.projectId)?.name : undefined) },
          },
        ],
        { id: inv.id, token: inv.token },
      );
    }

    case 'revokeInvitation': {
      const inv = s.invitations.find((i) => i.id === op.id);
      if (!inv) return err('workspace.errors.inviteNotFound');
      if (inv.invitedBy !== actor.actorId || actor.simulating) {
        const d = checkWs(s, actor, 'workspace.members.manage');
        if (d) return d;
      }
      if (invitationStatus(inv, now) !== 'pending') return done(s, [], { id: op.id });
      return done({ ...s, invitations: patchList(s.invitations, op.id, { revokedAt: now }) }, [
        { action: 'invitation_revoked', message: { key: 'workspace.audit.msg.invitationRevoked', params: { role: roleMsg(inv.role) } }, meta: { targetType: 'invitation', targetId: op.id } },
      ], { id: op.id });
    }

    case 'extendGuest': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const acc = accountById(op.userId);
      if (!acc || acc.workspaceRole !== 'guest_b2b' || acc.status === 'removed') return err('permissions.denied.accountNotFound');
      const days = Math.max(1, Math.round(op.days));
      const until = Math.max(now, acc.guestExpiresAt ?? 0) + days * DAY_MS;
      const boards = s.boards.map((b) => (b.members?.some((m) => m.userId === op.userId && m.expiresAt) ? { ...b, members: b.members.map((m) => (m.userId === op.userId && m.expiresAt ? { ...m, expiresAt: until } : m)) } : b));
      return done({ ...s, directory: patchList(s.directory, op.userId, { guestExpiresAt: until }), boards }, [
        { action: 'guest_invited', message: { key: 'workspace.audit.msg.guestExtended', params: { count: days } }, meta: { targetType: 'user', targetId: op.userId, changes: [{ field: 'guestExpiresAt', before: acc.guestExpiresAt ?? null, after: until }] } },
      ], { id: op.userId });
    }

    case 'revokeGuest': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const acc = accountById(op.userId);
      if (!acc || acc.workspaceRole !== 'guest_b2b') return err('permissions.denied.accountNotFound');
      return done(
        { ...s, ...stripGrants(s, op.userId), directory: s.directory.map((a) => (a.id === op.userId && a.status === 'active' ? { ...a, status: 'suspended', deactivatedAt: now } : a)) },
        [{ action: 'guest_revoked', message: { key: 'workspace.audit.msg.guestRevoked' }, meta: { targetType: 'user', targetId: op.userId } }],
        { id: op.userId },
      );
    }

    /* ---------------- ACL e link público ---------------- */
    case 'setBoardMember': {
      const meta = boardById(op.boardId);
      if (!meta || meta.deletedAt) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.share');
      if (d) return d;
      const target = accountById(op.userId);
      if (!target || target.status !== 'active') return err('permissions.denied.accountNotFound');
      if (target.id === meta.ownerId) return err('workspace.errors.alreadyOwner');
      if (target.workspaceRole === 'guest_b2b') {
        const g = checkWs(s, actor, 'workspace.guests.invite');
        if (g) return g;
      }
      const guestDays = policies.guestDefaultExpiryDays;
      const exp = op.expiresAt !== undefined ? op.expiresAt : target.workspaceRole === 'guest_b2b' && guestDays ? now + guestDays * DAY_MS : null;
      const prev = meta.members?.find((m) => m.userId === op.userId);
      return done(
        {
          ...s,
          boards: patchList(s.boards, op.boardId, (b) => ({
            ...b,
            members: [...(b.members ?? []).filter((m) => m.userId !== op.userId), { boardId: op.boardId, userId: op.userId, role: op.role, invitedBy: prev?.invitedBy ?? actor.actorId, invitedAt: prev?.invitedAt ?? now, expiresAt: exp }],
          })),
        },
        [
          {
            action: 'board_access_changed',
            message: { key: 'workspace.audit.msg.boardMemberSet', params: { name: meta.name, role: boardRoleMsg(op.role), memberUser: op.userId } },
            meta: { targetType: 'board', targetId: op.boardId, targetName: meta.name, changes: [{ field: `members.${op.userId}`, before: prev?.role ?? null, after: op.role }] },
          },
        ],
        { id: op.boardId },
      );
    }

    case 'removeBoardMember': {
      const meta = boardById(op.boardId);
      if (!meta) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.share');
      if (d) return d;
      const prev = meta.members?.find((m) => m.userId === op.userId);
      const invited = meta.invitedGuestIds?.includes(op.userId);
      if (!prev && !invited) return done(s, [], { id: op.boardId });
      return done(
        { ...s, boards: patchList(s.boards, op.boardId, (b) => ({ ...b, members: b.members?.filter((m) => m.userId !== op.userId), invitedGuestIds: b.invitedGuestIds?.filter((g) => g !== op.userId) })) },
        [
          {
            action: 'board_access_changed',
            message: { key: 'workspace.audit.msg.boardMemberRemoved', params: { name: meta.name, memberUser: op.userId } },
            meta: { targetType: 'board', targetId: op.boardId, targetName: meta.name, changes: [{ field: `members.${op.userId}`, before: prev?.role ?? null, after: null }] },
          },
        ],
        { id: op.boardId },
      );
    }

    case 'setPublicLink': {
      const meta = boardById(op.boardId);
      if (!meta || meta.deletedAt) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.publicLink');
      if (d) return d;
      const patch = op.patch;
      const cur: PublicShareLink = meta.publicLink ?? { enabled: false, token: env.newToken(), accessLevel: 'viewer', createdAt: now, createdBy: actor.actorId };
      const next: PublicShareLink = { ...cur };
      if (patch.accessLevel) next.accessLevel = patch.accessLevel;
      if (patch.lifetime) {
        const choice = allowedLinkLifetimes(policies).find((l) => l.id === patch.lifetime);
        if (!choice) return err('workspace.errors.lifetimeNotAllowed', { days: policies.maxPublicLinkLifetimeDays ?? 0 });
        // prazo novo conta a partir de agora (o teto da política também)
        next.createdAt = now;
        next.expiresAt = choice.ms === null ? null : now + choice.ms;
      }
      if (patch.passwordHash !== undefined) next.passwordHash = patch.passwordHash;
      if (patch.allowDownload !== undefined) {
        if (patch.allowDownload === null) delete next.allowDownload;
        else next.allowDownload = patch.allowDownload;
      }
      if (patch.enabled !== undefined) {
        next.enabled = patch.enabled;
        if (patch.enabled) next.revokedAt = null;
      }
      if (next.enabled && policies.requirePasswordOnPublicLinks && !next.passwordHash) return err('workspace.errors.passwordRequired');
      // primeiro uso com teto de prazo: começa no maior prazo permitido
      if (next.enabled && !cur.enabled && !patch.lifetime && next.expiresAt == null && policies.maxPublicLinkLifetimeDays != null) {
        const allowedList = allowedLinkLifetimes(policies);
        const longest = allowedList[allowedList.length - 1];
        next.createdAt = now;
        next.expiresAt = longest?.ms ? now + longest.ms : now + policies.maxPublicLinkLifetimeDays * DAY_MS;
      }
      const created = next.enabled && !cur.enabled;
      const changes: AuditChange[] = [];
      if (cur.enabled !== next.enabled) changes.push({ field: 'enabled', before: cur.enabled, after: next.enabled });
      if (cur.accessLevel !== next.accessLevel) changes.push({ field: 'accessLevel', before: cur.accessLevel, after: next.accessLevel });
      if ((cur.expiresAt ?? null) !== (next.expiresAt ?? null)) changes.push({ field: 'expiresAt', before: cur.expiresAt ?? null, after: next.expiresAt ?? null });
      if (!!cur.passwordHash !== !!next.passwordHash || typeof patch.passwordHash === 'string') changes.push({ field: 'password', before: !!cur.passwordHash, after: !!next.passwordHash });
      if ((cur.allowDownload ?? null) !== (next.allowDownload ?? null)) changes.push({ field: 'allowDownload', before: cur.allowDownload ?? null, after: next.allowDownload ?? null });
      const audit: AuditDraft[] = created
        ? [{ action: 'public_link_created', message: { key: 'workspace.audit.msg.publicLinkCreated', params: { name: meta.name, level: boardRoleMsg(next.accessLevel) } }, meta: { targetType: 'link', targetId: op.boardId, targetName: meta.name, changes } }]
        : changes.length
          ? [{ action: 'board_access_changed', message: { key: 'workspace.audit.msg.publicLinkUpdated', params: { name: meta.name } }, meta: { targetType: 'link', targetId: op.boardId, targetName: meta.name, changes } }]
          : [];
      return done({ ...s, boards: patchList(s.boards, op.boardId, { publicLink: next }) }, audit, { id: op.boardId });
    }

    case 'revokePublicLink': {
      const meta = boardById(op.boardId);
      if (!meta?.publicLink) return err('workspace.errors.boardNotFound');
      // revogar continua possível com a política desligada (só exige poder compartilhar)
      const d = checkBoard(s, actor, meta, 'board.share');
      if (d) return d;
      if (meta.publicLink.revokedAt && !meta.publicLink.enabled) return done(s, [], { id: op.boardId });
      return done({ ...s, boards: patchList(s.boards, op.boardId, { publicLink: { ...meta.publicLink, enabled: false, revokedAt: now } }) }, [
        { action: 'public_link_revoked', message: { key: 'workspace.audit.msg.publicLinkRevoked', params: { name: meta.name } }, meta: { targetType: 'link', targetId: op.boardId, targetName: meta.name } },
      ], { id: op.boardId });
    }

    case 'regeneratePublicLink': {
      const meta = boardById(op.boardId);
      if (!meta?.publicLink) return err('workspace.errors.boardNotFound');
      const d = checkBoard(s, actor, meta, 'board.publicLink');
      if (d) return d;
      // a senha é ligada ao token: um link novo começa sem senha (e desligado se a política exigir senha)
      const mustDisable = policies.requirePasswordOnPublicLinks;
      return done(
        {
          ...s,
          boards: patchList(s.boards, op.boardId, {
            publicLink: { ...meta.publicLink, token: env.newToken(), createdAt: now, createdBy: actor.actorId, revokedAt: null, passwordHash: null, lastUsedAt: null, enabled: mustDisable ? false : meta.publicLink.enabled },
          }),
        },
        [{ action: 'board_access_changed', message: { key: 'workspace.audit.msg.publicLinkRegenerated', params: { name: meta.name } }, meta: { targetType: 'link', targetId: op.boardId, targetName: meta.name } }],
        { id: op.boardId },
      );
    }

    /* ---------------- Transferência de propriedade ---------------- */
    /* ---------------- Chat 08.5 · B: links de convite gerais ---------------- */
    case 'createInviteLink': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const input = op.input;
      // papel fixo: só membro ou convidado (administrador só por convite direto)
      if (input.role !== 'member' && input.role !== 'guest_b2b') return err('workspace.errors.inviteLinkAdminRole');
      if (input.role === 'guest_b2b') {
        if (!policies.allowGuests) return err('permissions.denied.guestsDisabled');
        if (!input.projectId && !input.boardId) return err('workspace.errors.guestScopeRequired');
      }
      const links = s.inviteLinks ?? [];
      if (links.filter((l) => inviteLinkStatus(l, now) === 'active').length >= INVITE_LINK_LIMITS.maxActive) return err('workspace.errors.inviteLinkLimit', { count: INVITE_LINK_LIMITS.maxActive });
      let domain: string | null = null;
      if (input.allowedDomain) {
        domain = normalizeDomain(input.allowedDomain);
        if (!domain) return err('workspace.errors.inviteLinkDomain');
        // membros com domínio exigido: o domínio do link precisa estar entre os da organização
        if (input.role === 'member' && s.workspace.requireDomainForMembers && !memberEmailAllowed(`x@${domain}`, 'member', s.workspace)) {
          return err('workspace.errors.emailNotAllowedDomain', { domains: s.workspace.allowedEmailDomains.join(', ') });
        }
      }
      const teamIds = input.role === 'guest_b2b' ? [] : (input.teamIds ?? []).filter((id) => s.teams.some((tm) => tm.id === id && !tm.archivedAt));
      if (input.projectId) {
        const project = s.projects.find((p) => p.id === input.projectId && !p.archivedAt);
        if (!project) return err('workspace.errors.projectNotFound');
        // Chat 08.7 · R1 (S-26): mesma regra do convite direto (hoje só admin chega aqui, que alcança todos os times)
        if (!canUsePlace(actor.viewer, { kind: 'team', teamId: project.teamId, projectId: project.id }, s.teams, s.projects)) return err('workspace.errors.placeNotAllowed');
      }
      if (input.boardId) {
        const meta = boardById(input.boardId);
        if (!meta || meta.deletedAt) return err('workspace.errors.boardNotFound');
        const share = checkBoard(s, actor, meta, 'board.share');
        if (share) return share;
      }
      const maxUses = Math.min(INVITE_LINK_LIMITS.maxUses, Math.max(1, Math.round(input.maxUses)));
      const days = Math.min(INVITE_LINK_LIMITS.maxDays, Math.max(1, Math.round(input.expiresInDays)));
      const link: InviteLink = {
        id: env.newId(),
        role: input.role,
        teamIds: teamIds.length ? teamIds : undefined,
        projectId: input.role === 'guest_b2b' ? input.projectId : undefined,
        boardId: input.role === 'guest_b2b' ? input.boardId : undefined,
        boardRole: input.role === 'guest_b2b' ? input.boardRole : undefined,
        allowedDomain: domain,
        maxUses,
        uses: 0,
        createdBy: actor.actorId,
        createdAt: now,
        expiresAt: now + days * DAY_MS,
        token: env.newToken(),
      };
      return done({ ...s, inviteLinks: [link, ...links] }, [
        { action: 'invite_link_created', message: { key: 'workspace.audit.msg.inviteLinkCreated', params: { role: roleMsg(link.role), count: maxUses } }, meta: { targetType: 'inviteLink', targetId: link.id } },
      ], { id: link.id, token: link.token });
    }

    case 'revokeInviteLink': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const links = s.inviteLinks ?? [];
      const link = links.find((l) => l.id === op.id);
      if (!link) return err('workspace.errors.inviteLinkNotFound');
      if (link.revokedAt) return done(s, [], { id: op.id });
      return done({ ...s, inviteLinks: patchList(links, op.id, { revokedAt: now }) }, [
        { action: 'invite_link_revoked', message: { key: 'workspace.audit.msg.inviteLinkRevoked', params: { role: roleMsg(link.role) } }, meta: { targetType: 'inviteLink', targetId: op.id } },
      ], { id: op.id });
    }

    /* ---------------- Chat 08.5 · B: fila de pedidos de acesso ---------------- */
    case 'approveAccessRequest': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const requests = s.accessRequests ?? [];
      const req = requests.find((r) => r.id === op.id);
      if (!req || req.status === 'unconfirmed') return err('workspace.errors.accessRequestNotFound');
      if (req.status !== 'pending') return err('workspace.errors.accessRequestDecided');
      const close = (st: WorkspaceRulesState, invitationId: string | null) =>
        st.accessRequests === undefined && !requests.length
          ? st
          : { ...st, accessRequests: (st.accessRequests ?? requests).map((r) => (r.id === req.id ? { ...r, status: 'approved' as const, decidedAt: now, decidedBy: actor.actorId, invitationId } : r)) };
      const approvedAudit: AuditDraft = {
        action: 'access_request_approved',
        message: { key: 'workspace.audit.msg.accessRequestApproved' },
        meta: { targetType: 'accessRequest', targetId: req.id },
      };
      // quem já tem conta nesta organização não ganha convite: o pedido só é fechado
      if (s.directory.some((a) => a.email === req.email && a.status !== 'removed')) {
        return done(close(s, null), [{ ...approvedAudit, message: { key: 'workspace.audit.msg.accessRequestClosedExisting' } }], { id: req.id });
      }
      let input: InvitationInput;
      let links = s.inviteLinks;
      if (req.kind === 'link') {
        const link = (s.inviteLinks ?? []).find((l) => l.id === req.inviteLinkId);
        const invalid = validateInviteLinkJoin(s, link, req.email, now);
        if (invalid || !link) return err(invalid?.key ?? 'workspace.errors.inviteLinkNotFound', invalid?.params);
        input = { email: req.email, role: link.role, teamIds: link.teamIds, projectId: link.projectId, boardId: link.boardId, boardRole: link.boardRole, expiresInDays: LINK_REQUEST_INVITE_DAYS };
        // o uso do link é contado ao aprovar (o convite gerado é a entrada concedida pelo link)
        links = (s.inviteLinks ?? []).map((l) => (l.id === link.id ? { ...l, uses: l.uses + 1 } : l));
      } else {
        const g = op.grant;
        if (!g) return err('workspace.errors.accessRequestGrantRequired');
        if (g.role !== 'member' && g.role !== 'guest_b2b') return err('workspace.errors.accessRequestAdminRole');
        input = { email: req.email, role: g.role, teamIds: g.teamIds, projectId: g.projectId, boardId: g.boardId, boardRole: g.boardRole, expiresInDays: g.expiresInDays };
      }
      const created = applyWorkspaceOp(s, { type: 'createInvitation', input }, actor, env);
      if (!created.ok) return created;
      const state = close({ ...created.state, inviteLinks: links }, created.id ?? null);
      return done(state, [...created.audit, approvedAudit], { id: created.id, token: created.token });
    }

    case 'rejectAccessRequest': {
      const d = checkWs(s, actor, 'workspace.members.manage');
      if (d) return d;
      const requests = s.accessRequests ?? [];
      const req = requests.find((r) => r.id === op.id);
      if (!req || req.status === 'unconfirmed') return err('workspace.errors.accessRequestNotFound');
      if (req.status !== 'pending') return err('workspace.errors.accessRequestDecided');
      return done({ ...s, accessRequests: patchList(requests, op.id, { status: 'rejected', decidedAt: now, decidedBy: actor.actorId }) }, [
        { action: 'access_request_rejected', message: { key: 'workspace.audit.msg.accessRequestRejected' }, meta: { targetType: 'accessRequest', targetId: op.id } },
      ], { id: op.id });
    }

    case 'transferBoardOwnership': {
      const d = checkWs(s, actor, 'workspace.ownership.transfer');
      if (d) return d;
      if (op.fromId === op.toId) return err('workspace.errors.sameUser');
      const to = accountById(op.toId);
      if (!to || to.status !== 'active' || (to.workspaceRole !== 'admin' && to.workspaceRole !== 'member')) return err('workspace.errors.recipientInactive');
      const wanted = new Set(op.boardIds);
      const moving = s.boards.filter((b) => b.ownerId === op.fromId && wanted.has(b.id));
      if (!moving.length) return err('workspace.errors.nothingToTransfer');
      const ids = new Set(moving.map((b) => b.id));
      return done(
        { ...s, boards: s.boards.map((b) => (ids.has(b.id) ? { ...b, ownerId: op.toId, ownerName: to.name, members: b.members?.filter((m) => m.userId !== op.toId), updatedAt: now } : b)) },
        [
          {
            action: 'ownership_transferred',
            message: { key: 'workspace.audit.msg.ownershipTransferred', params: { count: moving.length, fromUser: op.fromId, toUser: op.toId } },
            meta: { targetType: 'user', targetId: op.fromId, count: moving.length, changes: [{ field: 'ownerId', before: op.fromId, after: op.toId }] },
          },
        ],
      );
    }

    default:
      return err('permissions.denied.unknownAction');
  }
}

/* ------------------------------ Validação da forma (servidor) ------------------------------ */

const isStr = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const isOptStr = (v: unknown, max = 500) => v === undefined || isStr(v, max);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_:.-]{1,80}$/.test(v);
const isIds = (v: unknown, max = 500) => Array.isArray(v) && v.length <= max && v.every(isId);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const optClientId = (v: unknown) => v === undefined || (typeof v === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(v));
const optToken = (v: unknown) => v === undefined || (typeof v === 'string' && CLIENT_TOKEN_RE.test(v));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const ROLES = ['admin', 'member', 'guest_b2b'];
/** Chat 08.5 · B: papéis que um link geral ou a aprovação de um pedido podem conceder (nunca admin). */
const GRANT_ROLES = ['member', 'guest_b2b'];
const BOARD_ROLES = ['editor', 'commenter', 'viewer'];
const LINK_LEVELS = ['viewer', 'commenter', 'editor'];
const POLICY_KEYS: (keyof WorkspacePolicies)[] = [
  'allowPublicLinks', 'maxPublicLinkLifetimeDays', 'requirePasswordOnPublicLinks', 'allowGuests', 'guestDefaultExpiryDays', 'allowViewerExport',
  'allowMembersCreateTeams', 'allowMembersInviteGuests', 'snapshotRetentionDays', 'autoSnapshotIntervalMin', 'trashRetentionDays', 'allowExtensions', 'extensionAllowlist', 'allowLocalMode', 'distinctPresenceColors',
  'allowAccessRequests', 'allowDomainSignup',
];

function validPlace(p: unknown): boolean {
  if (!isObj(p)) return false;
  if (p.kind === 'personal' || p.kind === 'workspace' || p.kind === 'shared') return onlyKeys(p, ['kind']);
  if (p.kind === 'team') return onlyKeys(p, ['kind', 'teamId', 'projectId']) && isId(p.teamId) && (p.projectId === undefined || p.projectId === null || isId(p.projectId));
  return false;
}

function validPolicies(p: unknown): boolean {
  if (!isObj(p) || !onlyKeys(p, POLICY_KEYS)) return false;
  const numOrNull = (v: unknown) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 36500);
  const num = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 36500);
  const bool = (v: unknown) => v === undefined || isBool(v);
  return (
    bool(p.allowPublicLinks) && numOrNull(p.maxPublicLinkLifetimeDays) && bool(p.requirePasswordOnPublicLinks) && bool(p.allowGuests) && numOrNull(p.guestDefaultExpiryDays) &&
    bool(p.allowViewerExport) && bool(p.allowMembersCreateTeams) && bool(p.allowMembersInviteGuests) && num(p.snapshotRetentionDays) && num(p.autoSnapshotIntervalMin) &&
    num(p.trashRetentionDays) && bool(p.allowLocalMode) && bool(p.distinctPresenceColors) && bool(p.allowAccessRequests) && bool(p.allowDomainSignup) && (p.allowExtensions === undefined || ['none', 'packs_only', 'all'].includes(p.allowExtensions as string)) &&
    (p.extensionAllowlist === undefined || (Array.isArray(p.extensionAllowlist) && p.extensionAllowlist.length <= 200 && p.extensionAllowlist.every((x) => isStr(x, 200))))
  );
}

/** Confere a FORMA de uma operação recebida pela rede (tipos, chaves permitidas, tamanhos). */
export function isWorkspaceOp(v: unknown): v is WorkspaceOp {
  if (!isObj(v) || typeof v.type !== 'string') return false;
  const o = v;
  switch (o.type) {
    case 'updateWorkspace': {
      const p = o.patch;
      return onlyKeys(o, ['type', 'patch']) && isObj(p) && onlyKeys(p, ['name', 'allowedEmailDomains', 'requireDomainForMembers']) && isOptStr(p.name, 200) &&
        (p.allowedEmailDomains === undefined || (Array.isArray(p.allowedEmailDomains) && p.allowedEmailDomains.length <= 50 && p.allowedEmailDomains.every((d) => isStr(d, 253)))) &&
        (p.requireDomainForMembers === undefined || isBool(p.requireDomainForMembers));
    }
    case 'updatePolicies':
      return onlyKeys(o, ['type', 'patch']) && validPolicies(o.patch);
    case 'createTeam': {
      const i = o.input;
      return onlyKeys(o, ['type', 'input', 'clientId']) && optClientId(o.clientId) && isObj(i) && onlyKeys(i, ['name', 'description', 'color', 'memberIds']) && isStr(i.name, 200) && isOptStr(i.description, 2000) &&
        (i.color === undefined || (isStr(i.color, 20) && /^#[0-9a-fA-F]{6}$/.test(i.color))) && (i.memberIds === undefined || isIds(i.memberIds));
    }
    case 'updateTeam': {
      const p = o.patch;
      return onlyKeys(o, ['type', 'id', 'patch']) && isId(o.id) && isObj(p) && onlyKeys(p, ['name', 'description', 'color']) && isOptStr(p.name, 200) && isOptStr(p.description, 2000) &&
        (p.color === undefined || (isStr(p.color, 20) && /^#[0-9a-fA-F]{6}$/.test(p.color)));
    }
    case 'setTeamArchived':
    case 'setProjectArchived':
      return onlyKeys(o, ['type', 'id', 'archived']) && isId(o.id) && isBool(o.archived);
    case 'setTeamMembers':
      return onlyKeys(o, ['type', 'id', 'memberIds']) && isId(o.id) && isIds(o.memberIds);
    case 'createProject': {
      const i = o.input;
      return onlyKeys(o, ['type', 'input', 'clientId']) && optClientId(o.clientId) && isObj(i) && onlyKeys(i, ['teamId', 'name', 'description']) && isId(i.teamId) && isStr(i.name, 200) && isOptStr(i.description, 2000);
    }
    case 'updateProject': {
      const p = o.patch;
      return onlyKeys(o, ['type', 'id', 'patch']) && isId(o.id) && isObj(p) && onlyKeys(p, ['name', 'description']) && isOptStr(p.name, 200) && isOptStr(p.description, 2000);
    }
    case 'moveProject':
      return onlyKeys(o, ['type', 'id', 'teamId']) && isId(o.id) && isId(o.teamId);
    case 'moveBoard':
      return onlyKeys(o, ['type', 'boardId', 'place']) && isId(o.boardId) && validPlace(o.place);
    case 'restoreBoard':
    case 'purgeBoard':
    case 'suspendAccount':
    case 'reactivateAccount':
    case 'removeAccount':
    case 'revokeInvitation':
      return onlyKeys(o, ['type', 'id']) && isId(o.id);
    case 'emptyTrash':
      return onlyKeys(o, ['type']);
    case 'setAccountRole':
      return onlyKeys(o, ['type', 'id', 'role']) && isId(o.id) && ROLES.includes(o.role as string);
    case 'createInvitation': {
      const i = o.input;
      return onlyKeys(o, ['type', 'input', 'clientId', 'token']) && optClientId(o.clientId) && optToken(o.token) && isObj(i) && onlyKeys(i, ['email', 'role', 'teamIds', 'projectId', 'boardId', 'boardRole', 'expiresInDays', 'sendEmail']) && isStr(i.email, 320) &&
        ROLES.includes(i.role as string) && (i.teamIds === undefined || isIds(i.teamIds, 100)) && (i.projectId === undefined || isId(i.projectId)) && (i.boardId === undefined || isId(i.boardId)) &&
        (i.boardRole === undefined || BOARD_ROLES.includes(i.boardRole as string)) && typeof i.expiresInDays === 'number' && i.expiresInDays >= 1 && i.expiresInDays <= 365 &&
        (i.sendEmail === undefined || isBool(i.sendEmail));
    }
    case 'createInviteLink': {
      const i = o.input;
      return onlyKeys(o, ['type', 'input', 'clientId', 'token']) && optClientId(o.clientId) && optToken(o.token) && isObj(i) &&
        onlyKeys(i, ['role', 'teamIds', 'projectId', 'boardId', 'boardRole', 'maxUses', 'expiresInDays', 'allowedDomain']) && GRANT_ROLES.includes(i.role as string) &&
        (i.teamIds === undefined || isIds(i.teamIds, 100)) && (i.projectId === undefined || isId(i.projectId)) && (i.boardId === undefined || isId(i.boardId)) &&
        (i.boardRole === undefined || BOARD_ROLES.includes(i.boardRole as string)) &&
        Number.isInteger(i.maxUses) && (i.maxUses as number) >= 1 && (i.maxUses as number) <= INVITE_LINK_LIMITS.maxUses &&
        typeof i.expiresInDays === 'number' && i.expiresInDays >= 1 && i.expiresInDays <= INVITE_LINK_LIMITS.maxDays &&
        (i.allowedDomain === undefined || i.allowedDomain === null || isStr(i.allowedDomain, 253));
    }
    case 'revokeInviteLink':
    case 'rejectAccessRequest':
      return onlyKeys(o, ['type', 'id']) && isId(o.id);
    case 'approveAccessRequest': {
      const g = o.grant;
      return onlyKeys(o, ['type', 'id', 'grant', 'clientId', 'token']) && isId(o.id) && optClientId(o.clientId) && optToken(o.token) &&
        (g === undefined ||
          (isObj(g) && onlyKeys(g, ['role', 'teamIds', 'projectId', 'boardId', 'boardRole', 'expiresInDays', 'sendEmail']) && GRANT_ROLES.includes(g.role as string) &&
            (g.teamIds === undefined || isIds(g.teamIds, 100)) && (g.projectId === undefined || isId(g.projectId)) && (g.boardId === undefined || isId(g.boardId)) &&
            (g.boardRole === undefined || BOARD_ROLES.includes(g.boardRole as string)) && typeof g.expiresInDays === 'number' && g.expiresInDays >= 1 && g.expiresInDays <= 365 &&
            (g.sendEmail === undefined || isBool(g.sendEmail))));
    }
    case 'extendGuest':
      return onlyKeys(o, ['type', 'userId', 'days']) && isId(o.userId) && typeof o.days === 'number' && o.days >= 1 && o.days <= 365;
    case 'revokeGuest':
      return onlyKeys(o, ['type', 'userId']) && isId(o.userId);
    case 'setBoardMember':
      return onlyKeys(o, ['type', 'boardId', 'userId', 'role', 'expiresAt']) && isId(o.boardId) && isId(o.userId) && BOARD_ROLES.includes(o.role as string) &&
        (o.expiresAt === undefined || o.expiresAt === null || (typeof o.expiresAt === 'number' && Number.isFinite(o.expiresAt)));
    case 'removeBoardMember':
      return onlyKeys(o, ['type', 'boardId', 'userId']) && isId(o.boardId) && isId(o.userId);
    case 'setPublicLink': {
      const p = o.patch;
      return onlyKeys(o, ['type', 'boardId', 'patch', 'token']) && optToken(o.token) && isId(o.boardId) && isObj(p) && onlyKeys(p, ['enabled', 'accessLevel', 'passwordHash', 'lifetime', 'allowDownload']) &&
        (p.enabled === undefined || isBool(p.enabled)) && (p.accessLevel === undefined || LINK_LEVELS.includes(p.accessLevel as string)) &&
        (p.passwordHash === undefined || p.passwordHash === null || isStr(p.passwordHash, 300)) && (p.lifetime === undefined || LINK_LIFETIMES.some((l) => l.id === p.lifetime)) &&
        (p.allowDownload === undefined || p.allowDownload === null || isBool(p.allowDownload));
    }
    case 'revokePublicLink':
      return onlyKeys(o, ['type', 'boardId']) && isId(o.boardId);
    case 'regeneratePublicLink':
      return onlyKeys(o, ['type', 'boardId', 'token']) && optToken(o.token) && isId(o.boardId);
    case 'transferBoardOwnership':
      return onlyKeys(o, ['type', 'fromId', 'toId', 'boardIds']) && isId(o.fromId) && isId(o.toId) && isIds(o.boardIds, 5000);
    default:
      return false;
  }
}
