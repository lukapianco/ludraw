/**
 * LuDraw — Tabela no canvas (Chat 04 + ajuste da tabela): funções PURAS de dados e geometria.
 *
 * Contrato (`TableElement`): `rows`/`cols`, `colWidths` (largura de cada coluna), `rowHeights`
 * (altura MÍNIMA de cada linha) e `cells` com chave "linha-coluna". O texto quebra dentro da
 * célula e a linha cresce quando ele não cabe — `layoutTable` é a geometria única usada pela View
 * (`elements/TableView.tsx`) e pelo export (`drawTableToCanvas`). A soma das alturas reais vira o
 * `height` do elemento (`tableSizePatch`).
 *
 * Ajuste da tabela (todos os campos opcionais — boards antigos ficam iguais):
 *  - Mesclagem: a célula do canto superior esquerdo guarda `rowSpan`/`colSpan`; as cobertas não
 *    são desenhadas. Seleções sempre crescem para conter mesclagens inteiras (`expandRange`).
 *  - Bordas por lado (`TableCell.borders`). Um lado entre duas células usa a borda da célula da
 *    esquerda/de cima; se não houver, a da direita/de baixo; senão, a grade do estilo.
 *  - Fonte, tamanho, itálico, sublinhado, tachado e alinhamento vertical por célula.
 *  - Estilos prontos (`TABLE_STYLES`), 1ª coluna em destaque e linhas alternadas.
 */

import type { TableBorder, TableCell, TableElement, TableStyleId } from '../types/canvas';
import { isDarkColor } from './color';
import { fontCss, measureTextWidth, wrapText } from './text';
import { t } from '../i18n';
import { collator } from '../i18n/format';

export const TABLE_FONT_FAMILY = 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif';
export const TABLE_FONT_SIZE = 14;
export const TABLE_LINE_HEIGHT = 19;
export const TABLE_PAD_X = 10;
export const TABLE_PAD_Y = 8;
export const TABLE_MIN_COL = 48;
export const TABLE_MIN_ROW = 32;
export const TABLE_DEFAULT_COL = 160;
export const TABLE_DEFAULT_ROW = 40;
export const TABLE_RADIUS = 6;
export const TABLE_FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

/** Cores do conteúdo da tabela (iguais nos dois temas, como os post-its). */
export const TABLE_COLORS = {
  body: '#FFFFFF',
  header: '#E7F1D6',
  grid: '#CBD2C6',
  border: '#B9C2B3',
  text: '#18211C',
  textOnDark: '#F4F5F2',
} as const;

export interface TableStyleDef {
  id: TableStyleId;
  label: string;
  header: string;
  band: string;
  grid: string;
  border: string;
}

/** Estilos prontos: cabeçalho, faixa das linhas alternadas, grade e contorno. */
export const TABLE_STYLES: TableStyleDef[] = [
  { id: 'sage', get label() { return t('widgets.table.sageDefault'); }, header: '#E7F1D6', band: '#F6F9F1', grid: '#CBD2C6', border: '#B9C2B3' },
  { id: 'forest', get label() { return t('widgets.table.forest'); }, header: '#194B32', band: '#EEF5E6', grid: '#C9D6C0', border: '#194B32' },
  { id: 'blue', get label() { return t('widgets.table.blue'); }, header: '#DCE8FA', band: '#F3F7FD', grid: '#C3D2E8', border: '#A9BEDD' },
  { id: 'gray', get label() { return t('widgets.table.gray'); }, header: '#ECEDEA', band: '#F7F7F5', grid: '#D5D7D2', border: '#C2C5BF' },
  { id: 'amber', get label() { return t('widgets.table.amber'); }, header: '#FBEFD5', band: '#FEF9EE', grid: '#E8D9B5', border: '#D9C493' },
  { id: 'plain', get label() { return t('widgets.table.noColor'); }, header: '#FFFFFF', band: '#FAFAF9', grid: '#D9DCD6', border: '#C9CDC6' },
];

export function tableStyleOf(el: Pick<TableElement, 'tableStyle'>): TableStyleDef {
  return TABLE_STYLES.find((s) => s.id === el.tableStyle) ?? TABLE_STYLES[0];
}

/** Paleta de fundo das células (inclui "sem cor"). */
export const TABLE_CELL_FILLS = ['', '#FFFFFF', '#F4F5F2', '#E7F1D6', '#D0E4AE', '#FFF6A5', '#FFE066', '#FFC58F', '#FF9F8F', '#FFD0EC', '#BFD5FF', '#A7E6FA', '#8FE3D3', '#BBA9FF', '#194B32', '#1F2421'];
/** Cores de borda. */
export const TABLE_BORDER_COLORS = ['#18211C', '#5B655E', '#9AA39C', '#CBD2C6', '#194B32', '#2F7D4F', '#2C64A8', '#C2412D', '#E0A21B', '#7B5CD6'];

