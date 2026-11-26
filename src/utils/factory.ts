/**
 * LuDraw — Factories de elementos.
 * Toda nova propriedade adicionada aos contratos deve ganhar default aqui
 * (regra de retrocompatibilidade do CLAUDE.md §3.5).
 */

import type { CompositeElementData } from '../extensions/types';
import type {
  CompositeElement,
  CanvasElement,
  CommentElement,
  ElementPatch,
  KanbanColumn,
  KanbanElement,
  TableElement,
  FreehandElement,
  FrameElement,
  ImageElement,
  MindMapElement,
  RichTextStyle,
  ShapeElement,
  ShapeKind,
  StickyNoteElement,
  TextElement,
  TextualElement,
} from '../types/canvas';
import { isTextualElement } from '../types/canvas';
import { createId } from './id';
import { getBoundsOfPoints, type Point, type Rect } from './math';
import { DEFAULT_FONT_NAME } from './text';
import { addChildNode, createMindMapNode, layoutMindMap, MINDMAP_ROOT_FILL } from './mindmap';
import { createKanbanCard, createKanbanColumn, kanbanSizePatch } from './kanban';
import { cellKey, TABLE_DEFAULT_COL, TABLE_DEFAULT_ROW, TABLE_MIN_COL, TABLE_MIN_ROW, tableSizePatch } from './table';
import { t } from '../i18n';

/** Texto padrão dos post-its (e da paleta abaixo): contraste ≥ 10:1 com todas as 16 cores. */
export const STICKY_TEXT_COLOR = '#1C1C1E';
/** Texto claro, usado só por post-its escuros gravados antes do Chat 05.5 (`isDarkSticky`). */
export const STICKY_TEXT_COLOR_ON_DARK = '#F4F5F2';

export type StickyColorId =
  | 'rosa-quartzo' | 'coral' | 'pessego' | 'damasco' | 'canario' | 'lima' | 'hortela' | 'jade'
  | 'agua-marinha' | 'celeste' | 'bruma' | 'hortensia' | 'pervinca' | 'lavanda' | 'orquidea' | 'algodao-doce';

export interface StickyColorDef {
  id: StickyColorId;
  /** Nome exibido (pt-BR). */
  name: string;
  hex: string;
}

/**
 * Paleta de post-its — Chat 05.5, definida do zero (decisão do usuário de 05/11/2026).
 * Método: 16 matizes a cada 22,5° no espaço OKLCH (de 12,5° a 350°), claridade pastel (L 0,835–0,935)
 * alternando um tom mais claro e um mais denso para que vizinhas não se confundam (ΔE OKLab ≥ 0,038),
 * croma limitado à gama sRGB. Contraste do texto `#1C1C1E`: de 10,1:1 a 14,2:1 (WCAG AA exige 4,5:1);
 * sobre o canvas escuro (`#16161A`) cada nota tem contraste ≥ 10,7:1. Valores e conferência no
 * `DESIGN_SYSTEM.md` §2.1. Post-its já gravados mantêm a cor salva (nada é migrado).
 * Ordem = volta no círculo cromático; os seletores mostram 2 colunas × 8 linhas ou 8 colunas × 2 linhas.
 */
