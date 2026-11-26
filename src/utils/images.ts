import { t } from '../i18n';
import { isSafeImageSrc } from './contentSafety';
import { isAssetRef } from './assetRefs';
/**
 * LuDraw — Imagens (Chat 02 · Rodada A): leitura, compressão e cache de decodificação.
 * As imagens ficam embutidas no board como data URL (local-first). Para não estourar o
 * localStorage, toda imagem é redimensionada (lado maior ≤ 1600 px) e recomprimida em
 * WebP 0.85 — ou JPEG 0.85 quando o navegador não codifica WebP.
 */

export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_QUALITY = 0.85;

export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** Tamanho aproximado em bytes do data URL */
  bytes: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('widgets.images.couldntReadImageFile')));
    reader.readAsDataURL(file);
  });
}

/** Decodifica uma imagem a partir de um data URL/URL. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('widgets.images.imageFormatNotSupportedBrowser')));
    img.src = src;
  });
}

/** Redimensiona e recomprime a imagem via HTMLCanvas. */
export async function compressImageFile(file: File): Promise<CompressedImage> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  // SVG sem dimensões intrínsecas: usa um tamanho padrão
  let w = img.naturalWidth || 1200;
  let h = img.naturalHeight || 900;
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('widgets.images.n2dCanvasUnavailableThisBrowser'));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let dataUrl = canvas.toDataURL('image/webp', IMAGE_QUALITY);
  if (!dataUrl.startsWith('data:image/webp')) {
    // Sem codificador WebP: JPEG sobre fundo branco (JPEG não tem transparência)
    const flat = document.createElement('canvas');
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext('2d');
    if (!fctx) throw new Error(t('widgets.images.n2dCanvasUnavailableThisBrowser'));
    fctx.fillStyle = '#FFFFFF';
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvas, 0, 0);
    dataUrl = flat.toDataURL('image/jpeg', IMAGE_QUALITY);
  }
  // Se a recompressão ficou maior que o original pequeno (ex.: PNG de ícone), mantém o original
  if (scale === 1 && original.length < dataUrl.length && original.startsWith('data:image/') && !original.startsWith('data:image/svg')) {
    dataUrl = original;
  }
  return { dataUrl, width: w, height: h, bytes: Math.round((dataUrl.length * 3) / 4) };
}

/* ------------------------------ Cache para exportação ------------------------------ */

const decoded = new Map<string, HTMLImageElement>();

/** Garante que as imagens estejam decodificadas antes de desenhar em Canvas 2D (export.ts). */
export async function preloadImages(sources: string[]): Promise<Map<string, HTMLImageElement>> {
  const unique = Array.from(new Set(sources.filter(Boolean)));
  await Promise.all(
    unique.map(async (src) => {
      if (decoded.has(src)) return;
      // Chat 08.7 · R4 (S-30): miniatura, prévia e export não buscam imagem fora do board (o exportador desenha o marcador)
      if (!isAssetRef(src) && !isSafeImageSrc(src)) return;
      try {
        // Chat 08.2: referência a imagem do servidor → data URL (o export espera as imagens; o SVG fica autocontido)
        if (isAssetRef(src)) {
          const [{ assetDataUrl }, { useBoardStore }] = await Promise.all([import('../collab/assets'), import('../store/useBoardStore')]);
          decoded.set(src, await loadImage(await assetDataUrl(src, useBoardStore.getState().boardId ?? '')));
          return;
        }
        decoded.set(src, await loadImage(src));
      } catch {
        /* imagem corrompida: o exportador desenha um marcador no lugar */
      }
    }),
  );
  if (decoded.size > 64) {
    // Mantém o cache enxuto (data URLs podem ser grandes)
    for (const key of Array.from(decoded.keys())) {
      if (!unique.includes(key)) decoded.delete(key);
      if (decoded.size <= 64) break;
    }
  }
  const out = new Map<string, HTMLImageElement>();
  unique.forEach((src) => {
    const img = decoded.get(src);
    if (img) out.set(src, img);
  });
  return out;
}
