/**
 * LuDraw — Mapa mental nativo (Chat 03 · Rodada A): estrutura, auto-layout e desenho.
 *
 * Um `MindMapElement` é UM elemento do board com uma árvore de nós (`nodes`, ordem do array =
 * ordem dos irmãos). Este módulo é puro (sem store): operações de árvore devolvem um novo
 * array de nós e `layoutMindMap` recalcula posição/tamanho de cada nó e a caixa do elemento,
 * mantendo o nó raiz parado na tela. A mesma geometria serve ao DOM (`MindMapView`) e ao
 * export (`drawMindMapToCanvas`).
 *
 * Layout:
 *  - horizontal: ramos de 1º nível alternam direita/esquerda da raiz (lado fixado na criação,
 *    `side`, para não "pularem" quando outro ramo some); cada subárvore ocupa uma faixa
 *    vertical própria → sem sobreposição;
 *  - vertical: a árvore cresce para baixo; cada subárvore ocupa uma faixa horizontal própria.
 * Ramos recolhidos (`collapsed`) ocupam só o tamanho do próprio nó.
 */

import type { MindMapElement, MindMapNodeItem } from '../types/canvas';
import type { ThemeMode } from '../types/workspace';
import { mix } from './color';
import { createId } from './id';
import { measureTextWidth, wrapText } from './text';
import { pathFromSvg } from './path2d';
import { t } from '../i18n';

/* -------------------------------------------------------------------------- */
/*  Aparência                                                                 */
/* -------------------------------------------------------------------------- */

export const MINDMAP_ROOT_FILL = '#194B32';
export const MINDMAP_ROOT_TEXT = '#D0E4AE';
export const MINDMAP_NODE_TEXT = '#1C1C1E';
/** Cores dos ramos (subconjunto de TAG_COLORS — conteúdo do board, iguais nos dois temas). */
export const MINDMAP_BRANCH_COLORS = ['#3A8156', '#2C64A8', '#C2412D', '#8C4A7A', '#E0A21B', '#0F766E', '#6B4FD8', '#D9467A'];
/** Texto de espera de um nó vazio (no idioma ativo; não é gravado no board). */
export function mindmapPlaceholder(): string {
  return t('widgets.mindMapView.newIdea');
}
export function mindmapRootPlaceholder(): string {
  return t('widgets.mindMapView.centralIdea');
}

const FONT_STACK = 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif';

interface LevelStyle {
  font: string;
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  minWidth: number;
  maxTextWidth: number;
  radius: number;
  border: number;
}

const ROOT_STYLE: LevelStyle = { font: `700 20px ${FONT_STACK}`, fontSize: 20, lineHeight: 26, padX: 24, padY: 15, minWidth: 140, maxTextWidth: 260, radius: 28, border: 0 };
const L1_STYLE: LevelStyle = { font: `600 16px ${FONT_STACK}`, fontSize: 16, lineHeight: 21, padX: 16, padY: 9, minWidth: 72, maxTextWidth: 220, radius: 14, border: 2 };
const L2_STYLE: LevelStyle = { font: `500 14px ${FONT_STACK}`, fontSize: 14, lineHeight: 19, padX: 12, padY: 7, minWidth: 56, maxTextWidth: 200, radius: 11, border: 1.5 };

export function levelStyle(depth: number): LevelStyle {
  return depth === 0 ? ROOT_STYLE : depth === 1 ? L1_STYLE : L2_STYLE;
}

/** Fundo claro do nó, tingido com a cor do ramo. */
export function nodeFill(node: MindMapNodeItem, depth: number): string {
  if (depth === 0) return MINDMAP_ROOT_FILL;
  return mix(node.color, '#FFFFFF', depth === 1 ? 0.84 : 0.9);
}

export function nodeTextColor(depth: number): string {
  return depth === 0 ? MINDMAP_ROOT_TEXT : MINDMAP_NODE_TEXT;
}