export interface CellRef {
  r: number;
  c: number;
}

export interface CellRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

type Side = 't' | 'r' | 'b' | 'l';
type Cells = TableElement['cells'];

export const cellKey = (r: number, c: number): string => `${r}-${c}`;

export function getCell(el: Pick<TableElement, 'cells'>, r: number, c: number): TableCell {
  return el.cells[cellKey(r, c)] ?? { text: '' };
}

export function normalizeRange(a: CellRef, b: CellRef): CellRange {
  return { r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) };
}

export function rangeContains(range: CellRange, r: number, c: number): boolean {
  return r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
}

export function rangeIsSingle(range: CellRange): boolean {
  return range.r0 === range.r1 && range.c0 === range.c1;
}

/** "B3" / "B2:D4" — nome de planilha para a célula ou o intervalo (colunas A, B, … Z, AA…). */
export function columnName(c: number): string {
  let n = c + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function rangeName(range: CellRange): string {
  const a = `${columnName(range.c0)}${range.r0 + 1}`;
  return rangeIsSingle(range) ? a : `${a}:${columnName(range.c1)}${range.r1 + 1}`;
}

export function isHeaderRow(el: Pick<TableElement, 'headerRow'>, r: number): boolean {
  return r === 0 && el.headerRow !== false;
}

export function isHeaderCol(el: Pick<TableElement, 'headerCol'>, c: number): boolean {
  return c === 0 && !!el.headerCol;
}

/* --------------------------------- Mesclagem --------------------------------- */

export interface MergeArea {
  r: number;
  c: number;
  rs: number;
  cs: number;
}

interface MergeInfo {
  areas: MergeArea[];
  /** chave de cada célula coberta → área */
  owner: Map<string, MergeArea>;
}

const mergeCache = new WeakMap<Cells, { key: string; info: MergeInfo }>();

export function mergeInfo(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>): MergeInfo {
  const key = `${el.rows}x${el.cols}`;
  const hit = mergeCache.get(el.cells);
  if (hit && hit.key === key) return hit.info;
  const areas: MergeArea[] = [];
  const owner = new Map<string, MergeArea>();
  for (const k in el.cells) {
    const cell = el.cells[k];
    if (!cell.rowSpan && !cell.colSpan) continue;
    const [r, c] = k.split('-').map(Number);
    if (r >= el.rows || c >= el.cols || owner.has(k)) continue;
    const rs = Math.max(1, Math.min(cell.rowSpan ?? 1, el.rows - r));
    const cs = Math.max(1, Math.min(cell.colSpan ?? 1, el.cols - c));
    if (rs === 1 && cs === 1) continue;
    const area = { r, c, rs, cs };
    areas.push(area);
    for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (!owner.has(cellKey(i, j))) owner.set(cellKey(i, j), area);
  }
  const info = { areas, owner };
  mergeCache.set(el.cells, { key, info });
  return info;
}

/** Célula que manda na posição (a dona da mesclagem, ou a própria). */
export function anchorOf(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, r: number, c: number): CellRef {
  const a = mergeInfo(el).owner.get(cellKey(r, c));
  return a ? { r: a.r, c: a.c } : { r, c };
}

export function spanOf(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, r: number, c: number): { rs: number; cs: number } {
  const a = mergeInfo(el).owner.get(cellKey(r, c));
  return a ? { rs: a.rs, cs: a.cs } : { rs: 1, cs: 1 };
}

/** Cresce o intervalo até conter inteiras todas as mesclagens que ele toca. */
export function expandRange(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, range: CellRange): CellRange {
  const { areas } = mergeInfo(el);
  const out = { ...range };
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of areas) {
      const ar1 = a.r + a.rs - 1;
      const ac1 = a.c + a.cs - 1;
      const touches = a.r <= out.r1 && ar1 >= out.r0 && a.c <= out.c1 && ac1 >= out.c0;
      if (!touches) continue;
      if (a.r < out.r0 || ar1 > out.r1 || a.c < out.c0 || ac1 > out.c1) {
        out.r0 = Math.min(out.r0, a.r);
        out.c0 = Math.min(out.c0, a.c);
        out.r1 = Math.max(out.r1, ar1);
        out.c1 = Math.max(out.c1, ac1);
        changed = true;
      }
    }
  }
  return out;
}

export function rangeHasMerge(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, range: CellRange): boolean {
  return mergeInfo(el).areas.some((a) => a.r <= range.r1 && a.r + a.rs - 1 >= range.r0 && a.c <= range.c1 && a.c + a.cs - 1 >= range.c0);
}

