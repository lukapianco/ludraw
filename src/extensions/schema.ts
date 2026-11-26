/**
 * LuDraw — Validador do manifest e das contribuições declarativas (Chat 06.5 · Rodada A).
 *
 * PURO: sem DOM, sem React, sem stores, sem i18n em execução (só tipos). Usa apenas
 * `utils/svgPath.ts` (também puro) para normalizar paths. Roda no navegador, no Node
 * (`npm run test:extensions`) e, no Chat 07, no servidor.
 *
 * Princípios:
 * - **allowlist em tudo**: campo desconhecido é erro (pega erro de digitação e fecha brechas);
 * - limites de tamanho/quantidade em todo texto, lista e path;
 * - mensagens são chave + parâmetros (`extensions.schema.*`), traduzidas pela UI;
 * - o resultado válido volta NORMALIZADO (paths só com M/L/C/Q/Z absolutos), pronto para uso.
 *
 * Também valida o que chega por OUTROS caminhos (abrir/importar board, export): `validateCustomPath`
 * e `validateCompositeElement` — elemento inválido é ignorado na tela e no export, sem quebrar o board.
 */
import type { MessageDescriptor } from '../i18n/types';
import { parsePathData, pathBounds, serializePath } from '../utils/svgPath';
import { hasDynamicImport } from '../utils/textSniff';
import type {
  DeclarativeElementType,
  DeclPart,
  ExtensionManifest,
  ExtensionSource,
  PaletteContribution,
  ShapeContribution,
  StickerPackContribution,
  TemplateContribution,
  TemplateElementInput,
  ThemeContribution,
} from './types';

/* ================================== Constantes ================================== */

/** Prefixo reservado às extensões oficiais embutidas no app. */
export const BUILTIN_ID_PREFIX = 'dev.ludraw.';

/** CLEAN_ROOM.md §5 — licenças permitidas sem aprovação. */
export const ALLOWED_LICENSES = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'CC0-1.0', 'Unlicense', 'OFL-1.1', 'Zlib'] as const;
/** CLEAN_ROOM.md §5 — só com aprovação explícita do usuário: recusadas na instalação. */
const APPROVAL_LICENSES = /^(LGPL|MPL|CC-BY)/i;

export const LICENSE_FILES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'];

/** Formas do núcleo que um modelo pode usar (espelha `ShapeKind`). */
const CORE_SHAPES = ['rectangle', 'rounded_rectangle', 'circle', 'diamond', 'triangle', 'cylinder', 'parallelogram', 'cloud', 'star', 'hexagon', 'speech_bubble'];

export const LIMITS = {
  text: 5000,
  name: 80,
  description: 400,
  id: 64,
  shapes: 100,
  templates: 50,
  templateElements: 2000,
  themes: 10,
  stickerPacks: 10,
  stickers: 200,
  palettes: 20,
  paletteColors: 32,
  elementTypes: 30,
  parts: 24,
  fields: 16,
  strings: 500,
  /** números num path de forma/peça do manifest */
  pathNumbers: 4000,
  /** números num `customPath` de board (SVG importado pode ser grande) */
  boardPathNumbers: 100_000,
  coord: 50_000,
  size: 20_000,
  issues: 50,
} as const;

/**
 * Tokens que um tema pode alterar (nome curto, sem `--od-`). Fora daqui: marca (`brand-*`, estática no
 * Tailwind), anel de foco, movimento e espaçamento.
 */
