/**
 * LuDraw — Tabelas de volta para planilhas (Chat 05).
 *
 * "Copiar como planilha" coloca na área de transferência DOIS formatos padrão ao mesmo tempo:
 * `text/plain` (TSV) e `text/html` (`<table>` com mesclagens, negrito, cores e alinhamento por CSS
 * básico) — qualquer planilha escolhe o que entende. "Exportar tabela (CSV)" baixa um arquivo.
 * Toda saída usa a proteção contra fórmulas (`guardSpreadsheetValue`).
 * A geometria/estilo vêm de `layoutTable` e das mesmas funções da tela (`cellBackground`…).
 */

import type { TableElement } from '../types/canvas';
import { guardSpreadsheetValue, toCsv, type Delimiter } from './csv';
import { escapeXml } from './svgContext';
import { cellKey, isHeaderCol, isHeaderRow, layoutTable, mergeInfo, rangeToTsv, TABLE_COLORS, type CellRange } from './table';

/** Grade de textos do intervalo (células cobertas por mesclagem ficam vazias). */
export function tableGrid(el: TableElement, range?: CellRange): string[][] {
  const r0 = range?.r0 ?? 0;
  const r1 = range?.r1 ?? el.rows - 1;
  const c0 = range?.c0 ?? 0;
  const c1 = range?.c1 ?? el.cols - 1;
  const { owner } = mergeInfo(el);
  const rows: string[][] = [];
  for (let r = r0; r <= r1; r++) {
    const row: string[] = [];
    for (let c = c0; c <= c1; c++) {
      const area = owner.get(cellKey(r, c));
      const covered = !!area && (area.r !== r || area.c !== c);
      row.push(covered ? '' : el.cells[cellKey(r, c)]?.text ?? '');
    }
    rows.push(row);
  }
  return rows;
}

export function tableToCsv(el: TableElement, options: { delimiter?: Delimiter; bom?: boolean; range?: CellRange } = {}): string {
  return toCsv(tableGrid(el, options.range), { delimiter: options.delimiter ?? ';', bom: options.bom ?? true });
}

/** TSV pela mesma função do Chat 04 (`rangeToTsv`), sobre uma cópia das células já protegida contra fórmulas. */
export function tableToTsv(el: TableElement, range?: CellRange): string {
  const guarded: TableElement['cells'] = {};
  const grid = tableGrid(el);
  grid.forEach((row, r) => row.forEach((text, c) => {
    if (text) guarded[cellKey(r, c)] = { text: guardSpreadsheetValue(text) };
  }));
  return rangeToTsv({ cells: guarded }, range ?? { r0: 0, c0: 0, r1: el.rows - 1, c1: el.cols - 1 });
}

/** `<table>` HTML genérico (o que planilhas e editores de texto entendem ao colar). */
export function tableToHtml(el: TableElement, range?: CellRange): string {
  const r0 = range?.r0 ?? 0;
  const r1 = range?.r1 ?? el.rows - 1;
  const c0 = range?.c0 ?? 0;
  const c1 = range?.c1 ?? el.cols - 1;
  const { owner } = mergeInfo(el);
  const layout = layoutTable(el);
  const out: string[] = ['<meta charset="utf-8"><table style="border-collapse:collapse">'];
  for (let r = r0; r <= r1; r++) {
    out.push('<tr>');
    for (let c = c0; c <= c1; c++) {
      const key = cellKey(r, c);
      const area = owner.get(key);
      if (area && (area.r !== r || area.c !== c)) {
        // célula coberta: só aparece se a âncora ficou fora do intervalo copiado
        if (area.r >= r0 && area.c >= c0) continue;
      }
      const cell = el.cells[key];
      const rs = Math.min(cell?.rowSpan ?? 1, r1 - r + 1);
      const cs = Math.min(cell?.colSpan ?? 1, c1 - c + 1);
      const header = isHeaderRow(el, r) || isHeaderCol(el, c);
      const bold = cell?.bold ?? header;
      // cores e alinhamento da MESMA geometria da tela (layoutTable)
      const lc = layout.byKey[key];
      const bg = lc?.background ?? TABLE_COLORS.body;
      const color = lc?.color ?? TABLE_COLORS.text;
      const align = lc?.align ?? cell?.align ?? 'left';
      const css = [
        'border:1px solid #CBD2C6',
        'padding:4px 8px',
        bg && bg !== TABLE_COLORS.body ? `background-color:${bg}` : '',
        color && color.toUpperCase() !== TABLE_COLORS.text ? `color:${color}` : '',
        bold ? 'font-weight:bold' : '',
        cell?.italic ? 'font-style:italic' : '',
        align !== 'left' ? `text-align:${align}` : '',
        'vertical-align:top',
      ]
        .filter(Boolean)
        .join(';');
      const text = escapeXml(guardSpreadsheetValue(cell?.text ?? '')).replace(/\n/g, '<br>');
      out.push(`<td${rs > 1 ? ` rowspan="${rs}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''} style="${css}">${text}</td>`);
    }
    out.push('</tr>');
  }
  out.push('</table>');
  return out.join('');
}

/**
 * Copia TSV + HTML. Tenta a API assíncrona (`ClipboardItem`); se o navegador não deixar, usa o
 * evento `copy` síncrono (precisa estar dentro do clique do usuário). Devolve se conseguiu.
 */
export async function copyTableAsSpreadsheet(el: TableElement, range?: CellRange): Promise<boolean> {
  const tsv = tableToTsv(el, range);
  const html = tableToHtml(el, range);
  if (copyWithEvent(tsv, html)) return true;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([tsv], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(tsv);
      return true;
    }
  } catch {
    /* sem permissão */
  }
  return false;
}

function copyWithEvent(text: string, html: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  let done = false;
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData('text/html', html);
    e.preventDefault();
    e.stopImmediatePropagation();
    done = true;
  };
  document.addEventListener('copy', onCopy, true);
  try {
    document.execCommand('copy');
  } catch {
    done = false;
  } finally {
    document.removeEventListener('copy', onCopy, true);
  }
  return done;
}
