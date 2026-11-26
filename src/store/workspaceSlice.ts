/**
 * LuDraw — Chat 06 · Rodada A: estado e ações do Workspace (hierarquia, contas, convites, ACL,
 * link público, lixeira, transferência, políticas e Audit Log). Fatia ("slice") do `useAppStore`.
 *
 * Regras (CLAUDE.md §1.1 e WORKSPACE_ADMIN_SPEC):
 *  - toda ação consulta o motor único `explain()`/`can()` (nunca `if (role === 'admin')`);
 *  - toda ação relevante grava um `WorkspaceAuditEntry` AQUI (nunca na UI), com autor e alvo por **id**
 *    e mensagem como chave + parâmetros — o nome da pessoa nunca é copiado para a entrada;
 *  - "Visualizar como…" muda o contexto de permissão, mas o autor gravado é sempre a pessoa real;
 *  - modo local ≠ seguro: o servidor (Chat 07) reaplica as mesmas regras.
 *
 * Chat 07: as regras de cada ação moram em `utils/workspaceRules.ts` (puro, o MESMO código que o servidor
 * roda em `POST /api/v1/workspace/ops`). Aqui ficam só os efeitos do modo local: gravar o estado, o Audit
 * Log, apagar o conteúdo de boards excluídos, ajustar a sessão/Mesa e as ações que só existem localmente
 * (usuários simulados, backup).
 */

import type {
  AccessRequest,
  BoardMeta,
  Invitation,
  InviteLink,
  LocalAccount,
  PublicShareLink,
  TemplateEntity,
  UserAccount,
  WorkspaceAuditAction,
  WorkspaceAuditEntry,
  WorkspaceEntity,
  WorkspacePolicies,
  WorkspaceRole,
  BoardRole,
  ProjectFolder,
  TeamEntity,
} from '../types/workspace';
import type { StoredMessage } from '../i18n/types';
import { t, translateMessage } from '../i18n';
import { createId } from '../utils/id';
import { colorFromString } from '../utils/color';
import { sha256 } from '../utils/hash';
import { deleteBoardData } from '../utils/storage';
import { DEFAULT_WORKSPACE_POLICIES, explain, workspaceContext, type PermissionAction, type PermissionDecision } from '../utils/permissions';
import {
  DAY_MS,
  LOCAL_WORKSPACE_ID,
  LINK_LIFETIMES,
  boardContextFor,
  expiredTrash,
  randomToken,
  resolvePublicLink,
  slugify,
  viewerFor,
  type Place,
  type PublicLinkStatus,
  type Viewer,
  type WorkspaceView,
} from '../utils/workspace';
import {
  applyInvitationAcceptance,
  applyWorkspaceOp,
  placeParam as rulesPlaceParam,
  stripGrants,
  validateInvitationAcceptance,
  type AuditDraft,
  type AuditMeta,
  type AccessGrantInput,
  type InvitationInput,
  type InviteLinkInput,
  type RuleResult,
  type WorkspaceOp,
  type WorkspaceRulesState,
} from '../utils/workspaceRules';
import type { AppState } from './useAppStore';
import type { WorkspaceBackupFile } from '../utils/workspaceBackup';
import { isServerMode } from '../utils/serverConfig';

export { TEAM_COLORS } from '../utils/workspaceRules';
export type { AuditMeta, InvitationInput } from '../utils/workspaceRules';

/** Máximo de entradas no Audit Log local (as mais antigas saem primeiro). */
export const AUDIT_LOG_LIMIT = 1000;

/** Autor das ações automáticas (ex.: limpeza da lixeira). */
export const SYSTEM_ACTOR_ID = 'system';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** Sessão do visitante que abriu um link público (não persistida). */
export interface LinkSession {
  boardId: string;
  token: string;
  accessLevel: PublicShareLink['accessLevel'];
  allowDownload?: boolean;
  /** Chat 07: políticas da organização dona do board (Modo Servidor — o visitante não tem o workspace) */
  policies?: WorkspacePolicies;
}

export interface PublicLinkPatch {
  enabled?: boolean;
  accessLevel?: PublicShareLink['accessLevel'];
  /** texto = nova senha · null = sem senha · ausente = mantém */
  password?: string | null;
  lifetime?: (typeof LINK_LIFETIMES)[number]['id'];
  /** true/false = definido no link · null = seguir a política do workspace */
  allowDownload?: boolean | null;
}

