/**
 * LuDraw — Geometria de conectores (linhas/setas ligando objetos).
 * Pontos de ancoragem, roteamento (reto, ortogonal com cantos arredondados, curvo),
 * pontas de seta e sincronização da bounding box. Usado pelo DOM, exportador e minimapa.
 *
 * Chat 03 · Rodada A:
 *  - rota em cotovelo que CONTORNA a bounding box dos objetos ligados (busca de menor custo
 *    numa grade esparsa de linhas-guia: comprimento + penalidade por dobra);
 *  - saltos de linha (`computeLineJumps` + `buildOrthogonalPath`): trechos horizontais pulam,
 *    com um arco, os trechos verticais de outras linhas em cotovelo — na tela e no export;
 *  - rótulo (`connectorLabelBox`): pílula sobre a rota — no meio ou na fração `labelPosition` do
 *    comprimento (`connectorLabelPoint`) —, medida igual no DOM e no export.
 */

import type { AnchorSide, CanvasElement, ConnectorElement, ConnectorEndpoint, ConnectorLabelStyle } from '../types/canvas';
import { createId } from './id';
import { distance, expandRect, getBoundsOfPoints, getElementCenter, getElementCorners, type Point, type Rect, rotateVector } from './math';
import { fontCss as labelFontCss, measureTextWidth, wrapText } from './text';

export type ArrowHead = ConnectorElement['startArrow'];
export type ElementLookup = (id: string) => CanvasElement | undefined;

export const ANCHOR_SIDES: Exclude<AnchorSide, 'center'>[] = ['top', 'right', 'bottom', 'left'];

const DIRS: Record<AnchorSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  center: { x: 0, y: 0 },
};

export const OPPOSITE: Record<AnchorSide, AnchorSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left', center: 'center' };

/** Elementos que aceitam conexões. */
export function isConnectable(el: CanvasElement | undefined | null): el is CanvasElement {
  return !!el && (el.type === 'sticky' || el.type === 'shape' || el.type === 'text' || el.type === 'image' || el.type === 'frame' || el.type === 'kanban' || el.type === 'table' || el.type === 'composite');
}

/** Ponto de ancoragem (meio de cada lado), respeitando a rotação. */
export function getAnchorPoint(el: CanvasElement, side: AnchorSide): Point {
  const c = getElementCenter(el);
  const d = DIRS[side];
  const local = rotateVector({ x: (d.x * el.width) / 2, y: (d.y * el.height) / 2 }, el.rotation || 0);
  return { x: c.x + local.x, y: c.y + local.y };
}

export function getAnchorDirection(el: CanvasElement, side: AnchorSide): Point {
  return rotateVector(DIRS[side], el.rotation || 0);
}

export function nearestAnchor(el: CanvasElement, p: Point): Exclude<AnchorSide, 'center'> {
  let best: Exclude<AnchorSide, 'center'> = 'top';
  let bestD = Infinity;
  for (const side of ANCHOR_SIDES) {
    const d = distance(getAnchorPoint(el, side), p);
    if (d < bestD) {
      bestD = d;
      best = side;
    }
  }
  return best;
}

interface ResolvedEnd {
  point: Point;
  dir: Point | null;
  /** Caixa (alinhada aos eixos) do objeto ligado — obstáculo para a rota em cotovelo */
  rect: Rect | null;
}

export function resolveEndpoint(ep: ConnectorEndpoint, lookup: ElementLookup): ResolvedEnd {
  const el = ep.elementId ? lookup(ep.elementId) : undefined;
  if (el && isConnectable(el)) {
    return { point: getAnchorPoint(el, ep.anchor), dir: getAnchorDirection(el, ep.anchor), rect: getBoundsOfPoints(getElementCorners(el)) };
  }
  return { point: { x: ep.x, y: ep.y }, dir: null, rect: null };
}

function dominantDir(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
  return { x: 0, y: Math.sign(dy) || 1 };
}

function isHorizontal(d: Point): boolean {
  return Math.abs(d.x) >= Math.abs(d.y);
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  // remove pontos colineares
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !((Math.abs(a.x - p.x) < 0.01 && Math.abs(p.x - b.x) < 0.01) || (Math.abs(a.y - p.y) < 0.01 && Math.abs(p.y - b.y) < 0.01));
  });
}

function roundedPolyline(points: Point[], radius: number): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, distance(prev, p) / 2, distance(p, next) / 2);
    const a = { x: p.x + ((prev.x - p.x) / (distance(prev, p) || 1)) * r, y: p.y + ((prev.y - p.y) / (distance(prev, p) || 1)) * r };
    const b = { x: p.x + ((next.x - p.x) / (distance(p, next) || 1)) * r, y: p.y + ((next.y - p.y) / (distance(p, next) || 1)) * r };
    d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export interface ConnectorRoute {
  start: Point;
  end: Point;
  /** Pontos de controle/vértices (para hit-test e bounds) */
  points: Point[];
  d: string;
  /** Ângulo (rad) da direção de chegada na ponta final e de saída invertida na inicial */
  startAngle: number;
  endAngle: number;
  mid: Point;
  /** Vértices editáveis do percurso (inclui as extremidades) */
  vertices: Point[];
  /** true quando o usuário editou o percurso (waypoints) */
  manual: boolean;
}

