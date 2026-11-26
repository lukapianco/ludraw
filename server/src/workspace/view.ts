/**
 * LuDraw server — o que cada pessoa recebe do estado da organização (Chat 07).
 *
 * - boards: só os que `canSeeBoard` libera (+ a própria lixeira; admin vê a lixeira toda);
 * - link público: token só para quem pode compartilhar; o hash da senha NUNCA sai (vira um marcador);
 * - convidado B2B: só as pessoas e projetos ligados ao que foi compartilhado com ele, sem e-mails alheios;
 * - convites: admin vê todos; os demais só os que criaram (com o token, para copiar o link de novo);
 * - Audit Log: só com `workspace.audit.view`.
 */
import type { BoardMeta, PublicShareLink, TemplateEntity, UserAccount, WorkspaceAuditEntry } from '../../../src/types/workspace';
import type { SessionUser, WorkspaceState } from '../../../src/utils/apiContract';
import { explain, workspaceContext } from '../../../src/utils/permissions';
import { boardContextFor, canSeeBoard, type Viewer } from '../../../src/utils/workspace';
import { rulesView, type WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import { sha256Hex } from '../lib/crypto';

/** Marcador enviado no lugar do hash: o cliente só precisa saber se existe senha. */
export const PASSWORD_SET_MARKER = 'set';

export function sanitizeLink(link: PublicShareLink | undefined, canShare: boolean): PublicShareLink | undefined {
  if (!link) return undefined;
  // Chat 08.7 · R5 (S-17): a impressão acompanha o link (também o recém-criado, que ainda está em memória com o token);
  // é com ela que o cliente sabe que o token desta sessão ainda é o do link atual
  const tokenPrint = link.token ? sha256Hex(link.token).slice(0, 12) : link.tokenPrint;
  const { tokenPrint: _old, ...rest } = link;
  void _old;
  return { ...rest, token: canShare ? link.token : '', ...(canShare && tokenPrint ? { tokenPrint } : {}), passwordHash: link.passwordHash ? PASSWORD_SET_MARKER : null };
}

export interface ViewExtras {
  userState: Map<string, { favorite: boolean; lastOpenedAt: number | null }>;
  auditLog: WorkspaceAuditEntry[];
  templates: TemplateEntity[];
}

export function visibleBoards(state: WorkspaceRulesState, viewer: Viewer): BoardMeta[] {
  const ws = rulesView(state);
  const trashManager = explain(workspaceContext(viewer, ws.policies), 'workspace.trash.manage').allowed;
  return state.boards.filter((b) => canSeeBoard(viewer, b, ws) || (!!b.deletedAt && (b.ownerId === viewer.userId || trashManager)));
}

export function clientState(state: WorkspaceRulesState, viewer: Viewer, me: SessionUser, extras: ViewExtras): WorkspaceState {
  const ws = rulesView(state);
  const wctx = workspaceContext(viewer, ws.policies);
  const isGuest = viewer.workspaceRole === 'guest_b2b';
  const boards = visibleBoards(state, viewer).map((b) => {
    const canShare = explain(boardContextFor(viewer, b, ws), 'board.share').allowed;
    const st = extras.userState.get(b.id);
    return { ...b, favorite: st?.favorite ?? false, lastOpenedAt: st?.lastOpenedAt ?? b.updatedAt, publicLink: sanitizeLink(b.publicLink, canShare) };
  });

  let directory: UserAccount[] = state.directory;
  let teams = state.teams;
  let projects = state.projects;
  if (isGuest) {
    const related = new Set<string>([viewer.userId]);
    for (const b of boards) {
      related.add(b.ownerId);
      for (const m of b.members ?? []) related.add(m.userId);
    }
    directory = state.directory.filter((a) => related.has(a.id)).map((a) => (a.id === viewer.userId ? a : { ...a, email: '' }));
    teams = [];
    projects = state.projects
      .filter((p) => p.invitedGuestIds.includes(viewer.userId))
      .map((p) => ({ ...p, invitedGuestIds: [viewer.userId], guestRoles: { [viewer.userId]: p.guestRoles?.[viewer.userId] ?? 'editor' } }));
  }

  const manageMembers = explain(wctx, 'workspace.members.manage').allowed;
  // Chat 08.5: "e-mail confirmado" é dado de administração — os demais só veem o próprio
  if (!manageMembers) directory = directory.map((a) => (a.id === viewer.userId || a.emailVerified === undefined ? a : { ...a, emailVerified: undefined }));
  const invitations = state.invitations.filter((i) => manageMembers || i.invitedBy === viewer.userId);
  const auditLog = explain(wctx, 'workspace.audit.view').allowed ? extras.auditLog : [];

  return {
    workspace: state.workspace,
    directory,
    teams,
    projects,
    invitations,
    boards,
    // Chat 08.5 · B: links gerais e fila de pedidos só para quem gerencia membros — sem token (que nem existe aqui)
    ...(manageMembers ? { inviteLinks: (state.inviteLinks ?? []).map(({ token: _token, ...l }) => l), accessRequests: state.accessRequests ?? [] } : {}),
    auditLog,
    templates: extras.templates,
    me,
    serverTime: Date.now(),
  };
}
