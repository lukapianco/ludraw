/**
 * LuDraw — Contexto de desenho que GRAVA SVG (Chat 05).
 *
 * Implementa o subconjunto da API Canvas 2D usado pelos desenhos de exportação
 * (`utils/export.ts`, `drawKanbanToCanvas`, `drawTableToCanvas`, `drawMindMapToCanvas`) e
 * transforma cada operação em elementos SVG vetoriais (`<path>`, `<text>`, `<image>`, `<clipPath>`).
 * Assim o SVG exportado sai do MESMO código e da MESMA geometria do PNG/PDF e da tela — nada é
 * recalculado. Escrito do zero a partir das especificações públicas do Canvas 2D (WHATWG) e do
 * SVG 1.1 (W3C). Sombras não são reproduzidas (o SVG fica mais leve e editável).
 */

import { applyToPoint, IDENTITY, meanScale, multiply, rotateMatrix, scaleMatrix, translateMatrix, type Matrix } from './svgPath';
import { svgSourceOf } from './path2d';

interface DrawState {
  matrix: Matrix;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  dash: number[];
  clipId: string | null;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Remove caracteres de controle que tornariam o XML inválido. */
function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/** Cor CSS → cor + opacidade separadas (melhor compatibilidade com editores de vetor). */
export function splitPaint(color: string): { color: string; opacity: number } | null {
  const c = (color ?? '').trim();
  if (!c || c === 'transparent' || c === 'none') return null;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(c);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (a <= 0) return null;
    const hex = [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')).join('');
    return { color: `#${hex}`, opacity: a };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(c);
  if (m) {
    const a = parseInt(m[2], 16) / 255;
    return a <= 0 ? null : { color: `#${m[1]}`, opacity: a };
  }
  return { color: c, opacity: 1 };
}

interface ParsedFont {
  style: string;
  weight: string;
  size: number;
  family: string;
}

export function parseCanvasFont(font: string): ParsedFont {
  const m = /^\s*((?:(?:italic|oblique|normal|small-caps|bold|bolder|lighter|\d{3})\s+)*)([\d.]+)px(?:\/[\d.]+(?:px)?)?\s+(.+)$/i.exec(font);
  if (!m) return { style: 'normal', weight: 'normal', size: 16, family: 'sans-serif' };
  const words = m[1].trim().split(/\s+/).filter(Boolean);
  const style = words.find((w) => /^(italic|oblique)$/i.test(w)) ?? 'normal';
  const weight = words.find((w) => /^(bold|bolder|lighter|\d{3})$/i.test(w)) ?? 'normal';
  return { style, weight, size: Number(m[2]), family: m[3].trim() };
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  return measureCtx;
}

const baselineCache = new Map<string, number>();
const BASELINE_FALLBACK: Record<string, number> = { alphabetic: 0, middle: 0.35, top: 0.8, hanging: 0.72, bottom: -0.22, ideographic: -0.18 };

/** Distância (px) do `textBaseline` pedido até a linha de base alfabética (positivo = mais abaixo). */
function baselineOffset(font: string, baseline: CanvasTextBaseline, size: number): number {
  if (baseline === 'alphabetic') return 0;
  const key = `${font}|${baseline}`;
  const hit = baselineCache.get(key);
  if (hit !== undefined) return hit;
  let value = (BASELINE_FALLBACK[baseline] ?? 0) * size;
  const ctx = measurer();
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    const a = ctx.measureText('Hg');
    ctx.textBaseline = baseline;
    const b = ctx.measureText('Hg');
    if (Number.isFinite(a.fontBoundingBoxAscent) && Number.isFinite(b.fontBoundingBoxAscent)) value = a.fontBoundingBoxAscent - b.fontBoundingBoxAscent;
  }
  baselineCache.set(key, value);
  return value;
}

/** Contexto gravador: use como `CanvasRenderingContext2D` nos desenhos e leia `toSvg()` no fim. */
export class SvgRecorderContext {
  private state: DrawState = {
    matrix: IDENTITY,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    dash: [],
    clipId: null,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  private stack: DrawState[] = [];
  private path: string[] = [];
  /** Ponto atual no espaço do usuário (as curvas de `arcTo` precisam dele) */
  private cur: [number, number] | null = null;
  private start: [number, number] | null = null;
  private readonly body: string[] = [];
  private readonly defs: string[] = [];
  private clipSeq = 0;

  constructor(readonly width: number, readonly height: number) {}

  /* ------------------------------ estado ------------------------------ */
  get fillStyle(): string {
    return this.state.fillStyle;
  }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) {
    if (typeof v === 'string') this.state.fillStyle = v;
  }
  get strokeStyle(): string {
    return this.state.strokeStyle;
  }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) {
    if (typeof v === 'string') this.state.strokeStyle = v;
  }
  get lineWidth(): number {
    return this.state.lineWidth;
  }
  set lineWidth(v: number) {
    if (v > 0 && Number.isFinite(v)) this.state.lineWidth = v;
  }
  get lineCap(): CanvasLineCap {
    return this.state.lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.state.lineCap = v;
  }
  get lineJoin(): CanvasLineJoin {
    return this.state.lineJoin;
  }
  set lineJoin(v: CanvasLineJoin) {
    this.state.lineJoin = v;
  }
  get globalAlpha(): number {
    return this.state.globalAlpha;
  }
  set globalAlpha(v: number) {
    if (v >= 0 && v <= 1) this.state.globalAlpha = v;
  }
  get font(): string {
    return this.state.font;
  }
  set font(v: string) {
    this.state.font = v;
  }
  get textAlign(): CanvasTextAlign {
    return this.state.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.state.textAlign = v;
  }
  get textBaseline(): CanvasTextBaseline {
    return this.state.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.state.textBaseline = v;
  }
  get shadowColor(): string {
    return this.state.shadowColor;
  }
  set shadowColor(v: string) {
    this.state.shadowColor = v;
  }
  get shadowBlur(): number {
    return this.state.shadowBlur;
  }
  set shadowBlur(v: number) {
    this.state.shadowBlur = v;
  }
  get shadowOffsetX(): number {
    return this.state.shadowOffsetX;
  }
  set shadowOffsetX(v: number) {
    this.state.shadowOffsetX = v;
  }
  get shadowOffsetY(): number {
    return this.state.shadowOffsetY;
  }
  set shadowOffsetY(v: number) {
    this.state.shadowOffsetY = v;
  }

