/**
 * LuDraw — Leitura de planilhas e tabelas em formatos ABERTOS (Chat 05).
 *
 * - `<table>` HTML padrão (colar de planilhas e páginas web): `<tr>`, `<td>`/`<th>`, `colspan`/
 *   `rowspan`, cor de fundo/negrito/cor/alinhamento por CSS básico (atributo `style`, `bgcolor` e
 *   regras simples de classe do `<style>` do próprio HTML). **Atributos `data-*` e marcadores
 *   proprietários nunca são lidos.**
 * - CSV/TSV (RFC 4180, ver `utils/csv.ts`).
 * - `.xlsx` (Office Open XML, ECMA-376 / ISO/IEC 29500) e `.ods` (OpenDocument, ISO/IEC 26300):
 *   pacote ZIP (`utils/zip.ts`) + XML lido com `DOMParser`. Só o VALOR ARMAZENADO de cada célula:
 *   fórmulas não são calculadas, macros e vínculos externos nunca são lidos.
 *
 * Limites contra arquivos maliciosos: 50 MB descompactados, 5.000 linhas × 60 colunas por aba
 * (o excedente é contado para o aviso "importar só o início"). XML com DOCTYPE/ENTITY é recusado.
 */

import { decodeText, detectDecimalComma, detectDelimiter, looksNumeric, parseDelimited, unguardSpreadsheetValue, type Delimiter, type TextEncodingId } from './csv';
import { ZipArchive, ZipError } from './zip';
import { t } from '../i18n';

export const SHEET_LIMITS = {
  maxRows: 5000,
  maxCols: 60,
  /** Arquivo de entrada (bytes compactados) */
  maxFileBytes: 50 * 1024 * 1024,
  /** Soma descompactada dos XML lidos */
  maxUncompressed: 50 * 1024 * 1024,
} as const;

export type SheetFormat = 'html-table' | 'csv' | 'tsv' | 'xlsx' | 'ods' | 'text-tsv';

export const SHEET_FORMAT_LABELS: Record<SheetFormat, string> = {
  get 'html-table'() { return t('importexport.sheets.pastedTableHtml'); },
  get csv() { return t('importexport.sheets.csvFile'); },
  get tsv() { return t('importexport.sheets.tsvFile'); },
  get xlsx() { return t('importexport.sheets.xlsxSpreadsheetOfficeOpenXml'); },
  get ods() { return t('importexport.sheets.odsSpreadsheetOpendocument'); },
  get 'text-tsv'() { return t('importexport.sheets.textColumnsTabSeparated'); },
};

export interface SheetCell {
  text: string;
  /** Valor numérico armazenado (xlsx): o texto final depende do separador decimal escolhido */
  num?: number;
  /** Formato numérico simples do valor armazenado (xlsx) */
  numFormat?: NumberFormatInfo;
  bold?: boolean;
  italic?: boolean;
  /** `#RRGGBB` */
  bg?: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
  rowSpan?: number;
  colSpan?: number;
}

/** Linha de células; `null` = coberta por uma mesclagem (a âncora tem `rowSpan`/`colSpan`). */
export type SheetRow = (SheetCell | null)[];

export interface SheetData {
  name: string;
  rows: SheetRow[];
  /** Tamanho real da aba (pode passar dos limites) */
  totalRows: number;
  totalCols: number;
  truncated: boolean;
  warnings: string[];
}

export interface SheetWorkbook {
  format: SheetFormat;
  /** Nome do arquivo (ou "Área de transferência") */
  fileName: string;
  /** Nome sugerido para o frame/kanban (arquivo sem extensão) */
  title: string;
  sheetNames: string[];
  loadSheet: (index: number) => Promise<SheetData>;
  warnings: string[];
  /** CSV/TSV: dá para reler com outro separador/codificação */
  text?: { bytes: Uint8Array; delimiter: Delimiter; encoding: TextEncodingId };
  /** Tipos MIME recebidos (colagem) — para o Inspetor */
  mimeTypes?: string[];
}

export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetError';
  }
}

/* ------------------------------ Utilidades XML ------------------------------- */

function parseXml(xml: string, label: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml.slice(0, 4096)) || /<!ENTITY/i.test(xml)) throw new SheetError(t('importexport.sheets.labelXmlDeclaresEntitiesDoctype', { label }));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new SheetError(t('importexport.sheets.labelInvalidXmlCorruptedFile', { label }));
  return doc;
}

/** Filhos diretos com o nome local indicado (ignora prefixo/namespace). */
function childrenNamed(el: Element, local: string): Element[] {
  const out: Element[] = [];
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === local) out.push(c);
  return out;
}

function firstChild(el: Element, local: string): Element | null {
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === local) return c;
  return null;
}

/** Todos os descendentes com o nome local (em ordem de documento). */
function descendants(root: Element | Document, local: string): Element[] {
  const all = root.getElementsByTagName('*');
  const out: Element[] = [];
  for (let i = 0; i < all.length; i++) if (all[i].localName === local) out.push(all[i]);
  return out;
}

function attr(el: Element, local: string): string | null {
  if (el.hasAttribute(local)) return el.getAttribute(local);
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (a.localName === local) return a.value;
  }
  return null;
}

/* --------------------------------- Cores ------------------------------------- */

const NAMED: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00',
  gray: '#808080', grey: '#808080', silver: '#C0C0C0', orange: '#FFA500', purple: '#800080', navy: '#000080',
  teal: '#008080', maroon: '#800000', olive: '#808000', lime: '#00FF00', aqua: '#00FFFF', fuchsia: '#FF00FF',
  pink: '#FFC0CB', brown: '#A52A2A', lightgray: '#D3D3D3', lightgrey: '#D3D3D3', darkgray: '#A9A9A9',
};