/** Mescla o intervalo: o texto das células é juntado (uma linha por célula) na célula do canto. */
export function mergeRange(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, range: CellRange): { cells: Cells; combined: boolean } {
  const r = expandRange(el, range);
  const texts: string[] = [];
  const first = el.cells[cellKey(r.r0, r.c0)] ?? { text: '' };
  for (let i = r.r0; i <= r.r1; i++)
    for (let j = r.c0; j <= r.c1; j++) {
      const t = el.cells[cellKey(i, j)]?.text?.trim();
      if (t) texts.push(t);
    }
  const out: Cells = { ...el.cells };
  for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) delete out[cellKey(i, j)];
  const rs = r.r1 - r.r0 + 1;
  const cs = r.c1 - r.c0 + 1;
  const anchor: TableCell = { ...first, text: texts.join('\n') };
  delete anchor.rowSpan;
  delete anchor.colSpan;
  if (rs > 1) anchor.rowSpan = rs;
  if (cs > 1) anchor.colSpan = cs;
  out[cellKey(r.r0, r.c0)] = anchor;
  return { cells: out, combined: texts.length > 1 };
}

export function unmergeRange(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, range: CellRange): Cells {
  const out: Cells = { ...el.cells };
  for (const a of mergeInfo(el).areas) {
    if (a.r > range.r1 || a.r + a.rs - 1 < range.r0 || a.c > range.c1 || a.c + a.cs - 1 < range.c0) continue;
    const k = cellKey(a.r, a.c);
    const next = { ...out[k] };
    delete next.rowSpan;
    delete next.colSpan;
    out[k] = next;
  }
  return out;
}

/* ---------------------------------- Estilo ----------------------------------- */

export function cellFontSize(cell: TableCell): number {
  return cell.fontSize && cell.fontSize > 0 ? cell.fontSize : TABLE_FONT_SIZE;
}

export function cellLineHeight(cell: TableCell): number {
  return Math.round(cellFontSize(cell) * 1.36);
}

export function cellFont(el: Pick<TableElement, 'headerRow' | 'headerCol' | 'cells'>, r: number, c: number): string {
  const cell = getCell(el, r, c);
  const bold = cell.bold ?? (isHeaderRow(el, r) || isHeaderCol(el, c));
  const family = cell.fontName ? fontCss(cell.fontName) : TABLE_FONT_FAMILY;
  return `${cell.italic ? 'italic ' : ''}${bold ? 700 : 400} ${cellFontSize(cell)}px ${family}`;
}

export function cellBackground(el: Pick<TableElement, 'headerRow' | 'headerCol' | 'banded' | 'tableStyle' | 'cells'>, r: number, c: number): string {
  const cell = getCell(el, r, c);
  if (cell.bgColor) return cell.bgColor;
  const style = tableStyleOf(el);
  if (isHeaderRow(el, r) || isHeaderCol(el, c)) return style.header;
  if (el.banded) {
    const bodyIndex = r - (el.headerRow !== false ? 1 : 0);
    if (bodyIndex % 2 === 1) return style.band;
  }
  return TABLE_COLORS.body;
}

export function cellTextColor(el: Pick<TableElement, 'headerRow' | 'headerCol' | 'banded' | 'tableStyle' | 'cells'>, r: number, c: number): string {
  const cell = getCell(el, r, c);
  if (cell.textColor) return cell.textColor;
  return isDarkColor(cellBackground(el, r, c)) ? TABLE_COLORS.textOnDark : TABLE_COLORS.text;
}

/* ---------------------------------- Layout ----------------------------------- */

export interface TableCellLayout {
  r: number;
  c: number;
  rowSpan: number;
  colSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  font: string;
  fontSize: number;
  lineHeight: number;
  /** Distância do topo da célula até a 1ª linha (alinhamento vertical) */
  textTop: number;
  background: string;
  color: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  underline: boolean;
  strikethrough: boolean;
}

export interface TableEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface TableLayout {
  width: number;
  height: number;
  colX: number[];
  rowY: number[];
  colW: number[];
  rowH: number[];
  cells: TableCellLayout[];
  byKey: Record<string, TableCellLayout>;
  /** Linhas da grade e bordas (sem as de largura 0) */
  edges: TableEdge[];
  /** Contorno personalizado: a tabela perde os cantos arredondados e o contorno vem de `edges` */
  customOuter: boolean;
}

type LayoutInput = Pick<TableElement, 'rows' | 'cols' | 'colWidths' | 'rowHeights' | 'cells' | 'headerRow' | 'headerCol' | 'banded' | 'tableStyle'>;

const cache = new WeakMap<Cells, { key: string; layout: TableLayout }>();

