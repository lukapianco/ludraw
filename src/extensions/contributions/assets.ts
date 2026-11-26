/**
 * LuDraw — Arquivos de imagem dos pacotes (Chat 06.5 · Rodada A).
 *
 * Stickers podem ser SVG (sanitizado e reconstruído por `svgSanitize.ts`) ou PNG/WebP (assinatura
 * conferida). Viram data URL e só são exibidos como `<img>` — imagem não executa script.
 * Conferido NA INSTALAÇÃO (o pacote é recusado com o motivo) e de novo ao ativar.
 */
import type { MessageDescriptor } from '../../i18n/types';
import type { ValidationIssue } from '../schema';
import { rasterKind, sanitizeSvg, type SvgSanitizeIssue } from '../svgSanitize';
import type { ExtensionManifest } from '../types';

export const RASTER_STICKER_MAX_BYTES = 512 * 1024;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

const SVG_ISSUE_KEYS: Record<SvgSanitizeIssue, MessageDescriptor['key']> = {
  tooLarge: 'extensions.svg.tooLarge',
  syntax: 'extensions.svg.syntax',
  forbiddenElement: 'extensions.svg.forbiddenElement',
  forbiddenAttribute: 'extensions.svg.forbiddenAttribute',
  forbiddenValue: 'extensions.svg.forbiddenValue',
  notSvg: 'extensions.svg.notSvg',
  tooComplex: 'extensions.svg.tooComplex',
  noSize: 'extensions.svg.noSize',
};

/** Arquivo de sticker → data URL seguro, ou o motivo da recusa. */
export function stickerDataUrl(path: string, bytes: Uint8Array): { ok: true; url: string } | { ok: false; message: MessageDescriptor } {
  if (/\.svg$/i.test(path)) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, message: { key: 'extensions.svg.syntax', params: { detail: '' } } };
    }
    const r = sanitizeSvg(text);
    if (!r.ok) return { ok: false, message: { key: SVG_ISSUE_KEYS[r.issue], params: { detail: r.detail ?? '' } } };
    return { ok: true, url: `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(r.svg))}` };
  }
  const kind = rasterKind(bytes);
  const expected = /\.png$/i.test(path) ? 'png' : /\.webp$/i.test(path) ? 'webp' : null;
  if (!kind || kind !== expected) return { ok: false, message: { key: 'extensions.svg.rasterSignature' } };
  if (bytes.byteLength > RASTER_STICKER_MAX_BYTES) return { ok: false, message: { key: 'extensions.svg.rasterTooLarge', params: { size: RASTER_STICKER_MAX_BYTES / 1024 } } };
  return { ok: true, url: `data:image/${kind};base64,${toBase64(bytes)}` };
}

/** Confere todos os arquivos referenciados pelo manifest (hoje: stickers). */
export function validateAssets(manifest: ExtensionManifest, files: Record<string, Uint8Array>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  manifest.contributes?.stickers?.forEach((pack, i) =>
    pack.items.forEach((item, j) => {
      if (!item.file) return;
      const bytes = files[item.file];
      const path = `contributes.stickers[${i}].items[${j}].file`;
      if (!bytes) return issues.push({ path, message: { key: 'extensions.schema.assetMissing', params: { file: item.file } } });
      const r = stickerDataUrl(item.file, bytes);
      if (!r.ok) issues.push({ path: `${path} (${item.file})`, message: r.message });
    }),
  );
  return issues;
}
