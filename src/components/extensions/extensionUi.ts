/**
 * LuDraw — Ajudantes de interface das extensões (Chat 06.5 · Rodada A).
 * Agrupa contribuições por extensão e resolve o nome da extensão no idioma ativo.
 */
import { useCallback } from 'react';
import { useLocale } from '../../i18n/useT';
import { localizedName } from '../../extensions/schema';
import type { RegistryItem } from '../../extensions/registries';
import { useExtensionsStore } from '../../store/useExtensionsStore';

/** Nome (no idioma ativo) de uma extensão pelo id. */
export function useExtensionName(): (id: string | undefined) => string {
  const list = useExtensionsStore((s) => s.extensions);
  const locale = useLocale();
  return useCallback(
    (id: string | undefined) => {
      const ext = list.find((e) => e.record.id === id);
      if (!ext) return id ?? '';
      return ext.manifest ? localizedName(ext.manifest, locale) : ext.record.name;
    },
    [list, locale],
  );
}

/** Agrupa os itens de extensão por `extensionId` (na ordem em que aparecem). */
export function groupByExtension<T extends RegistryItem>(items: readonly T[]): Array<{ extensionId: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    if (it.source !== 'extension' || !it.extensionId) continue;
    const g = groups.get(it.extensionId) ?? [];
    g.push(it);
    groups.set(it.extensionId, g);
  }
  return [...groups].map(([extensionId, list]) => ({ extensionId, items: list }));
}
