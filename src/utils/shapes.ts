/**
 * LuDraw — Geometria das formas (SVG path).
 * O mesmo path é usado pelo DOM (`ShapeView`) e pela exportação em Canvas 2D (`new Path2D(path)`),
 * garantindo que o PNG/PDF exportado seja idêntico ao que está na tela.
 */

import { isValidCustomPath } from './composite';
import type { ShapeElement, ShapeKind } from '../types/canvas';
import { scaleNormalizedPath } from './svgPath';
import { t } from '../i18n';

export interface ShapeKindInfo {
  kind: ShapeKind;
  label: string;
  shortcut?: string;
}

export const SHAPE_KINDS: ShapeKindInfo[] = [
  { kind: 'rectangle', get label() { return t('common.rectangle'); }, shortcut: 'R' },
  { kind: 'rounded_rectangle', get label() { return t('widgets.shapes.roundedRectangle'); } },
  { kind: 'circle', get label() { return t('widgets.shapes.oval'); }, shortcut: 'O' },
  { kind: 'diamond', get label() { return t('widgets.shapes.diamond'); } },
  { kind: 'triangle', get label() { return t('widgets.shapes.triangle'); } },
  { kind: 'parallelogram', get label() { return t('widgets.shapes.parallelogram'); } },
  { kind: 'star', get label() { return t('widgets.shapes.star'); } },
  { kind: 'speech_bubble', get label() { return t('widgets.shapes.speechBubble'); } },
  { kind: 'hexagon', get label() { return t('common.hexagon'); } },
  { kind: 'cylinder', get label() { return t('widgets.shapes.cylinder'); } },
  { kind: 'cloud', get label() { return t('widgets.shapes.cloud'); } },
];

export function shapeLabel(kind: ShapeKind): string {
  return SHAPE_KINDS.find((s) => s.kind === kind)?.label ?? t('widgets.shapes.shape');
}

const f = (n: number) => Math.round(n * 100) / 100;