/** Normaliza uma cor CSS simples para `#RRGGBB` (ou `undefined` se transparente/desconhecida). */
export function normalizeCssColor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'none' || s === 'inherit' || s === 'initial' || s === 'auto' || s === 'windowtext') return undefined;
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`.toUpperCase();
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return m[2] === '00' ? undefined : `#${m[1]}`.toUpperCase();
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    if (a < 0.05) return undefined;
    return `#${[m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return undefined;
}

/* ---------------------------- Tabela HTML (colar) ----------------------------- */

interface CssBasics {
  bg?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: SheetCell['align'];
}

/** Só estas propriedades CSS são lidas (todo o resto — inclusive prefixos proprietários — é ignorado). */
function readDeclarations(text: string, into: CssBasics = {}): CssBasics {
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).replace(/!important/i, '').trim();
    if (prop === 'background-color' || prop === 'background') {
      const c = normalizeCssColor(value.split(/\s+(?![^(]*\))/)[0]);
      if (c) into.bg = c;
    } else if (prop === 'color') {
      const c = normalizeCssColor(value);
      if (c) into.color = c;
    } else if (prop === 'font-weight') {
      into.bold = value === 'bold' || value === 'bolder' || Number(value) >= 600;
    } else if (prop === 'font-style') {
      into.italic = value === 'italic' || value === 'oblique';
    } else if (prop === 'text-align') {
      if (value === 'center') into.align = 'center';
      else if (value === 'right' || value === 'end') into.align = 'right';
      else if (value === 'left' || value === 'start') into.align = 'left';
    }
  }
  return into;
}

/** Regras simples `.classe { … }` e `td { … }` do `<style>` do próprio HTML colado. */
function readStyleRules(doc: Document): Map<string, CssBasics> {
  const rules = new Map<string, CssBasics>();
  const styles = doc.getElementsByTagName('style');
  for (let i = 0; i < styles.length; i++) {
    const css = (styles[i].textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--|-->/g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decl = readDeclarations(m[2]);
      if (!Object.keys(decl).length) continue;
      for (const sel of m[1].split(',')) {
        const key = sel.trim().toLowerCase();
        // só seletores simples: ".x", "td.x", "td", "th"
        if (!/^([a-z]+)?(\.[a-z0-9_-]+)?$/.test(key) || !key) continue;
        rules.set(key, { ...rules.get(key), ...decl });
      }
    }
  }
  return rules;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);

/** Texto visível de um nó: `<br>` e blocos viram quebra de linha; espaços colapsam como no HTML. */
export function visibleText(node: Node): string {
  let out = '';
  const walk = (n: Node, pre: boolean) => {
    if (n.nodeType === 3) {
      const t = (n.nodeValue ?? '').replace(/ /g, ' ');
      out += pre ? t : t.replace(/[\t\n\r ]+/g, ' ');
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TEMPLATE' || tag === 'HEAD' || tag === 'TITLE') return;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block && out && !out.endsWith('\n')) out += '\n';
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c, pre || tag === 'PRE');
    if (block && !out.endsWith('\n')) out += '\n';
  };
  walk(node, false);
  return out
    .split('\n')
    .map((l) => l.replace(/ +/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cellBasics(cell: HTMLTableCellElement, rules: Map<string, CssBasics>): CssBasics {
  const tag = cell.tagName.toLowerCase();
  const out: CssBasics = {};
  Object.assign(out, rules.get(tag));
  const cls = (cell.getAttribute('class') ?? '').trim().toLowerCase();
  for (const c of cls.split(/\s+/).filter(Boolean)) {
    Object.assign(out, rules.get(`.${c}`), rules.get(`${tag}.${c}`));
  }
  const bgcolor = normalizeCssColor(cell.getAttribute('bgcolor'));
  if (bgcolor) out.bg = bgcolor;
  const alignAttr = (cell.getAttribute('align') ?? '').toLowerCase();
  if (alignAttr === 'center' || alignAttr === 'right' || alignAttr === 'left') out.align = alignAttr;
  readDeclarations(cell.getAttribute('style') ?? '', out);
  if (tag === 'th' && out.bold === undefined) out.bold = true;
  // negrito por marcação básica: todo o texto dentro de <b>/<strong> (ou estilo inline num único filho)
  if (out.bold === undefined) {
    const only = cell.children.length === 1 ? cell.children[0] : null;
    if (only && (only.tagName === 'B' || only.tagName === 'STRONG') && (only.textContent ?? '').trim() === (cell.textContent ?? '').trim()) out.bold = true;
    else if (only) {
      const inner = readDeclarations(only.getAttribute('style') ?? '');
      if (inner.bold) out.bold = true;
      if (inner.color && !out.color) out.color = inner.color;
      if (inner.italic) out.italic = true;
    }
  }
  return out;
}

/** Tabelas de nível superior do HTML colado (tabelas aninhadas viram texto da célula). */
export function parseHtmlTables(html: string): SheetData[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rules = readStyleRules(doc);
  const tables = Array.from(doc.getElementsByTagName('table')).filter((t) => !t.parentElement?.closest('table'));
  const out: SheetData[] = [];
  tables.forEach((table, index) => {
    const sheet = htmlTableToSheet(table as HTMLTableElement, rules, t('importexport.sheets.tableValue', { value: index + 1 }));
    if (sheet.rows.length && sheet.rows.some((r) => r.some((c) => c && c.text))) out.push(sheet);
  });
  return out;
}

function htmlTableToSheet(table: HTMLTableElement, rules: Map<string, CssBasics>, fallbackName: string): SheetData {
  const caption = table.caption ? visibleText(table.caption) : '';
  const grid: SheetRow[] = [];
  const occupied: boolean[][] = [];
  let totalRows = 0;
  let totalCols = 0;
  const trs = Array.from(table.rows);
  trs.forEach((tr, r) => {
    totalRows++;
    if (r >= SHEET_LIMITS.maxRows) return;
    const row = (grid[r] = grid[r] ?? []);
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (occupied[r]?.[c]) c++;
      const colSpan = Math.max(1, Math.min(SHEET_LIMITS.maxCols, parseInt(cell.getAttribute('colspan') ?? '1', 10) || 1));
      const rowSpan = Math.max(1, Math.min(SHEET_LIMITS.maxRows, parseInt(cell.getAttribute('rowspan') ?? '1', 10) || 1));
      totalCols = Math.max(totalCols, c + colSpan);
      const basics = cellBasics(cell, rules);
      const text = unguardSpreadsheetValue(visibleText(cell));
      if (c < SHEET_LIMITS.maxCols) {
        const cs = Math.min(colSpan, SHEET_LIMITS.maxCols - c);
        const rs = Math.min(rowSpan, SHEET_LIMITS.maxRows - r);
        row[c] = { text, ...basics, ...(rs > 1 ? { rowSpan: rs } : {}), ...(cs > 1 ? { colSpan: cs } : {}) };
        for (let dr = 0; dr < rs; dr++) {
          occupied[r + dr] = occupied[r + dr] ?? [];
          for (let dc = 0; dc < cs; dc++) {
            occupied[r + dr][c + dc] = true;
            if (dr || dc) {
              grid[r + dr] = grid[r + dr] ?? [];
              grid[r + dr][c + dc] = null;
            }
          }
        }
      }
      c += colSpan;
    }
  });
  const rows = normalizeGrid(grid.slice(0, SHEET_LIMITS.maxRows), Math.min(totalCols, SHEET_LIMITS.maxCols));
  return { name: caption || fallbackName, rows, totalRows, totalCols, truncated: totalRows > SHEET_LIMITS.maxRows || totalCols > SHEET_LIMITS.maxCols, warnings: [] };
}

/** Completa buracos com células vazias e corta colunas vazias no fim. */
function normalizeGrid(grid: SheetRow[], width: number): SheetRow[] {
  let used = 0;
  for (const row of grid) {
    for (let c = (row?.length ?? 0) - 1; c >= 0; c--) {
      const cell = row[c];
      if (cell === null || (cell && (cell.text || cell.bg))) {
        used = Math.max(used, c + 1 + ((cell?.colSpan ?? 1) - 1));
        break;
      }
    }
  }
  const w = Math.min(width || used, used || width);
  return grid.map((row) => {
    const out: SheetRow = [];
    for (let c = 0; c < w; c++) {
      const cell = row?.[c];
      out.push(cell === null ? null : cell ?? { text: '' });
    }
    return out;
  });
}

/* --------------------------------- CSV / TSV ---------------------------------- */

export function sheetFromRows(name: string, rows: string[][], totalRows: number, totalCols: number, truncated: boolean): SheetData {
  const width = Math.min(SHEET_LIMITS.maxCols, rows.reduce((m, r) => Math.max(m, r.length), 0));
  return {
    name,
    rows: rows.map((r) => Array.from({ length: width }, (_, c) => ({ text: unguardSpreadsheetValue(r[c] ?? '') }))),
    totalRows,
    totalCols,
    truncated,
    warnings: [],
  };
}

/** Texto delimitado → aba única. */
export function sheetFromDelimitedText(name: string, text: string, delimiter: Delimiter): SheetData {
  const parsed = parseDelimited(text, delimiter, { maxRows: SHEET_LIMITS.maxRows, maxCols: SHEET_LIMITS.maxCols });
  return sheetFromRows(name, parsed.rows, parsed.totalRows, parsed.totalCols, parsed.truncated);
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

/** CSV/TSV a partir dos bytes do arquivo (codificação e separador detectados ou escolhidos). */
export function workbookFromTextBytes(fileName: string, bytes: Uint8Array, options: { delimiter?: Delimiter; encoding?: TextEncodingId } = {}): SheetWorkbook {
  const decoded = decodeText(bytes, options.encoding ?? 'auto');
  const isTsv = /\.tsv$/i.test(fileName);
  const delimiter = options.delimiter ?? (isTsv ? '\t' : detectDelimiter(decoded.text));
  const sheet = sheetFromDelimitedText(baseName(fileName), decoded.text, delimiter);
  const warnings: string[] = [];
  if (decoded.encoding === 'windows-1252' && !options.encoding) warnings.push(t('importexport.sheets.theFileIsntUtf8'));
  return {
    format: isTsv ? 'tsv' : 'csv',
    fileName,
    title: baseName(fileName),
    sheetNames: [sheet.name],
    loadSheet: async () => sheet,
    warnings,
    text: { bytes, delimiter, encoding: decoded.encoding },
  };
}

/* ----------------------------------- XLSX ------------------------------------ */

export interface NumberFormatInfo {
  kind: 'general' | 'number' | 'percent' | 'date' | 'time' | 'datetime' | 'text';
  decimals?: number;
  grouping?: boolean;
  prefix?: string;
  suffix?: string;
}

/** Formatos internos de data/hora do SpreadsheetML (ids reservados). */
const BUILTIN_FORMATS: Record<number, NumberFormatInfo> = {
  0: { kind: 'general' },
  1: { kind: 'number', decimals: 0 },
  2: { kind: 'number', decimals: 2 },
  3: { kind: 'number', decimals: 0, grouping: true },
  4: { kind: 'number', decimals: 2, grouping: true },
  9: { kind: 'percent', decimals: 0 },
  10: { kind: 'percent', decimals: 2 },
  14: { kind: 'date' }, 15: { kind: 'date' }, 16: { kind: 'date' }, 17: { kind: 'date' },
  18: { kind: 'time' }, 19: { kind: 'time' }, 20: { kind: 'time' }, 21: { kind: 'time' }, 22: { kind: 'datetime' },
  45: { kind: 'time' }, 46: { kind: 'time' }, 47: { kind: 'time' },
  49: { kind: 'text' },
};

/** Interpreta um código de formato numérico (o suficiente para exibir o valor armazenado). */
export function parseFormatCode(code: string): NumberFormatInfo {
  const first = code.split(';')[0];
  // remove literais, cores, condições e marcadores de moeda — guardando o símbolo
  let currency = '';
  const cleaned = first
    .replace(/\[\$([^\]-]*)(-[^\]]*)?\]/g, (_, sym: string) => {
      currency = sym;
      return '';
    })
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"([^"]*)"/g, (_, lit: string) => {
      if (!currency && lit.trim()) currency = lit;
      return '';
    })
    .replace(/\\./g, '')
    .replace(/_.|\*./g, '');
  const lower = cleaned.toLowerCase();
  if (lower.trim() === 'general' || !lower.trim()) return { kind: 'general' };
  if (lower.trim() === '@') return { kind: 'text' };
  const hasDate = /[dy]/.test(lower) || (/m/.test(lower) && !/[h:s]/.test(lower) && !/[0#]/.test(lower));
  const hasTime = /[hs]/.test(lower) || /am\/pm|a\/p/.test(lower);
  if (hasDate || hasTime) return { kind: hasDate && hasTime ? 'datetime' : hasDate ? 'date' : 'time' };
  const percent = cleaned.includes('%');
  const dot = cleaned.indexOf('.');
  const decimals = dot >= 0 ? (cleaned.slice(dot + 1).match(/[0#?]/g) ?? []).length : 0;
  const grouping = /[0#?],[0#?]/.test(cleaned);
  const trimmedCurrency = currency.trim();
  const prefixFirst = trimmedCurrency && first.indexOf(trimmedCurrency) < first.search(/[0#?]/);
  return {
    kind: percent ? 'percent' : 'number',
    decimals,
    grouping,
    ...(trimmedCurrency ? (prefixFirst ? { prefix: `${trimmedCurrency} ` } : { suffix: ` ${trimmedCurrency}` }) : {}),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data serial da planilha → texto `dd/mm/aaaa` (e/ou `hh:mm`). Datas ficam como TEXTO. */
export function serialToDateText(serial: number, kind: 'date' | 'time' | 'datetime', date1904 = false): string {
  if (!Number.isFinite(serial)) return '';
  const days = Math.floor(serial);
  const frac = serial - days;
  // sistema 1900 (com o dia 29/02/1900 fictício) ou 1904
  const base = date1904 ? Date.UTC(1904, 0, 1) : days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(base + days * 86400000 + Math.round(frac * 86400) * 1000);
  const date = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const secs = d.getUTCSeconds();
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}${secs ? `:${pad2(secs)}` : ''}`;
  if (kind === 'time') return time;
  if (kind === 'datetime' || frac > 1e-9) return kind === 'date' && frac < 1e-9 ? date : `${date} ${time}`;
  return date;
}

