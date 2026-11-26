/**
 * LuDraw server — serviços do workspace (Chat 07): quem está olhando, estado para o cliente, execução
 * de uma `WorkspaceOp` com as regras compartilhadas, numa transação com a organização travada.
 */
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { MessageDescriptor } from '../../../src/i18n/types';
import type { TemplateEntity, WorkspaceAuditAction, WorkspaceAuditEntry } from '../../../src/types/workspace';
import type { WorkspaceState } from '../../../src/utils/apiContract';
import { AUDIT_PARAM_KEYS, SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import { createId } from '../../../src/utils/id';
import { viewerFor, type Viewer } from '../../../src/utils/workspace';
import { applyWorkspaceOp, opClientValues, type RuleResult, type WorkspaceOp, type WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import type { AuthContext } from '../auth/authenticate';
import { sessionUser } from '../auth/identity';
import { revokeUserSessions } from '../auth/sessions';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { boardUserState, organizations, templates, workspaceAudit } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { randomUrlToken } from '../lib/crypto';
import { HttpError, toStored } from '../lib/errors';
import { markRemovedEmails } from '../access/removedEmails';
import { loadRulesState, ms, persistDiff } from './state';
import { clientState } from './view';

export const AUDIT_STATE_LIMIT = 1000;

/** Quem está olhando, a partir da participação real (o servidor não tem "Visualizar como…"). */
export function viewerOf(state: WorkspaceRulesState, auth: AuthContext): Viewer {
  return viewerFor({ userId: auth.userId, workspaceRole: auth.membership.role, viewAs: null }, state, auth.organizationId);
}

export function auditFromRow(r: typeof workspaceAudit.$inferSelect): WorkspaceAuditEntry {
  return {
    id: r.id,
    workspaceId: r.organizationId ?? '',
    timestamp: r.timestamp.getTime(),
    actorId: r.actorId,
    action: r.action as WorkspaceAuditAction,
    targetType: (r.targetType ?? undefined) as WorkspaceAuditEntry['targetType'],
    targetId: r.targetId ?? undefined,
    targetName: r.targetName ?? undefined,
    message: r.message ?? undefined,
    changes: r.changes ?? undefined,
    count: r.count ?? undefined,
    ip: r.ip ?? undefined,
  };
}

export function templateFromRow(r: typeof templates.$inferSelect): TemplateEntity {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    scope: r.scope,
    workspaceId: r.organizationId,
    teamId: r.teamId ?? undefined,
    createdBy: r.createdBy,
    createdAt: r.createdAt.getTime(),
    thumbnail: r.thumbnail ?? undefined,
    data: r.data as unknown as TemplateEntity['data'],
  };
}

/** Modelos que a pessoa enxerga (mesma regra de `templateAccess` do cliente). */
export async function visibleTemplates(db: Db, orgId: string, viewer: Viewer): Promise<TemplateEntity[]> {
  if (viewer.workspaceRole !== 'admin' && viewer.workspaceRole !== 'member') return [];
  const conds = [eq(templates.scope, 'workspace'), and(eq(templates.scope, 'personal'), eq(templates.createdBy, viewer.userId))];
  if (viewer.workspaceRole === 'admin') conds.push(eq(templates.scope, 'team'));
  else if (viewer.teamIds.length) conds.push(and(eq(templates.scope, 'team'), inArray(templates.teamId, viewer.teamIds)));
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.organizationId, orgId), or(...conds)));
  return rows.map(templateFromRow);
}

export async function buildClientState(ctx: AppContext, auth: AuthContext, state?: WorkspaceRulesState): Promise<WorkspaceState> {
  const st = state ?? (await loadRulesState(ctx.db, auth.organizationId, ctx.keys));
  const viewer = viewerOf(st, auth);
  const rows = await ctx.db.select().from(boardUserState).where(eq(boardUserState.userId, auth.userId));
  const userState = new Map(rows.map((r) => [r.boardId, { favorite: r.favorite, lastOpenedAt: ms(r.lastOpenedAt) }]));
  const auditRows = await ctx.db
    .select()
    .from(workspaceAudit)
    .where(eq(workspaceAudit.organizationId, auth.organizationId))
    .orderBy(desc(workspaceAudit.timestamp))
    .limit(AUDIT_STATE_LIMIT);
  return clientState(st, viewer, sessionUser(auth.user, auth.membership), {
    userState,
    auditLog: auditRows.map(auditFromRow),
    templates: await visibleTemplates(ctx.db, auth.organizationId, viewer),
  });
}

