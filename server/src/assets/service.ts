/**
 * LuDraw server — imagens do Modo Servidor (Chat 08.2 · A-2): regras usadas pelas rotas, pelo tempo real e pela
 * manutenção.
 *
 *  - Guardar: tipo pelos bytes (PNG/JPEG/WebP/GIF; SVG continua embutido), até `ASSET_MAX_BYTES`, arquivo por sha256
 *    na pasta, metadados por organização, vínculo com o board. Tudo sob a trava do hash (`pg_advisory_xact_lock`), a
 *    mesma usada pela coleta de órfãos: um arquivo nunca é apagado enquanto alguém o grava/vincula.
 *  - Conversão preguiçosa: imagem embutida (`data:` raster) vira referência `asset:<sha256>` ao gravar/abrir. NÃO
 *    destrutiva: o que não converte (SVG, acima do limite, bytes inválidos, disco com problema) fica como está.
 *  - Prova de acesso (decisão do usuário): uma referência nova num board só vale se a imagem já está vinculada a ele
 *    ou se quem grava pode ver (`can('board.view')`) outro board ao qual ela está vinculada.
 *  - Órfãos: imagem sem vínculo ganha `unlinkedAt` na primeira passada; 24 h depois, apagada com a trava, conferindo de
 *    novo; o arquivo só sai quando nenhuma organização o usa. A varredura só lê `board_assets`/`board_asset_links`.
 */
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { BoardData, CanvasElement } from '../../../src/types/canvas';
import { ASSET_MAX_BYTES, assetHashOf, assetHashesOfBoard, assetRef, isRasterDataUrl, sniffImageMime, type AssetMime } from '../../../src/utils/assetRefs';
import type { AuthContext } from '../auth/authenticate';
import { boardAccessFor } from '../boards/routes';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { boardAssetLinks, boardAssets, boards, boardYdocs } from '../db/schema';
import { boardDataOf, loadBoardRow } from '../boards/core';
import { apiError, forbidden, HttpError } from '../lib/errors';
import { AssetStore, AssetStoreError, sha256Hex } from './store';

export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Quem grava: membro autenticado ou visitante (link público de edição) daquele board. */
export type AssetActor = { kind: 'member'; auth: AuthContext } | { kind: 'visitor'; visitorId: string };

export function assetStoreOf(ctx: AppContext): AssetStore {
  if (!ctx.assets) throw new Error('asset store not initialised');
  return ctx.assets;
}

