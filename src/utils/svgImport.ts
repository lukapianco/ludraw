/**
 * LuDraw — Conversor de SVG vetorial editável (Chat 05).
 *
 * Lê SVG de QUALQUER origem (padrão aberto W3C) e transforma cada desenho em objetos nativos,
 * independentes e editáveis:
 * - `<rect>` → forma Retângulo (cantos arredondados viram contorno livre exato);
 * - `<circle>`/`<ellipse>` → forma Oval;
 * - `<polygon>`, `<path>` (e `<polyline>` preenchida) → forma com contorno livre (`customPath`);
 * - `<line>`, `<polyline>` e paths abertos só de retas, sem preenchimento → Conectores
 *   (marcadores de ponta viram setas);
 * - `<text>` (+ `<tspan>`) e `<foreignObject>` → Textos; `<image>` com `data:` → Imagem.
 * Grupos de primeiro nível (`<g>`) viram grupos do board. Transformações, `viewBox`, `<use>`,
 * estilos (atributos, `style` e regras simples do `<style>`) e gradientes (1ª cor) são aplicados.
 *
 * Segurança: o SVG é lido com `DOMParser` (documento inerte: nada é executado nem baixado);
 * DOCTYPE/ENTITY é recusado; imagens externas (http) não são baixadas.
 */

import type { CanvasElement, ConnectorElement, ShapeElement } from '../types/canvas';
import { createConnector } from './connectors';
import { createImage, createShape, createText } from './factory';
import { createId } from './id';
import { normalizeCssColor, visibleText } from './sheets';
import {
  applyToPoint,
  asStraightLine,
  decompose,
  IDENTITY,
  meanScale,
  multiply,
  parseNumbers,
  parsePathData,
  parseTransform,
  pathBounds,
  polylinePoints,
  scaleMatrix,
  serializePath,
  transformPath,
  translateMatrix,
  type Matrix,
  type PathSeg,
} from './svgPath';
import { boardFontForFamily, LINE_HEIGHT, measureTextWidth } from './text';
import { t } from '../i18n';
import { formatCount, formatList } from '../i18n/format';

export interface SvgImportResult {
  elements: CanvasElement[];
  counts: { shapes: number; connectors: number; texts: number; images: number; groups: number };
  warnings: string[];
}

export const SVG_IMPORT_LIMIT = 4000;

const XLINK = 'http://www.w3.org/1999/xlink';
const SKIP = new Set(['defs', 'clippath', 'mask', 'marker', 'pattern', 'lineargradient', 'radialgradient', 'style', 'script', 'title', 'desc', 'metadata', 'symbol', 'filter', 'font', 'font-face', 'cursor', 'view']);

interface Style {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  dash: string | null;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textAnchor: string;
  color: string;
  markerStart: string | null;
  markerEnd: string | null;
}

const ROOT_STYLE: Style = {
  fill: 'black',
  fillOpacity: 1,
  stroke: 'none',
  strokeOpacity: 1,
  strokeWidth: 1,
  dash: null,
  fontSize: 16,
  fontFamily: 'sans-serif',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAnchor: 'start',
  color: 'black',
  markerStart: null,
  markerEnd: null,
};

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'color', 'display', 'visibility', 'opacity', 'marker-start', 'marker-end', 'marker'];

interface CssRule {
  tag?: string;
  id?: string;
  classes: string[];
  specificity: number;
  order: number;
  decls: Record<string, string>;
}

function parseDeclarations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).replace(/!important/i, '').trim();
    if (PROPS.includes(k) && v) out[k] = v;
  }
  return out;
}

function readCss(doc: Document): CssRule[] {
  const rules: CssRule[] = [];
  let order = 0;
  const styles = doc.getElementsByTagName('style');
  for (let i = 0; i < styles.length; i++) {
    const css = (styles[i].textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}@]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decls = parseDeclarations(m[2]);
      if (!Object.keys(decls).length) continue;
      for (const raw of m[1].split(',')) {
        const sel = raw.trim();
        const sm = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)(#[\w-]+)?((?:\.[\w-]+)*)$/.exec(sel);
        if (!sm || !sel) continue;
        const classes = `${sm[2]}${sm[4]}`.split('.').filter(Boolean);
        const id = sm[3]?.slice(1);
        rules.push({ tag: sm[1]?.toLowerCase(), id, classes, specificity: (id ? 100 : 0) + classes.length * 10 + (sm[1] ? 1 : 0), order: order++, decls });
      }
    }
  }
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