/** Largura/altura de cada coluna/linha válidas para o número atual de linhas e colunas. */
function sizes(el: Pick<TableElement, 'rows' | 'cols' | 'colWidths' | 'rowHeights'>): { colW: number[]; minRowH: number[] } {
  const colW = Array.from({ length: el.cols }, (_, c) => Math.max(TABLE_MIN_COL, el.colWidths[c] ?? TABLE_DEFAULT_COL));
  const minRowH = Array.from({ length: el.rows }, (_, r) => Math.max(TABLE_MIN_ROW, el.rowHeights[r] ?? TABLE_DEFAULT_ROW));
  return { colW, minRowH };
}

const sum = (arr: number[], from: number, count: number) => arr.slice(from, from + count).reduce((a, b) => a + b, 0);

function sameBorder(a: TableBorder | undefined, b: TableBorder | undefined): boolean {
  return (a?.color ?? '') === (b?.color ?? '') && (a?.width ?? -1) === (b?.width ?? -1) && (a?.style ?? 'solid') === (b?.style ?? 'solid');
}

export function layoutTable(el: LayoutInput): TableLayout {
  const key = `${el.rows}x${el.cols}|${el.colWidths.join(',')}|${el.rowHeights.join(',')}|${el.headerRow !== false}|${!!el.headerCol}|${!!el.banded}|${el.tableStyle ?? ''}`;
  const hit = cache.get(el.cells);
  if (hit && hit.key === key) return hit.layout;

  const { colW, minRowH } = sizes(el);
  const { owner } = mergeInfo(el);
  const rowH = minRowH.slice();

  type Pending = { r: number; c: number; rs: number; cs: number; lines: string[]; need: number; cell: TableCell };
  const pending: Pending[] = [];
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < el.cols; c++) {
      const area = owner.get(cellKey(r, c));
      if (area && (area.r !== r || area.c !== c)) continue; // coberta por mesclagem
      const rs = area?.rs ?? 1;
      const cs = area?.cs ?? 1;
      const cell = getCell(el, r, c);
      const text = cell.text ?? '';
      const w = sum(colW, c, cs);
      const lines = text ? wrapText(text, Math.max(8, w - TABLE_PAD_X * 2), cellFont(el, r, c)) : [];
      const need = Math.ceil(lines.length * cellLineHeight(cell) + TABLE_PAD_Y * 2);
      if (rs === 1) rowH[r] = Math.max(rowH[r], need);
      pending.push({ r, c, rs, cs, lines, need, cell });
    }
  }
  // Células mescladas na vertical: se o texto não cabe, a última linha da mesclagem cresce
  for (const p of pending) {
    if (p.rs === 1) continue;
    const have = sum(rowH, p.r, p.rs);
    if (p.need > have) rowH[p.r + p.rs - 1] += p.need - have;
  }

  const colX: number[] = [];
  let x = 0;
  for (const w of colW) {
    colX.push(x);
    x += w;
  }
  const rowY: number[] = [];
  let y = 0;
  for (const h of rowH) {
    rowY.push(y);
    y += h;
  }

  const cells: TableCellLayout[] = [];
  const byKey: Record<string, TableCellLayout> = {};
  for (const p of pending) {
    const width = sum(colW, p.c, p.cs);
    const height = sum(rowH, p.r, p.rs);
    const lh = cellLineHeight(p.cell);
    const contentH = p.lines.length * lh;
    const valign = p.cell.valign ?? 'top';
    const textTop = valign === 'middle' ? Math.max(TABLE_PAD_Y, (height - contentH) / 2) : valign === 'bottom' ? Math.max(TABLE_PAD_Y, height - TABLE_PAD_Y - contentH) : TABLE_PAD_Y;
    const lay: TableCellLayout = {
      r: p.r,
      c: p.c,
      rowSpan: p.rs,
      colSpan: p.cs,
      x: colX[p.c],
      y: rowY[p.r],
      width,
      height,
      lines: p.lines,
      font: cellFont(el, p.r, p.c),
      fontSize: cellFontSize(p.cell),
      lineHeight: lh,
      textTop,
      background: cellBackground(el, p.r, p.c),
      color: cellTextColor(el, p.r, p.c),
      align: p.cell.align ?? 'left',
      valign,
      underline: !!p.cell.underline,
      strikethrough: !!p.cell.strikethrough,
    };
    cells.push(lay);
    byKey[cellKey(p.r, p.c)] = lay;
  }

  // ---- Bordas: cada lado entre duas posições da grade ----
  const style = tableStyleOf(el);
  const gridDefault: TableBorder = { color: style.grid, width: 1 };
  const outerDefault: TableBorder = { color: style.border, width: 1 };
  const anchorCell = (r: number, c: number): { key: string; cell: TableCell } | null => {
    if (r < 0 || c < 0 || r >= el.rows || c >= el.cols) return null;
    const a = owner.get(cellKey(r, c));
    const k = a ? cellKey(a.r, a.c) : cellKey(r, c);
    return { key: k, cell: el.cells[k] ?? { text: '' } };
  };
  type Seg = { spec: TableBorder; outer: boolean; isDefault: boolean };
  const vertical: (Seg | null)[][] = []; // [linha][fronteira 0..cols]
  const horizontal: (Seg | null)[][] = []; // [fronteira 0..rows][coluna]
  let customOuter = false;
  for (let r = 0; r < el.rows; r++) {
    vertical.push([]);
    for (let i = 0; i <= el.cols; i++) {
      const A = anchorCell(r, i - 1);
      const B = anchorCell(r, i);
      if (A && B && A.key === B.key) {
        vertical[r].push(null);
        continue;
      }
      const custom = A?.cell.borders?.r ?? B?.cell.borders?.l;
      const outer = i === 0 || i === el.cols;
      if (outer && custom) customOuter = true;
      vertical[r].push({ spec: custom ?? (outer ? outerDefault : gridDefault), outer, isDefault: !custom });
    }
  }
  for (let i = 0; i <= el.rows; i++) {
    horizontal.push([]);
    for (let c = 0; c < el.cols; c++) {
      const A = anchorCell(i - 1, c);
      const B = anchorCell(i, c);
      if (A && B && A.key === B.key) {
        horizontal[i].push(null);
        continue;
      }
      const custom = A?.cell.borders?.b ?? B?.cell.borders?.t;
      const outer = i === 0 || i === el.rows;
      if (outer && custom) customOuter = true;
      horizontal[i].push({ spec: custom ?? (outer ? outerDefault : gridDefault), outer, isDefault: !custom });
    }
  }
  const edges: TableEdge[] = [];
  const push = (seg: Seg, x1: number, y1: number, x2: number, y2: number) => {
    if (seg.spec.width <= 0) return;
    if (seg.outer && seg.isDefault && !customOuter) return; // contorno arredondado padrão é desenhado à parte
    edges.push({ x1, y1, x2, y2, color: seg.spec.color, width: seg.spec.width, style: seg.spec.style ?? 'solid' });
  };
  for (let i = 0; i <= el.cols; i++) {
    const xx = i === el.cols ? x : colX[i];
    let start = -1;
    let cur: Seg | null = null;
    for (let r = 0; r <= el.rows; r++) {
      const seg = r < el.rows ? vertical[r][i] : null;
      const same = seg && cur && sameBorder(seg.spec, cur.spec) && seg.outer === cur.outer && seg.isDefault === cur.isDefault;
      if (!same) {
        if (cur && start >= 0) push(cur, xx, rowY[start], xx, r < el.rows ? rowY[r] : y);
        cur = seg;
        start = seg ? r : -1;
      }
    }
  }
  for (let i = 0; i <= el.rows; i++) {
    const yy = i === el.rows ? y : rowY[i];
    let start = -1;
    let cur: Seg | null = null;
    for (let c = 0; c <= el.cols; c++) {
      const seg = c < el.cols ? horizontal[i][c] : null;
      const same = seg && cur && sameBorder(seg.spec, cur.spec) && seg.outer === cur.outer && seg.isDefault === cur.isDefault;
      if (!same) {
        if (cur && start >= 0) push(cur, colX[start], yy, c < el.cols ? colX[c] : x, yy);
        cur = seg;
        start = seg ? c : -1;
      }
    }
  }

  const layout: TableLayout = { width: x, height: y, colX, rowY, colW, rowH, cells, byKey, edges, customOuter };
  cache.set(el.cells, { key, layout });
  return layout;
}

