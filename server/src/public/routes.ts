/**
 * LuDraw server — links públicos REAIS (Chat 07; ARCHITECTURE_MAP §6, contrato de servidor 4).
 *
 * - `GET /public/links/:token` diz em que estado o link está (ok, senha, vencido, revogado, desligado,
 *   política, inválido) — a mesma `resolvePublicLink` do cliente.
 * - `POST /public/links/:token/session` abre a sessão de visitante: senha em argon2id com limite DUPLO
 *   (por IP e por link, com espera crescente gravada no banco). Sucesso = token curto só para aquele board.
 * - `GET/PUT /public/boards/:id/data` com esse token: a mesma redação e o mesmo `writeGuard` (papel visitante,
 *   nível do link, `allowDownload` com a política como teto). Revogar, vencer, desligar ou gerar outro
 *   link derruba as sessões abertas na próxima requisição.
 */
import { and, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BoardMeta, WorkspacePolicies } from '../../../src/types/workspace';
import type { PublicLinkResolution, PublicLinkSession } from '../../../src/utils/apiContract';
import { BOARD_LIMITS } from '../../../src/utils/boardLimits';
import { explain, type PermissionContext } from '../../../src/utils/permissions';
import { DEFAULT_VISITOR_NAME } from '../../../src/utils/storedDefaults';
import { resolvePublicLink, visitorPermissionContext } from '../../../src/utils/workspace';
import { verifyPassword } from '../auth/passwords';
import { signVisitorToken, verifyVisitorToken, VISITOR_TOKEN_TTL_SECONDS } from '../auth/tokens';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { publicLinks } from '../db/schema';
import { randomUrlToken, sha256Hex } from '../lib/crypto';
import { apiError, forbidden, HttpError, tooManyAttempts } from '../lib/errors';
import { assertBoardData, boardDataOf, loadBoardRow, readEnvelope, writeBoardData, type BoardRow } from '../boards/core';
import type { BoardData } from '../../../src/types/canvas';
import { linkAssets, prepareIncomingAssets } from '../assets/service';
import { linkFromRow, loadOrganization } from '../workspace/state';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
/** Tentativas erradas por link antes da espera crescente (1, 2, 4… minutos, até 60). */
export const LINK_FREE_ATTEMPTS = 5;

type LinkRow = typeof publicLinks.$inferSelect;

export function lockMinutes(failed: number): number {
  if (failed < LINK_FREE_ATTEMPTS) return 0;
  return Math.min(60, 2 ** (failed - LINK_FREE_ATTEMPTS));
}

async function linkByToken(db: Db, token: string): Promise<{ link: LinkRow; board: BoardRow } | null> {
  if (!TOKEN_RE.test(token)) return null;
  // Chat 08.7 · R5 (S-17): busca pelo hash — o token em texto não fica no banco
  const [link] = await db.select().from(publicLinks).where(eq(publicLinks.tokenHash, sha256Hex(token)));
  if (!link) return null;
  const board = await loadBoardRow(db, link.boardId).catch(() => null);
  return board ? { link, board } : null;
}

/**
 * Estado do link para `resolvePublicLink`. `presented` = o token que chegou e JÁ foi conferido pelo hash (rota
 * pública); na conferência do visitante (sem o token em mãos) usa-se o próprio hash como identidade do link.
 */
function metaFor(link: LinkRow, board: BoardRow, presented: string): Pick<BoardMeta, 'publicLink' | 'deletedAt'> {
  return { publicLink: { ...linkFromRow(link), token: presented }, deletedAt: board.deletedAt?.getTime() ?? null };
}

/** Impressão do link no token de visitante: `sha256(token)` (= `token_hash`) — tokens emitidos antes continuam valendo. */
const linkPrint = (link: LinkRow) => link.tokenHash.slice(0, 24);

export interface VisitorAccess {
  row: BoardRow;
  context: (extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => PermissionContext;
  visitorId: string;
}

/** Confere o token de visitante E o estado atual do link (revogado/vencido/novo token derruba na hora). */
async function visitorAccess(ctx: AppContext, request: FastifyRequest, boardId: string, db: Db, lock = false): Promise<VisitorAccess> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  return visitorAccessByToken(ctx, token, boardId, db, lock);
}