function parseLength(v: string | null | undefined, fontSize = 16, ref = 100): number | null {
  if (v === null || v === undefined) return null;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|rem|ex|%)?\s*$/i.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'pt':
      return n * (4 / 3);
    case 'pc':
      return n * 16;
    case 'mm':
      return n * 3.7795;
    case 'cm':
      return n * 37.795;
    case 'in':
      return n * 96;
    case 'em':
    case 'rem':
      return n * fontSize;
    case 'ex':
      return n * fontSize * 0.5;
    case '%':
      return (n / 100) * ref;
    default:
      return n;
  }
}

let colorCtx: CanvasRenderingContext2D | null | undefined;
/** Cor CSS → `#RRGGBB` (usa o próprio navegador para nomes e `hsl()`; fallback simples). */
function cssColor(value: string): string | undefined {
  const basic = normalizeCssColor(value);
  if (basic) return basic;
  if (colorCtx === undefined) colorCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!colorCtx) return undefined;
  colorCtx.fillStyle = '#010203';
  colorCtx.fillStyle = value;
  const out = String(colorCtx.fillStyle);
  if (out === '#010203') return undefined;
  return normalizeCssColor(out);
}

interface Ctx {
  doc: Document;
  rules: CssRule[];
  gradients: Map<string, string>;
  out: CanvasElement[];
  counts: SvgImportResult['counts'];
  warnings: Set<string>;
  useDepth: number;
}

function matches(rule: CssRule, el: Element): boolean {
  if (rule.tag && rule.tag !== el.localName.toLowerCase()) return false;
  if (rule.id && el.getAttribute('id') !== rule.id) return false;
  if (rule.classes.length) {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/);
    if (!rule.classes.every((c) => cls.includes(c))) return false;
  }
  return true;
}

/** Propriedades declaradas no elemento: atributo < regras CSS < `style`. */
function declared(el: Element, ctx: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PROPS) {
    const v = el.getAttribute(p);
    if (v !== null && v.trim()) out[p] = v.trim();
  }
  for (const r of ctx.rules) if (matches(r, el)) Object.assign(out, r.decls);
  Object.assign(out, parseDeclarations(el.getAttribute('style') ?? ''));
  return out;
}

function inherit(parent: Style, d: Record<string, string>): Style {
  const s = { ...parent };
  const val = (k: string) => (d[k] && d[k] !== 'inherit' ? d[k] : undefined);
  if (val('color')) s.color = val('color')!;
  if (val('fill')) s.fill = val('fill')!;
  if (val('stroke')) s.stroke = val('stroke')!;
  if (val('fill-opacity')) s.fillOpacity = Math.max(0, Math.min(1, Number(val('fill-opacity')) || 0));
  if (val('stroke-opacity')) s.strokeOpacity = Math.max(0, Math.min(1, Number(val('stroke-opacity')) || 0));
  if (val('font-size')) s.fontSize = parseLength(val('font-size'), parent.fontSize, parent.fontSize) ?? parent.fontSize;
  if (val('stroke-width')) s.strokeWidth = parseLength(val('stroke-width'), s.fontSize) ?? parent.strokeWidth;
  if (val('stroke-dasharray')) s.dash = val('stroke-dasharray') === 'none' ? null : val('stroke-dasharray')!;
  if (val('font-family')) s.fontFamily = val('font-family')!;
  if (val('font-weight')) s.fontWeight = val('font-weight')!;
  if (val('font-style')) s.fontStyle = val('font-style')!;
  if (val('text-anchor')) s.textAnchor = val('text-anchor')!;
  if (val('marker')) s.markerStart = s.markerEnd = val('marker') === 'none' ? null : val('marker')!;
  if (val('marker-start')) s.markerStart = val('marker-start') === 'none' ? null : val('marker-start')!;
  if (val('marker-end')) s.markerEnd = val('marker-end') === 'none' ? null : val('marker-end')!;
  return s;
}

