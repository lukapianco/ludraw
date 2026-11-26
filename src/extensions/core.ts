/**
 * LuDraw — Contribuições do NÚCLEO nos registries (Chat 05).
 *
 * O núcleo registra seus importadores, exportadores, formas e templates pelos mesmos registries
 * que as extensões vão usar no Chat 06.5 (`EXTENSIONS_SPEC.md` §7). Só formatos ABERTOS ou
 * genéricos entram aqui (`CLEAN_ROOM.md` §6): nenhum importador de formato proprietário.
 *
 * `ensureCoreContributions()` é idempotente: `main.tsx` chama na partida e os fluxos de
 * importação/exportação chamam de novo por segurança.
 */

import type { CanvasElement } from '../types/canvas';
import { ExporterRegistry, ImporterRegistry, ShapeRegistry, TemplateRegistry, type ImportPayload } from './registries';
import { elementsFromGenericHtml, elementsFromPlainText } from '../utils/clipboard';
import { detectDelimiter, parseDelimited } from '../utils/csv';
import { describeExcalidrawCounts, importExcalidraw, parseExcalidrawText } from '../utils/excalidrawImport';
import { readBackupFile } from '../utils/export';
import {
  exportIssuesCsv,
  exportObjectsCsv,
  exportPdfFrames,
  exportPdfSingle,
  exportPng,
  exportSvg,
  exportTablesCsv,
} from '../utils/exportActions';
import { backupBoard, defaultWorldSize } from '../utils/boardActions';
import { parseHtmlTables, readOds, readXlsx, SHEET_LIMITS, workbookFromHtmlTables, workbookFromPastedText, workbookFromTextBytes } from '../utils/sheets';
import { getShapePath, SHAPE_KINDS } from '../utils/shapes';
import { describeSvgCounts, importSvgMarkup } from '../utils/svgImport';
import { looksLikeSvg } from '../utils/textSniff';
import { GALLERY_TEMPLATES } from '../utils/templates';
import { t } from '../i18n';

let registered = false;

/** Escala de criação proporcional ao zoom (mesma de `importActions.importUnit`). */
const importUnit = () => defaultWorldSize(200) / 200;

async function fileBytes(file: File): Promise<Uint8Array> {
  if (file.size > SHEET_LIMITS.maxFileBytes) throw new Error(t('importexport.core.fileLargerThan50Mb'));
  return new Uint8Array(await file.arrayBuffer());
}

function svgPayload(markup: string, fileName?: string): ImportPayload {
  const res = importSvgMarkup(markup);
  if (!res.elements.length) throw new Error(t('importexport.core.theSvgHasNoShapes'));
  const label = fileName ? t('importexport.core.svgName', { name: fileName }) : 'SVG';
  const labelMessage = fileName ? { key: 'importexport.core.svgName', params: { name: fileName } } : undefined;
  return { kind: 'elements', elements: res.elements, label, labelMessage, summary: describeSvgCounts(res.counts), warnings: res.warnings };
}

function excalidrawPayload(text: string): ImportPayload | null {
  const doc = parseExcalidrawText(text);
  if (!doc) return null;
  const res = importExcalidraw(doc);
  if (!res.elements.length) throw new Error(t('importexport.core.theExcalidrawFileHasNo'));
  return { kind: 'elements', elements: res.elements, get label() { return t('importexport.core.excalidrawFile'); }, labelMessage: { key: 'importexport.core.excalidrawFile' }, summary: describeExcalidrawCounts(res.counts), warnings: res.warnings };
}

// Chat 08.7 · R4 (S-35): `looksLikeSvg` vem de `utils/textSniff` (linear; a regex com comentários repetidos travava a aba ao colar)