/** O mesmo, a partir do token solto (WebSocket do tempo real: Chat 08). */
export async function visitorAccessByToken(ctx: AppContext, token: string | null, boardId: string, db: Db, lock = false): Promise<VisitorAccess> {
  const claims = token ? await verifyVisitorToken(ctx.keys.jwt, token) : null;
  if (!claims || claims.boardId !== boardId) throw apiError(401, 'unauthorized');
  const row = await loadBoardRow(db, boardId, { lock });
  const [link] = await db.select().from(publicLinks).where(eq(publicLinks.boardId, boardId));
  if (!link || linkPrint(link) !== claims.linkPrint) throw apiError(401, 'linkUnavailable');
  const org = await loadOrganization(db, row.organizationId);
  const policies = org.policies as WorkspacePolicies;
  if (resolvePublicLink(metaFor(link, row, link.tokenHash), link.tokenHash, policies, true) !== 'ok') throw apiError(401, 'linkUnavailable');
  const shareLink = linkFromRow(link);
  return { row, visitorId: claims.visitorId, context: (extra) => ({ ...visitorPermissionContext(claims.visitorId, shareLink, policies), ...extra }) };
}

/**
 * Chat 08.7 · R3 (S-07): conferência LEVE do token de visitante no `onRequest` (antes de ler o corpo): JWT válido e
 * do board da URL. A conferência completa (link vivo, política, permissão) continua no handler.
 */
export function visitorTokenGate(ctx: AppContext, boardIdOf: (request: FastifyRequest) => string) {
  return async (request: FastifyRequest): Promise<void> => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const claims = token ? await verifyVisitorToken(ctx.keys.jwt, token) : null;
    if (!claims || claims.boardId !== boardIdOf(request)) throw apiError(401, 'unauthorized');
  };
}