export const THEME_COLOR_TOKENS = [
  'canvas', 'canvas-dot', 'canvas-dot-major', 'app-bg', 'panel', 'panel-hover', 'panel-active', 'panel-sunken',
  'border', 'border-strong', 'text', 'text-muted', 'text-subtle', 'text-inverse',
  'accent', 'accent-hover', 'accent-pressed', 'accent-contrast', 'accent-soft', 'selection', 'selection-fill', 'guide',
  'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft', 'info', 'info-soft',
] as const;
export const THEME_SHADOW_TOKENS = ['shadow-panel', 'shadow-pop', 'shadow-modal'] as const;
export const THEME_RADIUS_TOKENS = ['radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'radius-2xl'] as const;

/** Tokens obrigatórios nos dois modos (são os que entram nos pares de contraste). */
export const THEME_REQUIRED_TOKENS = ['canvas', 'app-bg', 'panel', 'text', 'text-muted', 'accent', 'accent-contrast', 'selection', 'warning', 'warning-soft', 'danger', 'danger-soft'] as const;
/** Precisam ser opacos (a base de todo o resto). */
const THEME_OPAQUE_TOKENS = ['canvas', 'app-bg', 'panel', 'text', 'text-muted', 'accent', 'accent-contrast', 'selection', 'warning', 'danger'];
/** Fundos de aviso translúcidos: opacidade mínima para não sumirem. */
const THEME_SOFT_MIN_ALPHA = 0.08;

/**
 * Pares de contraste (WCAG 2.x). `over` = o fundo é composto sobre este token antes de medir
 * (cores "soft" translúcidas, como no tema escuro do núcleo).
 */
export const THEME_CONTRAST_PAIRS: ReadonlyArray<{ fg: string; bg: string; over?: string; min: number }> = [
  { fg: 'text', bg: 'panel', min: 4.5 },
  { fg: 'text', bg: 'app-bg', min: 4.5 },
  { fg: 'text-muted', bg: 'panel', min: 4.5 },
  { fg: 'text', bg: 'warning-soft', over: 'panel', min: 4.5 },
  { fg: 'danger', bg: 'panel', min: 4.5 },
  // Chat 06.5: AA cheio — o núcleo passou a cumprir depois de `--od-danger` claro ir para #bc3f2c (era 4,29:1)
  { fg: 'danger', bg: 'danger-soft', over: 'panel', min: 4.5 },
  { fg: 'accent-contrast', bg: 'accent', min: 4.5 },
  { fg: 'warning', bg: 'panel', min: 3 },
  { fg: 'accent', bg: 'panel', min: 3 },
  { fg: 'selection', bg: 'canvas', min: 3 },
];

/* ==================================== Tipos ==================================== */

export interface ValidationIssue {
  /** Caminho do campo (ex.: `contributes.themes[0].light.panel`) */
  path: string;
  message: MessageDescriptor;
}

export type ManifestResult = { ok: true; manifest: ExtensionManifest } | { ok: false; issues: ValidationIssue[] };

export interface ManifestContext {
  /** Caminho → sha256 de cada arquivo do pacote */
  fileHashes: Record<string, string>;
  source: ExtensionSource;
}

class Issues {
  readonly list: ValidationIssue[] = [];
  add(path: string, key: MessageDescriptor['key'], params?: MessageDescriptor['params']): void {
    if (this.list.length < LIMITS.issues) this.list.push({ path, message: params ? { key, params } : { key } });
  }
  get count(): number {
    return this.list.length;
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/* ================================ Cores e contraste ================================ */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const FORBIDDEN_CSS = /[;{}<>\\"'`]|url\(|@import|expression|javascript:/i;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d{1,4}|1\.0{1,4})\s*)?\)$/i;
const HSL = /^hsla?\(\s*(\d{1,3}(?:\.\d{1,4})?)\s*,\s*(\d{1,3}(?:\.\d{1,4})?)%\s*,\s*(\d{1,3}(?:\.\d{1,4})?)%\s*(?:,\s*(0|1|0?\.\d{1,4}|1\.0{1,4})\s*)?\)$/i;
const HEX6 = /^#[0-9a-f]{6}$/i;

/** O valor tem algo que poderia escapar da declaração CSS? */
export function hasCssInjection(value: string): boolean {
  return FORBIDDEN_CSS.test(value);
}

/** Cor estrita (`#hex`, `rgb[a]()`, `hsl[a]()` numéricos). Qualquer outra coisa → null. */
export function parseColor(value: unknown): Rgba | null {
  if (typeof value !== 'string' || value.length > 64 || hasCssInjection(value)) return null;
  const v = value.trim();
  let m = HEX.exec(v);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = RGB.exec(v);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b, a: m[4] === undefined ? 1 : Number(m[4]) };
  }
  m = HSL.exec(v);
  if (m) {
    const h = Number(m[1]);
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    if (h > 360 || s > 1 || l > 1) return null;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a: m[4] === undefined ? 1 : Number(m[4]) };
  }
  return null;
}

/** Compõe uma cor (possivelmente translúcida) sobre um fundo opaco. */
export function blend(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function luminance(c: Rgba): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/** Razão de contraste WCAG 2.x entre duas cores opacas. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ContrastResult {
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  ok: boolean;
}

/** Mede os pares de contraste de um modo do tema (tokens já validados). */
export function themeContrast(tokens: Record<string, string>): ContrastResult[] {
  const out: ContrastResult[] = [];
  for (const p of THEME_CONTRAST_PAIRS) {
    const fg = parseColor(tokens[p.fg]);
    let bg = parseColor(tokens[p.bg]);
    if (!fg || !bg) continue;
    if (p.over) {
      const base = parseColor(tokens[p.over]);
      if (!base) continue;
      bg = blend(bg, base);
    }
    const ratio = Math.round(contrastRatio(fg.a < 1 ? blend(fg, bg) : fg, bg) * 100) / 100;
    out.push({ fg: p.fg, bg: p.bg, ratio, min: p.min, ok: ratio >= p.min });
  }
  return out;
}

const SHADOW_LEN = '-?(?:\\d{1,3}(?:\\.\\d{1,3})?)(?:px)?';
const SHADOW_LAYER = new RegExp(`^(?:inset\\s+)?${SHADOW_LEN}\\s+${SHADOW_LEN}(?:\\s+${SHADOW_LEN}){0,2}\\s+(.+)$`, 'i');

/** Sombra estrita: 1–4 camadas `[inset] x y [blur [spread]] cor`. `none` é recusado. */
export function isValidShadow(value: string): boolean {
  if (typeof value !== 'string' || value.length > 240 || hasCssInjection(value)) return false;
  const layers: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      layers.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  layers.push(cur.trim());
  if (!layers.length || layers.length > 4) return false;
  return layers.every((l) => {
    const m = SHADOW_LAYER.exec(l);
    return !!m && !!parseColor(m[1].trim());
  });
}

export function isValidRadius(value: string): boolean {
  return typeof value === 'string' && /^(?:\d|[1-3]\d)(?:\.\d{1,2})?px$/.test(value);
}

/* ===================================== Paths ===================================== */

const PATH_TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[\s,]+/y;

/** Gramática genérica de path SVG (manifest). Devolve a contagem de números ou null se inválido. */
function scanPathSyntax(d: string): number | null {
  if (typeof d !== 'string' || !d.trim() || d.length > 60_000) return null;
  PATH_TOKEN.lastIndex = 0;
  let numbers = 0;
  let first: string | null = null;
  while (PATH_TOKEN.lastIndex < d.length) {
    const start = PATH_TOKEN.lastIndex;
    const m = PATH_TOKEN.exec(d);
    if (!m || PATH_TOKEN.lastIndex === start) return null;
    const tok = m[0];
    if (/^[\s,]+$/.test(tok)) continue;
    if (/^[A-Za-z]$/.test(tok)) {
      if (first === null) first = tok;
      continue;
    }
    if (!Number.isFinite(Number(tok))) return null;
    numbers++;
  }
  if (first !== 'M' && first !== 'm') return null;
  return numbers;
}

const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

/**
 * Path NORMALIZADO (o formato gravado no board: só M/L/C/Q/Z absolutos, como `serializePath`).
 * Usado ao abrir/importar boards e no export: path fora deste formato é ignorado.
 */
export function validateCustomPath(d: unknown, maxNumbers: number = LIMITS.boardPathNumbers): boolean {
  if (typeof d !== 'string' || !d.trim() || d.length > maxNumbers * 24) return false;
  if (!/^[MLCQZ0-9eE.,\s+-]+$/.test(d)) return false;
  const re = /([MLCQZ])([^MLCQZ]*)/g;
  let total = 0;
  let consumed = 0;
  let first = true;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (d.slice(consumed, m.index).trim()) return false;
    consumed = re.lastIndex;
    const cmd = m[1];
    if (first && cmd !== 'M') return false;
    first = false;
    const body = m[2].trim();
    const nums = body ? body.split(/[\s,]+/) : [];
    if (nums.some((n) => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(n) || !Number.isFinite(Number(n)) || Math.abs(Number(n)) > 1e7)) return false;
    const arity = ARITY[cmd];
    if (arity === 0 ? nums.length !== 0 : nums.length === 0 || nums.length % arity !== 0) return false;
    total += nums.length;
    if (total > maxNumbers) return false;
  }
  return !first && !d.slice(consumed).trim();
}

/** Valida a sintaxe genérica e devolve o path normalizado dentro da caixa (ou registra o problema). */
function normalizePath(d: unknown, box: { width: number; height: number }, path: string, issues: Issues, maxNumbers: number = LIMITS.pathNumbers): string | null {
  if (typeof d !== 'string') {
    issues.add(path, 'extensions.schema.expectedString');
    return null;
  }
  const count = scanPathSyntax(d);
  if (count === null) {
    issues.add(path, 'extensions.schema.pathSyntax');
    return null;
  }
  if (count > maxNumbers) {
    issues.add(path, 'extensions.schema.pathTooComplex', { max: maxNumbers });
    return null;
  }
  let segs;
  try {
    segs = parsePathData(d);
  } catch {
    issues.add(path, 'extensions.schema.pathSyntax');
    return null;
  }
  const b = pathBounds(segs);
  if (!segs.length || !b) {
    issues.add(path, 'extensions.schema.pathSyntax');
    return null;
  }
  const tolX = box.width * 0.02;
  const tolY = box.height * 0.02;
  if (b.x < -tolX || b.y < -tolY || b.x + b.width > box.width + tolX || b.y + b.height > box.height + tolY) {
    issues.add(path, 'extensions.schema.pathOutOfBox');
    return null;
  }
  const out = serializePath(segs);
  return validateCustomPath(out, maxNumbers) ? out : (issues.add(path, 'extensions.schema.pathSyntax'), null);
}

/* ================================ Helpers de campo ================================ */

function checkKeys(obj: Obj, allowed: readonly string[], path: string, issues: Issues): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) issues.add(path ? `${path}.${k}` : k, 'extensions.schema.unknownField', { field: k });
}

function str(obj: Obj, key: string, path: string, issues: Issues, opts: { required?: boolean; max?: number; pattern?: RegExp; patternKey?: MessageDescriptor['key'] } = {}): string | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (opts.required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (typeof v !== 'string') {
    issues.add(p, 'extensions.schema.expectedString');
    return undefined;
  }
  if (opts.required && !v.trim()) {
    issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  const max = opts.max ?? LIMITS.text;
  if (v.length > max) {
    issues.add(p, 'extensions.schema.tooLong', { max });
    return undefined;
  }
  if (opts.pattern && !opts.pattern.test(v)) {
    issues.add(p, opts.patternKey ?? 'extensions.schema.format');
    return undefined;
  }
  return v;
}

function num(obj: Obj, key: string, path: string, issues: Issues, min: number, max: number, required = false): number | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    issues.add(p, 'extensions.schema.expectedNumber');
    return undefined;
  }
  if (v < min || v > max) {
    issues.add(p, 'extensions.schema.numberRange', { min, max });
    return undefined;
  }
  return v;
}

function bool(obj: Obj, key: string, path: string, issues: Issues, required = false): boolean | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (typeof v !== 'boolean') {
    issues.add(p, 'extensions.schema.expectedBoolean');
    return undefined;
  }
  return v;
}

function choice<T extends string>(obj: Obj, key: string, path: string, issues: Issues, options: readonly T[], required = false): T | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (typeof v !== 'string' || !options.includes(v as T)) {
    issues.add(p, 'extensions.schema.choice', { options: options.join(', ') });
    return undefined;
  }
  return v as T;
}