/** Linhas do texto já quebradas (as mesmas no DOM e no export). */
export function nodeLines(node: MindMapNodeItem, depth: number): string[] {
  const st = levelStyle(depth);
  const text = node.text.trim() ? node.text : depth === 0 ? mindmapRootPlaceholder() : mindmapPlaceholder();
  return wrapText(text, st.maxTextWidth, st.font);
}

export function measureNode(node: MindMapNodeItem, depth: number): { width: number; height: number } {
  const st = levelStyle(depth);
  const lines = nodeLines(node, depth);
  const textW = Math.max(...lines.map((l) => measureTextWidth(l, st.font)), 1);
  return {
    width: Math.ceil(Math.max(st.minWidth, textW + st.padX * 2 + st.border * 2)),
    height: Math.ceil(lines.length * st.lineHeight + st.padY * 2 + st.border * 2),
  };
}

/* -------------------------------------------------------------------------- */
/*  Árvore                                                                     */
/* -------------------------------------------------------------------------- */

export type NodeSide = 'left' | 'right';
type SidedNode = MindMapNodeItem;

export function rootNode(nodes: MindMapNodeItem[]): MindMapNodeItem | undefined {
  return nodes.find((n) => n.parentId === null) ?? nodes[0];
}

export function childrenOf(nodes: MindMapNodeItem[], id: string): MindMapNodeItem[] {
  return nodes.filter((n) => n.parentId === id);
}

export function depthOf(nodes: MindMapNodeItem[], id: string): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let d = 0;
  let cur = byId.get(id);
  while (cur && cur.parentId) {
    d++;
    cur = byId.get(cur.parentId);
    if (d > 512) break; // proteção contra ciclos em dados corrompidos
  }
  return d;
}