export function registerPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get<{ Params: { token: string } }>('/public/links/:token', async (request) => {
    const found = await linkByToken(ctx.db, request.params.token);
    if (!found) return { status: 'invalid' } satisfies PublicLinkResolution;
    const org = await loadOrganization(ctx.db, found.board.organizationId);
    const status = resolvePublicLink(metaFor(found.link, found.board, request.params.token), request.params.token, org.policies as WorkspacePolicies, false);
    const open = status === 'ok' || status === 'password';
    const res: PublicLinkResolution = open
      ? { status, boardId: found.board.id, boardName: found.board.name, accessLevel: found.link.accessLevel, ...(found.link.allowDownload !== null ? { allowDownload: found.link.allowDownload } : {}) }
      : { status };
    return res;
  });

  app.post<{ Params: { token: string }; Body: { password?: string } }>(
    '/public/links/:token/session',
    { schema: { body: { type: 'object', additionalProperties: false, properties: { password: { type: 'string', maxLength: 1024 } } } } },
    async (request) => {
      const ipCheck = await ctx.limiters.publicLinkIp.check(request.ip);
      if (!ipCheck.allowed) throw tooManyAttempts(ipCheck.retryAfterMs / 1000);
      const found = await linkByToken(ctx.db, request.params.token);
      if (!found) throw apiError(404, 'linkUnavailable');
      const { link, board } = found;
      const org = await loadOrganization(ctx.db, board.organizationId);
      const policies = org.policies as WorkspacePolicies;
      const meta = metaFor(link, board, request.params.token);
      let status = resolvePublicLink(meta, request.params.token, policies, false);
      if (status === 'password') {
        const now = Date.now();
        if (link.lockedUntil && link.lockedUntil.getTime() > now) throw tooManyAttempts((link.lockedUntil.getTime() - now) / 1000);
        const password = request.body?.password;
        if (!password) throw apiError(401, 'linkPasswordRequired');
        // Chat 08.7 · R3 (S-04/S-05): a tentativa é RESERVADA antes do argon2 — no limite por IP (memória) e no
        // contador do link (banco, `UPDATE … RETURNING` atômico, só se o link não estiver travado). Sem ler-e-gravar.
        const ipSlot = await ctx.limiters.publicLinkIp.reserve(request.ip);
        if (!ipSlot.allowed) throw tooManyAttempts(ipSlot.retryAfterMs / 1000);
        const [slot] = await ctx.db
          .update(publicLinks)
          .set({ failedAttempts: sql`${publicLinks.failedAttempts} + 1` })
          .where(and(eq(publicLinks.boardId, link.boardId), or(isNull(publicLinks.lockedUntil), lte(publicLinks.lockedUntil, new Date(now)))))
          .returning({ failed: publicLinks.failedAttempts });
        if (!slot) {
          await ctx.limiters.publicLinkIp.release(request.ip);
          const [cur] = await ctx.db.select({ lockedUntil: publicLinks.lockedUntil }).from(publicLinks).where(eq(publicLinks.boardId, link.boardId));
          throw tooManyAttempts(Math.max(1, ((cur?.lockedUntil?.getTime() ?? now) - now) / 1000));
        }
        const verdict = await verifyPassword(link.passwordHash, password);
        if (!verdict.ok) {
          const failed = slot.failed;
          const minutes = lockMinutes(failed);
          if (minutes) {
            // trava (ou estende) atomicamente: só avança o prazo, nunca recua
            const until = new Date(now + minutes * 60_000);
            await ctx.db
              .update(publicLinks)
              .set({ lockedUntil: until })
              .where(and(eq(publicLinks.boardId, link.boardId), or(isNull(publicLinks.lockedUntil), lt(publicLinks.lockedUntil, until))));
          }
          request.log.warn({ event: 'public_link_wrong_password', boardId: link.boardId, failed }, 'wrong public link password');
          if (minutes) throw tooManyAttempts(minutes * 60);
          throw apiError(401, 'linkWrongPassword');
        }
        await ctx.limiters.publicLinkIp.release(request.ip);
        status = resolvePublicLink(meta, request.params.token, policies, true);
      }
      if (status !== 'ok') throw new HttpError(403, 'linkUnavailable', { key: 'server.errors.linkUnavailable', params: { status } });
      await ctx.db.update(publicLinks).set({ lastUsedAt: new Date(), failedAttempts: 0, lockedUntil: null }).where(eq(publicLinks.boardId, link.boardId));
      const visitorId = `visitante:${randomUrlToken(9)}`;
      const session: PublicLinkSession = {
        visitorToken: await signVisitorToken(ctx.keys.jwt, { boardId: board.id, visitorId, linkPrint: linkPrint(link) }),
        expiresIn: VISITOR_TOKEN_TTL_SECONDS,
        boardId: board.id,
        accessLevel: link.accessLevel,
        ...(link.allowDownload !== null ? { allowDownload: link.allowDownload } : {}),
        policies,
      };
      return session;
    },
  );

  app.get<{ Params: { id: string } }>('/public/boards/:id/data', async (request, reply) => {
    const access = await visitorAccess(ctx, request, request.params.id, ctx.db);
    const d = explain(access.context(), 'board.view');
    if (!d.allowed) throw forbidden(d.reason);
    reply.header('etag', `"${access.row.revision}"`);
    return readEnvelope(access.row, { userId: access.visitorId, canManageVoting: false });
  });

  // Chat 07 · B: a página do visitante consulta isto; link revogado/vencido/novo = 401 na hora
  app.get<{ Params: { id: string } }>('/public/boards/:id/revision', async (request) => {
    const access = await visitorAccess(ctx, request, request.params.id, ctx.db);
    return { revision: access.row.revision };
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/public/boards/:id/data', { onRequest: visitorTokenGate(ctx, (r) => (r.params as { id: string }).id), bodyLimit: BOARD_LIMITS.bodyBytes }, async (request, reply) => {
    const raw = request.headers['if-match'];
    const expected = typeof raw === 'string' ? Number(raw.replace(/"/g, '')) : NaN;
    if (!Number.isInteger(expected)) throw apiError(428, 'invalidRequest');
    // Chat 08.2: imagens embutidas viram arquivo; visitante só usa imagens já vinculadas a este board
    const pre = await visitorAccess(ctx, request, request.params.id, ctx.db);
    if (pre.row.deletedAt) throw apiError(404, 'boardNotFound');
    assertBoardData(request.body);
    const prepared = await prepareIncomingAssets(ctx, { kind: 'visitor', visitorId: pre.visitorId }, pre.row.organizationId, request.params.id, request.body as BoardData, boardDataOf(pre.row));
    const outcome = await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const access = await visitorAccess(ctx, request, request.params.id, tx, true);
      if (access.row.deletedAt) throw apiError(404, 'boardNotFound');
      return writeBoardData(tx, access.row, prepared.data, expected, {
        viewer: { userId: access.visitorId, name: DEFAULT_VISITOR_NAME, role: 'visitor' },
        context: access.context,
        canManageVoting: false,
        now: Date.now(),
      });
    });
    await linkAssets(ctx, pre.row.organizationId, request.params.id, pre.visitorId, prepared.hashes);
    await ctx.collab?.resetBoard(request.params.id, 'replaced');
    reply.header('etag', `"${outcome.revision}"`);
    return { revision: outcome.revision };
  });

}
