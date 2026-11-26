/**
 * LuDraw — Hierarquia do Workspace (Chat 06 · Rodada A), funções PURAS (sem React, sem stores).
 *
 * Workspace (1 por instalação) › Times › Projetos › Boards, mais o Espaço Pessoal de cada pessoa.
 * Visibilidade na Mesa, papel efetivo no board vindo da ACL/convites, lugares ("onde o board está"),
 * migração idempotente dos boards antigos, validação do link público e de domínios de e-mail.
 *
 * Toda decisão de PERMISSÃO continua em `permissions.ts` (`can`/`explain`); aqui só se decide
 * VISIBILIDADE e de onde vem o papel no board. O servidor do Chat 07 reaproveita este arquivo.
 */

import type {
  AccountStatus,
  BoardMeta,
  MembershipStatus,
  BoardRole,
  ProjectFolder,
  PublicShareLink,
  TeamEntity,
  UserAccount,
  WorkspaceEntity,
  WorkspacePolicies,
  WorkspaceRole,
} from '../types/workspace';
import { DEFAULT_WORKSPACE_POLICIES, type PermissionContext, type ViewAsProfile } from './permissions';

/** Id do workspace no modo local (uma instalação = uma organização). */
export const LOCAL_WORKSPACE_ID = 'local-workspace';

/** Onde a Mesa está "olhando" (e onde um board novo nasce). */
export type Place =
  | { kind: 'personal' }
  | { kind: 'shared' }
  /** Boards da organização fora de qualquer time ("Geral") */
  | { kind: 'workspace' }
  | { kind: 'team'; teamId: string; projectId?: string | null };

/* ---------------------- Participação (emenda v1.1 §10) ---------------------- */

/** Vínculo de uma conta com a organização. Hoje vem dos campos de `UserAccount`; no Chat 07, de `OrgMembership`. */
export interface Membership {
  userId: string;
  organizationId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  teamIds: string[];
  anonymizedAt?: number | null;
  guestExpiresAt?: number | null;
}

/**
 * ÚNICO acesso ao status/papel de alguém na organização (emenda v1.1 §10). `null` = sem participação
 * (conta isolada do modo "Continuar sem conta"). Trocar a origem do dado no Chat 07 não muda as telas.
 */
export function membershipOf(account: UserAccount | null | undefined, organizationId: string): Membership | null {
  if (!account || account.isolated) return null;
  return {
    userId: account.id,
    organizationId,
    role: account.workspaceRole,
    status: account.status,
    teamIds: account.teamIds,
    anonymizedAt: account.anonymizedAt ?? null,
    guestExpiresAt: account.guestExpiresAt ?? null,
  };
}

/** Pessoa da organização como as telas a veem: participação + dados de exibição da conta. */
export type MemberView = Membership & Pick<UserAccount, 'id' | 'name' | 'email' | 'avatarColor' | 'simulated' | 'lastSeenAt' | 'invitedBy' | 'createdAt' | 'emailVerified' | 'createdVia'>;

export function orgMembers(directory: readonly UserAccount[], organizationId: string): MemberView[] {
  const out: MemberView[] = [];
  for (const a of directory) {
    const m = membershipOf(a, organizationId);
    if (m) out.push({ ...m, id: a.id, name: a.name, email: a.email, avatarColor: a.avatarColor, simulated: a.simulated, lastSeenAt: a.lastSeenAt, invitedBy: a.invitedBy, createdAt: a.createdAt, emailVerified: a.emailVerified, createdVia: a.createdVia });
  }
  return out;
}

/** Lista para as regras puras de permissão (último administrador) — só quem participa. */
export function membershipAccounts(directory: readonly UserAccount[], organizationId: string): { id: string; workspaceRole: WorkspaceRole; status: AccountStatus }[] {
  return orgMembers(directory, organizationId).map((m) => ({ id: m.id, workspaceRole: m.role, status: m.status === 'invited' ? 'suspended' : m.status }));
}

/** Quem está olhando (já considerando "Visualizar como…"). */
export interface Viewer {
  userId: string;
  workspaceRole: WorkspaceRole;
  /** Times de que a pessoa faz parte (fonte da verdade: `TeamEntity.memberIds`) */
  teamIds: string[];
  status: AccountStatus;
  guestExpiresAt?: number | null;
  /** Perfil genérico de "Visualizar como…" (sem conta específica) */
  profile?: ViewAsProfile | null;
  /** Emenda v1.1 §11: modo "Continuar sem conta" — sem participação na organização */
  isolated?: boolean;
}