function polygon(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${f(x)} ${f(y)}`).join(' ') + ' Z';
}

function roundedRect(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    `M ${f(rr)} 0`,
    `H ${f(w - rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(w)} ${f(rr)}`,
    `V ${f(h - rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(w - rr)} ${f(h)}`,
    `H ${f(rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 0 ${f(h - rr)}`,
    `V ${f(rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(rr)} 0`,
    'Z',
  ].join(' ');
}

/** Path SVG da forma no espaço local (0,0) → (w,h). */
export function getShapePath(kind: ShapeKind, w: number, h: number): string {
  switch (kind) {
    case 'rectangle':
      return polygon([
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ]);
    case 'rounded_rectangle':
      return roundedRect(w, h, Math.min(w, h) * 0.16);
    case 'circle': {
      const rx = w / 2;
      const ry = h / 2;
      return `M 0 ${f(ry)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(w)} ${f(ry)} A ${f(rx)} ${f(ry)} 0 1 0 0 ${f(ry)} Z`;
    }
    case 'diamond':
      return polygon([
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ]);
    case 'triangle':
      return polygon([
        [w / 2, 0],
        [w, h],
        [0, h],
      ]);
    case 'parallelogram': {
      const s = Math.min(w * 0.22, h * 0.6);
      return polygon([
        [s, 0],
        [w, 0],
        [w - s, h],
        [0, h],
      ]);
    }
    case 'hexagon': {
      const s = Math.min(w * 0.25, h * 0.5);
      return polygon([
        [s, 0],
        [w - s, 0],
        [w, h / 2],
        [w - s, h],
        [s, h],
        [0, h / 2],
      ]);
    }
    case 'star': {
      const cx = w / 2;
      const cy = h / 2;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const outer = i % 2 === 0;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const rx = (outer ? 0.5 : 0.21) * w;
        const ry = (outer ? 0.5 : 0.21) * h;
        // Ajuste vertical para a estrela ocupar melhor a caixa
        pts.push([cx + Math.cos(angle) * rx, cy + 0.06 * h + Math.sin(angle) * ry * 1.04]);
      }
      return polygon(pts);
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.12, w * 0.25);
      return [
        `M 0 ${f(ry)}`,
        `A ${f(w / 2)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)}`,
        `V ${f(h - ry)}`,
        `A ${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)}`,
        'Z',
      ].join(' ');
    }
    case 'speech_bubble': {
      const bh = h * 0.8;
      const r = Math.min(w, bh) * 0.14;
      return [
        `M ${f(r)} 0`,
        `H ${f(w - r)}`,
        `A ${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)}`,
        `V ${f(bh - r)}`,
        `A ${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(bh)}`,
        `H ${f(w * 0.42)}`,
        `L ${f(w * 0.22)} ${f(h)}`,
        `L ${f(w * 0.26)} ${f(bh)}`,
        `H ${f(r)}`,
        `A ${f(r)} ${f(r)} 0 0 1 0 ${f(bh - r)}`,
        `V ${f(r)}`,
        `A ${f(r)} ${f(r)} 0 0 1 ${f(r)} 0`,
        'Z',
      ].join(' ');
    }
    case 'cloud': {
      const p = (x: number, y: number) => `${f(x * w)} ${f(y * h)}`;
      return [
        `M ${p(0.26, 0.86)}`,
        `C ${p(0.08, 0.86)} ${p(0.0, 0.66)} ${p(0.12, 0.54)}`,
        `C ${p(0.04, 0.34)} ${p(0.24, 0.18)} ${p(0.4, 0.27)}`,
        `C ${p(0.48, 0.06)} ${p(0.78, 0.06)} ${p(0.8, 0.3)}`,
        `C ${p(0.98, 0.3)} ${p(1.04, 0.56)} ${p(0.9, 0.66)}`,
        `C ${p(0.96, 0.84)} ${p(0.82, 0.92)} ${p(0.7, 0.86)}`,
        `C ${p(0.6, 0.98)} ${p(0.36, 0.98)} ${p(0.26, 0.86)}`,
        'Z',
      ].join(' ');
    }
    default:
      return polygon([
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ]);
  }
}

/**
 * Traços decorativos desenhados SEM preenchimento por cima do corpo da forma
 * (ex.: a borda frontal da tampa do cilindro). Separar do corpo evita "buracos"
 * causados pela regra de preenchimento quando subcaminhos se sobrepõem.
 */
export function getShapeDecorationPath(kind: ShapeKind, w: number, h: number): string | null {
  if (kind === 'cylinder') {
    const ry = Math.min(h * 0.12, w * 0.25);
    return `M 0 ${f(ry)} A ${f(w / 2)} ${f(ry)} 0 0 0 ${f(w)} ${f(ry)}`;
  }
  return null;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Área interna onde o texto da forma é desenhado (para não vazar pelas bordas). */
export function getShapeTextInsets(kind: ShapeKind, w: number, h: number): Insets {
  const pad = Math.min(12, Math.min(w, h) * 0.1);
  switch (kind) {
    case 'circle':
      return { top: h * 0.15, right: w * 0.15, bottom: h * 0.15, left: w * 0.15 };
    case 'diamond':
      return { top: h * 0.25, right: w * 0.25, bottom: h * 0.25, left: w * 0.25 };
    case 'triangle':
      return { top: h * 0.45, right: w * 0.22, bottom: h * 0.06, left: w * 0.22 };
    case 'star':
      return { top: h * 0.38, right: w * 0.3, bottom: h * 0.22, left: w * 0.3 };
    case 'hexagon':
      return { top: pad, right: Math.min(w * 0.25, h * 0.5) * 0.7, bottom: pad, left: Math.min(w * 0.25, h * 0.5) * 0.7 };
    case 'parallelogram': {
      const s = Math.min(w * 0.22, h * 0.6);
      return { top: pad, right: s * 0.8, bottom: pad, left: s * 0.8 };
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.12, w * 0.25);
      return { top: ry * 2 + pad / 2, right: pad, bottom: ry + pad / 2, left: pad };
    }
    case 'speech_bubble':
      return { top: pad, right: pad, bottom: h * 0.2 + pad, left: pad };
    case 'cloud':
      return { top: h * 0.28, right: w * 0.16, bottom: h * 0.18, left: w * 0.16 };
    default:
      return { top: pad, right: pad, bottom: pad, left: pad };
  }
}

/* ------------------------- Chat 05: contorno livre (SVG) ------------------------- */

type ShapeGeometry = Pick<ShapeElement, 'shapeKind' | 'width' | 'height' | 'customPath' | 'customPathBox' | 'customDecoration' | 'customTextInsets'>;

/**
 * Chat 06.5: o contorno livre só é usado se estiver no formato normalizado e dentro dos limites
 * (`validateCustomPath`) — vale para qualquer origem (abrir, importar, colar, versões, export).
 * Inválido é ignorado: a forma cai para o desenho nativo de `shapeKind`, sem quebrar o board.
 */
function usableCustom(el: ShapeGeometry): boolean {
  return !!el.customPath && !!el.customPathBox && el.customPathBox.width > 0 && el.customPathBox.height > 0 && isValidCustomPath(el.customPath);
}

/**
 * Path da forma de um ELEMENTO: contorno livre importado de SVG (`customPath`, escalado da caixa
 * original para o tamanho atual) ou a forma nativa de `shapeKind`. Única fonte para DOM e export.
 */
export function shapeElementPath(el: ShapeGeometry): string {
  if (usableCustom(el)) return scaleNormalizedPath(el.customPath!, el.customPathBox!.width, el.customPathBox!.height, el.width, el.height);
  return getShapePath(el.shapeKind, el.width, el.height);
}

/** Decoração: formas nativas, ou `customDecoration` das formas de extensão (Chat 06.5). */
export function shapeElementDecoration(el: ShapeGeometry): string | null {
  if (!usableCustom(el)) return getShapeDecorationPath(el.shapeKind, el.width, el.height);
  if (el.customDecoration && isValidCustomPath(el.customDecoration)) return scaleNormalizedPath(el.customDecoration, el.customPathBox!.width, el.customPathBox!.height, el.width, el.height);
  return null;
}

/** Área do texto (contorno livre usa a margem padrão de retângulo). */
export function shapeElementTextInsets(el: ShapeGeometry): Insets {
  const custom = usableCustom(el);
  const ins = el.customTextInsets;
  if (custom && ins && [ins.top, ins.right, ins.bottom, ins.left].every((v) => Number.isFinite(v) && v >= 0 && v <= 0.45)) {
    return { top: ins.top * el.height, right: ins.right * el.width, bottom: ins.bottom * el.height, left: ins.left * el.width };
  }
  return getShapeTextInsets(custom ? 'rectangle' : el.shapeKind, el.width, el.height);
}