function groupThousands(int: string, sep: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Texto final de um número armazenado, com o separador decimal escolhido. */
export function formatStoredNumber(num: number, fmt: NumberFormatInfo | undefined, decimalComma: boolean): string {
  const dec = decimalComma ? ',' : '.';
  const grp = decimalComma ? '.' : ',';
  const kind = fmt?.kind ?? 'general';
  if (kind === 'general' || kind === 'text') {
    const s = Number.isInteger(num) ? String(num) : String(Number(num.toPrecision(15)));
    if (/e/i.test(s)) return s;
    return decimalComma ? s.replace('.', ',') : s;
  }
  const value = kind === 'percent' ? num * 100 : num;
  const fixed = Math.abs(value).toFixed(fmt?.decimals ?? 0);
  const [int, frac] = fixed.split('.');
  const body = `${fmt?.grouping ? groupThousands(int, grp) : int}${frac ? dec + frac : ''}`;
  return `${value < 0 ? '-' : ''}${fmt?.prefix ?? ''}${body}${kind === 'percent' ? '%' : ''}${fmt?.suffix ?? ''}`;
}

/** Texto de uma célula para exibição/inserção. */
export function sheetCellText(cell: SheetCell | null | undefined, decimalComma: boolean): string {
  if (!cell) return '';
  if (cell.num !== undefined) return formatStoredNumber(cell.num, cell.numFormat, decimalComma);
  return cell.text;
}

/** Colunas "A", "B", …, "AA" → índice. */
function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
  return m ? { r: parseInt(m[2], 10) - 1, c: columnIndex(m[1]) } : null;
}