/** Recorte do estado do workspace que as regras precisam. */
export interface WorkspaceView {
  teams: readonly TeamEntity[];
  projects: readonly ProjectFolder[];
  policies: WorkspacePolicies;
  directory: readonly UserAccount[];
}

/** Sessão mínima (espelha `useAppStore.SessionState` sem importar o store). */
export interface SessionLike {
  userId: string;
  workspaceRole: WorkspaceRole;
  viewAs: ViewAsProfile | null;
}

export function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Id do perfil genérico simulado — o mesmo usado no board (não é autor das notas de ninguém). */
export function simulatedProfileUserId(profile: ViewAsProfile): string {
  return `simulado:${slugify(profile.label)}`;
}

export function teamIdsOf(userId: string, teams: readonly TeamEntity[]): string[] {
  return teams.filter((t) => !t.archivedAt && t.memberIds.includes(userId)).map((t) => t.id);
}

/** Políticas efetivas (padrões seguros + o que o workspace definiu). */
export function effectivePolicies(workspace: Pick<WorkspaceEntity, 'policies'> | null | undefined): WorkspacePolicies {
  return { ...DEFAULT_WORKSPACE_POLICIES, ...(workspace?.policies ?? {}) };
}

/** Converte a sessão (+ "Visualizar como…") em quem está olhando (participação via `membershipOf`). */
export function viewerFor(session: SessionLike, ws: Pick<WorkspaceView, 'teams' | 'directory'>, organizationId = LOCAL_WORKSPACE_ID): Viewer {
  const va = session.viewAs;
  const fromAccount = (acc: UserAccount): Viewer => {
    const m = membershipOf(acc, organizationId);
    if (!m) return { userId: acc.id, workspaceRole: 'member', teamIds: [], status: 'active', isolated: true };
    return { userId: acc.id, workspaceRole: m.role, teamIds: teamIdsOf(acc.id, ws.teams), status: m.status === 'invited' ? 'suspended' : m.status, guestExpiresAt: m.guestExpiresAt ?? null };
  };
  if (va?.simulatedUserId) {
    const acc = ws.directory.find((a) => a.id === va.simulatedUserId);
    if (acc) return fromAccount(acc);
  }
  if (va) return { userId: simulatedProfileUserId(va), workspaceRole: va.workspaceRole, teamIds: [], status: 'active', profile: va };
  const me = ws.directory.find((a) => a.id === session.userId);
  if (me) return fromAccount(me);
  return { userId: session.userId, workspaceRole: session.workspaceRole, teamIds: teamIdsOf(session.userId, ws.teams), status: 'active', guestExpiresAt: null };
}

/** Papel vindo da ACL do board (entrada vencida não conta). */
export function aclRole(meta: Pick<BoardMeta, 'members'>, userId: string, now = Date.now()): BoardRole | null {
  const m = meta.members?.find((x) => x.userId === userId && (!x.expiresAt || x.expiresAt > now));
  return m?.role ?? null;
}

/**
 * Papel no board vindo de compartilhamento: ACL → convite nominal no board → convidado do projeto.
 * (Admin/membro/dono são resolvidos depois por `effectiveBoardRole` em permissions.ts.)
 */
export function boardRoleFor(userId: string, meta: Pick<BoardMeta, 'members' | 'invitedGuestIds' | 'projectId'>, projects: readonly ProjectFolder[], now = Date.now()): BoardRole | null {
  const acl = aclRole(meta, userId, now);
  if (acl) return acl;
  if (meta.invitedGuestIds?.includes(userId)) return 'editor';
  const project = meta.projectId ? projects.find((p) => p.id === meta.projectId) : undefined;
  if (project && !project.archivedAt && project.invitedGuestIds.includes(userId)) return project.guestRoles?.[userId] ?? 'editor';
  return null;
}

function guestBlocked(viewer: Viewer, policies: WorkspacePolicies, now: number): boolean {
  if (viewer.workspaceRole !== 'guest_b2b') return false;
  if (!policies.allowGuests) return true;
  return !!viewer.guestExpiresAt && viewer.guestExpiresAt <= now;
}

/** Dono com conta no diretório? (dono "órfão" = sem conta ou participação removida) */
function hasActiveAccount(userId: string, directory: readonly UserAccount[]): boolean {
  const acc = directory.find((a) => a.id === userId);
  if (!acc) return false;
  const m = membershipOf(acc, LOCAL_WORKSPACE_ID);
  return !m || m.status !== 'removed';
}

