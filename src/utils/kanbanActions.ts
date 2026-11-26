/**
 * LuDraw — Ações do Kanban ligadas ao store (Chat 04).
 *
 * Mesmo caminho do mapa mental: `ensure('board.edit')` → `pushHistory()` (1 passo de desfazer por
 * ação) → `updateElement` com as colunas novas + o tamanho do layout (`kanbanSizePatch`).
 * `useKanbanUi` guarda só estado de interface (arrasto de card, título em edição) — fora do board.
 */

import { create } from 'zustand';
import type { KanbanCard, KanbanColumn, KanbanElement } from '../types/canvas';
import { notify, useAppStore } from '../store/useAppStore';
import { buildPermissionContext, useBoardStore } from '../store/useBoardStore';
import { can } from './permissions';
import { viewportCenterWorld } from './boardActions';
import { createKanban } from './factory';
import type { Point } from './math';
import {
  createKanbanCard,
  createKanbanColumn,
  findCard,
  KANBAN_COLUMN_COLORS,
  kanbanSizePatch,
  moveCardInColumns,
  removeCardFromColumns,
  sortColumnByPriority,
  updateCardInColumns,
} from './kanban';
import { t } from '../i18n';
import { compareText } from '../i18n/format';

export type KanbanEditTarget = { kind: 'title' } | { kind: 'column'; columnId: string };

interface KanbanUiState {
  /** Arrasto de card em andamento */
  drag: { elementId: string; cardId: string; local: Point; offset: Point; target: { columnId: string; index: number } | null } | null;
  /** Texto em edição no lugar (título do quadro ou de uma coluna) — vale enquanto `editingId` = elementId */
  editing: { elementId: string; target: KanbanEditTarget } | null;
}

export const useKanbanUi = create<KanbanUiState>(() => ({ drag: null, editing: null }));

const board = () => useBoardStore.getState();

export function getKanban(id: string): KanbanElement | null {
  const el = board().elements[id];
  return el && el.type === 'kanban' ? el : null;
}

/**
 * Pode editar este Kanban? Com `silent`, só consulta o motor (sem toast) — usado para decidir entre
 * arrastar/editar e apenas abrir o card para leitura. Sem `silent`, passa pelo `ensure` (mostra o motivo).
 */
export function kanbanEditable(el: KanbanElement, silent = false): boolean {
  const s = board();
  if (s.readOnly) return false;
  if (el.locked) {
    if (!silent) notify(t('widgets.kanbanActions.thisKanbanLockedUnlockEdit'));
    return false;
  }
  if (silent) return !s.presenting && can(buildPermissionContext(s), 'board.edit');
  return s.ensure('board.edit');
}

function commit(el: KanbanElement, columns: KanbanColumn[], history = true, extra: Partial<KanbanElement> = {}): void {
  const s = board();
  if (history) s.pushHistory();
  const next = { ...el, ...extra, columns };
  s.updateElement(el.id, { ...extra, columns, ...kanbanSizePatch(next) });
}

/** Insere um Kanban no centro da tela (ou em `at`) já selecionado. */
export function insertKanban(at?: Point): string | null {
  const s = board();
  if (s.readOnly || !s.ensure('board.edit')) return null;
  const el = createKanban(at ?? viewportCenterWorld());
  s.addElements([el], { select: true });
  if (!board().elements[el.id]) return null;
  s.setActiveTool('select');
  board().zoomToFit([el.id]);
  return el.id;
}

export function kanbanAddColumn(elementId: string, title = t('widgets.kanbanActions.newColumn')): string | null {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el)) return null;
  const color = KANBAN_COLUMN_COLORS[el.columns.length % KANBAN_COLUMN_COLORS.length];
  const col = createKanbanColumn(title, color);
  commit(el, [...el.columns, col]);
  return col.id;
}