type RouteInput = Pick<ConnectorElement, 'start' | 'end' | 'routingType' | 'waypoints'>;

/**
 * Rota do conector. Sem `waypoints` o percurso é automático (se ajusta sozinho aos objetos).
 * Com `waypoints` o percurso foi editado: os vértices internos são mantidos e o primeiro/último
 * são realinhados às extremidades para preservar os ângulos retos quando os objetos se movem.
 */
export function computeRoute(conn: RouteInput, lookup: ElementLookup): ConnectorRoute {
  if (!conn.waypoints || conn.waypoints.length === 0) return computeAutoRoute(conn, lookup);
  const s = resolveEndpoint(conn.start, lookup);
  const e = resolveEndpoint(conn.end, lookup);
  const start = s.point;
  const end = e.point;
  const wps = conn.waypoints.map((p) => ({ x: p.x, y: p.y }));

  if (conn.routingType === 'orthogonal') {
    const first = wps[0];
    const last = wps[wps.length - 1];
    // Mantém o primeiro/último trecho alinhados ao eixo em que já estavam
    if (Math.abs(first.x - start.x) < Math.abs(first.y - start.y)) first.x = start.x;
    else first.y = start.y;
    if (wps.length > 1) {
      if (Math.abs(last.x - end.x) < Math.abs(last.y - end.y)) last.x = end.x;
      else last.y = end.y;
    }
    const pts = dedupe([start, ...wps, end]);
    return polylineRoute(start, end, pts, roundedPolyline(pts, 10), true);
  }

  const pts = [start, ...wps, end];
  if (conn.routingType === 'curved') return polylineRoute(start, end, pts, catmullRom(pts), true);
  return polylineRoute(start, end, pts, roundedPolyline(pts, 6), true);
}

function polylineRoute(start: Point, end: Point, pts: Point[], d: string, manual: boolean): ConnectorRoute {
  const a = pts[pts.length - 2] ?? start;
  const b = pts[1] ?? end;
  return {
    start,
    end,
    points: pts,
    d,
    startAngle: Math.atan2(start.y - b.y, start.x - b.x),
    endAngle: Math.atan2(end.y - a.y, end.x - a.x),
    mid: polylineMidpoint(pts),
    vertices: pts,
    manual,
  };
}

/** Ponto na metade do COMPRIMENTO do percurso (onde fica o rótulo). */
export function polylineMidpoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0] };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = distance(pts[i - 1], pts[i]);
    if (seg >= left && seg > 0) {
      const t = left / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    left -= seg;
  }
  return { ...pts[pts.length - 1] };
}

/* ----------------------- Posição do rótulo na rota ------------------------ */

/** Margem nas pontas: o rótulo nunca cobre a ponta/seta da linha. */
export const LABEL_POSITION_MIN = 0.03;
export const LABEL_POSITION_MAX = 0.97;
/** Perto do meio (± esta fração do comprimento) o rótulo "gruda" no centro. */
export const LABEL_CENTER_SNAP = 0.06;

/**
 * Pontos amostrados do percurso DESENHADO (as curvas viram polilinha fina), usados para
 * posicionar o rótulo e para descobrir em que fração da linha o usuário clicou.
 */
export function routeSamples(route: ConnectorRoute, routingType: ConnectorElement['routingType']): Point[] {
  if (routingType !== 'curved') return route.points;
  if (!route.manual && route.points.length === 4) {
    const [p0, c1, c2, p3] = route.points;
    const out: Point[] = [];
    for (let i = 0; i <= 48; i++) out.push(cubicPoint(p0, c1, c2, p3, i / 48));
    return out;
  }
  // Catmull-Rom com os mesmos controles de `catmullRom`
  const pts = route.points;
  const out: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let k = 1; k <= 16; k++) out.push(cubicPoint(p1, c1, c2, p2, k / 16));
  }
  return out;
}

function cubicPoint(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
}

/** Ponto na fração `t` (0–1) do comprimento de uma polilinha. */
export function pointAtFraction(pts: Point[], t: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0] };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = distance(pts[i - 1], pts[i]);
    if (seg >= left && seg > 0) {
      const k = left / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    }
    left -= seg;
  }
  return { ...pts[pts.length - 1] };
}

