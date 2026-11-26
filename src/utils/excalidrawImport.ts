/**
 * LuDraw — Importador de arquivos `.excalidraw` (Chat 05).
 *
 * O `.excalidraw` é um formato JSON aberto, de um projeto com licença MIT (permitido pelo
 * `CLEAN_ROOM.md` §2.3). O conversor foi escrito do zero a partir da estrutura pública do JSON
 * (`{ type, version, elements[], files{} }`) e devolve objetos NATIVOS do LuDraw:
 * retângulo/elipse/losango → formas · texto → texto (ou texto da forma/linha que o contém) ·
 * linha/seta → conector (ligado aos objetos quando houver vínculo) · desenho livre → traço ·
 * imagem embutida → imagem · frame → frame. Funciona colando (`Ctrl+V`) ou abrindo o arquivo.
 */

import type { AnchorSide, CanvasElement, ConnectorElement, ShapeElement, ShapeKind } from '../types/canvas';
import { createConnector, getAnchorPoint, isConnectable } from './connectors';
import { createFrame, createFreehand, createImage, createShape, createText } from './factory';
import { createId } from './id';
import { serializePath } from './svgPath';
import { t } from '../i18n';
import { formatCount, formatList } from '../i18n/format';

export interface ExcalidrawImportResult {
  elements: CanvasElement[];
  counts: { shapes: number; connectors: number; texts: number; images: number; drawings: number; frames: number };
  warnings: string[];
}

type Raw = Record<string, unknown>;

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

/** O texto/objeto é um documento `.excalidraw` (arquivo ou área de transferência)? */
export function isExcalidrawJson(value: unknown): value is { type: string; elements: Raw[]; files?: Record<string, Raw> } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Raw;
  return (v.type === 'excalidraw' || v.type === 'excalidraw/clipboard') && Array.isArray(v.elements);
}