export const STICKY_PALETTE: readonly StickyColorDef[] = [
  { id: 'rosa-quartzo', get name() { return t('board.stickyColors.roseQuartz'); }, hex: '#FFC2C8' },
  { id: 'coral', get name() { return t('board.stickyColors.coral'); }, hex: '#FFB6A3' },
  { id: 'pessego', get name() { return t('board.stickyColors.peach'); }, hex: '#FFDDC5' },
  { id: 'damasco', get name() { return t('board.stickyColors.apricot'); }, hex: '#FFCF7E' },
  { id: 'canario', get name() { return t('board.stickyColors.canary'); }, hex: '#FBED7C' },
  { id: 'lima', get name() { return t('board.stickyColors.lime'); }, hex: '#CEF092' },
  { id: 'hortela', get name() { return t('board.stickyColors.mint'); }, hex: '#BCF8C2' },
  { id: 'jade', get name() { return t('board.stickyColors.jade'); }, hex: '#9EEACF' },
  { id: 'agua-marinha', get name() { return t('board.stickyColors.aquamarine'); }, hex: '#AAF7F3' },
  { id: 'celeste', get name() { return t('board.stickyColors.sky'); }, hex: '#88E0F6' },
  { id: 'bruma', get name() { return t('board.stickyColors.mist'); }, hex: '#C4E7FE' },
  { id: 'hortensia', get name() { return t('board.stickyColors.hydrangea'); }, hex: '#AACAFF' },
  { id: 'pervinca', get name() { return t('board.stickyColors.periwinkle'); }, hex: '#D6D9FF' },
  { id: 'lavanda', get name() { return t('board.stickyColors.lavender'); }, hex: '#DBBFFE' },
  { id: 'orquidea', get name() { return t('board.stickyColors.orchid'); }, hex: '#FAC7F8' },
  { id: 'algodao-doce', get name() { return t('board.stickyColors.cottonCandy'); }, hex: '#FFB9D9' },
];

/** Hex das 16 cores, na ordem da paleta (usado pelos seletores). */
export const STICKY_COLORS: string[] = STICKY_PALETTE.map((c) => c.hex);

const STICKY_BY_ID = new Map(STICKY_PALETTE.map((c) => [c.id, c.hex] as const));
const STICKY_NAME_BY_HEX = new Map(STICKY_PALETTE.map((c) => [c.hex.toLowerCase(), c.name] as const));

/** Hex de uma cor da paleta pelo id — para conteúdo embutido (templates, boas-vindas, demonstração). */
export function stickyColor(id: StickyColorId): string {
  return STICKY_BY_ID.get(id) ?? DEFAULT_STICKY_COLOR;
}

/** Nome pt-BR de uma cor da paleta; para cores fora dela (gravadas antes ou personalizadas), o próprio hex. */
export function stickyColorName(hex: string): string {
  return STICKY_NAME_BY_HEX.get(hex.toLowerCase()) ?? hex.toUpperCase();
}

/** Canário — cor padrão de post-it novo. */
export const DEFAULT_STICKY_COLOR = '#FBED7C';

/** Paleta de cores de texto/contorno (6 linhas × 4) — imagem 19 do briefing. */
export const INK_COLORS: string[] = [
  '#FFF3A3', '#FFD84D', '#B07D0A', '#FFFFFF',
  '#F9CDAA', '#FF9C4A', '#9A4A0E', '#E6E7E3',
  '#FFC2C2', '#F25F5C', '#B3171C', '#A9ADA8',
  '#B8EBC7', '#2DBE60', '#1A6B3A', '#5B605C',
  '#C5DBFF', '#5B9BF5', '#2A57B0', '#1C1C1E',
  '#E0D8FF', '#9D84F2', '#6634D9', '#194B32',
];

/** Cores de marca-texto (realce). */
export const HIGHLIGHT_COLORS: string[] = ['#FFF176', '#FFD0A8', '#FFB3C7', '#C8F0B4', '#B9DCFF', '#DCCBFF'];

/** Cores de preenchimento para formas/texto (inclui transparente). */
export const FILL_COLORS: string[] = [
  'transparent', '#FFFFFF', '#F4F5F2', '#1F2421',
  '#FFF6A5', '#FFC58F', '#FF9F8F', '#FFD0EC',
  '#BFD5FF', '#A7E6FA', '#8FE3D3', '#D9EDA8',
  '#D0E4AE', '#5FA067', '#194B32', '#BBA9FF',
];

const now = () => Date.now();

function base(type: CanvasElement['type'], partial: { x: number; y: number; width: number; height: number }) {
  const t = now();
  return {
    id: createId(),
    type,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    rotation: 0,
    zIndex: 0,
    parentId: null,
    groupId: null,
    locked: false,
    opacity: 1,
    createdAt: t,
    updatedAt: t,
  };
}

