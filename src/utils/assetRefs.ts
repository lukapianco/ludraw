/**
 * LuDraw — referências de imagem guardada no servidor (Chat 08.2 · A-2). PURO (cliente e servidor).
 *
 * No Modo Servidor, a imagem não fica dentro do board: o elemento guarda `dataUrl = "asset:<sha256>"` e os bytes ficam
 * no servidor (`board_assets`, por conteúdo). O formato do `BoardData` não muda; o Modo Local continua com data URL.
 * SVG continua embutido (`data:image/svg+xml`, já sanitizado) — só PNG, JPEG, WebP e GIF viram arquivo.
 */
import type { BoardData, CanvasElement } from '../types/canvas';

export const ASSET_REF_PREFIX = 'asset:';
export const ASSET_HASH_RE = /^[a-f0-9]{64}$/;
/** Tipos que viram arquivo no servidor (conferidos pelos bytes iniciais, nunca pelo nome). */
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type AssetMime = (typeof ASSET_MIME_TYPES)[number];
/** Maior imagem aceita (bytes do arquivo). */
export const ASSET_MAX_BYTES = 12 * 1024 * 1024;

const RASTER_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

export const isAssetRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith(ASSET_REF_PREFIX) && ASSET_HASH_RE.test(v.slice(ASSET_REF_PREFIX.length));
export const assetHashOf = (ref: string): string | null => (isAssetRef(ref) ? ref.slice(ASSET_REF_PREFIX.length) : null);
export const assetRef = (hash: string): string => `${ASSET_REF_PREFIX}${hash}`;
/** Imagem embutida que deveria ser arquivo no Modo Servidor (SVG fica de fora). */
export const isRasterDataUrl = (v: unknown): v is string => typeof v === 'string' && RASTER_DATA_URL.test(v);

/** Campo da imagem: `dataUrl` (formato atual) ou `src` (legado). */
export function imageSourceOf(el: CanvasElement | Record<string, unknown>): string | undefined {
  const r = el as Record<string, unknown>;
  if (r.type !== 'image') return undefined;
  if (typeof r.dataUrl === 'string') return r.dataUrl;
  return typeof r.src === 'string' ? r.src : undefined;
}

/** Hashes citados pelos elementos. */
export function assetHashesOf(elements: Record<string, CanvasElement> | CanvasElement[] | undefined): Set<string> {
  const out = new Set<string>();
  const list = Array.isArray(elements) ? elements : Object.values(elements ?? {});
  for (const el of list) {
    const h = assetHashOf(imageSourceOf(el) ?? '');
    if (h) out.add(h);
  }
  return out;
}

export const assetHashesOfBoard = (data: Pick<BoardData, 'elements'> | null | undefined): Set<string> => assetHashesOf(data?.elements);

/** Tipo da imagem pelos bytes iniciais (assinatura do formato). Null = não é PNG/JPEG/WebP/GIF. */
export function sniffImageMime(b: Uint8Array): AssetMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
