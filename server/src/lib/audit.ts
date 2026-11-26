/**
 * LuDraw server — Audit Log do workspace (Chat 07). Mesmo formato do cliente (`WorkspaceAuditEntry`):
 * sempre ids (nunca nome de pessoa copiado), mensagem como chave + parâmetros, origem e IP.
 */
import type { StoredMessage } from '../../../src/i18n/types';
import type { AuditChange, WorkspaceAuditAction, WorkspaceAuditEntry } from '../../../src/types/workspace';
import { createId } from '../../../src/utils/id';
import type { Db } from '../db/client';
import { workspaceAudit } from '../db/schema';

export const SYSTEM_ACTOR = 'system';

export interface AuditInput {
  organizationId: string | null;
  actorId: string;
  action: WorkspaceAuditAction;
  message: StoredMessage;
  targetType?: WorkspaceAuditEntry['targetType'];
  targetId?: string;
  targetName?: string;
  changes?: AuditChange[];
  count?: number;
  ip?: string | null;
  origin?: 'web' | 'cli' | 'env' | 'system';
  at?: Date;
}

export async function recordAudit(db: Db, input: AuditInput): Promise<string> {
  const id = createId(16);
  await db.insert(workspaceAudit).values({
    id,
    organizationId: input.organizationId,
    timestamp: input.at ?? new Date(),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetName: input.targetName ?? null,
    message: input.message,
    changes: input.changes ?? null,
    count: input.count ?? null,
    ip: input.ip ?? null,
    origin: input.origin ?? 'web',
  });
  return id;
}
