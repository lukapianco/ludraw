/**
 * LuDraw — Quadro Kanban (Chat 04): funções PURAS de dados e geometria.
 *
 * Geometria única: `layoutKanban` calcula colunas, cards e linhas de texto em unidades de mundo.
 * A View (`elements/KanbanView.tsx`) e o export (`drawKanbanToCanvas`) desenham a MESMA saída,
 * então a tela e o PNG/PDF ficam iguais. O tamanho do elemento (width/height) vem do layout —
 * o Kanban não tem alças de redimensionar (a largura das colunas é escolhida na Barra de ações).
 *
 * O conteúdo do board usa cores fixas (iguais nos dois temas), como post-its e mapas mentais.
 */

import type { KanbanCard, KanbanColumn, KanbanElement } from '../types/canvas';
import { createId } from './id';
import { measureTextWidth, wrapText } from './text';
import { t } from '../i18n';
import { formatCount, formatDate } from '../i18n/format';

export type KanbanPriority = KanbanCard['priority'];

/* --------------------------------- Constantes -------------------------------- */

export const KANBAN_PAD = 16;
export const KANBAN_HEADER_H = 50;
export const KANBAN_COL_GAP = 12;
export const KANBAN_COL_HEADER_H = 46;
export const KANBAN_CARD_GAP = 8;
export const KANBAN_CARD_PAD = 12;
export const KANBAN_ADD_H = 34;
export const KANBAN_COL_MIN_BODY = 96;
export const KANBAN_DEFAULT_COL_W = 264;
export const KANBAN_COLUMN_WIDTHS: { id: 'compact' | 'normal' | 'wide'; label: string; width: number }[] = [
  { id: 'compact', get label() { return t('widgets.kanban.compact'); }, width: 220 },
  { id: 'normal', get label() { return t('widgets.kanban.default'); }, width: 264 },
  { id: 'wide', get label() { return t('widgets.kanban.wide'); }, width: 320 },
];

export const KANBAN_FONT = 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif';
export const KANBAN_TITLE_FONT = `700 18px ${KANBAN_FONT}`;
export const KANBAN_COL_FONT = `700 13.5px ${KANBAN_FONT}`;
export const KANBAN_CARD_TITLE_FONT = `600 14px ${KANBAN_FONT}`;
export const KANBAN_CARD_DESC_FONT = `400 12.5px ${KANBAN_FONT}`;
export const KANBAN_META_FONT = `600 11.5px ${KANBAN_FONT}`;
export const KANBAN_TAG_FONT = `600 11px ${KANBAN_FONT}`;
const TITLE_LH = 19;
const DESC_LH = 17;
const TITLE_MAX_LINES = 4;
const DESC_MAX_LINES = 3;
const TAG_H = 20;
const META_H = 22;

/** Cores do conteúdo do Kanban (iguais nos dois temas). */
export const KANBAN_COLORS = {
  surface: '#F6F7F4',
  surfaceBorder: '#DDE2D8',
  column: '#ECEFE8',
  card: '#FFFFFF',
  cardBorder: '#DCE1D6',
  text: '#18211C',
  muted: '#5B655E',
  subtle: '#7D877F',
  wipOver: '#C2412D',
} as const;

/** Paleta das colunas (subconjunto das cores de tag do projeto). */
export const KANBAN_COLUMN_COLORS = ['#5B605C', '#2C64A8', '#E0A21B', '#8C4A7A', '#3A8156', '#C2412D', '#0F766E', '#6B4FD8', '#D9467A', '#194B32'];

export const PRIORITY_META: Record<KanbanPriority, { label: string; color: string; soft: string; rank: number }> = {
  high: { get label() { return t('widgets.kanban.high'); }, color: '#C2412D', soft: '#FBE6E2', rank: 0 },
  medium: { get label() { return t('widgets.kanban.medium'); }, color: '#A66A12', soft: '#FBF0DC', rank: 1 },
  low: { get label() { return t('widgets.kanban.low'); }, color: '#2F7D4F', soft: '#E3F1E7', rank: 2 },
};

export const STORY_POINT_PRESETS = [0, 1, 2, 3, 5, 8, 13, 21];

/* ---------------------------------- Dados ------------------------------------ */