function paint(value: string, style: Style, ctx: Ctx): string | null {
  const v = value.trim();
  if (!v || v === 'none' || v === 'transparent') return null;
  if (v === 'currentColor' || v === 'currentcolor') return cssColor(style.color) ?? '#000000';
  const url = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)\s*(.*)$/.exec(v);
  if (url) {
    const g = ctx.gradients.get(url[1]);
    if (g) {
      ctx.warnings.add(t('importexport.svgImport.gradientsSolid'));
      return g;
    }
    return url[2] ? paint(url[2], style, ctx) : '#9AA39C';
  }
  return cssColor(v) ?? null;
}

function readGradients(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  const all = [...Array.from(doc.getElementsByTagName('linearGradient')), ...Array.from(doc.getElementsByTagName('radialGradient'))];
  const byId = new Map(all.map((g) => [g.getAttribute('id') ?? '', g]));
  const firstStop = (g: Element, depth = 0): string | undefined => {
    const stop = g.getElementsByTagName('stop')[0];
    if (stop) {
      const d = parseDeclarations(stop.getAttribute('style') ?? '');
      const c = stop.getAttribute('stop-color') ?? d['stop-color'] ?? /stop-color\s*:\s*([^;]+)/.exec(stop.getAttribute('style') ?? '')?.[1];
      return c ? cssColor(c) : '#000000';
    }
    const href = (g.getAttribute('href') ?? g.getAttributeNS(XLINK, 'href') ?? '').replace(/^#/, '');
    const ref = href ? byId.get(href) : undefined;
    return ref && depth < 4 ? firstStop(ref, depth + 1) : undefined;
  };
  for (const [id, g] of byId) {
    const c = id ? firstStop(g) : undefined;
    if (c) map.set(id, c);
  }
  return map;
}

function strokeStyleOf(dash: string | null, width: number): ShapeElement['strokeStyle'] {
  if (!dash) return 'solid';
  const n = parseNumbers(dash);
  if (!n.length || n.every((v) => v === 0)) return 'solid';
  return n[0] <= width * 1.5 ? 'dotted' : 'dashed';
}

function arrowFromMarker(marker: string | null): ConnectorElement['endArrow'] {
  return marker ? 'filled_arrow' : 'none';
}

/* ------------------------------- emissão ------------------------------- */

function pushShapeFromPath(segs: PathSeg[], style: Style, opacity: number, group: string | null, ctx: Ctx, m: Matrix): void {
  const b = pathBounds(segs);
  if (!b || (b.width < 0.5 && b.height < 0.5)) return;
  const fill = paint(style.fill, style, ctx);
  const stroke = paint(style.stroke, style, ctx);
  if (!fill && !stroke) return;
  const w = Math.max(1, b.width);
  const h = Math.max(1, b.height);
  const local = transformPath(segs, translateMatrix(-b.x, -b.y));
  const sw = stroke ? Math.max(0.5, style.strokeWidth * meanScale(m)) : 0;
  ctx.out.push(
    createShape('rectangle', {
      x: b.x,
      y: b.y,
      width: w,
      height: h,
      customPath: serializePath(local),
      customPathBox: { width: w, height: h },
      fillColor: fill ?? 'transparent',
      fillOpacity: fill && style.fillOpacity < 1 ? style.fillOpacity : undefined,
      strokeColor: stroke ?? 'transparent',
      strokeWidth: sw,
      strokeStyle: strokeStyleOf(style.dash, style.strokeWidth),
      opacity: opacity < 1 ? opacity : 1,
      groupId: group,
    }),
  );
  ctx.counts.shapes++;
}

function pushNativeShape(kind: 'rectangle' | 'circle', local: { x: number; y: number; width: number; height: number }, style: Style, opacity: number, group: string | null, ctx: Ctx, m: Matrix): void {
  const dec = decompose(m);
  if (dec.skewed || dec.sy < 0) {
    // cisalhado/espelhado: vira contorno livre exato
    const { x, y, width: w, height: h } = local;
    const segs: PathSeg[] =
      kind === 'rectangle'
        ? [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + w, y] }, { c: 'L', p: [x + w, y + h] }, { c: 'L', p: [x, y + h] }, { c: 'Z' }]
        : parsePathData(`M ${x} ${y + h / 2} A ${w / 2} ${h / 2} 0 1 0 ${x + w} ${y + h / 2} A ${w / 2} ${h / 2} 0 1 0 ${x} ${y + h / 2} Z`);
    pushShapeFromPath(transformPath(segs, m), style, opacity, group, ctx, m);
    return;
  }
  const fill = paint(style.fill, style, ctx);
  const stroke = paint(style.stroke, style, ctx);
  if (!fill && !stroke) return;
  const [cx, cy] = applyToPoint(m, local.x + local.width / 2, local.y + local.height / 2);
  const w = Math.max(1, local.width * dec.sx);
  const h = Math.max(1, local.height * dec.sy);
  ctx.out.push(
    createShape(kind, {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      rotation: Math.round(dec.rotation * 100) / 100,
      fillColor: fill ?? 'transparent',
      fillOpacity: fill && style.fillOpacity < 1 ? style.fillOpacity : undefined,
      strokeColor: stroke ?? 'transparent',
      strokeWidth: stroke ? Math.max(0.5, style.strokeWidth * meanScale(m)) : 0,
      strokeStyle: strokeStyleOf(style.dash, style.strokeWidth),
      opacity: opacity < 1 ? opacity : 1,
      groupId: group,
    }),
  );
  ctx.counts.shapes++;
}

