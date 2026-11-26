/**
 * LuDraw — Motor ÚNICO de permissões (ARCHITECTURE_MAP.md §5) — Chat 02 · Rodada B.
 *
 * Funções PURAS: sem DOM, sem React, sem stores. O servidor do Chat 07 importa este mesmo
 * arquivo e reaplica as regras (local ≠ seguro: no modo offline a UI apenas aplica as regras;
 * a fronteira real de segurança é o servidor).
 *
 * PROIBIDO espalhar `if (role === 'admin')` pela UI ou pelo store: toda checagem passa por
 * `can(ctx, action)` / `explain(ctx, action)`.
 *
 * Chat 05.6: os motivos saem como **chave + parâmetros** (`MessageDescriptor`, catálogo
 * `src/locales/<idioma>/permissions.json`). A UI (`useCan`, `ensure`) traduz; o servidor do Chat 07
 * devolve o mesmo descritor como código de erro. Este arquivo continua sem dependência de execução
 * do motor de i18n (só importa tipos).
 */

import type { AccountStatus, BoardRole, PublicShareLink, WorkspacePolicies, WorkspaceRole } from '../types/workspace';
import type { CanvasElement, LockMode, StickyNoteElement } from '../types/canvas';
import type { MessageDescriptor, TKey } from '../i18n/types';

export type PermissionAction =
  | 'board.view'
  | 'board.comment'
  | 'board.edit'
  | 'board.delete'
  | 'board.move'
  | 'board.share'
  | 'board.transferOwnership'
  | 'board.restoreSnapshot'
  | 'board.export'
  | 'board.clearActivityLog'
  | 'element.lockStandard'
  | 'element.unlockStandard'
  | 'element.lockProtected'
  | 'element.unlockProtected'
  | 'privateMode.toggle'
  | 'privateMode.reveal'
  | 'voting.manage'
  | 'voting.cast'
  | 'timer.manage'
  | 'followMe.lead'
  /** Chat 03 · Rodada B: ocultar/mostrar o conteúdo de um Frame (dinâmicas do facilitador) */
  | 'frame.toggleHidden'
  /** Chat 04: excluir uma thread de comentário — o autor (comentador+) ou quem edita o board */
  | 'comment.delete'
  /** Chat 06: criar/editar/revogar o link público de Visitor (= board.share + política allowPublicLinks) */
  | 'board.publicLink'
  /* ---- Chat 06: ações do Workspace (WORKSPACE_ADMIN_SPEC §4) — não dependem do papel no board ---- */
  /** Entrar em #/admin (só admin) */
  | 'workspace.admin.view'
  /** Mudar papel, suspender/reativar, remover (anonimizar) contas (só admin) */
  | 'workspace.members.manage'
  /** Convidar colegas como membros (admin ou membro) */
  | 'workspace.members.invite'
  /** Convidar clientes/parceiros B2B (política allowGuests; membro também precisa de allowMembersInviteGuests) */
  | 'workspace.guests.invite'
  /** Criar/renomear/arquivar Times e gerenciar seus membros (só admin) */
  | 'workspace.teams.manage'
  /** Criar Projetos (admin; membro se a política allowMembersCreateTeams permitir) */
  | 'workspace.projects.create'
  /** Criar boards (admin ou membro; convidados e visitantes nunca criam estrutura) */
  | 'workspace.boards.create'
  /** Políticas, organização e domínios (só admin) */
  | 'workspace.policies.manage'
  /** Ver e exportar o Audit Log do Workspace (só admin) */
  | 'workspace.audit.view'
  /** Lixeira do workspace inteiro: restaurar e excluir definitivamente (só admin) */
  | 'workspace.trash.manage'
  /** Transferência de propriedade em massa (só admin) */
  | 'workspace.ownership.transfer'
  /** Templates do Workspace (só admin) */
  | 'workspace.templates.manage'
  /** Templates do Time (admin ou membro do time) */
  | 'workspace.templates.team'
  /** Chat 06 · B: exportar/restaurar o backup completo do Workspace (só admin) */
  | 'workspace.backup.manage'
  /** Usar extensões (política allowExtensions ≠ 'none'; visitante nunca) — Chat 06.5 */
  | 'extensions.use'
  /** Chat 06.5: instalar, remover, ativar e desativar extensões neste navegador (membros internos e conta isolada) */
  | 'extensions.manage'
  /** Chat 06.5: extensões programáveis (Nível 2) e pacotes de pasta local (modo dev) — só com allowExtensions 'all' */
  | 'extensions.useScripts';