/**
 * Post-it escuro. A paleta atual (Chat 05.5) não tem cor escura; continua valendo para boards
 * gravados com a paleta antiga (`#1F2421`) e para `#1E1E1E`, que recebem texto claro.
 */
export function isDarkSticky(color: string): boolean {
  return color.toLowerCase() === '#1f2421' || color.toLowerCase() === '#1e1e1e';
}

/** Cor de texto padrão de um post-it (quando `textColor` não está gravado). Mesma regra na tela e no export. */
export function stickyTextColor(color: string): string {
  return isDarkSticky(color) ? STICKY_TEXT_COLOR_ON_DARK : STICKY_TEXT_COLOR;
}

export function createStickyNote(partial: Partial<StickyNoteElement> & { x: number; y: number }): StickyNoteElement {
  const size = partial.width ?? 200;
  const color = partial.color ?? DEFAULT_STICKY_COLOR;
  return {
    ...base('sticky', { x: partial.x, y: partial.y, width: size, height: partial.height ?? size }),
    text: '',
    color,
    textColor: stickyTextColor(color),
    fontSize: 'auto',
    textAlign: 'center',
    fontName: DEFAULT_FONT_NAME,
    fontWeight: 'normal',
    fontStyle: 'normal',
    tags: [],
    reactions: {},
    votes: 0,
    ...partial,
    type: 'sticky',
  } as StickyNoteElement;
}

export function createShape(kind: ShapeKind, partial: Partial<ShapeElement> & { x: number; y: number }): ShapeElement {
  return {
    ...base('shape', { x: partial.x, y: partial.y, width: partial.width ?? 200, height: partial.height ?? 200 }),
    shapeKind: kind,
    text: '',
    fillColor: '#FFFFFF',
    strokeColor: '#1C1C1E',
    strokeWidth: 2,
    strokeStyle: 'solid',
    textColor: '#1C1C1E',
    fontSize: 16,
    textAlign: 'center',
    fontName: DEFAULT_FONT_NAME,
    fontWeight: 'normal',
    fontStyle: 'normal',
    ...partial,
    type: 'shape',
  } as ShapeElement;
}

/** Chat 06.5: elemento composto de uma extensão (as peças ficam copiadas no elemento). */
export function createComposite(data: CompositeElementData, rect: Rect): CompositeElement {
  return {
    ...base('composite', rect),
    ...data,
    parts: data.parts.map((p) => ({ ...p })),
    fields: { ...(data.fields ?? {}) },
    type: 'composite',
  } as CompositeElement;
}

export function createText(partial: Partial<TextElement> & { x: number; y: number }): TextElement {
  const fontSize = partial.fontSize ?? 24;
  return {
    ...base('text', { x: partial.x, y: partial.y, width: partial.width ?? 320, height: partial.height ?? Math.ceil(fontSize * 1.4) }),
    text: '',
    fontSize,
    fontFamily: 'sans',
    fontName: DEFAULT_FONT_NAME,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textColor: '#1C1C1E',
    backgroundColor: 'transparent',
    textAlign: 'left',
    ...partial,
    type: 'text',
  } as TextElement;
}

/**
 * Frame (Chat 03 · Rodada B): área nomeada que agrupa o conteúdo que está dentro dela
 * (parenting automático pelo store), vira slide no Modo Apresentação e pode ser exportada.
 */
export function createFrame(rect: Rect, options: Partial<Pick<FrameElement, 'title' | 'fillColor' | 'ratioPreset' | 'slideOrder' | 'hiddenContent'>> = {}): FrameElement {
  return {
    ...base('frame', { x: rect.x, y: rect.y, width: Math.max(40, rect.width), height: Math.max(40, rect.height) }),
    type: 'frame',
    title: options.title ?? t('board.factory.frame'),
    fillColor: options.fillColor ?? '#FFFFFF',
    ratioPreset: options.ratioPreset ?? 'free',
    hiddenContent: options.hiddenContent ?? false,
    slideOrder: options.slideOrder ?? 0,
  } as FrameElement;
}