export function tableSizePatch(el: LayoutInput): { width: number; height: number } {
  const l = layoutTable(el);
  return { width: l.width, height: l.height };
}

/** Célula (a dona da mesclagem) sob um ponto local ao elemento (ou null). */
export function cellAt(el: TableElement, local: { x: number; y: number }): CellRef | null {
  const l = layoutTable(el);
  if (local.x < 0 || local.y < 0 || local.x > l.width || local.y > l.height) return null;
  let c = l.colX.findIndex((x, i) => local.x >= x && local.x < x + l.colW[i]);
  let r = l.rowY.findIndex((y, i) => local.y >= y && local.y < y + l.rowH[i]);
  if (c < 0) c = el.cols - 1;
  if (r < 0) r = el.rows - 1;
  return anchorOf(el, r, c);
}

/* ------------------------------- Estrutura ---------------------------------- */

type TableData = Pick<TableElement, 'rows' | 'cols' | 'colWidths' | 'rowHeights' | 'cells'>;

function rekey(cells: Cells, map: (r: number, c: number) => CellRef | null): Cells {
  const out: Cells = {};
  for (const k in cells) {
    const [r, c] = k.split('-').map(Number);
    const to = map(r, c);
    if (to) out[cellKey(to.r, to.c)] = cells[k];
  }
  return out;
}