/**
 * O board aparece na Mesa para `viewer`?
 *  - na lixeira → nunca (só na aba/área Lixeira); visitante → nunca (entra só pelo link)
 *  - conta suspensa → nada
 *  - dono → sempre; compartilhado comigo (ACL/convite/projeto) → sim
 *  - convidado B2B → SÓ o que foi compartilhado (e nada se a política desligar convidados ou o acesso vencer)
 *  - Espaço Pessoal alheio → não (admin vê apenas boards pessoais "órfãos", sem dono ativo)
 *  - board de Time → admin, ou membro do time; board "Geral" da organização → admin e membros
 */
export function canSeeBoard(viewer: Viewer, meta: BoardMeta, ws: WorkspaceView, now = Date.now()): boolean {
  if (meta.deletedAt) return false;
  if (viewer.workspaceRole === 'visitor' || viewer.status !== 'active') return false;
  if (guestBlocked(viewer, ws.policies, now)) return false;
  if (meta.ownerId === viewer.userId) return true;
  // Emenda v1.1 §11: "Continuar sem conta" = espaço isolado — só os próprios boards (e boards antigos sem dono)
  if (viewer.isolated) return !hasActiveAccount(meta.ownerId, ws.directory) && !meta.teamId;
  const shared = boardRoleFor(viewer.userId, meta, ws.projects, now) !== null;
  if (viewer.workspaceRole === 'guest_b2b') return shared;
  if (shared) return true;
  if (meta.isPersonalSpace) return viewer.workspaceRole === 'admin' && !hasActiveAccount(meta.ownerId, ws.directory);
  if (viewer.workspaceRole === 'admin') return true;
  if (meta.teamId) return viewer.teamIds.includes(meta.teamId);
  return true;
}

/** Lugar do board na hierarquia. */
export function placeOf(meta: Pick<BoardMeta, 'isPersonalSpace' | 'teamId' | 'projectId'>): Place {
  if (meta.teamId) return { kind: 'team', teamId: meta.teamId, projectId: meta.projectId ?? null };
  if (meta.isPersonalSpace) return { kind: 'personal' };
  return { kind: 'workspace' };
}

export function samePlace(a: Place, b: Place): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'team' && b.kind === 'team') return a.teamId === b.teamId && (a.projectId ?? null) === (b.projectId ?? null);
  return true;
}

/** O board (já visível) pertence ao lugar que a Mesa está mostrando? */
export function boardInPlace(meta: BoardMeta, place: Place, viewer: Viewer, ws: WorkspaceView, now = Date.now()): boolean {
  switch (place.kind) {
    case 'personal':
      return !!meta.isPersonalSpace && !meta.teamId && meta.ownerId === viewer.userId;
    case 'shared':
      return meta.ownerId !== viewer.userId && boardRoleFor(viewer.userId, meta, ws.projects, now) !== null;
    case 'workspace':
      return !meta.teamId && !meta.isPersonalSpace;
    case 'team':
      return meta.teamId === place.teamId && (!place.projectId || meta.projectId === place.projectId);
    default:
      return false;
  }
}

/** Lugares que `viewer` pode escolher no seletor (Time arquivado some). */
export function visibleTeams(viewer: Viewer, teams: readonly TeamEntity[]): TeamEntity[] {
  if (viewer.isolated) return [];
  return teams.filter((t) => !t.archivedAt && (viewer.workspaceRole === 'admin' || viewer.teamIds.includes(t.id)));
}

export function teamProjects(teamId: string, projects: readonly ProjectFolder[]): ProjectFolder[] {
  return projects.filter((p) => p.teamId === teamId && !p.archivedAt);
}

/** `viewer` pode colocar boards neste lugar? (destino de "Mover para" / board novo) */
export function canUsePlace(viewer: Viewer, place: Place, teams: readonly TeamEntity[], projects: readonly ProjectFolder[]): boolean {
  if (viewer.workspaceRole !== 'admin' && viewer.workspaceRole !== 'member') return false;
  if (viewer.isolated) return place.kind === 'personal';
  switch (place.kind) {
    case 'personal':
      return true;
    case 'shared':
      return false;
    case 'workspace':
      return true;
    case 'team': {
      const team = teams.find((t) => t.id === place.teamId && !t.archivedAt);
      if (!team) return false;
      if (place.projectId && !projects.some((p) => p.id === place.projectId && p.teamId === team.id && !p.archivedAt)) return false;
      return viewer.workspaceRole === 'admin' || viewer.teamIds.includes(team.id);
    }
    default:
      return false;
  }
}

