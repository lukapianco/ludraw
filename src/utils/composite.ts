/**
 * LuDraw — Elemento composto de extensão (Chat 06.5 · `EXTENSIONS_SPEC.md` §4 `elementTypes`).
 *
 * Geometria ÚNICA para a tela (`DeclarativeElementView`) e o export (`export.ts`): as peças
 * declarativas (posição em fração 0–1 da caixa) viram primitivas em pixels do elemento.
 * Nada aqui executa código da extensão: só desenha retângulos, elipses, paths normalizados e textos.
 *
 * Validação (ajuste do usuário): todo elemento `composite` passa por `validateCompositeElement` antes
 * de ser desenhado ou exportado — inválido é IGNORADO (não desenha, não exporta), sem quebrar o board.
 * Vale para qualquer origem: abrir, importar, colar, restaurar versão, backup.
 */
import { validateCompositeElement, validateCustomPath, LIMITS } from '../extensions/schema';
import type { DeclPart } from '../extensions/types';
import type { CompositeElement } from '../types/canvas';
import { scaleNormalizedPath } from './svgPath';
import { DEFAULT_FONT_NAME, fontCss, type ResolvedTextStyle } from './text';

const validCache = new WeakMap<object, boolean>();

/** Elemento composto válido? (memorizado por objeto — elementos são imutáveis no store) */
export function isValidComposite(el: CompositeElement): boolean {
  let v = validCache.get(el);
  if (v === undefined) {
    v = validateCompositeElement(el);
    validCache.set(el, v);
  }
  return v;
}

const pathCache = new Map<string, boolean>();

/** `customPath`/`customDecoration` de formas: válido no formato normalizado? (memorizado por texto) */
export function isValidCustomPath(d: string): boolean {
  let v = pathCache.get(d);
  if (v === undefined) {
    v = validateCustomPath(d, LIMITS.boardPathNumbers);
    if (pathCache.size > 500) pathCache.clear();
    pathCache.set(d, v);
  }
  return v;
}

export const COMPOSITE_TEXT_COLOR = '#1C1C1E';

export type CompositePrimitive =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number; fill: string; stroke: string; strokeWidth: number; dashed: boolean }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number; fill: string; stroke: string; strokeWidth: number; dashed: boolean }
  /** `d` já escalado para (w × h) e relativo a (x, y) */
  | { kind: 'path'; x: number; y: number; w: number; h: number; d: string; fill: string; stroke: string; strokeWidth: number }
  | {
      kind: 'text';
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      fontSize: number;
      style: ResolvedTextStyle;
      valign: 'top' | 'middle' | 'bottom';
      /** peça do texto principal (editável por duplo clique) */
      main: boolean;
      /** fundo de selo (badge) */
      badge?: string;
    };

const paint = (c: string | undefined) => (!c || c === 'transparent' ? 'none' : c);

function textStyle(part: Extract<DeclPart, { kind: 'text' | 'badge' }>, color: string): ResolvedTextStyle {
  return {
    fontName: DEFAULT_FONT_NAME,
    fontFamilyCss: fontCss(DEFAULT_FONT_NAME),
    fontWeight: part.kind === 'badge' || part.bold ? 'bold' : 'normal',
    fontStyle: part.kind === 'text' && part.italic ? 'italic' : 'normal',
    underline: false,
    strikethrough: false,
    listStyle: 'none',
    indent: 0,
    link: null,
    highlightColor: null,
    textAlign: part.kind === 'badge' ? 'center' : (part.align ?? 'left'),
    color,
  };
}

/** Texto exibido numa peça: `main` = texto do elemento; outro campo = `fields[slot]`; sem campo = texto fixo. */
export function partText(el: Pick<CompositeElement, 'text' | 'fields'>, part: Extract<DeclPart, { kind: 'text' | 'badge' }>): string {
  if (part.slot === 'main') return el.text ?? '';
  if (part.slot) return el.fields?.[part.slot] ?? part.text ?? '';
  return part.text ?? '';
}

/** Peças → primitivas em pixels (origem no canto do elemento). Elemento inválido → lista vazia. */
export function layoutComposite(el: CompositeElement): CompositePrimitive[] {
  if (!isValidComposite(el)) return [];
  const W = el.width;
  const H = el.height;
  return el.parts.map((p): CompositePrimitive => {
    const x = p.x * W;
    const y = p.y * H;
    const w = p.w * W;
    const h = p.h * H;
    switch (p.kind) {
      case 'rect':
        return { kind: 'rect', x, y, w, h, radius: p.radius ?? 0, fill: paint(p.fill), stroke: paint(p.stroke), strokeWidth: p.strokeWidth ?? (p.stroke ? 1 : 0), dashed: !!p.dashed };
      case 'ellipse':
        return { kind: 'ellipse', x, y, w, h, fill: paint(p.fill), stroke: paint(p.stroke), strokeWidth: p.strokeWidth ?? (p.stroke ? 1 : 0), dashed: !!p.dashed };
      case 'path':
        return { kind: 'path', x, y, w, h, d: scaleNormalizedPath(p.d, 100, 100, w, h), fill: paint(p.fill), stroke: paint(p.stroke), strokeWidth: p.strokeWidth ?? (p.stroke ? 1 : 0) };
      case 'text':
        return { kind: 'text', x, y, w, h, text: partText(el, p), fontSize: p.fontSize, style: textStyle(p, p.color ?? COMPOSITE_TEXT_COLOR), valign: p.valign ?? 'top', main: p.slot === 'main' };
      case 'badge':
        return { kind: 'text', x, y, w, h, text: partText(el, p), fontSize: p.fontSize, style: textStyle(p, p.color), valign: 'middle', main: p.slot === 'main', badge: p.fill };
    }
  });
}