export interface WorkspaceSlice {
  workspace: WorkspaceEntity;
  /** Contas do workspace (eu, colegas, convidados B2B, usuários simulados) */
  directory: UserAccount[];
  teams: TeamEntity[];
  projects: ProjectFolder[];
  invitations: Invitation[];
  /** Chat 08.5 · B (só Modo Servidor, só para quem gerencia membros): links de convite gerais e fila de pedidos */
  inviteLinks: InviteLink[];
  accessRequests: AccessRequest[];
  auditLog: WorkspaceAuditEntry[];
  /** Lugar que a Mesa mostra (e onde nasce um board novo) */
  currentPlace: Place;
  /** Visitante de link público (não persistido) */
  linkSession: LinkSession | null;
  /** Id estável do modo "Continuar sem conta" (o Espaço Pessoal não se perde entre sessões) */
  localGuestId: string | null;

  updateWorkspace: (patch: { name?: string; allowedEmailDomains?: string[]; requireDomainForMembers?: boolean }) => ActionResult;
  updatePolicies: (patch: Partial<WorkspacePolicies>) => ActionResult;

  createTeam: (input: { name: string; description?: string; color?: string; memberIds?: string[] }) => ActionResult;
  updateTeam: (id: string, patch: { name?: string; description?: string; color?: string }) => ActionResult;
  setTeamArchived: (id: string, archived: boolean) => ActionResult;
  setTeamMembers: (id: string, memberIds: string[]) => ActionResult;
  createProject: (input: { teamId: string; name: string; description?: string }) => ActionResult;
  updateProject: (id: string, patch: { name?: string; description?: string }) => ActionResult;
  setProjectArchived: (id: string, archived: boolean) => ActionResult;
  moveProject: (id: string, teamId: string) => ActionResult;

  setCurrentPlace: (place: Place) => void;
  moveBoard: (boardId: string, place: Place) => ActionResult;
  restoreBoard: (id: string) => ActionResult;
  purgeBoard: (id: string) => ActionResult;
  emptyTrash: () => ActionResult;

  setAccountRole: (id: string, role: Exclude<WorkspaceRole, 'visitor'>) => ActionResult;
  suspendAccount: (id: string) => ActionResult;
  reactivateAccount: (id: string) => ActionResult;
  removeAccount: (id: string) => ActionResult;
  addSimulatedUsers: () => ActionResult;
  removeSimulatedUsers: () => ActionResult;

  createInvitation: (input: InvitationInput) => { ok: true; id: string; token: string } | { ok: false; error: string };
  revokeInvitation: (id: string) => ActionResult;
  /** Chat 08.5 · B (Modo Servidor): link de convite geral — o token só volta aqui, na criação */
  createInviteLink: (input: InviteLinkInput) => { ok: true; id: string; token: string } | { ok: false; error: string };
  revokeInviteLink: (id: string) => ActionResult;
  /** pedido pela tela "Pedir acesso" precisa do `grant`; pedido pelo link usa o acesso do link */
  approveAccessRequest: (id: string, grant?: AccessGrantInput) => { ok: true; id?: string; token?: string } | { ok: false; error: string };
  rejectAccessRequest: (id: string) => ActionResult;
  acceptInvitation: (token: string, credentials: { name: string; email: string; password: string }) => Promise<ActionResult>;
  extendGuest: (userId: string, days: number) => ActionResult;
  revokeGuest: (userId: string) => ActionResult;

  setBoardMember: (boardId: string, userId: string, role: Exclude<BoardRole, 'owner'>, expiresAt?: number | null) => ActionResult;
  removeBoardMember: (boardId: string, userId: string) => ActionResult;
  setPublicLink: (boardId: string, patch: PublicLinkPatch) => Promise<ActionResult>;
  revokePublicLink: (boardId: string) => ActionResult;
  regeneratePublicLink: (boardId: string) => ActionResult;
  openPublicLink: (boardId: string, token: string, password?: string) => Promise<{ status: PublicLinkStatus; wrongPassword?: boolean }>;
  clearLinkSession: () => void;

  transferBoardOwnership: (fromId: string, toId: string, boardIds: string[]) => ActionResult;
  /** Chat 06 · B: grava no Audit Log a partir de fluxos fora do slice (histórico de versões, backup). */
  recordWorkspaceAudit: (action: WorkspaceAuditAction, message: StoredMessage, meta?: AuditMeta) => void;
  /**
   * Chat 06 · B: aplica um backup `.ludraw-workspace` JÁ validado e com o conteúdo gravado no repositório
   * (ver `utils/workspaceBackup.ts`). Boards locais fora do backup vão para a lixeira; quem restaura continua
   * administrador ativo (não se tranca fora). Exige `workspace.backup.manage`.
   */
  applyWorkspaceBackup: (file: WorkspaceBackupFile) => ActionResult;
}