/** Lugar que a pessoa consegue ver (ver `useEffectivePlace`). */
export function effectivePlace(place: Place, viewer: Viewer, teams: readonly TeamEntity[]): Place {
  const internal = viewer.workspaceRole === 'admin' || viewer.workspaceRole === 'member';
  if (viewer.isolated) return { kind: 'personal' };
  if (!internal) return { kind: 'shared' };
  if (place.kind === 'team' && !visibleTeams(viewer, teams).some((t) => t.id === place.teamId)) return { kind: 'personal' };
  return place;
}

/** Campos de `BoardMeta` que representam o lugar (gravados ao criar/mover). */
export function placeFields(place: Place, workspaceId: string): Pick<BoardMeta, 'workspaceId' | 'teamId' | 'projectId' | 'isPersonalSpace'> {
  if (place.kind === 'team') return { workspaceId, teamId: place.teamId, projectId: place.projectId ?? null, isPersonalSpace: false };
  if (place.kind === 'personal') return { workspaceId, teamId: null, projectId: null, isPersonalSpace: true };
  return { workspaceId, teamId: null, projectId: null, isPersonalSpace: false };
}

/**
 * Contexto de permissão de um board para ações fora dele (Mesa: mover, excluir, compartilhar).
 * Mesmas regras de `accessFor` (hooks/usePermissionSync), sem a lista de facilitadores (que vive no BoardData).
 */
export function boardContextFor(viewer: Viewer, meta: BoardMeta, ws: WorkspaceView, now = Date.now()): PermissionContext {
  if (viewer.profile) {
    return {
      userId: viewer.userId,
      workspaceRole: viewer.profile.workspaceRole,
      boardRole: viewer.profile.boardRole ?? null,
      shareAccessLevel: viewer.profile.shareAccessLevel,
      isBoardOwner: false,
      isFacilitator: viewer.profile.isFacilitator,
      policies: ws.policies,
      allowDownload: meta.publicLink?.allowDownload,
    };
  }
  return {
    userId: viewer.userId,
    workspaceRole: viewer.workspaceRole,
    boardRole: boardRoleFor(viewer.userId, meta, ws.projects, now),
    isBoardOwner: meta.ownerId === viewer.userId,
    isFacilitator: false,
    policies: ws.policies,
    // Chat 08.7 · R1 (S-01): quem não ALCANÇA o board (outro time, Espaço Pessoal alheio, lixeira…) fica sem papel,
    // como no `boardPermissionContext` das rotas — sem isto um membro virava "editor" de qualquer board nas ops.
    boardAccess: canSeeBoard(viewer, meta, ws, now),
    isolated: viewer.isolated,
  };
}

/**
 * Chat 07: contexto de permissão DENTRO de um board para a própria pessoa (sem "Visualizar como…").
 * Regra única do cliente (`accessFor` + `buildPermissionContext`) e do servidor: papel da ACL/projeto,
 * titular, facilitador (titular ou `facilitatorIds`; ausente = só o titular), hierarquia (`boardAccess`
 * = `canSeeBoard`), políticas e conta isolada.
 */
export function boardPermissionContext(viewer: Viewer, meta: BoardMeta, ws: WorkspaceView, facilitatorIds?: readonly string[] | null, now = Date.now()): PermissionContext {
  const isBoardOwner = meta.ownerId === viewer.userId;
  const facilitators = facilitatorIds ?? [meta.ownerId];
  return {
    userId: viewer.userId,
    workspaceRole: viewer.workspaceRole,
    boardRole: boardRoleFor(viewer.userId, meta, ws.projects, now),
    isBoardOwner,
    isFacilitator: isBoardOwner || facilitators.includes(viewer.userId),
    policies: ws.policies,
    boardAccess: canSeeBoard(viewer, meta, ws, now),
    isolated: viewer.isolated,
  };
}

/** Chat 07: contexto de quem entrou por link público (visitante). A política continua sendo o teto do download. */
export function visitorPermissionContext(visitorId: string, link: Pick<PublicShareLink, 'accessLevel' | 'allowDownload'>, policies: WorkspacePolicies): PermissionContext {
  return {
    userId: visitorId,
    workspaceRole: 'visitor',
    boardRole: null,
    shareAccessLevel: link.accessLevel,
    isBoardOwner: false,
    isFacilitator: false,
    policies,
    allowDownload: link.allowDownload,
  };
}

