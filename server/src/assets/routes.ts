/**
 * LuDraw server — rotas das imagens do Modo Servidor (Chat 08.2 · A-2).
 *
 *   POST /boards/:id/assets          corpo binário (≤ 12 MB); exige `board.edit` (membro, ou visitante com link de edição
 *                                    — `?as=visitor`); tipo pelos bytes (PNG/JPEG/WebP/GIF); devolve a referência.
 *   POST /boards/:id/assets/link     { hashes } — prova de acesso: vincula ao board imagens que a pessoa já pode ver
 *                                    noutro board (colar/duplicar entre boards). Devolve as que faltaram.
 *   GET  /assets/:hash[?board=&as=visitor]   bytes conferidos pelo sha256, só para quem pode ver (`can('board.view')`)
 *                                    um board vinculado; visitante, só do board do próprio link.
 * Respostas de imagem: `Cache-Control: private`, `X-Content-Type-Options: nosniff`, CSP `sandbox` (nada executa
 * mesmo que alguém abra a URL direto). Hash malformado = 400; inexistente ou sem acesso = o mesmo 404.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ASSET_HASH_RE, ASSET_MAX_BYTES, assetRef } from '../../../src/utils/assetRefs';
import { explain } from '../../../src/utils/permissions';
import { authenticate } from '../auth/authenticate';
import { boardAccessFor } from '../boards/routes';
import type { AppContext } from '../context';
import { boardAssetLinks, boardAssets } from '../db/schema';
import { apiError, forbidden, tooManyAttempts } from '../lib/errors';
import { visitorAccessByToken, visitorTokenGate } from '../public/routes';
import { AssetStoreError } from './store';
import { fetchRemoteImage, REMOTE_IMAGE } from './remoteImage';
import { assetStoreOf, linkAssets, memberCanSee, proveAccess, storeAsset, type AssetActor } from './service';

const bearer = (request: FastifyRequest) => {
  const h = request.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

const asVisitor = (request: FastifyRequest) => (request.query as { as?: string } | undefined)?.as === 'visitor';

export function registerAssetRoutes(app: FastifyInstance, ctx: AppContext): void {
  // corpo binário só nestas rotas (o resto da API continua JSON)
  app.addContentTypeParser(['application/octet-stream', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'], { parseAs: 'buffer', bodyLimit: ASSET_MAX_BYTES }, (_req, body, done) => done(null, body));

  /** Quem grava neste board e com que contexto de permissão. */
  async function writer(request: FastifyRequest, boardId: string): Promise<{ actor: AssetActor; organizationId: string }> {
    if (asVisitor(request)) {
      const access = await visitorAccessByToken(ctx, bearer(request), boardId, ctx.db);
      if (access.row.deletedAt) throw apiError(404, 'boardNotFound');
      const d = explain(access.context(), 'board.edit');
      if (!d.allowed) throw forbidden(d.reason);
      return { actor: { kind: 'visitor', visitorId: access.visitorId }, organizationId: access.row.organizationId };
    }
    const auth = await authenticate(ctx, request);
    const access = await boardAccessFor(ctx, auth, boardId);
    if (access.row.deletedAt) throw apiError(404, 'boardNotFound');
    access.require('board.edit');
    return { actor: { kind: 'member', auth }, organizationId: auth.organizationId };
  }

  // Chat 08.7 · R3 (S-07): autentica (membro ou visitante do board) ANTES de ler a imagem (até 12 MB)
  const visitorGate = visitorTokenGate(ctx, (r) => (r.params as { id: string }).id);
  const uploadGate = async (request: FastifyRequest): Promise<void> => {
    if (asVisitor(request)) await visitorGate(request);
    else await authenticate(ctx, request);
  };

  app.post<{ Params: { id: string } }>('/boards/:id/assets', { onRequest: uploadGate, bodyLimit: ASSET_MAX_BYTES }, async (request) => {
    const { actor, organizationId } = await writer(request, request.params.id);
    const body = request.body;
    if (!Buffer.isBuffer(body) || !body.byteLength) throw apiError(415, 'unsupportedImage');
    const stored = await storeAsset(ctx, {
      organizationId,
      boardId: request.params.id,
      userId: actor.kind === 'member' ? actor.auth.userId : actor.visitorId,
      bytes: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    });
    return { ref: assetRef(stored.hash), hash: stored.hash, mime: stored.mime, size: stored.size };
  });

  /**
   * Chat 09 · R2 (pendência 6, D6): "Baixar para o board" pelo servidor. Corpo = o endereço (texto, ≤ 2 KB); exige
   * `board.edit` (membro ou visitante com link de edição, autenticado ANTES de ler o corpo); limite por pessoa.
   * Devolve os BYTES (o app insere pelo caminho normal de arquivos). Endereço interno, sem resposta, redirecionamento
   * ruim ou arquivo que não é imagem respondem o MESMO erro (não serve de sonda da rede interna).
   */
  app.post<{ Params: { id: string } }>('/boards/:id/assets/fetch', { onRequest: uploadGate, bodyLimit: REMOTE_IMAGE.maxUrlLength }, async (request, reply) => {
    const { actor } = await writer(request, request.params.id);
    const who = actor.kind === 'member' ? `u:${actor.auth.userId}` : `v:${actor.visitorId}`;
    const limit = await ctx.limiters.remoteImage.hit(who);
    if (!limit.allowed) throw tooManyAttempts(Math.ceil(limit.retryAfterMs / 1000));
    const body = request.body;
    const url = Buffer.isBuffer(body) ? body.toString('utf8').trim() : typeof body === 'string' ? body.trim() : '';
    if (!url) throw apiError(400, 'invalidRequest');
    const result = await fetchRemoteImage(url, ctx.remoteImage ?? (ctx.config.devRemoteImageAllowLocal ? { testAllowPrivate: true } : {}));
    if (!result.ok) {
      if (result.reason === 'tooLarge') throw apiError(413, 'remoteImageTooLarge', { size: REMOTE_IMAGE.maxBytes / 1024 / 1024 });
      request.log.info({ reason: result.reason }, 'remote image refused');
      throw apiError(422, 'remoteImageFailed');
    }
    reply.header('content-type', result.type);
    reply.header('cache-control', 'no-store');
    reply.header('content-security-policy', "sandbox; default-src 'none'");
    return reply.send(result.bytes);
  });

  app.post<{ Params: { id: string }; Body: { hashes: string[] } }>(
    '/boards/:id/assets/link',
    { schema: { body: { type: 'object', required: ['hashes'], additionalProperties: false, properties: { hashes: { type: 'array', maxItems: 500, items: { type: 'string', pattern: '^[a-f0-9]{64}$' } } } } } },
    async (request) => {
      const { actor, organizationId } = await writer(request, request.params.id);
      const linked: string[] = [];
      const missing: string[] = [];
      for (const h of new Set(request.body.hashes)) {
        try {
          await proveAccess(ctx, actor, organizationId, request.params.id, new Set([h]));
          linked.push(h);
        } catch {
          missing.push(h);
        }
      }
      await linkAssets(ctx, organizationId, request.params.id, actor.kind === 'member' ? actor.auth.userId : actor.visitorId, linked);
      return { linked, missing };
    },
  );

  app.get<{ Params: { hash: string }; Querystring: { board?: string; as?: string } }>('/assets/:hash', async (request, reply) => {
    const hash = request.params.hash;
    if (!ASSET_HASH_RE.test(hash)) throw apiError(400, 'invalidRequest');
    let organizationId: string;
    if (asVisitor(request)) {
      // visitante: só imagens vinculadas ao board do PRÓPRIO link (token vencido/link revogado = 401)
      const boardId = request.query.board ?? '';
      const access = await visitorAccessByToken(ctx, bearer(request), boardId, ctx.db);
      if (access.row.deletedAt || !explain(access.context(), 'board.view').allowed) throw apiError(404, 'notFound');
      const [link] = await ctx.db
        .select({ b: boardAssetLinks.boardId })
        .from(boardAssetLinks)
        .where(and(eq(boardAssetLinks.boardId, boardId), eq(boardAssetLinks.sha256, hash)));
      if (!link) throw apiError(404, 'notFound');
      organizationId = access.row.organizationId;
    } else {
      // membro: conta suspensa/sessão encerrada já caem no `authenticate`; lixeira e ACL pelo `can('board.view')`
      const auth = await authenticate(ctx, request);
      if (!(await memberCanSee(ctx, auth, hash))) throw apiError(404, 'notFound');
      organizationId = auth.organizationId;
    }
    const [meta] = await ctx.db
      .select({ mime: boardAssets.mime })
      .from(boardAssets)
      .where(and(eq(boardAssets.organizationId, organizationId), eq(boardAssets.sha256, hash)));
    if (!meta) throw apiError(404, 'notFound');
    let bytes: Uint8Array | null;
    try {
      bytes = await assetStoreOf(ctx).read(hash);
    } catch (err) {
      // arquivo adulterado no disco: nunca é servido
      if (err instanceof AssetStoreError) request.log.error({ hash }, 'asset file does not match its hash');
      else request.log.error({ err, hash }, 'asset read failed');
      throw apiError(404, 'notFound');
    }
    if (!bytes) throw apiError(404, 'notFound');
    reply.header('content-type', meta.mime);
    reply.header('cache-control', 'private, max-age=300');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('content-security-policy', "sandbox; default-src 'none'");
    reply.header('content-disposition', 'inline');
    return reply.send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });
}
