/**
 * LuDraw — Planilha → objetos do board (Chat 05).
 *
 * Três destinos, todos montados ANTES de inserir (um único `addElements` = um passo de desfazer):
 * (a) Tabela nativa — `createTable` com cabeçalho, cores, negrito, alinhamento e mesclagens;
 * (b) Cards de Kanban — `createKanban` + `createKanbanCard`, com as colunas do arquivo mapeadas
 *     para título, coluna/status, prioridade, responsável, etiquetas, story points…;
 * (c) Grade de post-its — um por célula ou um por linha.
 * Opcional: um Frame com o nome da planilha em volta de tudo.
 */

import type { CanvasElement, KanbanCard, KanbanColumn, StickyNoteElement, TableCell, TableElement } from '../types/canvas';
import { looksNumeric, parseLocaleNumber } from './csv';
import { createFrame, createKanban, createStickyNote, createTable, stickyColor } from './factory';
import { createId } from './id';
import { createKanbanCard, createKanbanColumn, KANBAN_COLUMN_COLORS } from './kanban';
import { expandRect, getBoundsOfElements } from './math';
import { sheetCellText, type SheetData } from './sheets';
import { cellKey, TABLE_FONT_FAMILY, TABLE_FONT_SIZE, TABLE_MIN_COL, TABLE_PAD_X, tableSizePatch } from './table';
import { measureTextWidth } from './text';
import { t } from '../i18n';

export type SheetDestination = 'table' | 'kanban' | 'stickies';

export const DESTINATION_LABELS: Record<SheetDestination, string> = {
  get table() { return t('importexport.sheetImport.nativeTable'); },
  get kanban() { return t('importexport.sheetImport.kanbanCards'); },
  get stickies() { return t('importexport.sheetImport.stickyNoteGrid'); },
};

export type KanbanField = 'title' | 'status' | 'priority' | 'assignee' | 'labels' | 'points' | 'description' | 'due';

export const KANBAN_FIELD_LABELS: Record<KanbanField, string> = {
  get title() { return t('importexport.sheetImport.cardTitle'); },
  get status() { return t('importexport.sheetImport.columnStatus'); },
  get priority() {
    return t('importexport.sheetImport.priority');
  },
  get assignee() { return t('common.assignee'); },
  get labels() { return t('importexport.sheetImport.labels'); },
  get points() { return t('importexport.sheetImport.storyPoints'); },
  get description() { return t('importexport.sheetImport.description'); },
  get due() {
    return t('importexport.sheetImport.due');
  },
};

export type KanbanMapping = Record<KanbanField, number | null>;

export interface SheetImportOptions {
  destination: SheetDestination;
  headerRow: boolean;
  decimalComma: boolean;
  /** Nome do frame/kanban (nome da aba ou do arquivo) */
  name: string;
  frame: boolean;
  kanban: KanbanMapping;
  stickies: { mode: 'cell' | 'row'; color: string };
  /** Escala de criação (zoom) */
  unit: number;
}

/** Acima disto pedimos confirmação (post-its/cards) — tabelas: acima de `TABLE_CELLS_CONFIRM` células. */
export const ITEMS_CONFIRM = 500;
export const TABLE_CELLS_CONFIRM = 10000;

const HEADER_HINTS: Record<KanbanField, RegExp> = {
  title: /^(t[ií]tulo|title|summary|resumo|nome|name|tarefa|task|item|assunto|hist[óo]ria|card)/i,
  status: /^(status|situa[çc][ãa]o|coluna|column|etapa|fase|stage|estado|state|lista|list)/i,
  priority: /^(prioridade|priority|urg[êe]ncia|severidade|severity)/i,
  assignee: /^(respons[áa]vel|assignee|dono|owner|atribu[íi]do|assigned|pessoa)/i,
  labels: /^(etiquetas?|tags?|labels?|r[óo]tulos?|categorias?)/i,
  points: /^(story ?points?|pontos?|points?|estimativa|esfor[çc]o|sp)$/i,
  description: /^(descri[çc][ãa]o|description|detalhes?|notas?|details?)/i,
  due: /^(prazo|due|vencimento|data limite|deadline|entrega)/i,
};

/** Sugere o mapeamento pelos nomes do cabeçalho (pt-BR e inglês); sem cabeçalho, título = 1ª coluna. */
export function guessKanbanMapping(headers: string[]): KanbanMapping {
  const map: KanbanMapping = { title: null, status: null, priority: null, assignee: null, labels: null, points: null, description: null, due: null };
  const used = new Set<number>();
  (Object.keys(HEADER_HINTS) as KanbanField[]).forEach((field) => {
    const i = headers.findIndex((h, idx) => !used.has(idx) && HEADER_HINTS[field].test(h.trim()));
    if (i >= 0) {
      map[field] = i;
      used.add(i);
    }
  });
  if (map.title === null) {
    const first = headers.findIndex((_, i) => !used.has(i));
    map.title = first >= 0 ? first : 0;
  }
  return map;
}