/** Fração (0–1) do comprimento da polilinha no ponto mais próximo de `p`. */
export function fractionAtPoint(pts: Point[], p: Point): number {
  if (pts.length < 2) return 0.5;
  let total = 0;
  let best = Infinity;
  let bestAt = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = distance(a, b);
    const k = seg > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (seg * seg))) : 0;
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const dist = distance(p, q);
    if (dist < best) {
      best = dist;
      bestAt = total + seg * k;
    }
    total += seg;
  }
  return total > 0 ? bestAt / total : 0.5;
}

/**
 * Posição normalizada para gravar a partir de um clique: perto do meio volta a ser "meio"
 * (`undefined`, como antes), perto das pontas respeita a margem das setas.
 */
export function labelPositionFromPoint(conn: ConnectorElement, route: ConnectorRoute, p: Point): number | undefined {
  const t = fractionAtPoint(routeSamples(route, conn.routingType), p);
  if (Math.abs(t - 0.5) <= LABEL_CENTER_SNAP) return undefined;
  return Math.round(Math.max(LABEL_POSITION_MIN, Math.min(LABEL_POSITION_MAX, t)) * 1000) / 1000;
}

/** Onde o rótulo é desenhado (tela e export). */
export function connectorLabelPoint(conn: Pick<ConnectorElement, 'routingType' | 'labelPosition'>, route: ConnectorRoute): Point {
  const t = conn.labelPosition;
  if (t === undefined || !Number.isFinite(t)) return route.mid;
  return pointAtFraction(routeSamples(route, conn.routingType), t);
}

/** Curva suave passando por todos os pontos (Catmull-Rom → Bézier cúbicas). */
function catmullRom(pts: Point[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  }
  return d;
}

export function computeAutoRoute(conn: RouteInput, lookup: ElementLookup): ConnectorRoute {
  const s = resolveEndpoint(conn.start, lookup);
  const e = resolveEndpoint(conn.end, lookup);
  const start = s.point;
  const end = e.point;
  const dirS = s.dir ?? dominantDir(start, end);
  const dirE = e.dir ?? dominantDir(end, start);

  if (conn.routingType === 'curved') {
    const k = Math.max(40, distance(start, end) / 2.5);
    const c1 = { x: start.x + dirS.x * k, y: start.y + dirS.y * k };
    const c2 = { x: end.x + dirE.x * k, y: end.y + dirE.y * k };
    const mid = {
      x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x,
      y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y,
    };
    return {
      start,
      end,
      points: [start, c1, c2, end],
      d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
      startAngle: Math.atan2(start.y - c1.y, start.x - c1.x),
      endAngle: Math.atan2(end.y - c2.y, end.x - c2.x),
      mid,
      vertices: [start, end],
      manual: false,
    };
  }

  if (conn.routingType === 'orthogonal') {
    const off = 28;
    const s1 = { x: start.x + dirS.x * off, y: start.y + dirS.y * off };
    const e1 = { x: end.x + dirE.x * off, y: end.y + dirE.y * off };
    let pts: Point[];
    if (isHorizontal(dirS) && isHorizontal(dirE)) {
      const midX = (s1.x + e1.x) / 2;
      const forward = Math.sign(end.x - start.x) === Math.sign(dirS.x) && Math.sign(start.x - end.x) === Math.sign(dirE.x);
      pts = forward ? [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end] : [start, s1, { x: s1.x, y: (s1.y + e1.y) / 2 }, { x: e1.x, y: (s1.y + e1.y) / 2 }, e1, end];
    } else if (!isHorizontal(dirS) && !isHorizontal(dirE)) {
      const midY = (s1.y + e1.y) / 2;
      const forward = Math.sign(end.y - start.y) === Math.sign(dirS.y) && Math.sign(start.y - end.y) === Math.sign(dirE.y);
      pts = forward ? [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end] : [start, s1, { x: (s1.x + e1.x) / 2, y: s1.y }, { x: (s1.x + e1.x) / 2, y: e1.y }, e1, end];
    } else if (isHorizontal(dirS)) {
      pts = [start, { x: end.x, y: start.y }, end];
    } else {
      pts = [start, { x: start.x, y: end.y }, end];
    }
    pts = dedupe(pts);
    // A rota simples atravessa um dos objetos ligados? Procura um desvio pelas laterais.
    const obstacles = [s.rect, e.rect].filter((r): r is Rect => !!r);
    if (obstacles.length && polylineHitsRects(pts, obstacles)) {
      const detour = routeAroundObstacles(start, dirS, end, dirE, obstacles, off);
      if (detour) pts = detour;
    }
    return polylineRoute(start, end, pts, roundedPolyline(pts, ORTHO_RADIUS), false);
  }

  return {
    start,
    end,
    points: [start, end],
    d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    startAngle: Math.atan2(start.y - end.y, start.x - end.x),
    endAngle: Math.atan2(end.y - start.y, end.x - start.x),
    mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    vertices: [start, end],
    manual: false,
  };
}

/* --------------------- Desvio de obstáculos (cotovelo) ---------------------- */