/* ------------------------------ Padrões e migração ------------------------------ */

export function defaultWorkspace(ownerId: string): WorkspaceEntity {
  return {
    id: LOCAL_WORKSPACE_ID,
    // nome padrão nasce no idioma ativo e depois é dado do usuário
    name: t('workspace.defaults.orgName'),
    slug: 'local',
    allowedEmailDomains: [],
    requireDomainForMembers: false,
    createdAt: Date.now(),
    ownerId,
    policies: { ...DEFAULT_WORKSPACE_POLICIES },
  };
}

/** Garante políticas completas (referência estável enquanto não mudarem). */
export function completeWorkspace(ws: WorkspaceEntity): WorkspaceEntity {
  const full = { ...DEFAULT_WORKSPACE_POLICIES, ...(ws.policies ?? {}) };
  const same = ws.policies && (Object.keys(full) as (keyof WorkspacePolicies)[]).every((k) => ws.policies?.[k] === full[k]);
  return same ? ws : { ...ws, policies: full };
}

export function accountFor(user: { id: string; name: string; email: string; color: string }, role: WorkspaceRole, createdVia: UserAccount['createdVia']): UserAccount {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarColor: user.color,
    status: 'active',
    workspaceRole: role,
    teamIds: [],
    authProvider: 'local',
    lastSeenAt: Date.now(),
    createdVia,
    createdAt: Date.now(),
  };
}

/** Lixeira vencida → excluída de vez (dados do board apagados) + 1 entrada de auditoria do sistema. */
export function purgeExpiredBoards(boards: BoardMeta[], policies: WorkspacePolicies, workspaceId: string, now = Date.now()): { boards: BoardMeta[]; audit: WorkspaceAuditEntry | null } {
  const expired = expiredTrash(boards, policies, now);
  if (!expired.length) return { boards, audit: null };
  expired.forEach((b) => deleteBoardData(b.id));
  const ids = new Set(expired.map((b) => b.id));
  return {
    boards: boards.filter((b) => !ids.has(b.id)),
    audit: {
      ...makeAuditEntry(workspaceId, SYSTEM_ACTOR_ID, 'trash_emptied', { key: 'workspace.audit.msg.trashAutoEmptied', params: { count: expired.length } }, { targetType: 'board', count: expired.length }),
      timestamp: now,
    },
  };
}

/* ------------------------------ Audit Log ------------------------------ */

/**
 * Monta uma entrada do Audit Log. Autor = pessoa REAL da sessão (a simulação não muda a autoria) e
 * só por id — o nome nunca é copiado (a tela resolve no diretório; conta anonimizada → "Usuário removido").
 */
export function makeAuditEntry(workspaceId: string, actorId: string, action: WorkspaceAuditAction, message: StoredMessage, meta: AuditMeta = {}): WorkspaceAuditEntry {
  return { id: createId(10), workspaceId, timestamp: Date.now(), action, message, ...meta, actorId: meta.actorId ?? actorId };
}

/** Atalho: entrada com o workspace e a pessoa real da sessão atual. */
export function auditFrom(s: Pick<AppState, 'workspace' | 'session'>, action: WorkspaceAuditAction, message: StoredMessage, meta: AuditMeta = {}): WorkspaceAuditEntry {
  return makeAuditEntry(s.workspace.id, s.session.userId, action, message, meta);
}

export function appendAudit(log: readonly WorkspaceAuditEntry[], entry: WorkspaceAuditEntry): WorkspaceAuditEntry[] {
  return [entry, ...log].slice(0, AUDIT_LOG_LIMIT);
}

/* ------------------------------ Helpers ------------------------------ */

type SetState = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
type GetState = () => AppState;

const ok = (id?: string): ActionResult => (id ? { ok: true, id } : { ok: true });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const deniedText = (d: PermissionDecision): string => (d.reason ? translateMessage(d.reason) : t('permissions.denied.unknownAction'));

export function policiesOf(s: Pick<AppState, 'workspace'>): WorkspacePolicies {
  return s.workspace.policies ?? DEFAULT_WORKSPACE_POLICIES;
}

export function wsView(s: Pick<AppState, 'workspace' | 'teams' | 'projects' | 'directory'>): WorkspaceView {
  return { teams: s.teams, projects: s.projects, policies: policiesOf(s), directory: s.directory };
}

export function currentViewer(s: Pick<AppState, 'session' | 'teams' | 'directory'>): Viewer {
  return viewerFor(s.session, s);
}

