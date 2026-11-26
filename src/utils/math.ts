/**
 * LuDraw — Matemática pura do canvas (sem dependência de React/DOM).
 *
 * Convenção de câmera:
 *   screen = world * zoom + camera.(x|y)
 *   world  = (screen - camera.(x|y)) / zoom
 * Todas as coordenadas "screen" são relativas ao canto superior esquerdo do palco.
 */

import type { CameraState, CanvasElement, SmartGuide, WorldRect } from '../types/canvas';

export interface Point {
  x: number;
  y: number;
}

export type Rect = WorldRect;

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 4;

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_VECTORS: Record<HandleId, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export const ALL_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const CORNER_HANDLES: HandleId[] = ['nw', 'ne', 'se', 'sw'];

/* -------------------------------------------------------------------------- */
/*  Básico                                                                    */
/* -------------------------------------------------------------------------- */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normaliza um ângulo para o intervalo [0, 360). */
export function normalizeAngle(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* -------------------------------------------------------------------------- */
/*  Câmera                                                                    */
/* -------------------------------------------------------------------------- */

export function screenToWorld(point: Point, camera: CameraState): Point {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function worldToScreen(point: Point, camera: CameraState): Point {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

export function worldRectToScreen(rect: Rect, camera: CameraState): Rect {
  const p = worldToScreen(rect, camera);
  return { x: p.x, y: p.y, width: rect.width * camera.zoom, height: rect.height * camera.zoom };
}

export function screenRectToWorld(rect: Rect, camera: CameraState): Rect {
  const p = screenToWorld(rect, camera);
  return { x: p.x, y: p.y, width: rect.width / camera.zoom, height: rect.height / camera.zoom };
}

/** Aplica um novo zoom mantendo fixo o ponto de tela `focus` (zoom focado no cursor). */
export function zoomAtPoint(camera: CameraState, nextZoom: number, focus: Point): CameraState {
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: focus.x - (focus.x - camera.x) * ratio,
    y: focus.y - (focus.y - camera.y) * ratio,
  };
}

/** Retângulo do mundo visível na viewport. */
export function getViewportWorldRect(camera: CameraState, viewport: Size): Rect {
  return screenRectToWorld({ x: 0, y: 0, width: viewport.width, height: viewport.height }, camera);
}

/** Câmera que enquadra `rect` dentro da viewport com `padding` (px de tela). */
export function fitRectInViewport(
  rect: Rect,
  viewport: Size,
  padding = 80,
  maxZoom = 1,
  minZoom = MIN_ZOOM,
): CameraState {
  const availW = Math.max(40, viewport.width - padding * 2);
  const availH = Math.max(40, viewport.height - padding * 2);
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  const zoom = clamp(Math.min(availW / w, availH / h), minZoom, maxZoom);
  return {
    zoom,
    x: viewport.width / 2 - (rect.x + w / 2) * zoom,
    y: viewport.height / 2 - (rect.y + h / 2) * zoom,
  };
}

/** Câmera centralizada em um ponto do mundo mantendo o zoom. */
export function centerCameraOn(point: Point, viewport: Size, zoom: number): CameraState {
  return {
    zoom,
    x: viewport.width / 2 - point.x * zoom,
    y: viewport.height / 2 - point.y * zoom,
  };
}

/* -------------------------------------------------------------------------- */
/*  Rotação e Bounding Boxes                                                  */
/* -------------------------------------------------------------------------- */

export function rotatePoint(point: Point, center: Point, deg: number): Point {
  if (!deg) return { x: point.x, y: point.y };
  const rad = degToRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Rotaciona um vetor (sem centro). */
export function rotateVector(v: Point, deg: number): Point {
  return rotatePoint(v, { x: 0, y: 0 }, deg);
}

type Boxed = Pick<CanvasElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export function getElementCenter(el: Boxed): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

/** 4 cantos do elemento em coordenadas de mundo (nw, ne, se, sw), já rotacionados. */
export function getElementCorners(el: Boxed): Point[] {
  const c = getElementCenter(el);
  const pts: Point[] = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ];
  return pts.map((p) => rotatePoint(p, c, el.rotation || 0));
}

export function getBoundsOfPoints(points: Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bounding box alinhada aos eixos (AABB) de um elemento, considerando a rotação. */
export function getElementBounds(el: Boxed): Rect {
  if (!el.rotation) return { x: el.x, y: el.y, width: el.width, height: el.height };
  return getBoundsOfPoints(getElementCorners(el));
}

export function getBoundsOfRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bounding box múltipla (seleção) de um conjunto de elementos. */
export function getBoundsOfElements(elements: Boxed[]): Rect | null {
  return getBoundsOfRects(elements.map(getElementBounds));
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Normaliza um retângulo definido por dois pontos quaisquer. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function expandRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}

/* -------------------------------------------------------------------------- */
/*  Colisão / interseção                                                      */
/* -------------------------------------------------------------------------- */

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

/** `outer` contém `inner` totalmente. */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Teste ponto-dentro-do-elemento respeitando a rotação. */
export function elementContainsPoint(el: Boxed, p: Point): boolean {
  const local = rotatePoint(p, getElementCenter(el), -(el.rotation || 0));
  return rectContainsPoint({ x: el.x, y: el.y, width: el.width, height: el.height }, local);
}

/** Interseção do marquee com o elemento (precise=true exige contenção total). */
export function marqueeHitsElement(marquee: Rect, el: Boxed, precise: boolean): boolean {
  const bounds = getElementBounds(el);
  return precise ? rectContainsRect(marquee, bounds) : rectsIntersect(marquee, bounds);
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distância mínima de um ponto a uma polilinha. */
export function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distance(p, points[0]);
  let min = Infinity;
  for (let i = 1; i < points.length; i++) {
    min = Math.min(min, distanceToSegment(p, points[i - 1], points[i]));
  }
  return min;
}

/* -------------------------------------------------------------------------- */
/*  Snap                                                                      */
/* -------------------------------------------------------------------------- */

export function snapToGrid(value: number, size: number): number {
  if (size <= 0) return value;
  return Math.round(value / size) * size;
}

export function snapPointToGrid(p: Point, size: number): Point {
  return { x: snapToGrid(p.x, size), y: snapToGrid(p.y, size) };
}

export function snapAngle(deg: number, step = 15): number {
  return normalizeAngle(Math.round(deg / step) * step);
}

/* -------------------------------------------------------------------------- */
/*  Smart Guides                                                              */
/* -------------------------------------------------------------------------- */

export interface SmartGuideResult {
  dx: number;
  dy: number;
  guides: SmartGuide[];
}

const xLines = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
const yLines = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];

/**
 * Calcula o deslocamento magnético (dx, dy) para alinhar `moving` às bordas/centros
 * de `targets`, e as linhas guias resultantes após o snap.
 * @param threshold distância máxima (em unidades de mundo) para "grudar".
 */
export function computeSmartGuides(moving: Rect, targets: Rect[], threshold: number): SmartGuideResult {
  let bestDx = Infinity;
  let bestDy = Infinity;
  const mx = xLines(moving);
  const my = yLines(moving);

  for (const t of targets) {
    for (const tx of xLines(t)) {
      for (const sx of mx) {
        const d = tx - sx;
        if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(bestDx)) bestDx = d;
      }
    }
    for (const ty of yLines(t)) {
      for (const sy of my) {
        const d = ty - sy;
        if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(bestDy)) bestDy = d;
      }
    }
  }

  const dx = Number.isFinite(bestDx) ? bestDx : 0;
  const dy = Number.isFinite(bestDy) ? bestDy : 0;
  const snapped: Rect = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const sx = xLines(snapped);
  const sy = yLines(snapped);
  const eps = 0.5;

  const vertical = new Map<number, { start: number; end: number }>();
  const horizontal = new Map<number, { start: number; end: number }>();

  const addGuide = (map: Map<number, { start: number; end: number }>, pos: number, a: number, b: number) => {
    const key = Math.round(pos * 100) / 100;
    const prev = map.get(key);
    if (prev) {
      prev.start = Math.min(prev.start, a);
      prev.end = Math.max(prev.end, b);
    } else {
      map.set(key, { start: a, end: b });
    }
  };

  if (Number.isFinite(bestDx)) {
    for (const t of targets) {
      for (const tx of xLines(t)) {
        if (sx.some((v) => Math.abs(v - tx) < eps)) {
          addGuide(
            vertical,
            tx,
            Math.min(t.y, snapped.y),
            Math.max(t.y + t.height, snapped.y + snapped.height),
          );
        }
      }
    }
  }
  if (Number.isFinite(bestDy)) {
    for (const t of targets) {
      for (const ty of yLines(t)) {
        if (sy.some((v) => Math.abs(v - ty) < eps)) {
          addGuide(
            horizontal,
            ty,
            Math.min(t.x, snapped.x),
            Math.max(t.x + t.width, snapped.x + snapped.width),
          );
        }
      }
    }
  }

  const guides: SmartGuide[] = [];
  vertical.forEach((v, position) => guides.push({ orientation: 'vertical', position, start: v.start, end: v.end }));
  horizontal.forEach((v, position) => guides.push({ orientation: 'horizontal', position, start: v.start, end: v.end }));
  return { dx, dy, guides };
}