export function priorityFrom(raw: string): KanbanCard['priority'] | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (/^(alta|high|urgente|urgent|cr[íi]tica|critical|highest|1|p1|p0)$/.test(s) || s.startsWith('alt')) return 'high';
  if (/^(m[ée]dia|medium|normal|moderada|2|p2)$/.test(s) || s.startsWith('m')) return 'medium';
  if (/^(baixa|low|lowest|menor|3|p3|p4)$/.test(s) || s.startsWith('baix')) return 'low';
  return undefined;
}

/** Prazo → `AAAA-MM-DD` (aceita `AAAA-MM-DD` e `DD/MM/AAAA`); outros formatos são ignorados. */
export function dueDateFrom(raw: string): string | undefined {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

function dataRows(sheet: SheetData, opts: Pick<SheetImportOptions, 'headerRow' | 'decimalComma'>): string[][] {
  const rows = sheet.rows.map((row) => row.map((c) => sheetCellText(c, opts.decimalComma)));
  return (opts.headerRow ? rows.slice(1) : rows).filter((r) => r.some((v) => v.trim()));
}

export function headerNames(sheet: SheetData, opts: Pick<SheetImportOptions, 'headerRow' | 'decimalComma'>): string[] {
  const width = sheet.rows[0]?.length ?? 0;
  if (!opts.headerRow || !sheet.rows.length) return Array.from({ length: width }, (_, i) => t('importexport.sheetImport.columnValue', { value: i + 1 }));
  return sheet.rows[0].map((c, i) => sheetCellText(c, opts.decimalComma).trim() || t('importexport.sheetImport.columnValue', { value: i + 1 }));
}

/** Quantos post-its/cards/células o destino vai criar (para a confirmação). */
export function outputCount(sheet: SheetData, opts: SheetImportOptions): { count: number; noun: string; needsConfirm: boolean } {
  if (opts.destination === 'table') {
    const cells = sheet.rows.length * (sheet.rows[0]?.length ?? 0);
    return { count: cells, noun: t('importexport.sheetImport.nounCell', { count: cells }), needsConfirm: cells > TABLE_CELLS_CONFIRM };
  }
  if (opts.destination === 'kanban') {
    const n = dataRows(sheet, opts).length;
    return { count: n, noun: t('importexport.sheetImport.nounCard', { count: n }), needsConfirm: n > ITEMS_CONFIRM };
  }
  const n = opts.stickies.mode === 'row' ? dataRows(sheet, opts).length : sheet.rows.reduce((sum, row) => sum + row.filter((c) => c && sheetCellText(c, opts.decimalComma).trim()).length, 0);
  return { count: n, noun: t('importexport.sheetImport.nounSticky', { count: n }), needsConfirm: n > ITEMS_CONFIRM };
}

/* --------------------------------- Tabela ---------------------------------- */

export function buildTableFromSheet(sheet: SheetData, opts: SheetImportOptions): TableElement {
  const rows = Math.max(1, sheet.rows.length);
  const cols = Math.max(1, sheet.rows[0]?.length ?? 1);
  const font = `400 ${TABLE_FONT_SIZE}px ${TABLE_FONT_FAMILY}`;
  const bold = `700 ${TABLE_FONT_SIZE}px ${TABLE_FONT_FAMILY}`;
  const colWidths = Array.from({ length: cols }, () => 0);
  const numericCount = Array.from({ length: cols }, () => 0);
  const filledCount = Array.from({ length: cols }, () => 0);
  const cells: TableElement['cells'] = {};
  sheet.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) return;
      const text = sheetCellText(cell, opts.decimalComma);
      const isHeader = opts.headerRow && r === 0;
      if (text.trim() && !isHeader) {
        filledCount[c]++;
        if (cell.num !== undefined || looksNumeric(text)) numericCount[c]++;
      }
      if (r < 300 && (cell.colSpan ?? 1) === 1) {
        const longest = text.split('\n').reduce((m, line) => Math.max(m, measureTextWidth(line, cell.bold || isHeader ? bold : font)), 0);
        colWidths[c] = Math.max(colWidths[c], longest + TABLE_PAD_X * 2 + 6);
      }
      const out: TableCell = { text };
      if (cell.bold) out.bold = true;
      if (cell.italic) out.italic = true;
      if (cell.bg) out.bgColor = cell.bg;
      if (cell.color) out.textColor = cell.color;
      if (cell.align) out.align = cell.align;
      if (cell.rowSpan && cell.rowSpan > 1) out.rowSpan = Math.min(cell.rowSpan, rows - r);
      if (cell.colSpan && cell.colSpan > 1) out.colSpan = Math.min(cell.colSpan, cols - c);
      if (text || Object.keys(out).length > 1) cells[cellKey(r, c)] = out;
    });
  });
  // colunas numéricas alinham à direita (quando a célula não define alinhamento)
  for (let c = 0; c < cols; c++) {
    if (filledCount[c] && numericCount[c] / filledCount[c] >= 0.8) {
      for (let r = opts.headerRow ? 1 : 0; r < rows; r++) {
        const k = cellKey(r, c);
        if (cells[k] && !cells[k].align) cells[k] = { ...cells[k], align: 'right' };
      }
    }
  }
  const widths = colWidths.map((w) => Math.round(Math.max(TABLE_MIN_COL + 16, Math.min(320, w || 120))));
  const base = createTable({ x: 0, y: 0 }, { rows, cols, colWidths: widths, headerRow: opts.headerRow });
  const draft = { ...base, cells };
  return { ...draft, ...tableSizePatch(draft) };
}