export function createKanbanCard(partial: Partial<KanbanCard> = {}): KanbanCard {
  return { id: createId(8), title: '', priority: 'medium', tags: [], ...partial };
}

export function createKanbanColumn(title: string, color: string, cards: KanbanCard[] = []): KanbanColumn {
  return { id: createId(8), title, color, cards };
}

export function columnWidthOf(el: Pick<KanbanElement, 'columnWidth'>): number {
  return Math.max(180, Math.min(480, el.columnWidth ?? KANBAN_DEFAULT_COL_W));
}

/** Localiza um card. */
export function findCard(el: KanbanElement, cardId: string): { column: KanbanColumn; columnIndex: number; card: KanbanCard; index: number } | null {
  for (let ci = 0; ci < el.columns.length; ci++) {
    const column = el.columns[ci];
    const index = column.cards.findIndex((c) => c.id === cardId);
    if (index >= 0) return { column, columnIndex: ci, card: column.cards[index], index };
  }
  return null;
}

/** Move um card para `toColumnId` na posição `toIndex` (índice na lista SEM o card). Devolve as colunas novas. */
export function moveCardInColumns(columns: KanbanColumn[], cardId: string, toColumnId: string, toIndex: number): KanbanColumn[] {
  let moving: KanbanCard | null = null;
  const without = columns.map((col) => {
    const i = col.cards.findIndex((c) => c.id === cardId);
    if (i < 0) return col;
    moving = col.cards[i];
    return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
  });
  if (!moving) return columns;
  const card: KanbanCard = moving;
  return without.map((col) => {
    if (col.id !== toColumnId) return col;
    const cards = [...col.cards];
    cards.splice(Math.max(0, Math.min(toIndex, cards.length)), 0, card);
    return { ...col, cards };
  });
}

export function updateCardInColumns(columns: KanbanColumn[], cardId: string, patch: Partial<KanbanCard>): KanbanColumn[] {
  return columns.map((col) => (col.cards.some((c) => c.id === cardId) ? { ...col, cards: col.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } : col));
}

export function removeCardFromColumns(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  return columns.map((col) => (col.cards.some((c) => c.id === cardId) ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) } : col));
}

export function sortColumnByPriority(col: KanbanColumn): KanbanColumn {
  return { ...col, cards: [...col.cards].sort((a, b) => PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank) };
}

export function totalStoryPoints(cards: KanbanCard[]): number {
  return cards.reduce((n, c) => n + (typeof c.storyPoints === 'number' && Number.isFinite(c.storyPoints) ? c.storyPoints : 0), 0);
}

/** "12 de nov." / "Nov 12" a partir de "2026-11-12" (sem fuso: a data é só o dia; `Intl`, Chat 05.6). */
export function formatDueDate(iso: string | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return formatDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), { day: 'numeric', month: 'short' });
}

/** Prazo vencido (antes de hoje, no fuso do navegador). */
export function isOverdue(iso: string | undefined, today = new Date()): boolean {
  if (!iso) return false;
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < t;
}

/** Iniciais para o avatar do responsável. */
export function assigneeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* --------------------------------- Layout ------------------------------------ */

export interface KanbanTagPill {
  label: string;
  x: number;
  width: number;
}

export interface KanbanCardLayout {
  card: KanbanCard;
  x: number;
  y: number;
  width: number;
  height: number;
  titleLines: string[];
  descLines: string[];
  /** Pílulas de tag que cabem numa linha (+N é a última quando sobra) */
  tags: KanbanTagPill[];
  extraTags: number;
  /** Deslocamentos verticais dentro do card */
  titleY: number;
  descY: number;
  tagsY: number;
  metaY: number;
}

export interface KanbanColumnLayout {
  column: KanbanColumn;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  titleText: string;
  cards: KanbanCardLayout[];
  /** Botão "Adicionar card" (y relativo ao elemento) */
  addY: number;
  points: number;
  wipOver: boolean;
}

export interface KanbanLayout {
  width: number;
  height: number;
  columnWidth: number;
  titleText: string;
  summary: string;
  columns: KanbanColumnLayout[];
}

const cache = new WeakMap<KanbanElement['columns'], { key: string; layout: KanbanLayout }>();

function clampLines(lines: string[], max: number, maxWidth: number, font: string): string[] {
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  let last = out[max - 1];
  while (last.length > 1 && measureTextWidth(`${last}…`, font) > maxWidth) last = last.slice(0, -1);
  out[max - 1] = `${last.trimEnd()}…`;
  return out;
}

