/**
 * LuDraw — Interceptador de colagem GENÉRICO (Chat 05).
 *
 * A área de transferência só é lida pelo evento `paste` do próprio usuário (ou por "Colar" no
 * menu, que usa a API padrão `navigator.clipboard.read()` com a permissão do navegador). Só os
 * tipos PADRÃO são lidos: `text/plain`, `text/html` (genérico), `image/svg+xml` e arquivos
 * (imagens, planilhas, SVG, `.excalidraw`). Qualquer outro tipo MIME aparece no Inspetor apenas
 * pelo NOME — o conteúdo nunca é lido nem decodificado (`CLEAN_ROOM.md` R7, `CLAUDE.md` regra 12).
 *
 * Este módulo não toca o store: monta a "fotografia" da colagem, escolhe o importador
 * (`ImporterRegistry`) e constrói elementos. A inserção (permissão, posição, desfazer, log) fica
 * em `utils/importActions.ts`.
 */

import type { CanvasElement } from '../types/canvas';
import { ImporterRegistry, type ImportPayload } from '../extensions/registries';
import { createImage, createStickyNote, createText } from './factory';
import { createId } from './id';
import { loadImage } from './images';
import { visibleText } from './sheets';
import { t } from '../i18n';
import { formatCount, formatList, formatNumber } from '../i18n/format';

/** Tipos cujo CONTEÚDO o núcleo lê. Todos os demais ficam só listados no Inspetor. */
export const READABLE_TYPES = ['text/plain', 'text/html', 'image/svg+xml'] as const;

/** Marcador do clipboard interno do LuDraw (cópia entre boards). Mesmo valor do store. */
const INTERNAL_MARKER = 'ludraw/elements@1';

export interface ClipboardSnapshot {
  /** Todos os tipos anunciados (`DataTransfer.types`) — só os nomes */
  types: string[];
  text: string;
  html: string;
  svg: string;
  files: File[];
  source: 'paste' | 'drop' | 'menu' | 'inspector';
}

export function emptySnapshot(source: ClipboardSnapshot['source']): ClipboardSnapshot {
  return { types: [], text: '', html: '', svg: '', files: [], source };
}

/** Fotografia de um `DataTransfer` (evento `paste`/`drop`) — lê apenas os tipos padrão. */
export function snapshotFromDataTransfer(dt: DataTransfer | null, source: ClipboardSnapshot['source']): ClipboardSnapshot {
  if (!dt) return emptySnapshot(source);
  const types = Array.from(dt.types ?? []);
  const files: File[] = [];
  const seen = new Set<File>();
  for (const f of Array.from(dt.files ?? [])) {
    files.push(f);
    seen.add(f);
  }
  if (!files.length) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f && !seen.has(f)) files.push(f);
    }
  }
  const get = (t: string) => (types.includes(t) ? dt.getData(t) : '');
  return { types, text: get('text/plain'), html: get('text/html'), svg: get('image/svg+xml'), files, source };
}

/** Fotografia a partir da API assíncrona (menu "Colar"). Só tipos padrão são pedidos ao navegador. */
export async function snapshotFromClipboardApi(): Promise<ClipboardSnapshot | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
  const snap = emptySnapshot('menu');
  try {
    if (navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const t of item.types) if (!snap.types.includes(t)) snap.types.push(t);
        if (item.types.includes('text/plain') && !snap.text) snap.text = await (await item.getType('text/plain')).text();
        if (item.types.includes('text/html') && !snap.html) snap.html = await (await item.getType('text/html')).text();
        if (item.types.includes('image/svg+xml') && !snap.svg) snap.svg = await (await item.getType('image/svg+xml')).text();
        const img = item.types.find((t) => /^image\/(png|jpeg|gif|webp)$/.test(t));
        if (img) {
          const blob = await item.getType(img);
          snap.files.push(new File([blob], `imagem.${img.split('/')[1]}`, { type: img }));
        }
      }
      return snap;
    }
    snap.text = await navigator.clipboard.readText();
    snap.types = snap.text ? ['text/plain'] : [];
    return snap;
  } catch {
    return null;
  }
}

export type MimeStatus = 'read' | 'file' | 'ignored';