  save(): void {
    this.stack.push({ ...this.state, dash: this.state.dash.slice() });
  }
  restore(): void {
    const s = this.stack.pop();
    if (s) this.state = s;
  }
  setLineDash(segments: number[]): void {
    this.state.dash = segments.filter((n) => Number.isFinite(n) && n >= 0);
  }
  getLineDash(): number[] {
    return this.state.dash.slice();
  }

  /* --------------------------- transformações --------------------------- */
  translate(x: number, y: number): void {
    this.state.matrix = multiply(this.state.matrix, translateMatrix(x, y));
  }
  scale(x: number, y: number): void {
    this.state.matrix = multiply(this.state.matrix, scaleMatrix(x, y));
  }
  rotate(rad: number): void {
    this.state.matrix = multiply(this.state.matrix, rotateMatrix((rad * 180) / Math.PI));
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.matrix = multiply(this.state.matrix, { a, b, c, d, e, f });
  }
  setTransform(a: number | DOMMatrix2DInit = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    if (typeof a === 'object') this.state.matrix = { a: a.a ?? 1, b: a.b ?? 0, c: a.c ?? 0, d: a.d ?? 1, e: a.e ?? 0, f: a.f ?? 0 };
    else this.state.matrix = { a, b, c, d, e, f };
  }
  resetTransform(): void {
    this.state.matrix = IDENTITY;
  }

  /* -------------------------------- path -------------------------------- */
  private dev(x: number, y: number): string {
    const [px, py] = applyToPoint(this.state.matrix, x, y);
    return `${r2(px)} ${r2(py)}`;
  }
  private get sweepFlip(): boolean {
    const m = this.state.matrix;
    return m.a * m.d - m.b * m.c < 0;
  }