export interface PermissionContext {
  userId: string;
  workspaceRole: WorkspaceRole;
  /** Vem de BoardMeta.members (ACL) ou do nível do link público */
  boardRole?: BoardRole | null;
  isBoardOwner: boolean;
  /** owner || admin || userId ∈ BoardData.facilitatorIds (owner/admin também são implícitos aqui) */
  isFacilitator: boolean;
  /** Só quando workspaceRole === 'visitor' */
  shareAccessLevel?: PublicShareLink['accessLevel'];
  policies?: Partial<WorkspacePolicies>;
  /** Para element.unlock*: quem travou */
  lockedBy?: string | null;
  /** Para comment.delete: userId de quem abriu a thread (Chat 04) */
  authorId?: string | null;
  /**
   * Para board.export de visitantes: `PublicShareLink.allowDownload`. `true` libera, `false` nega e
   * ausente segue `WorkspacePolicies.allowViewerExport` (que por padrão é desligada) — Chat 05.
   */
  allowDownload?: boolean;
  /**
   * Chat 06: `false` = a pessoa não alcança este board pela hierarquia (Espaço Pessoal alheio, time de que
   * não participa, board na lixeira, conta suspensa, convidado vencido) → sem papel, mesmo sendo membro.
   * Ausente = alcança (retrocompatível). O titular do board sempre alcança.
   */
  boardAccess?: boolean;
  /**
   * Emenda v1.1 §11: conta do modo "Continuar sem conta" (espaço isolado, sem participação na organização).
   * Só cria e edita os próprios boards; não convida, não compartilha, não cria estrutura nem administra.
   */
  isolated?: boolean;
}

/** Simulador local "Visualizar como…" (Régua) — só altera o contexto de permissão, nunca os dados. */
export interface ViewAsProfile {
  /** ex.: "Visitante (comentador)" — identificador estável do perfil simulado (pt-BR) */
  label: string;
  /** Chave do rótulo exibido (Chat 05.6); ausente em sessões antigas → mostra `label` */
  labelKey?: TKey;
  workspaceRole: WorkspaceRole;
  boardRole?: BoardRole;
  shareAccessLevel?: PublicShareLink['accessLevel'];
  isFacilitator: boolean;
  /**
   * Chat 06: simula uma conta específica do diretório (usuário simulado do modo local).
   * O `label` é o nome da conta (conteúdo, sem tradução) e não há `labelKey`.
   */
  simulatedUserId?: string;
}

/** Perfis oferecidos no menu "Visualizar como…" (null = "Eu mesmo"). */
export const VIEW_AS_PROFILES: { id: string; profile: ViewAsProfile; description: string; descriptionKey: TKey }[] = [
  { id: 'member', profile: { label: 'Membro', labelKey: 'permissions.viewAs.member', workspaceRole: 'member', boardRole: 'editor', isFacilitator: false }, description: 'Membro do time com acesso de edição', descriptionKey: 'permissions.viewAs.memberDescription' },
  { id: 'guest', profile: { label: 'Convidado B2B', labelKey: 'permissions.viewAs.guest', workspaceRole: 'guest_b2b', boardRole: 'editor', isFacilitator: false }, description: 'Cliente/parceiro convidado só para este board', descriptionKey: 'permissions.viewAs.guestDescription' },
  { id: 'visitor-viewer', profile: { label: 'Visitante (leitor)', labelKey: 'permissions.viewAs.visitorViewer', workspaceRole: 'visitor', shareAccessLevel: 'viewer', isFacilitator: false }, description: 'Link público, só visualiza', descriptionKey: 'permissions.viewAs.visitorViewerDescription' },
  { id: 'visitor-commenter', profile: { label: 'Visitante (comentador)', labelKey: 'permissions.viewAs.visitorCommenter', workspaceRole: 'visitor', shareAccessLevel: 'commenter', isFacilitator: false }, description: 'Link público, comenta e vota', descriptionKey: 'permissions.viewAs.visitorCommenterDescription' },
  { id: 'visitor-editor', profile: { label: 'Visitante (editor)', labelKey: 'permissions.viewAs.visitorEditor', workspaceRole: 'visitor', shareAccessLevel: 'editor', isFacilitator: false }, description: 'Link público com edição temporária', descriptionKey: 'permissions.viewAs.visitorEditorDescription' },
];