/** Rótulo pt-BR e situação de um tipo MIME no Inspetor. */
export function describeMimeType(type: string): { label: string; status: MimeStatus } {
  const lower = type.toLowerCase();
  if (lower === 'text/plain') return { label: t('importexport.clipboard.plainText'), status: 'read' };
  if (lower === 'text/html') return { label: t('importexport.clipboard.htmlReadOnlyAsText'), status: 'read' };
  if (lower === 'image/svg+xml') return { label: t('importexport.clipboard.svgDrawing'), status: 'read' };
  if (lower === 'files') return { label: t('importexport.clipboard.files'), status: 'file' };
  if (lower.startsWith('image/')) return { label: t('importexport.clipboard.imageUppercase', { upperCase: lower.slice(6).toUpperCase() }), status: 'file' };
  if (lower === 'text/uri-list') return { label: t('importexport.clipboard.linkListNotRead'), status: 'ignored' };
  if (lower === 'text/rtf') return { label: t('importexport.clipboard.rtfFormattedTextNotRead'), status: 'ignored' };
  return { label: t('importexport.clipboard.nonStandardFormatContentNot'), status: 'ignored' };
}

export function isInternalPayload(text: string): boolean {
  return text.startsWith(INTERNAL_MARKER);
}

/* ------------------------------- Planejamento ------------------------------- */

export type PastePlan =
  | { kind: 'internal'; text: string }
  | { kind: 'payload'; importerId: string; importerLabel: string; payload: ImportPayload }
  | { kind: 'files'; files: File[] }
  | { kind: 'unsupported'; reason: string; text: string; images: File[] }
  /** Chat 05: texto longo que parece dado codificado de outro programa (detecção genérica) */
  | { kind: 'encoded'; reason: string; text: string; images: File[]; signal: EncodedSignal };

/* ------------------------- Proteção contra dado codificado ------------------------- */

/** Abaixo deste tamanho o texto colado nunca é tratado como "dado codificado". */
export const ENCODED_MIN_LENGTH = 2000;
/** Fração mínima de caracteres em sequências `%XX` para contar como codificação por porcentagem. */
export const ENCODED_PERCENT_RATIO = 0.3;
/** Aviso curto (título) quando a colagem parece dado codificado de outro programa. */
export function encodedWarning(): string {
  return t('importexport.encoded.warning');
}
/** Como trazer o conteúdo por um formato aberto. */
export function encodedHelp(): string {
  return t('importexport.encoded.help');
}

export interface EncodedSignal {
  length: number;
  /** Fração dos caracteres que estão em sequências `%XX` */
  percentRatio: number;
  /** Texto com cara de marcação XML (muitas tags, começa com `<`) */
  xmlLike: boolean;
  /** Bloco contínuo de base64 (sem espaços) */
  base64Like: boolean;
}

/**
 * Detecção GENÉRICA (Chat 05): só olha o tamanho e o padrão do texto — nada é decodificado e
 * nenhum formato de outro programa é lido ou reconhecido. Dispara quando o texto tem mais de
 * 2.000 caracteres E (mais de 30 % em sequências `%XX` OU parece XML OU parece base64).
 */
export function detectEncodedData(text: string): EncodedSignal | null {
  if (!text || text.length <= ENCODED_MIN_LENGTH) return null;
  const percentChars = (text.match(/%[0-9A-Fa-f]{2}/g)?.length ?? 0) * 3;
  const percentRatio = percentChars / text.length;
  const trimmed = text.trim();
  const tags = trimmed.match(/<[A-Za-z?!/][^<>]{0,400}>/g)?.length ?? 0;
  const xmlLike = trimmed.startsWith('<') && trimmed.endsWith('>') && tags >= 10;
  const compact = trimmed.replace(/\s+/g, '');
  const base64Like = compact.length >= ENCODED_MIN_LENGTH && compact.length >= trimmed.length * 0.97 && /^(data:[\w/+.-]+;base64,)?[A-Za-z0-9+/_-]+={0,2}$/.test(compact);
  if (percentRatio > ENCODED_PERCENT_RATIO || xmlLike || base64Like) return { length: text.length, percentRatio, xmlLike, base64Like };
  return null;
}

/** Descrição curta do sinal para o Inspetor ("4.812 caracteres · 62 % em sequências %XX"). */
export function describeEncodedSignal(sig: EncodedSignal): string {
  const parts = [t('importexport.clipboard.characters', { count: sig.length, amount: formatNumber(sig.length) })];
  if (sig.percentRatio > ENCODED_PERCENT_RATIO) parts.push(t('importexport.clipboard.roundXxSequences', { round: Math.round(sig.percentRatio * 100) }));
  if (sig.xmlLike) parts.push(t('importexport.clipboard.xmlLikeMarkup'));
  if (sig.base64Like) parts.push(t('importexport.clipboard.continuousBase64Block'));
  return parts.join(' · ');
}

/** Importadores com prioridade abaixo disto são os genéricos (HTML/texto): a proteção vem antes deles. */
const GENERIC_PRIORITY = 50;

const isImage = (f: File) => /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(f.type) || /\.(png|jpe?g|gif|webp)$/i.test(f.name);