  beginPath(): void {
    this.path = [];
    this.cur = null;
    this.start = null;
  }
  moveTo(x: number, y: number): void {
    this.path.push(`M ${this.dev(x, y)}`);
    this.cur = [x, y];
    this.start = [x, y];
  }
  lineTo(x: number, y: number): void {
    if (!this.cur) return this.moveTo(x, y);
    this.path.push(`L ${this.dev(x, y)}`);
    this.cur = [x, y];
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(cx, cy);
    this.path.push(`Q ${this.dev(cx, cy)} ${this.dev(x, y)}`);
    this.cur = [x, y];
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(c1x, c1y);
    this.path.push(`C ${this.dev(c1x, c1y)} ${this.dev(c2x, c2y)} ${this.dev(x, y)}`);
    this.cur = [x, y];
  }
  closePath(): void {
    if (!this.path.length) return;
    this.path.push('Z');
    if (this.start) this.cur = [this.start[0], this.start[1]];
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0): void {
    const r = Math.max(0, Math.min(Array.isArray(radii) ? radii[0] ?? 0 : radii, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    if (!this.cur) {
      this.moveTo(x1, y1);
      return;
    }
    const [x0, y0] = this.cur;
    const ux = x0 - x1;
    const uy = y0 - y1;
    const vx = x2 - x1;
    const vy = y2 - y1;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    const cross = ux * vy - uy * vx;
    if (radius <= 0 || lu < 1e-9 || lv < 1e-9 || Math.abs(cross) < 1e-9 * lu * lv) {
      this.lineTo(x1, y1);
      return;
    }
    const cos = (ux * vx + uy * vy) / (lu * lv);
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    const dist = radius / Math.tan(angle / 2);
    const t1: [number, number] = [x1 + (ux / lu) * dist, y1 + (uy / lu) * dist];
    const t2: [number, number] = [x1 + (vx / lv) * dist, y1 + (vy / lv) * dist];
    this.lineTo(t1[0], t1[1]);
    const rr = r2(radius * meanScale(this.state.matrix));
    let sweep = cross < 0 ? 1 : 0;
    if (this.sweepFlip) sweep = 1 - sweep;
    this.path.push(`A ${rr} ${rr} 0 0 ${sweep} ${this.dev(t2[0], t2[1])}`);
    this.cur = t2;
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(cx, cy, r, r, 0, a0, a1, ccw);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    const TAU = Math.PI * 2;
    let delta = a1 - a0;
    if (!ccw) {
      if (delta >= TAU) delta = TAU;
      else if (delta < 0) delta = (delta % TAU) + TAU;
    } else if (delta <= -TAU) delta = -TAU;
    else if (delta > 0) delta = (delta % TAU) - TAU;
    const pt = (a: number): [number, number] => {
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      return [cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)];
    };
    const p0 = pt(a0);
    if (this.cur) this.lineTo(p0[0], p0[1]);
    else this.moveTo(p0[0], p0[1]);
    const s = meanScale(this.state.matrix);
    const m = this.state.matrix;
    const rotDeg = r2(((rot + Math.atan2(m.b, m.a)) * 180) / Math.PI);
    let sweep = delta > 0 ? 1 : 0;
    if (this.sweepFlip) sweep = 1 - sweep;
    // até 2 arcos de no máximo 180° (um arco SVG não fecha um círculo inteiro)
    const parts = Math.abs(delta) > Math.PI ? 2 : 1;
    for (let i = 1; i <= parts; i++) {
      const a = a0 + (delta * i) / parts;
      const p = pt(a);
      this.path.push(`A ${r2(rx * s)} ${r2(ry * s)} ${rotDeg} 0 ${sweep} ${this.dev(p[0], p[1])}`);
      this.cur = p;
    }
  }

  /* ------------------------------ emissão ------------------------------ */
  private wrap(el: string): void {
    this.body.push(this.state.clipId ? `<g clip-path="url(#${this.state.clipId})">${el}</g>` : el);
  }
  private matrixAttr(): string {
    const m = this.state.matrix;
    if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0) return '';
    return ` transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.round(v * 10000) / 10000).join(' ')})"`;
  }
  private alphaAttr(): string {
    return this.state.globalAlpha < 1 ? ` opacity="${r2(this.state.globalAlpha)}"` : '';
  }
  private fillAttrs(): string | null {
    const p = splitPaint(this.state.fillStyle);
    if (!p) return null;
    return ` fill="${escapeXml(p.color)}"${p.opacity < 1 ? ` fill-opacity="${r2(p.opacity)}"` : ''}`;
  }
  private strokeAttrs(scale: number): string | null {
    const p = splitPaint(this.state.strokeStyle);
    if (!p) return null;
    const dash = this.state.dash.length ? ` stroke-dasharray="${this.state.dash.map((d) => r2(d * scale)).join(' ')}"` : '';
    return ` fill="none" stroke="${escapeXml(p.color)}"${p.opacity < 1 ? ` stroke-opacity="${r2(p.opacity)}"` : ''} stroke-width="${r2(this.state.lineWidth * scale)}" stroke-linecap="${this.state.lineCap}" stroke-linejoin="${this.state.lineJoin}"${dash}`;
  }