function arr(obj: Obj, key: string, path: string, issues: Issues, max: number, required = false): unknown[] | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (!Array.isArray(v)) {
    issues.add(p, 'extensions.schema.expectedArray');
    return undefined;
  }
  if (v.length > max) {
    issues.add(p, 'extensions.schema.tooMany', { max });
    return undefined;
  }
  return v;
}

function objAt(obj: Obj, key: string, path: string, issues: Issues, required = false): Obj | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (!isObj(v)) {
    issues.add(p, 'extensions.schema.expectedObject');
    return undefined;
  }
  return v;
}

function color(obj: Obj, key: string, path: string, issues: Issues, opts: { allowNone?: boolean; hexOnly?: boolean; required?: boolean } = {}): string | undefined {
  const v = obj[key];
  const p = path ? `${path}.${key}` : key;
  if (v === undefined) {
    if (opts.required) issues.add(p, 'extensions.schema.required');
    return undefined;
  }
  if (typeof v === 'string' && opts.allowNone && (v === 'none' || v === 'transparent')) return v;
  if (typeof v === 'string' && hasCssInjection(v)) {
    issues.add(p, 'extensions.schema.cssInjection');
    return undefined;
  }
  if (opts.hexOnly ? !(typeof v === 'string' && HEX6.test(v)) : !parseColor(v)) {
    issues.add(p, opts.hexOnly ? 'extensions.schema.hexColor' : 'extensions.schema.color');
    return undefined;
  }
  return v as string;
}

const LOCALE_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;
const LOCAL_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const STRING_REF = /^\{\{([A-Za-z0-9_.-]{1,64})\}\}$/;
const SLOT = /^[a-z][a-z0-9_-]{0,31}$/;

function localized(obj: Obj, key: string, path: string, issues: Issues): void {
  const v = objAt(obj, key, path, issues);
  if (!v) return;
  const p = `${path ? `${path}.` : ''}${key}`;
  const langs = Object.keys(v);
  if (langs.length > 40) issues.add(p, 'extensions.schema.tooMany', { max: 40 });
  for (const lang of langs) {
    if (!LOCALE_CODE.test(lang)) issues.add(`${p}.${lang}`, 'extensions.schema.localeCode', { code: lang });
    const entry = v[lang];
    if (!isObj(entry)) {
      issues.add(`${p}.${lang}`, 'extensions.schema.expectedObject');
      continue;
    }
    checkKeys(entry, ['name', 'description'], `${p}.${lang}`, issues);
    str(entry, 'name', `${p}.${lang}`, issues, { max: LIMITS.name });
    str(entry, 'description', `${p}.${lang}`, issues, { max: LIMITS.description });
  }
}

/** Tabela `strings` (`{ "pt-BR": { chave: texto } }`) → conjunto de chaves conhecidas. */
function stringTable(obj: Obj, path: string, issues: Issues): Set<string> {
  const keys = new Set<string>();
  const v = objAt(obj, 'strings', path, issues);
  if (!v) return keys;
  for (const lang of Object.keys(v)) {
    const p = `${path}.strings.${lang}`;
    if (!LOCALE_CODE.test(lang)) issues.add(p, 'extensions.schema.localeCode', { code: lang });
    const table = v[lang];
    if (!isObj(table)) {
      issues.add(p, 'extensions.schema.expectedObject');
      continue;
    }
    const entries = Object.entries(table);
    if (entries.length > LIMITS.strings) issues.add(p, 'extensions.schema.tooMany', { max: LIMITS.strings });
    for (const [k, text] of entries) {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(k)) issues.add(`${p}.${k}`, 'extensions.schema.format');
      if (typeof text !== 'string') issues.add(`${p}.${k}`, 'extensions.schema.expectedString');
      else if (text.length > LIMITS.text) issues.add(`${p}.${k}`, 'extensions.schema.tooLong', { max: LIMITS.text });
      keys.add(k);
    }
  }
  return keys;
}

/** Texto que pode ser `"{{chave}}"`: a chave precisa existir na tabela `strings`. */
function textOrRef(obj: Obj, key: string, path: string, issues: Issues, known: Set<string> | null, required = false): void {
  const v = str(obj, key, path, issues, { required });
  if (v === undefined || known === null) return;
  const m = STRING_REF.exec(v);
  if (m && !known.has(m[1])) issues.add(`${path}.${key}`, 'extensions.schema.stringKey', { key: m[1] });
}

function uniqueIds(list: unknown[], path: string, issues: Issues): void {
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const id = isObj(item) ? item.id : undefined;
    if (typeof id !== 'string') return;
    if (seen.has(id)) issues.add(`${path}[${i}].id`, 'extensions.schema.duplicateId', { id });
    seen.add(id);
  });
}

/* ================================ Peças declarativas ================================ */

const PART_KINDS = ['rect', 'ellipse', 'path', 'text', 'badge'] as const;
const PART_KEYS: Record<(typeof PART_KINDS)[number], string[]> = {
  rect: ['kind', 'x', 'y', 'w', 'h', 'radius', 'fill', 'stroke', 'strokeWidth', 'dashed'],
  ellipse: ['kind', 'x', 'y', 'w', 'h', 'fill', 'stroke', 'strokeWidth', 'dashed'],
  path: ['kind', 'x', 'y', 'w', 'h', 'd', 'fill', 'stroke', 'strokeWidth'],
  text: ['kind', 'x', 'y', 'w', 'h', 'slot', 'text', 'fontSize', 'bold', 'italic', 'align', 'valign', 'color'],
  badge: ['kind', 'x', 'y', 'w', 'h', 'slot', 'text', 'fontSize', 'fill', 'color'],
};

/**
 * Valida (e normaliza) a lista de peças. `normalized = true` = vindas de um board (path já tem de
 * estar normalizado); `false` = vindas do manifest (path com sintaxe SVG genérica).
 */
function validateParts(raw: unknown, path: string, issues: Issues, opts: { normalized: boolean; knownStrings?: Set<string> }): DeclPart[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add(path, 'extensions.schema.expectedArray');
    return null;
  }
  if (raw.length > LIMITS.parts) {
    issues.add(path, 'extensions.schema.tooMany', { max: LIMITS.parts });
    return null;
  }
  const before = issues.count;
  const out: DeclPart[] = [];
  let mains = 0;
  raw.forEach((part, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(part)) {
      issues.add(p, 'extensions.schema.expectedObject');
      return;
    }
    const kind = part.kind;
    if (typeof kind !== 'string' || !(PART_KINDS as readonly string[]).includes(kind)) {
      issues.add(`${p}.kind`, 'extensions.schema.partKind', { kind: String(kind) });
      return;
    }
    const k = kind as (typeof PART_KINDS)[number];
    checkKeys(part, PART_KEYS[k], p, issues);
    for (const f of ['x', 'y', 'w', 'h']) num(part, f, p, issues, f === 'w' || f === 'h' ? 0.001 : 0, 1, true);
    const copy: Obj = { ...part };
    if (k === 'rect' || k === 'ellipse' || k === 'path') {
      color(part, 'fill', p, issues, { allowNone: true });
      color(part, 'stroke', p, issues, { allowNone: true });
      num(part, 'strokeWidth', p, issues, 0, 24);
      if (k !== 'path') bool(part, 'dashed', p, issues);
      if (k === 'rect') num(part, 'radius', p, issues, 0, 200);
      if (k === 'path') {
        if (opts.normalized) {
          if (!validateCustomPath(part.d, LIMITS.pathNumbers)) issues.add(`${p}.d`, 'extensions.schema.pathSyntax');
        } else {
          const d = normalizePath(part.d, { width: 100, height: 100 }, `${p}.d`, issues);
          if (d) copy.d = d;
        }
      }
    } else {
      const slot = str(part, 'slot', p, issues, { max: 32, pattern: SLOT });
      if (slot === 'main') mains++;
      if (opts.knownStrings) textOrRef(part, 'text', p, issues, opts.knownStrings);
      else str(part, 'text', p, issues);
      num(part, 'fontSize', p, issues, 6, 200, true);
      color(part, 'color', p, issues, { required: k === 'badge' });
      if (k === 'badge') color(part, 'fill', p, issues, { required: true });
      else {
        bool(part, 'bold', p, issues);
        bool(part, 'italic', p, issues);
        choice(part, 'align', p, issues, ['left', 'center', 'right']);
        choice(part, 'valign', p, issues, ['top', 'middle', 'bottom']);
      }
    }
    out.push(copy as unknown as DeclPart);
  });
  if (mains > 1) issues.add(path, 'extensions.schema.slotMainRepeated');
  return issues.count === before ? out : null;
}