/** Decide uma ação do Workspace para quem está olhando (com "Visualizar como…"). */
export function explainWorkspaceAction(s: AppState, action: PermissionAction) {
  return explain(workspaceContext(currentViewer(s), policiesOf(s)), action);
}

/** Decide uma ação sobre um board fora dele (Mesa). */
export function explainBoardAction(s: AppState, meta: BoardMeta, action: PermissionAction) {
  return explain(boardContextFor(currentViewer(s), meta, wsView(s)), action);
}

/**
 * Templates por escopo (Chat 06): pessoal = só quem criou (templates antigos de sessões sem conta
 * continuam visíveis); Time = membros do time e admins; Workspace = membros internos (admin gerencia).
 */
export function templateAccess(s: AppState, tpl: TemplateEntity): { view: boolean; manage: boolean } {
  const viewer = currentViewer(s);
  const internal = viewer.workspaceRole === 'admin' || viewer.workspaceRole === 'member';
  switch (tpl.scope) {
    case 'personal': {
      const mine = tpl.createdBy === viewer.userId || !s.directory.some((a) => a.id === tpl.createdBy);
      return { view: mine, manage: mine };
    }
    case 'team': {
      const view = internal && !!tpl.teamId && (viewer.workspaceRole === 'admin' || viewer.teamIds.includes(tpl.teamId));
      return { view, manage: view && explainWorkspaceAction(s, 'workspace.templates.team').allowed };
    }
    case 'workspace':
      return { view: internal, manage: explainWorkspaceAction(s, 'workspace.templates.manage').allowed };
    default:
      return { view: true, manage: false };
  }
}

/** Lugar como parâmetro de mensagem (nomes de time/projeto são conteúdo do usuário). */
export function placeParam(place: Place, s: Pick<AppState, 'teams' | 'projects' | 'workspace'>): StoredMessage | string {
  return rulesPlaceParam(place, s);
}

/** O pedaço do estado que as regras compartilhadas enxergam. */
export function rulesStateOf(s: Pick<AppState, 'workspace' | 'directory' | 'teams' | 'projects' | 'invitations' | 'boards'> & Partial<Pick<AppState, 'inviteLinks' | 'accessRequests'>>): WorkspaceRulesState {
  return { workspace: s.workspace, directory: s.directory, teams: s.teams, projects: s.projects, invitations: s.invitations, boards: s.boards, inviteLinks: s.inviteLinks ?? [], accessRequests: s.accessRequests ?? [] };
}

/** Ambiente das regras no modo local (ids curtos, nome anonimizado no idioma ativo). */
function localEnv(token?: string) {
  return {
    now: Date.now(),
    newId: () => createId(10),
    newToken: () => token ?? randomToken(32),
    anonymizedName: (userId: string) => t('workspace.anonymized.name', { code: userId.slice(0, 4).toUpperCase() }),
  };
}

/* ------------------------------ Modo Servidor (Chat 07 · B) ------------------------------ */

/**
 * Ponte para o servidor, registrada por `utils/serverSync.ts` no boot do Modo Servidor (o slice não importa
 * a API para não criar ciclo de módulos). Sem ponte = Modo Local.
 */
export interface ServerBridge {
  /** Envia a operação JÁ aplicada aqui; o servidor reaplica as mesmas regras e devolve o estado oficial. */
  sendOp(op: WorkspaceOp): void;
  /** Link público com senha: a senha vai em texto (HTTPS) e o servidor faz o hash. */
  setPublicLink(boardId: string, patch: Omit<PublicLinkPatch, 'password'>, password: string | null | undefined, token: string): Promise<ActionResult>;
  openPublicLink(boardId: string, token: string, password?: string): Promise<{ status: PublicLinkStatus; wrongPassword?: boolean }>;
  acceptInvitation(token: string, credentials: { name: string; email: string; password: string }): Promise<ActionResult>;
}

let serverBridge: ServerBridge | null = null;
export function setServerBridge(bridge: ServerBridge | null): void {
  serverBridge = bridge;
}

/** Operações que criam algo levam o id/token propostos daqui (os mesmos no cliente e no servidor). */
function withClientValues(op: WorkspaceOp): { op: WorkspaceOp; clientId?: string; token?: string } {
  switch (op.type) {
    case 'createTeam':
    case 'createProject': {
      const clientId = createId(16);
      return { op: { ...op, clientId }, clientId };
    }
    case 'createInvitation':
    case 'createInviteLink':
    case 'approveAccessRequest': {
      const clientId = createId(16);
      const token = randomToken(32);
      return { op: { ...op, clientId, token }, clientId, token };
    }
    case 'regeneratePublicLink': {
      const token = randomToken(32);
      return { op: { ...op, token }, token };
    }
    default:
      return { op };
  }
}