  fill(pathOrRule?: Path2D | CanvasFillRule, rule?: CanvasFillRule): void {
    const fillRule = typeof pathOrRule === 'string' ? pathOrRule : rule;
    const ruleAttr = fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
    const attrs = this.fillAttrs();
    if (!attrs) return;
    if (pathOrRule && typeof pathOrRule === 'object') {
      const d = svgSourceOf(pathOrRule);
      if (d) this.wrap(`<path d="${escapeXml(d)}"${this.matrixAttr()}${attrs}${ruleAttr}${this.alphaAttr()}/>`);
      return;
    }
    if (!this.path.length) return;
    this.wrap(`<path d="${this.path.join(' ')}"${attrs}${ruleAttr}${this.alphaAttr()}/>`);
  }
  stroke(path?: Path2D): void {
    if (path) {
      const d = svgSourceOf(path);
      const attrs = this.strokeAttrs(1);
      if (d && attrs) this.wrap(`<path d="${escapeXml(d)}"${this.matrixAttr()}${attrs}${this.alphaAttr()}/>`);
      return;
    }
    const attrs = this.strokeAttrs(meanScale(this.state.matrix));
    if (!attrs || !this.path.length) return;
    this.wrap(`<path d="${this.path.join(' ')}"${attrs}${this.alphaAttr()}/>`);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const saved = this.path;
    const cur = this.cur;
    const start = this.start;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.path = saved;
    this.cur = cur;
    this.start = start;
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    const saved = this.path;
    const cur = this.cur;
    const start = this.start;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.path = saved;
    this.cur = cur;
    this.start = start;
  }
  clearRect(): void {
    /* o SVG começa transparente: nada a apagar */
  }
  clip(path?: Path2D | CanvasFillRule): void {
    const id = `od-clip-${++this.clipSeq}`;
    const parent = this.state.clipId ? ` clip-path="url(#${this.state.clipId})"` : '';
    let shape = '';
    if (path && typeof path === 'object') {
      const d = svgSourceOf(path);
      if (!d) return;
      shape = `<path d="${escapeXml(d)}"${this.matrixAttr()}/>`;
    } else {
      if (!this.path.length) return;
      shape = `<path d="${this.path.join(' ')}"/>`;
    }
    this.defs.push(`<clipPath id="${id}"${parent}>${shape}</clipPath>`);
    this.state.clipId = id;
  }

  fillText(text: string, x: number, y: number): void {
    const p = splitPaint(this.state.fillStyle);
    const clean = cleanText(text);
    if (!p || !clean) return;
    const f = parseCanvasFont(this.state.font);
    const dy = baselineOffset(this.state.font, this.state.textBaseline, f.size);
    const anchor = this.state.textAlign === 'center' ? 'middle' : this.state.textAlign === 'right' || this.state.textAlign === 'end' ? 'end' : 'start';
    const attrs = [
      `x="${r2(x)}"`,
      `y="${r2(y + dy)}"`,
      `font-family="${escapeXml(f.family)}"`,
      `font-size="${r2(f.size)}"`,
      f.weight !== 'normal' ? `font-weight="${f.weight}"` : '',
      f.style !== 'normal' ? `font-style="${f.style}"` : '',
      anchor !== 'start' ? `text-anchor="${anchor}"` : '',
      `fill="${escapeXml(p.color)}"`,
      p.opacity < 1 ? `fill-opacity="${r2(p.opacity)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    this.wrap(`<text ${attrs}${this.matrixAttr()}${this.alphaAttr()} xml:space="preserve">${escapeXml(clean)}</text>`);
  }
  strokeText(): void {
    /* não usado pelos desenhos de exportação */
  }
  measureText(text: string): TextMetrics {
    const ctx = measurer();
    if (ctx) {
      ctx.font = this.state.font;
      return ctx.measureText(text);
    }
    return { width: text.length * parseCanvasFont(this.state.font).size * 0.55 } as TextMetrics;
  }
  drawImage(image: CanvasImageSource, x: number, y: number, w?: number, h?: number): void {
    const src = (image as HTMLImageElement).src;
    if (!src) return;
    const width = w ?? (image as HTMLImageElement).naturalWidth ?? 0;
    const height = h ?? (image as HTMLImageElement).naturalHeight ?? 0;
    const href = escapeXml(src);
    this.wrap(`<image x="${r2(x)}" y="${r2(y)}" width="${r2(width)}" height="${r2(height)}" href="${href}" xlink:href="${href}" preserveAspectRatio="none"${this.matrixAttr()}${this.alphaAttr()}/>`);
  }

  /** Retângulo de fundo (cor do board). */
  background(color: string | null): void {
    const p = color ? splitPaint(color) : null;
    if (p) this.body.unshift(`<rect x="0" y="0" width="${r2(this.width)}" height="${r2(this.height)}" fill="${escapeXml(p.color)}"${p.opacity < 1 ? ` fill-opacity="${r2(p.opacity)}"` : ''}/>`);
  }

  /** Documento SVG final. */
  toSvg(title?: string): string {
    const w = r2(this.width);
    const h = r2(this.height);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
      title ? `<title>${escapeXml(cleanText(title))}</title>` : '',
      '<desc>Exportado do LuDraw</desc>',
      this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '',
      ...this.body,
      '</svg>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** O próprio objeto, tipado como contexto de canvas, para os desenhos existentes. */
  asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}
