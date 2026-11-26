/**
 * LuDraw — Exportação em larga escala (Chat 05): SVG vetorial, PDF de várias páginas por frame,
 * CSV estruturado de issues e CSV/cópia de tabelas.
 *
 * TODA exportação passa por `allowExport()` de `boardActions.ts` — `can('board.export')`
 * (+ `allowViewerExport`/`allowDownload` do link público) e `recordActivity('exported')`.
 * O que sai respeita as mesmas regras da tela: conteúdo oculto por frame não sai, notas privadas
 * de outras pessoas saem mascaradas (imagem/PDF/SVG) ou ficam de fora (CSV), comentários nunca saem.
 */

import type { CanvasElement, FrameElement, TableElement } from '../types/canvas';
import type { ExportRequest, ExportScope } from '../extensions/registries';
import { useAppStore } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { allowExport, currentBoardMeta, frameExportElements, orderedElements, privacy, renderOptions } from './boardActions';
import { downloadBlob, exportElementsAsPNG, exportElementsAsSVG, exportElementsToCSV, exportPagesAsPDF, type PdfPage } from './export';
import { getElementBounds } from './math';
import { isFrame, isHiddenByFrame, orderedFrames } from './frames';
import { slugifyFileName } from './format';
import { buildIssueTable, issueTableToCsv, type IssueType } from './issuesCsv';
import { copyTableAsSpreadsheet, tableToCsv } from './tableExport';
import { activeRange, useTableUi } from './tableActions';
import type { Delimiter } from './csv';
import { t } from '../i18n';
import type { StoredMessage } from '../i18n/types';

const app = () => useAppStore.getState();
const board = () => useBoardStore.getState();

function boardName(): string {
  return currentBoardMeta()?.name ?? 'board';
}

/** Ids da seleção com o conteúdo dos frames selecionados e grupos inteiros. */
function selectionIds(): string[] {
  const s = board();
  const ids = new Set(s.expandGroups(s.selectedIds));
  for (const id of Array.from(ids)) {
    if (isFrame(s.elements[id])) for (const cid in s.elements) if (s.elements[cid].parentId === id) ids.add(cid);
  }
  return Array.from(ids);
}

/** Frames escolhidos, na ordem dos slides. */
export function framesInOrder(frameIds?: string[]): FrameElement[] {
  const s = board();
  const all = orderedFrames(s.elements, s.elementOrder);
  if (!frameIds) return all;
  const chosen = new Set(frameIds);
  return all.filter((f) => chosen.has(f.id));
}

/** Elementos de um escopo (sem comentários; na ordem das camadas). */
export function scopeElements(scope: ExportScope, frameIds: string[] = []): CanvasElement[] {
  if (scope === 'selection') return orderedElements(selectionIds()).filter((el) => el.type !== 'comment');
  if (scope === 'frames') {
    const seen = new Set<string>();
    const out: CanvasElement[] = [];
    for (const f of framesInOrder(frameIds)) for (const el of frameExportElements(f.id)) if (!seen.has(el.id) && el.type !== 'comment') {
      seen.add(el.id);
      out.push(el);
    }
    return out;
  }
  return orderedElements().filter((el) => el.type !== 'comment');
}

/** Escopo da exportação para o Activity Log (mensagem, traduzida na tela). */
function scopeLabel(req: ExportRequest): StoredMessage {
  if (req.scope === 'selection') return { key: 'board.activity.scope.selection' };
  if (req.scope === 'frames') {
    const frames = framesInOrder(req.frameIds);
    return frames.length === 1 ? (frames[0].title ? { key: 'board.activity.scope.frame', params: { title: frames[0].title } } : { key: 'board.activity.scope.untitledFrame' }) : { key: 'board.activity.scope.frames', params: { count: frames.length } };
  }
  return { key: 'board.activity.scope.board' };
}

function emptyGuard(els: CanvasElement[], what = t('importexport.exportActions.whatYouChoseEmptyNothing')): boolean {
  if (els.length) return true;
  app().toast(what, 'danger');
  return false;
}

/* --------------------------------- Imagem / SVG --------------------------------- */

function frameOptions(frame: FrameElement, scale: number) {
  return { ...renderOptions(scale), padding: 0, bounds: getElementBounds(frame), background: frame.fillColor };
}