/** Ajusta os spans antes de uma mudança estrutural (linhas: axis 'r'; colunas: axis 'c'). */
function adjustSpans(el: TableData, axis: 'r' | 'c', at: number, op: 'insert' | 'delete'): Cells {
  const out: Cells = { ...el.cells };
  for (const a of mergeInfo(el).areas) {
    const start = axis === 'r' ? a.r : a.c;
    const span = axis === 'r' ? a.rs : a.cs;
    const k = cellKey(a.r, a.c);
    const spanKey = axis === 'r' ? 'rowSpan' : 'colSpan';
    if (op === 'insert') {
      if (start < at && start + span > at) out[k] = { ...out[k], [spanKey]: span + 1 };
      continue;
    }
    if (start < at && start + span - 1 >= at) {
      const next = { ...out[k] };
      if (span - 1 > 1) next[spanKey] = span - 1;
      else delete next[spanKey];
      out[k] = next;
    } else if (start === at && span > 1) {
      // a linha/coluna da célula dona some: a próxima posição da mesclagem herda o conteúdo
      const moved = { ...out[k] };
      if (span - 1 > 1) moved[spanKey] = span - 1;
      else delete moved[spanKey];
      const to = axis === 'r' ? cellKey(a.r + 1, a.c) : cellKey(a.r, a.c + 1);
      out[to] = moved;
      delete out[k];
    }
  }
  return out;
}

export function insertRow(el: TableData, at: number): TableData {
  const rowHeights = [...el.rowHeights];
  rowHeights.splice(at, 0, el.rowHeights[Math.min(at, el.rows - 1)] ?? TABLE_DEFAULT_ROW);
  const cells = adjustSpans(el, 'r', at, 'insert');
  return { ...el, rows: el.rows + 1, rowHeights, cells: rekey(cells, (r, c) => ({ r: r >= at ? r + 1 : r, c })) };
}

export function deleteRow(el: TableData, at: number): TableData {
  if (el.rows <= 1) return el;
  const rowHeights = el.rowHeights.filter((_, i) => i !== at);
  const cells = adjustSpans(el, 'r', at, 'delete');
  return { ...el, rows: el.rows - 1, rowHeights, cells: rekey(cells, (r, c) => (r === at ? null : { r: r > at ? r - 1 : r, c })) };
}

export function insertCol(el: TableData, at: number): TableData {
  const colWidths = [...el.colWidths];
  colWidths.splice(at, 0, el.colWidths[Math.min(at, el.cols - 1)] ?? TABLE_DEFAULT_COL);
  const cells = adjustSpans(el, 'c', at, 'insert');
  return { ...el, cols: el.cols + 1, colWidths, cells: rekey(cells, (r, c) => ({ r, c: c >= at ? c + 1 : c })) };
}

export function deleteCol(el: TableData, at: number): TableData {
  if (el.cols <= 1) return el;
  const colWidths = el.colWidths.filter((_, i) => i !== at);
  const cells = adjustSpans(el, 'c', at, 'delete');
  return { ...el, cols: el.cols - 1, colWidths, cells: rekey(cells, (r, c) => (c === at ? null : { r, c: c > at ? c - 1 : c })) };
}

function isEmptyCell(cell: TableCell): boolean {
  return !cell.text && (Object.keys(cell) as (keyof TableCell)[]).every((k) => k === 'text' || cell[k] === undefined);
}

/** Aplica `patch` às células do intervalo (pula as cobertas por mesclagem; célula vazia sem estilo é removida). */
export function patchRange(cells: Cells, range: CellRange, patch: Partial<TableCell>, el?: Pick<TableElement, 'rows' | 'cols'>): Cells {
  const out = { ...cells };
  const info = el ? mergeInfo({ cells, rows: el.rows, cols: el.cols }) : null;
  for (let r = range.r0; r <= range.r1; r++) {
    for (let c = range.c0; c <= range.c1; c++) {
      const k = cellKey(r, c);
      const area = info?.owner.get(k);
      if (area && (area.r !== r || area.c !== c)) continue;
      const next: TableCell = { ...(out[k] ?? { text: '' }), ...patch };
      for (const key of Object.keys(next) as (keyof TableCell)[]) {
        if (key !== 'text' && (next[key] === undefined || next[key] === '')) delete next[key];
      }
      if (isEmptyCell(next)) delete out[k];
      else out[k] = next;
    }
  }
  return out;
}

