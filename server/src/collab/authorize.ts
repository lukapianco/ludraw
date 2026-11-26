/**
 * LuDraw server — quem é a pessoa de uma conexão de tempo real e o que ela pode (Chat 08).
 *
 * Na conexão: o mesmo caminho das rotas REST (token → sessão → participação ativa → `boardAccessFor`, ou
 * token de visitante → estado atual do link). Depois: `recheck` repete a conferência SEM exigir o JWT
 * (o access token dura 10 min; a conexão dura horas) olhando a sessão, a participação e a ACL de agora.
 */
import { CollabRefusal } from './quietLog';
import { eq } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import type { WorkspaceRole } from '../../../src/types/workspace';
import { explain, type PermissionAction, type PermissionContext } from '../../../src/utils/permissions';
import { DEFAULT_VISITOR_NAME } from '../../../src/utils/storedDefaults';
import { boardPermissionContext } from '../../../src/utils/workspace';
import { rulesView } from '../../../src/utils/workspaceRules';
import { authenticateToken } from '../auth/authenticate';
import { findMembership, membershipBlock } from '../auth/identity';
import { sessionAlive } from '../auth/sessions';
import type { AppContext } from '../context';
import { sessions, users } from '../db/schema';
import { loadBoardRow, type BoardRow } from '../boards/core';
import { boardAccessFor } from '../boards/routes';
import { visitorAccessByToken } from '../public/routes';
import { loadRulesState } from '../workspace/state';
import { viewerOf } from '../workspace/service';

export type ContextExtra = Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>;
export type ContextFactory = (extra?: ContextExtra) => PermissionContext;

export interface Principal {
  kind: 'member' | 'visitor';
  /** id estável (membro: id da conta; visitante: `visitante:<token>`) */
  userId: string;
  name: string;
  /** cor do avatar (membro) ou null (a presença escolhe uma) */
  color: string | null;
  role: WorkspaceRole;
  organizationId: string;
  sessionId: string | null;
  /** visitante: instante (ms) em que o token vence */
  expiresAt: number | null;
  /** monta o contexto de permissão com os facilitadores de AGORA */
  contextFor: (facilitatorIds: string[] | undefined) => ContextFactory;
}

export interface Authorized {
  principal: Principal;
  row: BoardRow;
}

/** Recusa da conexão ao vivo (o motivo vai ao cliente; a linha do Hocuspocus no console é filtrada — `quietLog.ts`). */
export class CollabDenied extends CollabRefusal {
  constructor(reason: 'denied' | 'unauthorized' | 'limit' | 'reset:epoch') {
    super(reason);
  }
}

/** Erros do REST (401/403/404) viram uma única recusa genérica: quem não pode ver o board não descobre se ele existe. */
function generic(err: unknown): never {
  const status = (err as { status?: number })?.status;
  throw new CollabDenied(status === 401 ? 'unauthorized' : 'denied');
}

export function mayView(principal: Principal, facilitatorIds: string[] | undefined): boolean {
  return explain(principal.contextFor(facilitatorIds)(), 'board.view').allowed;
}

export function allowed(principal: Principal, facilitatorIds: string[] | undefined, action: PermissionAction, extra?: ContextExtra): boolean {
  return explain(principal.contextFor(facilitatorIds)(extra), action).allowed;
}

