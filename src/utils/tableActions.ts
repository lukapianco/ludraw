/**
 * LuDraw — Ações da Tabela ligadas ao store (Chat 04).
 *
 * Caminho oficial: `ensure('board.edit')` → `pushHistory()` (1 passo por ação estrutural) →
 * `updateElement` com o resultado + o tamanho do layout (`tableSizePatch`). A digitação numa célula
 * grava ao vivo sem passo extra (o `setEditingId` já gravou ao abrir a edição — mesma regra dos textos).
 * `useTableUi` guarda só estado de interface (célula ativa, intervalo, célula em edição).
 */

import { create } from 'zustand';
import { copyTableAsSpreadsheet } from './tableExport';
import type { TableBorder, TableCell, TableElement, TableStyleId } from '../types/canvas';
import { notify } from '../store/useAppStore';
import { buildPermissionContext, useBoardStore } from '../store/useBoardStore';
import { viewportCenterWorld } from './boardActions';
import { createTable } from './factory';
import type { Point } from './math';
import { can } from './permissions';
import {
  anchorOf,
  applyBorderPreset,
  cellKey,
  deleteCol,
  deleteRow,
  expandRange,
  getCell,
  insertCol,
  insertRow,
  isHeaderCol,
  isHeaderRow,
  mergeRange,
  normalizeRange,
  patchRange,
  rangeHasMerge,
  sortRowsBy,
  spanOf,
  TABLE_MIN_COL,
  TABLE_MIN_ROW,
  tableSizePatch,
  unmergeRange,
  type BorderPreset,
  type CellRange,
  type CellRef,
} from './table';
import { t } from '../i18n';

interface TableUiState {
  elementId: string | null;
  /** Início do intervalo (Shift + clique / Shift + setas estendem a partir dele) */
  anchor: CellRef | null;
  /** Célula ativa (fim do intervalo) */
  focus: CellRef | null;
  /** Célula com o campo de texto aberto (vale enquanto `editingId` do board = `elementId`) */
  editing: CellRef | null;
  /** Texto inicial quando a edição começa digitando */
  draftInitial: string | null;
  /** "Caneta" de bordas: cor, espessura e estilo usados pelos modelos de borda */
  borderPen: TableBorder;
}

export const DEFAULT_BORDER_PEN: TableBorder = { color: '#18211C', width: 1, style: 'solid' };

export const useTableUi = create<TableUiState>(() => ({ elementId: null, anchor: null, focus: null, editing: null, draftInitial: null, borderPen: DEFAULT_BORDER_PEN }));

const board = () => useBoardStore.getState();

export function getTable(id: string): TableElement | null {
  const el = board().elements[id];
  return el && el.type === 'table' ? el : null;
}

export function tableEditable(el: TableElement, silent = false): boolean {
  const s = board();
  if (s.readOnly) return false;
  if (el.locked) {
    if (!silent) notify(t('widgets.tableActions.thisTableLockedUnlockEdit'));
    return false;
  }
  if (silent) return !s.presenting && can(buildPermissionContext(s), 'board.edit');
  return s.ensure('board.edit');
}

type TableData = Pick<TableElement, 'rows' | 'cols' | 'colWidths' | 'rowHeights' | 'cells' | 'headerRow' | 'headerCol' | 'banded' | 'tableStyle'>;

function commit(el: TableElement, data: Partial<TableData>, history = true): void {
  const s = board();
  if (history) s.pushHistory();
  const next = { ...el, ...data };
  s.updateElement(el.id, { ...data, ...tableSizePatch(next) });
}

/** Intervalo selecionado no momento (ou a tabela inteira quando nada está ativo). */
export function activeRange(el: TableElement): CellRange {
  const ui = useTableUi.getState();
  if (ui.elementId === el.id && ui.focus) {
    const a = ui.anchor ?? ui.focus;
    const r = normalizeRange(a, ui.focus);
    // a seleção sempre contém as mesclagens inteiras
    return expandRange(el, { r0: Math.min(r.r0, el.rows - 1), c0: Math.min(r.c0, el.cols - 1), r1: Math.min(r.r1, el.rows - 1), c1: Math.min(r.c1, el.cols - 1) });
  }
  return { r0: 0, c0: 0, r1: el.rows - 1, c1: el.cols - 1 };
}