/* ---------------------------------- Bordas ----------------------------------- */

export type BorderPreset = 'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'horizontal' | 'vertical' | 'none' | 'clear';

const OPPOSITE: Record<Side, Side> = { t: 'b', b: 't', l: 'r', r: 'l' };

/**
 * Aplica um modelo de bordas ao intervalo. `spec` é a borda escolhida (cor, espessura, estilo);
 * 'none' grava largura 0 (some até a grade) e 'clear' volta à grade padrão do estilo.
 */
export function applyBorderPreset(el: Pick<TableElement, 'cells' | 'rows' | 'cols'>, range0: CellRange, preset: BorderPreset, spec: TableBorder): Cells {
  const range = expandRange(el, range0);
  const out: Cells = { ...el.cells };
  const copied = new Set<string>();
  const mut = (k: string): TableCell => {
    if (!copied.has(k)) {
      out[k] = { ...(out[k] ?? { text: '' }), borders: { ...(out[k]?.borders ?? {}) } };
      copied.add(k);
    }
    return out[k];
  };
  const write = (k: string, side: Side, value: TableBorder | undefined) => {
    const cell = mut(k);
    const borders = { ...(cell.borders ?? {}) };
    if (value) borders[side] = value;
    else delete borders[side];
    cell.borders = borders;
  };
  const anchorKey = (r: number, c: number): string | null => {
    if (r < 0 || c < 0 || r >= el.rows || c >= el.cols) return null;
    const a = anchorOf(el, r, c);
    return cellKey(a.r, a.c);
  };
  const value = preset === 'clear' ? undefined : preset === 'none' ? { color: spec.color, width: 0 } : spec;

  const wants = (side: Side, perimeter: boolean): boolean => {
    switch (preset) {
      case 'all':
      case 'none':
      case 'clear':
        return true;
      case 'outer':
        return perimeter;
      case 'inner':
        return !perimeter;
      case 'horizontal':
        return !perimeter && (side === 't' || side === 'b');
      case 'vertical':
        return !perimeter && (side === 'l' || side === 'r');
      case 'top':
        return perimeter && side === 't';
      case 'bottom':
        return perimeter && side === 'b';
      case 'left':
        return perimeter && side === 'l';
      case 'right':
        return perimeter && side === 'r';
    }
  };

  for (let r = range.r0; r <= range.r1; r++) {
    for (let c = range.c0; c <= range.c1; c++) {
      const here = anchorKey(r, c)!;
      const sides: [Side, number, number, boolean][] = [
        ['t', r - 1, c, r === range.r0],
        ['b', r + 1, c, r === range.r1],
        ['l', r, c - 1, c === range.c0],
        ['r', r, c + 1, c === range.c1],
      ];
      for (const [side, nr, nc, perimeter] of sides) {
        const there = anchorKey(nr, nc);
        if (there === here) continue; // lado interno de uma mesclagem
        if (!wants(side, perimeter)) continue;
        write(here, side, value);
        if (there) {
          if (perimeter) {
            // o vizinho de fora não pode "vencer" a borda escolhida
            if (out[there]?.borders?.[OPPOSITE[side]] !== undefined) write(there, OPPOSITE[side], undefined);
          } else write(there, OPPOSITE[side], value);
        }
      }
    }
  }
  for (const k of copied) {
    const cell = out[k];
    if (cell.borders && Object.keys(cell.borders).length === 0) delete cell.borders;
    if (isEmptyCell(cell)) delete out[k];
  }
  return out;
}

/* --------------------------------- Ordenar ----------------------------------- */

/**
 * Ordena as linhas do corpo pela coluna `col` (o cabeçalho fica no lugar). Números são comparados
 * como números; vazios vão para o fim. Devolve null se houver mesclagem no corpo.
 */