/* Cores de tema (SpreadsheetML): índices 0/1 e 2/3 vêm trocados em relação à ordem do clrScheme. */
function readThemeColors(doc: Document | null): string[] {
  if (!doc) return [];
  const scheme = descendants(doc, 'clrScheme')[0];
  if (!scheme) return [];
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  return order.map((name) => {
    const el = firstChild(scheme, name);
    const clr = el ? el.firstElementChild : null;
    if (!clr) return '#000000';
    const v = attr(clr, 'lastClr') ?? attr(clr, 'val') ?? '000000';
    return `#${v.slice(-6).toUpperCase()}`;
  });
}

function rgbToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Aplica `tint` (−1…1) na luminosidade, como a especificação descreve. */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const [h, s, l] = rgbToHsl(hex);
  const nl = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return hslToRgb(h, s, Math.max(0, Math.min(1, nl)));
}

function readColor(el: Element | null, theme: string[]): string | undefined {
  if (!el) return undefined;
  const rgb = attr(el, 'rgb');
  const tint = Number(attr(el, 'tint') ?? 0) || 0;
  if (rgb && /^[0-9a-f]{6,8}$/i.test(rgb)) {
    const hex = `#${rgb.slice(-6).toUpperCase()}`;
    return applyTint(hex, tint);
  }
  const th = attr(el, 'theme');
  if (th !== null && theme[Number(th)]) return applyTint(theme[Number(th)], tint);
  return undefined;
}