export function hasActiveCell(elementId: string): boolean {
  const ui = useTableUi.getState();
  return ui.elementId === elementId && !!ui.focus;
}

export function setActiveCell(elementId: string, cell: CellRef | null, extend = false): void {
  const ui = useTableUi.getState();
  if (!cell) {
    useTableUi.setState({ elementId, anchor: null, focus: null, editing: null });
    return;
  }
  const sameTable = ui.elementId === elementId;
  const el = getTable(elementId);
  if (el && cell.r < el.rows && cell.c < el.cols) cell = anchorOf(el, cell.r, cell.c);
  useTableUi.setState({
    elementId,
    anchor: extend && sameTable && ui.anchor ? ui.anchor : cell,
    focus: cell,
    editing: sameTable ? ui.editing : null,
  });
}

/** Insere uma tabela 4 × 3 no centro da tela (ou em `at`) já selecionada. */
export function insertTable(at?: Point, options?: Parameters<typeof createTable>[1]): string | null {
  const s = board();
  if (s.readOnly || !s.ensure('board.edit')) return null;
  const c = at ?? viewportCenterWorld();
  const draft = createTable({ x: 0, y: 0 }, options ?? { data: [[t('widgets.tableActions.item'), t('common.assignee'), t('widgets.tableActions.status')], [], [], []] });
  const el = { ...draft, x: c.x - draft.width / 2, y: c.y - draft.height / 2 };
  s.addElements([el], { select: true });
  if (!board().elements[el.id]) return null;
  s.setActiveTool('select');
  setActiveCell(el.id, { r: 0, c: 0 });
  return el.id;
}

/* ------------------------------- Edição de texto ------------------------------ */

export function startEditCell(elementId: string, cell0: CellRef, initialText?: string): void {
  const el = getTable(elementId);
  if (!el || cell0.r >= el.rows || cell0.c >= el.cols) return;
  const cell = anchorOf(el, cell0.r, cell0.c);
  if (el.locked) {
    notify(t('widgets.tableActions.thisTableLockedUnlockEdit'));
    return;
  }
  useTableUi.setState({ elementId, anchor: cell, focus: cell, editing: cell, draftInitial: initialText ?? null });
  const s = board();
  if (s.editingId !== elementId) s.setEditingId(elementId);
  if (board().editingId !== elementId) useTableUi.setState({ editing: null, draftInitial: null });
}

/** Digitação ao vivo: a linha cresce conforme o texto quebra. */
export function setCellText(elementId: string, cell: CellRef, text: string): void {
  const el = getTable(elementId);
  if (!el || el.locked || board().readOnly) return;
  if (getCell(el, cell.r, cell.c).text === text) return;
  commit(el, { cells: patchRange(el.cells, { r0: cell.r, c0: cell.c, r1: cell.r, c1: cell.c }, { text }, el) }, false);
}

export function stopEditCell(elementId: string): void {
  const ui = useTableUi.getState();
  if (ui.elementId === elementId) useTableUi.setState({ editing: null, draftInitial: null });
  if (board().editingId === elementId) board().setEditingId(null);
}