/** Raio dos cantos da rota em cotovelo (o mesmo usado no DOM e no export). */
export const ORTHO_RADIUS = 10;
const BEND_COST = 48;

const axisDirs: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const dirIndex = (d: Point): number => (Math.abs(d.x) >= Math.abs(d.y) ? (d.x >= 0 ? 0 : 2) : d.y >= 0 ? 1 : 3);

/** Trecho alinhado aos eixos passa pelo INTERIOR do retângulo? (encostar na borda não conta) */
function axisSegmentHitsRect(a: Point, b: Point, r: Rect, inset = 1): boolean {
  const x0 = r.x + inset;
  const x1 = r.x + r.width - inset;
  const y0 = r.y + inset;
  const y1 = r.y + r.height - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  if (Math.abs(a.y - b.y) < 0.01) {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return a.y > y0 && a.y < y1 && hi > x0 && lo < x1;
  }
  if (Math.abs(a.x - b.x) < 0.01) {
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return a.x > x0 && a.x < x1 && hi > y0 && lo < y1;
  }
  return false;
}

function polylineHitsRects(pts: Point[], rects: Rect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) for (const r of rects) if (axisSegmentHitsRect(pts[i], pts[i + 1], r)) return true;
  return false;
}

/**
 * Rota em cotovelo que contorna os retângulos dados. Busca de menor custo (Dijkstra com
 * heurística de Manhattan = A*) numa grade esparsa formada pelas bordas infladas dos objetos,
 * pelos "tocos" de saída/chegada e pelas linhas médias entre eles. Custo = comprimento +
 * penalidade por dobra; meia-volta é proibida. Devolve null se não houver caminho.
 */
export function routeAroundObstacles(start: Point, dirS: Point, end: Point, dirE: Point, obstacles: Rect[], stub = 28): Point[] | null {
  // linhas-guia passam a uma folga confortável; o bloqueio usa uma folga menor (permite
  // atalhos limpos rente ao objeto em vez de "degraus" de poucos pixels)
  const inflated = obstacles.map((r) => expandRect(r, stub - 8));
  const blockers = obstacles.map((r) => expandRect(r, 8));
  const s1 = { x: start.x + dirS.x * stub, y: start.y + dirS.y * stub };
  const e1 = { x: end.x + dirE.x * stub, y: end.y + dirE.y * stub };
  const inside = (p: Point) => blockers.some((r) => p.x > r.x + 0.5 && p.x < r.x + r.width - 0.5 && p.y > r.y + 0.5 && p.y < r.y + r.height - 0.5);
  if (inside(s1) || inside(e1)) return null;

  const uniq = (vals: number[]) => Array.from(new Set(vals.map((v) => Math.round(v * 100) / 100))).sort((a, b) => a - b);
  const xs = uniq([s1.x, e1.x, (s1.x + e1.x) / 2, ...inflated.flatMap((r) => [r.x, r.x + r.width])]);
  const ys = uniq([s1.y, e1.y, (s1.y + e1.y) / 2, ...inflated.flatMap((r) => [r.y, r.y + r.height])]);
  const W = xs.length;
  const H = ys.length;
  const idx = (ix: number, iy: number) => iy * W + ix;
  const blocked = (a: Point, b: Point) => blockers.some((r) => axisSegmentHitsRect(a, b, r, 0.5));
  const find = (v: number, arr: number[]) => arr.findIndex((x) => Math.abs(x - Math.round(v * 100) / 100) < 0.01);
  const sIx = find(s1.x, xs);
  const sIy = find(s1.y, ys);
  const eIx = find(e1.x, xs);
  const eIy = find(e1.y, ys);
  if (sIx < 0 || sIy < 0 || eIx < 0 || eIy < 0) return null;

  // estado = nó da grade × direção de chegada
  const N = W * H * 4;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const startDir = dirIndex(dirS);
  const startState = idx(sIx, sIy) * 4 + startDir;
  cost[startState] = 0;
  const goalDirBad = dirIndex(dirE); // chegar andando "para fora" do objeto final = meia-volta no toco
  const h = (ix: number, iy: number) => Math.abs(xs[ix] - xs[eIx]) + Math.abs(ys[iy] - ys[eIy]);
  let best = -1;
  let bestCost = Infinity;
  for (;;) {
    let cur = -1;
    let curF = Infinity;
    for (let k = 0; k < N; k++) {
      if (done[k] || cost[k] === Infinity) continue;
      const node = (k / 4) | 0;
      const f = cost[k] + h(node % W, (node / W) | 0);
      if (f < curF) {
        curF = f;
        cur = k;
      }
    }
    if (cur < 0 || curF >= bestCost) break;
    done[cur] = 1;
    const node = (cur / 4) | 0;
    const dir = cur % 4;
    const ix = node % W;
    const iy = (node / W) | 0;
    if (ix === eIx && iy === eIy) {
      if (dir !== goalDirBad) {
        const total = cost[cur] + (dir === (goalDirBad + 2) % 4 ? 0 : BEND_COST);
        if (total < bestCost) {
          bestCost = total;
          best = cur;
        }
      }
      continue;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue; // sem meia-volta
      const nx = ix + axisDirs[nd].x;
      const ny = iy + axisDirs[nd].y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const a = { x: xs[ix], y: ys[iy] };
      const b = { x: xs[nx], y: ys[ny] };
      if (inside(b) || blocked(a, b)) continue;
      const ns = idx(nx, ny) * 4 + nd;
      const c = cost[cur] + distance(a, b) + (nd === dir ? 0 : BEND_COST);
      if (c < cost[ns]) {
        cost[ns] = c;
        prev[ns] = cur;
      }
    }
  }
  if (best < 0) return null;
  const path: Point[] = [];
  for (let k = best; k >= 0; k = prev[k]) {
    const node = (k / 4) | 0;
    path.push({ x: xs[node % W], y: ys[(node / W) | 0] });
  }
  path.reverse();
  return dedupe([start, ...path, end]);
}