/**
 * Mapa mental (Chat 03 · Rodada A) centralizado em `center`: raiz + ramos iniciais opcionais,
 * já com auto-layout. Edição e estrutura passam por `utils/mindmapActions.ts`.
 */
export function createMindMap(
  center: Point,
  options: { rootText?: string; branches?: string[]; layoutDirection?: MindMapElement['layoutDirection'] } = {},
): MindMapElement {
  const root = createMindMapNode(null, options.rootText ?? t('board.factory.centralIdea'), MINDMAP_ROOT_FILL);
  let el = {
    ...base('mindmap', { x: center.x, y: center.y, width: 1, height: 1 }),
    type: 'mindmap',
    layoutDirection: options.layoutDirection ?? 'horizontal',
    nodes: [root],
  } as MindMapElement;
  for (const text of options.branches ?? []) el = { ...el, nodes: addChildNode(el, root.id, text).nodes };
  // primeiro layout com a raiz na origem; depois centraliza a raiz em `center`
  const laid = layoutMindMap({ ...el, x: 0, y: 0 });
  const r = laid.nodes.find((n) => n.id === root.id)!;
  const dx = center.x - (laid.x + r.offsetX + (r.width ?? 0) / 2);
  const dy = center.y - (laid.y + r.offsetY + (r.height ?? 0) / 2);
  return { ...el, ...laid, x: laid.x + dx, y: laid.y + dy };
}

/**
 * Kanban (Chat 04) centralizado em `center`. Sem `columns`, nasce com 3 colunas e cards de exemplo.
 * O tamanho vem do layout (`utils/kanban.ts`).
 */
export function createKanban(center: Point, options: { title?: string; columns?: KanbanColumn[]; columnWidth?: number } = {}): KanbanElement {
  const columns =
    options.columns ??
    [
      createKanbanColumn(t('common.toDo'), '#5B605C', [
        createKanbanCard({ title: t('board.factory.describeProblem'), priority: 'high', tags: [t('board.factory.tagDiscovery')], storyPoints: 3 }),
        createKanbanCard({ title: t('board.factory.listHypotheses'), priority: 'medium', storyPoints: 2 }),
      ]),
      createKanbanColumn(t('board.factory.inProgress'), '#2C64A8', [createKanbanCard({ title: t('board.factory.prototypeFirstVersion'), priority: 'medium', tags: ['design'], storyPoints: 5 })]),
      createKanbanColumn(t('board.factory.done'), '#3A8156', [createKanbanCard({ title: t('board.factory.kickoffTeam'), priority: 'low', storyPoints: 1 })]),
    ];
  const draft = { title: options.title ?? t('common.kanbanBoard'), columns, columnWidth: options.columnWidth };
  const size = kanbanSizePatch(draft);
  return {
    ...base('kanban', { x: center.x - size.width / 2, y: center.y - size.height / 2, ...size }),
    type: 'kanban',
    title: draft.title,
    columns,
    ...(options.columnWidth ? { columnWidth: options.columnWidth } : {}),
  } as KanbanElement;
}

/**
 * Tabela (Chat 04) com o canto superior esquerdo em `topLeft`. `data` (opcional) preenche as células
 * linha a linha; a 1ª linha é cabeçalho por padrão.
 */