const lockHash = (tx: Db, hash: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'asset:' + hash}))`);

export interface StoredAsset {
  hash: string;
  mime: AssetMime;
  size: number;
}

/** Erro claro quando o disco falha (cheio, sem permissão): nada é referenciado. */
function storageError(err: unknown): never {
  if (err instanceof AssetStoreError) throw new HttpError(507, 'storageFailed', { key: 'server.errors.storageFailed' });
  throw err;
}

/**
 * Guarda os bytes e vincula a imagem ao board (se `boardId`). Recusa tipo desconhecido (415) e excesso (413).
 * Arquivo + linha + vínculo acontecem sob a trava do hash.
 */
export async function storeAsset(ctx: AppContext, input: { organizationId: string; boardId: string | null; userId: string; bytes: Uint8Array; link?: boolean }): Promise<StoredAsset> {
  const link = input.link !== false && !!input.boardId;
  const { bytes } = input;
  if (bytes.byteLength > ASSET_MAX_BYTES) throw apiError(413, 'imageTooLarge', { mb: Math.round(ASSET_MAX_BYTES / (1024 * 1024)) });
  const mime = sniffImageMime(bytes);
  if (!mime) throw apiError(415, 'unsupportedImage');
  const hash = sha256Hex(bytes);
  const store = assetStoreOf(ctx);
  await ctx.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await lockHash(tx, hash);
    try {
      await store.put(bytes, hash);
    } catch (err) {
      storageError(err);
    }
    await tx
      .insert(boardAssets)
      .values({ organizationId: input.organizationId, sha256: hash, size: bytes.byteLength, mime, originBoardId: input.boardId, createdBy: input.userId })
      .onConflictDoUpdate({ target: [boardAssets.organizationId, boardAssets.sha256], set: { unlinkedAt: null } });
    if (link) await insertLinks(tx, input.organizationId, input.boardId!, input.userId, [hash]);
  });
  if (link) ctx.collab?.rooms.get(input.boardId!)?.linkAssets([hash]);
  return { hash, mime, size: bytes.byteLength };
}

async function insertLinks(tx: Db, organizationId: string, boardId: string, userId: string, hashes: string[]): Promise<void> {
  if (!hashes.length) return;
  await tx
    .insert(boardAssetLinks)
    .values(hashes.map((sha256) => ({ boardId, organizationId, sha256, createdBy: userId })))
    .onConflictDoNothing();
  // vinculada de novo: a folga de órfão recomeça do zero
  await tx
    .update(boardAssets)
    .set({ unlinkedAt: null })
    .where(and(eq(boardAssets.organizationId, organizationId), inArray(boardAssets.sha256, hashes), isNotNull(boardAssets.unlinkedAt)));
}

/** Vincula hashes (já provados) a um board, sob a trava de cada hash. Ignora os que não existem na organização. */
export async function linkAssets(ctx: AppContext, organizationId: string, boardId: string, userId: string, hashes: Iterable<string>): Promise<string[]> {
  const list = [...new Set(hashes)];
  if (!list.length) return [];
  const linked: string[] = [];
  await ctx.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    for (const h of [...list].sort()) await lockHash(tx, h);
    const present = await tx
      .select({ sha256: boardAssets.sha256 })
      .from(boardAssets)
      .where(and(eq(boardAssets.organizationId, organizationId), inArray(boardAssets.sha256, list)));
    const ok = present.map((p) => p.sha256);
    await insertLinks(tx, organizationId, boardId, userId, ok);
    linked.push(...ok);
  });
  if (linked.length) ctx.collab?.rooms.get(boardId)?.linkAssets(linked);
  return linked;
}

export async function linkedHashes(db: Db, boardId: string, hashes?: string[]): Promise<Set<string>> {
  const rows = await db
    .select({ sha256: boardAssetLinks.sha256 })
    .from(boardAssetLinks)
    .where(hashes ? and(eq(boardAssetLinks.boardId, boardId), inArray(boardAssetLinks.sha256, hashes.length ? hashes : ['-'])) : eq(boardAssetLinks.boardId, boardId));
  return new Set(rows.map((r) => r.sha256));
}

/** Um membro pode ver ALGUM board (fora da lixeira, pelo `can('board.view')`) vinculado a esta imagem? */
export async function memberCanSee(ctx: AppContext, auth: AuthContext, hash: string, exceptBoardId?: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ boardId: boardAssetLinks.boardId })
    .from(boardAssetLinks)
    .where(and(eq(boardAssetLinks.organizationId, auth.organizationId), eq(boardAssetLinks.sha256, hash)));
  for (const r of rows) {
    if (r.boardId === exceptBoardId) continue;
    try {
      const access = await boardAccessFor(ctx, auth, r.boardId);
      if (!access.row.deletedAt && access.can('board.view')) return true;
    } catch {
      /* board que a pessoa não enxerga */
    }
  }
  return false;
}

/** Prova de acesso para usar `hashes` no board: já vinculados a ele, ou visíveis pela pessoa noutro board. */
export async function proveAccess(ctx: AppContext, actor: AssetActor, organizationId: string, boardId: string | null, hashes: Set<string>): Promise<void> {
  if (!hashes.size) return;
  const list = [...hashes];
  const existing = await ctx.db
    .select({ sha256: boardAssets.sha256 })
    .from(boardAssets)
    .where(and(eq(boardAssets.organizationId, organizationId), inArray(boardAssets.sha256, list)));
  const exists = new Set(existing.map((e) => e.sha256));
  const onBoard = boardId ? await linkedHashes(ctx.db, boardId, list) : new Set<string>();
  for (const h of list) {
    if (!exists.has(h)) throw forbidden({ key: 'server.errors.imageNotAvailable' });
    if (onBoard.has(h)) continue;
    if (actor.kind !== 'member' || !(await memberCanSee(ctx, actor.auth, h, boardId ?? undefined))) throw forbidden({ key: 'server.errors.imageNotAvailable' });
  }
}

function decodeDataUrl(v: string): Uint8Array | null {
  const comma = v.indexOf(',');
  if (comma < 0) return null;
  try {
    return new Uint8Array(Buffer.from(v.slice(comma + 1), 'base64'));
  } catch {
    return null;
  }
}

/**
 * Conversão preguiçosa: imagens raster embutidas viram arquivo + referência. Não destrutiva: o que não converte fica
 * como está (o board nunca é bloqueado por isso). Devolve os dados novos e os hashes criados.
 */
export async function externalizeImages(ctx: AppContext, organizationId: string, boardId: string | null, userId: string, data: BoardData): Promise<{ data: BoardData; converted: string[]; kept: number }> {
  const converted: string[] = [];
  let kept = 0;
  let elements: Record<string, CanvasElement> | null = null;
  for (const [id, el] of Object.entries(data.elements ?? {})) {
    if (el.type !== 'image') continue;
    const r = el as unknown as Record<string, unknown>;
    const field = typeof r.dataUrl === 'string' ? 'dataUrl' : typeof r.src === 'string' ? 'src' : null;
    const value = field ? (r[field] as string) : '';
    if (!field || !isRasterDataUrl(value)) continue;
    const bytes = decodeDataUrl(value);
    if (!bytes || bytes.byteLength > ASSET_MAX_BYTES || !sniffImageMime(bytes)) {
      kept++;
      continue;
    }
    try {
      const stored = await storeAsset(ctx, { organizationId, boardId, userId, bytes, link: false });
      elements ??= { ...data.elements };
      const next: Record<string, unknown> = { ...r, dataUrl: assetRef(stored.hash) };
      if (field === 'src') delete next.src;
      elements[id] = next as unknown as CanvasElement;
      converted.push(stored.hash);
    } catch {
      // disco cheio etc.: a imagem continua embutida (próxima gravação tenta de novo)
      kept++;
    }
  }
  return { data: elements ? { ...data, elements } : data, converted, kept };
}

/**
 * Antes de gravar conteúdo vindo de fora (PUT, criar, importar, restaurar versão): limites → conversão → prova de
 * acesso das referências novas. Depois da gravação, `linkAssets(…, result.hashes)`.
 */
export async function prepareIncomingAssets(
  ctx: AppContext,
  actor: AssetActor,
  organizationId: string,
  boardId: string | null,
  data: BoardData,
  previous?: BoardData | null,
): Promise<{ data: BoardData; hashes: Set<string> }> {
  const userId = actor.kind === 'member' ? actor.auth.userId : actor.visitorId;
  const { data: next, converted } = await externalizeImages(ctx, organizationId, boardId, userId, data);
  const all = assetHashesOfBoard(next);
  const known = assetHashesOfBoard(previous ?? null);
  const fresh = new Set([...all].filter((h) => !known.has(h) && !converted.includes(h)));
  await proveAccess(ctx, actor, organizationId, boardId, fresh);
  return { data: next, hashes: all };
}

/** Modelo guardado no servidor leva as imagens embutidas (usar o modelo cria arquivos/vínculos no board novo). */
export async function inlineImagesForTemplate(ctx: AppContext, auth: AuthContext, data: BoardData): Promise<BoardData> {
  let elements: Record<string, CanvasElement> | null = null;
  for (const [id, el] of Object.entries(data.elements ?? {})) {
    const hash = el.type === 'image' ? assetHashOf((el as unknown as { dataUrl?: string }).dataUrl ?? '') : null;
    if (!hash) continue;
    if (!(await memberCanSee(ctx, auth, hash))) throw forbidden({ key: 'server.errors.imageNotAvailable' });
    const [meta] = await ctx.db
      .select({ mime: boardAssets.mime })
      .from(boardAssets)
      .where(and(eq(boardAssets.organizationId, auth.organizationId), eq(boardAssets.sha256, hash)));
    const bytes = await assetStoreOf(ctx)
      .read(hash)
      .catch(() => null);
    if (!meta || !bytes) throw forbidden({ key: 'server.errors.imageNotAvailable' });
    elements ??= { ...data.elements };
    elements[id] = { ...el, dataUrl: `data:${meta.mime};base64,${Buffer.from(bytes).toString('base64')}` } as CanvasElement;
  }
  return elements ? { ...data, elements } : data;
}

/**
 * Migração preguiçosa ao ABRIR um board ao vivo: imagens embutidas no conteúdo gravado viram arquivo + referência.
 * Mudou algo → nova revisão e o documento salvo é apagado (época nova): cópias antigas nos navegadores são recusadas por
 * época, com a opção de baixar. Não destrutiva. Devolve true se migrou. Chamada pelo `onAuthenticate` ANTES da
 * conferência de época (senão a cópia velha de quem abriu a sala entraria na vida nova do documento).
 */
export async function migrateBoardImages(ctx: AppContext, boardId: string): Promise<boolean> {
  if (!ctx.assets) return false;
  const row = await loadBoardRow(ctx.db, boardId);
  const { data: next, converted } = await externalizeImages(ctx, row.organizationId, boardId, row.ownerId, boardDataOf(row));
  if (!converted.length) return false;
  let applied = false;
  await ctx.db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const fresh = await loadBoardRow(tx, boardId, { lock: true });
    if (fresh.revision !== row.revision) return;
    await tx.update(boards).set({ data: next as unknown as Record<string, unknown>, revision: row.revision + 1 }).where(eq(boards.id, boardId));
    await tx.delete(boardYdocs).where(eq(boardYdocs.boardId, boardId));
    applied = true;
  });
  if (!applied) return false;
  await linkAssets(ctx, row.organizationId, boardId, row.ownerId, converted);
  return true;
}

/** Manutenção de hora em hora: marca as imagens sem vínculo e apaga as que estão assim há mais de 24 h. */
export async function collectOrphanAssets(ctx: AppContext, now = new Date()): Promise<{ marked: number; removed: number; filesRemoved: number }> {
  const noLink = sql`not exists (select 1 from ${boardAssetLinks} l where l.organization_id = ${boardAssets.organizationId} and l.sha256 = ${boardAssets.sha256})`;
  const marked = await ctx.db.update(boardAssets).set({ unlinkedAt: now }).where(and(isNull(boardAssets.unlinkedAt), noLink)).returning({ sha256: boardAssets.sha256 });
  const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS);
  const due = await ctx.db
    .select({ organizationId: boardAssets.organizationId, sha256: boardAssets.sha256 })
    .from(boardAssets)
    .where(and(isNotNull(boardAssets.unlinkedAt), lt(boardAssets.unlinkedAt, cutoff)));
  let removed = 0;
  let filesRemoved = 0;
  for (const d of due) {
    await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      await lockHash(tx, d.sha256);
      // confere DE NOVO com a trava: alguém pode ter vinculado nesse meio-tempo
      const [row] = await tx
        .select({ unlinkedAt: boardAssets.unlinkedAt })
        .from(boardAssets)
        .where(and(eq(boardAssets.organizationId, d.organizationId), eq(boardAssets.sha256, d.sha256)))
        .for('update');
      if (!row?.unlinkedAt || row.unlinkedAt.getTime() >= cutoff.getTime()) return;
      const [link] = await tx
        .select({ boardId: boardAssetLinks.boardId })
        .from(boardAssetLinks)
        .where(and(eq(boardAssetLinks.organizationId, d.organizationId), eq(boardAssetLinks.sha256, d.sha256)))
        .limit(1);
      if (link) {
        await tx.update(boardAssets).set({ unlinkedAt: null }).where(and(eq(boardAssets.organizationId, d.organizationId), eq(boardAssets.sha256, d.sha256)));
        return;
      }
      await tx.delete(boardAssets).where(and(eq(boardAssets.organizationId, d.organizationId), eq(boardAssets.sha256, d.sha256)));
      removed++;
      const [other] = await tx.select({ o: boardAssets.organizationId }).from(boardAssets).where(eq(boardAssets.sha256, d.sha256)).limit(1);
      if (!other) {
        await assetStoreOf(ctx).remove(d.sha256);
        filesRemoved++;
      }
    });
  }
  return { marked: marked.length, removed, filesRemoved };
}