/* --------------------------- Migração (idempotente) --------------------------- */

/**
 * Boards criados antes do Chat 06 ganham o vínculo com o workspace e um lugar:
 *  - dono em `knownOwnerIds` (o usuário salvo no navegador / modo "sem conta") → Espaço Pessoal dele;
 *  - qualquer outro dono (outras contas locais, sessões antigas "sem conta") → "Geral" da organização,
 *    visível e acessível a todos os membros, como era antes do Chat 06.
 * Board que já tem `workspaceId` não é tocado. Nada muda no conteúdo (`BoardData`) — o board abre igual.
 * Devolve o MESMO array quando não há o que migrar (rodar 2× não altera nada).
 */
export function normalizeBoards(boards: readonly BoardMeta[], workspaceId: string, knownOwnerIds: ReadonlySet<string>): BoardMeta[] {
  let changed = false;
  const next = boards.map((b) => {
    if (b.workspaceId) return b;
    changed = true;
    if (b.teamId) return { ...b, workspaceId };
    return { ...b, workspaceId, isPersonalSpace: b.isPersonalSpace ?? knownOwnerIds.has(b.ownerId) };
  });
  return changed ? next : (boards as BoardMeta[]);
}

/* ------------------------------ Lixeira ------------------------------ */

const DAY = 86_400_000;

/** Quando o board sai da lixeira sozinho (ms). */
export function trashExpiresAt(meta: Pick<BoardMeta, 'deletedAt'>, policies: WorkspacePolicies): number | null {
  if (!meta.deletedAt) return null;
  return meta.deletedAt + Math.max(1, policies.trashRetentionDays) * DAY;
}

export function expiredTrash(boards: readonly BoardMeta[], policies: WorkspacePolicies, now = Date.now()): BoardMeta[] {
  return boards.filter((b) => {
    const exp = trashExpiresAt(b, policies);
    return exp !== null && exp <= now;
  });
}

/* --------------------------- Link público --------------------------- */

export type PublicLinkStatus = 'ok' | 'password' | 'expired' | 'revoked' | 'disabled' | 'policy' | 'invalid';

/** Prazos oferecidos para o link (ms; null = nunca). */
export const LINK_LIFETIMES: { id: '1h' | '24h' | '7d' | 'never'; ms: number | null }[] = [
  { id: '1h', ms: 3_600_000 },
  { id: '24h', ms: DAY },
  { id: '7d', ms: 7 * DAY },
  { id: 'never', ms: null },
];

/** Prazos permitidos pela política `maxPublicLinkLifetimeDays` (sem limite = todos). */
export function allowedLinkLifetimes(policies: WorkspacePolicies): typeof LINK_LIFETIMES {
  const max = policies.maxPublicLinkLifetimeDays;
  if (max === null || max === undefined) return LINK_LIFETIMES;
  return LINK_LIFETIMES.filter((l) => l.ms !== null && l.ms <= max * DAY);
}

/** Expiração efetiva (o teto da política vale também para links antigos). */
export function effectiveLinkExpiry(link: Pick<PublicShareLink, 'expiresAt' | 'createdAt'>, policies: WorkspacePolicies): number | null {
  const max = policies.maxPublicLinkLifetimeDays;
  const cap = max !== null && max !== undefined ? (link.createdAt ?? 0) + max * DAY : null;
  const own = link.expiresAt ?? null;
  if (own === null) return cap;
  if (cap === null) return own;
  return Math.min(own, cap);
}

/**
 * Situação de um link aberto com `token`. `unlocked` = a senha já foi conferida nesta sessão.
 * LOCAL ≠ SEGURO: no modo local a senha (SHA-256) só protege de verdade quando houver servidor (Chat 07).
 */
export function resolvePublicLink(meta: Pick<BoardMeta, 'publicLink' | 'deletedAt'> | undefined, token: string, policies: WorkspacePolicies, unlocked: boolean, now = Date.now()): PublicLinkStatus {
  const link = meta?.publicLink;
  if (!meta || !link || !token || link.token !== token || meta.deletedAt) return 'invalid';
  if (link.revokedAt) return 'revoked';
  if (!link.enabled) return 'disabled';
  if (!policies.allowPublicLinks) return 'policy';
  if (policies.requirePasswordOnPublicLinks && !link.passwordHash) return 'policy';
  const exp = effectiveLinkExpiry(link, policies);
  if (exp !== null && exp <= now) return 'expired';
  if (link.passwordHash && !unlocked) return 'password';
  return 'ok';
}