export function kanbanUpdateColumn(elementId: string, columnId: string, patch: Partial<Pick<KanbanColumn, 'title' | 'color' | 'wipLimit'>>, history = true): void {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el)) return;
  const col = el.columns.find((c) => c.id === columnId);
  if (!col) return;
  const next = { ...col, ...patch };
  if (patch.wipLimit !== undefined && (!patch.wipLimit || patch.wipLimit < 1)) delete next.wipLimit;
  commit(el, el.columns.map((c) => (c.id === columnId ? next : c)), history);
}

export function kanbanMoveColumn(elementId: string, columnId: string, dir: -1 | 1): void {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el)) return;
  const i = el.columns.findIndex((c) => c.id === columnId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= el.columns.length) return;
  const cols = [...el.columns];
  [cols[i], cols[j]] = [cols[j], cols[i]];
  commit(el, cols);
}

/** Exclui a coluna. Os cards dela vão para a coluna vizinha (ou são excluídos com `dropCards`). */
export function kanbanDeleteColumn(elementId: string, columnId: string, dropCards = false): void {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el)) return;
  if (el.columns.length <= 1) {
    notify(t('widgets.kanbanActions.theKanbanNeedsLeastOne'));
    return;
  }
  const i = el.columns.findIndex((c) => c.id === columnId);
  if (i < 0) return;
  const removed = el.columns[i];
  let cols = el.columns.filter((c) => c.id !== columnId);
  if (!dropCards && removed.cards.length) {
    const target = cols[Math.max(0, i - 1)];
    cols = cols.map((c) => (c.id === target.id ? { ...c, cards: [...c.cards, ...removed.cards] } : c));
    notify(t('widgets.kanbanActions.cardsMovedTo', { count: removed.cards.length, column: target.title }));
  }
  commit(el, cols);
}

export function kanbanSortByPriority(elementId: string, columnId?: string): void {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el)) return;
  commit(el, el.columns.map((c) => (!columnId || c.id === columnId ? sortColumnByPriority(c) : c)));
}

/** Cria um card no fim da coluna e abre o editor do card. */
export function kanbanAddCard(elementId: string, columnId: string, partial: Partial<KanbanCard> = {}, openEditor = true): string | null {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el)) return null;
  const card = createKanbanCard({ title: t('widgets.kanbanActions.newCard'), ...partial });
  commit(el, el.columns.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, card] } : c)));
  if (openEditor) useAppStore.getState().openModal({ type: 'kanban-card', elementId, cardId: card.id });
  return card.id;
}

export function kanbanUpdateCard(elementId: string, cardId: string, patch: Partial<KanbanCard>): void {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el) || !findCard(el, cardId)) return;
  commit(el, updateCardInColumns(el.columns, cardId, patch));
}

/** Salva o editor do card: campos + troca de coluna (vai para o fim) num único passo de desfazer. */
export function kanbanApplyCardEdit(elementId: string, cardId: string, patch: Partial<KanbanCard>, toColumnId?: string): void {
  const el = getKanban(elementId);
  const found = el ? findCard(el, cardId) : null;
  if (!el || !found || !kanbanEditable(el)) return;
  let columns = updateCardInColumns(el.columns, cardId, patch);
  if (toColumnId && toColumnId !== found.column.id) {
    const target = columns.find((c) => c.id === toColumnId);
    if (target?.wipLimit && target.cards.length >= target.wipLimit) notify(t('widgets.kanbanActions.overWipLimit', { column: target.title, count: target.wipLimit }));
    columns = moveCardInColumns(columns, cardId, toColumnId, target?.cards.length ?? 0);
  }
  commit(el, columns);
}

export function kanbanDeleteCard(elementId: string, cardId: string): void {
  const el = getKanban(elementId);
  if (!el || !kanbanEditable(el) || !findCard(el, cardId)) return;
  commit(el, removeCardFromColumns(el.columns, cardId));
}

export function kanbanDuplicateCard(elementId: string, cardId: string): string | null {
  const el = getKanban(elementId);
  const found = el ? findCard(el, cardId) : null;
  if (!el || !found || !kanbanEditable(el)) return null;
  const copy: KanbanCard = { ...found.card, tags: [...found.card.tags], id: createKanbanCard().id, title: t('widgets.kanbanActions.titleCopy', { title: found.card.title }) };
  commit(
    el,
    el.columns.map((c) => {
      if (c.id !== found.column.id) return c;
      const cards = [...c.cards];
      cards.splice(found.index + 1, 0, copy);
      return { ...c, cards };
    }),
  );
  return copy.id;
}

