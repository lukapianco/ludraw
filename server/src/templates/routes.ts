/**
 * LuDraw server — modelos (templates) por escopo (Chat 07). Mesma regra do cliente (`saveTemplate` e
 * `templateAccess`): pessoal = quem criou; Time = `workspace.templates.team` + participar do time;
 * Workspace = `workspace.templates.manage`. Time/Workspace ficam no Audit Log.
 */
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { TemplateScope } from '../../../src/types/workspace';
import { BOARD_LIMITS } from '../../../src/utils/boardLimits';
import { createId } from '../../../src/utils/id';
import { explain, workspaceContext, type PermissionAction } from '../../../src/utils/permissions';
import { canUsePlace, type Viewer } from '../../../src/utils/workspace';
import { rulesView, type WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import { requireAuth } from '../auth/authenticate';
import type { AppContext } from '../context';
import { templates } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { apiError, forbidden } from '../lib/errors';
import type { BoardData } from '../../../src/types/canvas';
import { inlineImagesForTemplate } from '../assets/service';
import { assertBoardData, assertSafeNewContent } from '../boards/core';
import { loadRulesState } from '../workspace/state';
import { templateFromRow, viewerOf } from '../workspace/service';

type Scope = Exclude<TemplateScope, 'system'>;

function canManageScope(state: WorkspaceRulesState, viewer: Viewer, scope: Scope, teamId: string | null, createdBy: string): { ok: true } | { ok: false; reason?: Parameters<typeof forbidden>[0] } {
  if (viewer.workspaceRole !== 'admin' && viewer.workspaceRole !== 'member') return { ok: false };
  if (scope === 'personal') return createdBy === viewer.userId ? { ok: true } : { ok: false };
  const action: PermissionAction = scope === 'team' ? 'workspace.templates.team' : 'workspace.templates.manage';
  const d = explain(workspaceContext(viewer, rulesView(state).policies), action);
  if (!d.allowed) return { ok: false, reason: d.reason };
  if (scope === 'team' && (!teamId || !canUsePlace(viewer, { kind: 'team', teamId }, state.teams, state.projects))) return { ok: false, reason: { key: 'workspace.errors.placeNotAllowed' } };
  return { ok: true };
}

export function registerTemplateRoutes(app: FastifyInstance, ctx: AppContext): void {
  const auth = requireAuth(ctx);

  app.post<{ Body: { name: string; description?: string; scope: Scope; teamId?: string; thumbnail?: string; data: unknown } }>(
    '/templates',
    {
      // Chat 08.7 · R3 (S-07): autentica ANTES de ler o corpo
      onRequest: auth,
      bodyLimit: BOARD_LIMITS.bodyBytes,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'scope', 'data'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            scope: { type: 'string', enum: ['personal', 'team', 'workspace'] },
            teamId: { type: 'string', maxLength: 80 },
            thumbnail: { type: 'string', maxLength: 2_000_000 },
            data: { type: 'object' },
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
      const allowed = canManageScope(state, viewer, body.scope, body.teamId ?? null, a.userId);
      if (!allowed.ok) throw forbidden(allowed.reason);
      if (body.thumbnail && !/^data:image\/(png|jpeg|webp);base64,/.test(body.thumbnail)) throw apiError(400, 'invalidRequest');
      // Chat 08.2: o modelo leva as imagens embutidas (quem usar o modelo cria os arquivos no board novo)
      body.data = await inlineImagesForTemplate(ctx, a, body.data as BoardData);
      assertBoardData(body.data);
      const id = createId(16);
      const name = body.name.trim();
      await ctx.db.insert(templates).values({
        id,
        organizationId: a.organizationId,
        scope: body.scope,
        teamId: body.scope === 'team' ? (body.teamId ?? null) : null,
        createdBy: a.userId,
        name,
        description: body.description?.trim() || null,
        thumbnail: body.thumbnail ?? null,
        data: body.data as unknown as Record<string, unknown>,
      });
      if (body.scope !== 'personal') {
        await recordAudit(ctx.db, {
          organizationId: a.organizationId,
          actorId: a.userId,
          action: 'template_saved',
          message: { key: 'workspace.audit.msg.templateSaved', params: { name, scope: { key: body.scope === 'team' ? 'workspace.templates.scopeTeam' : 'workspace.templates.scopeWorkspace' } } },
          targetType: 'template',
          targetId: id,
          targetName: name,
          ip: request.ip,
        });
      }
      const [row] = await ctx.db.select().from(templates).where(eq(templates.id, id));
      return { template: templateFromRow(row!) };
    },
  );

  const loadOwned = async (orgId: string, id: string) => {
    const [row] = await ctx.db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.organizationId, orgId)));
    if (!row) throw apiError(404, 'notFound');
    return row;
  };

  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/templates/:id',
    { preHandler: auth, schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 200 } } } } },
    async (request) => {
      const a = request.auth!;
      const row = await loadOwned(a.organizationId, request.params.id);
      const state = await loadRulesState(ctx.db, a.organizationId, ctx.keys);
      const allowed = canManageScope(state, viewerOf(state, a), row.scope, row.teamId, row.createdBy);
      if (!allowed.ok) throw forbidden(allowed.reason);
      await ctx.db.update(templates).set({ name: request.body.name.trim() }).where(eq(templates.id, row.id));
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/templates/:id', { preHandler: auth }, async (request) => {
    const a = request.auth!;
    const row = await loadOwned(a.organizationId, request.params.id);
    const state = await loadRulesState(ctx.db, a.organizationId, ctx.keys);
    const allowed = canManageScope(state, viewerOf(state, a), row.scope, row.teamId, row.createdBy);
    if (!allowed.ok) throw forbidden(allowed.reason);
    await ctx.db.delete(templates).where(eq(templates.id, row.id));
    return { ok: true };
  });
}