/** Move a célula em edição (Tab/Enter). Na última célula, Tab cria uma linha nova. */
export function moveEditCell(elementId: string, dir: 'next' | 'prev' | 'down' | 'up'): void {
  const el = getTable(elementId);
  const ui = useTableUi.getState();
  if (!el || !ui.editing) return;
  let { r, c } = ui.editing;
  const span = spanOf(el, r, c);
  if (dir === 'next') {
    c += span.cs;
    if (c >= el.cols) {
      c = 0;
      r += 1;
    }
  } else if (dir === 'prev') {
    c -= 1;
    if (c < 0) {
      c = el.cols - 1;
      r = Math.max(0, r - 1);
    }
  } else if (dir === 'down') r += span.rs;
  else r = Math.max(0, r - 1);
  if (r >= el.rows) {
    if (dir === 'next') {
      // Tab na última célula: nova linha (passo de desfazer próprio) e continua editando
      commit(el, insertRow(el, el.rows));
    } else {
      stopEditCell(elementId);
      setActiveCell(elementId, { r: el.rows - 1, c });
      return;
    }
  }
  const now = getTable(elementId) ?? el;
  const target = anchorOf(now, Math.min(r, now.rows - 1), Math.min(c, now.cols - 1));
  useTableUi.setState({ anchor: target, focus: target, editing: target, draftInitial: null });
}

/* --------------------------------- Estrutura -------------------------------- */

export function tableInsertRow(elementId: string, where: 'above' | 'below'): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  const at = where === 'above' ? range.r0 : range.r1 + 1;
  commit(el, insertRow(el, at));
  setActiveCell(elementId, { r: at, c: range.c0 });
}

export function tableInsertCol(elementId: string, where: 'left' | 'right'): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  const at = where === 'left' ? range.c0 : range.c1 + 1;
  commit(el, insertCol(el, at));
  setActiveCell(elementId, { r: range.r0, c: at });
}

export function tableDeleteRows(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  const count = range.r1 - range.r0 + 1;
  if (count >= el.rows) {
    notify(t('widgets.tableActions.theTableNeedsLeastOne'));
    return;
  }
  let data: TableData = el;
  for (let i = 0; i < count; i++) data = { ...data, ...deleteRow(data, range.r0) };
  commit(el, data);
  setActiveCell(elementId, { r: Math.min(range.r0, data.rows - 1), c: range.c0 });
}

export function tableDeleteCols(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  const count = range.c1 - range.c0 + 1;
  if (count >= el.cols) {
    notify(t('widgets.tableActions.theTableNeedsLeastOne2'));
    return;
  }
  let data: TableData = el;
  for (let i = 0; i < count; i++) data = { ...data, ...deleteCol(data, range.c0) };
  commit(el, data);
  setActiveCell(elementId, { r: range.r0, c: Math.min(range.c0, data.cols - 1) });
}

/** Aplica estilo ao intervalo ativo (ou à tabela inteira). */
export function tablePatchCells(elementId: string, patch: Partial<TableCell>): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  commit(el, { cells: patchRange(el.cells, activeRange(el), patch, el) });
}

type ToggleKey = 'bold' | 'italic' | 'underline' | 'strikethrough';

/** Estado efetivo de um estilo liga/desliga no intervalo (todas as células ligadas?). */
export function rangeAll(el: TableElement, key: ToggleKey, range = activeRange(el)): boolean {
  for (let r = range.r0; r <= range.r1; r++)
    for (let c = range.c0; c <= range.c1; c++) {
      const a = anchorOf(el, r, c);
      if (a.r !== r || a.c !== c) continue;
      const cell = getCell(el, r, c);
      const on = key === 'bold' ? cell.bold ?? (isHeaderRow(el, r) || isHeaderCol(el, c)) : !!cell[key];
      if (!on) return false;
    }
  return true;
}

/** Negrito/itálico/sublinhado/tachado: se todas as células já têm, tira; senão, aplica. */
export function tableToggleStyle(elementId: string, key: ToggleKey): void {
  const el = getTable(elementId);
  if (!el) return;
  const on = rangeAll(el, key);
  tablePatchCells(elementId, { [key]: key === 'bold' ? !on : on ? undefined : true } as Partial<TableCell>);
}

/** Mescla o intervalo selecionado (o texto das células é juntado na célula do canto). */
export function tableMerge(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  if (range.r0 === range.r1 && range.c0 === range.c1) {
    notify(t('widgets.tableActions.selectTwoMoreCellsMerge'));
    return;
  }
  const { cells, combined } = mergeRange(el, range);
  commit(el, { cells });
  setActiveCell(elementId, { r: range.r0, c: range.c0 });
  if (combined) notify(t('widgets.tableActions.cellsMergedTheirTextsWere'));
}

