/**
 * LuDraw — tipo de imagem pelos primeiros bytes (PURO: cliente e servidor). Extraído de `externalImage.ts` no
 * Chat 09 · R2 para o proxy de imagem do servidor usar a MESMA regra ("Baixar para o board", pendência 6).
 */
import { looksLikeSvg } from './textSniff';

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Tipo pela assinatura dos primeiros bytes (ou `null` se não for imagem conhecida). */
export function sniffImageType(b: Uint8Array): string | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4) && /^avi[fs]$/.test(String.fromCharCode(...b.subarray(8, 12)))) return 'image/avif';
  if (startsWith(b, [0x42, 0x4d])) return 'image/bmp';
  // SVG: varredura linear (S-35), nunca regex com repetição aninhada
  if (looksLikeSvg(new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 4096)).replace(/^\uFEFF/, ''))) return 'image/svg+xml';
  return null;
}