interface XlsxStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bg?: string;
  align?: SheetCell['align'];
  numFormat: NumberFormatInfo;
}

function readXlsxStyles(doc: Document | null, theme: string[]): XlsxStyle[] {
  if (!doc) return [];
  const custom = new Map<number, NumberFormatInfo>();
  for (const nf of descendants(doc, 'numFmt')) custom.set(Number(attr(nf, 'numFmtId')), parseFormatCode(attr(nf, 'formatCode') ?? 'General'));
  const fontsEl = descendants(doc, 'fonts')[0];
  const fonts = fontsEl
    ? childrenNamed(fontsEl, 'font').map((f) => {
        const b = firstChild(f, 'b');
        const i = firstChild(f, 'i');
        const color = readColor(firstChild(f, 'color'), theme);
        return { bold: !!b && attr(b, 'val') !== '0' && attr(b, 'val') !== 'false', italic: !!i && attr(i, 'val') !== '0', color: color && color !== '#000000' ? color : undefined };
      })
    : [];
  const fillsEl = descendants(doc, 'fills')[0];
  const fills = fillsEl
    ? childrenNamed(fillsEl, 'fill').map((f) => {
        const p = firstChild(f, 'patternFill');
        if (!p || (attr(p, 'patternType') ?? 'none') === 'none') return undefined;
        return readColor(firstChild(p, 'fgColor'), theme) ?? readColor(firstChild(p, 'bgColor'), theme);
      })
    : [];
  const xfsEl = descendants(doc, 'cellXfs')[0];
  if (!xfsEl) return [];
  return childrenNamed(xfsEl, 'xf').map((xf) => {
    const font = fonts[Number(attr(xf, 'fontId') ?? 0)] ?? {};
    const fill = fills[Number(attr(xf, 'fillId') ?? 0)];
    const id = Number(attr(xf, 'numFmtId') ?? 0);
    const al = firstChild(xf, 'alignment');
    const h = al ? attr(al, 'horizontal') : null;
    return {
      ...font,
      bg: fill && fill !== '#FFFFFF' ? fill : undefined,
      align: h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : h === 'left' ? 'left' : undefined,
      numFormat: custom.get(id) ?? BUILTIN_FORMATS[id] ?? { kind: 'general' },
    };
  });
}

function richText(si: Element): string {
  // texto de <t> diretos e de <r><t>; ignora a fonética (<rPh>)
  let out = '';
  for (let c = si.firstElementChild; c; c = c.nextElementSibling) {
    if (c.localName === 't') out += c.textContent ?? '';
    else if (c.localName === 'r') for (const t of childrenNamed(c, 't')) out += t.textContent ?? '';
  }
  return out;
}

