/**
 * LuDraw — Frames (Chat 03 · Rodada B): regras puras (sem store/DOM).
 *
 * - Proporções (`ratioPreset`) e tamanhos padrão de criação.
 * - Parenting: um elemento pertence ao frame que contém o seu CENTRO (frames não se aninham;
 *   conectores não têm pai — seguem as pontas). `computeReparent` devolve só os patches que mudam.
 * - Conteúdo oculto (`hiddenContent`): uma regra única para tela, export, miniaturas e busca.
 * - Ordem de apresentação (`slideOrder`).
 */

import type { CanvasElement, FrameElement } from '../types/canvas';
import { getElementBounds, getElementCenter, rectContainsPoint, rectContainsRect, type Rect } from './math';
import { t } from '../i18n';

export type FrameRatio = FrameElement['ratioPreset'];

export interface FrameRatioInfo {
  id: FrameRatio;
  label: string;
  /** largura / altura (null = livre) */
  ratio: number | null;
  /** tamanho padrão em unidades de mundo (clique sem arrastar) */
  size: { width: number; height: number };
}

export const FRAME_RATIOS: FrameRatioInfo[] = [
  { id: 'free', get label() { return t('widgets.frames.free'); }, ratio: null, size: { width: 800, height: 520 } },
  { id: '16:9', label: '16:9', ratio: 16 / 9, size: { width: 960, height: 540 } },
  { id: '4:3', label: '4:3', ratio: 4 / 3, size: { width: 800, height: 600 } },
  // Chat 08.2 · C-2 (Cinta → Proporção, §16.2)
  { id: '1:1', label: '1:1', ratio: 1, size: { width: 720, height: 720 } },
  { id: 'a4', label: 'A4', ratio: 210 / 297, size: { width: 595, height: 842 } },
  { id: 'mobile', get label() { return t('widgets.frames.phone'); }, ratio: 390 / 844, size: { width: 390, height: 844 } },
];

export function frameRatioInfo(id: FrameRatio | undefined): FrameRatioInfo {
  return FRAME_RATIOS.find((r) => r.id === id) ?? FRAME_RATIOS[0];
}

/** Cores de fundo sugeridas para frames (conteúdo do board, iguais nos dois temas). */
export const FRAME_FILLS = ['#FFFFFF', '#F4F9EC', '#E7F1D6', '#EEF4E4', '#E3EDF9', '#FBF0DC', '#FBE6E2', '#F1ECFB', '#F4F5F2', '#1F2421'];

export function isFrame(el: CanvasElement | undefined | null): el is FrameElement {
  return !!el && el.type === 'frame';
}

/** Ajusta um retângulo arrastado à proporção do preset (mantém o canto de origem). */
export function constrainToRatio(rect: Rect, origin: { x: number; y: number }, ratio: number | null): Rect {
  if (!ratio) return rect;
  let { width, height } = rect;
  if (width / Math.max(height, 1) > ratio) height = width / ratio;
  else width = height * ratio;
  const x = rect.x < origin.x ? origin.x - width : origin.x;
  const y = rect.y < origin.y ? origin.y - height : origin.y;
  return { x, y, width, height };
}