/* -------------------------------------------------------------------------- */
/*  Redimensionamento                                                         */
/* -------------------------------------------------------------------------- */

export interface ResizeInput {
  original: Boxed;
  handle: HandleId;
  /** Ponteiro em coordenadas de mundo */
  pointer: Point;
  keepAspect: boolean;
  fromCenter: boolean;
  minSize?: number;
}

/**
 * Redimensiona um retângulo (possivelmente rotacionado) a partir de uma alça.
 * O cálculo é feito no referencial local do elemento: o ponto oposto à alça fica fixo.
 * Retorna x/y/width/height NÃO rotacionados (a rotação do elemento é preservada).
 */
export function computeResize({ original, handle, pointer, keepAspect, fromCenter, minSize = 8 }: ResizeInput): Rect {
  const hv = HANDLE_VECTORS[handle];
  const rotation = original.rotation || 0;
  const w = Math.max(original.width, 0.0001);
  const h = Math.max(original.height, 0.0001);
  const center = getElementCenter(original);

  const anchor = fromCenter ? center : addPoints(center, rotateVector({ x: (-hv.x * w) / 2, y: (-hv.y * h) / 2 }, rotation));
  const local = rotateVector({ x: pointer.x - anchor.x, y: pointer.y - anchor.y }, -rotation);
  const factor = fromCenter ? 2 : 1;

  let newW = hv.x !== 0 ? Math.max(minSize, local.x * hv.x * factor) : w;
  let newH = hv.y !== 0 ? Math.max(minSize, local.y * hv.y * factor) : h;

  if (keepAspect) {
    const ratio = w / h;
    if (hv.x !== 0 && hv.y !== 0) {
      const s = Math.max(newW / w, newH / h);
      newW = Math.max(minSize, w * s);
      newH = Math.max(minSize, newW / ratio);
    } else if (hv.x !== 0) {
      newH = Math.max(minSize, newW / ratio);
    } else {
      newW = Math.max(minSize, newH * ratio);
    }
  }

  const newCenter = fromCenter
    ? center
    : addPoints(anchor, rotateVector({ x: (hv.x * newW) / 2, y: (hv.y * newH) / 2 }, rotation));

  return { x: newCenter.x - newW / 2, y: newCenter.y - newH / 2, width: newW, height: newH };
}