function pushConnector(points: [number, number][], style: Style, opacity: number, group: string | null, ctx: Ctx, m: Matrix): boolean {
  const stroke = paint(style.stroke, style, ctx);
  if (!stroke || points.length < 2) return false;
  const pts = points.map(([x, y]) => applyToPoint(m, x, y));
  const first = pts[0];
  const last = pts[pts.length - 1];
  const conn = createConnector(
    { elementId: null, anchor: 'center', x: first[0], y: first[1] },
    { elementId: null, anchor: 'center', x: last[0], y: last[1] },
    {
      routingType: 'straight',
      strokeColor: stroke,
      strokeWidth: Math.max(0.5, style.strokeWidth * meanScale(m)),
      strokeStyle: strokeStyleOf(style.dash, style.strokeWidth),
      startArrow: arrowFromMarker(style.markerStart),
      endArrow: arrowFromMarker(style.markerEnd),
    },
  );
  const withWaypoints = pts.length > 2 ? ({ ...conn, waypoints: pts.slice(1, -1).map(([x, y]) => ({ x, y })) } as ConnectorElement) : conn;
  ctx.out.push({ ...withWaypoints, groupId: group, opacity: opacity < 1 ? opacity : 1 } as CanvasElement);
  ctx.counts.connectors++;
  return true;
}