/** Tenta ler o JSON (texto colado ou conteúdo do arquivo). */
export function parseExcalidrawText(text: string): { type: string; elements: Raw[]; files?: Record<string, Raw> } | null {
  const t = text.trim();
  if (!t.startsWith('{') || !t.includes('"elements"')) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    return isExcalidrawJson(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function color(v: unknown, fallback: string): string {
  const s = str(v).trim();
  if (!s || s === 'transparent') return fallback;
  return s;
}

/** Famílias numeradas do formato → fontes do board (manuscritas → Caveat, código → mono). */
function fontFor(family: unknown): string {
  switch (num(family, 1)) {
    case 1:
    case 5:
      return 'Caveat';
    case 3:
    case 8:
      return 'IBM Plex Mono';
    case 7:
      return 'Fredoka';
    case 6:
      return 'Figtree';
    default:
      return 'Open Sans';
  }
}

function arrowHead(v: unknown): ConnectorElement['endArrow'] {
  switch (str(v)) {
    case 'arrow':
    case 'bar':
      return 'arrow';
    case 'triangle':
    case 'triangle_outline':
      return 'filled_arrow';
    case 'dot':
    case 'circle':
    case 'circle_outline':
      return 'circle';
    case 'diamond':
    case 'diamond_outline':
      return 'diamond';
    default:
      return 'none';
  }
}

function strokeStyle(v: unknown): ShapeElement['strokeStyle'] {
  return v === 'dashed' ? 'dashed' : v === 'dotted' ? 'dotted' : 'solid';
}

const deg = (rad: unknown) => Math.round(((num(rad) * 180) / Math.PI) * 100) / 100;

/** Lado do objeto mais próximo do ponto (para prender a ponta do conector). */
function nearestSide(el: CanvasElement, p: { x: number; y: number }): AnchorSide {
  const sides: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
  let best: AnchorSide = 'top';
  let dist = Infinity;
  for (const s of sides) {
    const a = getAnchorPoint(el, s);
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

/** Documento `.excalidraw` → elementos nativos (coordenadas do próprio arquivo). */
export function importExcalidraw(doc: { elements: Raw[]; files?: Record<string, Raw> }): ExcalidrawImportResult {
  const warnings = new Set<string>();
  const counts = { shapes: 0, connectors: 0, texts: 0, images: 0, drawings: 0, frames: 0 };
  const live = doc.elements.filter((e) => e && typeof e === 'object' && !e.isDeleted);
  const idMap = new Map<string, CanvasElement>();
  const groupMap = new Map<string, string>();
  const out: CanvasElement[] = [];
  const groupOf = (e: Raw): string | null => {
    const ids = Array.isArray(e.groupIds) ? (e.groupIds as unknown[]).filter((g): g is string => typeof g === 'string') : [];
    if (!ids.length) return null;
    const outer = ids[ids.length - 1];
    if (!groupMap.has(outer)) groupMap.set(outer, createId());
    return groupMap.get(outer)!;
  };
  const common = (e: Raw) => ({
    rotation: deg(e.angle),
    opacity: Math.max(0.05, Math.min(1, num(e.opacity, 100) / 100)),
    groupId: groupOf(e),
  });
  const fillOf = (e: Raw) => {
    const bg = str(e.backgroundColor);
    if (!bg || bg === 'transparent') return 'transparent';
    if (e.fillStyle && e.fillStyle !== 'solid') warnings.add(t('importexport.excalidrawImport.hatchedFills'));
    return bg;
  };

  // 1) frames e formas primeiro (conectores e textos dependem deles)
  for (const e of live) {
    const type = str(e.type);
    const box = { x: num(e.x), y: num(e.y), width: Math.max(1, Math.abs(num(e.width, 1))), height: Math.max(1, Math.abs(num(e.height, 1))) };
    if (type === 'rectangle' || type === 'ellipse' || type === 'diamond') {
      const kind: ShapeKind = type === 'ellipse' ? 'circle' : type === 'diamond' ? 'diamond' : e.roundness ? 'rounded_rectangle' : 'rectangle';
      const fill = fillOf(e);
      const shape = createShape(kind, {
        ...box,
        ...common(e),
        fillColor: fill,
        strokeColor: color(e.strokeColor, 'transparent'),
        strokeWidth: str(e.strokeColor) === 'transparent' ? 0 : Math.max(1, num(e.strokeWidth, 2)),
        strokeStyle: strokeStyle(e.strokeStyle),
        textColor: '#1C1C1E',
        fontSize: 20,
      });
      idMap.set(str(e.id), shape);
      out.push(shape);
      counts.shapes++;
    } else if (type === 'frame' || type === 'magicframe') {
      const frame = createFrame(box, { title: str(e.name) || t('importexport.excalidrawImport.frame') });
      idMap.set(str(e.id), frame);
      out.push(frame);
      counts.frames++;
    } else if (type === 'image') {
      const file = doc.files?.[str(e.fileId)];
      const dataUrl = str(file?.dataURL);
      if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(dataUrl)) {
        const img = createImage({ ...box, ...common(e), dataUrl, naturalWidth: Math.round(box.width), naturalHeight: Math.round(box.height) });
        idMap.set(str(e.id), img);
        out.push(img);
        counts.images++;
      } else {
        warnings.add(t('importexport.excalidrawImport.missingImages'));
      }
    } else if (type === 'freedraw') {
      const pts = Array.isArray(e.points) ? (e.points as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2) : [];
      if (pts.length >= 2) {
        const drawing = createFreehand(
          pts.map(([px, py]) => ({ x: num(e.x) + px, y: num(e.y) + py })),
          { strokeColor: color(e.strokeColor, '#1E1E1E'), strokeWidth: Math.max(1, num(e.strokeWidth, 2) * 1.6), isHighlighter: false },
        );
        const withMeta = { ...drawing, ...common(e), rotation: 0 } as CanvasElement;
        idMap.set(str(e.id), withMeta);
        out.push(withMeta);
        counts.drawings++;
      }
    } else if (type === 'embeddable' || type === 'iframe') {
      warnings.add(t('importexport.excalidrawImport.embedsSkipped'));
    }
  }

  // 2) linhas e setas
  const lookup = (id: string) => out.find((el) => el.id === id);
  for (const e of live) {
    const type = str(e.type);
    if (type !== 'line' && type !== 'arrow') continue;
    const pts = Array.isArray(e.points) ? (e.points as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2) : [];
    if (pts.length < 2) continue;
    const abs = pts.map(([px, py]) => ({ x: num(e.x) + px, y: num(e.y) + py }));
    const first = abs[0];
    const last = abs[abs.length - 1];
    const closed = type === 'line' && pts.length >= 3 && Math.hypot(first.x - last.x, first.y - last.y) < 1;
    if (closed) {
      // polígono fechado: forma com contorno livre
      const minX = Math.min(...abs.map((p) => p.x));
      const minY = Math.min(...abs.map((p) => p.y));
      const w = Math.max(1, Math.max(...abs.map((p) => p.x)) - minX);
      const h = Math.max(1, Math.max(...abs.map((p) => p.y)) - minY);
      const d = serializePath([...abs.map((p, i) => ({ c: i === 0 ? 'M' : 'L', p: [p.x - minX, p.y - minY] }) as { c: 'M' | 'L'; p: [number, number] }), { c: 'Z' as const }]);
      out.push(
        createShape('rectangle', {
          x: minX,
          y: minY,
          width: w,
          height: h,
          ...common(e),
          rotation: 0,
          customPath: d,
          customPathBox: { width: w, height: h },
          fillColor: fillOf(e),
          strokeColor: color(e.strokeColor, '#1E1E1E'),
          strokeWidth: Math.max(1, num(e.strokeWidth, 2)),
          strokeStyle: strokeStyle(e.strokeStyle),
        }),
      );
      counts.shapes++;
      continue;
    }
    const endpoint = (binding: unknown, p: { x: number; y: number }) => {
      const target = binding && typeof binding === 'object' ? idMap.get(str((binding as Raw).elementId)) : undefined;
      if (target && isConnectable(target)) {
        const anchor = nearestSide(target, p);
        const a = getAnchorPoint(target, anchor);
        return { elementId: target.id, anchor, x: a.x, y: a.y };
      }
      return { elementId: null, anchor: 'center' as AnchorSide, x: p.x, y: p.y };
    };
    const start = endpoint(e.startBinding, first);
    const end = endpoint(e.endBinding, last);
    const conn = createConnector(
      start,
      end,
      {
        routingType: e.elbowed ? 'orthogonal' : abs.length === 2 && e.roundness ? 'curved' : 'straight',
        strokeColor: color(e.strokeColor, '#1E1E1E'),
        strokeWidth: Math.max(1, num(e.strokeWidth, 2)),
        strokeStyle: strokeStyle(e.strokeStyle),
        startArrow: arrowHead(e.startArrowhead),
        endArrow: type === 'arrow' && e.endArrowhead === undefined ? 'arrow' : arrowHead(e.endArrowhead),
      },
      lookup,
    );
    const placed = { ...conn, ...(abs.length > 2 && !e.elbowed ? { waypoints: abs.slice(1, -1) } : {}), groupId: groupOf(e), opacity: common(e).opacity } as CanvasElement;
    idMap.set(str(e.id), placed);
    out.push(placed);
    counts.connectors++;
  }

  // 3) textos: dentro de forma/linha viram o texto dela; soltos viram objetos de texto
  for (const e of live) {
    if (str(e.type) !== 'text') continue;
    const text = str(e.originalText) || str(e.text);
    if (!text.trim()) continue;
    const container = idMap.get(str(e.containerId));
    const fontSize = Math.max(6, num(e.fontSize, 20));
    const fontName = fontFor(e.fontFamily);
    const align = e.textAlign === 'center' ? 'center' : e.textAlign === 'right' ? 'right' : 'left';
    const textColor = color(e.strokeColor, '#1E1E1E');
    if (container && container.type === 'shape') {
      const i = out.indexOf(container);
      out[i] = { ...container, text, fontSize, fontName, textColor, textAlign: align } as CanvasElement;
      idMap.set(container.id, out[i]);
      continue;
    }
    if (container && container.type === 'connector') {
      const i = out.indexOf(container);
      out[i] = { ...container, label: text } as CanvasElement;
      continue;
    }
    out.push(
      createText({
        x: num(e.x),
        y: num(e.y),
        width: Math.max(20, num(e.width, 100)),
        height: Math.max(fontSize, num(e.height, fontSize * 1.3)),
        ...common(e),
        text,
        fontSize,
        fontName,
        textColor,
        textAlign: align,
      }),
    );
    counts.texts++;
  }
  return { elements: out, counts, warnings: Array.from(warnings) };
}

export function describeExcalidrawCounts(c: ExcalidrawImportResult['counts']): string {
  const parts: string[] = [];
  if (c.shapes) parts.push(formatCount('shape', c.shapes));
  if (c.connectors) parts.push(formatCount('line', c.connectors));
  if (c.texts) parts.push(formatCount('text', c.texts));
  if (c.drawings) parts.push(formatCount('drawing', c.drawings));
  if (c.images) parts.push(formatCount('image', c.images));
  if (c.frames) parts.push(formatCount('frame', c.frames));
  return formatList(parts, 'unit') || t('importexport.excalidrawImport.nothingDrawable');
}
