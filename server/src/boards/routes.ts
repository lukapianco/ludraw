/**
 * LuDraw server — rotas de boards para membros autenticados (Chat 07): criar, renomear/favoritar,
 * mover para a lixeira, ler/gravar o conteúdo (JSON; tempo real no Chat 08), versões e Activity Log.
 * Toda decisão passa por `can()` com o contexto de `boardPermissionContext` (mesma regra do cliente).
 */
import { createHash } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BoardData } from '../../../src/types/canvas';
import type { BoardMeta } from '../../../src/types/workspace';
import { SERVER_AUDIT_MESSAGES, type BoardMetaPatch, type CreateBoardRequest, type CreateSnapshotRequest } from '../../../src/utils/apiContract';
import { BOARD_LIMITS } from '../../../src/utils/boardLimits';
import { createId } from '../../../src/utils/id';
import { explain, workspaceContext, type PermissionAction, type PermissionContext } from '../../../src/utils/permissions';
import { boardContextFor, boardPermissionContext, canUsePlace, placeFields, type Place } from '../../../src/utils/workspace';
import { legacyPlaceText, placeParam, rulesView, type WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import { requireAuth, type AuthContext } from '../auth/authenticate';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { boardActivity, boards, boardUserState, snapshots } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { externalizeImages, linkAssets, prepareIncomingAssets } from '../assets/service';
import { apiError, forbidden } from '../lib/errors';
import { loadRulesState } from '../workspace/state';
import { viewerOf } from '../workspace/service';
import { sanitizeLink } from '../workspace/view';
import { assertBoardData, assertSafeNewContent, boardDataOf, countObjects, loadBoardRow, pruneBoardSnapshots, readEnvelope, snapshotFromRow, writeBoardData, type BoardRow } from './core';
import type { RedactViewer } from './redact';

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** Chat 08.7 · R2 (S-02): id de versão derivado do board + id proposto (16 caracteres base64url; mesmo par = mesmo id). */
function derivedSnapshotId(boardId: string, proposed: string): string {
  return createHash('sha256').update(`snapshot:${boardId}:${proposed}`).digest('base64url').slice(0, 16);
}
const PLACE_SCHEMA = {
  type: 'object',
  required: ['kind'],
  additionalProperties: false,
  properties: { kind: { type: 'string', enum: ['personal', 'workspace', 'team'] }, teamId: { type: 'string', maxLength: 80 }, projectId: { type: ['string', 'null'], maxLength: 80 } },
} as const;

export interface BoardAccess {
  state: WorkspaceRulesState;
  meta: BoardMeta;
  row: BoardRow;
  context: (extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => PermissionContext;
  redactViewer: RedactViewer;
  can: (action: PermissionAction) => boolean;
  require: (action: PermissionAction) => void;
}

/** Carrega o board da organização da pessoa e monta o contexto de permissão dela. */
export async function boardAccessFor(ctx: AppContext, auth: AuthContext, boardId: string, db: Db = ctx.db, lock = false): Promise<BoardAccess> {
  const row = await loadBoardRow(db, boardId, { organizationId: auth.organizationId, lock });
  const state = await loadRulesState(db, auth.organizationId, ctx.keys);
  const meta = state.boards.find((b) => b.id === boardId);
  if (!meta) throw apiError(404, 'boardNotFound');
  const viewer = viewerOf(state, auth);
  const ws = rulesView(state);
  const facilitatorIds = boardDataOf(row).facilitatorIds;
  const context = (extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => ({ ...boardPermissionContext(viewer, meta, ws, facilitatorIds), ...extra });
  const can = (action: PermissionAction) => explain(context(), action).allowed;
  return {
    state,
    meta,
    row,
    context,
    can,
    redactViewer: { userId: auth.userId, canManageVoting: can('voting.manage') },
    require: (action) => {
      const d = explain(context(), action);
      if (!d.allowed) throw forbidden(d.reason);
    },
  };
}

function expectedRevision(request: FastifyRequest): number {
  const raw = request.headers['if-match'];
  const n = typeof raw === 'string' ? Number(raw.replace(/"/g, '')) : NaN;
  if (!Number.isInteger(n) || n < 0) throw apiError(428, 'invalidRequest');
  return n;
}

export function registerBoardRoutes(app: FastifyInstance, ctx: AppContext): void {
  const auth = requireAuth(ctx);

  app.post<{ Body: CreateBoardRequest }>(
    '/boards',
    {
      // Chat 08.7 · R3 (S-07): autentica ANTES de ler o corpo (até 40 MB)
      onRequest: auth,
      bodyLimit: BOARD_LIMITS.bodyBytes,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'place', 'data'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', maxLength: 64 },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            place: PLACE_SCHEMA,
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
            template: { type: 'string', maxLength: 40 },
            data: { type: 'object' },
            importFrom: {
              type: 'object',
              required: ['kind', 'sourceId'],
              additionalProperties: false,
              properties: { kind: { type: 'string', enum: ['local'] }, sourceId: { type: 'string', minLength: 1, maxLength: 80 } },
            },
          },
        },
      },
    },
    async (request) => {
      const a = request.auth!;
      const body = request.body;
      assertBoardData(body.data);
      assertSafeNewContent(body.data);
      const state = await loadRulesState(ctx.db, a.organizationId, ctx.keys);
      const viewer = viewerOf(state, a);
      const d = explain(workspaceContext(viewer, rulesView(state).policies), 'workspace.boards.create');
      if (!d.allowed) throw forbidden(d.reason);
      const place = body.place as Place;
      if (place.kind === 'team' && !place.teamId) throw apiError(400, 'invalidRequest');
      if (!canUsePlace(viewer, place, state.teams, state.projects)) throw forbidden({ key: 'workspace.errors.placeNotAllowed' });
      const id = body.id ?? createId(16);
      if (!ID_RE.test(id)) throw apiError(400, 'invalidRequest');
      // Chat 08.2: board do Modo Local — a mesma pessoa não traz o mesmo board duas vezes (o índice único garante na corrida)
      const importedFrom = body.importFrom ? { kind: 'local' as const, sourceId: body.importFrom.sourceId, by: a.userId, at: Date.now() } : null;
      if (importedFrom) {
        const [dup] = await ctx.db
          .select({ id: boards.id })
          .from(boards)
          .where(and(eq(boards.organizationId, a.organizationId), sql`${boards.importedFrom}->>'by' = ${a.userId}`, sql`${boards.importedFrom}->>'sourceId' = ${importedFrom.sourceId}`))
          .limit(1);
        if (dup) throw apiError(409, 'alreadyImported');
      }
      const now = new Date();
      const fields = placeFields(place, a.organizationId);
      const legacy = legacyPlaceText(place, state);
      // Chat 08.2: imagens embutidas viram arquivo; referências a imagens de outros boards exigem prova de acesso
      const prepared = await prepareIncomingAssets(ctx, { kind: 'member', auth: a }, a.organizationId, null, body.data as BoardData);
      const data = prepared.data;
      const inserted = await ctx.db
        .insert(boards)
        .values({
          id,
          organizationId: a.organizationId,
          name: body.name.trim(),
          ownerId: a.userId,
          teamId: fields.teamId ?? null,
          projectId: fields.projectId ?? null,
          isPersonalSpace: !!fields.isPersonalSpace,
          color: body.color ?? '#194B32',
          template: body.template ?? 'blank',
          legacyTeam: legacy.team,
          legacySpace: legacy.space,
          createdAt: now,
          updatedAt: now,
          data: data as unknown as Record<string, unknown>,
          importedFrom,
        })
        .onConflictDoNothing()
        .returning({ id: boards.id });
      if (!inserted.length) throw apiError(409, importedFrom ? 'alreadyImported' : 'invalidRequest');
      await linkAssets(ctx, a.organizationId, id, a.userId, prepared.hashes);
      if (importedFrom) {
        // trazer do Modo Local fica sempre no Audit Log (inclusive no Espaço pessoal)
        await recordAudit(ctx.db, {
          organizationId: a.organizationId,
          actorId: a.userId,
          action: 'board_imported',
          message: { key: SERVER_AUDIT_MESSAGES.boardImported, params: { name: body.name.trim(), place: placeParam(place, state), count: Object.keys(data.elements ?? {}).length } },
          targetType: 'board',
          targetId: id,
          targetName: body.name.trim(),
          ip: request.ip,
        });
      } else if (place.kind !== 'personal') {
        await recordAudit(ctx.db, {
          organizationId: a.organizationId,
          actorId: a.userId,
          action: 'board_created',
          message: { key: 'workspace.audit.msg.boardCreated', params: { name: body.name.trim(), place: placeParam(place, state) } },
          targetType: 'board',
          targetId: id,
          targetName: body.name.trim(),
          ip: request.ip,
        });
      }
      const access = await boardAccessFor(ctx, a, id);
      return { board: { ...access.meta, publicLink: sanitizeLink(access.meta.publicLink, access.can('board.share')) }, revision: 0 };
    },
  );

  app.patch<{ Params: { id: string }; Body: BoardMetaPatch }>(
    '/boards/:id',
    {
      onRequest: auth,
      bodyLimit: 4 * 1024 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            favorite: { type: 'boolean' },
            lastOpenedAt: { type: 'number' },
            thumbnail: { type: ['string', 'null'], maxLength: 2_000_000 },
          },
        },
      },
    },
    async (request) => {
      const a = request.auth!;
      const access = await boardAccessFor(ctx, a, request.params.id);
      const body = request.body;
      access.require('board.view');
      const set: Partial<typeof boards.$inferInsert> = {};
      if (body.name !== undefined) {
        access.require('board.edit');
        set.name = body.name.trim();
      }
      if (body.thumbnail !== undefined) {
        access.require('board.edit');
        if (body.thumbnail !== null && !/^data:image\/(png|jpeg|webp);base64,/.test(body.thumbnail)) throw apiError(400, 'invalidRequest');
        set.thumbnail = body.thumbnail;
      }
      if (Object.keys(set).length) await ctx.db.update(boards).set(set).where(eq(boards.id, access.row.id));
      if (body.favorite !== undefined || body.lastOpenedAt !== undefined) {
        const values = { boardId: access.row.id, userId: a.userId, favorite: body.favorite ?? false, lastOpenedAt: body.lastOpenedAt ? new Date(body.lastOpenedAt) : null };
        const update: Partial<typeof boardUserState.$inferInsert> = {};
        if (body.favorite !== undefined) update.favorite = body.favorite;
        if (body.lastOpenedAt !== undefined) update.lastOpenedAt = new Date(body.lastOpenedAt);
        await ctx.db.insert(boardUserState).values(values).onConflictDoUpdate({ target: [boardUserState.boardId, boardUserState.userId], set: update });
      }
      return { ok: true };
    },
  );

  // mover para a lixeira (mesma decisão da Mesa: board.delete)
  app.delete<{ Params: { id: string } }>('/boards/:id', { preHandler: auth }, async (request) => {
    const a = request.auth!;
    const access = await boardAccessFor(ctx, a, request.params.id);
    if (access.meta.deletedAt) return { ok: true };
    const viewer = viewerOf(access.state, a);
    const d = explain(boardContextFor(viewer, access.meta, rulesView(access.state)), 'board.delete');
    if (!d.allowed) throw forbidden(d.reason);
    await ctx.collab?.flush(access.row.id);
    await ctx.db.update(boards).set({ deletedAt: new Date(), deletedBy: a.userId }).where(eq(boards.id, access.row.id));
    void ctx.collab?.invalidateBoard(access.row.id);
    await recordAudit(ctx.db, {
      organizationId: a.organizationId,
      actorId: a.userId,
      action: 'board_deleted',
      message: { key: 'workspace.audit.msg.boardDeleted', params: { name: access.meta.name } },
      targetType: 'board',
      targetId: access.row.id,
      targetName: access.meta.name,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/boards/:id/data', { preHandler: auth }, async (request, reply) => {
    const access = await boardAccessFor(ctx, request.auth!, request.params.id);
    access.require('board.view');
    reply.header('etag', `"${access.row.revision}"`);
    return readEnvelope(access.row, access.redactViewer);
  });

  // Chat 07 · B: só a revisão (o cliente consulta enquanto o board está aberto; o tempo real é do Chat 08)
  app.get<{ Params: { id: string } }>('/boards/:id/revision', { preHandler: auth }, async (request) => {
    const a = request.auth!;
    const [row] = await ctx.db
      .select({ revision: boards.revision, updatedAt: boards.updatedAt })
      .from(boards)
      .where(and(eq(boards.id, request.params.id), eq(boards.organizationId, a.organizationId)));
    if (!row) throw apiError(404, 'boardNotFound');
    const access = await boardAccessFor(ctx, a, request.params.id);
    access.require('board.view');
    return { revision: row.revision, updatedAt: row.updatedAt.getTime() };
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/boards/:id/data', { onRequest: auth, bodyLimit: BOARD_LIMITS.bodyBytes }, async (request, reply) => {
    const a = request.auth!;
    const expected = expectedRevision(request);
    // Chat 08.2: limites → imagens embutidas viram arquivo → prova de acesso das referências novas (fora da transação)
    const pre = await boardAccessFor(ctx, a, request.params.id);
    pre.require('board.view');
    if (pre.meta.deletedAt) throw apiError(404, 'boardNotFound');
    assertBoardData(request.body);
    const prepared = await prepareIncomingAssets(ctx, { kind: 'member', auth: a }, a.organizationId, request.params.id, request.body as BoardData, boardDataOf(pre.row));
    const outcome = await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const access = await boardAccessFor(ctx, a, request.params.id, tx, true);
      access.require('board.view');
      if (access.meta.deletedAt) throw apiError(404, 'boardNotFound');
      return writeBoardData(tx, access.row, prepared.data, expected, {
        viewer: { userId: a.userId, name: a.user.name, role: a.membership.role },
        context: access.context,
        canManageVoting: access.redactViewer.canManageVoting,
        now: Date.now(),
      });
    });
    await linkAssets(ctx, a.organizationId, request.params.id, a.userId, prepared.hashes);
    // Chat 08: o conteúdo foi trocado por fora do documento Yjs → quem estava conectado recomeça do banco
    await ctx.collab?.resetBoard(request.params.id, 'replaced');
    reply.header('etag', `"${outcome.revision}"`);
    return { revision: outcome.revision };
  });

  /* ---------------- Versões ---------------- */

  app.get<{ Params: { id: string } }>('/boards/:id/snapshots', { preHandler: auth }, async (request) => {
    const access = await boardAccessFor(ctx, request.auth!, request.params.id);
    access.require('board.view');
    const rows = await ctx.db.select().from(snapshots).where(eq(snapshots.boardId, access.row.id)).orderBy(desc(snapshots.createdAt)).limit(200);
    return { snapshots: rows.map((r) => snapshotFromRow(r, access.redactViewer)) };
  });

  app.post<{ Params: { id: string }; Body: CreateSnapshotRequest }>(
    '/boards/:id/snapshots',
    {
      preHandler: auth,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'kind'],
          additionalProperties: false,
          properties: { id: { type: 'string', maxLength: 64 }, name: { type: 'string', maxLength: 200 }, kind: { type: 'string', enum: ['auto', 'manual', 'safety'] }, reason: { type: 'object' } },
        },
      },
    },
    async (request) => {
      const a = request.auth!;
      const access = await boardAccessFor(ctx, a, request.params.id);
      access.require('board.edit');
      const proposed = request.body.id;
      if (proposed !== undefined && !ID_RE.test(proposed)) throw apiError(400, 'invalidRequest');
      // Chat 08.7 · R2 (S-02): o id proposto nunca alcança outro board. Já existe NESTE board = a mesma versão (nova
      // tentativa); de outro board ou inédito = id novo, derivado deste board + id proposto (a nova tentativa cai na
      // mesma versão e quem pede não distingue "existe noutro board" de "não existe").
      const findHere = async (sid: string) => (await ctx.db.select().from(snapshots).where(and(eq(snapshots.id, sid), eq(snapshots.boardId, access.row.id))))[0];
      const existing = proposed ? await findHere(proposed) : undefined;
      if (existing) return { snapshot: snapshotFromRow(existing, access.redactViewer) };
      const id = proposed ? derivedSnapshotId(access.row.id, proposed) : createId(16);
      const retried = await findHere(id);
      if (retried) return { snapshot: snapshotFromRow(retried, access.redactViewer) };
      // Chat 08: a versão sai do estado de AGORA (o que está só na memória do tempo real vai antes para o banco)
      await ctx.collab?.flush(access.row.id);
      const data = boardDataOf(await loadBoardRow(ctx.db, access.row.id));
      await ctx.db
        .insert(snapshots)
        .values({
          id,
          boardId: access.row.id,
          name: request.body.name.trim(),
          kind: request.body.kind,
          reason: (request.body.reason as never) ?? null,
          createdBy: a.userId,
          createdAt: new Date(),
          elementCount: countObjects(data),
          data: data as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();
      await pruneBoardSnapshots(ctx.db, access.row.id, rulesView(access.state).policies.snapshotRetentionDays);
      // releitura SEMPRE escopada a este board (antes: só por id — devolvia a versão de outro board)
      const row = await findHere(id);
      return { snapshot: row ? snapshotFromRow(row, access.redactViewer) : null };
    },
  );

  app.delete<{ Params: { id: string; sid: string } }>('/boards/:id/snapshots/:sid', { preHandler: auth }, async (request) => {
    const access = await boardAccessFor(ctx, request.auth!, request.params.id);
    access.require('board.restoreSnapshot');
    await ctx.db.delete(snapshots).where(and(eq(snapshots.id, request.params.sid), eq(snapshots.boardId, access.row.id)));
    return { ok: true };
  });

  app.post<{ Params: { id: string; sid: string } }>('/boards/:id/snapshots/:sid/restore', { preHandler: auth }, async (request) => {
    const a = request.auth!;
    await ctx.collab?.flush(request.params.id);
    // Chat 08.2: versão antiga com imagens embutidas → arquivos antes de restaurar (fora da transação)
    const preAccess = await boardAccessFor(ctx, a, request.params.id);
    preAccess.require('board.restoreSnapshot');
    const [preSnap] = await ctx.db.select().from(snapshots).where(and(eq(snapshots.id, request.params.sid), eq(snapshots.boardId, preAccess.row.id)));
    const restoredImages = preSnap ? await externalizeImages(ctx, a.organizationId, preAccess.row.id, a.userId, preSnap.data as unknown as BoardData) : null;
    const result = await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const access = await boardAccessFor(ctx, a, request.params.id, tx, true);
      access.require('board.restoreSnapshot');
      const [snap] = await tx.select().from(snapshots).where(and(eq(snapshots.id, request.params.sid), eq(snapshots.boardId, access.row.id)));
      if (!snap) throw apiError(404, 'notFound');
      const label = snap.kind === 'manual' && snap.name ? { key: 'history.named', params: { name: snap.name } } : { key: snap.kind === 'safety' ? 'history.kind.safety' : 'history.kind.auto' };
      const current = boardDataOf(access.row);
      // versão de segurança do estado atual antes de restaurar (CLAUDE.md §1.6)
      await tx.insert(snapshots).values({
        id: createId(16),
        boardId: access.row.id,
        name: '',
        kind: 'safety',
        reason: { key: 'history.reason.beforeRestore', params: { label } },
        createdBy: a.userId,
        createdAt: new Date(),
        elementCount: countObjects(current),
        data: current as unknown as Record<string, unknown>,
      });
      const restored = restoredImages && snap.id === preSnap?.id ? restoredImages.data : (snap.data as unknown as BoardData);
      const objects = countObjects(restored);
      const now = Date.now();
      const entry = {
        id: createId(10),
        timestamp: now,
        actorId: a.userId,
        actorName: a.user.name,
        actorRole: a.membership.role,
        action: 'snapshot_restored' as const,
        targetType: 'board' as const,
        targetCount: objects,
        message: { key: 'board.activity.snapshotRestored', params: { label, count: objects } },
      };
      const data: BoardData = { ...restored, activityLog: [entry, ...(current.activityLog ?? [])].slice(0, 200) };
      const revision = access.row.revision + 1;
      await tx.update(boards).set({ data: data as unknown as Record<string, unknown>, revision, updatedAt: new Date(now) }).where(eq(boards.id, access.row.id));
      await tx.insert(boardActivity).values({ boardId: access.row.id, id: entry.id, actorId: a.userId, action: entry.action, timestamp: new Date(now), entry: entry as unknown as Record<string, unknown> });
      await recordAudit(tx, {
        organizationId: a.organizationId,
        actorId: a.userId,
        action: 'snapshot_restored',
        message: { key: 'workspace.audit.msg.snapshotRestored', params: { name: access.meta.name, label } },
        targetType: 'board',
        targetId: access.row.id,
        targetName: access.meta.name,
        ip: request.ip,
      });
      return { revision };
    });
    // Chat 08: quem está conectado vê a mensagem de quem restaurou e recomeça do banco
    await ctx.collab?.resetBoard(request.params.id, 'restored', a.userId);
    return result;
  });

  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>('/boards/:id/activity', { preHandler: auth }, async (request) => {
    const access = await boardAccessFor(ctx, request.auth!, request.params.id);
    access.require('board.view');
    const before = request.query.before ? Number(request.query.before) : null;
    const limit = Math.min(500, Math.max(1, Number(request.query.limit ?? 200) || 200));
    const where = before && Number.isFinite(before) ? and(eq(boardActivity.boardId, access.row.id), lt(boardActivity.timestamp, new Date(before))) : eq(boardActivity.boardId, access.row.id);
    const rows = await ctx.db.select().from(boardActivity).where(where).orderBy(desc(boardActivity.timestamp)).limit(limit);
    return { entries: rows.map((r) => r.entry) };
  });
}