/* ------------------------------ Saltos de linha ------------------------------ */

/** Por trecho (índice em `route.points`), as coordenadas x onde a linha salta. */
export type SegmentJumps = Record<number, number[]>;

export function jumpRadius(strokeWidth: number): number {
  return 4 + strokeWidth * 1.5;
}

interface JumpCandidate {
  id: string;
  points: Point[];
  jumps: boolean;
  strokeWidth: number;
}

/**
 * Regra única (tela e export): o trecho HORIZONTAL de uma linha em cotovelo com saltos ligados
 * desenha um arco onde cruza um trecho VERTICAL de outra linha em cotovelo. Cada cruzamento
 * ganha exatamente um arco. Cantos e pontas não geram salto.
 */
export function computeLineJumps(connectors: ConnectorElement[], lookup: ElementLookup): Map<string, SegmentJumps> {
  const items: JumpCandidate[] = connectors
    .filter((c) => c.routingType === 'orthogonal')
    .map((c) => ({ id: c.id, points: computeRoute(c, lookup).points, jumps: c.lineJumps !== false, strokeWidth: c.strokeWidth }));
  const verticals: { id: string; x: number; y0: number; y1: number }[] = [];
  for (const it of items) {
    for (let i = 0; i < it.points.length - 1; i++) {
      const a = it.points[i];
      const b = it.points[i + 1];
      if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) > 0.01) verticals.push({ id: it.id, x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
    }
  }
  const out = new Map<string, SegmentJumps>();
  if (!verticals.length) return out;
  for (const it of items) {
    if (!it.jumps) continue;
    const jr = jumpRadius(it.strokeWidth);
    const last = it.points.length - 2;
    for (let i = 0; i <= last; i++) {
      const a = it.points[i];
      const b = it.points[i + 1];
      if (Math.abs(a.y - b.y) > 0.01) continue;
      // folga nas pontas: canto arredondado (vértices internos) ou ponta da linha
      const padA = (i === 0 ? 2 : ORTHO_RADIUS) + jr + 1;
      const padB = (i === last ? 2 : ORTHO_RADIUS) + jr + 1;
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      const loPad = a.x <= b.x ? padA : padB;
      const hiPad = a.x <= b.x ? padB : padA;
      const xs: number[] = [];
      for (const v of verticals) {
        if (v.id === it.id) continue;
        if (v.x <= lo + loPad || v.x >= hi - hiPad) continue;
        if (a.y <= v.y0 + jr || a.y >= v.y1 - jr) continue;
        xs.push(v.x);
      }
      if (xs.length) {
        // saltos muito próximos viram um só
        xs.sort((p, q) => p - q);
        const merged = xs.filter((x, k) => k === 0 || x - xs[k - 1] > jr * 2.2);
        (out.get(it.id) ?? out.set(it.id, {}).get(it.id)!)[i] = merged;
      }
    }
  }
  return out;
}

const jumpCache = new WeakMap<Record<string, CanvasElement>, Map<string, SegmentJumps>>();

/** Saltos de todas as linhas do board (memorizado pela identidade de `elements`). */
export function lineJumpsFor(elements: Record<string, CanvasElement>): Map<string, SegmentJumps> {
  const cached = jumpCache.get(elements);
  if (cached) return cached;
  const conns: ConnectorElement[] = [];
  for (const id in elements) {
    const el = elements[id];
    if (el.type === 'connector' && el.routingType === 'orthogonal') conns.push(el);
  }
  const result = conns.length > 1 ? computeLineJumps(conns, (id) => elements[id]) : new Map<string, SegmentJumps>();
  jumpCache.set(elements, result);
  return result;
}