export async function auditPage(db: Db, orgId: string, before: number | null, limit: number): Promise<WorkspaceAuditEntry[]> {
  const rows = await db
    .select()
    .from(workspaceAudit)
    .where(before ? and(eq(workspaceAudit.organizationId, orgId), lt(workspaceAudit.timestamp, new Date(before))) : eq(workspaceAudit.organizationId, orgId))
    .orderBy(desc(workspaceAudit.timestamp))
    .limit(limit);
  return rows.map(auditFromRow);
}

/** Recusa das regras → status HTTP coerente (permissão 403, não encontrado 404, validação 422). */
export function ruleError(error: MessageDescriptor): HttpError {
  const key = error.key as string;
  const status = key.startsWith('permissions.') ? 403 : /NotFound$/.test(key) ? 404 : 422;
  return new HttpError(status, status === 403 ? 'forbidden' : status === 404 ? 'notFound' : 'rejected', toStored(error));
}

export interface OpOutcome {
  result: Extract<RuleResult, { ok: true }>;
  state: WorkspaceRulesState;
}

/**
 * Executa uma operação com a organização travada (`FOR UPDATE`): carrega o estado, aplica as regras,
 * grava a diferença e o Audit Log, e derruba as sessões de quem foi suspenso/removido.
 */
export async function executeOp(
  ctx: AppContext,
  auth: AuthContext,
  ip: string,
  op: WorkspaceOp,
  prepare?: (state: WorkspaceRulesState) => Promise<void> | void,
): Promise<OpOutcome> {
  const outcome = await ctx.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, auth.organizationId)).for('update');
    const before = await loadRulesState(tx, auth.organizationId, ctx.keys);
    await prepare?.(before);
    const viewer = viewerOf(before, auth);
    // id/token propostos pelo cliente (Modo Servidor otimista): só se ainda não existem
    const proposed = opClientValues(op);
    if (proposed.clientId && [...before.teams, ...before.projects, ...before.invitations, ...(before.inviteLinks ?? []), ...before.directory].some((x) => x.id === proposed.clientId)) {
      throw new HttpError(409, 'invalidOperation', { key: 'server.errors.invalidOperation' });
    }
    if (proposed.token && (before.invitations.some((i) => i.token === proposed.token) || before.boards.some((b) => b.publicLink?.token === proposed.token))) {
      throw new HttpError(409, 'invalidOperation', { key: 'server.errors.invalidOperation' });
    }
    let idUsed = false;
    const result = applyWorkspaceOp(before, op, { viewer, actorId: auth.userId }, {
      now: Date.now(),
      newId: () => {
        if (proposed.clientId && !idUsed) {
          idUsed = true;
          return proposed.clientId;
        }
        return createId(16);
      },
      newToken: () => proposed.token ?? randomUrlToken(24),
      anonymizedName: (userId) => `#${userId.slice(0, 4).toUpperCase()}`,
    });
    if (!result.ok) throw ruleError(result.error);
    const outcome = await persistDiff(tx, auth.organizationId, before, result.state, ctx.keys);
    // Chat 08.5 · C: removido não volta sozinho pelo cadastro com o e-mail da organização
    await markRemovedEmails(tx, auth.organizationId, ctx.keys.removedEmailKey, before, result.state);
    for (const a of result.audit) {
      await recordAudit(tx, {
        organizationId: auth.organizationId,
        actorId: a.meta?.actorId ?? auth.userId,
        action: a.action,
        message: a.message,
        targetType: a.meta?.targetType,
        targetId: a.meta?.targetId,
        targetName: a.meta?.targetName,
        changes: a.meta?.changes,
        count: a.meta?.count,
        ip,
      });
    }
    for (const userId of outcome.deactivated) {
      const count = await revokeUserSessions(tx, userId, 'membership_inactive', { organizationId: auth.organizationId });
      if (count) {
        await recordAudit(tx, {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: 'sessions_revoked',
          message: { key: SERVER_AUDIT_MESSAGES.sessionsRevoked, params: { count, reason: { key: AUDIT_PARAM_KEYS.reasonSuspended } } },
          targetType: 'user',
          targetId: userId,
          count,
          ip,
        });
      }
    }
    return { result, state: result.state };
  });
  // Chat 08: papéis, ACL, link público, suspensão… mudaram → quem está conectado é conferido de novo
  void ctx.collab?.invalidateOrg(auth.organizationId);
  return outcome;
}