/** Redimensionamento de seleção múltipla (caixa alinhada aos eixos). */
export function computeGroupResize(
  box: Rect,
  handle: HandleId,
  pointer: Point,
  keepAspect: boolean,
  fromCenter: boolean,
  minSize = 8,
): Rect {
  return computeResize({ original: { ...box, rotation: 0 }, handle, pointer, keepAspect, fromCenter, minSize });
}

/** Mapeia um retângulo de `from` para `to` (escala proporcional de posições). */
export function mapRectBetweenBoxes(rect: Rect, from: Rect, to: Rect): Rect {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  return {
    x: to.x + (rect.x - from.x) * sx,
    y: to.y + (rect.y - from.y) * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}

const RESIZE_CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;
const HANDLE_BASE_ANGLE: Record<HandleId, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };

/** Cursor de redimensionamento correto mesmo com o elemento rotacionado. */
export function cursorForHandle(handle: HandleId, rotation: number): string {
  const angle = normalizeAngle(HANDLE_BASE_ANGLE[handle] + rotation);
  const idx = Math.round(angle / 45) % 4;
  return RESIZE_CURSORS[idx];
}

/** Ângulo (graus) do vetor centro→ponto, com 0° apontando para cima. */
export function angleFromCenter(center: Point, p: Point): number {
  return normalizeAngle(radToDeg(Math.atan2(p.y - center.y, p.x - center.x)) + 90);
}

export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subPoints(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Simplificação simples de traço: remove pontos mais próximos que `minDist`. */
export function simplifyPoints(points: Point[], minDist: number): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (distance(points[i], out[out.length - 1]) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Path SVG suavizado (curvas quadráticas pelos pontos médios) para desenho livre. */
export function smoothPathFromPoints(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const next = points[i + 1];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    d += ` Q ${p.x} ${p.y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/** easeOutCubic — usado nas animações de câmera. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* -------------------------------------------------------------------------- */
/*  Seleção por laço (Chat 02 · Rodada A)                                      */
/* -------------------------------------------------------------------------- */

/** Ponto dentro de um polígono (ray casting; o polígono é fechado implicitamente). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Interseção de dois segmentos (inclui toques nas pontas). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  const onSeg = (p: Point, q: Point, r: Point) => Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

function rectCorners(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/** O contorno do polígono cruza (ou toca) a caixa, ou um contém o outro. */
export function polygonIntersectsRect(poly: Point[], rect: Rect): boolean {
  if (poly.length < 3) return false;
  const corners = rectCorners(rect);
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  if (poly.some((p) => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height)) return true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    for (let k = 0; k < 4; k++) if (segmentsIntersect(a, b, corners[k], corners[(k + 1) % 4])) return true;
  }
  return false;
}

/**
 * Regra do laço: seleciona o elemento se o CENTRO da caixa estiver dentro do laço ou se a
 * caixa cruzar o contorno do laço. Exceção: uma caixa que engole o laço inteiro (ex.: fundo
 * grande sob os post-its) só entra se o centro dela estiver dentro.
 * `precise` (preferência "seleção por toque" desligada) exige a caixa toda dentro do laço.
 */
export function lassoHitsElement(poly: Point[], el: Boxed, precise: boolean): boolean {
  if (poly.length < 3) return false;
  const bounds = getElementBounds(el);
  if (precise) return rectCorners(bounds).every((c) => pointInPolygon(c, poly));
  if (pointInPolygon(rectCenter(bounds), poly)) return true;
  const lassoBox = getBoundsOfPoints(poly);
  if (rectContainsRect(bounds, lassoBox)) return false;
  return polygonIntersectsRect(poly, bounds);
}