/** Move um card (arrastar ou "Mover para…"). `toIndex` = posição na coluna de destino sem o card. */
export function kanbanMoveCard(elementId: string, cardId: string, toColumnId: string, toIndex: number): void {
  const el = getKanban(elementId);
  const found = el ? findCard(el, cardId) : null;
  if (!el || !found) return;
  if (found.column.id === toColumnId && found.index === toIndex) return;
  if (!kanbanEditable(el)) return;
  const target = el.columns.find((c) => c.id === toColumnId);
  if (target?.wipLimit && found.column.id !== toColumnId && target.cards.length >= target.wipLimit) {
    notify(t('widgets.kanbanActions.overWipLimit', { column: target.title, count: target.wipLimit }));
  }
  commit(el, moveCardInColumns(el.columns, cardId, toColumnId, toIndex));
}

export function kanbanSetColumnWidth(elementId: string, width: number): void {
  const el = getKanban(elementId);
  if (!el || el.columnWidth === width || !kanbanEditable(el)) return;
  commit(el, el.columns, true, { columnWidth: width });
}

/* ------------------------------ Texto no lugar ------------------------------ */

/** Abre o título do quadro ou de uma coluna para edição (setEditingId checa permissão e grava o desfazer). */
export function startKanbanEdit(elementId: string, target: KanbanEditTarget): void {
  const el = getKanban(elementId);
  if (!el) return;
  if (el.locked) {
    notify(t('widgets.kanbanActions.thisKanbanLockedUnlockEdit'));
    return;
  }
  useKanbanUi.setState({ editing: { elementId, target } });
  const s = board();
  if (s.editingId !== elementId) s.setEditingId(elementId);
  if (board().editingId !== elementId) useKanbanUi.setState({ editing: null });
}

/** Grava o texto digitado (sem passo extra de desfazer: o `setEditingId` já gravou). */
export function commitKanbanText(elementId: string, target: KanbanEditTarget, text: string): void {
  const el = getKanban(elementId);
  if (!el || el.locked || board().readOnly) return;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (target.kind === 'title') {
    if ((clean || t('common.kanbanBoard')) === el.title) return;
    commit(el, el.columns, false, { title: clean || t('common.kanbanBoard') });
  } else {
    const col = el.columns.find((c) => c.id === target.columnId);
    if (!col || (clean || col.title) === col.title) return;
    commit(el, el.columns.map((c) => (c.id === target.columnId ? { ...c, title: clean || c.title } : c)), false);
  }
}

export function stopKanbanEdit(elementId: string): void {
  useKanbanUi.setState({ editing: null });
  if (board().editingId === elementId) board().setEditingId(null);
}

/** Lista de pessoas conhecidas (sugestões de responsável): sessão, membros e responsáveis já usados. */
export function knownAssignees(): string[] {
  const app = useAppStore.getState();
  const s = board();
  const names = new Set<string>();
  if (app.user?.name) names.add(app.user.name);
  for (const m of app.members) names.add(m.name);
  for (const id of s.elementOrder) {
    const el = s.elements[id];
    if (el?.type === 'kanban') for (const c of el.columns) for (const k of c.cards) if (k.assignee?.trim()) names.add(k.assignee.trim());
  }
  return Array.from(names).sort(compareText);
}

/** Tags já usadas em cards de Kanban do board (sugestões). */
export function knownCardTags(): string[] {
  const s = board();
  const tags = new Set<string>();
  for (const id of s.elementOrder) {
    const el = s.elements[id];
    if (el?.type === 'kanban') for (const c of el.columns) for (const k of c.cards) k.tags.forEach((t) => tags.add(t));
  }
  return Array.from(tags).sort(compareText);
}