export function tableUnmerge(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  if (!rangeHasMerge(el, range)) return;
  commit(el, { cells: unmergeRange(el, range) });
  useTableUi.setState({ anchor: { r: range.r0, c: range.c0 }, focus: { r: range.r1, c: range.c1 } });
}

export function tableCanUnmerge(el: TableElement): boolean {
  return rangeHasMerge(el, activeRange(el));
}

/** Aplica um modelo de bordas ao intervalo com a "caneta" atual (ou a informada). */
export function tableSetBorders(elementId: string, preset: BorderPreset, pen?: TableBorder): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  commit(el, { cells: applyBorderPreset(el, activeRange(el), preset, pen ?? useTableUi.getState().borderPen) });
}

export function setBorderPen(patch: Partial<TableBorder>): void {
  useTableUi.setState((s) => ({ borderPen: { ...s.borderPen, ...patch } }));
}

export function tableSetStyle(elementId: string, style: TableStyleId): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  commit(el, { tableStyle: style === 'sage' ? undefined : style });
}

export function tableToggleHeaderCol(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  commit(el, { headerCol: !el.headerCol || undefined });
}

export function tableToggleBanded(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  commit(el, { banded: !el.banded || undefined });
}

/** Distribui as linhas por igual (altura mínima = a maior entre as linhas atuais). */
export function tableEqualizeRows(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const h = Math.max(TABLE_MIN_ROW, ...el.rowHeights.slice(0, el.rows));
  commit(el, { rowHeights: Array.from({ length: el.rows }, () => h) });
}

/** Ordena as linhas pela coluna da célula ativa (o cabeçalho fica no lugar). */
export function tableSort(elementId: string, dir: 'asc' | 'desc'): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const col = activeRange(el).c0;
  const sorted = sortRowsBy(el, col, dir);
  if (!sorted) {
    notify(t('widgets.tableActions.unmergeRowsBeforeSorting'));
    return;
  }
  commit(el, sorted);
}

/** Copia o intervalo como texto separado por tabulação (cola direto em planilhas). */
export function tableCopyRange(elementId: string): void {
  const el = getTable(elementId);
  if (!el) return;
  // Chat 05: TSV + HTML (mesclagens, negrito e cores) com proteção contra fórmulas
  void copyTableAsSpreadsheet(el, activeRange(el)).then((ok) =>
    notify(ok ? t('widgets.tableActions.cellsCopiedPasteThemInto') : t('widgets.tableActions.couldntAccessClipboard')),
  );
}

/** Exclui a tabela inteira (passa pelo store: permissões, bloqueio e registro). */
export function tableDeleteTable(elementId: string): void {
  const s = board();
  s.setSelectedIds([elementId]);
  s.deleteSelected();
}

/** Negrito (atalho mantido por compatibilidade). */
export function tableToggleBold(elementId: string): void {
  tableToggleStyle(elementId, 'bold');
}

export function tableClearRange(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const range = activeRange(el);
  const cells = { ...el.cells };
  let changed = false;
  for (let r = range.r0; r <= range.r1; r++)
    for (let c = range.c0; c <= range.c1; c++) {
      const k = cellKey(r, c);
      if (cells[k]?.text) {
        cells[k] = { ...cells[k], text: '' };
        changed = true;
      }
    }
  if (changed) commit(el, { cells });
}

export function tableToggleHeader(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  commit(el, { headerRow: el.headerRow === false });
}

/** Redimensiona uma coluna (arrastar a borda). `history` só no primeiro movimento. */
export function tableSetColWidth(elementId: string, col: number, width: number, history: boolean): void {
  const el = getTable(elementId);
  if (!el || col >= el.cols) return;
  if (history && !tableEditable(el)) return;
  const colWidths = Array.from({ length: el.cols }, (_, i) => el.colWidths[i] ?? TABLE_MIN_COL);
  colWidths[col] = Math.max(TABLE_MIN_COL, Math.round(width));
  commit(el, { colWidths }, history);
}