/** Padrões seguros quando o Workspace não define políticas. */
export const DEFAULT_WORKSPACE_POLICIES: WorkspacePolicies = {
  allowPublicLinks: true,
  maxPublicLinkLifetimeDays: null,
  requirePasswordOnPublicLinks: false,
  allowGuests: true,
  guestDefaultExpiryDays: 30,
  /** Chat 05: negar por padrão — leitores/comentadores só exportam com permissão explícita (link ou política). */
  allowViewerExport: false,
  allowMembersCreateTeams: true,
  allowMembersInviteGuests: true,
  snapshotRetentionDays: 30,
  autoSnapshotIntervalMin: 15,
  trashRetentionDays: 30,
  /** Chat 06 (EXTENSIONS_SPEC §8): no modo local, todas */
  allowExtensions: 'all',
  extensionAllowlist: [],
};

const ROLE_RANK: Record<BoardRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

/** Chave do nome de cada papel do workspace (a UI traduz com `t()`). */
export const WORKSPACE_ROLE_LABEL_KEYS: Record<WorkspaceRole, TKey> = {
  admin: 'permissions.roles.workspace.admin',
  member: 'permissions.roles.workspace.member',
  guest_b2b: 'permissions.roles.workspace.guestB2b',
  visitor: 'permissions.roles.workspace.visitor',
};

/** Chave do nome de cada papel no board, em minúsculas para entrar no meio das frases. */
export const BOARD_ROLE_LABEL_KEYS: Record<BoardRole, TKey> = {
  owner: 'permissions.roles.board.owner',
  editor: 'permissions.roles.board.editor',
  commenter: 'permissions.roles.board.commenter',
  viewer: 'permissions.roles.board.viewer',
};

/**
 * Papel efetivo no board: admin → owner; member → owner (se titular), papel da ACL ou editor;
 * guest_b2b → somente o papel da ACL (sem ACL ⇒ null ⇒ sem acesso); visitor → nível do link.
 */
export function effectiveBoardRole(ctx: PermissionContext): BoardRole | null {
  if (ctx.boardAccess === false && !ctx.isBoardOwner) return null;
  switch (ctx.workspaceRole) {
    case 'admin':
      return 'owner';
    case 'member':
      if (ctx.isBoardOwner) return 'owner';
      return ctx.boardRole ?? 'editor';
    case 'guest_b2b':
      if (ctx.isBoardOwner) return 'owner';
      return ctx.boardRole ?? null;
    case 'visitor':
      return ctx.shareAccessLevel ?? null;
    default:
      return null;
  }
}