/** Registra tudo uma vez. */
export function ensureCoreContributions(): void {
  if (registered) return;
  registered = true;

  /* ------------------------------ Importadores ------------------------------ */
  ImporterRegistry.register({
    id: 'excalidraw',
    order: 10,
    get label() { return t('importexport.core.excalidrawFile'); },
    get description() { return t('importexport.core.drawingsOpenJsonFormatExcalidraw'); },
    extensions: ['excalidraw'],
    mimeTypes: [],
    get standard() { return t('importexport.core.openJsonMitProject'); },
    clipboardPriority: 90,
    readFile: async (file) => {
      const payload = excalidrawPayload(await file.text());
      if (!payload) throw new Error(t('importexport.core.notValidExcalidrawFile'));
      return payload;
    },
    readClipboard: async (snap) => (snap.text ? excalidrawPayload(snap.text) : null),
  });
  ImporterRegistry.register({
    id: 'svg',
    order: 20,
    get label() { return t('common.vectorSvg'); },
    get description() { return t('importexport.core.rectanglesCirclesPolygonsPathsLines'); },
    extensions: ['svg'],
    mimeTypes: ['image/svg+xml'],
    standard: 'SVG 1.1 / W3C',
    clipboardPriority: 80,
    readFile: async (file) => svgPayload(await file.text(), file.name),
    readClipboard: async (snap) => {
      if (snap.svg.trim()) return svgPayload(snap.svg);
      if (looksLikeSvg(snap.text)) return svgPayload(snap.text);
      // HTML que é só um <svg> (copiado de uma página)
      if (snap.html && /<svg[\s>]/i.test(snap.html) && !/<(table|ul|ol|p|img)[\s>]/i.test(snap.html)) {
        const m = /<svg[\s\S]*<\/svg>/i.exec(snap.html);
        if (m) return svgPayload(m[0]);
      }
      return null;
    },
  });
  ImporterRegistry.register({
    id: 'html-table',
    order: 30,
    get label() { return t('importexport.core.htmlTable'); },
    get description() { return t('importexport.core.tablesPastedSpreadsheetsWebPages'); },
    extensions: ['html', 'htm'],
    mimeTypes: ['text/html'],
    get standard() { return t('importexport.core.htmlWhatwgOnlyDataAttributes'); },
    clipboardPriority: 70,
    readFile: async (file) => {
      const html = await file.text();
      const tables = parseHtmlTables(html);
      if (tables.length) return { kind: 'workbook', workbook: { ...workbookFromHtmlTables(tables, ['text/html']), fileName: file.name, title: file.name.replace(/\.[^.]+$/, '') } };
      const generic = await elementsFromGenericHtml(html, importUnit());
      if (!generic) throw new Error(t('importexport.core.thePageHasNoTables'));
      return { kind: 'elements', elements: generic.elements, get label() { return t('importexport.core.pageName', { name: file.name }); }, labelMessage: { key: 'importexport.core.pageName', params: { name: file.name } }, summary: generic.summary, warnings: generic.warnings };
    },
    readClipboard: async (snap) => {
      if (!snap.html || !/<table[\s>]/i.test(snap.html)) return null;
      const tables = parseHtmlTables(snap.html);
      const cells = tables.reduce((n, t) => n + t.rows.reduce((m, r) => m + r.filter((c) => c && c.text.trim()).length, 0), 0);
      if (!tables.length || cells < 2) return null;
      return { kind: 'workbook', workbook: workbookFromHtmlTables(tables, snap.types) };
    },
  });
  ImporterRegistry.register({
    id: 'csv',
    order: 40,
    label: 'CSV',
    get description() { return t('importexport.core.valuesSeparatedCommasSemicolonsRfc'); },
    extensions: ['csv'],
    mimeTypes: ['text/csv', 'application/csv'],
    standard: 'RFC 4180',
    readFile: async (file) => ({ kind: 'workbook', workbook: workbookFromTextBytes(file.name, await fileBytes(file)) }),
  });
  ImporterRegistry.register({
    id: 'tsv',
    order: 41,
    get label() { return t('importexport.core.tsvTextColumns'); },
    get description() { return t('importexport.core.tabSeparatedValuesAlsoWhat'); },
    extensions: ['tsv', 'tab'],
    mimeTypes: ['text/tab-separated-values'],
    get standard() { return t('importexport.core.tabularTextIanaTextTab'); },
    clipboardPriority: 60,
    readFile: async (file) => ({ kind: 'workbook', workbook: workbookFromTextBytes(file.name, await fileBytes(file), { delimiter: '\t' }) }),
    readClipboard: async (snap) => {
      const text = snap.text;
      if (!text.includes('\t')) return null;
      if (detectDelimiter(text) !== '\t') return null;
      const parsed = parseDelimited(text, '\t', { maxRows: 50, maxCols: SHEET_LIMITS.maxCols });
      const width = parsed.rows.reduce((m, r) => Math.max(m, r.length), 0);
      if (width < 2 || parsed.rows.length < 1) return null;
      return { kind: 'workbook', workbook: workbookFromPastedText(text, '\t', snap.types) };
    },
  });
  ImporterRegistry.register({
    id: 'xlsx',
    order: 42,
    get label() { return t('importexport.core.xlsxSpreadsheet'); },
    get description() { return t('importexport.core.officeOpenXmlEcma376'); },
    extensions: ['xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    standard: 'ECMA-376 / ISO/IEC 29500',
    readFile: async (file) => ({ kind: 'workbook', workbook: await readXlsx(file.name, await fileBytes(file)) }),
  });
  ImporterRegistry.register({
    id: 'ods',
    order: 43,
    get label() { return t('importexport.core.odsSpreadsheet'); },
    get description() { return t('importexport.core.opendocumentIsoIec26300Saved'); },
    extensions: ['ods'],
    mimeTypes: ['application/vnd.oasis.opendocument.spreadsheet'],
    standard: 'OASIS ODF / ISO/IEC 26300',
    readFile: async (file) => ({ kind: 'workbook', workbook: await readOds(file.name, await fileBytes(file)) }),
  });
  ImporterRegistry.register({
    id: 'image',
    order: 50,
    get label() { return t('importexport.core.image'); },
    get description() { return t('importexport.core.pngJpgWebpGifCompressed'); },
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    standard: 'PNG / JPEG / WebP / GIF',
    readFile: async (file) => ({ kind: 'images', files: [file] }),
  });
  ImporterRegistry.register({
    id: 'ludraw',
    order: 60,
    get label() { return t('importexport.core.ludrawBackup'); },
    get description() { return t('importexport.core.ludrawsNativeFormatBackupsObjects'); },
    extensions: ['ludraw'],
    mimeTypes: [],
    get standard() { return t('importexport.core.nativeFormatJson'); },
    readFile: async (file) => {
      const backup = await readBackupFile(file);
      const elements = backup.data.elementOrder.map((id) => backup.data.elements[id]).filter((el): el is CanvasElement => !!el && el.type !== 'comment');
      if (!elements.length) throw new Error(t('importexport.core.theBackupEmpty'));
      return { kind: 'elements', elements, get label() { return t('importexport.core.backupName', { name: backup.board.name }); }, labelMessage: { key: 'importexport.core.backupName', params: { name: backup.board.name } }, summary: `${elements.length} objetos`, warnings: [] };
    },
  });
  ImporterRegistry.register({
    id: 'html',
    order: 70,
    get label() { return t('importexport.core.genericHtml'); },
    get description() { return t('importexport.core.headingsParagraphsBecomeTextLists'); },
    extensions: [],
    mimeTypes: ['text/html'],
    standard: 'HTML (WHATWG)',
    clipboardPriority: 40,
    readClipboard: async (snap) => {
      if (!snap.html.trim()) return null;
      const res = await elementsFromGenericHtml(snap.html, importUnit());
      return res ? { kind: 'elements', elements: res.elements, get label() { return t('importexport.core.pastedContent'); }, labelMessage: { key: 'importexport.core.pastedContent' }, summary: res.summary, warnings: res.warnings } : null;
    },
  });
  ImporterRegistry.register({
    id: 'text',
    order: 80,
    get label() { return t('common.text'); },
    get description() { return t('importexport.core.shortTextBecomesStickyNote'); },
    extensions: ['txt', 'md'],
    mimeTypes: ['text/plain'],
    get standard() { return t('importexport.core.plainTextUtf8'); },
    clipboardPriority: 10,
    readFile: async (file) => {
      const res = elementsFromPlainText(await file.text(), importUnit());
      if (!res) throw new Error(t('importexport.core.theTextFileEmpty'));
      return { kind: 'elements', elements: res.elements, get label() { return t('importexport.core.textName', { name: file.name }); }, labelMessage: { key: 'importexport.core.textName', params: { name: file.name } }, summary: res.summary, warnings: [] };
    },
    readClipboard: async (snap) => {
      const res = elementsFromPlainText(snap.text, importUnit());
      return res ? { kind: 'elements', elements: res.elements, get label() { return t('common.text'); }, labelMessage: { key: 'common.text' }, summary: res.summary, warnings: [] } : null;
    },
  });

  /* ------------------------------ Exportadores ------------------------------ */
  ExporterRegistry.register({
    id: 'png',
    order: 10,
    get label() { return t('importexport.core.pngImage'); },
    get description() { return t('importexport.core.highResolutionRasterJustLike'); },
    group: 'image',
    extension: 'png',
    scopes: ['board', 'selection', 'frames'],
    options: [{ kind: 'choice', id: 'scale', get label() { return t('importexport.core.resolution'); }, default: '2', choices: [{ value: '1', get label() { return t('importexport.core.standard1x'); } }, { value: '2', get label() { return t('importexport.core.high2x'); } }, { value: '4', get label() { return t('importexport.core.ultraHd4x'); } }] }],
    run: exportPng,
  });
  ExporterRegistry.register({
    id: 'svg',
    order: 20,
    get label() { return t('common.vectorSvg'); },
    get description() { return t('importexport.core.shapesLinesTextAsEditable'); },
    group: 'vector',
    extension: 'svg',
    scopes: ['board', 'selection', 'frames'],
    run: exportSvg,
  });
  ExporterRegistry.register({
    id: 'pdf',
    order: 30,
    get label() { return t('importexport.core.pdfSinglePage'); },
    get description() { return t('importexport.core.allChosenContentOneHigh'); },
    group: 'document',
    extension: 'pdf',
    scopes: ['board', 'selection'],
    run: exportPdfSingle,
  });
  ExporterRegistry.register({
    id: 'pdf-frames',
    order: 31,
    get label() { return t('importexport.core.pdfMultiPageFrames'); },
    get description() { return t('importexport.core.eachFrameBecomesHighResolution'); },
    group: 'document',
    extension: 'pdf',
    scopes: ['frames'],
    options: [{ kind: 'choice', id: 'scale', get label() { return t('importexport.core.pageResolution'); }, default: '3', choices: [{ value: '2', get label() { return t('importexport.core.high2x'); } }, { value: '3', get label() { return t('importexport.core.print3x'); } }, { value: '4', get label() { return t('importexport.core.maximum4x'); } }] }],
    run: (req) => exportPdfFrames(req),
  });
  ExporterRegistry.register({
    id: 'issues-csv',
    order: 40,
    get label() { return t('importexport.core.issuesCsvTrackers'); },
    get description() { return t('importexport.core.stickyNotesKanbanCardsAs'); },
    group: 'data',
    extension: 'csv',
    scopes: ['board', 'selection', 'frames'],
    options: [
      { kind: 'choice', id: 'issueType', get label() { return t('importexport.core.stickyNoteType'); }, default: 'Task', choices: [{ value: 'Task', label: 'Task' }, { value: 'Story', label: 'Story' }, { value: 'Bug', label: 'Bug' }], get hint() { return t('importexport.core.cardsStoryPointsComeOut'); } },
      { kind: 'toggle', id: 'extraColumns', get label() { return t('importexport.core.includeStatusStoryPointsDue'); }, default: false },
    ],
    run: exportIssuesCsv,
  });
  ExporterRegistry.register({
    id: 'tables-csv',
    order: 50,
    get label() { return t('importexport.core.tablesAsCsv'); },
    get description() { return t('importexport.core.eachTableBoardBecomesCsv'); },
    group: 'data',
    extension: 'csv',
    scopes: ['board', 'selection', 'frames'],
    options: [{ kind: 'choice', id: 'delimiter', get label() { return t('importexport.core.delimiter'); }, default: 'semicolon', choices: [{ value: 'semicolon', get label() { return t('importexport.core.semicolonCommaDecimalSpreadsheetsE'); } }, { value: 'comma', get label() { return t('importexport.core.commaInternationalStandard'); } }] }],
    run: exportTablesCsv,
  });
  ExporterRegistry.register({
    id: 'objects-csv',
    order: 60,
    get label() { return t('importexport.core.objectListCsv'); },
    get description() { return t('importexport.core.oneObjectPerRowType'); },
    group: 'data',
    extension: 'csv',
    scopes: ['board', 'selection', 'frames'],
    run: exportObjectsCsv,
  });
  ExporterRegistry.register({
    id: 'backup',
    order: 70,
    get label() { return t('importexport.core.ludrawBackup'); },
    get description() { return t('importexport.core.theWholeBoardNativeFormat'); },
    group: 'backup',
    extension: 'ludraw',
    scopes: ['board'],
    run: async () => backupBoard(),
  });

  /* --------------------------------- Formas --------------------------------- */
  SHAPE_KINDS.forEach((s, i) => ShapeRegistry.register({ id: s.kind, order: i, get label() { return s.label; }, kind: s.kind, shortcut: s.shortcut, path: (w, h) => getShapePath(s.kind, w, h) }));

  /* -------------------------------- Templates -------------------------------- */
  GALLERY_TEMPLATES.forEach((tpl, i) => TemplateRegistry.register({ id: tpl.id, order: i, get label() { return tpl.label; }, get description() { return tpl.description; }, category: tpl.category, build: tpl.build }));
}