/** Texto "colável como texto" (texto simples ou o texto visível do HTML). */
export function plainTextOf(snap: ClipboardSnapshot): string {
  if (snap.text.trim()) return snap.text;
  if (snap.html.trim()) {
    try {
      return visibleText(new DOMParser().parseFromString(snap.html, 'text/html').body);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Decide o que fazer com a colagem: (1) objetos do próprio LuDraw; (2) arquivos que não são
 * imagem (planilhas, SVG, `.excalidraw`…); (3) importadores registrados, por prioridade
 * (`.excalidraw` > SVG > tabela HTML > TSV > HTML genérico > texto); (4) imagens; senão,
 * "conteúdo não suportado" (o Inspetor oferece colar como texto ou imagem).
 */
export async function planPaste(snap: ClipboardSnapshot): Promise<PastePlan> {
  if (snap.text && isInternalPayload(snap.text)) return { kind: 'internal', text: snap.text };
  const images = snap.files.filter(isImage);
  const others = snap.files.filter((f) => !isImage(f));
  if (others.length) return { kind: 'files', files: others };
  const importers = ImporterRegistry.list()
    .filter((i) => i.readClipboard)
    .sort((a, b) => (b.clipboardPriority ?? 0) - (a.clipboardPriority ?? 0));
  const errors: string[] = [];
  // Chat 05: formatos abertos reconhecidos (SVG, .excalidraw, tabelas…) vêm antes; só os genéricos
  // (HTML/texto) ficam atrás da proteção contra dado codificado.
  const sample = snap.text || plainTextOf(snap);
  const encoded = detectEncodedData(sample);
  for (const imp of importers) {
    if (encoded && (imp.clipboardPriority ?? 0) < GENERIC_PRIORITY) {
      return { kind: 'encoded', reason: encodedWarning(), text: sample, images, signal: encoded };
    }
    try {
      const payload = await imp.readClipboard!(snap);
      if (payload) return { kind: 'payload', importerId: imp.id, importerLabel: imp.label, payload };
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  if (encoded) return { kind: 'encoded', reason: encodedWarning(), text: sample, images, signal: encoded };
  if (images.length) return { kind: 'payload', importerId: 'image', importerLabel: t('importexport.clipboard.image'), payload: { kind: 'images', files: images } };
  const reason = errors[0] ?? (snap.types.length ? t('importexport.clipboard.unsupportedContentNoOpenFormat') : t('importexport.clipboard.theClipboardEmpty'));
  return { kind: 'unsupported', reason, text: plainTextOf(snap), images };
}

/* -------------------------------- Construção -------------------------------- */

const BULLET = /^\s*(?:[-*•▪◦·‣–]|\d{1,3}[.)]|[a-z][.)])\s+/i;

/** Texto em forma de lista (itens com marcador ou várias linhas curtas)? */
export function listItemsOf(text: string): string[] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const marked = lines.filter((l) => BULLET.test(l)).length;
  if (marked >= Math.max(2, Math.ceil(lines.length * 0.6))) return lines.map((l) => l.replace(BULLET, '').trim()).filter(Boolean);
  return null;
}

/** Grade de post-its (mesmo grupo), ordem de leitura: esquerda→direita, cima→baixo. */
export function stickyGrid(texts: string[], unit: number, origin = { x: 0, y: 0 }, color?: string, perRow?: number): CanvasElement[] {
  const size = 200 * unit;
  const gap = 24 * unit;
  const cols = perRow ?? Math.min(6, Math.max(1, Math.ceil(Math.sqrt(texts.length * 1.6))));
  const groupId = texts.length > 1 ? createId() : null;
  return texts.map((text, i) =>
    createStickyNote({
      x: origin.x + (i % cols) * (size + gap),
      y: origin.y + Math.floor(i / cols) * (size + gap),
      width: size,
      height: size,
      text,
      groupId,
      ...(color ? { color } : {}),
    }),
  );
}

/** Texto colado → post-it (curto), post-its (lista) ou texto (longo). Mesmo critério do Chat 02. */
export function elementsFromPlainText(text: string, unit: number): { elements: CanvasElement[]; summary: string } | null {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return null;
  const items = listItemsOf(clean);
  if (items && items.length > 1) return { elements: stickyGrid(items, unit), summary: `${items.length} post-its (um por item da lista)` };
  if (clean.length <= 140 && clean.split('\n').length <= 4) {
    const size = 200 * unit;
    return { elements: [createStickyNote({ x: 0, y: 0, width: size, height: size, text: clean })], summary: '1 post-it' };
  }
  const fontSize = Math.round(24 * unit * 10) / 10;
  return { elements: [createText({ x: 0, y: 0, width: fontSize * 24, height: fontSize * 1.4 * Math.min(40, clean.split('\n').length + Math.ceil(clean.length / 60)), fontSize, text: clean })], summary: t('importexport.clipboard.n1Text') };
}

type Block = { kind: 'heading'; text: string; level: number } | { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] } | { kind: 'image'; src: string; alt: string };

const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'TD', 'TH']);