export function sortRowsBy(el: TableData & Pick<TableElement, 'headerRow'>, col: number, dir: 'asc' | 'desc'): TableData | null {
  const from = el.headerRow !== false ? 1 : 0;
  if (mergeInfo(el).areas.some((a) => a.r + a.rs - 1 >= from)) return null;
  const order = Array.from({ length: el.rows - from }, (_, i) => i + from);
  const text = (r: number) => (el.cells[cellKey(r, col)]?.text ?? '').trim();
  const num = (t: string) => {
    const n = Number(t.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return t && /\d/.test(t) && Number.isFinite(n) ? n : null;
  };
  order.sort((a, b) => {
    const ta = text(a);
    const tb = text(b);
    if (!ta && !tb) return a - b;
    if (!ta) return 1;
    if (!tb) return -1;
    const na = num(ta);
    const nb = num(tb);
    const cmp = na !== null && nb !== null ? na - nb : collator({ numeric: true, sensitivity: 'base' }).compare(ta, tb);
    return (dir === 'asc' ? cmp : -cmp) || a - b;
  });
  const map = new Map<number, number>();
  order.forEach((oldR, i) => map.set(oldR, i + from));
  const rowHeights = el.rowHeights.slice();
  order.forEach((oldR, i) => {
    rowHeights[i + from] = el.rowHeights[oldR] ?? TABLE_DEFAULT_ROW;
  });
  return { ...el, rowHeights, cells: rekey(el.cells, (r, c) => ({ r: r < from ? r : map.get(r) ?? r, c })) };
}

/** Grade de dados (texto) para CSV/busca. */
export function tableToRows(el: Pick<TableElement, 'rows' | 'cols' | 'cells'>): string[][] {
  return Array.from({ length: el.rows }, (_, r) => Array.from({ length: el.cols }, (_, c) => el.cells[cellKey(r, c)]?.text ?? ''));
}

/** Intervalo como TSV (copiar para colar em planilhas). */
export function rangeToTsv(el: Pick<TableElement, 'cells'>, range: CellRange): string {
  const rows: string[] = [];
  for (let r = range.r0; r <= range.r1; r++) {
    const cols: string[] = [];
    for (let c = range.c0; c <= range.c1; c++) {
      const t = el.cells[cellKey(r, c)]?.text ?? '';
      cols.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    }
    rows.push(cols.join('\t'));
  }
  return rows.join('\n');
}

/* ---------------------------------- Export ----------------------------------- */

function dashFor(style: TableEdge['style'], width: number): number[] {
  if (style === 'dashed') return [width * 4, width * 3];
  if (style === 'dotted') return [width, width * 2];
  return [];
}

export function edgeDashArray(edge: TableEdge): string | undefined {
  const d = dashFor(edge.style, edge.width);
  return d.length ? d.join(' ') : undefined;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha a tabela no Canvas 2D (coordenadas locais do elemento) — mesma geometria da tela. */
export function drawTableToCanvas(ctx: CanvasRenderingContext2D, el: TableElement): void {
  const l = layoutTable(el);
  const radius = l.customOuter ? 0 : TABLE_RADIUS;
  ctx.save();
  roundRectPath(ctx, 0, 0, l.width, l.height, radius);
  ctx.fillStyle = TABLE_COLORS.body;
  ctx.fill();
  ctx.clip();
  for (const cell of l.cells) {
    if (cell.background !== TABLE_COLORS.body) {
      ctx.fillStyle = cell.background;
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
    if (!cell.lines.length) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    ctx.font = cell.font;
    ctx.fillStyle = cell.color;
    ctx.strokeStyle = cell.color;
    ctx.lineWidth = Math.max(1, cell.fontSize / 14);
    ctx.textBaseline = 'middle';
    cell.lines.forEach((line, i) => {
      const w = measureTextWidth(line, cell.font);
      let tx = cell.x + TABLE_PAD_X;
      if (cell.align === 'center') tx = cell.x + (cell.width - w) / 2;
      if (cell.align === 'right') tx = cell.x + cell.width - TABLE_PAD_X - w;
      const cy = cell.y + cell.textTop + cell.lineHeight * (i + 0.5);
      ctx.fillText(line, tx, cy);
      if (cell.underline && line) {
        ctx.beginPath();
        ctx.moveTo(tx, cy + cell.fontSize * 0.45);
        ctx.lineTo(tx + w, cy + cell.fontSize * 0.45);
        ctx.stroke();
      }
      if (cell.strikethrough && line) {
        ctx.beginPath();
        ctx.moveTo(tx, cy + cell.fontSize * 0.04);
        ctx.lineTo(tx + w, cy + cell.fontSize * 0.04);
        ctx.stroke();
      }
    });
    ctx.restore();
  }
  ctx.restore();
  for (const e of l.edges) {
    ctx.save();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = e.width;
    ctx.setLineDash(dashFor(e.style, e.width));
    ctx.beginPath();
    const off = e.width % 2 === 1 ? 0.5 : 0;
    ctx.moveTo(e.x1 + (e.x1 === e.x2 ? off : 0), e.y1 + (e.y1 === e.y2 ? off : 0));
    ctx.lineTo(e.x2 + (e.x1 === e.x2 ? off : 0), e.y2 + (e.y1 === e.y2 ? off : 0));
    ctx.stroke();
    ctx.restore();
  }
  if (!l.customOuter) {
    roundRectPath(ctx, 0.5, 0.5, l.width - 1, l.height - 1, TABLE_RADIUS);
    ctx.strokeStyle = tableStyleOf(el).border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
