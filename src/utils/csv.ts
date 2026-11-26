import { t } from '../i18n';
/**
 * LuDraw — Texto tabular (Chat 05): CSV/TSV no padrão RFC 4180, detecção de separador e de
 * codificação, números com vírgula decimal e proteção contra injeção de fórmulas.
 *
 * Funções puras (sem DOM), escritas do zero a partir da RFC 4180 e da especificação de
 * codificação do WHATWG (`TextDecoder`). Usadas pelos importadores (colar/arquivo) e por TODA
 * exportação para planilhas (CSV de objetos, CSV de issues, CSV/TSV/HTML de tabelas).
 */

export type Delimiter = ',' | ';' | '\t' | '|';
export type TextEncodingId = 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be';

export const DELIMITER_LABELS: Record<Delimiter, string> = {
  get ','() {
    return t('importexport.csv.comma');
  },
  get ';'() {
    return t('importexport.csv.semicolon');
  },
  get '\t'() {
    return t('importexport.csv.tab');
  },
  get '|'() {
    return t('importexport.csv.verticalBar');
  },
};

export const ENCODING_LABELS: Record<TextEncodingId, string> = {
  'utf-8': 'UTF-8',
  'windows-1252': 'Windows-1252 (Latin-1)',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
};

/* -------------------------------- Codificação -------------------------------- */

export interface DecodedText {
  text: string;
  encoding: TextEncodingId;
  /** O arquivo começava com BOM (marca de ordem de bytes) */
  bom: boolean;
}

function decodeWith(bytes: Uint8Array, encoding: TextEncodingId, fatal: boolean): string {
  return new TextDecoder(encoding, { fatal, ignoreBOM: false }).decode(bytes);
}

/**
 * Decodifica bytes de texto. `auto`: BOM (UTF-8/UTF-16) → UTF-8 estrito → Windows-1252
 * (planilhas antigas exportadas no Windows em português).
 */
export function decodeText(bytes: Uint8Array, encoding: TextEncodingId | 'auto' = 'auto'): DecodedText {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const utf8Bom = b0 === 0xef && b1 === 0xbb && b2 === 0xbf;
  const le = b0 === 0xff && b1 === 0xfe;
  const be = b0 === 0xfe && b1 === 0xff;
  if (encoding !== 'auto') {
    const bom = (encoding === 'utf-8' && utf8Bom) || (encoding === 'utf-16le' && le) || (encoding === 'utf-16be' && be);
    return { text: stripBom(decodeWith(bytes, encoding, false)), encoding, bom };
  }
  if (utf8Bom) return { text: stripBom(decodeWith(bytes, 'utf-8', false)), encoding: 'utf-8', bom: true };
  if (le) return { text: stripBom(decodeWith(bytes, 'utf-16le', false)), encoding: 'utf-16le', bom: true };
  if (be) return { text: stripBom(decodeWith(bytes, 'utf-16be', false)), encoding: 'utf-16be', bom: true };
  try {
    return { text: decodeWith(bytes, 'utf-8', true), encoding: 'utf-8', bom: false };
  } catch {
    return { text: decodeWith(bytes, 'windows-1252', false), encoding: 'windows-1252', bom: false };
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/* ---------------------------------- Leitura ---------------------------------- */

export interface ParsedTable {
  rows: string[][];
  /** Linhas/colunas existentes no texto (antes do corte por limite) */
  totalRows: number;
  totalCols: number;
  /** Houve corte por `maxRows`/`maxCols` */
  truncated: boolean;
}

export interface ParseLimits {
  maxRows?: number;
  maxCols?: number;
}

/**
 * Lê texto delimitado (RFC 4180): campos entre aspas podem conter o separador, quebras de linha
 * e aspas duplicadas (`""`). Aceita CRLF, LF e CR. Linhas vazias no fim são descartadas.
 * As linhas além do limite ainda são contadas (para o aviso "mostrando N de M").
 */
export function parseDelimited(text: string, delimiter: Delimiter, limits: ParseLimits = {}): ParsedTable {
  const maxRows = limits.maxRows ?? Infinity;
  const maxCols = limits.maxCols ?? Infinity;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  let totalRows = 0;
  let totalCols = 0;

  const pushField = () => {
    if (row.length < maxCols) row.push(field);
    field = '';
    fieldStarted = false;
  };
  const pushRow = (count: number) => {
    totalCols = Math.max(totalCols, count);
    totalRows++;
    if (rows.length < maxRows) rows.push(row);
    row = [];
  };

  let fieldsInRow = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else if (ch === '\r') {
        // quebra de linha dentro de aspas: CRLF/CR viram \n (texto do board)
        if (text[i + 1] === '\n') i++;
        field += '\n';
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted && field.length === 0) {
      quoted = true;
      fieldStarted = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      fieldsInRow++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushField();
      fieldsInRow++;
      pushRow(fieldsInRow);
      fieldsInRow = 0;
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  if (field.length > 0 || fieldsInRow > 0 || quoted) {
    pushField();
    fieldsInRow++;
    pushRow(fieldsInRow);
  }
  // remove linhas totalmente vazias do fim (arquivo terminado em várias quebras de linha)
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) {
    rows.pop();
    totalRows--;
  }
  const truncated = totalRows > rows.length || totalCols > maxCols;
  return { rows, totalRows: Math.max(totalRows, rows.length), totalCols, truncated };
}

/** Divide em linhas lógicas (respeitando aspas) — só para amostragem na detecção. */
function sampleLines(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length && out.length < max; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (cur.trim()) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() && out.length < max) out.push(cur);
  return out;
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === ch && !quoted) n++;
  }
  return n;
}