function ellipsizeText(text: string, maxWidth: number, font: string): string {
  if (measureTextWidth(text, font) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && measureTextWidth(`${out}…`, font) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function layoutCard(card: KanbanCard, x: number, y: number, width: number): KanbanCardLayout {
  const inner = width - KANBAN_CARD_PAD * 2 - 4; // 4 = barra de prioridade à esquerda
  const titleSource = card.title.trim() || t('widgets.kanban.untitledCard');
  const titleLines = clampLines(wrapText(titleSource, inner, KANBAN_CARD_TITLE_FONT), TITLE_MAX_LINES, inner, KANBAN_CARD_TITLE_FONT);
  const desc = (card.description ?? '').trim();
  const descLines = desc ? clampLines(wrapText(desc, inner, KANBAN_CARD_DESC_FONT), DESC_MAX_LINES, inner, KANBAN_CARD_DESC_FONT) : [];
  let cy = KANBAN_CARD_PAD;
  const titleY = cy;
  cy += titleLines.length * TITLE_LH;
  const descY = cy + 4;
  if (descLines.length) cy = descY + descLines.length * DESC_LH;
  // tags numa linha
  const tags: KanbanTagPill[] = [];
  let extraTags = 0;
  let tagsY = 0;
  if (card.tags.length) {
    tagsY = cy + 8;
    let tx = 0;
    for (let i = 0; i < card.tags.length; i++) {
      const label = ellipsizeText(card.tags[i], inner * 0.6, KANBAN_TAG_FONT);
      const w = measureTextWidth(label, KANBAN_TAG_FONT) + 16;
      const remaining = card.tags.length - i - 1;
      const reserve = remaining > 0 ? 30 : 0;
      if (tx + w > inner - reserve && tags.length > 0) {
        extraTags = card.tags.length - i;
        break;
      }
      tags.push({ label, x: tx, width: Math.min(w, inner) });
      tx += w + 6;
    }
    cy = tagsY + TAG_H;
  }
  const metaY = cy + 10;
  cy = metaY + META_H + KANBAN_CARD_PAD;
  return { card, x, y, width, height: Math.ceil(cy), titleLines, descLines, tags, extraTags, titleY, descY, tagsY, metaY };
}

/** Layout completo do Kanban (memorizado por lista de colunas + largura). */
export function layoutKanban(el: Pick<KanbanElement, 'columns' | 'title' | 'columnWidth'>): KanbanLayout {
  const colW = columnWidthOf(el);
  const key = `${colW}|${el.title}`;
  const hit = cache.get(el.columns);
  if (hit && hit.key === key) return hit.layout;

  const columns: KanbanColumnLayout[] = [];
  let maxBody = KANBAN_COL_MIN_BODY;
  el.columns.forEach((column, index) => {
    const x = KANBAN_PAD + index * (colW + KANBAN_COL_GAP);
    const y = KANBAN_PAD + KANBAN_HEADER_H;
    let cy = KANBAN_COL_HEADER_H;
    const cards = column.cards.map((card) => {
      const l = layoutCard(card, x + 8, y + cy, colW - 16);
      cy += l.height + KANBAN_CARD_GAP;
      return l;
    });
    const addY = y + cy;
    const body = cy + KANBAN_ADD_H + 8 - KANBAN_COL_HEADER_H;
    maxBody = Math.max(maxBody, body);
    const countLabel = column.wipLimit ? `${column.cards.length}/${column.wipLimit}` : String(column.cards.length);
    const titleText = ellipsizeText(column.title.trim() || t('widgets.kanban.column'), colW - 28 - measureTextWidth(countLabel, KANBAN_META_FONT) - 40, KANBAN_COL_FONT);
    columns.push({
      column,
      index,
      x,
      y,
      width: colW,
      height: 0,
      titleText,
      cards,
      addY,
      points: totalStoryPoints(column.cards),
      wipOver: !!column.wipLimit && column.cards.length > column.wipLimit,
    });
  });
  const colHeight = KANBAN_COL_HEADER_H + maxBody;
  for (const c of columns) c.height = colHeight;

  const n = Math.max(1, el.columns.length);
  const width = KANBAN_PAD * 2 + n * colW + (n - 1) * KANBAN_COL_GAP;
  const height = KANBAN_PAD * 2 + KANBAN_HEADER_H + colHeight;
  const allCards = el.columns.flatMap((c) => c.cards);
  const pts = totalStoryPoints(allCards);
  const summary = pts ? t('widgets.kanban.cardsPoints', { cards: formatCount('card', allCards.length), points: pts }) : formatCount('card', allCards.length);
  const titleText = ellipsizeText(el.title.trim() || t('common.kanbanBoard'), width - KANBAN_PAD * 2 - measureTextWidth(summary, KANBAN_META_FONT) - 24, KANBAN_TITLE_FONT);
  const layout: KanbanLayout = { width, height, columnWidth: colW, titleText, summary, columns };
  cache.set(el.columns, { key, layout });
  return layout;
}

/** Patch de tamanho do elemento a partir do layout (use em toda mudança de conteúdo). */
export function kanbanSizePatch(el: Pick<KanbanElement, 'columns' | 'title' | 'columnWidth'>): { width: number; height: number } {
  const l = layoutKanban(el);
  return { width: l.width, height: l.height };
}

/** Posição de soltura de um card a partir de um ponto local ao elemento. */
export function dropTargetAt(el: KanbanElement, local: { x: number; y: number }, draggingId: string): { columnId: string; index: number } | null {
  const l = layoutKanban(el);
  if (l.columns.length === 0) return null;
  const step = l.columnWidth + KANBAN_COL_GAP;
  const ci = Math.max(0, Math.min(l.columns.length - 1, Math.floor((local.x - KANBAN_PAD + KANBAN_COL_GAP / 2) / step)));
  const col = l.columns[ci];
  const cards = col.cards.filter((c) => c.card.id !== draggingId);
  let index = cards.length;
  for (let i = 0; i < cards.length; i++) {
    if (local.y < cards[i].y + cards[i].height / 2) {
      index = i;
      break;
    }
  }
  return { columnId: col.column.id, index };
}

/** Caixa (mundo) de um card — usada pela votação para focar a câmera no card vencedor. */
export function cardWorldRect(el: KanbanElement, cardId: string): { x: number; y: number; width: number; height: number } | null {
  const l = layoutKanban(el);
  for (const col of l.columns) {
    const c = col.cards.find((k) => k.card.id === cardId);
    if (c) return { x: el.x + c.x, y: el.y + c.y, width: c.width, height: c.height };
  }
  return null;
}

/* ---------------------------------- Export ----------------------------------- */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Desenha um card (coordenadas locais do elemento). Exportado para o DS/miniaturas. */
function drawCard(ctx: CanvasRenderingContext2D, c: KanbanCardLayout): void {
  const p = PRIORITY_META[c.card.priority];
  ctx.save();
  ctx.shadowColor = 'rgba(20,36,26,0.08)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  rr(ctx, c.x, c.y, c.width, c.height, 8);
  ctx.fillStyle = KANBAN_COLORS.card;
  ctx.fill();
  ctx.restore();
  rr(ctx, c.x + 0.5, c.y + 0.5, c.width - 1, c.height - 1, 8);
  ctx.strokeStyle = KANBAN_COLORS.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  // barra de prioridade
  ctx.fillStyle = p.color;
  rr(ctx, c.x + 5, c.y + 8, 3, c.height - 16, 1.5);
  ctx.fill();
  const left = c.x + KANBAN_CARD_PAD + 4;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.card.title.trim() ? KANBAN_COLORS.text : KANBAN_COLORS.subtle;
  ctx.font = KANBAN_CARD_TITLE_FONT;
  c.titleLines.forEach((line, i) => ctx.fillText(line, left, c.y + c.titleY + TITLE_LH * (i + 0.5)));
  if (c.descLines.length) {
    ctx.fillStyle = KANBAN_COLORS.muted;
    ctx.font = KANBAN_CARD_DESC_FONT;
    c.descLines.forEach((line, i) => ctx.fillText(line, left, c.y + c.descY + DESC_LH * (i + 0.5)));
  }
  if (c.tags.length) {
    ctx.font = KANBAN_TAG_FONT;
    for (const t of c.tags) {
      rr(ctx, left + t.x, c.y + c.tagsY, t.width, TAG_H, TAG_H / 2);
      ctx.fillStyle = '#E4EED5';
      ctx.fill();
      ctx.fillStyle = '#194B32';
      ctx.fillText(t.label, left + t.x + 8, c.y + c.tagsY + TAG_H / 2);
    }
    if (c.extraTags) {
      const last = c.tags[c.tags.length - 1];
      ctx.fillStyle = KANBAN_COLORS.muted;
      ctx.fillText(`+${c.extraTags}`, left + last.x + last.width + 6, c.y + c.tagsY + TAG_H / 2);
    }
  }
  // meta: prioridade · prazo · pontos · responsável
  const my = c.y + c.metaY + META_H / 2;
  ctx.font = KANBAN_META_FONT;
  let mx = left;
  const pill = (label: string, fg: string, bg: string) => {
    const w = measureTextWidth(label, KANBAN_META_FONT) + 14;
    rr(ctx, mx, my - 10, w, 20, 10);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(label, mx + 7, my);
    mx += w + 6;
  };
  pill(p.label, p.color, p.soft);
  if (c.card.dueDate) pill(formatDueDate(c.card.dueDate), isOverdue(c.card.dueDate) ? '#C2412D' : KANBAN_COLORS.muted, isOverdue(c.card.dueDate) ? '#FBE6E2' : '#F1F3EE');
  if (typeof c.card.storyPoints === 'number') pill(`${c.card.storyPoints} pts`, '#2C64A8', '#E3EDF9');
  if (c.card.assignee?.trim()) {
    const cx = c.x + c.width - KANBAN_CARD_PAD - 11;
    ctx.beginPath();
    ctx.arc(cx, my, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#194B32';
    ctx.fill();
    ctx.fillStyle = '#D0E4AE';
    ctx.font = `700 10px ${KANBAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(assigneeInitials(c.card.assignee), cx, my + 0.5);
    ctx.textAlign = 'left';
  }
}

/** Desenha o Kanban no Canvas 2D (coordenadas locais: o chamador já transladou para x, y). */
export function drawKanbanToCanvas(ctx: CanvasRenderingContext2D, el: KanbanElement): void {
  const l = layoutKanban(el);
  ctx.save();
  ctx.shadowColor = 'rgba(20,36,26,0.10)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  rr(ctx, 0, 0, l.width, l.height, 14);
  ctx.fillStyle = KANBAN_COLORS.surface;
  ctx.fill();
  ctx.restore();
  rr(ctx, 0.5, 0.5, l.width - 1, l.height - 1, 14);
  ctx.strokeStyle = KANBAN_COLORS.surfaceBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = KANBAN_TITLE_FONT;
  ctx.fillStyle = KANBAN_COLORS.text;
  ctx.fillText(l.titleText, KANBAN_PAD + 4, KANBAN_PAD + KANBAN_HEADER_H / 2 - 4);
  ctx.font = KANBAN_META_FONT;
  ctx.fillStyle = KANBAN_COLORS.subtle;
  ctx.textAlign = 'right';
  ctx.fillText(l.summary, l.width - KANBAN_PAD - 4, KANBAN_PAD + KANBAN_HEADER_H / 2 - 4);
  ctx.textAlign = 'left';
  for (const col of l.columns) {
    rr(ctx, col.x, col.y, col.width, col.height, 10);
    ctx.fillStyle = KANBAN_COLORS.column;
    ctx.fill();
    ctx.fillStyle = col.column.color;
    rr(ctx, col.x + 10, col.y + 9, col.width - 20, 4, 2);
    ctx.fill();
    ctx.font = KANBAN_COL_FONT;
    ctx.fillStyle = KANBAN_COLORS.text;
    ctx.fillText(col.titleText, col.x + 12, col.y + 29);
    const count = col.column.wipLimit ? `${col.column.cards.length}/${col.column.wipLimit}` : String(col.column.cards.length);
    ctx.font = KANBAN_META_FONT;
    ctx.fillStyle = col.wipOver ? KANBAN_COLORS.wipOver : KANBAN_COLORS.subtle;
    ctx.textAlign = 'right';
    ctx.fillText(col.points ? `${count} · ${col.points} pts` : count, col.x + col.width - 12, col.y + 29);
    ctx.textAlign = 'left';
    for (const c of col.cards) drawCard(ctx, c);
  }
}