export async function exportPng(req: ExportRequest): Promise<void> {
  const scale = Number(req.options.scale ?? 2) || 2;
  if (!allowExport({ key: 'board.activity.export.pngScoped', params: { scale, scope: scopeLabel(req) } })) return;
  try {
    if (req.scope === 'frames') {
      for (const f of framesInOrder(req.frameIds)) await exportElementsAsPNG(`${boardName()} - ${f.title || 'frame'}`, frameExportElements(f.id), frameOptions(f, scale));
    } else {
      const els = scopeElements(req.scope);
      if (!emptyGuard(els)) return;
      await exportElementsAsPNG(req.scope === 'selection' ? `${boardName()}-${t('importexport.exportActions.selectionFileSuffix')}` : boardName(), els, renderOptions(scale));
    }
    app().toast(t('importexport.exportActions.imageExportedScaleX', { scale }), 'success');
  } catch (err) {
    app().toast(t('importexport.exportActions.couldntExportImageMessage', { message: (err as Error).message }), 'danger');
  }
}

/** SVG vetorial do board, da seleção ou de cada frame escolhido. */
export async function exportSvg(req: ExportRequest): Promise<void> {
  if (!allowExport({ key: 'board.activity.export.svgScoped', params: { scope: scopeLabel(req) } })) return;
  try {
    if (req.scope === 'frames') {
      const frames = framesInOrder(req.frameIds);
      if (!frames.length) return void app().toast(t('importexport.exportActions.chooseLeastOneFrame'), 'danger');
      for (const f of frames) await exportElementsAsSVG(`${boardName()} - ${f.title || 'frame'}`, frameExportElements(f.id), frameOptions(f, 1));
    } else {
      const els = scopeElements(req.scope);
      if (!emptyGuard(els)) return;
      await exportElementsAsSVG(req.scope === 'selection' ? `${boardName()}-${t('importexport.exportActions.selectionFileSuffix')}` : boardName(), els, renderOptions(1));
    }
    app().toast(t('importexport.exportActions.vectorSvgExported'), 'success');
  } catch (err) {
    app().toast(t('importexport.exportActions.couldntExportSvgMessage', { message: (err as Error).message }), 'danger');
  }
}

/* ------------------------------------ PDF ------------------------------------ */

/** Página do PDF de um frame: A4 vira A4; os demais, 1 unidade do board = 1 pt (máx. ~A0). */
function framePage(frame: FrameElement): { width: number; height: number } {
  if (frame.ratioPreset === 'a4') return { width: 595.28, height: 841.89 };
  const k = Math.min(1, 3370 / Math.max(frame.width, frame.height));
  return { width: frame.width * k, height: frame.height * k };
}

/** PDF de uma página (board ou seleção). */
export async function exportPdfSingle(req: ExportRequest): Promise<void> {
  if (!allowExport({ key: 'board.activity.export.pdfScoped', params: { scope: scopeLabel(req) } })) return;
  const els = scopeElements(req.scope === 'frames' ? 'board' : req.scope);
  if (!emptyGuard(els)) return;
  try {
    await exportPagesAsPDF(req.scope === 'selection' ? `${boardName()}-${t('importexport.exportActions.selectionFileSuffix')}` : boardName(), [{ elements: els, options: renderOptions(Number(req.options.scale ?? 3) || 3) }]);
    app().toast(t('importexport.exportActions.pdfCreated'), 'success');
  } catch (err) {
    app().toast(t('importexport.exportActions.couldntCreatePdfMessage', { message: (err as Error).message }), 'danger');
  }
}

/** PDF multipáginas: cada frame escolhido vira uma página em alta resolução, na ordem dos slides. */
export async function exportPdfFrames(req: ExportRequest, onProgress?: (done: number, total: number) => void): Promise<void> {
  const frames = framesInOrder(req.frameIds.length ? req.frameIds : undefined);
  if (!frames.length) {
    app().toast(t('importexport.exportActions.createFramesFKeyExport'), 'danger');
    return;
  }
  if (!allowExport({ key: 'board.activity.export.pdfFrames', params: { count: frames.length } })) return;
  const scale = Number(req.options.scale ?? 3) || 3;
  const pages: PdfPage[] = frames.map((f) => ({ elements: frameExportElements(f.id), options: frameOptions(f, scale), page: framePage(f), title: f.title }));
  try {
    await exportPagesAsPDF(`${boardName()} - frames`, pages, onProgress);
    app().toast(t('importexport.exportActions.pdfPages', { count: pages.length }), 'success');
  } catch (err) {
    app().toast(t('importexport.exportActions.couldntCreatePdfMessage', { message: (err as Error).message }), 'danger');
  }
}

/* ------------------------------------ CSV ------------------------------------ */

/** Prévia da tabela de issues (sem exportar) — usada pelo modal. */
export function previewIssues(req: Pick<ExportRequest, 'scope' | 'frameIds' | 'options'>) {
  const s = board();
  const p = privacy();
  return buildIssueTable(scopeElements(req.scope, req.frameIds), s.elements, {
    defaultType: (String(req.options.issueType ?? 'Task') as IssueType) || 'Task',
    extraColumns: !!req.options.extraColumns,
    viewerId: p.viewerId,
    simulateParticipant: p.simulateParticipant,
    voting: s.facilitation.voting,
  });
}

