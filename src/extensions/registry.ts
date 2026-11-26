/**
 * LuDraw — Liga/desliga as contribuições de uma extensão (Chat 06.5 · `EXTENSIONS_SPEC.md` §7).
 *
 * `activateContributions` registra tudo que o manifest (já validado) declara nos registries do Chat 05
 * e nos novos do 06.5; `deactivateContributions` tira tudo de uma vez (kill-switch, Modo Seguro,
 * desinstalar). Sem recarregar a página: a interface lê os registries por `useRegistry`.
 *
 * Ponto de extensão interno: `addContributor()` permite acrescentar mais tipos de contribuição sem
 * mexer aqui (ex.: modelos, que dependem do canvas).
 */
import { CommandRegistry, ElementTypeRegistry, ExporterRegistry, ImporterRegistry, PaletteRegistry, PanelRegistry, ShapeRegistry, StickerRegistry, TemplateRegistry, ThemeRegistry } from './registries';
import { registerElementTypes, registerPalettes, registerShapes, registerStickers, registerThemes } from './contributions/declarative';
import { registerTemplates } from './contributions/templates';
import type { ExtensionManifest } from './types';

type Contributor = (manifest: ExtensionManifest, files: Record<string, Uint8Array>) => void;

const contributors: Contributor[] = [registerShapes, registerThemes, registerPalettes, (m, f) => registerStickers(m, f), registerElementTypes, registerTemplates];

/** Acrescenta um tipo de contribuição (registrado uma vez, no carregamento do módulo que o define). */
export function addContributor(fn: Contributor): void {
  if (!contributors.includes(fn)) contributors.push(fn);
}

const REGISTRIES = [ShapeRegistry, TemplateRegistry, ThemeRegistry, StickerRegistry, PaletteRegistry, ElementTypeRegistry, ImporterRegistry, ExporterRegistry, CommandRegistry, PanelRegistry];

/** Tira do app tudo que a extensão registrou. */
export function deactivateContributions(extensionId: string): void {
  for (const r of REGISTRIES) r.unregisterExtension(extensionId);
}

/**
 * Registra as contribuições. Se qualquer uma falhar (ex.: id já usado por outra extensão), desfaz
 * tudo da extensão e lança o erro — nunca fica meio ativada.
 */
export function activateContributions(manifest: ExtensionManifest, files: Record<string, Uint8Array>): void {
  deactivateContributions(manifest.id);
  try {
    for (const fn of contributors) fn(manifest, files);
  } catch (err) {
    deactivateContributions(manifest.id);
    throw err;
  }
}

export type ContributionCounts = Record<'shapes' | 'templates' | 'themes' | 'stickers' | 'palettes' | 'elementTypes' | 'commands' | 'panels' | 'importers' | 'exporters', number>;

/** Quantas contribuições de cada tipo o manifest traz (fichas e tela de instalação). */
export function contributionCounts(manifest: ExtensionManifest): ContributionCounts {
  const c = manifest.contributes ?? {};
  return {
    shapes: c.shapes?.length ?? 0,
    templates: c.templates?.length ?? 0,
    themes: c.themes?.length ?? 0,
    stickers: c.stickers?.reduce((n, p) => n + p.items.length, 0) ?? 0,
    palettes: c.palettes?.length ?? 0,
    elementTypes: c.elementTypes?.length ?? 0,
    commands: c.commands?.length ?? 0,
    panels: c.panels?.length ?? 0,
    importers: c.importers?.length ?? 0,
    exporters: c.exporters?.length ?? 0,
  };
}