/**
 * Elemento `composite` vindo de um board (abrir, importar, colar, restaurar versão, exportar).
 * Inválido → a UI ignora o elemento (não desenha nem exporta), sem quebrar o board.
 */
export function validateCompositeElement(el: unknown): boolean {
  if (!isObj(el) || el.type !== 'composite') return false;
  const issues = new Issues();
  for (const f of ['x', 'y']) num(el, f, '', issues, -1e7, 1e7, true);
  for (const f of ['width', 'height']) num(el, f, '', issues, 0.5, 1e6, true);
  const ref = objAt(el, 'typeRef', '', issues, true);
  if (ref) {
    str(ref, 'extensionId', 'typeRef', issues, { required: true, max: 128 });
    str(ref, 'typeId', 'typeRef', issues, { required: true, max: LIMITS.id });
  }
  str(el, 'typeName', '', issues, { max: 200 });
  str(el, 'text', '', issues, { max: 10_000 });
  const fields = el.fields;
  if (fields !== undefined) {
    if (!isObj(fields) || Object.keys(fields).length > LIMITS.fields) issues.add('fields', 'extensions.schema.tooMany', { max: LIMITS.fields });
    else for (const [k, v] of Object.entries(fields)) if (!SLOT.test(k) || typeof v !== 'string' || v.length > 2000) issues.add(`fields.${k}`, 'extensions.schema.format');
  }
  if (issues.count) return false;
  return validateParts(el.parts, 'parts', issues, { normalized: true }) !== null;
}

/* ================================== Contribuições ================================== */

function validateShape(raw: unknown, path: string, issues: Issues): ShapeContribution | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  checkKeys(raw, ['id', 'name', 'i18n', 'viewBox', 'path', 'decoration', 'textInsets', 'defaultSize'], path, issues);
  str(raw, 'id', path, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
  str(raw, 'name', path, issues, { required: true, max: LIMITS.name });
  localized(raw, 'i18n', path, issues);
  const vb = objAt(raw, 'viewBox', path, issues, true);
  let box: { width: number; height: number } | null = null;
  if (vb) {
    checkKeys(vb, ['width', 'height'], `${path}.viewBox`, issues);
    const w = num(vb, 'width', `${path}.viewBox`, issues, 1, 10_000, true);
    const h = num(vb, 'height', `${path}.viewBox`, issues, 1, 10_000, true);
    if (w && h) box = { width: w, height: h };
  }
  const copy: Obj = { ...raw };
  if (box) {
    const d = normalizePath(raw.path, box, `${path}.path`, issues);
    if (d) copy.path = d;
    if (raw.decoration !== undefined) {
      const dec = normalizePath(raw.decoration, box, `${path}.decoration`, issues);
      if (dec) copy.decoration = dec;
    }
  }
  const ins = objAt(raw, 'textInsets', path, issues);
  if (ins) {
    checkKeys(ins, ['top', 'right', 'bottom', 'left'], `${path}.textInsets`, issues);
    for (const side of ['top', 'right', 'bottom', 'left']) num(ins, side, `${path}.textInsets`, issues, 0, 0.45, true);
  }
  const size = objAt(raw, 'defaultSize', path, issues);
  if (size) {
    checkKeys(size, ['width', 'height'], `${path}.defaultSize`, issues);
    num(size, 'width', `${path}.defaultSize`, issues, 16, 2000, true);
    num(size, 'height', `${path}.defaultSize`, issues, 16, 2000, true);
  }
  return issues.count === before ? (copy as unknown as ShapeContribution) : null;
}

function validateThemeMode(raw: unknown, path: string, issues: Issues): Record<string, string> | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  const allowed = [...THEME_COLOR_TOKENS, ...THEME_SHADOW_TOKENS, ...THEME_RADIUS_TOKENS] as readonly string[];
  const out: Record<string, string> = {};
  for (const [token, value] of Object.entries(raw)) {
    const p = `${path}.${token}`;
    if (!allowed.includes(token)) {
      issues.add(p, 'extensions.schema.themeToken', { token });
      continue;
    }
    if (typeof value !== 'string') {
      issues.add(p, 'extensions.schema.expectedString');
      continue;
    }
    if (hasCssInjection(value)) {
      issues.add(p, 'extensions.schema.cssInjection');
      continue;
    }
    if ((THEME_SHADOW_TOKENS as readonly string[]).includes(token)) {
      if (!isValidShadow(value)) issues.add(p, 'extensions.schema.shadow');
    } else if ((THEME_RADIUS_TOKENS as readonly string[]).includes(token)) {
      if (!isValidRadius(value)) issues.add(p, 'extensions.schema.radius');
    } else {
      const c = parseColor(value);
      if (!c) issues.add(p, 'extensions.schema.color');
      else if (THEME_OPAQUE_TOKENS.includes(token) && c.a < 1) issues.add(p, 'extensions.schema.themeOpaque', { token });
      else if ((token === 'warning-soft' || token === 'danger-soft') && c.a < THEME_SOFT_MIN_ALPHA) issues.add(p, 'extensions.schema.themeSoftAlpha', { token });
    }
    out[token] = value.trim();
  }
  for (const token of THEME_REQUIRED_TOKENS) if (!(token in raw)) issues.add(path, 'extensions.schema.themeRequired', { token });
  if (issues.count !== before) return null;
  for (const r of themeContrast(out)) {
    if (!r.ok) issues.add(path, 'extensions.schema.contrast', { fg: r.fg, bg: r.bg, ratio: r.ratio, min: r.min });
  }
  return issues.count === before ? out : null;
}

function validateTheme(raw: unknown, path: string, issues: Issues): ThemeContribution | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  checkKeys(raw, ['id', 'name', 'i18n', 'light', 'dark'], path, issues);
  str(raw, 'id', path, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
  str(raw, 'name', path, issues, { required: true, max: LIMITS.name });
  localized(raw, 'i18n', path, issues);
  const light = raw.light === undefined ? (issues.add(`${path}.light`, 'extensions.schema.required'), null) : validateThemeMode(raw.light, `${path}.light`, issues);
  const dark = raw.dark === undefined ? (issues.add(`${path}.dark`, 'extensions.schema.required'), null) : validateThemeMode(raw.dark, `${path}.dark`, issues);
  if (issues.count !== before || !light || !dark) return null;
  return { ...(raw as unknown as ThemeContribution), light, dark };
}

const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|⃣)+$/u;
const STICKER_FILE = /\.(svg|png|webp)$/i;