/** CSV estruturado de issues (post-its + cards de Kanban). */
export async function exportIssuesCsv(req: ExportRequest): Promise<void> {
  const table = previewIssues(req);
  if (!table.rows.length) {
    app().toast(t('importexport.exportActions.noStickyNotesKanbanCards'), 'danger');
    return;
  }
  if (!allowExport({ key: 'board.activity.export.issuesCsv', params: { count: table.rows.length, scope: scopeLabel(req) } })) return;
  const csv = issueTableToCsv(table);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugifyFileName(boardName())}-issues.csv`);
  app().toast(table.skippedPrivate ? t('importexport.exportActions.issuesCsvRowsSkipped', { count: table.rows.length, skipped: table.skippedPrivate }) : t('importexport.exportActions.issuesCsvRows', { count: table.rows.length }), 'success');
}

/** Tabelas do escopo (visíveis). */
export function scopeTables(scope: ExportScope, frameIds: string[] = []): TableElement[] {
  const s = board();
  const lookup = (id: string) => s.elements[id];
  return scopeElements(scope, frameIds).filter((el): el is TableElement => el.type === 'table' && !isHiddenByFrame(el, lookup));
}

/** Um CSV por tabela (protegido contra fórmulas). */
export async function exportTablesCsv(req: ExportRequest): Promise<void> {
  const tables = scopeTables(req.scope, req.frameIds);
  if (!tables.length) {
    app().toast(t('importexport.exportActions.noTablesWhatYouChose'), 'danger');
    return;
  }
  if (!allowExport({ key: 'board.activity.export.tablesCsv', params: { count: tables.length } })) return;
  const delimiter: Delimiter = req.options.delimiter === 'comma' ? ',' : ';';
  const suffix = t('importexport.exportActions.tableFileSuffix');
  tables.forEach((table, i) => {
    const csv = tableToCsv(table, { delimiter, bom: delimiter === ';' });
    window.setTimeout(() => downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugifyFileName(boardName())}-${suffix}${tables.length > 1 ? `-${i + 1}` : ''}.csv`), i * 350);
  });
  app().toast(tables.length === 1 ? t('importexport.exportActions.tableExportedCsv') : t('importexport.exportActions.countTablesExportedCsv', { count: tables.length }), 'success');
}

export async function exportObjectsCsv(req: ExportRequest): Promise<void> {
  const els = scopeElements(req.scope, req.frameIds);
  if (!emptyGuard(els)) return;
  if (!allowExport({ key: 'board.activity.export.objectsCsv', params: { scope: scopeLabel(req) } })) return;
  exportElementsToCSV(req.scope === 'selection' ? `${boardName()}-${t('importexport.exportActions.selectionFileSuffix')}` : boardName(), els);
  app().toast(t('importexport.exportActions.csvExported'), 'success');
}

/* ------------------------------- Ações da tabela ------------------------------- */

function tableById(id: string): TableElement | null {
  const el = board().elements[id];
  return el?.type === 'table' ? el : null;
}

/** Intervalo ativo da tabela (ou ela inteira). */
function tableRange(el: TableElement) {
  const ui = useTableUi.getState();
  return ui.elementId === el.id && ui.focus ? activeRange(el) : undefined;
}

/** "Copiar como planilha (TSV + HTML)" — cola com mesclagens e cores em qualquer planilha. */
export async function copyTableForSpreadsheet(elementId: string, whole = false): Promise<void> {
  const el = tableById(elementId);
  if (!el || !board().ensure('board.export')) return;
  const ok = await copyTableAsSpreadsheet(el, whole ? undefined : tableRange(el));
  app().toast(ok ? t('importexport.exportActions.copiedAsSpreadsheetPasteInto') : t('importexport.exportActions.theBrowserDidntAllowAccess'), ok ? 'success' : 'danger');
}

/** "Exportar tabela (CSV)" de uma tabela. */
export function exportTableCsv(elementId: string, delimiter: Delimiter = ';'): void {
  const el = tableById(elementId);
  if (!el || !allowExport({ key: 'board.activity.export.tableCsv', params: { rows: el.rows, cols: el.cols } })) return;
  const csv = tableToCsv(el, { delimiter, bom: delimiter === ';' });
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugifyFileName(boardName())}-tabela.csv`);
  app().toast(t('importexport.exportActions.tableExportedCsv'), 'success');
}
