/**
 * LuDraw server — manutenção periódica (Chat 07): sessões vencidas, sucessores cifrados do refresh,
 * pedidos de SSO abandonados, IPs antigos do Audit Log (LUDRAW_AUDIT_IP_RETENTION_DAYS), lixeira vencida
 * (`trashRetentionDays`) e versões além da retenção (`snapshotRetentionDays`) — as mesmas políticas do cliente.
 */
import { and, isNotNull, lt, sql } from 'drizzle-orm';
import { DEFAULT_WORKSPACE_POLICIES } from '../../src/utils/permissions';
import { pruneSessions } from './auth/sessions';
import { pruneBoardSnapshots } from './boards/core';
import type { AppContext } from './context';
import { accessRequests, boardActivity, boards, oidcRequests, organizations, snapshots, workspaceAudit } from './db/schema';
import { BOARD_LIMITS } from '../../src/utils/boardLimits';
import { recordAudit, SYSTEM_ACTOR } from './lib/audit';
import { collectOrphanAssets } from './assets/service';
import { pruneEmailTokens } from './mail/emailTokens';

export const DAY_MS = 24 * 60 * 60 * 1000;

export async function runMaintenance(ctx: AppContext, now = new Date()): Promise<void> {
  await pruneSessions(ctx.db, now);
  // Chat 08.5: tokens de e-mail vencidos ou já usados
  await pruneEmailTokens(ctx.db, now);
  // Chat 08.5 · B: pedido não confirmado some em 24 h; decididos ficam 180 dias (o Audit Log guarda a decisão)
  await ctx.db.delete(accessRequests).where(and(sql`${accessRequests.status} = 'unconfirmed'`, lt(accessRequests.createdAt, new Date(now.getTime() - DAY_MS))));
  await ctx.db.delete(accessRequests).where(and(sql`${accessRequests.status} in ('approved', 'rejected')`, lt(accessRequests.decidedAt, new Date(now.getTime() - 180 * DAY_MS))));
  await ctx.db.delete(oidcRequests).where(lt(oidcRequests.createdAt, new Date(now.getTime() - 10 * 60_000)));
  if (ctx.config.auditIpRetentionDays > 0) {
    const cutoff = new Date(now.getTime() - ctx.config.auditIpRetentionDays * DAY_MS);
    await ctx.db
      .update(workspaceAudit)
      .set({ ip: null })
      .where(and(isNotNull(workspaceAudit.ip), lt(workspaceAudit.timestamp, cutoff)));
  }

  const orgs = await ctx.db.select({ id: organizations.id, policies: organizations.policies }).from(organizations);
  for (const org of orgs) {
    const policies = { ...DEFAULT_WORKSPACE_POLICIES, ...org.policies };
    // lixeira vencida → excluída de vez (versões e atividade vão junto, em cascata)
    const cutoff = new Date(now.getTime() - Math.max(1, policies.trashRetentionDays) * DAY_MS);
    const purged = await ctx.db
      .delete(boards)
      .where(and(sql`${boards.organizationId} = ${org.id}`, isNotNull(boards.deletedAt), lt(boards.deletedAt, cutoff)))
      .returning({ id: boards.id });
    if (purged.length) {
      await recordAudit(ctx.db, {
        organizationId: org.id,
        actorId: SYSTEM_ACTOR,
        action: 'trash_emptied',
        message: { key: 'workspace.audit.msg.trashAutoEmptied', params: { count: purged.length } },
        targetType: 'board',
        count: purged.length,
        origin: 'system',
      });
    }
    // versões além da retenção
    const withSnapshots = await ctx.db
      .selectDistinct({ boardId: snapshots.boardId })
      .from(snapshots)
      .innerJoin(boards, sql`${boards.id} = ${snapshots.boardId}`)
      .where(sql`${boards.organizationId} = ${org.id}`);
    for (const b of withSnapshots) await pruneBoardSnapshots(ctx.db, b.boardId, policies.snapshotRetentionDays, now.getTime());
  }
  // Chat 08.7 · R2 (S-03): histórico do Activity Log de cada board limitado às `BOARD_LIMITS.activityRows` mais novas.
  // Só `board_activity`; o Audit Log da organização (`workspace_audit`) NUNCA é podado aqui.
  await pruneBoardActivity(ctx);
  // Chat 08.2: imagens sem nenhum board vinculado (a lixeira mantém o vínculo até a exclusão definitiva)
  if (ctx.assets) await collectOrphanAssets(ctx, now);
}

export async function pruneBoardActivity(ctx: AppContext, keep = BOARD_LIMITS.activityRows): Promise<void> {
  await ctx.db.execute(sql`
    delete from ${boardActivity}
    where (board_id, id) in (
      select board_id, id from (
        select board_id, id, row_number() over (partition by board_id order by "timestamp" desc, id desc) as n
        from ${boardActivity}
      ) ranked
      where ranked.n > ${keep}
    )`);
}