/** Assinatura estável (string) dos saltos de uma linha — boa para seletores do zustand. */
export function lineJumpKey(elements: Record<string, CanvasElement>, id: string): string {
  const j = lineJumpsFor(elements).get(id);
  if (!j) return '';
  return Object.keys(j)
    .map((k) => `${k}:${j[Number(k)].map((x) => Math.round(x * 10) / 10).join(',')}`)
    .join('|');
}

export function parseLineJumpKey(key: string): SegmentJumps | undefined {
  if (!key) return undefined;
  const out: SegmentJumps = {};
  for (const part of key.split('|')) {
    const [i, list] = part.split(':');
    out[Number(i)] = list.split(',').map(Number);
  }
  return out;
}

/**
 * Path SVG da rota em cotovelo (cantos arredondados) com os arcos dos saltos.
 * Sem saltos, é idêntico ao `route.d` de `computeRoute`.
 */
export function buildOrthogonalPath(points: Point[], jumps: SegmentJumps | undefined, strokeWidth: number, radius = ORTHO_RADIUS): string {
  if (!jumps || points.length < 2) return roundedPolyline(points, radius);
  const jr = jumpRadius(strokeWidth);
  // entrada/saída de cada canto (mesma conta do roundedPolyline)
  const enter: Point[] = [];
  const exit: Point[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const p = points[i];
    const next = points[i + 1];
    const dp = distance(prev, p) || 1;
    const dn = distance(p, next) || 1;
    const r = Math.min(radius, dp / 2, dn / 2);
    enter[i] = { x: p.x + ((prev.x - p.x) / dp) * r, y: p.y + ((prev.y - p.y) / dp) * r };
    exit[i] = { x: p.x + ((next.x - p.x) / dn) * r, y: p.y + ((next.y - p.y) / dn) * r };
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const to = i + 1 === points.length - 1 ? points[i + 1] : enter[i + 1];
    const xs = jumps[i];
    if (xs && xs.length) {
      const y = points[i].y;
      const dir = points[i + 1].x >= points[i].x ? 1 : -1;
      const ordered = [...xs].sort((a, b) => (a - b) * dir);
      for (const x of ordered) {
        // arco por cima (sweep 1 indo para a direita, 0 indo para a esquerda)
        d += ` L ${x - dir * jr} ${y} A ${jr} ${jr} 0 0 ${dir > 0 ? 1 : 0} ${x + dir * jr} ${y}`;
      }
    }
    d += ` L ${to.x} ${to.y}`;
    if (i + 1 < points.length - 1) d += ` Q ${points[i + 1].x} ${points[i + 1].y} ${exit[i + 1].x} ${exit[i + 1].y}`;
  }
  return d;
}

/* ---------------------------------- Rótulo ---------------------------------- */

export const LABEL_FONT_SIZE = 14;
export const LABEL_LINE_HEIGHT = 18;
export const LABEL_PAD_X = 10;
export const LABEL_PAD_Y = 4;
export const LABEL_MAX_WIDTH = 220;
export const LABEL_FONT = `600 ${LABEL_FONT_SIZE}px Figtree, system-ui, -apple-system, "Segoe UI", sans-serif`;
export const LABEL_DEFAULT_FONT_NAME = 'Figtree';
export const LABEL_DEFAULT_BORDER = 1.5;
export const LABEL_DEFAULT_RADIUS = 12;
export const LABEL_FONT_SIZES = [10, 12, 14, 16, 18, 22, 28, 36, 48];
export const LABEL_MIN_FONT = 8;
export const LABEL_MAX_FONT = 96;

/** Estilo do rótulo com os padrões aplicados — geometria ÚNICA para DOM, export e bounds. */
export interface ResolvedLabelStyle {
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  maxWidth: number;
  fontName: string;
  fontCss: string;
  fontWeight: 400 | 600 | 700;
  italic: boolean;
  /** canvas `ctx.font` */
  font: string;
  /** null = cor de texto do tema */
  textColor: string | null;
  /** null = painel do tema · 'transparent' = sem fundo */
  fillColor: string | null;
  /** null = cor da linha */
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number;
}

export function resolveLabelStyle(st: ConnectorLabelStyle | undefined): ResolvedLabelStyle {
  const fontSize = Math.max(LABEL_MIN_FONT, Math.min(LABEL_MAX_FONT, st?.fontSize ?? LABEL_FONT_SIZE));
  const k = fontSize / LABEL_FONT_SIZE;
  const fontName = st?.fontName ?? LABEL_DEFAULT_FONT_NAME;
  const fontCss = fontName === LABEL_DEFAULT_FONT_NAME ? 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif' : labelFontCss(fontName);
  const fontWeight = st?.fontWeight === 'bold' ? 700 : st?.fontWeight === 'normal' ? 400 : 600;
  const italic = st?.fontStyle === 'italic';
  return {
    fontSize,
    lineHeight: Math.round(LABEL_LINE_HEIGHT * k),
    padX: Math.round(LABEL_PAD_X * k),
    padY: Math.max(2, Math.round(LABEL_PAD_Y * k)),
    maxWidth: Math.round(LABEL_MAX_WIDTH * Math.max(1, k)),
    fontName,
    fontCss,
    fontWeight,
    italic,
    font: `${italic ? 'italic ' : ''}${fontWeight} ${fontSize}px ${fontCss}`,
    textColor: st?.textColor ?? null,
    fillColor: st?.fillColor ?? null,
    borderColor: st?.borderColor ?? null,
    borderWidth: Math.max(0, Math.min(12, st?.borderWidth ?? LABEL_DEFAULT_BORDER)),
    borderRadius: Math.max(0, st?.borderRadius ?? LABEL_DEFAULT_RADIUS),
  };
}