/* ------------------------------ Domínios ------------------------------ */

/** "@Empresa.com.br " → "empresa.com.br" (vazio se inválido). */
/**
 * Domínio normalizado: minúsculas, sem "@" inicial, sem ponto final e em ASCII (Chat 08.5 · C: domínio
 * internacional vira punycode — `empresá.com` → `xn--empres-qta.com`, pelo `URL` do próprio ambiente).
 * Inválido = ''.
 */
export function normalizeDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');
  if (!d || /[\s@/\\?#:[\]]/.test(d)) return '';
  let host = d;
  if (/[^\x00-\x7f]/.test(d)) {
    try {
      host = new URL(`http://${d}/`).hostname;
    } catch {
      return '';
    }
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : '';
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** O e-mail está num domínio permitido? (lista vazia = qualquer domínio) */
export function emailInAllowedDomains(email: string, workspace: Pick<WorkspaceEntity, 'allowedEmailDomains'>): boolean {
  if (!workspace.allowedEmailDomains.length) return true;
  const d = emailDomain(email);
  return workspace.allowedEmailDomains.some((allowed) => d === allowed || d.endsWith(`.${allowed}`));
}

/** Membro interno precisa de domínio permitido quando `requireDomainForMembers` está ligado. */
export function memberEmailAllowed(email: string, role: WorkspaceRole, workspace: Pick<WorkspaceEntity, 'allowedEmailDomains' | 'requireDomainForMembers'>): boolean {
  if (role === 'guest_b2b' || role === 'visitor') return true;
  if (!workspace.requireDomainForMembers) return true;
  return emailInAllowedDomains(email, workspace);
}

/* ------------------------------ Convites ------------------------------ */

/** Token de convite/link: aleatório, URL-safe. */
export function randomToken(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
}

/** Extrai o token de um código colado ("ABC…", "#/invite/ABC…" ou URL completa). */
export function inviteTokenFromInput(input: string): string {
  const s = input.trim();
  const m = s.match(/#\/invite\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{8,}$/.test(s) ? s : '';
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export function invitationStatus(inv: { acceptedAt?: number | null; revokedAt?: number | null; expiresAt: number }, now = Date.now()): InvitationStatus {
  if (inv.acceptedAt) return 'accepted';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt <= now) return 'expired';
  return 'pending';
}

export const INVITE_LIFETIME_DAYS = [1, 7, 30] as const;
export const DAY_MS = DAY;

/**
 * Chat 08.7 · R5 (S-17): sem `LUDRAW_JWT_SECRET` o servidor guarda só o hash do token do link público e manda '' —
 * o endereço aparece uma única vez, na resposta da criação. Ao receber um estado novo, o token que ESTA sessão já
 * conhece continua valendo enquanto a impressão (`tokenPrint`) do servidor for a mesma; link trocado (por outra
 * pessoa ou outra janela) = impressão nova = token desconhecido (a Ficha mostra "Gerar link novo").
 */
export type SessionLinkTokens = Map<string, { token: string; tokenPrint: string }>;

/**
 * `known` = tokens que ESTA aba recebeu do servidor nesta sessão (memória; nunca o estado salvo no navegador — senão
 * o endereço "voltaria" depois de recarregar). O mapa é atualizado com os tokens que chegam.
 */
export function keepSessionLinkTokens(incoming: readonly BoardMeta[], known: SessionLinkTokens): BoardMeta[] {
  for (const b of incoming) if (b.publicLink?.token && b.publicLink.tokenPrint) known.set(b.id, { token: b.publicLink.token, tokenPrint: b.publicLink.tokenPrint });
  return incoming.map((b) => {
    const link = b.publicLink;
    const mine = known.get(b.id);
    if (!link || link.token || !link.tokenPrint || !mine || mine.tokenPrint !== link.tokenPrint) return b;
    return { ...b, publicLink: { ...link, token: mine.token } };
  });
}

/** O link existe, mas o endereço não pode mais ser mostrado (só o hash no servidor): é preciso gerar outro. */
export function publicLinkHidden(link: PublicShareLink | undefined): boolean {
  return !!link && !link.token && !!link.tokenPrint;
}
