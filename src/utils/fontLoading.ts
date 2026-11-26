/**
 * Carregamento explícito de fontes antes de desenhar texto em canvas/SVG (Chat 05.5).
 *
 * `document.fonts.ready` só espera fontes que o DOM já pediu: uma família usada apenas num board
 * exportado (ou o Figtree 600 dos rótulos de linha) pode nunca ter sido baixada, e o canvas desenharia
 * o fallback. Aqui pedimos cada família/peso/estilo com `document.fonts.load()`, passando o texto real
 * para que o navegador baixe o subconjunto certo (latin ou latin-ext, ver src/styles/fonts.css).
 * Fontes autohospedadas: funciona offline. Famílias do sistema (Arial, Georgia) resolvem na hora.
 */

import type { CanvasElement } from '../types/canvas';
import { isTextualElement } from '../types/canvas';
import { getElementText } from './factory';
import { resolveFontName } from './text';

/** Famílias que o desenho em canvas usa por conta própria (rótulos, Kanban, mapa mental, tabelas, código). */
export const CANVAS_UI_FONT_FAMILIES = ['Figtree', 'IBM Plex Mono'] as const;

const FACES = ['400', '700', 'italic 400', 'italic 700'] as const;
/** Pesos extras do Figtree usados pelo desenho da interface no canvas (rótulos 600, títulos 500/700). */
const FIGTREE_EXTRA = ['500', '600'] as const;
const SAMPLE_LIMIT = 4000;
const DEFAULT_TIMEOUT_MS = 5000;

function quoteFamily(family: string): string {
  return /^[A-Za-z-]+$/.test(family) ? family : `"${family.replace(/"/g, '')}"`;
}

/** Valores de `fontName` em qualquer nível do elemento (células de tabela, cartões etc.). */
function collectFontNames(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) collectFontNames(v, out, depth + 1);
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'dataUrl') continue;
    if (key === 'fontName' && typeof v === 'string' && v) out.add(v);
    else if (v && typeof v === 'object') collectFontNames(v, out, depth + 1);
  }
}

/** Famílias e texto de amostra necessários para desenhar `elements`. */
export function fontsForElements(elements: CanvasElement[]): { families: string[]; sample: string } {
  const families = new Set<string>(CANVAS_UI_FONT_FAMILIES);
  let sample = '';
  for (const el of elements) {
    if (isTextualElement(el)) families.add(resolveFontName(el));
    collectFontNames(el, families);
    if (sample.length < SAMPLE_LIMIT) sample += getElementText(el) + ' ';
  }
  return { families: [...families], sample: sample.slice(0, SAMPLE_LIMIT) };
}

/**
 * Garante que as faces (400/700 × normal/itálico) das famílias estejam carregadas. Nunca rejeita:
 * se algo falhar ou demorar mais que `timeoutMs`, segue com o que houver (fallbacks).
 */
export async function ensureFontsLoaded(families: Iterable<string>, sample = '', timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const text = `${sample} AaÀàÇçÕõĀāŁłẞ0123456789`;
  const jobs: Promise<unknown>[] = [];
  for (const family of new Set(families)) {
    const fam = quoteFamily(family);
    const faces = family === 'Figtree' ? [...FACES, ...FIGTREE_EXTRA] : FACES;
    for (const face of faces) jobs.push(document.fonts.load(`${face} 16px ${fam}`, text).catch(() => []));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([Promise.all(jobs), timeout]);
    await Promise.race([document.fonts.ready, timeout]);
  } catch {
    /* fontes indisponíveis: usa fallbacks */
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Atalho do export: carrega tudo o que `elements` vai desenhar. */
export function ensureFontsForElements(elements: CanvasElement[], timeoutMs?: number): Promise<void> {
  const { families, sample } = fontsForElements(elements);
  return ensureFontsLoaded(families, sample, timeoutMs);
}