function validateStickers(raw: unknown, path: string, issues: Issues, files: Record<string, string>): StickerPackContribution | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  checkKeys(raw, ['id', 'name', 'i18n', 'items'], path, issues);
  str(raw, 'id', path, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
  str(raw, 'name', path, issues, { required: true, max: LIMITS.name });
  localized(raw, 'i18n', path, issues);
  const items = arr(raw, 'items', path, issues, LIMITS.stickers, true);
  if (items) {
    if (!items.length) issues.add(`${path}.items`, 'extensions.schema.required');
    uniqueIds(items, `${path}.items`, issues);
    items.forEach((it, i) => {
      const p = `${path}.items[${i}]`;
      if (!isObj(it)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(it, ['id', 'name', 'i18n', 'emoji', 'file'], p, issues);
      str(it, 'id', p, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
      str(it, 'name', p, issues, { max: LIMITS.name });
      localized(it, 'i18n', p, issues);
      const hasEmoji = it.emoji !== undefined;
      const hasFile = it.file !== undefined;
      if (hasEmoji === hasFile) return issues.add(p, 'extensions.schema.stickerNeedsOne');
      if (hasEmoji) {
        const e = str(it, 'emoji', p, issues, { max: 16 });
        if (e !== undefined && !EMOJI.test(e)) issues.add(`${p}.emoji`, 'extensions.schema.emoji');
      } else {
        const f = str(it, 'file', p, issues, { max: 160 });
        if (f !== undefined) {
          if (!STICKER_FILE.test(f) || !f.startsWith('assets/')) issues.add(`${p}.file`, 'extensions.schema.assetType');
          else if (!(f in files)) issues.add(`${p}.file`, 'extensions.schema.assetMissing', { file: f });
        }
      }
    });
  }
  return issues.count === before ? (raw as unknown as StickerPackContribution) : null;
}

function validatePalette(raw: unknown, path: string, issues: Issues): PaletteContribution | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  checkKeys(raw, ['id', 'name', 'i18n', 'target', 'colors'], path, issues);
  str(raw, 'id', path, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
  str(raw, 'name', path, issues, { required: true, max: LIMITS.name });
  localized(raw, 'i18n', path, issues);
  choice(raw, 'target', path, issues, ['sticky', 'fill', 'ink'], true);
  const colors = arr(raw, 'colors', path, issues, LIMITS.paletteColors, true);
  if (colors) {
    if (!colors.length) issues.add(`${path}.colors`, 'extensions.schema.required');
    colors.forEach((c, i) => {
      const p = `${path}.colors[${i}]`;
      if (!isObj(c)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(c, ['hex', 'name', 'i18n'], p, issues);
      color(c, 'hex', p, issues, { hexOnly: true, required: true });
      str(c, 'name', p, issues, { max: LIMITS.name });
      localized(c, 'i18n', p, issues);
    });
  }
  return issues.count === before ? (raw as unknown as PaletteContribution) : null;
}

function validateElementType(raw: unknown, path: string, issues: Issues): DeclarativeElementType | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  checkKeys(raw, ['id', 'name', 'i18n', 'strings', 'defaultSize', 'parts'], path, issues);
  str(raw, 'id', path, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
  str(raw, 'name', path, issues, { required: true, max: LIMITS.name });
  localized(raw, 'i18n', path, issues);
  const known = stringTable(raw, path, issues);
  const size = objAt(raw, 'defaultSize', path, issues, true);
  if (size) {
    checkKeys(size, ['width', 'height'], `${path}.defaultSize`, issues);
    num(size, 'width', `${path}.defaultSize`, issues, 40, 2000, true);
    num(size, 'height', `${path}.defaultSize`, issues, 40, 2000, true);
  }
  const parts = validateParts(raw.parts, `${path}.parts`, issues, { normalized: false, knownStrings: known });
  if (issues.count !== before || !parts) return null;
  return { ...(raw as unknown as DeclarativeElementType), parts };
}

const TEMPLATE_TYPES = ['sticky', 'shape', 'text', 'frame', 'connector', 'composite'] as const;
const TEMPLATE_BASE_KEYS = ['type', 'ref', 'x', 'y', 'width', 'height', 'rotation', 'lock', 'background', 'group'];
/** Máximo de pontos intermediários por conector (`points`) */
const CONNECTOR_POINTS_MAX = 50;
const TEMPLATE_KEYS: Record<(typeof TEMPLATE_TYPES)[number], string[]> = {
  sticky: ['text', 'color', 'fontSize'],
  shape: ['shape', 'shapeRef', 'text', 'fillColor', 'strokeColor', 'strokeWidth', 'textColor', 'fontSize'],
  text: ['text', 'fontSize', 'color', 'fill', 'align', 'bold'],
  frame: ['title', 'fillColor'],
  connector: ['from', 'to', 'route', 'label', 'arrow', 'points'],
  composite: ['typeId', 'text', 'fields'],
};

function validateTemplate(raw: unknown, path: string, issues: Issues, ctx: { shapes: Set<string>; types: Set<string> }): TemplateContribution | null {
  if (!isObj(raw)) return (issues.add(path, 'extensions.schema.expectedObject'), null);
  const before = issues.count;
  checkKeys(raw, ['id', 'name', 'description', 'category', 'i18n', 'strings', 'elements'], path, issues);
  str(raw, 'id', path, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
  str(raw, 'name', path, issues, { required: true, max: LIMITS.name });
  str(raw, 'description', path, issues, { max: LIMITS.description });
  choice(raw, 'category', path, issues, ['brainstorm', 'planning', 'diagram', 'strategy'], true);
  localized(raw, 'i18n', path, issues);
  const known = stringTable(raw, path, issues);
  const elements = arr(raw, 'elements', path, issues, LIMITS.templateElements, true);
  if (elements) {
    if (!elements.length) issues.add(`${path}.elements`, 'extensions.schema.required');
    const refs = new Set<string>();
    elements.forEach((el, i) => {
      if (isObj(el) && typeof el.ref === 'string') {
        if (refs.has(el.ref)) issues.add(`${path}.elements[${i}].ref`, 'extensions.schema.duplicateId', { id: el.ref });
        refs.add(el.ref);
      }
    });
    elements.forEach((el, i) => validateTemplateElement(el, `${path}.elements[${i}]`, issues, { ...ctx, refs, known }));
  }
  return issues.count === before ? (raw as unknown as TemplateContribution) : null;
}

function validateTemplateElement(raw: unknown, p: string, issues: Issues, ctx: { shapes: Set<string>; types: Set<string>; refs: Set<string>; known: Set<string> | null; allowElementIds?: boolean }): void {
  if (!isObj(raw)) return issues.add(p, 'extensions.schema.expectedObject');
  const type = raw.type;
  if (typeof type !== 'string' || !(TEMPLATE_TYPES as readonly string[]).includes(type)) return issues.add(`${p}.type`, 'extensions.schema.elementType', { type: String(type) });
  const t = type as TemplateElementInput['type'];
  checkKeys(raw, [...TEMPLATE_BASE_KEYS, ...TEMPLATE_KEYS[t]], p, issues);
  str(raw, 'ref', p, issues, { max: LIMITS.id, pattern: LOCAL_ID });
  num(raw, 'x', p, issues, -LIMITS.coord, LIMITS.coord, true);
  num(raw, 'y', p, issues, -LIMITS.coord, LIMITS.coord, true);
  num(raw, 'width', p, issues, t === 'connector' ? 0 : 1, LIMITS.size, true);
  num(raw, 'height', p, issues, t === 'connector' ? 0 : 1, LIMITS.size, true);
  num(raw, 'rotation', p, issues, -360, 360);
  choice(raw, 'lock', p, issues, ['none', 'standard', 'protected']);
  bool(raw, 'background', p, issues);
  str(raw, 'group', p, issues, { max: LIMITS.id, pattern: LOCAL_ID });
  switch (t) {
    case 'sticky':
      textOrRef(raw, 'text', p, issues, ctx.known);
      color(raw, 'color', p, issues, { hexOnly: true });
      num(raw, 'fontSize', p, issues, 6, 200);
      break;
    case 'shape': {
      const shape = str(raw, 'shape', p, issues, { max: 40 });
      const shapeRef = str(raw, 'shapeRef', p, issues, { max: LIMITS.id });
      if (shape !== undefined && !CORE_SHAPES.includes(shape)) issues.add(`${p}.shape`, 'extensions.schema.unknownShape', { shape });
      if (shapeRef !== undefined && !ctx.shapes.has(shapeRef)) issues.add(`${p}.shapeRef`, 'extensions.schema.unknownShape', { shape: shapeRef });
      if (shape !== undefined && shapeRef !== undefined) issues.add(p, 'extensions.schema.shapeOrRef');
      textOrRef(raw, 'text', p, issues, ctx.known);
      color(raw, 'fillColor', p, issues, { allowNone: true });
      color(raw, 'strokeColor', p, issues, { allowNone: true });
      color(raw, 'textColor', p, issues);
      num(raw, 'strokeWidth', p, issues, 0, 24);
      num(raw, 'fontSize', p, issues, 6, 200);
      break;
    }
    case 'text':
      textOrRef(raw, 'text', p, issues, ctx.known, true);
      num(raw, 'fontSize', p, issues, 6, 400);
      color(raw, 'color', p, issues);
      color(raw, 'fill', p, issues);
      choice(raw, 'align', p, issues, ['left', 'center', 'right']);
      bool(raw, 'bold', p, issues);
      break;
    case 'frame':
      textOrRef(raw, 'title', p, issues, ctx.known);
      color(raw, 'fillColor', p, issues, { allowNone: true });
      break;
    case 'connector':
      for (const end of ['from', 'to']) {
        const e = objAt(raw, end, p, issues, true);
        if (!e) continue;
        const ep = `${p}.${end}`;
        if (ctx.allowElementIds && e.elementId !== undefined) {
          checkKeys(e, ['elementId', 'anchor'], ep, issues);
          str(e, 'elementId', ep, issues, { required: true, max: 64, pattern: /^[A-Za-z0-9_-]{1,64}$/ });
          choice(e, 'anchor', ep, issues, ['top', 'right', 'bottom', 'left', 'center']);
        } else if (e.ref !== undefined) {
          checkKeys(e, ['ref', 'anchor'], ep, issues);
          const ref = str(e, 'ref', ep, issues, { max: LIMITS.id });
          if (ref !== undefined && !ctx.refs.has(ref)) issues.add(`${ep}.ref`, 'extensions.schema.unknownRef', { ref });
          choice(e, 'anchor', ep, issues, ['top', 'right', 'bottom', 'left', 'center']);
        } else {
          checkKeys(e, ['x', 'y'], ep, issues);
          num(e, 'x', ep, issues, -LIMITS.coord, LIMITS.coord, true);
          num(e, 'y', ep, issues, -LIMITS.coord, LIMITS.coord, true);
        }
      }
      choice(raw, 'route', p, issues, ['straight', 'orthogonal', 'curved']);
      textOrRef(raw, 'label', p, issues, ctx.known);
      bool(raw, 'arrow', p, issues);
      arr(raw, 'points', p, issues, CONNECTOR_POINTS_MAX)?.forEach((pt, i) => {
        const pp = `${p}.points[${i}]`;
        if (!isObj(pt)) return issues.add(pp, 'extensions.schema.expectedObject');
        checkKeys(pt, ['x', 'y'], pp, issues);
        num(pt, 'x', pp, issues, -LIMITS.coord, LIMITS.coord, true);
        num(pt, 'y', pp, issues, -LIMITS.coord, LIMITS.coord, true);
      });
      break;
    case 'composite': {
      const typeId = str(raw, 'typeId', p, issues, { required: true, max: LIMITS.id });
      if (typeId !== undefined && !ctx.types.has(typeId)) issues.add(`${p}.typeId`, 'extensions.schema.unknownTypeId', { id: typeId });
      textOrRef(raw, 'text', p, issues, ctx.known);
      const fields = objAt(raw, 'fields', p, issues);
      if (fields) {
        if (Object.keys(fields).length > LIMITS.fields) issues.add(`${p}.fields`, 'extensions.schema.tooMany', { max: LIMITS.fields });
        for (const k of Object.keys(fields)) {
          if (!SLOT.test(k)) issues.add(`${p}.fields.${k}`, 'extensions.schema.slot');
          textOrRef(fields, k, `${p}.fields`, issues, ctx.known);
        }
      }
      break;
    }
  }
}

/* ===================================== Manifest ===================================== */

/** Permissões do Nível 2 (EXTENSIONS_SPEC §3.1). */
export const PERMISSIONS = ['board.read', 'board.write', 'ui.command', 'ui.panel', 'clipboard.paste', 'files.import', 'files.export', 'storage', 'network'] as const;

/** `ui.panel` + `board.read` = risco elevado: a tela de aprovação pede confirmação extra (§5.11). */
export function isElevatedRisk(permissions: readonly string[]): boolean {
  return permissions.includes('ui.panel') && permissions.includes('board.read');
}

/** Extensões de arquivo do núcleo: uma extensão nunca toma um formato que o núcleo já importa. */
export const CORE_IMPORT_EXTENSIONS = ['svg', 'csv', 'tsv', 'xlsx', 'ods', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'html', 'htm', 'txt', 'md', 'excalidraw', 'ludraw', 'json'];

const UI_FILE = /^ui\/[a-z0-9][a-z0-9-]{0,40}\.html$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const FILE_EXT = /^[a-z0-9]{1,10}$/;
const SCRIPT_FILES = (files: Record<string, string>) => Object.keys(files).filter((f) => f === 'main.js' || UI_FILE.test(f));

function validateCodeContributions(c: Obj, issues: Issues, granted: Set<string>, hasUi: boolean): void {
  const need = (point: string, perm: string) => {
    if (c[point] !== undefined && !granted.has(perm)) issues.add(`contributes.${point}`, 'extensions.schema.contributionNeedsPermission', { point, permission: perm });
  };
  need('commands', 'ui.command');
  need('panels', 'ui.panel');
  need('importers', 'files.import');
  need('exporters', 'files.export');
  const commands = arr(c, 'commands', 'contributes', issues, 30);
  if (commands) {
    uniqueIds(commands, 'contributes.commands', issues);
    commands.forEach((cmd, i) => {
      const p = `contributes.commands[${i}]`;
      if (!isObj(cmd)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(cmd, ['id', 'title', 'i18n', 'keywords'], p, issues);
      str(cmd, 'id', p, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
      str(cmd, 'title', p, issues, { required: true, max: LIMITS.name });
      localized(cmd, 'i18n', p, issues);
      arr(cmd, 'keywords', p, issues, 8)?.forEach((k, j) => {
        if (typeof k !== 'string' || k.length > 40) issues.add(`${p}.keywords[${j}]`, 'extensions.schema.expectedString');
      });
    });
  }
  const panels = arr(c, 'panels', 'contributes', issues, 5);
  if (panels) {
    if (!hasUi) issues.add('contributes.panels', 'extensions.schema.panelWithoutUi');
    uniqueIds(panels, 'contributes.panels', issues);
    panels.forEach((pn, i) => {
      const p = `contributes.panels[${i}]`;
      if (!isObj(pn)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(pn, ['id', 'title', 'i18n'], p, issues);
      str(pn, 'id', p, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
      str(pn, 'title', p, issues, { required: true, max: LIMITS.name });
      localized(pn, 'i18n', p, issues);
    });
  }
  const importers = arr(c, 'importers', 'contributes', issues, 5);
  if (importers) {
    uniqueIds(importers, 'contributes.importers', issues);
    importers.forEach((im, i) => {
      const p = `contributes.importers[${i}]`;
      if (!isObj(im)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(im, ['id', 'label', 'description', 'i18n', 'extensions'], p, issues);
      str(im, 'id', p, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
      str(im, 'label', p, issues, { required: true, max: LIMITS.name });
      str(im, 'description', p, issues, { max: LIMITS.description });
      localized(im, 'i18n', p, issues);
      const exts = arr(im, 'extensions', p, issues, 5, true);
      if (exts && !exts.length) issues.add(`${p}.extensions`, 'extensions.schema.required');
      exts?.forEach((x, j) => {
        if (typeof x !== 'string' || !FILE_EXT.test(x)) issues.add(`${p}.extensions[${j}]`, 'extensions.schema.fileExtension');
        else if (CORE_IMPORT_EXTENSIONS.includes(x)) issues.add(`${p}.extensions[${j}]`, 'extensions.schema.coreExtension', { ext: x });
      });
    });
  }
  const exporters = arr(c, 'exporters', 'contributes', issues, 5);
  if (exporters) {
    uniqueIds(exporters, 'contributes.exporters', issues);
    exporters.forEach((ex, i) => {
      const p = `contributes.exporters[${i}]`;
      if (!isObj(ex)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(ex, ['id', 'label', 'description', 'i18n', 'extension'], p, issues);
      str(ex, 'id', p, issues, { required: true, max: LIMITS.id, pattern: LOCAL_ID });
      str(ex, 'label', p, issues, { required: true, max: LIMITS.name });
      str(ex, 'description', p, issues, { max: LIMITS.description });
      localized(ex, 'i18n', p, issues);
      str(ex, 'extension', p, issues, { required: true, max: 10, pattern: FILE_EXT, patternKey: 'extensions.schema.fileExtension' });
    });
  }
}

/**
 * Conferência estática do código de um script (defesa em profundidade — a garantia real é o Worker
 * selado): tamanho, UTF-8 já conferido pelo loader, e nada de `import(` (carregaria código de fora).
 */
export function scanScriptSource(path: string, text: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (text.length > 1024 * 1024) out.push({ path, message: { key: 'extensions.schema.tooLong', params: { max: 1024 * 1024 } } });
  // Chat 08.7 · R4 (S-36): varredura linear (a regex com comentários repetidos era exponencial)
  if (hasDynamicImport(text)) out.push({ path, message: { key: 'extensions.schema.dynamicImport' } });
  return out;
}

/**
 * Elementos que uma extensão quer criar (API `ludraw.board.addElements`, importadores): mesma
 * allowlist dos modelos (`sticky`, `shape` do núcleo, `text`, `frame`, `connector`), textos livres e
 * conectores que podem apontar para um `ref` do lote ou para um elemento existente (`elementId`).
 */
export function validateElementInputs(raw: unknown, max = 2000): { ok: true; inputs: TemplateElementInput[] } | { ok: false; issues: ValidationIssue[] } {
  const issues = new Issues();
  if (!Array.isArray(raw)) return { ok: false, issues: [{ path: 'elements', message: { key: 'extensions.schema.expectedArray' } }] };
  if (raw.length > max) return { ok: false, issues: [{ path: 'elements', message: { key: 'extensions.schema.tooMany', params: { max } } }] };
  const refs = new Set<string>();
  raw.forEach((el, i) => {
    if (isObj(el) && typeof el.ref === 'string') {
      if (refs.has(el.ref)) issues.add(`elements[${i}].ref`, 'extensions.schema.duplicateId', { id: el.ref });
      refs.add(el.ref);
    }
  });
  raw.forEach((el, i) => {
    if (isObj(el) && el.type === 'composite') return issues.add(`elements[${i}].type`, 'extensions.schema.elementType', { type: 'composite' });
    validateTemplateElement(el, `elements[${i}]`, issues, { shapes: new Set(), types: new Set(), refs, known: null, allowElementIds: true });
  });
  return issues.count ? { ok: false, issues: issues.list } : { ok: true, inputs: raw as TemplateElementInput[] };
}

const MANIFEST_KEYS = ['$schema', 'apiVersion', 'id', 'name', 'version', 'publisher', 'description', 'i18n', 'license', 'kind', 'permissions', 'networkAllowlist', 'provenance', 'main', 'ui', 'contributes', 'integrity', 'homepage'];
const CONTRIB_KEYS = ['shapes', 'templates', 'themes', 'stickers', 'palettes', 'elementTypes', 'commands', 'panels', 'importers', 'exporters', 'locales'];
const LEVEL2_POINTS = ['commands', 'panels', 'importers', 'exporters'];
const EXTENSION_ID = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*){2,6}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/;

/** Licença SPDX simples permitida? (expressões compostas não são aceitas na v1) */
export function licenseDecision(spdx: string): 'allowed' | 'approval' | 'forbidden' {
  const id = spdx.trim();
  if ((ALLOWED_LICENSES as readonly string[]).includes(id)) return 'allowed';
  if (APPROVAL_LICENSES.test(id)) return 'approval';
  return 'forbidden';
}

/** Id de extensão bem formado (reverse-dns minúsculo) — usado também na lista de permitidas. */
export function isValidExtensionId(id: string): boolean {
  return id.length <= 128 && EXTENSION_ID.test(id);
}

export function isReservedExtensionId(id: string): boolean {
  return id.startsWith(BUILTIN_ID_PREFIX);
}

/** Lê o texto do `manifest.json` (JSON estrito, ≤ 1 MB). */
export function parseManifestText(text: string): { ok: true; value: unknown } | { ok: false; issues: ValidationIssue[] } {
  if (text.length > 1024 * 1024) return { ok: false, issues: [{ path: 'manifest.json', message: { key: 'extensions.schema.tooLong', params: { max: 1024 * 1024 } } }] };
  try {
    return { ok: true, value: JSON.parse(text.replace(/^﻿/, '')) };
  } catch {
    return { ok: false, issues: [{ path: 'manifest.json', message: { key: 'extensions.schema.manifestJson' } }] };
  }
}

/**
 * Valida o manifest inteiro contra o pacote. Devolve o manifest NORMALIZADO ou a lista de problemas
 * (com o caminho de cada campo). Rodada A: só `kind: "pack"` e contribuições do Nível 1.
 */
export function validateManifest(raw: unknown, ctx: ManifestContext): ManifestResult {
  const issues = new Issues();
  if (!isObj(raw)) return { ok: false, issues: [{ path: 'manifest.json', message: { key: 'extensions.schema.notObject' } }] };
  checkKeys(raw, MANIFEST_KEYS, '', issues);

  if (raw.apiVersion !== 1) issues.add('apiVersion', 'extensions.schema.apiVersion');
  const id = str(raw, 'id', '', issues, { required: true, max: 128, pattern: EXTENSION_ID, patternKey: 'extensions.schema.idFormat' });
  if (id && isReservedExtensionId(id) && ctx.source !== 'builtin') issues.add('id', 'extensions.schema.idReserved');
  str(raw, 'name', '', issues, { required: true, max: LIMITS.name });
  str(raw, 'version', '', issues, { required: true, max: 64, pattern: SEMVER, patternKey: 'extensions.schema.versionFormat' });
  str(raw, 'publisher', '', issues, { required: true, max: LIMITS.name });
  str(raw, 'description', '', issues, { max: LIMITS.description });
  str(raw, 'homepage', '', issues, { max: 200, pattern: /^https:\/\/github\.com\/[A-Za-z0-9_.\/-]+$/ });
  localized(raw, 'i18n', '', issues);

  const license = str(raw, 'license', '', issues, { required: true, max: 64 });
  if (license) {
    const d = licenseDecision(license);
    if (d === 'approval') issues.add('license', 'extensions.schema.licenseNeedsApproval', { license });
    else if (d === 'forbidden') issues.add('license', 'extensions.schema.licenseNotAllowed', { license });
  }
  if (!LICENSE_FILES.some((f) => f in ctx.fileHashes)) issues.add('LICENSE', 'extensions.schema.licenseFileMissing');

  const prov = objAt(raw, 'provenance', '', issues, true);
  if (prov) {
    checkKeys(prov, ['originalWork', 'thirdParty', 'proprietaryFormatsRead'], 'provenance', issues);
    bool(prov, 'originalWork', 'provenance', issues, true);
    const third = arr(prov, 'thirdParty', 'provenance', issues, 50, true);
    third?.forEach((tp, i) => {
      const p = `provenance.thirdParty[${i}]`;
      if (!isObj(tp)) return issues.add(p, 'extensions.schema.expectedObject');
      checkKeys(tp, ['name', 'license', 'url'], p, issues);
      str(tp, 'name', p, issues, { required: true, max: LIMITS.name });
      const lic = str(tp, 'license', p, issues, { required: true, max: 64 });
      if (lic && licenseDecision(lic) !== 'allowed') issues.add(`${p}.license`, 'extensions.schema.licenseNotAllowed', { license: lic });
      str(tp, 'url', p, issues, { max: 200, pattern: /^https:\/\/github\.com\/[A-Za-z0-9_.\/-]+$/ });
    });
    if (Array.isArray(prov.proprietaryFormatsRead) && prov.proprietaryFormatsRead.length) issues.add('provenance.proprietaryFormatsRead', 'extensions.schema.proprietaryFormats');
  }

  const kind = choice(raw, 'kind', '', issues, ['pack', 'script'], true);
  const perms = arr(raw, 'permissions', '', issues, 16, true);
  const granted = new Set<string>();
  if (kind === 'pack') {
    if (perms && perms.length) issues.add('permissions', 'extensions.schema.permissionsNotAllowed');
    for (const f of ['main', 'ui', 'networkAllowlist']) if (raw[f] !== undefined) issues.add(f, 'extensions.schema.fieldNotAllowedInPack', { field: f });
    for (const f of SCRIPT_FILES(ctx.fileHashes)) issues.add(f, 'extensions.schema.codeInPack', { file: f });
  } else if (kind === 'script') {
    // Chat 06.5 · B — Nível 2 (EXTENSIONS_SPEC §5): permissões conhecidas, sem repetição
    perms?.forEach((perm, i) => {
      if (typeof perm !== 'string' || !(PERMISSIONS as readonly string[]).includes(perm)) issues.add(`permissions[${i}]`, 'extensions.schema.unknownPermission', { permission: String(perm) });
      else if (granted.has(perm)) issues.add(`permissions[${i}]`, 'extensions.schema.duplicateId', { id: perm });
      else granted.add(perm);
    });
    const main = str(raw, 'main', '', issues, { required: true, max: 32 });
    if (main !== undefined && main !== 'main.js') issues.add('main', 'extensions.schema.mainPath');
    else if (main !== undefined && !('main.js' in ctx.fileHashes)) issues.add('main', 'extensions.schema.assetMissing', { file: 'main.js' });
    const ui = str(raw, 'ui', '', issues, { max: 64, pattern: UI_FILE });
    if (ui !== undefined && !(ui in ctx.fileHashes)) issues.add('ui', 'extensions.schema.assetMissing', { file: ui });
    for (const f of SCRIPT_FILES(ctx.fileHashes)) if (f !== 'main.js' && f !== ui) issues.add(f, 'extensions.schema.unusedScriptFile', { file: f });
    const hosts = arr(raw, 'networkAllowlist', '', issues, 10);
    if (hosts) {
      if (!granted.has('network')) issues.add('networkAllowlist', 'extensions.schema.networkWithoutPermission');
      hosts.forEach((h, i) => {
        if (typeof h !== 'string' || !HOSTNAME.test(h) || /^[0-9.]+$/.test(h)) issues.add(`networkAllowlist[${i}]`, 'extensions.schema.hostname', { host: String(h) });
      });
    }
    if (granted.has('network') && !hosts?.length) issues.add('networkAllowlist', 'extensions.schema.networkAllowlistRequired');
  }

  const integrity = objAt(raw, 'integrity', '', issues);
  if (integrity) {
    checkKeys(integrity, ['files'], 'integrity', issues);
    const files = objAt(integrity, 'files', 'integrity', issues, true);
    if (files) {
      for (const [file, hash] of Object.entries(files)) {
        if (!(file in ctx.fileHashes)) issues.add(`integrity.files.${file}`, 'extensions.schema.integrityUnknownFile', { file });
        else if (typeof hash !== 'string' || hash.toLowerCase() !== ctx.fileHashes[file]) issues.add(`integrity.files.${file}`, 'extensions.schema.integrityMismatch', { file });
      }
    }
  }

  const contributes = objAt(raw, 'contributes', '', issues, kind !== 'script') ?? (kind === 'script' ? {} : undefined);
  const out: Obj = { ...raw };
  if (contributes) {
    checkKeys(contributes, CONTRIB_KEYS, 'contributes', issues);
    if (kind !== 'script') {
      for (const point of LEVEL2_POINTS) if (contributes[point] !== undefined) issues.add(`contributes.${point}`, 'extensions.schema.contributionNotSupported', { point });
    } else {
      validateCodeContributions(contributes, issues, granted, typeof raw.ui === 'string');
    }
    if (contributes.locales !== undefined) issues.add('contributes.locales', 'extensions.schema.localesNotSupported');

    const normalized: Obj = {};
    const shapes = arr(contributes, 'shapes', 'contributes', issues, LIMITS.shapes);
    if (shapes) {
      uniqueIds(shapes, 'contributes.shapes', issues);
      normalized.shapes = shapes.map((s, i) => validateShape(s, `contributes.shapes[${i}]`, issues));
    }
    const themes = arr(contributes, 'themes', 'contributes', issues, LIMITS.themes);
    if (themes) {
      uniqueIds(themes, 'contributes.themes', issues);
      normalized.themes = themes.map((s, i) => validateTheme(s, `contributes.themes[${i}]`, issues));
    }
    const stickers = arr(contributes, 'stickers', 'contributes', issues, LIMITS.stickerPacks);
    if (stickers) {
      uniqueIds(stickers, 'contributes.stickers', issues);
      normalized.stickers = stickers.map((s, i) => validateStickers(s, `contributes.stickers[${i}]`, issues, ctx.fileHashes));
    }
    const palettes = arr(contributes, 'palettes', 'contributes', issues, LIMITS.palettes);
    if (palettes) {
      uniqueIds(palettes, 'contributes.palettes', issues);
      normalized.palettes = palettes.map((s, i) => validatePalette(s, `contributes.palettes[${i}]`, issues));
    }
    const types = arr(contributes, 'elementTypes', 'contributes', issues, LIMITS.elementTypes);
    if (types) {
      uniqueIds(types, 'contributes.elementTypes', issues);
      normalized.elementTypes = types.map((s, i) => validateElementType(s, `contributes.elementTypes[${i}]`, issues));
    }
    const shapeIds = new Set((shapes ?? []).map((s) => (isObj(s) && typeof s.id === 'string' ? s.id : '')).filter(Boolean));
    const typeIds = new Set((types ?? []).map((s) => (isObj(s) && typeof s.id === 'string' ? s.id : '')).filter(Boolean));
    const templates = arr(contributes, 'templates', 'contributes', issues, LIMITS.templates);
    if (templates) {
      uniqueIds(templates, 'contributes.templates', issues);
      normalized.templates = templates.map((s, i) => validateTemplate(s, `contributes.templates[${i}]`, issues, { shapes: shapeIds, types: typeIds }));
    }
    const total = ['shapes', 'templates', 'themes', 'stickers', 'palettes', 'elementTypes'].reduce((n, k) => n + ((contributes[k] as unknown[] | undefined)?.length ?? 0), 0);
    if (total === 0 && kind !== 'script') issues.add('contributes', 'extensions.schema.noContributions');
    out.contributes = { ...contributes, ...normalized };
  }

  if (issues.count) return { ok: false, issues: issues.list };
  return { ok: true, manifest: out as unknown as ExtensionManifest };
}

/** Nome exibido no idioma ativo (`i18n[idioma]` → idioma base → nome padrão). */
export function localizedName(entry: { name: string; i18n?: Record<string, { name?: string }> }, locale: string): string {
  const base = locale.split('-')[0];
  return entry.i18n?.[locale]?.name ?? entry.i18n?.[base]?.name ?? entry.name;
}

export function localizedDescription(entry: { description?: string; i18n?: Record<string, { description?: string }> }, locale: string): string | undefined {
  const base = locale.split('-')[0];
  return entry.i18n?.[locale]?.description ?? entry.i18n?.[base]?.description ?? entry.description;
}

/** Resolve um texto `"{{chave}}"` pela tabela `strings` (idioma → base → pt-BR → primeiro idioma). */
export function resolveString(text: string | undefined, strings: Record<string, Record<string, string>> | undefined, locale: string): string {
  if (!text) return '';
  const m = STRING_REF.exec(text);
  if (!m || !strings) return text;
  const key = m[1];
  const base = locale.split('-')[0];
  const order = [locale, base, 'pt-BR', ...Object.keys(strings)];
  for (const lang of order) {
    const v = strings[lang]?.[key];
    if (typeof v === 'string') return v;
  }
  return '';
}
