/**
 * LuDraw — Tipografia do board: catálogo de fontes, medição, quebra de linha,
 * ajuste automático de tamanho (post-its) e formatação de listas.
 * Usado igualmente pelo DOM e pelo exportador (Canvas 2D) para resultados idênticos.
 */

import type { RichTextStyle, TextualElement } from '../types/canvas';

/** Categoria do seletor de fontes (Chat 08.2 · C-2): Sem serifa · Serifa · Manuscrita · Display · Mono. */
export type FontCategory = 'sans' | 'serif' | 'hand' | 'display' | 'mono';

export interface BoardFont {
  name: string;
  css: string;
  category: FontCategory;
}

/**
 * Fontes do board (40 a partir do Chat 08.2 · C-2; antes 20). Arquivos em `src/styles/fonts.css` (Fontsource, OFL-1.1,
 * só latin + latin-ext): o navegador baixa cada família só quando um texto a usa — abrir um board não baixa as 40.
 * A ordem aqui é alfabética; o seletor agrupa por `category`.
 */
export const BOARD_FONTS: BoardFont[] = [
  { name: 'Abril Fatface', css: "'Abril Fatface', Georgia, serif", category: 'display' },
  { name: 'Architects Daughter', css: "'Architects Daughter', 'Segoe Print', cursive", category: 'hand' },
  { name: 'Arial', css: 'Arial, Helvetica, sans-serif', category: 'sans' },
  { name: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', system-ui, sans-serif", category: 'sans' },
  { name: 'Bangers', css: "'Bangers', 'Comic Sans MS', cursive", category: 'display' },
  { name: 'Bebas Neue', css: "'Bebas Neue', Impact, sans-serif", category: 'display' },
  { name: 'Bitter', css: "'Bitter', Georgia, serif", category: 'serif' },
  { name: 'Caveat', css: "'Caveat', 'Segoe Print', cursive", category: 'hand' },
  { name: 'Comfortaa', css: "'Comfortaa', 'Trebuchet MS', sans-serif", category: 'display' },
  { name: 'DM Sans', css: "'DM Sans', system-ui, sans-serif", category: 'sans' },
  { name: 'EB Garamond', css: "'EB Garamond', Garamond, Georgia, serif", category: 'serif' },
  { name: 'Figtree', css: "'Figtree', system-ui, sans-serif", category: 'sans' },
  { name: 'Fira Code', css: "'Fira Code', ui-monospace, monospace", category: 'mono' },
  { name: 'Fraunces', css: "'Fraunces', Georgia, serif", category: 'serif' },
  { name: 'Fredoka', css: "'Fredoka', 'Trebuchet MS', sans-serif", category: 'display' },
  { name: 'Georgia', css: 'Georgia, serif', category: 'serif' },
  { name: 'Graduate', css: "'Graduate', Georgia, serif", category: 'display' },
  { name: 'Gravitas One', css: "'Gravitas One', Georgia, serif", category: 'display' },
  { name: 'IBM Plex Mono', css: "'IBM Plex Mono', ui-monospace, monospace", category: 'mono' },
  { name: 'IBM Plex Sans', css: "'IBM Plex Sans', system-ui, sans-serif", category: 'sans' },
  { name: 'IBM Plex Serif', css: "'IBM Plex Serif', Georgia, serif", category: 'serif' },
  { name: 'Inter', css: "'Inter', system-ui, sans-serif", category: 'sans' },
  { name: 'JetBrains Mono', css: "'JetBrains Mono', ui-monospace, monospace", category: 'mono' },
  { name: 'Kalam', css: "'Kalam', 'Segoe Print', cursive", category: 'hand' },
  { name: 'Lexend', css: "'Lexend', system-ui, sans-serif", category: 'sans' },
  { name: 'Lora', css: "'Lora', Georgia, serif", category: 'serif' },
  { name: 'Manrope', css: "'Manrope', system-ui, sans-serif", category: 'sans' },
  { name: 'Merriweather', css: "'Merriweather', Georgia, serif", category: 'serif' },
  { name: 'Nixie One', css: "'Nixie One', Georgia, serif", category: 'display' },
  { name: 'Noto Sans', css: "'Noto Sans', system-ui, sans-serif", category: 'sans' },
  { name: 'Open Sans', css: "'Open Sans', system-ui, sans-serif", category: 'sans' },
  { name: 'Patrick Hand', css: "'Patrick Hand', 'Segoe Print', cursive", category: 'hand' },
  { name: 'Permanent Marker', css: "'Permanent Marker', 'Segoe Print', cursive", category: 'hand' },
  { name: 'PT Sans', css: "'PT Sans', system-ui, sans-serif", category: 'sans' },
  { name: 'Righteous', css: "'Righteous', 'Trebuchet MS', sans-serif", category: 'display' },
  { name: 'Roboto Slab', css: "'Roboto Slab', Georgia, serif", category: 'serif' },
  { name: 'Shadows Into Light', css: "'Shadows Into Light', 'Segoe Print', cursive", category: 'hand' },
  { name: 'Source Serif 4', css: "'Source Serif 4', Georgia, serif", category: 'serif' },
  { name: 'Space Mono', css: "'Space Mono', ui-monospace, monospace", category: 'mono' },
  { name: 'Work Sans', css: "'Work Sans', system-ui, sans-serif", category: 'sans' },
];
export const DEFAULT_FONT_NAME = 'Open Sans';

export const FONT_SIZE_PRESETS = [10, 12, 14, 18, 24, 36, 48, 64, 80, 144, 288];

const GENERIC_FONT: Record<'sans' | 'serif' | 'mono', string> = {
  sans: 'Open Sans',
  serif: 'EB Garamond',
  mono: 'IBM Plex Mono',
};

export function fontCss(name: string | undefined): string {
  const found = BOARD_FONTS.find((f) => f.name === name);
  return found ? found.css : `'${name ?? DEFAULT_FONT_NAME}', system-ui, sans-serif`;
}

/** Nome da fonte efetiva de um elemento textual. */
export function resolveFontName(el: TextualElement): string {
  if (el.fontName) return el.fontName;
  if (el.type === 'text') return GENERIC_FONT[el.fontFamily] ?? DEFAULT_FONT_NAME;
  return DEFAULT_FONT_NAME;
}

export interface ResolvedTextStyle {
  fontName: string;
  fontFamilyCss: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  strikethrough: boolean;
  listStyle: 'none' | 'bullet' | 'numbered';
  indent: number;
  link: string | null;
  highlightColor: string | null;
  textAlign: 'left' | 'center' | 'right';
  color: string;
}

export function resolveTextStyle(el: TextualElement & RichTextStyle, color: string): ResolvedTextStyle {
  const fontName = resolveFontName(el);
  return {
    fontName,
    fontFamilyCss: fontCss(fontName),
    fontWeight: el.fontWeight ?? 'normal',
    fontStyle: el.fontStyle ?? 'normal',
    underline: !!el.underline,
    strikethrough: !!el.strikethrough,
    listStyle: el.listStyle ?? 'none',
    indent: Math.max(0, Math.min(4, el.indent ?? 0)),
    link: el.link ?? null,
    highlightColor: el.highlightColor ?? null,
    textAlign: el.textAlign ?? 'center',
    color,
  };
}

export function canvasFont(size: number, style: Pick<ResolvedTextStyle, 'fontFamilyCss' | 'fontWeight' | 'fontStyle'>): string {
  return `${style.fontStyle === 'italic' ? 'italic ' : ''}${style.fontWeight === 'bold' ? '700 ' : '400 '}${size}px ${style.fontFamilyCss}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

export function measureTextWidth(text: string, font: string): number {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Aplica marcadores de lista e recuo às linhas lógicas do texto. */
export function formatListLines(text: string, listStyle: ResolvedTextStyle['listStyle'], indent: number): string[] {
  const lines = text.split('\n');
  const pad = ' '.repeat(indent);
  if (listStyle === 'none') return indent > 0 ? lines.map((l) => pad + l) : lines;
  let n = 0;
  return lines.map((line) => {
    if (line.trim() === '') return line;
    n += 1;
    return `${pad}${listStyle === 'bullet' ? '•' : `${n}.`} ${line}`;
  });
}

/** Quebra o texto em linhas que caibam em `maxWidth` (respeita \n e quebra palavras longas). */
export function wrapText(text: string, maxWidth: number, font: string): string[] {
  const result: string[] = [];
  const fits = (t: string) => measureTextWidth(t, font) <= maxWidth;
  for (const para of text.split('\n')) {
    if (para === '') {
      result.push('');
      continue;
    }
    let line = '';
    for (const token of para.split(/(\s+)/)) {
      if (!token) continue;
      if (fits(line + token)) {
        line += token;
        continue;
      }
      if (line.trim()) result.push(line.trimEnd());
      line = '';
      if (/^\s+$/.test(token)) continue;
      if (fits(token)) {
        line = token;
        continue;
      }
      // Palavra maior que a linha: quebra por caracteres
      for (const ch of token) {
        if (!fits(line + ch) && line) {
          result.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}

export const LINE_HEIGHT = 1.32;

/**
 * Fonte CSS com a altura de linha embutida ("600 14px Figtree" → "600 14px/19px Figtree").
 * Use no DOM em vez de `font` + `lineHeight` separados (o React avisa ao misturar a forma
 * abreviada com a propriedade longa). Chat 04.
 */
export function fontWithLineHeight(font: string, lineHeightPx: number): string {
  return font.replace(/(\d+(?:\.\d+)?px)/, `$1/${lineHeightPx}px`);
}

const fitCache = new Map<string, number>();

/** Maior tamanho de fonte (px de mundo) que faz o texto caber na caixa — usado nos post-its "auto". */
export function fitFontSize(
  text: string,
  width: number,
  height: number,
  style: Pick<ResolvedTextStyle, 'fontFamilyCss' | 'fontWeight' | 'fontStyle'>,
  min = 6,
  max = 72,
): number {
  const content = text.trim() === '' ? 'Aa' : text;
  const key = `${content}|${Math.round(width)}|${Math.round(height)}|${style.fontFamilyCss}|${style.fontWeight}|${style.fontStyle}|${max}`;
  const cached = fitCache.get(key);
  if (cached) return cached;
  let lo = min;
  let hi = Math.max(min, Math.min(max, height));
  let best = lo;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const font = canvasFont(mid, style);
    const lines = wrapText(content, width, font);
    const widest = Math.max(...lines.map((l) => measureTextWidth(l, font)));
    const totalH = lines.length * mid * LINE_HEIGHT;
    if (totalH <= height && widest <= width + 0.5) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const result = Math.floor(best * 10) / 10;
  if (fitCache.size > 4000) fitCache.clear();
  fitCache.set(key, result);
  return result;
}

/**
 * Chat 05 — fonte do board mais próxima de uma lista CSS `font-family` vinda de outro programa
 * (SVG/HTML/`.excalidraw`): usa a primeira família que existe em `BOARD_FONTS`; senão a genérica
 * (mono → IBM Plex Mono, serif → EB Garamond, manuscrita → Caveat, demais → padrão).
 */
export function boardFontForFamily(family: string | null | undefined): string {
  if (!family) return DEFAULT_FONT_NAME;
  const names = family.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase());
  for (const n of names) {
    const hit = BOARD_FONTS.find((f) => f.name.toLowerCase() === n);
    if (hit) return hit.name;
  }
  const all = names.join(' ');
  if (/mono|courier|consolas|menlo|code/.test(all)) return 'IBM Plex Mono';
  if (/cursive|hand|comic|script|marker|virgil|excalifont/.test(all)) return 'Caveat';
  if (/(^|\s)serif|times|georgia|garamond/.test(all) && !/sans/.test(all)) return 'EB Garamond';
  return DEFAULT_FONT_NAME;
}