export function createTable(
  topLeft: Point,
  options: { rows?: number; cols?: number; colWidth?: number; rowHeight?: number; data?: string[][]; headerRow?: boolean; colWidths?: number[] } = {},
): TableElement {
  const rows = Math.max(1, options.rows ?? options.data?.length ?? 4);
  const cols = Math.max(1, options.cols ?? (Math.max(0, ...(options.data ?? []).map((r) => r.length)) || 3));
  const colWidths = Array.from({ length: cols }, (_, c) => Math.max(TABLE_MIN_COL, options.colWidths?.[c] ?? options.colWidth ?? TABLE_DEFAULT_COL));
  const rowHeights = Array.from({ length: rows }, () => Math.max(TABLE_MIN_ROW, options.rowHeight ?? TABLE_DEFAULT_ROW));
  const cells: TableElement['cells'] = {};
  options.data?.forEach((row, r) => row.forEach((text, c) => {
    if (text && r < rows && c < cols) cells[cellKey(r, c)] = { text };
  }));
  const draft = { rows, cols, colWidths, rowHeights, cells, headerRow: options.headerRow ?? true };
  const size = tableSizePatch(draft);
  return {
    ...base('table', { x: topLeft.x, y: topLeft.y, ...size }),
    type: 'table',
    ...draft,
  } as TableElement;
}

/**
 * Pin de comentário (Chat 04): `at` = ponta do pin. Tamanho 0 (desenhado em tamanho fixo de tela).
 * A 1ª mensagem é obrigatória — o store recusa threads vazias.
 */
export function createComment(at: Point, message: CommentElement['messages'][number], targetId: string | null = null): CommentElement {
  return {
    ...base('comment', { x: at.x, y: at.y, width: 0, height: 0 }),
    type: 'comment',
    resolved: false,
    messages: [message],
    targetId,
  } as CommentElement;
}

/** Cria um traço livre a partir de pontos no MUNDO (normaliza para coordenadas relativas). */
/** Imagem embutida (Chat 02 · Rodada A). `dataUrl` já vem comprimido por `utils/images.ts`. */
export function createImage(partial: Partial<ImageElement> & { x: number; y: number; dataUrl: string; naturalWidth: number; naturalHeight: number }): ImageElement {
  return {
    ...base('image', { x: partial.x, y: partial.y, width: partial.width ?? partial.naturalWidth, height: partial.height ?? partial.naturalHeight }),
    alt: '',
    ...partial,
    type: 'image',
  } as ImageElement;
}

export function createFreehand(
  worldPoints: Point[],
  opts: { strokeColor: string; strokeWidth: number; isHighlighter: boolean },
): FreehandElement {
  const pad = opts.strokeWidth / 2 + 1;
  const b = getBoundsOfPoints(worldPoints);
  const x = b.x - pad;
  const y = b.y - pad;
  return {
    ...base('freehand', { x, y, width: Math.max(b.width + pad * 2, 1), height: Math.max(b.height + pad * 2, 1) }),
    points: worldPoints.map((p) => ({ x: p.x - x, y: p.y - y })),
    strokeColor: opts.strokeColor,
    strokeWidth: opts.strokeWidth,
    isHighlighter: opts.isHighlighter,
    type: 'freehand',
  } as FreehandElement;
}

/** Clona elementos com novos IDs (remapeia groupIds para manter grupos independentes). */
export function cloneElements(elements: CanvasElement[], offset: Point = { x: 0, y: 0 }): CanvasElement[] {
  const groupMap = new Map<string, string>();
  const idMap = new Map<string, string>(elements.map((el) => [el.id, createId()]));
  const t = now();
  return elements.map((el) => {
    let groupId = el.groupId ?? null;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, createId());
      groupId = groupMap.get(groupId) ?? null;
    }
    const copy = JSON.parse(JSON.stringify(el)) as CanvasElement;
    if (copy.type === 'connector') {
      // Endpoints ligados a objetos copiados juntos são religados às cópias; os demais ficam soltos.
      const remap = (ep: typeof copy.start) =>
        ep.elementId && idMap.has(ep.elementId)
          ? { ...ep, elementId: idMap.get(ep.elementId) ?? null, x: ep.x + offset.x, y: ep.y + offset.y }
          : { ...ep, elementId: null, x: ep.x + offset.x, y: ep.y + offset.y };
      copy.start = remap(copy.start);
      copy.end = remap(copy.end);
      if (copy.waypoints) copy.waypoints = copy.waypoints.map((w) => ({ x: w.x + offset.x, y: w.y + offset.y }));
    }
    // filhos copiados junto com o frame apontam para a cópia do frame (Chat 03)
    const parentId = el.parentId && idMap.has(el.parentId) ? idMap.get(el.parentId)! : (el.parentId ?? null);
    return { ...copy, id: idMap.get(el.id) ?? createId(), x: el.x + offset.x, y: el.y + offset.y, groupId, parentId, createdAt: t, updatedAt: t } as CanvasElement;
  });
}