function textLines(el: Element): string[] {
  const lines: string[] = [];
  let cur = '';
  let started = false;
  const visit = (n: Node, top: boolean) => {
    if (n.nodeType === 3) {
      const t = n.nodeValue ?? '';
      cur += t.replace(/\s+/g, ' ');
      if (t.trim()) started = true;
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as Element;
    if (top && e.localName === 'tspan') {
      const dy = parseNumbers(e.getAttribute('dy') ?? '')[0] ?? 0;
      const breaks = e.hasAttribute('x') || e.hasAttribute('y') || Math.abs(dy) > 0.01;
      if (breaks && started) {
        lines.push(cur.trim());
        cur = '';
      }
    }
    for (let c = e.firstChild; c; c = c.nextSibling) visit(c, false);
  };
  for (let c = el.firstChild; c; c = c.nextSibling) visit(c, true);
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function pushText(lines: string[], x: number, y: number, style: Style, opacity: number, group: string | null, ctx: Ctx, m: Matrix, box?: { width: number; height: number }): void {
  const text = lines.join('\n').trim();
  if (!text) return;
  const color = paint(style.fill, style, ctx) ?? '#1C1C1E';
  const dec = decompose(m);
  const scale = meanScale(m);
  const fontSize = Math.max(4, Math.round(style.fontSize * scale * 10) / 10);
  const bold = style.fontWeight === 'bold' || style.fontWeight === 'bolder' || Number(style.fontWeight) >= 600;
  const italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
  const fontName = boardFontForFamily(style.fontFamily);
  const font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${fontSize}px ${style.fontFamily}`;
  const width = box ? box.width * dec.sx : Math.max(...lines.map((l) => measureTextWidth(l, font))) * 1.08 + 4;
  const height = box ? Math.max(box.height * dec.sy, lines.length * fontSize * LINE_HEIGHT) : lines.length * fontSize * LINE_HEIGHT;
  const align = box ? 'left' : style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left';
  // (x, y) do SVG = linha de base da 1ª linha no ponto de ancoragem; caixa do board = canto superior esquerdo
  let localLeft = x;
  if (!box && align === 'center') localLeft = x - width / scale / 2;
  if (!box && align === 'right') localLeft = x - width / scale;
  const localTop = box ? y : y - (fontSize / scale) * 0.95;
  const [cx, cy] = applyToPoint(m, localLeft + width / scale / 2, localTop + height / scale / 2);
  ctx.out.push(
    createText({
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      text,
      fontSize,
      fontName,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      textColor: color,
      textAlign: align,
      rotation: dec.skewed ? 0 : Math.round(dec.rotation * 100) / 100,
      opacity: opacity < 1 ? opacity : 1,
      groupId: group,
    }),
  );
  ctx.counts.texts++;
}

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

function len(el: Element, name: string, style: Style, ref = 100): number {
  return parseLength(el.getAttribute(name), style.fontSize, ref) ?? 0;
}

/* -------------------------------- percurso -------------------------------- */

function walk(el: Element, m: Matrix, parentStyle: Style, parentOpacity: number, group: string | null, depth: number, ctx: Ctx): void {
  if (ctx.out.length >= SVG_IMPORT_LIMIT) return;
  const tag = el.localName.toLowerCase();
  if (SKIP.has(tag)) return;
  const d = declared(el, ctx);
  if (d.display === 'none' || d.visibility === 'hidden' || d.visibility === 'collapse') return;
  const style = inherit(parentStyle, d);
  const opacity = parentOpacity * (d.opacity !== undefined ? Math.max(0, Math.min(1, Number(d.opacity) || 0)) : 1);
  if (opacity <= 0.001) return;
  const local = multiply(m, parseTransform(el.getAttribute('transform')));

  switch (tag) {
    case 'svg': {
      // svg aninhado: novo viewport
      const x = len(el, 'x', style);
      const y = len(el, 'y', style);
      const inner = multiply(local, multiply(translateMatrix(x, y), viewBoxMatrix(el, style)));
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) walk(c, inner, style, opacity, group, depth + 1, ctx);
      return;
    }
    case 'g':
    case 'a':
    case 'switch': {
      let g = group;
      if (depth <= 1 && !group && el.childElementCount >= 2) {
        g = createId();
        ctx.counts.groups++;
      }
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        walk(c, local, style, opacity, g, depth + 1, ctx);
        if (tag === 'switch') break;
      }
      return;
    }
    case 'use': {
      const href = (el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href') ?? '').trim();
      if (!href.startsWith('#') || ctx.useDepth > 6) return;
      const ref = ctx.doc.getElementById(href.slice(1));
      if (!ref || ref === el || ref.contains(el)) return;
      ctx.useDepth++;
      const t = multiply(local, translateMatrix(len(el, 'x', style), len(el, 'y', style)));
      if (ref.localName === 'symbol') {
        const inner = multiply(t, viewBoxMatrix(ref, style, len(el, 'width', style) || undefined, len(el, 'height', style) || undefined));
        for (let c = ref.firstElementChild; c; c = c.nextElementSibling) walk(c, inner, style, opacity, group, depth + 1, ctx);
      } else {
        walk(ref, t, style, opacity, group, depth + 1, ctx);
      }
      ctx.useDepth--;
      return;
    }
    case 'rect': {
      const w = len(el, 'width', style);
      const h = len(el, 'height', style);
      if (w <= 0 || h <= 0) return;
      const x = len(el, 'x', style);
      const y = len(el, 'y', style);
      let rx = parseLength(el.getAttribute('rx'), style.fontSize);
      let ry = parseLength(el.getAttribute('ry'), style.fontSize);
      if (rx === null && ry !== null) rx = ry;
      if (ry === null && rx !== null) ry = rx;
      if (rx && ry && rx > 0.5) {
        const r1 = Math.min(rx, w / 2);
        const r2 = Math.min(ry ?? rx, h / 2);
        const segs = parsePathData(`M ${x + r1} ${y} H ${x + w - r1} A ${r1} ${r2} 0 0 1 ${x + w} ${y + r2} V ${y + h - r2} A ${r1} ${r2} 0 0 1 ${x + w - r1} ${y + h} H ${x + r1} A ${r1} ${r2} 0 0 1 ${x} ${y + h - r2} V ${y + r2} A ${r1} ${r2} 0 0 1 ${x + r1} ${y} Z`);
        pushShapeFromPath(transformPath(segs, local), style, opacity, group, ctx, local);
      } else {
        pushNativeShape('rectangle', { x, y, width: w, height: h }, style, opacity, group, ctx, local);
      }
      return;
    }
    case 'circle':
    case 'ellipse': {
      const cx = len(el, 'cx', style);
      const cy = len(el, 'cy', style);
      const rx = tag === 'circle' ? len(el, 'r', style) : len(el, 'rx', style);
      const ry = tag === 'circle' ? rx : len(el, 'ry', style) || rx;
      if (rx <= 0 || ry <= 0) return;
      pushNativeShape('circle', { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }, style, opacity, group, ctx, local);
      return;
    }
    case 'line': {
      pushConnector(
        [
          [len(el, 'x1', style), len(el, 'y1', style)],
          [len(el, 'x2', style), len(el, 'y2', style)],
        ],
        style,
        opacity,
        group,
        ctx,
        local,
      );
      return;
    }
    case 'polyline':
    case 'polygon': {
      const n = parseNumbers(el.getAttribute('points') ?? '');
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      if (pts.length < 2) return;
      const filled = !!paint(style.fill, style, ctx);
      if (tag === 'polyline' && !filled) {
        pushConnector(pts, style, opacity, group, ctx, local);
        return;
      }
      const segs: PathSeg[] = pts.map((p, i) => ({ c: i === 0 ? 'M' : 'L', p }) as PathSeg);
      if (tag === 'polygon') segs.push({ c: 'Z' });
      pushShapeFromPath(transformPath(segs, local), style, opacity, group, ctx, local);
      return;
    }
    case 'path': {
      const segs = parsePathData(el.getAttribute('d') ?? '');
      if (segs.length < 2) return;
      const filled = !!paint(style.fill, style, ctx);
      const closed = segs.some((s) => s.c === 'Z');
      if (!filled && !closed) {
        const line = asStraightLine(segs);
        const poly = line ? null : polylinePoints(segs);
        if ((line && pushConnector(line, style, opacity, group, ctx, local)) || (poly && poly.length <= 24 && pushConnector(poly, style, opacity, group, ctx, local))) return;
      }
      pushShapeFromPath(transformPath(segs, local), style, opacity, group, ctx, local);
      return;
    }
    case 'text': {
      const x = parseNumbers(el.getAttribute('x') ?? '')[0] ?? 0;
      const y = (parseNumbers(el.getAttribute('y') ?? '')[0] ?? 0) + (parseNumbers(el.getAttribute('dy') ?? '')[0] ?? 0);
      pushText(textLines(el), x, y, style, opacity, group, ctx, local);
      return;
    }
    case 'foreignobject': {
      const w = len(el, 'width', style);
      const h = len(el, 'height', style);
      const text = visibleText(el);
      if (!text || w <= 0) return;
      pushText(text.split('\n'), len(el, 'x', style), len(el, 'y', style), style, opacity, group, ctx, local, { width: w, height: h });
      return;
    }
    case 'image': {
      const href = (el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href') ?? '').trim();
      const w = len(el, 'width', style);
      const h = len(el, 'height', style);
      if (!DATA_IMAGE.test(href)) {
        if (href) ctx.warnings.add(t('importexport.svgImport.externalImagesSkipped'));
        return;
      }
      if (w <= 0 || h <= 0) return;
      const dec = decompose(local);
      const [cx, cy] = applyToPoint(local, len(el, 'x', style) + w / 2, len(el, 'y', style) + h / 2);
      const W = w * Math.abs(dec.sx);
      const H = h * Math.abs(dec.sy);
      ctx.out.push(createImage({ x: cx - W / 2, y: cy - H / 2, width: W, height: H, dataUrl: href, naturalWidth: Math.round(w), naturalHeight: Math.round(h), rotation: dec.skewed ? 0 : Math.round(dec.rotation * 100) / 100, groupId: group, opacity: opacity < 1 ? opacity : 1 }));
      ctx.counts.images++;
      return;
    }
    default:
      // elementos desconhecidos: tenta os filhos (ex.: <a> de outro namespace)
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) walk(c, local, style, opacity, group, depth + 1, ctx);
  }
}

function viewBoxMatrix(el: Element, style: Style, forcedW?: number, forcedH?: number): Matrix {
  const vb = parseNumbers(el.getAttribute('viewBox') ?? '');
  if (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0) return IDENTITY;
  const W = forcedW ?? parseLength(el.getAttribute('width'), style.fontSize, vb[2]) ?? vb[2];
  const H = forcedH ?? parseLength(el.getAttribute('height'), style.fontSize, vb[3]) ?? vb[3];
  const par = (el.getAttribute('preserveAspectRatio') ?? '').trim();
  let sx = W / vb[2];
  let sy = H / vb[3];
  if (!par.startsWith('none')) sx = sy = Math.min(sx, sy);
  return multiply(scaleMatrix(sx, sy), translateMatrix(-vb[0], -vb[1]));
}

/** Lê o texto de um SVG. Lança erro com mensagem pt-BR quando não é SVG válido. */
export function parseSvgDocument(markup: string): Document {
  if (/<!ENTITY/i.test(markup)) throw new Error(t('importexport.svgImport.theSvgDeclaresEntitiesDoctype'));
  const clean = markup.replace(/<!DOCTYPE[^>]*>/gi, '');
  let doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'svg') {
    // SVG colado de páginas web pode vir "como HTML" (sem namespace, atributos soltos)
    const html = new DOMParser().parseFromString(clean, 'text/html');
    const svg = html.querySelector('svg');
    if (!svg) throw new Error(t('importexport.svgImport.couldntReadSvgInvalidFile'));
    const fixed = new XMLSerializer().serializeToString(svg);
    doc = new DOMParser().parseFromString(fixed.includes('xmlns=') ? fixed : fixed.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'), 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(t('importexport.svgImport.couldntReadSvgInvalidFile'));
  }
  return doc;
}

/** SVG (texto) → elementos nativos editáveis, em coordenadas do próprio SVG. */
export function importSvgMarkup(markup: string): SvgImportResult {
  const doc = parseSvgDocument(markup);
  const root = doc.documentElement;
  const ctx: Ctx = {
    doc,
    rules: readCss(doc),
    gradients: readGradients(doc),
    out: [],
    counts: { shapes: 0, connectors: 0, texts: 0, images: 0, groups: 0 },
    warnings: new Set(),
    useDepth: 0,
  };
  const rootStyle = inherit(ROOT_STYLE, declared(root, ctx));
  const m = viewBoxMatrix(root, rootStyle);
  for (let c = root.firstElementChild; c; c = c.nextElementSibling) walk(c, m, rootStyle, 1, null, 1, ctx);
  if (ctx.out.length >= SVG_IMPORT_LIMIT) ctx.warnings.add(t('importexport.svgImport.tooManyObjects', { limit: SVG_IMPORT_LIMIT }));
  // grupos com um único objeto não precisam de grupo
  const sizes = new Map<string, number>();
  for (const el of ctx.out) if (el.groupId) sizes.set(el.groupId, (sizes.get(el.groupId) ?? 0) + 1);
  const elements = ctx.out.map((el) => (el.groupId && (sizes.get(el.groupId) ?? 0) < 2 ? ({ ...el, groupId: null } as CanvasElement) : el));
  ctx.counts.groups = Array.from(sizes.values()).filter((n) => n >= 2).length;
  return { elements, counts: ctx.counts, warnings: Array.from(ctx.warnings) };
}

/** "12 formas, 3 linhas, 2 textos" */
export function describeSvgCounts(c: SvgImportResult['counts']): string {
  const parts: string[] = [];
  if (c.shapes) parts.push(formatCount('shape', c.shapes));
  if (c.connectors) parts.push(formatCount('line', c.connectors));
  if (c.texts) parts.push(formatCount('text', c.texts));
  if (c.images) parts.push(formatCount('image', c.images));
  return formatList(parts, 'unit') || t('importexport.svgImport.nothingDrawable');
}
