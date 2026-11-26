/**
 * LuDraw — Contribuições declarativas → registries (Chat 06.5 · Rodada A).
 *
 * Cada função recebe um manifest JÁ VALIDADO e normalizado (`schema.ts`) e registra as contribuições
 * com `source: 'extension'` + `extensionId`. Desativar = `unregisterExtension(id)` (ver `registry.ts`).
 * Ids registrados são `"<id da extensão>/<id local>"` (nunca colidem com o núcleo nem entre extensões).
 * Rótulos são getters: acompanham o idioma ativo (`i18n` do manifest → nome padrão).
 */
import { getLocale } from '../../i18n';
import { scaleNormalizedPath } from '../../utils/svgPath';
import { ElementTypeRegistry, PaletteRegistry, ShapeRegistry, StickerRegistry, ThemeRegistry } from '../registries';
import { localizedName, resolveString } from '../schema';
import type { DeclPart, ExtensionManifest } from '../types';
import { stickerDataUrl } from './assets';

export const contributionId = (extensionId: string, localId: string) => `${extensionId}/${localId}`;

export function registerShapes(m: ExtensionManifest): void {
  m.contributes?.shapes?.forEach((s, i) => {
    ShapeRegistry.register({
      id: contributionId(m.id, s.id),
      source: 'extension',
      extensionId: m.id,
      order: 1000 + i,
      get label() {
        return localizedName(s, getLocale());
      },
      customPath: s.path,
      customDecoration: s.decoration,
      box: s.viewBox,
      textInsets: s.textInsets,
      defaultSize: s.defaultSize,
      path: (w, h) => scaleNormalizedPath(s.path, s.viewBox.width, s.viewBox.height, w, h),
    });
  });
}

export function registerThemes(m: ExtensionManifest): void {
  m.contributes?.themes?.forEach((th, i) => {
    ThemeRegistry.register({
      id: contributionId(m.id, th.id),
      source: 'extension',
      extensionId: m.id,
      order: i,
      get label() {
        return localizedName(th, getLocale());
      },
      light: { ...th.light },
      dark: { ...th.dark },
    });
  });
}

export function registerPalettes(m: ExtensionManifest): void {
  m.contributes?.palettes?.forEach((p, i) => {
    PaletteRegistry.register({
      id: contributionId(m.id, p.id),
      source: 'extension',
      extensionId: m.id,
      order: i,
      get label() {
        return localizedName(p, getLocale());
      },
      target: p.target,
      colors: p.colors.map((c) => ({
        hex: c.hex.toUpperCase(),
        get label() {
          return localizedName({ name: c.name ?? c.hex.toUpperCase(), i18n: c.i18n }, getLocale());
        },
      })),
    });
  });
}

export function registerStickers(m: ExtensionManifest, files: Record<string, Uint8Array>): void {
  m.contributes?.stickers?.forEach((pack, i) => {
    type Item = { id: string; label: string; emoji?: string; dataUrl?: string };
    const items = pack.items.flatMap((it): Item[] => {
      const label = () => localizedName({ name: it.name ?? it.emoji ?? it.id, i18n: it.i18n }, getLocale());
      if (it.emoji)
        return [
          {
            id: it.id,
            emoji: it.emoji,
            get label() {
              return label();
            },
          },
        ];
      const bytes = it.file ? files[it.file] : undefined;
      const r = it.file && bytes ? stickerDataUrl(it.file, bytes) : null;
      if (!r?.ok) return [];
      return [
        {
          id: it.id,
          dataUrl: r.url,
          get label() {
            return label();
          },
        },
      ];
    });
    StickerRegistry.register({
      id: contributionId(m.id, pack.id),
      source: 'extension',
      extensionId: m.id,
      order: i,
      get label() {
        return localizedName(pack, getLocale());
      },
      items,
    });
  });
}

/** Peças com os textos `{{chave}}` resolvidos no idioma ativo. */
export function resolveParts(parts: DeclPart[], strings: Record<string, Record<string, string>> | undefined, locale: string): DeclPart[] {
  return parts.map((p) => (p.kind === 'text' || p.kind === 'badge' ? { ...p, text: resolveString(p.text, strings, locale) } : { ...p }));
}

export function registerElementTypes(m: ExtensionManifest): void {
  m.contributes?.elementTypes?.forEach((et, i) => {
    ElementTypeRegistry.register({
      id: contributionId(m.id, et.id),
      source: 'extension',
      extensionId: m.id,
      order: i,
      typeId: et.id,
      get label() {
        return localizedName(et, getLocale());
      },
      defaultSize: { ...et.defaultSize },
      build: () => {
        const parts = resolveParts(et.parts, et.strings, getLocale());
        let text = '';
        const fields: Record<string, string> = {};
        for (const p of parts) {
          if ((p.kind === 'text' || p.kind === 'badge') && p.slot) {
            if (p.slot === 'main') text = p.text ?? '';
            else fields[p.slot] = p.text ?? '';
          }
        }
        return { parts, text, fields };
      },
    });
  });
}