/* --------------------------------- Kanban ---------------------------------- */

export function buildKanbanFromSheet(sheet: SheetData, opts: SheetImportOptions): CanvasElement {
  const m = opts.kanban;
  const rows = dataRows(sheet, opts);
  const get = (row: string[], field: KanbanField) => (m[field] !== null && m[field] !== undefined ? (row[m[field] as number] ?? '').trim() : '');
  const columns = new Map<string, KanbanColumn>();
  const fallbackColumn = m.status === null ? t('common.toDo') : t('importexport.sheetImport.noStatus');
  for (const row of rows) {
    const title = get(row, 'title');
    const status = get(row, 'status') || fallbackColumn;
    if (!columns.has(status)) columns.set(status, createKanbanColumn(status, KANBAN_COLUMN_COLORS[columns.size % KANBAN_COLUMN_COLORS.length], []));
    const points = parseLocaleNumber(get(row, 'points'), opts.decimalComma);
    const labels = get(row, 'labels')
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const card = createKanbanCard({
      title: title || t('importexport.sheetImport.untitledCard'),
      ...(get(row, 'description') ? { description: get(row, 'description') } : {}),
      ...(get(row, 'assignee') ? { assignee: get(row, 'assignee') } : {}),
      ...(priorityFrom(get(row, 'priority')) ? { priority: priorityFrom(get(row, 'priority')) } : {}),
      ...(points !== null && points >= 0 ? { storyPoints: Math.round(points * 10) / 10 } : {}),
      ...(dueDateFrom(get(row, 'due')) ? { dueDate: dueDateFrom(get(row, 'due')) } : {}),
      tags: labels,
    });
    columns.get(status)!.cards.push(card);
  }
  const list = Array.from(columns.values());
  return createKanban({ x: 0, y: 0 }, { title: opts.name || t('importexport.sheetImport.importedKanban'), columns: list.length ? list : [createKanbanColumn(fallbackColumn, KANBAN_COLUMN_COLORS[0], [])] });
}

/* -------------------------------- Post-its --------------------------------- */

/** Cor do post-it de cabeçalho na grade de post-its (Lima, da paleta do Chat 05.5). */
export const HEADER_STICKY_COLOR = stickyColor('lima');

export function buildStickiesFromSheet(sheet: SheetData, opts: SheetImportOptions): StickyNoteElement[] {
  const size = 200 * opts.unit;
  const gap = 20 * opts.unit;
  const groupId = createId();
  const out: StickyNoteElement[] = [];
  if (opts.stickies.mode === 'cell') {
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const text = cell ? sheetCellText(cell, opts.decimalComma).trim() : '';
        if (!text) return;
        out.push(
          createStickyNote({ x: c * (size + gap), y: r * (size + gap), width: size, height: size, text, groupId, color: opts.headerRow && r === 0 ? HEADER_STICKY_COLOR : opts.stickies.color }),
        );
      });
    });
    return out;
  }
  const headers = headerNames(sheet, opts);
  const rows = dataRows(sheet, opts);
  const perRow = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(rows.length * 1.6))));
  rows.forEach((row, i) => {
    const parts = row
      .map((v, c) => ({ v: v.trim(), h: headers[c] }))
      .filter((p) => p.v)
      .map((p, idx) => (opts.headerRow && idx > 0 ? `${p.h}: ${p.v}` : p.v));
    out.push(createStickyNote({ x: (i % perRow) * (size + gap), y: Math.floor(i / perRow) * (size + gap), width: size, height: size, text: parts.join('\n'), groupId, color: opts.stickies.color }));
  });
  return out;
}

/* -------------------------------- Montagem --------------------------------- */

/** Elementos finais do destino escolhido (+ frame opcional em volta). */
export function buildSheetElements(sheet: SheetData, opts: SheetImportOptions): CanvasElement[] {
  const content: CanvasElement[] =
    opts.destination === 'table' ? [buildTableFromSheet(sheet, opts)] : opts.destination === 'kanban' ? [buildKanbanFromSheet(sheet, opts)] : buildStickiesFromSheet(sheet, opts);
  if (!opts.frame || !content.length) return content;
  const b = getBoundsOfElements(content);
  if (!b) return content;
  const frame = createFrame(expandRect(b, 48 * opts.unit), { title: opts.name || t('importexport.sheetImport.importedSpreadsheet') });
  return [frame, ...content];
}
