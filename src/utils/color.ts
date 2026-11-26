/** LuDraw — utilitários de cor (contraste WCAG, mistura, adaptação ao tema). */

import type { ThemeMode } from '../types/workspace';

export interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): RGB | null {
  const c = input.trim().toLowerCase();
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((ch) => ch + ch).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = parseInt(hex.slice(0, 6), 16);
    if (Number.isNaN(n)) return null;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
  }
  return null;
}

export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function relativeLuminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0;
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

/** Razão de contraste WCAG 2.x entre duas cores. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: 1,
  });
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
}

export function isTransparent(color: string | null | undefined): boolean {
  if (!color) return true;
  const c = parseColor(color);
  return !c || c.a === 0;
}

export function isDarkColor(color: string): boolean {
  return relativeLuminance(color) < 0.22;
}

/** Cor de texto legível (escura ou clara) sobre um fundo. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, '#18211c') >= contrastRatio(background, '#f7f9f4') ? '#18211c' : '#f7f9f4';
}

/**
 * "Tinta adaptativa": textos/bordas quase pretos ficam claros no Dark Mode quando estão
 * diretamente sobre o canvas (texto solto, contornos de formas sem preenchimento).
 */
export function adaptInk(color: string, theme: ThemeMode): string {
  if (theme === 'light') return color;
  const lum = relativeLuminance(color);
  if (lum < 0.03) return '#eceee9';
  // Cores escuras (ex.: verde-floresta da marca) ficam ilegíveis no canvas escuro:
  // clareamos mantendo o matiz até atingir contraste confortável.
  if (contrastRatio(color, '#16161a') < 3.2) return mix(color, '#f4f9ec', 0.68);
  return color;
}

/** Cores padrão do canvas por tema (CLAUDE.md §3.2). */
export const CANVAS_COLORS = {
  light: { background: '#F5F6F8', dot: '#D1D5DB', dotMajor: '#B9BFC8' },
  dark: { background: '#16161A', dot: '#2E2E38', dotMajor: '#3C3C48' },
} as const;

/** Deriva as cores da grade a partir de uma cor de fundo personalizada. */
export function gridColorsFor(background: string): { dot: string; dotMajor: string } {
  const dark = relativeLuminance(background) < 0.4;
  return dark
    ? { dot: mix(background, '#ffffff', 0.12), dotMajor: mix(background, '#ffffff', 0.2) }
    : { dot: mix(background, '#000000', 0.14), dotMajor: mix(background, '#000000', 0.24) };
}

/** Gera uma cor estável (paleta verde/terrosa da marca) a partir de um texto. */
export function colorFromString(input: string): string {
  const palette = ['#194B32', '#3A8156', '#5FA067', '#2C64A8', '#A66A12', '#8C4A7A', '#C2412D', '#2A6646'];
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