/** Caixa do rótulo (largura/altura em unidades de mundo) e linhas quebradas. */
export function connectorLabelBox(label: string, style?: ConnectorLabelStyle | ResolvedLabelStyle): { width: number; height: number; lines: string[]; style: ResolvedLabelStyle } {
  const r = style && 'font' in style ? (style as ResolvedLabelStyle) : resolveLabelStyle(style as ConnectorLabelStyle | undefined);
  const lines = wrapText(label, r.maxWidth, r.font);
  const textW = Math.max(...lines.map((l) => measureTextWidth(l, r.font)), 8);
  return {
    width: Math.ceil(textW) + r.padX * 2 + r.borderWidth * 2,
    height: lines.length * r.lineHeight + r.padY * 2 + r.borderWidth * 2,
    lines,
    style: r,
  };
}

/* -------------------------- Edição do percurso ----------------------------- */

const STUB = 24;

function isHorizontalSeg(a: Point, b: Point): boolean {
  return Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
}

/**
 * Prepara o arraste de um trecho de rota ortogonal: se o trecho toca uma extremidade, insere
 * um "toco" + vértice duplicado para que o trecho possa se mover sem soltar do objeto.
 * Retorna os vértices ajustados e o índice do trecho que deve se mover.
 */
export function prepareOrthogonalSegmentDrag(vertices: Point[], index: number): { points: Point[]; index: number } {
  let P = vertices.map((p) => ({ ...p }));
  let i = index;
  if (i === 0) {
    const a = P[0];
    const b = P[1];
    const len = distance(a, b) || 1;
    const k = Math.min(STUB, len / 3);
    const S = { x: a.x + ((b.x - a.x) / len) * k, y: a.y + ((b.y - a.y) / len) * k };
    P = [a, S, { ...S }, ...P.slice(1)];
    i = 2;
  }
  if (i === P.length - 2) {
    const a = P[P.length - 2];
    const b = P[P.length - 1];
    const len = distance(a, b) || 1;
    const k = Math.min(STUB, len / 3);
    const E = { x: b.x - ((b.x - a.x) / len) * k, y: b.y - ((b.y - a.y) / len) * k };
    P = [...P.slice(0, P.length - 1), E, { ...E }, b];
    // o trecho móvel passa a ser (a → primeira cópia de E)
  }
  return { points: P, index: i };
}

/** Move o trecho `index` (P[index]→P[index+1]) perpendicularmente até `pointer`. */
export function moveOrthogonalSegment(P: Point[], index: number, pointer: Point): Point[] {
  const out = P.map((p) => ({ ...p }));
  const a = out[index];
  const b = out[index + 1];
  if (isHorizontalSeg(a, b)) {
    a.y = pointer.y;
    b.y = pointer.y;
  } else {
    a.x = pointer.x;
    b.x = pointer.x;
  }
  return out;
}

/** Remove duplicados e vértices colineares, devolvendo apenas os waypoints internos. */
export function cleanWaypoints(P: Point[], orthogonal: boolean): Point[] {
  const pts = orthogonal ? dedupe(P) : P.filter((p, i) => i === 0 || distance(p, P[i - 1]) > 0.5);
  return pts.slice(1, -1).map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
}

export function arrowSize(strokeWidth: number): number {
  return 7 + strokeWidth * 2.6;
}

/** Path SVG da ponta da seta com a ponta em `tip`, apontando na direção `angle`. */
export function arrowheadPath(type: ArrowHead, tip: Point, angle: number, size: number): { d: string; filled: boolean } | null {
  if (type === 'none') return null;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pt = (bx: number, by: number) => ({ x: tip.x + bx * cos - by * sin, y: tip.y + bx * sin + by * cos });
  const f = (p: Point) => `${p.x} ${p.y}`;
  switch (type) {
    case 'arrow': {
      const a = pt(-size, -size * 0.55);
      const b = pt(-size, size * 0.55);
      return { d: `M ${f(a)} L ${f(tip)} L ${f(b)}`, filled: false };
    }
    case 'filled_arrow': {
      const a = pt(-size, -size * 0.5);
      const b = pt(-size, size * 0.5);
      return { d: `M ${f(tip)} L ${f(a)} L ${f(b)} Z`, filled: true };
    }
    case 'diamond': {
      const a = pt(-size * 0.6, -size * 0.42);
      const b = pt(-size * 1.2, 0);
      const c = pt(-size * 0.6, size * 0.42);
      return { d: `M ${f(tip)} L ${f(a)} L ${f(b)} L ${f(c)} Z`, filled: true };
    }
    case 'circle': {
      const r = size * 0.38;
      const c = pt(-r, 0);
      return { d: `M ${c.x - r} ${c.y} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`, filled: true };
    }
    default:
      return null;
  }
}

