/**
 * LuDraw server — leitura e gravação do conteúdo de um board (Chat 07), usadas pelas rotas de membros
 * e pelas de visitante (link público). Toda gravação: limites → `writeGuard` → versão nova → Activity Log.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { MessageDescriptor } from '../../../src/i18n/types';
import type { BoardActivityEntry, BoardData } from '../../../src/types/canvas';
import type { BoardSnapshot } from '../../../src/types/workspace';
import { checkBoardData } from '../../../src/utils/boardLimits';
import { unsafeContentInBoard } from '../../../src/utils/contentSafety';
import type { Db } from '../db/client';
import { boardActivity, boards, snapshots } from '../db/schema';
import { apiError, descriptorError, forbidden, HttpError } from '../lib/errors';
import { redactBoard, type RedactViewer } from './redact';
import { guardBoardWrite, type GuardInput } from './writeGuard';

export type BoardRow = typeof boards.$inferSelect;

export const DAY_MS = 86_400_000;
export const MAX_AUTO_SNAPSHOTS = 60;

export async function loadBoardRow(db: Db, boardId: string, opts: { organizationId?: string; lock?: boolean } = {}): Promise<BoardRow> {
  const where = opts.organizationId ? and(eq(boards.id, boardId), eq(boards.organizationId, opts.organizationId)) : eq(boards.id, boardId);
  const q = db.select().from(boards).where(where);
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row) throw apiError(404, 'boardNotFound');
  return row;
}

export const boardDataOf = (row: BoardRow): BoardData => row.data as unknown as BoardData;

/** Recusa dos limites de tamanho/forma (413/422 com chave traduzível). */
/** Chat 08.7 · R4 (S-30/S-31): board/modelo novo sem link inseguro, imagem externa nem cor com url(). */
export function assertSafeNewContent(data: unknown): void {
  const bad = unsafeContentInBoard(data as BoardData);
  if (bad) throw forbidden(bad as MessageDescriptor);
}

export function assertBoardData(data: unknown): asserts data is BoardData {
  const problem = checkBoardData(data);
  if (problem) throw descriptorError(422, problem.key.replace(/^server\.errors\./, ''), problem);
}

export function readEnvelope(row: BoardRow, viewer: RedactViewer) {
  return { data: redactBoard(boardDataOf(row), viewer), revision: row.revision };
}

export interface WriteOutcome {
  revision: number;
  activity: BoardActivityEntry[];
}

/**
 * Grava o conteúdo recebido (dentro de uma transação, com a linha travada). `expectedRevision` diferente da
 * gravada = 409 (alguém salvou antes); o cliente recarrega.
 */
export async function writeBoardData(tx: Db, row: BoardRow, incoming: unknown, expectedRevision: number, guard: Omit<GuardInput, 'old' | 'incoming'>): Promise<WriteOutcome> {
  if (expectedRevision !== row.revision) {
    throw new HttpError(409, 'boardConflict', { key: 'server.errors.boardConflict', params: { revision: row.revision } });
  }
  assertBoardData(incoming);
  const result = guardBoardWrite({ ...guard, old: boardDataOf(row), incoming });
  if (!result.ok) throw forbidden(result.reason as MessageDescriptor);
  const revision = row.revision + 1;
  await tx
    .update(boards)
    .set({ data: result.data as unknown as Record<string, unknown>, revision, updatedAt: new Date(guard.now) })
    .where(eq(boards.id, row.id));
  if (result.newActivity.length) {
    for (const e of result.newActivity) {
      await tx
        .insert(boardActivity)
        .values({ boardId: row.id, id: e.id, actorId: e.actorId, action: e.action, timestamp: new Date(e.lastTimestamp ?? e.timestamp ?? guard.now), entry: e as unknown as Record<string, unknown> })
        .onConflictDoUpdate({ target: [boardActivity.boardId, boardActivity.id], set: { entry: e as unknown as Record<string, unknown>, timestamp: new Date(e.lastTimestamp ?? e.timestamp ?? guard.now) } });
    }
  }
  return { revision, activity: result.newActivity };
}

export function countObjects(data: BoardData): number {
  return data.elementOrder.filter((id) => data.elements[id] && data.elements[id].type !== 'comment').length;
}

export function snapshotFromRow(r: typeof snapshots.$inferSelect, viewer: RedactViewer): BoardSnapshot {
  return {
    id: r.id,
    boardId: r.boardId,
    name: r.name,
    createdAt: r.createdAt.getTime(),
    createdBy: r.createdBy,
    elementCount: r.elementCount,
    data: redactBoard(r.data as unknown as BoardData, viewer),
    kind: r.kind,
    reason: r.reason ?? undefined,
  };
}

/** Retenção (mesma regra do cliente): automáticas/de segurança vencidas saem; automáticas acima do teto também; a mais nova e as nomeadas ficam. */
export async function pruneBoardSnapshots(db: Db, boardId: string, retentionDays: number, now = Date.now()): Promise<number> {
  const list = await db.select({ id: snapshots.id, kind: snapshots.kind, createdAt: snapshots.createdAt }).from(snapshots).where(eq(snapshots.boardId, boardId)).orderBy(desc(snapshots.createdAt));
  if (list.length <= 1) return 0;
  const limit = now - Math.max(1, retentionDays) * DAY_MS;
  const newest = list[0].id;
  let autos = 0;
  const drop: string[] = [];
  for (const s of list) {
    if (s.id === newest || s.kind === 'manual') continue;
    if (s.kind === 'auto') autos++;
    if (s.createdAt.getTime() < limit || autos > MAX_AUTO_SNAPSHOTS) drop.push(s.id);
  }
  if (drop.length) await db.delete(snapshots).where(inArray(snapshots.id, drop));
  return drop.length;
}