/**
 * Patch de redimensionamento: além de x/y/w/h, escala os pontos de traços livres
 * e o tamanho da fonte de textos quando redimensionados pelos cantos.
 */
export function resizePatch(original: CanvasElement, rect: Rect, scaleFont: boolean): ElementPatch {
  const patch: ElementPatch = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const sx = original.width === 0 ? 1 : rect.width / original.width;
  const sy = original.height === 0 ? 1 : rect.height / original.height;
  if (original.type === 'connector') return {};
  if (original.type === 'freehand') {
    patch.points = original.points.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy }));
  }
  if (original.type === 'text' && scaleFont) {
    patch.fontSize = Math.max(4, Math.round(original.fontSize * sy * 10) / 10);
  }
  if (original.type === 'shape' && scaleFont) {
    patch.fontSize = Math.max(4, Math.round(original.fontSize * Math.min(sx, sy) * 10) / 10);
  }
  if (original.type === 'table') {
    // Chat 04: escala colunas/linhas; a altura final vem do layout (o texto pode exigir mais)
    const colWidths = original.colWidths.map((w) => Math.max(TABLE_MIN_COL, Math.round(w * sx)));
    const rowHeights = original.rowHeights.map((h) => Math.max(TABLE_MIN_ROW, Math.round(h * sy)));
    const size = tableSizePatch({ ...original, colWidths, rowHeights });
    patch.colWidths = colWidths;
    patch.rowHeights = rowHeights;
    patch.width = size.width;
    patch.height = size.height;
    if (rect.x !== original.x) patch.x = original.x + original.width - size.width;
    if (rect.y !== original.y) patch.y = original.y + original.height - size.height;
  }
  if (original.type === 'kanban' || original.type === 'comment' || original.type === 'mindmap') return {};
  return patch;
}

/** Propriedades de estilo copiáveis (Copiar estilo / Colar estilo). */
export type CopiedStyle = Partial<
  RichTextStyle & {
    color: string;
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    strokeStyle: ShapeElement['strokeStyle'];
    textColor: string;
    textAlign: 'left' | 'center' | 'right';
    backgroundColor: string;
    opacity: number;
    fontSize: number | 'auto';
  }
>;

const STYLE_KEYS = [
  'fontName', 'fontWeight', 'fontStyle', 'underline', 'strikethrough', 'listStyle', 'indent', 'highlightColor',
  'color', 'fillColor', 'strokeColor', 'strokeWidth', 'strokeStyle', 'textColor', 'textAlign', 'backgroundColor', 'opacity', 'fontSize',
] as const;