function atLeast(role: BoardRole | null, min: BoardRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** owner/admin são facilitadores implícitos; os demais só se estiverem em facilitatorIds (ctx.isFacilitator). */
export function isFacilitator(ctx: PermissionContext): boolean {
  return effectiveBoardRole(ctx) === 'owner' || ctx.isFacilitator;
}

/** Sujeito das frases de negação ("Visitantes com acesso de leitor…"), como mensagem a traduzir. */
function who(ctx: PermissionContext): MessageDescriptor {
  const role = effectiveBoardRole(ctx);
  const roleMsg = (r: BoardRole): MessageDescriptor => ({ key: BOARD_ROLE_LABEL_KEYS[r] });
  if (ctx.workspaceRole === 'visitor') return role ? { key: 'permissions.who.visitorsWithRole', params: { role: roleMsg(role) } } : { key: 'permissions.who.visitorsNoLink' };
  if (ctx.workspaceRole === 'guest_b2b') return role ? { key: 'permissions.who.guestsWithRole', params: { role: roleMsg(role) } } : { key: 'permissions.who.guestsNotInvited' };
  if (role && role !== 'owner') return { key: 'permissions.who.anyoneWithRole', params: { role: roleMsg(role) } };
  return { key: 'permissions.who.yourProfile' };
}

/** Resultado do motor: permitido ou negado com o motivo como chave + parâmetros. */
export type PermissionDecision = { allowed: boolean; reason?: MessageDescriptor };
type Decision = PermissionDecision;
const allow: Decision = { allowed: true };
const deny = (key: TKey, params?: MessageDescriptor['params']): Decision => ({ allowed: false, reason: params ? { key, params } : { key } });

/** Chat 06: ações do Workspace — decididas só por `workspaceRole` + políticas (sem papel no board). */
const WORKSPACE_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>([
  'workspace.admin.view',
  'workspace.members.manage',
  'workspace.members.invite',
  'workspace.guests.invite',
  'workspace.teams.manage',
  'workspace.projects.create',
  'workspace.boards.create',
  'workspace.policies.manage',
  'workspace.audit.view',
  'workspace.trash.manage',
  'workspace.ownership.transfer',
  'workspace.templates.manage',
  'workspace.templates.team',
  'workspace.backup.manage',
  'extensions.use',
  'extensions.manage',
  'extensions.useScripts',
]);

/** Ações exclusivas de administrador do Workspace (WORKSPACE_ADMIN_SPEC §4). */
const ADMIN_ONLY_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>([
  'workspace.admin.view',
  'workspace.members.manage',
  'workspace.teams.manage',
  'workspace.policies.manage',
  'workspace.audit.view',
  'workspace.trash.manage',
  'workspace.ownership.transfer',
  'workspace.templates.manage',
  'workspace.backup.manage',
]);

export function isWorkspaceAction(action: PermissionAction): boolean {
  return WORKSPACE_ACTIONS.has(action);
}

function explainWorkspace(ctx: PermissionContext, action: PermissionAction, policies: WorkspacePolicies): Decision {
  const role = ctx.workspaceRole;
  const internal = role === 'admin' || role === 'member';
  if (ctx.isolated && action !== 'workspace.boards.create' && !action.startsWith('extensions.')) return deny('permissions.denied.isolatedOffline');
  if (ADMIN_ONLY_ACTIONS.has(action)) return role === 'admin' ? allow : deny('permissions.denied.adminOnly');
  switch (action) {
    case 'workspace.projects.create':
      if (role === 'admin') return allow;
      if (role === 'member') return policies.allowMembersCreateTeams ? allow : deny('permissions.denied.projectsPolicy');
      return deny('permissions.denied.membersOnly');
    case 'workspace.boards.create':
    case 'workspace.members.invite':
    case 'workspace.templates.team':
      return internal ? allow : deny('permissions.denied.membersOnly');
    case 'workspace.guests.invite':
      if (!internal) return deny('permissions.denied.membersOnly');
      if (!policies.allowGuests) return deny('permissions.denied.guestsDisabled');
      if (role === 'admin' || policies.allowMembersInviteGuests) return allow;
      return deny('permissions.denied.guestInvitePolicy');
    case 'extensions.use':
    case 'extensions.manage':
    case 'extensions.useScripts':
      // Chat 06.5 (ARCHITECTURE_MAP §5): visitante de link público nunca usa extensões
      if (role === 'visitor') return deny('permissions.denied.extensionsVisitor');
      if (policies.allowExtensions === 'none') return deny('permissions.denied.extensionsDisabled');
      if (action === 'extensions.manage' && !internal && !ctx.isolated) return deny('permissions.denied.extensionsManage');
      if (action === 'extensions.useScripts' && (policies.allowExtensions ?? 'all') !== 'all') return deny('permissions.denied.extensionsScriptsPolicy');
      return allow;
    default:
      return deny('permissions.denied.unknownAction');
  }
}

/** Decide e explica (motivo como chave + parâmetros; a UI traduz para toast/tooltip). */
export function explain(ctx: PermissionContext, action: PermissionAction): Decision {
  const role = effectiveBoardRole(ctx);
  const policies = { ...DEFAULT_WORKSPACE_POLICIES, ...(ctx.policies ?? {}) };
  const facilitator = isFacilitator(ctx);

  // Chat 06: ações do Workspace vêm antes do papel no board (um convidado sem board ainda pode ser avaliado)
  if (WORKSPACE_ACTIONS.has(action)) return explainWorkspace(ctx, action, policies);

  if (role === null) return deny('permissions.denied.noAccess');

  switch (action) {
    case 'board.view':
      return allow;

    case 'board.comment':
    case 'voting.cast':
      return atLeast(role, 'commenter') ? allow : deny('permissions.denied.viewOnly', { who: who(ctx) });

    case 'board.edit':
    case 'element.lockStandard':
    case 'element.unlockStandard':
      return atLeast(role, 'editor') ? allow : deny('permissions.denied.cannotEdit', { who: who(ctx) });

    case 'element.lockProtected':
      if (role === 'owner') return allow;
      if (role === 'editor' && facilitator) return allow;
      return deny('permissions.denied.lockProtected');

    case 'element.unlockProtected':
      if (ctx.workspaceRole === 'visitor' || ctx.workspaceRole === 'guest_b2b') {
        return deny('permissions.denied.unlockProtectedGuests');
      }
      if (role === 'owner') return allow;
      if (role === 'editor' && (facilitator || (!!ctx.lockedBy && ctx.lockedBy === ctx.userId))) return allow;
      return deny('permissions.denied.unlockProtected');

    case 'privateMode.toggle':
    case 'privateMode.reveal':
    case 'voting.manage':
    case 'timer.manage':
    case 'followMe.lead':
    case 'frame.toggleHidden':
      if (role === 'owner') return allow;
      if (role === 'editor' && facilitator) return allow;
      return deny('permissions.denied.facilitatorsOnly');

    case 'comment.delete':
      if (atLeast(role, 'editor')) return allow;
      if (atLeast(role, 'commenter') && !!ctx.authorId && ctx.authorId === ctx.userId) return allow;
      return deny('permissions.denied.commentDelete');

    case 'board.export':
      // Chat 05 — negar por padrão. Chat 06 (decisão do usuário, 07/11/2026): a política
      // `allowViewerExport` é TETO. Leitor/comentador só exporta com a política ligada; o link
      // público ainda pode restringir (`allowDownload === false` nega), mas `true` não fura a política.
      if (atLeast(role, 'editor')) return allow;
      if (ctx.workspaceRole === 'visitor' && ctx.allowDownload === false) return deny('permissions.denied.exportLinkBlocked');
      if (policies.allowViewerExport === true) return allow;
      return deny(ctx.workspaceRole === 'visitor' ? 'permissions.denied.exportVisitorPolicy' : 'permissions.denied.exportPolicy');

    case 'board.share':
      if (ctx.isolated) return deny('permissions.denied.isolatedOffline');
      if (role === 'owner') return allow;
      if (role === 'editor' && ctx.workspaceRole === 'member' && policies.allowMembersInviteGuests) return allow;
      return deny('permissions.denied.share');

    case 'board.publicLink': {
      const share = explain(ctx, 'board.share');
      if (!share.allowed) return share;
      return policies.allowPublicLinks ? allow : deny('permissions.denied.publicLinksDisabled');
    }

    case 'board.delete':
    case 'board.move':
    case 'board.restoreSnapshot':
    case 'board.clearActivityLog':
      return role === 'owner' ? allow : deny('permissions.denied.ownerOnly');

    case 'board.transferOwnership':
      return ctx.workspaceRole === 'admin' ? allow : deny('permissions.denied.transferOwnership');

    default:
      return deny('permissions.denied.unknownAction');
  }
}

export function can(ctx: PermissionContext, action: PermissionAction): boolean {
  return explain(ctx, action).allowed;
}

/* ------------------------- Extensões (Chat 06.5) ------------------------- */

/** O que a política precisa saber de uma extensão. */
export interface ExtensionPolicySubject {
  id: string;
  kind: 'pack' | 'script';
  /** instalada de pasta local (modo desenvolvimento) */
  dev?: boolean;
}

/**
 * Pode USAR (ativar/carregar as contribuições de) esta extensão? Política `allowExtensions`
 * (`none` desliga tudo; `packs_only` bloqueia Nível 2 e pastas dev) + `extensionAllowlist`
 * (lista não vazia = só esses ids, embutidas inclusive). EXTENSIONS_SPEC §5.8.
 */
export function explainExtension(ctx: PermissionContext, ext: ExtensionPolicySubject): Decision {
  const base = explain(ctx, 'extensions.use');
  if (!base.allowed) return base;
  const policies = { ...DEFAULT_WORKSPACE_POLICIES, ...(ctx.policies ?? {}) };
  if (ext.kind === 'script') {
    const scripts = explain(ctx, 'extensions.useScripts');
    if (!scripts.allowed) return scripts;
  }
  if (ext.dev && (policies.allowExtensions ?? 'all') !== 'all') return deny('permissions.denied.extensionsDevPolicy');
  const list = policies.extensionAllowlist ?? [];
  if (list.length && !list.includes(ext.id)) return deny('permissions.denied.extensionNotAllowlisted', { id: ext.id });
  return allow;
}

/** Pode INSTALAR/ATUALIZAR esta extensão neste navegador? (`extensions.manage` + regras de uso) */
export function explainExtensionInstall(ctx: PermissionContext, ext: ExtensionPolicySubject): Decision {
  const manage = explain(ctx, 'extensions.manage');
  if (!manage.allowed) return manage;
  return explainExtension(ctx, ext);
}

/* ------------------------- Workspace (Chat 06) ------------------------- */

/** Contexto de permissão para ações do Workspace (fora de um board). */
export function workspaceContext(viewer: { userId: string; workspaceRole: WorkspaceRole; isolated?: boolean }, policies?: Partial<WorkspacePolicies>): PermissionContext {
  // emenda v1.1: a conta isolada ("Continuar sem conta") leva a marca para TODAS as decisões de workspace
  return { userId: viewer.userId, workspaceRole: viewer.workspaceRole, boardRole: null, isBoardOwner: false, isFacilitator: false, policies, isolated: viewer.isolated };
}

/** Subconjunto de `UserAccount` que as regras de conta precisam (o arquivo continua sem dependência de store). */
export interface AccountLike {
  id: string;
  workspaceRole: WorkspaceRole;
  status: AccountStatus;
}

export type AccountChange = 'role' | 'suspend' | 'remove';

/** Administradores ativos (contas suspensas/removidas não contam). */
export function activeAdminCount(accounts: readonly AccountLike[]): number {
  return accounts.filter((a) => a.workspaceRole === 'admin' && a.status === 'active').length;
}

/**
 * Mudança em uma conta (papel, suspender, remover): exige `workspace.members.manage` e aplica a
 * **proteção do último administrador** — nunca deixa o workspace sem um admin ativo. Também impede
 * suspender/remover a própria conta (perderia o acesso no meio da ação).
 */
export function explainAccountChange(
  ctx: PermissionContext,
  accounts: readonly AccountLike[],
  targetId: string,
  change: AccountChange,
  newRole?: WorkspaceRole,
): Decision {
  const base = explain(ctx, 'workspace.members.manage');
  if (!base.allowed) return base;
  const target = accounts.find((a) => a.id === targetId);
  if (!target) return deny('permissions.denied.accountNotFound');
  if (change !== 'role' && target.id === ctx.userId) return deny('permissions.denied.selfAccount');
  const losesAdmin = target.workspaceRole === 'admin' && target.status === 'active' && (change !== 'role' || newRole !== 'admin');
  if (losesAdmin && activeAdminCount(accounts) <= 1) return deny('permissions.denied.lastAdmin');
  return allow;
}

/* ----------------------------- Regras de canvas ----------------------------- */

/** Modo de bloqueio efetivo (boards do Chat 01: `locked: true` sem lockMode = 'standard'). */
export function effectiveLockMode(el: Pick<CanvasElement, 'locked' | 'lockMode'>): LockMode {
  if (el.lockMode && el.lockMode !== 'none') return el.lockMode;
  return el.locked ? 'standard' : 'none';
}

/** Ação de permissão necessária para destravar o elemento. */
export function unlockActionFor(el: Pick<CanvasElement, 'locked' | 'lockMode'>): PermissionAction {
  return effectiveLockMode(el) === 'protected' ? 'element.unlockProtected' : 'element.unlockStandard';
}

/**
 * Modo Privado: a nota fica mascarada para quem não é o autor — ou para o próprio autor
 * quando ele liga "Simular visão de outro participante".
 */
export function isPrivateDraftHidden(el: Pick<StickyNoteElement, 'isPrivateDraft' | 'createdBy'>, viewerId: string, simulateParticipant: boolean): boolean {
  if (!el.isPrivateDraft) return false;
  if (simulateParticipant) return true;
  return el.createdBy !== viewerId;
}