export function subtreeIds(nodes: MindMapNodeItem[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Nó escondido porque algum ancestral está recolhido. */
export function isHiddenNode(nodes: MindMapNodeItem[], id: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  let guard = 0;
  while (cur && cur.parentId && guard++ < 512) {
    const parent = byId.get(cur.parentId);
    if (!parent) return false;
    if (parent.collapsed) return true;
    cur = parent;
  }
  return false;
}

export function visibleNodes(nodes: MindMapNodeItem[]): MindMapNodeItem[] {
  return nodes.filter((n) => !isHiddenNode(nodes, n.id));
}

/** Lado (horizontal) do ramo de 1º nível ao qual o nó pertence. */
export function sideOf(nodes: MindMapNodeItem[], id: string): NodeSide {
  const byId = new Map(nodes.map((n) => [n.id, n as SidedNode]));
  let cur = byId.get(id);
  let guard = 0;
  while (cur && cur.parentId && guard++ < 512) {
    const parent = byId.get(cur.parentId);
    if (!parent || parent.parentId === null) return cur.side ?? 'right';
    cur = parent;
  }
  return 'right';
}

export function createMindMapNode(parentId: string | null, text: string, color: string, extra: Partial<SidedNode> = {}): SidedNode {
  return { id: createId(8), parentId, text, color, collapsed: false, offsetX: 0, offsetY: 0, ...extra };
}

/** Adiciona um filho no fim da lista de filhos de `parentId` (e expande o pai). */
export function addChildNode(el: MindMapElement, parentId: string, text = ''): { nodes: MindMapNodeItem[]; id: string } {
  const parent = el.nodes.find((n) => n.id === parentId);
  if (!parent) return { nodes: el.nodes, id: '' };
  let node: SidedNode;
  if (parent.parentId === null) {
    const top = childrenOf(el.nodes, parent.id) as SidedNode[];
    const right = top.filter((n) => (n.side ?? 'right') === 'right').length;
    const left = top.length - right;
    node = createMindMapNode(parent.id, text, MINDMAP_BRANCH_COLORS[top.length % MINDMAP_BRANCH_COLORS.length], { side: right <= left ? 'right' : 'left' });
  } else {
    node = createMindMapNode(parent.id, text, parent.color);
  }
  // insere logo depois do último descendente do pai (mantém a lista agrupada por ramo)
  const block = subtreeIds(el.nodes, parent.id);
  let insertAt = 0;
  el.nodes.forEach((n, i) => {
    if (block.has(n.id)) insertAt = i + 1;
  });
  const nodes = el.nodes.map((n) => (n.id === parent.id && n.collapsed ? { ...n, collapsed: false } : n));
  nodes.splice(insertAt, 0, node);
  return { nodes, id: node.id };
}

/** Irmão logo abaixo/à direita de `nodeId` (na raiz, vira filho). */
export function addSiblingNode(el: MindMapElement, nodeId: string, text = ''): { nodes: MindMapNodeItem[]; id: string } {
  const node = el.nodes.find((n) => n.id === nodeId) as SidedNode | undefined;
  if (!node) return { nodes: el.nodes, id: '' };
  if (node.parentId === null) return addChildNode(el, node.id, text);
  const parent = el.nodes.find((n) => n.id === node.parentId);
  const isTop = parent?.parentId === null;
  const color = isTop ? MINDMAP_BRANCH_COLORS[childrenOf(el.nodes, node.parentId).length % MINDMAP_BRANCH_COLORS.length] : node.color;
  const sibling = createMindMapNode(node.parentId, text, color, isTop ? { side: node.side ?? 'right' } : {});
  const block = subtreeIds(el.nodes, node.id);
  let insertAt = 0;
  el.nodes.forEach((n, i) => {
    if (block.has(n.id)) insertAt = i + 1;
  });
  const nodes = [...el.nodes];
  nodes.splice(insertAt, 0, sibling);
  return { nodes, id: sibling.id };
}

/** Remove o nó e todo o seu ramo. Devolve o nó que deve ficar ativo (irmão anterior, próximo ou pai). */
export function removeBranch(el: MindMapElement, nodeId: string): { nodes: MindMapNodeItem[]; nextActive: string | null } {
  const node = el.nodes.find((n) => n.id === nodeId);
  if (!node || node.parentId === null) return { nodes: el.nodes, nextActive: node?.id ?? null };
  const siblings = childrenOf(el.nodes, node.parentId);
  const i = siblings.findIndex((n) => n.id === nodeId);
  const nextActive = siblings[i - 1]?.id ?? siblings[i + 1]?.id ?? node.parentId;
  const drop = subtreeIds(el.nodes, nodeId);
  return { nodes: el.nodes.filter((n) => !drop.has(n.id)), nextActive };
}

export function setNodeText(nodes: MindMapNodeItem[], id: string, text: string): MindMapNodeItem[] {
  return nodes.map((n) => (n.id === id ? { ...n, text } : n));
}

export function setNodeCollapsed(nodes: MindMapNodeItem[], id: string, collapsed: boolean): MindMapNodeItem[] {
  return nodes.map((n) => (n.id === id ? { ...n, collapsed } : n));
}

/** Recolhe/expande todos os ramos que têm filhos (a raiz nunca recolhe). */
export function setAllCollapsed(nodes: MindMapNodeItem[], collapsed: boolean): MindMapNodeItem[] {
  const parents = new Set(nodes.map((n) => n.parentId).filter((p): p is string => !!p));
  return nodes.map((n) => (n.parentId !== null && parents.has(n.id) ? { ...n, collapsed } : n.parentId === null ? { ...n, collapsed: false } : n));
}

/* -------------------------------------------------------------------------- */
/*  Auto-layout                                                                */
/* -------------------------------------------------------------------------- */

const H_LEVEL_GAP = 64;
const H_SIBLING_GAP = 14;
const V_LEVEL_GAP = 56;
const V_SIBLING_GAP = 18;
/** Margem interna da caixa do elemento (cabe o botão de recolher/expandir). */
export const MINDMAP_PAD = 24;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Recalcula `offsetX/offsetY/width/height` de todos os nós e a caixa do elemento.
 * O canto superior esquerdo da raiz fica no mesmo ponto do mundo (o mapa cresce em volta dela).
 */
export function layoutMindMap(el: MindMapElement): Pick<MindMapElement, 'nodes' | 'x' | 'y' | 'width' | 'height'> {
  const nodes = el.nodes;
  const root = rootNode(nodes);
  if (!root) return { nodes, x: el.x, y: el.y, width: Math.max(el.width, 1), height: Math.max(el.height, 1) };
  const rootWorld = { x: el.x + (root.offsetX || 0), y: el.y + (root.offsetY || 0) };

  const kids = new Map<string, MindMapNodeItem[]>();
  for (const n of nodes) if (n.parentId) (kids.get(n.parentId) ?? kids.set(n.parentId, []).get(n.parentId)!).push(n);
  const depth = new Map<string, number>();
  const walkDepth = (id: string, d: number) => {
    depth.set(id, d);
    for (const c of kids.get(id) ?? []) if (!depth.has(c.id)) walkDepth(c.id, d + 1);
  };
  walkDepth(root.id, 0);
  const size = new Map<string, { width: number; height: number }>();
  for (const n of nodes) size.set(n.id, measureNode(n, depth.get(n.id) ?? 1));
  const open = (id: string) => !nodes.find((n) => n.id === id)?.collapsed;
  const vis = (id: string) => (open(id) ? kids.get(id) ?? [] : []);

  const box = new Map<string, Box>();
  const horizontal = el.layoutDirection !== 'vertical';

  if (horizontal) {
    const span = new Map<string, number>();
    const spanOf = (id: string): number => {
      const cached = span.get(id);
      if (cached !== undefined) return cached;
      const ch = vis(id);
      const own = size.get(id)!.height;
      const sum = ch.reduce((acc, c) => acc + spanOf(c.id), 0) + Math.max(0, ch.length - 1) * H_SIBLING_GAP;
      const v = Math.max(own, sum);
      span.set(id, v);
      return v;
    };
    const place = (id: string, x: number, centerY: number, dir: 1 | -1) => {
      const s = size.get(id)!;
      box.set(id, { x, y: centerY - s.height / 2, w: s.width, h: s.height });
      const ch = vis(id);
      if (!ch.length) return;
      const total = ch.reduce((acc, c) => acc + spanOf(c.id), 0) + (ch.length - 1) * H_SIBLING_GAP;
      let y = centerY - total / 2;
      for (const c of ch) {
        const sp = spanOf(c.id);
        const cs = size.get(c.id)!;
        const cx = dir > 0 ? x + s.width + H_LEVEL_GAP : x - H_LEVEL_GAP - cs.width;
        place(c.id, cx, y + sp / 2, dir);
        y += sp + H_SIBLING_GAP;
      }
    };
    const rs = size.get(root.id)!;
    box.set(root.id, { x: 0, y: -rs.height / 2, w: rs.width, h: rs.height });
    const top = vis(root.id) as SidedNode[];
    for (const side of ['right', 'left'] as const) {
      const group = top.filter((n) => (n.side ?? 'right') === side);
      if (!group.length) continue;
      const total = group.reduce((acc, c) => acc + spanOf(c.id), 0) + (group.length - 1) * H_SIBLING_GAP;
      let y = -total / 2;
      for (const c of group) {
        const sp = spanOf(c.id);
        const cs = size.get(c.id)!;
        const cx = side === 'right' ? rs.width + H_LEVEL_GAP : -H_LEVEL_GAP - cs.width;
        place(c.id, cx, y + sp / 2, side === 'right' ? 1 : -1);
        y += sp + H_SIBLING_GAP;
      }
    }
  } else {
    const span = new Map<string, number>();
    const spanOf = (id: string): number => {
      const cached = span.get(id);
      if (cached !== undefined) return cached;
      const ch = vis(id);
      const own = size.get(id)!.width;
      const sum = ch.reduce((acc, c) => acc + spanOf(c.id), 0) + Math.max(0, ch.length - 1) * V_SIBLING_GAP;
      const v = Math.max(own, sum);
      span.set(id, v);
      return v;
    };
    const place = (id: string, centerX: number, y: number) => {
      const s = size.get(id)!;
      box.set(id, { x: centerX - s.width / 2, y, w: s.width, h: s.height });
      const ch = vis(id);
      if (!ch.length) return;
      const total = ch.reduce((acc, c) => acc + spanOf(c.id), 0) + (ch.length - 1) * V_SIBLING_GAP;
      let x = centerX - total / 2;
      for (const c of ch) {
        const sp = spanOf(c.id);
        place(c.id, x + sp / 2, y + s.height + V_LEVEL_GAP);
        x += sp + V_SIBLING_GAP;
      }
    };
    place(root.id, size.get(root.id)!.width / 2, 0);
  }

  // Nós escondidos (ramo recolhido) ficam "atrás" do ancestral visível
  for (const n of nodes) {
    if (box.has(n.id)) continue;
    let anc = n.parentId;
    while (anc && !box.has(anc)) anc = nodes.find((m) => m.id === anc)?.parentId ?? null;
    const b = anc ? box.get(anc)! : { x: 0, y: 0, w: 0, h: 0 };
    const s = size.get(n.id)!;
    box.set(n.id, { x: b.x, y: b.y, w: s.width, h: s.height });
  }

  // Caixa dos nós visíveis → normaliza para (MINDMAP_PAD, MINDMAP_PAD)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (isHiddenNode(nodes, n.id)) continue;
    const b = box.get(n.id)!;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const dx = MINDMAP_PAD - minX;
  const dy = MINDMAP_PAD - minY;
  const laid = nodes.map((n) => {
    const b = box.get(n.id)!;
    return { ...n, offsetX: Math.round((b.x + dx) * 100) / 100, offsetY: Math.round((b.y + dy) * 100) / 100, width: b.w, height: b.h };
  });
  const newRoot = laid.find((n) => n.id === root.id)!;
  return {
    nodes: laid,
    x: rootWorld.x - newRoot.offsetX,
    y: rootWorld.y - newRoot.offsetY,
    width: maxX - minX + MINDMAP_PAD * 2,
    height: maxY - minY + MINDMAP_PAD * 2,
  };
}

/* -------------------------------------------------------------------------- */
/*  Ligações (curvas suaves)                                                   */
/* -------------------------------------------------------------------------- */

export interface MindMapEdge {
  id: string;
  d: string;
  color: string;
  width: number;
}

function nodeBox(n: MindMapNodeItem): Box {
  return { x: n.offsetX, y: n.offsetY, w: n.width ?? 80, h: n.height ?? 36 };
}

/** Curvas pai → filho em coordenadas do elemento (Bézier cúbica com tangentes no eixo do layout). */
export function mindMapEdges(el: MindMapElement): MindMapEdge[] {
  const byId = new Map(el.nodes.map((n) => [n.id, n]));
  const horizontal = el.layoutDirection !== 'vertical';
  const out: MindMapEdge[] = [];
  for (const n of el.nodes) {
    if (!n.parentId) continue;
    const p = byId.get(n.parentId);
    if (!p || isHiddenNode(el.nodes, n.id)) continue;
    const a = nodeBox(p);
    const b = nodeBox(n);
    const fromRoot = p.parentId === null;
    let d: string;
    if (horizontal) {
      const right = b.x + b.w / 2 >= a.x + a.w / 2;
      const sx = fromRoot ? a.x + a.w / 2 + (right ? a.w / 2 - 6 : -a.w / 2 + 6) : right ? a.x + a.w : a.x;
      const sy = a.y + a.h / 2;
      const ex = right ? b.x : b.x + b.w;
      const ey = b.y + b.h / 2;
      const k = Math.max(24, Math.abs(ex - sx) * 0.55);
      d = `M ${sx} ${sy} C ${sx + (right ? k : -k)} ${sy} ${ex + (right ? -k : k)} ${ey} ${ex} ${ey}`;
    } else {
      const sx = a.x + a.w / 2;
      const sy = fromRoot ? a.y + a.h - 6 : a.y + a.h;
      const ex = b.x + b.w / 2;
      const ey = b.y;
      const k = Math.max(20, Math.abs(ey - sy) * 0.55);
      d = `M ${sx} ${sy} C ${sx} ${sy + k} ${ex} ${ey - k} ${ex} ${ey}`;
    }
    out.push({ id: n.id, d, color: n.color, width: fromRoot ? 3 : 2 });
  }
  return out;
}

/** Ponto onde fica o botão de recolher/expandir do nó (lado para onde crescem os filhos). */
export function toggleAnchor(el: MindMapElement, n: MindMapNodeItem): { x: number; y: number } {
  const b = nodeBox(n);
  if (el.layoutDirection === 'vertical') return { x: b.x + b.w / 2, y: b.y + b.h + 10 };
  const side = n.parentId === null ? 'right' : sideOf(el.nodes, n.id);
  return side === 'right' ? { x: b.x + b.w + 10, y: b.y + b.h / 2 } : { x: b.x - 10, y: b.y + b.h / 2 };
}

/* -------------------------------------------------------------------------- */
/*  Export (Canvas 2D)                                                         */
/* -------------------------------------------------------------------------- */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Desenha o mapa com a origem do contexto no canto (x, y) do elemento. */
export function drawMindMapToCanvas(ctx: CanvasRenderingContext2D, el: MindMapElement, theme: ThemeMode): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const e of mindMapEdges(el)) {
    ctx.strokeStyle = e.color;
    ctx.lineWidth = e.width;
    ctx.stroke(pathFromSvg(e.d));
  }
  const childCount = new Map<string, number>();
  for (const n of el.nodes) if (n.parentId) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  for (const n of el.nodes) {
    if (isHiddenNode(el.nodes, n.id)) continue;
    const d = depthOf(el.nodes, n.id);
    const st = levelStyle(d);
    const b = nodeBox(n);
    ctx.save();
    ctx.shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(20,36,26,0.12)';
    ctx.shadowBlur = d === 0 ? 14 : 6;
    ctx.shadowOffsetY = d === 0 ? 4 : 2;
    roundRect(ctx, b.x, b.y, b.w, b.h, st.radius);
    ctx.fillStyle = nodeFill(n, d);
    ctx.fill();
    ctx.restore();
    if (st.border) {
      roundRect(ctx, b.x + st.border / 2, b.y + st.border / 2, b.w - st.border, b.h - st.border, st.radius);
      ctx.lineWidth = st.border;
      ctx.strokeStyle = n.color;
      ctx.stroke();
    }
    ctx.font = st.font;
    ctx.fillStyle = nodeTextColor(d);
    ctx.globalAlpha = n.text.trim() ? 1 : 0.5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = nodeLines(n, d);
    const top = b.y + (b.h - lines.length * st.lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, b.x + b.w / 2, top + st.lineHeight * (i + 0.5)));
    ctx.globalAlpha = 1;
    // ramo recolhido: selo "+N" no lado dos filhos
    if (n.collapsed && childCount.get(n.id)) {
      const t = toggleAnchor(el, n);
      const label = `+${subtreeIds(el.nodes, n.id).size - 1}`;
      ctx.font = `700 11px ${FONT_STACK}`;
      const w = Math.max(20, measureTextWidth(label, ctx.font) + 10);
      roundRect(ctx, t.x - w / 2, t.y - 10, w, 20, 10);
      ctx.fillStyle = n.parentId === null ? MINDMAP_ROOT_FILL : n.color;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, t.x, t.y + 0.5);
    }
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