export function routeBounds(route: ConnectorRoute, strokeWidth: number, label?: string, labelAt: Point = route.mid, labelStyle?: ConnectorLabelStyle): Rect {
  const pts = [...route.points];
  if (label && label.trim()) {
    const box = connectorLabelBox(label, labelStyle);
    pts.push({ x: labelAt.x - box.width / 2, y: labelAt.y - box.height / 2 }, { x: labelAt.x + box.width / 2, y: labelAt.y + box.height / 2 });
  }
  return expandRect(getBoundsOfPoints(pts), arrowSize(strokeWidth) + strokeWidth);
}

/**
 * Mantém conectores coerentes após qualquer alteração: atualiza x/y/width/height (bbox),
 * guarda a última posição dos endpoints e solta endpoints cujo elemento foi removido.
 * Retorna o MESMO objeto se nada mudou (barato a 60 FPS).
 */
export function syncConnectors(elements: Record<string, CanvasElement>): Record<string, CanvasElement> {
  let next: Record<string, CanvasElement> | null = null;
  const lookup: ElementLookup = (id) => elements[id];
  for (const id in elements) {
    const el = elements[id];
    if (el.type !== 'connector') continue;
    const fixEnd = (ep: ConnectorEndpoint): ConnectorEndpoint => {
      if (!ep.elementId) return ep;
      const target = elements[ep.elementId];
      if (!isConnectable(target)) return { ...ep, elementId: null };
      const p = getAnchorPoint(target, ep.anchor);
      return Math.abs(p.x - ep.x) > 0.01 || Math.abs(p.y - ep.y) > 0.01 ? { ...ep, x: p.x, y: p.y } : ep;
    };
    const start = fixEnd(el.start);
    const end = fixEnd(el.end);
    const route = computeRoute({ ...el, start, end }, lookup);
    const b = routeBounds(route, el.strokeWidth, el.label, el.label ? connectorLabelPoint(el, route) : route.mid, el.labelStyle);
    const changed =
      start !== el.start ||
      end !== el.end ||
      Math.abs(b.x - el.x) > 0.01 ||
      Math.abs(b.y - el.y) > 0.01 ||
      Math.abs(b.width - el.width) > 0.01 ||
      Math.abs(b.height - el.height) > 0.01;
    if (changed) {
      if (!next) next = { ...elements };
      next[id] = { ...el, start, end, x: b.x, y: b.y, width: b.width, height: b.height, rotation: 0 };
    }
  }
  return next ?? elements;
}

export interface ConnectorStyle {
  routingType: ConnectorElement['routingType'];
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: ConnectorElement['strokeStyle'];
  startArrow: ArrowHead;
  endArrow: ArrowHead;
}

export const DEFAULT_CONNECTOR_STYLE: ConnectorStyle = {
  routingType: 'orthogonal',
  strokeColor: '#1C1C1E',
  strokeWidth: 2,
  strokeStyle: 'solid',
  startArrow: 'none',
  endArrow: 'arrow',
};

export function createConnector(start: ConnectorEndpoint, end: ConnectorEndpoint, style: Partial<ConnectorStyle> = {}, lookup?: ElementLookup): ConnectorElement {
  const t = Date.now();
  const s = { ...DEFAULT_CONNECTOR_STYLE, ...style };
  const conn: ConnectorElement = {
    id: createId(),
    type: 'connector',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    zIndex: 0,
    parentId: null,
    groupId: null,
    locked: false,
    opacity: 1,
    createdAt: t,
    updatedAt: t,
    start,
    end,
    routingType: s.routingType,
    strokeColor: s.strokeColor,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    startArrow: s.startArrow,
    endArrow: s.endArrow,
  };
  const route = computeRoute(conn, lookup ?? (() => undefined));
  const b = routeBounds(route, conn.strokeWidth);
  return { ...conn, x: b.x, y: b.y, width: b.width, height: b.height };
}

/** Distância de um ponto à rota (para seleção/borracha). */
export function strokeDasharray(style: ConnectorElement['strokeStyle'], width: number): string | undefined {
  if (style === 'dashed') return `${width * 4} ${width * 3}`;
  if (style === 'dotted') return `${width * 0.1} ${width * 2.4}`;
  return undefined;
}