/** Frames do board na ordem de apresentação (slideOrder, depois ordem de camadas). */
export function orderedFrames(elements: Record<string, CanvasElement>, order: string[]): FrameElement[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return order
    .map((id) => elements[id])
    .filter(isFrame)
    .sort((a, b) => (a.slideOrder ?? 0) - (b.slideOrder ?? 0) || (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

export function nextSlideOrder(elements: Record<string, CanvasElement>): number {
  let max = -1;
  for (const id in elements) {
    const el = elements[id];
    if (isFrame(el)) max = Math.max(max, el.slideOrder ?? 0);
  }
  return max + 1;
}

/** Elementos que podem ter um frame como pai. */
export function canBeFrameChild(el: CanvasElement): boolean {
  return el.type !== 'frame' && el.type !== 'connector';
}

/** Frame (do topo para baixo) que contém o centro do elemento. */
export function containingFrame(el: CanvasElement, frames: FrameElement[]): FrameElement | null {
  const c = getElementCenter(el);
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (rectContainsPoint(getElementBounds(f), c)) return f;
  }
  return null;
}

export function frameChildren(elements: Record<string, CanvasElement>, frameId: string): CanvasElement[] {
  const out: CanvasElement[] = [];
  for (const id in elements) if (elements[id].parentId === frameId) out.push(elements[id]);
  return out;
}

/**
 * Recalcula o `parentId` de `ids` (ou de todos) — devolve só os patches que mudam algo.
 * `adoptInside`: frames que também devem "adotar" elementos soltos totalmente dentro deles
 * (frame recém-criado, movido ou redimensionado).
 */
export function computeReparent(
  elements: Record<string, CanvasElement>,
  order: string[],
  ids?: string[],
  adoptInside: string[] = [],
): { id: string; patch: { parentId: string | null } }[] {
  const frames = order.map((id) => elements[id]).filter(isFrame);
  const patches = new Map<string, string | null>();
  const consider = ids ?? order;
  for (const id of consider) {
    const el = elements[id];
    if (!el || !canBeFrameChild(el)) continue;
    const f = containingFrame(el, frames);
    const next = f ? f.id : null;
    if ((el.parentId ?? null) !== next) patches.set(id, next);
  }
  for (const fid of adoptInside) {
    const frame = elements[fid];
    if (!isFrame(frame)) continue;
    const fb = getElementBounds(frame);
    for (const id of order) {
      const el = elements[id];
      if (!el || !canBeFrameChild(el) || el.parentId || patches.has(id)) continue;
      if (rectContainsRect(fb, getElementBounds(el))) patches.set(id, fid);
    }
  }
  return Array.from(patches, ([id, parentId]) => ({ id, patch: { parentId } }));
}

/** Filhos que ficaram fora do frame (depois de redimensionar). */
export function childrenOutside(elements: Record<string, CanvasElement>, frame: FrameElement): CanvasElement[] {
  const fb = getElementBounds(frame);
  return frameChildren(elements, frame.id).filter((el) => !rectContainsPoint(fb, getElementCenter(el)));
}

/* ----------------------------- Conteúdo oculto ----------------------------- */

/**
 * O elemento está escondido por um frame com `hiddenContent`? Conectores ficam ocultos se
 * qualquer ponta estiver presa a um elemento oculto (não revelam a estrutura escondida).
 */
export function isHiddenByFrame(el: CanvasElement, lookup: (id: string) => CanvasElement | undefined): boolean {
  if (el.type === 'frame') return false;
  if (el.type === 'connector') {
    for (const ep of [el.start, el.end]) {
      const t = ep.elementId ? lookup(ep.elementId) : undefined;
      if (t && t.type !== 'connector' && isHiddenByFrame(t, lookup)) return true;
    }
    return false;
  }
  if (!el.parentId) return false;
  const parent = lookup(el.parentId);
  return isFrame(parent) && !!parent.hiddenContent;
}

/** Filtra uma lista de elementos removendo os ocultos por frames. */
export function withoutFrameHidden(elements: CanvasElement[], lookup?: (id: string) => CanvasElement | undefined): CanvasElement[] {
  const byId = lookup ?? ((id: string) => elements.find((e) => e.id === id));
  return elements.filter((el) => !isHiddenByFrame(el, byId));
}

/** Retângulo do cabeçalho (título) acima do frame, em mundo — mesma regra do DOM e do export. */
export const FRAME_TITLE_HEIGHT = 26;
export function frameTitleFontSize(frame: FrameElement): number {
  return Math.max(12, Math.min(28, Math.round(Math.min(frame.width, frame.height) * 0.035)));
}