/**
 * Separador mais provável: o que divide as primeiras linhas num número CONSISTENTE de campos.
 * Empate → tabulação > ponto e vírgula > vírgula > barra (o `;` vence a `,` porque, em pt-BR,
 * a vírgula costuma ser o separador decimal).
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = sampleLines(text, 30);
  if (lines.length === 0) return ',';
  const candidates: Delimiter[] = ['\t', ';', ',', '|'];
  let best: { d: Delimiter; score: number } | null = null;
  for (const d of candidates) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const freq = new Map<number, number>();
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    if (freq.size === 0) continue;
    const [mode, hits] = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const consistency = hits / lines.length;
    if (consistency < 0.6) continue;
    const score = consistency * 10 + Math.min(mode, 8) * 0.01;
    if (!best || score > best.score + 0.5) best = { d, score };
  }
  return best?.d ?? ',';
}

/* ---------------------------------- Números ---------------------------------- */

const NUMBER_DOT = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const NUMBER_COMMA = /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

/**
 * Converte texto numérico em número aceitando `1.234,56` e `1,5` (vírgula decimal) ou `1,234.56`
 * e `1.5`. `decimalComma` desempata casos como `1.234`. Aceita `%` no fim. Devolve `null` se não
 * for número.
 */
export function parseLocaleNumber(raw: string, decimalComma = true): number | null {
  let s = raw.trim().replace(/ /g, ' ');
  if (!s) return null;
  let percent = false;
  if (s.endsWith('%')) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  s = s.replace(/ /g, '');
  let value: number | null = null;
  const comma = NUMBER_COMMA.test(s);
  const dot = NUMBER_DOT.test(s);
  if (comma && (decimalComma || !dot)) value = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (dot) value = Number(s.replace(/,/g, ''));
  if (value === null || !Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
}

export function looksNumeric(raw: string): boolean {
  return parseLocaleNumber(raw, true) !== null || parseLocaleNumber(raw, false) !== null;
}

/** As células numéricas da amostra usam vírgula decimal? (`3,5` · `1.234,56`) */
export function detectDecimalComma(rows: string[][]): boolean {
  let comma = 0;
  let dot = 0;
  for (const row of rows.slice(0, 200)) {
    for (const c of row) {
      const s = c.trim();
      if (/^[+-]?\d{1,3}(\.\d{3})*,\d+%?$/.test(s) || /^[+-]?\d+,\d{1,2}%?$/.test(s)) comma++;
      else if (/^[+-]?\d{1,3}(,\d{3})*\.\d+%?$/.test(s) || /^[+-]?\d+\.\d+%?$/.test(s)) dot++;
    }
  }
  return comma >= dot;
}

/* ------------------------- Proteção contra fórmulas -------------------------- */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+([.,]\d+)*)([.,]\d+)?%?$/;

/**
 * Proteção contra injeção de fórmulas (CSV/TSV/HTML para planilhas): texto que começa com
 * `=`, `+`, `-` ou `@` (ou tabulação/retorno) recebe um apóstrofo à frente, para a planilha
 * tratá-lo como texto. Números puros (`-5`, `+3,5`, `-12%`) não podem conter fórmula e ficam iguais.
 */
export function guardSpreadsheetValue(value: string): string {
  if (!value || !FORMULA_START.test(value)) return value;
  if (PLAIN_NUMBER.test(value.trim())) return value;
  return `'${value}`;
}

/** Na importação: desfaz a proteção acima (`'=SOMA(…)` volta a ser `=SOMA(…)` como TEXTO). */
export function unguardSpreadsheetValue(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

/* --------------------------------- Escrita ----------------------------------- */

export interface CsvWriteOptions {
  delimiter?: Delimiter;
  /** BOM UTF-8 no início (ajuda planilhas do Windows a reconhecer acentos). Padrão: false */
  bom?: boolean;
  /** Fim de linha. RFC 4180 = CRLF (padrão) */
  newline?: '\r\n' | '\n';
  /** Proteção contra fórmulas. Padrão: true — só desligue para formatos que não vão a planilhas */
  guard?: boolean;
}

/** Um campo CSV (aspas quando tem separador, aspas, quebra de linha ou espaço nas pontas). */
export function csvField(value: string | number | boolean | null | undefined, delimiter: Delimiter = ',', guard = true): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (guard) s = guardSpreadsheetValue(s);
  const needsQuotes = s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s);
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][], options: CsvWriteOptions = {}): string {
  const d = options.delimiter ?? ',';
  const nl = options.newline ?? '\r\n';
  const guard = options.guard !== false;
  const body = rows.map((r) => r.map((v) => csvField(v, d, guard)).join(d)).join(nl);
  return (options.bom ? '﻿' : '') + body + (rows.length ? nl : '');
}

/** TSV para a área de transferência (colar em planilhas): mesmas regras de aspas, com proteção. */
export function toTsv(rows: string[][], guard = true): string {
  return rows.map((r) => r.map((v) => csvField(v, '\t', guard)).join('\t')).join('\n');
}

/** Normaliza linhas para o mesmo número de colunas (completa com vazio). */
export function padRows(rows: string[][], cols?: number): string[][] {
  const width = cols ?? rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => (r.length >= width ? r.slice(0, width) : [...r, ...Array.from({ length: width - r.length }, () => '')]));
}