export function extractStyle(el: CanvasElement): CopiedStyle {
  const out: Record<string, unknown> = {};
  const source = el as unknown as Record<string, unknown>;
  for (const key of STYLE_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out as CopiedStyle;
}

/** Aplica um estilo copiado apenas nas chaves que o tipo de destino suporta. */
export function styleToPatch(style: CopiedStyle, target: CanvasElement): ElementPatch {
  const patch: ElementPatch = {};
  const t = target as unknown as Record<string, unknown>;
  const s = style as Record<string, unknown>;
  for (const key of STYLE_KEYS) {
    if (s[key] === undefined) continue;
    if (key === 'opacity') {
      patch.opacity = s[key] as number;
      continue;
    }
    if (key === 'fontSize') {
      if (target.type === 'sticky' || (typeof s[key] === 'number' && (target.type === 'shape' || target.type === 'text'))) {
        patch.fontSize = s[key] as number;
      }
      continue;
    }
    if (key in t || isTextualElement(target)) {
      if (key === 'color' && target.type !== 'sticky') continue;
      if ((key === 'fillColor' || key === 'strokeColor' || key === 'strokeWidth' || key === 'strokeStyle') && target.type !== 'shape') continue;
      if (key === 'backgroundColor' && target.type !== 'text') continue;
      patch[key] = s[key];
    }
  }
  return patch;
}

/** Texto de um elemento (para busca, CSV e conversões). */
export function getElementText(el: CanvasElement): string {
  switch (el.type) {
    case 'sticky':
    case 'shape':
    case 'text':
      return el.text;
    case 'frame':
      return el.title;
    case 'kanban':
      return [el.title, ...el.columns.flatMap((c) => [c.title, ...c.cards.flatMap((k) => [k.title, k.description ?? '', k.assignee ?? '', ...k.tags])])].filter(Boolean).join(' ');
    case 'connector':
      return el.label ?? '';
    case 'mindmap':
      return el.nodes.map((n) => n.text).join(' ');
    case 'table':
      return Object.values(el.cells)
        .map((c) => c.text)
        .join(' ');

    case 'comment':
      return el.messages.map((m) => m.text).join(' ');
    case 'composite':
      return [el.text, ...Object.values(el.fields ?? {})].filter(Boolean).join(' ');
    default:
      return '';
  }
}

export const ELEMENT_TYPE_LABELS: Record<CanvasElement['type'], string> = {
  get sticky() { return t('common.stickyNote'); },
  get shape() { return t('board.elementTypes.shape'); },
  get text() { return t('common.text'); },
  get freehand() { return t('board.elementTypes.freehand'); },
  get image() { return t('board.elementTypes.image'); },
  get connector() { return t('board.elementTypes.connector'); },
  get frame() { return t('board.elementTypes.frame'); },
  get mindmap() { return t('common.mindMap'); },
  get kanban() { return t('board.elementTypes.kanban'); },
  get table() { return t('board.elementTypes.table'); },
  get comment() { return t('board.factory.comment'); },
  get composite() { return t('board.elementTypes.composite'); },
};

export type ConvertTarget = { type: 'sticky' } | { type: 'text' } | { type: 'shape'; kind: ShapeKind };

/** Converte um elemento textual em outro tipo preservando texto, posição e estilo de fonte. */
export function convertElement(el: TextualElement, target: ConvertTarget): CanvasElement {
  const shared = {
    id: el.id,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    zIndex: el.zIndex,
    groupId: el.groupId ?? null,
    parentId: el.parentId ?? null,
    locked: el.locked,
    opacity: el.opacity,
    createdAt: el.createdAt,
    text: el.text,
    fontName: el.fontName,
    fontWeight: el.fontWeight,
    fontStyle: el.fontStyle,
    underline: el.underline,
    strikethrough: el.strikethrough,
    listStyle: el.listStyle,
    indent: el.indent,
    link: el.link,
    highlightColor: el.highlightColor,
    textAlign: el.textAlign,
  };
  const currentColor =
    el.type === 'sticky' ? el.color : el.type === 'shape' ? (el.fillColor === 'transparent' ? '#FFFFFF' : el.fillColor) : DEFAULT_STICKY_COLOR;
  const textColor = el.type === 'sticky' ? el.textColor ?? stickyTextColor(el.color) : el.textColor;
  const numericFont = el.type === 'sticky' ? (typeof el.fontSize === 'number' ? el.fontSize : 18) : el.fontSize;

  if (target.type === 'sticky') {
    const size = Math.max(el.width, el.height);
    return createStickyNote({ ...shared, width: size, height: size, color: currentColor, textColor, fontSize: 'auto' });
  }
  if (target.type === 'text') {
    return createText({ ...shared, textColor, fontSize: numericFont, height: el.height });
  }
  return createShape(target.kind, {
    ...shared,
    fillColor: el.type === 'text' ? '#FFFFFF' : currentColor,
    textColor,
    fontSize: numericFont,
    strokeColor: el.type === 'shape' ? el.strokeColor : '#1C1C1E',
  });
}