/* ------------------------------ Slice ------------------------------ */

export function createWorkspaceSlice(set: SetState, get: GetState): WorkspaceSlice {
  const record = (action: WorkspaceAuditAction, message: StoredMessage, meta: AuditMeta = {}) => {
    const entry = auditFrom(get(), action, message, meta);
    set((st) => ({ auditLog: appendAudit(st.auditLog, entry) }));
  };

  const check = (action: PermissionAction): string | null => {
    const d = explainWorkspaceAction(get(), action);
    return d.allowed ? null : deniedText(d);
  };

  /** Grava o resultado das regras: estado (só o que mudou), Audit Log e conteúdo de boards excluídos. */
  const commit = (r: Extract<RuleResult, { ok: true }>) => {
    const s = get();
    const patch: Partial<AppState> = {};
    if (r.state.workspace !== s.workspace) patch.workspace = r.state.workspace;
    if (r.state.directory !== s.directory) patch.directory = r.state.directory;
    if (r.state.teams !== s.teams) patch.teams = r.state.teams;
    if (r.state.projects !== s.projects) patch.projects = r.state.projects;
    if (r.state.invitations !== s.invitations) patch.invitations = r.state.invitations;
    // Chat 08.5 · B: o token do link novo fica só no resultado da ação (nunca no estado guardado)
    if (r.state.inviteLinks && r.state.inviteLinks !== s.inviteLinks) patch.inviteLinks = r.state.inviteLinks.map(({ token: _token, ...l }) => l);
    if (r.state.accessRequests && r.state.accessRequests !== s.accessRequests) patch.accessRequests = r.state.accessRequests;
    if (r.state.boards !== s.boards) patch.boards = r.state.boards;
    if (Object.keys(patch).length) set(patch);
    r.purgedBoardIds?.forEach((id) => deleteBoardData(id));
    r.audit.forEach((a: AuditDraft) => record(a.action, a.message, a.meta));
  };

  /**
   * Roda uma ação pelas regras compartilhadas e grava o resultado. No Modo Servidor, a mesma operação (com os
   * mesmos id/token) segue para o servidor, que é quem decide de verdade; recusa lá = aviso + estado oficial.
   */
  const run = (raw: WorkspaceOp, token?: string): Extract<RuleResult, { ok: true }> | { ok: false; error: string } => {
    const s = get();
    const prepared = serverBridge ? withClientValues(raw) : { op: raw };
    const env = localEnv(prepared.token ?? token);
    if (prepared.clientId) {
      const id = prepared.clientId;
      let used = false;
      env.newId = () => (used ? createId(10) : ((used = true), id));
    }
    const r = applyWorkspaceOp(rulesStateOf(s), prepared.op, { viewer: currentViewer(s), actorId: s.session.userId, simulating: !!s.session.viewAs }, env);
    if (!r.ok) return fail(translateMessage(r.error));
    commit(r);
    serverBridge?.sendOp(prepared.op);
    return r;
  };
  /** Ações que só existem no Modo Local (usuários simulados, backup do navegador). */
  const localOnly = (): { ok: false; error: string } | null => (isServerMode() ? fail(t('server.client.localOnly')) : null);
  /** Chat 08.5 · B: o contrário — links gerais e fila de pedidos só existem com servidor. */
  const serverOnly = (): { ok: false; error: string } | null => (isServerMode() ? null : fail(t('server.client.serverOnly')));
  const simple = (op: WorkspaceOp): ActionResult => {
    const r = run(op);
    return r.ok ? ok(r.id) : r;
  };

  return {
    workspace: defaultWorkspace('local'),
    directory: [],
    teams: [],
    projects: [],
    invitations: [],
    inviteLinks: [],
    accessRequests: [],
    auditLog: [],
    currentPlace: { kind: 'personal' },
    linkSession: null,
    localGuestId: null,

    /* ---------------- Organização e políticas ---------------- */
    updateWorkspace: (patch) => simple({ type: 'updateWorkspace', patch }),
    updatePolicies: (patch) => simple({ type: 'updatePolicies', patch }),

    /* ---------------- Times ---------------- */
    createTeam: (input) => simple({ type: 'createTeam', input }),
    updateTeam: (id, patch) => simple({ type: 'updateTeam', id, patch }),
    setTeamArchived: (id, archived) => {
      const r = run({ type: 'setTeamArchived', id, archived });
      if (!r.ok) return r;
      // a Mesa que estava olhando o time arquivado volta ao Espaço Pessoal
      if (archived) set((s) => (s.currentPlace.kind === 'team' && s.currentPlace.teamId === id ? { currentPlace: { kind: 'personal' } } : {}));
      return ok(r.id);
    },
    setTeamMembers: (id, memberIds) => simple({ type: 'setTeamMembers', id, memberIds }),

    /* ---------------- Projetos ---------------- */
    createProject: (input) => simple({ type: 'createProject', input }),
    updateProject: (id, patch) => simple({ type: 'updateProject', id, patch }),
    setProjectArchived: (id, archived) => {
      const project = get().projects.find((p) => p.id === id);
      const r = run({ type: 'setProjectArchived', id, archived });
      if (!r.ok) return r;
      if (archived && project) set((s) => (s.currentPlace.kind === 'team' && s.currentPlace.projectId === id ? { currentPlace: { kind: 'team', teamId: project.teamId } } : {}));
      return ok(r.id);
    },
    moveProject: (id, teamId) => simple({ type: 'moveProject', id, teamId }),

    /* ---------------- Boards: lugar, lixeira ---------------- */
    setCurrentPlace: (place) => set({ currentPlace: place }),
    moveBoard: (boardId, place) => simple({ type: 'moveBoard', boardId, place }),
    restoreBoard: (id) => simple({ type: 'restoreBoard', id }),
    purgeBoard: (id) => simple({ type: 'purgeBoard', id }),
    emptyTrash: () => simple({ type: 'emptyTrash' }),

    /* ---------------- Contas ---------------- */
    setAccountRole: (id, role) => {
      const r = run({ type: 'setAccountRole', id, role });
      if (!r.ok) return r;
      // a sessão relê o papel do diretório
      if (id === get().session.userId) set((st) => ({ session: { ...st.session, workspaceRole: role } }));
      return ok(r.id);
    },
    suspendAccount: (id) => simple({ type: 'suspendAccount', id }),
    reactivateAccount: (id) => simple({ type: 'reactivateAccount', id }),
    removeAccount: (id) => {
      const r = run({ type: 'removeAccount', id });
      if (!r.ok) return r;
      // credenciais locais saem: a conta não entra mais
      set((st) => ({ accounts: st.accounts.filter((la: LocalAccount) => la.id !== id) }));
      return ok(r.id);
    },

    addSimulatedUsers: () => {
      const only = localOnly();
      if (only) return only;
      const denied = check('workspace.members.manage');
      if (denied) return fail(denied);
      const s = get();
      const domain = s.workspace.allowedEmailDomains[0] ?? 'org.invalid';
      // nomes nascem no idioma ativo e depois são dados (não mudam ao trocar o idioma)
      const people: { name: string; role: WorkspaceRole; domain: string }[] = [
        { name: t('workspace.simulated.member1'), role: 'member', domain },
        { name: t('workspace.simulated.member2'), role: 'member', domain },
        { name: t('workspace.simulated.guest'), role: 'guest_b2b', domain: 'partner.invalid' },
      ];
      const created: UserAccount[] = [];
      for (const p of people) {
        const email = `${slugify(p.name).replace(/-/g, '.')}@${p.domain}`;
        if (s.directory.some((a) => a.email === email && a.status !== 'removed')) continue;
        const id = createId();
        created.push({
          ...accountFor({ id, name: p.name, email, color: colorFromString(p.name) }, p.role, 'simulated'),
          simulated: true,
          invitedBy: s.session.userId,
          lastSeenAt: null,
          guestExpiresAt: p.role === 'guest_b2b' && policiesOf(s).guestDefaultExpiryDays ? Date.now() + (policiesOf(s).guestDefaultExpiryDays as number) * DAY_MS : null,
        });
      }
      if (!created.length) return ok();
      set((st) => ({ directory: [...st.directory, ...created] }));
      record('member_joined', { key: 'workspace.audit.msg.simulatedAdded', params: { count: created.length } }, { targetType: 'user', count: created.length });
      return ok();
    },

    removeSimulatedUsers: () => {
      const only = localOnly();
      if (only) return only;
      const denied = check('workspace.members.manage');
      if (denied) return fail(denied);
      const s = get();
      const sims = s.directory.filter((a) => a.simulated);
      if (!sims.length) return ok();
      const ids = new Set(sims.map((a) => a.id));
      const me = s.directory.find((a) => a.id === s.session.userId);
      let rs = rulesStateOf(s);
      for (const id of ids) rs = { ...rs, ...stripGrants(rs, id) };
      // boards que tinham passado para um simulado voltam para quem está removendo
      const returned = rs.boards.filter((b) => ids.has(b.ownerId)).length;
      const boards = rs.boards.map((b) => (ids.has(b.ownerId) ? { ...b, ownerId: s.session.userId, ownerName: me?.name ?? b.ownerName } : b));
      set({
        teams: rs.teams,
        projects: rs.projects,
        boards,
        directory: s.directory.filter((a) => !ids.has(a.id)),
        // "Visualizar como" um simulado removido volta para "eu mesmo"
        session: s.session.viewAs?.simulatedUserId && ids.has(s.session.viewAs.simulatedUserId) ? { ...s.session, viewAs: null } : s.session,
      });
      record('member_removed', { key: 'workspace.audit.msg.simulatedRemoved', params: { count: ids.size, boards: returned } }, { targetType: 'user', count: ids.size });
      return ok();
    },

    /* ---------------- Convites ---------------- */
    createInvitation: (input) => {
      const r = run({ type: 'createInvitation', input });
      if (!r.ok) return r;
      return { ok: true, id: r.id as string, token: r.token as string };
    },
    revokeInvitation: (id) => simple({ type: 'revokeInvitation', id }),
    createInviteLink: (input) => {
      const only = serverOnly();
      if (only) return only;
      const r = run({ type: 'createInviteLink', input });
      if (!r.ok) return r;
      return { ok: true, id: r.id as string, token: r.token as string };
    },
    revokeInviteLink: (id) => serverOnly() ?? simple({ type: 'revokeInviteLink', id }),
    approveAccessRequest: (id, grant) => {
      const only = serverOnly();
      if (only) return only;
      const r = run(grant ? { type: 'approveAccessRequest', id, grant } : { type: 'approveAccessRequest', id });
      if (!r.ok) return r;
      return { ok: true, id: r.id, token: r.token };
    },
    rejectAccessRequest: (id) => serverOnly() ?? simple({ type: 'rejectAccessRequest', id }),

    acceptInvitation: async (token, { name, email, password }) => {
      if (serverBridge) return serverBridge.acceptInvitation(token, { name, email, password });
      const s = get();
      const inv = s.invitations.find((i) => i.token === token);
      const invalid = validateInvitationAcceptance(rulesStateOf(s), inv, email, Date.now());
      if (invalid || !inv) return fail(translateMessage(invalid ?? { key: 'workspace.errors.inviteNotFound' }));
      const normalized = email.trim().toLowerCase();

      // conta local: entra com a existente (senha confere) ou cria uma nova
      const hash = await sha256(`${normalized}:${password}`);
      let local = s.accounts.find((a) => a.email === normalized);
      if (local) {
        if (local.passwordHash !== hash) return fail(t('common.useAppStore.wrongPasswordTryAgain'));
      } else {
        if (!name.trim()) return fail(t('workspace.errors.nameRequired'));
        local = { id: createId(), name: name.trim(), email: normalized, passwordHash: hash, createdAt: Date.now() };
      }
      const localAccount = local;
      const color = colorFromString(localAccount.name || localAccount.email);
      const r = applyInvitationAcceptance(rulesStateOf(get()), inv, { id: localAccount.id, name: localAccount.name, email: localAccount.email, avatarColor: color }, localEnv());
      if (!r.ok) return fail(translateMessage(r.error));
      commit(r);
      const role = r.state.directory.find((a) => a.id === localAccount.id)?.workspaceRole ?? inv.role;
      set((st) => ({
        accounts: st.accounts.some((a) => a.id === localAccount.id) ? st.accounts : [...st.accounts, localAccount],
        user: { id: localAccount.id, name: localAccount.name, email: localAccount.email, guest: false, color },
        session: { userId: localAccount.id, userName: localAccount.name, workspaceRole: role, viewAs: null },
        currentPlace: role === 'guest_b2b' ? { kind: 'shared' } : st.currentPlace,
      }));
      return ok(localAccount.id);
    },

    extendGuest: (userId, days) => simple({ type: 'extendGuest', userId, days }),
    revokeGuest: (userId) => simple({ type: 'revokeGuest', userId }),

    /* ---------------- ACL e link público ---------------- */
    setBoardMember: (boardId, userId, role, expiresAt) => simple({ type: 'setBoardMember', boardId, userId, role, expiresAt }),
    removeBoardMember: (boardId, userId) => simple({ type: 'removeBoardMember', boardId, userId }),

    setPublicLink: async (boardId, patch) => {
      const meta = get().boards.find((b) => b.id === boardId);
      // a senha é ligada ao token: com link novo o token nasce aqui para entrar no hash
      const token = meta?.publicLink?.token || randomToken(32);
      if (serverBridge) {
        const { password, ...rest } = patch;
        return serverBridge.setPublicLink(boardId, rest, password, token);
      }
      const passwordHash = patch.password === undefined ? undefined : patch.password ? await sha256(`${token}:${patch.password}`) : null;
      const { password: _password, ...rest } = patch;
      void _password;
      const r = run({ type: 'setPublicLink', boardId, patch: { ...rest, ...(passwordHash !== undefined ? { passwordHash } : {}) } }, token);
      return r.ok ? ok(r.id) : r;
    },

    revokePublicLink: (boardId) => {
      const r = run({ type: 'revokePublicLink', boardId });
      if (!r.ok) return r;
      set((s) => (s.linkSession?.boardId === boardId ? { linkSession: null } : {}));
      return ok(r.id);
    },

    regeneratePublicLink: (boardId) => {
      const r = run({ type: 'regeneratePublicLink', boardId });
      if (!r.ok) return r;
      set((st) => (st.linkSession?.boardId === boardId ? { linkSession: null } : {}));
      return ok(r.id);
    },

    openPublicLink: async (boardId, token, password) => {
      if (serverBridge) return serverBridge.openPublicLink(boardId, token, password);
      const s = get();
      const meta = s.boards.find((b) => b.id === boardId);
      const policies = policiesOf(s);
      let status = resolvePublicLink(meta, token, policies, false);
      let wrongPassword = false;
      if (status === 'password' && password !== undefined && meta?.publicLink?.passwordHash) {
        const hash = await sha256(`${token}:${password}`);
        if (hash === meta.publicLink.passwordHash) status = resolvePublicLink(meta, token, policies, true);
        else wrongPassword = true;
      }
      if (status === 'ok' && meta?.publicLink) {
        const link = meta.publicLink;
        set((st) => ({
          linkSession: { boardId, token, accessLevel: link.accessLevel, allowDownload: link.allowDownload },
          boards: st.boards.map((b) => (b.id === boardId && b.publicLink ? { ...b, publicLink: { ...b.publicLink, lastUsedAt: Date.now() } } : b)),
        }));
      } else if (get().linkSession?.boardId === boardId) {
        set({ linkSession: null });
      }
      return { status, wrongPassword };
    },

    clearLinkSession: () => set({ linkSession: null }),

    recordWorkspaceAudit: (action, message, meta) => record(action, message, meta),

    applyWorkspaceBackup: (file) => {
      const only = localOnly();
      if (only) return only;
      const denied = check('workspace.backup.manage');
      if (denied) return fail(denied);
      const s = get();
      const now = Date.now();
      const inBackup = new Set(file.boards.map((b) => b.id));
      // boards daqui que não estão no backup: lixeira (recuperáveis), nunca apagados na hora
      const kept = s.boards.filter((b) => !inBackup.has(b.id)).map((b) => (b.deletedAt ? b : { ...b, deletedAt: now, deletedBy: s.session.userId }));
      const me = s.directory.find((a) => a.id === s.session.userId);
      let directory = file.directory.map((a) => ({ ...a }));
      if (me) {
        const restorer = { ...me, workspaceRole: 'admin' as const, status: 'active' as const, isolated: false };
        directory = directory.some((a) => a.id === me.id) ? directory.map((a) => (a.id === me.id ? { ...a, workspaceRole: 'admin', status: 'active', isolated: false } : a)) : [...directory, restorer];
      }
      set({
        // uma instalação = uma organização: o id local continua o mesmo
        workspace: completeWorkspace({ ...file.workspace, id: s.workspace.id }),
        directory,
        teams: file.teams,
        projects: file.projects,
        templates: file.templates,
        boards: [...file.boards, ...kept],
        auditLog: file.auditLog.slice(0, AUDIT_LOG_LIMIT),
        currentPlace: { kind: 'personal' },
        session: { ...s.session, workspaceRole: 'admin', viewAs: null },
      });
      record('workspace_backup_restored', { key: 'workspace.audit.msg.backupRestored', params: { count: file.boards.length, trashed: kept.filter((b) => b.deletedAt === now).length } }, {
        targetType: 'workspace',
        targetId: s.workspace.id,
        count: file.boards.length,
        changes: [{ field: 'exportedAt', before: null, after: file.exportedAt }],
      });
      return ok();
    },

    /* ---------------- Transferência de propriedade ---------------- */
    transferBoardOwnership: (fromId, toId, boardIds) => simple({ type: 'transferBoardOwnership', fromId, toId, boardIds }),
  };
}