export async function authorizeConnection(ctx: AppContext, cred: { t: string; k?: 'v' }, boardId: string): Promise<Authorized> {
  try {
    if (cred.k === 'v') {
      const access = await visitorAccessByToken(ctx, cred.t, boardId, ctx.db);
      if (access.row.deletedAt) throw new CollabDenied('denied');
      const exp = decodeJwt(cred.t).exp;
      const principal: Principal = {
        kind: 'visitor',
        userId: access.visitorId,
        name: DEFAULT_VISITOR_NAME,
        color: null,
        role: 'visitor',
        organizationId: access.row.organizationId,
        sessionId: null,
        expiresAt: typeof exp === 'number' ? exp * 1000 : null,
        contextFor: () => access.context,
      };
      if (!mayView(principal, undefined)) throw new CollabDenied('denied');
      return { principal, row: access.row };
    }
    const auth = await authenticateToken(ctx, cred.t);
    const access = await boardAccessFor(ctx, auth, boardId);
    if (access.row.deletedAt || !access.can('board.view')) throw new CollabDenied('denied');
    const principal = memberPrincipal(auth.userId, auth.user.name, auth.user.avatarColor, auth.membership.role, auth.organizationId, auth.sessionId, viewerOf(access.state, auth), access.meta, rulesView(access.state));
    return { principal, row: access.row };
  } catch (err) {
    if (err instanceof CollabDenied) throw err;
    return generic(err);
  }
}

function memberPrincipal(
  userId: string,
  name: string,
  color: string,
  role: WorkspaceRole,
  organizationId: string,
  sessionId: string,
  viewer: ReturnType<typeof viewerOf>,
  meta: Parameters<typeof boardPermissionContext>[1],
  ws: ReturnType<typeof rulesView>,
): Principal {
  return {
    kind: 'member',
    userId,
    name,
    color,
    role,
    organizationId,
    sessionId,
    expiresAt: null,
    contextFor: (facilitatorIds) => (extra) => ({ ...boardPermissionContext(viewer, meta, ws, facilitatorIds), ...extra }),
  };
}

export type RecheckResult = { ok: true; principal: Principal; row: BoardRow } | { ok: false; reason: 'unauthorized' | 'denied' };

/**
 * Confere de novo a conexão com o estado de agora: sessão viva, participação ativa, board ainda visível,
 * papel/ACL atuais (rebaixar editor→leitor vale na próxima mensagem) e, para visitante, link ainda válido.
 */
export async function recheck(ctx: AppContext, current: Principal, boardId: string, token: string | null): Promise<RecheckResult> {
  try {
    if (current.kind === 'visitor') {
      if (current.expiresAt !== null && Date.now() >= current.expiresAt) return { ok: false, reason: 'unauthorized' };
      const access = await visitorAccessByToken(ctx, token, boardId, ctx.db);
      if (access.row.deletedAt) return { ok: false, reason: 'denied' };
      return { ok: true, row: access.row, principal: { ...current, contextFor: () => access.context } };
    }
    const now = new Date();
    const [session] = current.sessionId ? await ctx.db.select().from(sessions).where(eq(sessions.id, current.sessionId)) : [];
    if (!session || session.userId !== current.userId || sessionAlive(session, now) !== 'ok') return { ok: false, reason: 'unauthorized' };
    const [user] = await ctx.db.select().from(users).where(eq(users.id, current.userId));
    if (!user) return { ok: false, reason: 'unauthorized' };
    // Chat 08.7 · R5 (S-11): senha redefinida pela administração — o REST já recusa (403); o tempo real cai junto
    if (user.mustChangePassword) return { ok: false, reason: 'unauthorized' };
    const membership = await findMembership(ctx.db, user.id, current.organizationId);
    if (!membership || membershipBlock(user, membership)) return { ok: false, reason: 'unauthorized' };
    const row = await loadBoardRow(ctx.db, boardId, { organizationId: current.organizationId });
    if (row.deletedAt) return { ok: false, reason: 'denied' };
    const state = await loadRulesState(ctx.db, current.organizationId, ctx.keys);
    const meta = state.boards.find((b) => b.id === boardId);
    if (!meta) return { ok: false, reason: 'denied' };
    const auth = { userId: user.id, organizationId: membership.organizationId, sessionId: session.id, user, membership };
    const viewer = viewerOf(state, auth);
    const principal = memberPrincipal(user.id, user.name, user.avatarColor, membership.role, membership.organizationId, session.id, viewer, meta, rulesView(state));
    return { ok: true, principal, row };
  } catch {
    return { ok: false, reason: 'denied' };
  }
}