function resolveTarget(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function readOptionalXml(zip: ZipArchive, name: string, label: string): Promise<Document | null> {
  if (!zip.has(name)) return null;
  return parseXml(await zip.readText(name), label);
}

/** `.xlsx` → livro com abas carregadas sob demanda. */
export async function readXlsx(fileName: string, bytes: Uint8Array): Promise<SheetWorkbook> {
  if (bytes.byteLength > SHEET_LIMITS.maxFileBytes) throw new SheetError(t('importexport.sheets.fileLargerThan50Mb'));
  const zip = ZipArchive.open(bytes, { maxTotalUncompressed: SHEET_LIMITS.maxUncompressed });
  if (!zip.has('xl/workbook.xml')) throw new SheetError(t('importexport.sheets.thisDoesntLookLikeXlsx'));
  const wb = parseXml(await zip.readText('xl/workbook.xml'), 'workbook.xml');
  const rels = await readOptionalXml(zip, 'xl/_rels/workbook.xml.rels', 'workbook.xml.rels');
  const relTarget = new Map<string, string>();
  if (rels) for (const r of descendants(rels, 'Relationship')) relTarget.set(attr(r, 'Id') ?? '', resolveTarget('xl/workbook.xml', attr(r, 'Target') ?? ''));
  const date1904 = descendants(wb, 'workbookPr').some((p) => attr(p, 'date1904') === '1' || attr(p, 'date1904') === 'true');
  const sheets = descendants(wb, 'sheet').map((s, i) => ({
    name: attr(s, 'name') ?? t('importexport.sheets.sheetValue', { value: i + 1 }),
    path: relTarget.get(attr(s, 'id') ?? '') ?? `xl/worksheets/sheet${i + 1}.xml`,
    hidden: (attr(s, 'state') ?? 'visible') !== 'visible',
  }));
  const visible = sheets.filter((s) => !s.hidden);
  const list = visible.length ? visible : sheets;
  if (!list.length) throw new SheetError(t('importexport.sheets.theSpreadsheetHasNoSheets'));

  const theme = readThemeColors(await readOptionalXml(zip, 'xl/theme/theme1.xml', 'theme1.xml'));
  const styles = readXlsxStyles(await readOptionalXml(zip, 'xl/styles.xml', 'styles.xml'), theme);
  const sstDoc = await readOptionalXml(zip, 'xl/sharedStrings.xml', 'sharedStrings.xml');
  const shared = sstDoc ? descendants(sstDoc, 'si').map(richText) : [];
  const cache = new Map<number, SheetData>();
  const warnings: string[] = [];
  if (zip.names().some((n) => /vbaProject\.bin$/i.test(n))) warnings.push(t('importexport.sheets.theFileContainsMacrosThey'));
  if (zip.names().some((n) => /^xl\/externalLinks\//i.test(n))) warnings.push(t('importexport.sheets.theFileLinksOtherSpreadsheets'));

  return {
    format: 'xlsx',
    fileName,
    title: baseName(fileName),
    sheetNames: list.map((s) => s.name),
    warnings,
    loadSheet: async (index) => {
      const hit = cache.get(index);
      if (hit) return hit;
      const meta = list[index];
      if (!meta || !zip.has(meta.path)) throw new SheetError(t('importexport.sheets.sheetValueNotFoundFile', { value: meta?.name ?? index + 1 }));
      let doc: Document;
      try {
        doc = parseXml(await zip.readText(meta.path), meta.name);
      } catch (err) {
        if (err instanceof ZipError || err instanceof SheetError) throw err;
        throw new SheetError(t('importexport.sheets.couldntReadSheetName', { name: meta.name }));
      }
      const sheet = xlsxSheet(doc, meta.name, shared, styles, date1904);
      cache.set(index, sheet);
      return sheet;
    },
  };
}

function xlsxSheet(doc: Document, name: string, shared: string[], styles: XlsxStyle[], date1904: boolean): SheetData {
  const grid: SheetRow[] = [];
  let totalRows = 0;
  let totalCols = 0;
  let missingFormulas = 0;
  const dim = descendants(doc, 'dimension')[0];
  if (dim) {
    const [, end] = (attr(dim, 'ref') ?? '').split(':');
    const ref = end ? parseRef(end) : null;
    if (ref) {
      totalRows = ref.r + 1;
      totalCols = ref.c + 1;
    }
  }
  const rowEls = descendants(doc, 'row');
  let lastRow = -1;
  for (const rowEl of rowEls) {
    const r = attr(rowEl, 'r') ? parseInt(attr(rowEl, 'r')!, 10) - 1 : lastRow + 1;
    lastRow = r;
    let lastCol = -1;
    for (const c of childrenNamed(rowEl, 'c')) {
      const ref = attr(c, 'r') ? parseRef(attr(c, 'r')!) : null;
      const col = ref ? ref.c : lastCol + 1;
      lastCol = col;
      const type = attr(c, 't') ?? 'n';
      const v = firstChild(c, 'v');
      const f = firstChild(c, 'f');
      const raw = v?.textContent ?? '';
      const style = styles[Number(attr(c, 's') ?? 0)] ?? { numFormat: { kind: 'general' } };
      let cell: SheetCell = { text: '' };
      if (type === 's') cell.text = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') cell.text = firstChild(c, 'is') ? richText(firstChild(c, 'is')!) : '';
      else if (type === 'str') cell.text = raw;
      else if (type === 'b') cell.text = raw === '1' || raw === 'true' ? 'VERDADEIRO' : 'FALSO';
      else if (type === 'e') cell.text = raw;
      else if (type === 'd') cell.text = raw ? raw.replace(/T.*$/, '').split('-').reverse().join('/') : '';
      else if (raw !== '') {
        const num = Number(raw);
        const kind = style.numFormat.kind;
        if (!Number.isFinite(num)) cell.text = raw;
        else if (kind === 'date' || kind === 'time' || kind === 'datetime') cell.text = serialToDateText(num, kind, date1904);
        else cell = { text: raw, num, numFormat: style.numFormat };
      }
      if (f && !raw) missingFormulas++;
      totalRows = Math.max(totalRows, r + 1);
      totalCols = Math.max(totalCols, col + 1);
      if (r >= SHEET_LIMITS.maxRows || col >= SHEET_LIMITS.maxCols) continue;
      if (style.bold) cell.bold = true;
      if (style.italic) cell.italic = true;
      if (style.color) cell.color = style.color;
      if (style.bg) cell.bg = style.bg;
      if (style.align) cell.align = style.align;
      if (!cell.text && cell.num === undefined && !cell.bg) continue;
      grid[r] = grid[r] ?? [];
      grid[r][col] = cell;
    }
  }
  // mesclagens
  for (const mc of descendants(doc, 'mergeCell')) {
    const [a, b] = (attr(mc, 'ref') ?? '').split(':');
    const s = a ? parseRef(a) : null;
    const e = b ? parseRef(b) : null;
    if (!s || !e || s.r >= SHEET_LIMITS.maxRows || s.c >= SHEET_LIMITS.maxCols) continue;
    const r1 = Math.min(e.r, SHEET_LIMITS.maxRows - 1);
    const c1 = Math.min(e.c, SHEET_LIMITS.maxCols - 1);
    grid[s.r] = grid[s.r] ?? [];
    const anchor = grid[s.r][s.c] ?? { text: '' };
    grid[s.r][s.c] = { ...anchor, ...(r1 > s.r ? { rowSpan: r1 - s.r + 1 } : {}), ...(c1 > s.c ? { colSpan: c1 - s.c + 1 } : {}) };
    for (let r = s.r; r <= r1; r++) {
      grid[r] = grid[r] ?? [];
      for (let c = s.c; c <= c1; c++) if (r !== s.r || c !== s.c) grid[r][c] = null;
    }
  }
  // corta linhas vazias do fim
  let height = grid.length;
  while (height > 0 && !(grid[height - 1] ?? []).some((c) => c === null || (c && (c.text || c.num !== undefined || c.bg)))) height--;
  const rows = normalizeGrid(Array.from({ length: height }, (_, r) => grid[r] ?? []), SHEET_LIMITS.maxCols);
  const warnings = missingFormulas ? [t('importexport.sheets.formulasWithoutValue', { count: missingFormulas })] : [];
  return { name, rows, totalRows, totalCols, truncated: totalRows > SHEET_LIMITS.maxRows || totalCols > SHEET_LIMITS.maxCols, warnings };
}

/* ----------------------------------- ODS ------------------------------------- */

const NS = {
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
};

function nsAttr(el: Element, ns: string, local: string): string | null {
  return el.getAttributeNS(ns, local) ?? attr(el, local);
}

interface OdsStyle {
  bg?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: SheetCell['align'];
  parent?: string;
}

function readOdsStyles(...docs: (Document | null)[]): Map<string, OdsStyle> {
  const map = new Map<string, OdsStyle>();
  for (const doc of docs) {
    if (!doc) continue;
    for (const st of descendants(doc, 'style')) {
      if (nsAttr(st, NS.style, 'family') !== 'table-cell') continue;
      const name = nsAttr(st, NS.style, 'name');
      if (!name) continue;
      const out: OdsStyle = { parent: nsAttr(st, NS.style, 'parent-style-name') ?? undefined };
      const cellProps = firstChild(st, 'table-cell-properties');
      if (cellProps) out.bg = normalizeCssColor(nsAttr(cellProps, NS.fo, 'background-color'));
      const textProps = firstChild(st, 'text-properties');
      if (textProps) {
        const w = nsAttr(textProps, NS.fo, 'font-weight');
        if (w) out.bold = w === 'bold' || Number(w) >= 600;
        if (nsAttr(textProps, NS.fo, 'font-style') === 'italic') out.italic = true;
        const c = normalizeCssColor(nsAttr(textProps, NS.fo, 'color'));
        if (c && c !== '#000000') out.color = c;
      }
      const para = firstChild(st, 'paragraph-properties');
      const a = para ? nsAttr(para, NS.fo, 'text-align') : null;
      if (a === 'center') out.align = 'center';
      else if (a === 'end' || a === 'right') out.align = 'right';
      else if (a === 'start' || a === 'left') out.align = 'left';
      map.set(name, out);
    }
  }
  return map;
}

function resolveOdsStyle(map: Map<string, OdsStyle>, name: string | null): OdsStyle {
  const out: OdsStyle = {};
  const seen = new Set<string>();
  let cur = name;
  const chain: OdsStyle[] = [];
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const st = map.get(cur);
    if (!st) break;
    chain.unshift(st);
    cur = st.parent ?? null;
  }
  for (const st of chain) Object.assign(out, { ...st, parent: undefined });
  return out;
}

/** Texto de uma célula ODS: parágrafos `<text:p>` com `<text:s>`, `<text:tab>` e `<text:line-break>`. */
function odsCellText(cell: Element): string {
  const paras: string[] = [];
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.nodeValue ?? '';
    if (n.nodeType !== 1) return '';
    const el = n as Element;
    if (el.localName === 's') return ' '.repeat(Math.min(200, Number(nsAttr(el, NS.text, 'c') ?? 1) || 1));
    if (el.localName === 'tab') return '\t';
    if (el.localName === 'line-break') return '\n';
    if (el.localName === 'annotation') return '';
    let s = '';
    for (let c = el.firstChild; c; c = c.nextSibling) s += walk(c);
    return s;
  };
  for (let c = cell.firstElementChild; c; c = c.nextElementSibling) if (c.localName === 'p' || c.localName === 'h') paras.push(walk(c));
  return paras.join('\n');
}

function odsRows(table: Element): Element[] {
  const out: Element[] = [];
  const visit = (el: Element) => {
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName === 'table-row') out.push(c);
      else if (c.localName === 'table-header-rows' || c.localName === 'table-row-group' || c.localName === 'table-rows') visit(c);
    }
  };
  visit(table);
  return out;
}