/** Blocos do HTML genérico, na ordem do documento (atributos `data-*` nunca são lidos). */
export function htmlBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: Block[] = [];
  let inline = '';
  const flush = () => {
    const t = inline.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (t) blocks.push({ kind: 'paragraph', text: t });
    inline = '';
  };
  const visit = (n: Node) => {
    if (n.nodeType === 3) {
      inline += (n.nodeValue ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'HEAD' || tag === 'NOSCRIPT' || tag === 'SVG') return;
    if (tag === 'BR') {
      inline += '\n';
      return;
    }
    if (/^H[1-6]$/.test(tag)) {
      flush();
      const t = visibleText(el);
      if (t) blocks.push({ kind: 'heading', text: t, level: Number(tag[1]) });
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      flush();
      const items = Array.from(el.children)
        .filter((c) => c.tagName === 'LI')
        .map((li) => visibleText(li))
        .filter(Boolean);
      if (items.length) blocks.push({ kind: 'list', items });
      return;
    }
    if (tag === 'IMG') {
      flush();
      blocks.push({ kind: 'image', src: el.getAttribute('src') ?? '', alt: el.getAttribute('alt') ?? '' });
      return;
    }
    if (tag === 'TABLE') {
      // tabelas têm importador próprio; aqui viram parágrafos de texto
      flush();
      const t = visibleText(el);
      if (t) blocks.push({ kind: 'paragraph', text: t });
      return;
    }
    const block = BLOCKS.has(tag) || tag === 'LI';
    if (block) flush();
    for (let c = el.firstChild; c; c = c.nextSibling) visit(c);
    if (block) flush();
  };
  for (let c = doc.body.firstChild; c; c = c.nextSibling) visit(c);
  flush();
  return blocks;
}

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

/**
 * HTML genérico → objetos nativos na ordem do documento: títulos e parágrafos viram textos,
 * cada lista vira uma grade de post-its agrupados, imagens embutidas (`data:`) viram imagens.
 * Devolve `null` quando o HTML é só texto corrido (aí vale a regra do texto simples).
 */
export async function elementsFromGenericHtml(html: string, unit: number): Promise<{ elements: CanvasElement[]; summary: string; warnings: string[] } | null> {
  const blocks = htmlBlocks(html);
  const structured = blocks.some((b) => b.kind !== 'paragraph');
  if (!blocks.length || !structured) return null;
  const out: CanvasElement[] = [];
  const warnings = new Set<string>();
  const width = 640 * unit;
  const gap = 28 * unit;
  let y = 0;
  let stickies = 0;
  let texts = 0;
  let images = 0;
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph') {
      const fontSize = Math.round((b.kind === 'heading' ? [0, 40, 32, 26, 22, 20, 18][b.level] : 18) * unit * 10) / 10;
      const lines = b.text.split('\n').length + Math.floor(b.text.length / 70);
      const h = fontSize * 1.4 * Math.max(1, lines);
      out.push(createText({ x: 0, y, width, height: h, fontSize, text: b.text, fontWeight: b.kind === 'heading' ? 'bold' : 'normal' }));
      y += h + gap;
      texts++;
    } else if (b.kind === 'list') {
      const grid = stickyGrid(b.items, unit * 0.8, { x: 0, y }, undefined, Math.min(6, b.items.length));
      out.push(...grid);
      const rows = Math.ceil(b.items.length / Math.min(6, b.items.length));
      y += rows * (200 + 24) * unit * 0.8 + gap;
      stickies += b.items.length;
    } else if (b.kind === 'image') {
      if (!DATA_IMAGE.test(b.src)) {
        if (b.src) warnings.add(t('importexport.clipboard.externalImagesSkipped'));
        continue;
      }
      try {
        const img = await loadImage(b.src);
        const scale = Math.min(1, (480 * unit) / Math.max(1, img.naturalWidth));
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        out.push(createImage({ x: 0, y, width: w, height: h, dataUrl: b.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, alt: b.alt }));
        y += h + gap;
        images++;
      } catch {
        warnings.add(t('importexport.clipboard.imageUnreadable'));
      }
    }
  }
  if (!out.length) return null;
  const parts = [stickies && formatCount('sticky', stickies), texts && formatCount('text', texts), images && formatCount('image', images)].filter((p): p is string => !!p);
  return { elements: out, summary: formatList(parts, 'unit'), warnings: Array.from(warnings) };
}