export function tableSetRowHeight(elementId: string, row: number, height: number, history: boolean): void {
  const el = getTable(elementId);
  if (!el || row >= el.rows) return;
  if (history && !tableEditable(el)) return;
  const rowHeights = Array.from({ length: el.rows }, (_, i) => el.rowHeights[i] ?? TABLE_MIN_ROW);
  rowHeights[row] = Math.max(TABLE_MIN_ROW, Math.round(height));
  commit(el, { rowHeights }, history);
}

/** Distribui as colunas por igual (mantém a largura total). */
export function tableEqualizeCols(elementId: string): void {
  const el = getTable(elementId);
  if (!el || !tableEditable(el)) return;
  const total = el.colWidths.slice(0, el.cols).reduce((a, b) => a + b, 0);
  const w = Math.max(TABLE_MIN_COL, Math.round(total / el.cols));
  commit(el, { colWidths: Array.from({ length: el.cols }, () => w) });
}

/* --------------------------------- Teclado ---------------------------------- */

/**
 * Teclas da tabela quando ela é a única seleção, tem uma célula ativa e não há campo aberto.
 * Setas navegam (Shift estende) · Enter/F2 editam · digitar começa a editar · Delete/Backspace
 * limpam o intervalo · Tab avança · Esc solta a célula. Devolve true se consumiu a tecla.
 */
export function handleTableKey(e: KeyboardEvent): boolean {
  const s = board();
  if (s.readOnly || s.editingId || s.selectedIds.length !== 1) return false;
  const el = s.elements[s.selectedIds[0]];
  if (!el || el.type !== 'table') return false;
  const ui = useTableUi.getState();
  if (ui.elementId !== el.id || !ui.focus) return false;
  const consume = () => {
    e.preventDefault();
    e.stopPropagation();
    return true;
  };
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'u') {
      tableToggleStyle(el.id, k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
      return consume();
    }
    if (k === 'c' && (ui.anchor && (ui.anchor.r !== ui.focus.r || ui.anchor.c !== ui.focus.c))) {
      tableCopyRange(el.id);
      return consume();
    }
    return false;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const { r, c } = ui.focus;
  const span = spanOf(el, r, c);
  const clampCell = (rr: number, cc: number): CellRef => ({ r: Math.max(0, Math.min(el.rows - 1, rr)), c: Math.max(0, Math.min(el.cols - 1, cc)) });
  switch (e.key) {
    case 'ArrowUp':
      setActiveCell(el.id, clampCell(r - 1, c), e.shiftKey);
      return consume();
    case 'ArrowDown':
      setActiveCell(el.id, clampCell(r + span.rs, c), e.shiftKey);
      return consume();
    case 'ArrowLeft':
      setActiveCell(el.id, clampCell(r, c - 1), e.shiftKey);
      return consume();
    case 'ArrowRight':
      setActiveCell(el.id, clampCell(r, c + span.cs), e.shiftKey);
      return consume();
    case 'Tab':
      setActiveCell(el.id, e.shiftKey ? clampCell(c === 0 ? r - 1 : r, c === 0 ? el.cols - 1 : c - 1) : clampCell(c + span.cs >= el.cols ? r + 1 : r, c + span.cs >= el.cols ? 0 : c + span.cs));
      return consume();
    case 'Enter':
    case 'F2':
      startEditCell(el.id, ui.focus);
      return consume();
    case 'Delete':
    case 'Backspace':
      tableClearRange(el.id);
      return consume();
    case 'Escape':
      setActiveCell(el.id, null);
      return consume();
    default:
      if (e.key.length === 1 && e.key !== ' ' && e.key !== '?' && !(e.shiftKey && /^Digit\d$/.test(e.code)) && !e.repeat) {
        startEditCell(el.id, ui.focus, e.key);
        return consume();
      }
      return false;
  }
}