/** `.ods` → livro. Usa o texto exibido de cada célula (valor armazenado já formatado pelo programa de origem). */
export async function readOds(fileName: string, bytes: Uint8Array): Promise<SheetWorkbook> {
  if (bytes.byteLength > SHEET_LIMITS.maxFileBytes) throw new SheetError(t('importexport.sheets.fileLargerThan50Mb'));
  const zip = ZipArchive.open(bytes, { maxTotalUncompressed: SHEET_LIMITS.maxUncompressed });
  if (!zip.has('content.xml')) throw new SheetError(t('importexport.sheets.thisDoesntLookLikeOds'));
  const content = parseXml(await zip.readText('content.xml'), 'content.xml');
  const stylesDoc = await readOptionalXml(zip, 'styles.xml', 'styles.xml');
  const styleMap = readOdsStyles(stylesDoc, content);
  const tables = descendants(content, 'table').filter((t) => t.namespaceURI === NS.table || t.prefix === 'table');
  if (!tables.length) throw new SheetError(t('importexport.sheets.theSpreadsheetHasNoSheets'));
  const names = tables.map((tableEl, i) => nsAttr(tableEl, NS.table, 'name') ?? t('importexport.sheets.sheetValue', { value: i + 1 }));
  const cache = new Map<number, SheetData>();
  return {
    format: 'ods',
    fileName,
    title: baseName(fileName),
    sheetNames: names,
    warnings: zip.names().some((n) => /^Basic\//i.test(n) || /^Scripts\//i.test(n)) ? [t('importexport.sheets.theFileContainsMacrosThey')] : [],
    loadSheet: async (index) => {
      const hit = cache.get(index);
      if (hit) return hit;
      const sheet = odsSheet(tables[index], names[index], styleMap);
      cache.set(index, sheet);
      return sheet;
    },
  };
}

function odsSheet(table: Element, name: string, styles: Map<string, OdsStyle>): SheetData {
  const { maxRows, maxCols } = SHEET_LIMITS;
  const grid: SheetRow[] = [];
  let r = 0;
  let totalRows = 0;
  let totalCols = 0;
  let pendingEmpty = 0;
  const columnDefaults: (string | null)[] = [];
  for (const col of descendants(table, 'table-column')) {
    const rep = Math.min(maxCols, Number(nsAttr(col, NS.table, 'number-columns-repeated') ?? 1) || 1);
    for (let i = 0; i < rep && columnDefaults.length < maxCols; i++) columnDefaults.push(nsAttr(col, NS.table, 'default-cell-style-name'));
  }
  for (const rowEl of odsRows(table)) {
    const repeatRows = Math.max(1, Number(nsAttr(rowEl, NS.table, 'number-rows-repeated') ?? 1) || 1);
    const cells: SheetRow = [];
    let c = 0;
    let rowCols = 0;
    let hasContent = false;
    for (let cellEl = rowEl.firstElementChild; cellEl; cellEl = cellEl.nextElementSibling) {
      if (cellEl.localName !== 'table-cell' && cellEl.localName !== 'covered-table-cell') continue;
      const rep = Math.max(1, Number(nsAttr(cellEl, NS.table, 'number-columns-repeated') ?? 1) || 1);
      const covered = cellEl.localName === 'covered-table-cell';
      const text = covered ? '' : odsCellText(cellEl);
      const style = resolveOdsStyle(styles, nsAttr(cellEl, NS.table, 'style-name') ?? columnDefaults[c] ?? null);
      const colSpan = Number(nsAttr(cellEl, NS.table, 'number-columns-spanned') ?? 1) || 1;
      const rowSpan = Number(nsAttr(cellEl, NS.table, 'number-rows-spanned') ?? 1) || 1;
      const filled = !!text || !!style.bg;
      for (let k = 0; k < rep; k++) {
        if (filled || covered) {
          // célula coberta por mesclagem também mantém a linha (senão a mesclagem vertical se perde)
          hasContent = true;
          rowCols = c + 1;
        }
        if (c < maxCols) {
          if (covered) cells[c] = null;
          else if (filled || colSpan > 1 || rowSpan > 1) {
            cells[c] = {
              text,
              ...(style.bold ? { bold: true } : {}),
              ...(style.italic ? { italic: true } : {}),
              ...(style.color ? { color: style.color } : {}),
              ...(style.bg ? { bg: style.bg } : {}),
              ...(style.align ? { align: style.align } : {}),
              ...(colSpan > 1 ? { colSpan: Math.min(colSpan, maxCols - c) } : {}),
              ...(rowSpan > 1 ? { rowSpan } : {}),
            };
          }
        }
        c++;
        if (!filled && !covered && c > maxCols * 2) break; // repetição gigante de células vazias no fim da linha
      }
    }
    if (!hasContent) {
      pendingEmpty += repeatRows;
      continue;
    }
    // linhas vazias entre conteúdos entram (limitadas)
    for (let i = 0; i < pendingEmpty; i++) {
      if (r < maxRows) grid[r] = [];
      r++;
    }
    pendingEmpty = 0;
    for (let i = 0; i < repeatRows; i++) {
      if (r < maxRows) grid[r] = cells.slice();
      r++;
    }
    totalRows = r;
    totalCols = Math.max(totalCols, rowCols);
  }
  // espalha a cobertura dos rowSpan (as células cobertas já vêm como covered-table-cell no ODS)
  for (let rr = 0; rr < grid.length; rr++) {
    const row = grid[rr];
    if (!row) continue;
    row.forEach((cell, cc) => {
      if (!cell?.rowSpan) return;
      const rs = Math.min(cell.rowSpan, grid.length - rr);
      cell.rowSpan = rs > 1 ? rs : undefined;
      for (let k = 1; k < rs; k++) {
        grid[rr + k] = grid[rr + k] ?? [];
        for (let dc = 0; dc < (cell.colSpan ?? 1); dc++) grid[rr + k][cc + dc] = null;
      }
    });
  }
  const rows = normalizeGrid(grid.slice(0, maxRows), Math.min(totalCols, maxCols));
  return { name, rows, totalRows, totalCols, truncated: totalRows > maxRows || totalCols > maxCols, warnings: [] };
}

/* ------------------------------ Ajuda à prévia ------------------------------- */

/** A 1ª linha parece cabeçalho? (texto não numérico, sem vazios, e a 2ª linha tem algo diferente) */
export function guessHeaderRow(rows: SheetRow[], decimalComma = true): boolean {
  if (rows.length < 2) return false;
  const first = rows[0].map((c) => sheetCellText(c, decimalComma).trim());
  const filled = first.filter(Boolean);
  if (filled.length < Math.max(1, Math.ceil(first.length * 0.5))) return false;
  if (rows[0].some((c) => c?.num !== undefined) || filled.some((t) => looksNumeric(t))) return false;
  return true;
}

/** Grade de textos (para kanban/post-its e para detectar vírgula decimal). */
export function sheetTextRows(sheet: SheetData, decimalComma: boolean): string[][] {
  return sheet.rows.map((row) => row.map((c) => sheetCellText(c, decimalComma)));
}

export function sheetUsesDecimalComma(sheet: SheetData): boolean {
  return detectDecimalComma(sheet.rows.map((row) => row.map((c) => (c?.num !== undefined ? '' : c?.text ?? ''))));
}

/** Livro de uma ou mais tabelas HTML coladas. */
export function workbookFromHtmlTables(tables: SheetData[], mimeTypes: string[]): SheetWorkbook {
  return {
    format: 'html-table',
    fileName: t('importexport.sheets.clipboard'),
    title: t('importexport.sheets.pastedTable'),
    sheetNames: tables.map((t) => t.name),
    loadSheet: async (i) => tables[i],
    warnings: [],
    mimeTypes,
  };
}

/** Livro de texto em colunas (TSV colado). */
export function workbookFromPastedText(text: string, delimiter: Delimiter, mimeTypes: string[]): SheetWorkbook {
  const sheet = sheetFromDelimitedText(t('importexport.sheets.pastedText'), text, delimiter);
  const bytes = new TextEncoder().encode(text);
  return {
    format: 'text-tsv',
    fileName: t('importexport.sheets.clipboard'),
    title: t('importexport.sheets.pastedTable'),
    sheetNames: [sheet.name],
    loadSheet: async () => sheet,
    warnings: [],
    text: { bytes, delimiter, encoding: 'utf-8' },
    mimeTypes,
  };
}
