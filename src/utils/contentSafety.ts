/**
 * LuDraw — conteúdo seguro dentro do board (Chat 08.7 · R4, achados S-30 e S-31). PURO: cliente e servidor.
 *
 *  - Links (`link` de texto/post-it/forma): só `http(s):`, `mailto:` e âncora `#…`. `javascript:`, `data:`, `vbscript:`,
 *    `file:`, endereço sem esquema (`//host`) e esquemas com espaço/controle no meio ficam de fora.
 *  - Imagens (`dataUrl`): só `asset:<sha256>` (arquivo do servidor) ou `data:image/*` embutida. URL externa faria cada
 *    pessoa que abre o board buscar a imagem no servidor de terceiros (IP, horário e `Referer` vazados).
 *  - Cores e fundos: nada de `url(…)`, `image-set(…)`, `expression(…)` ou `var(…)` (carregariam recursos de fora ou
 *    escapariam do valor).
 * O servidor recusa o valor inseguro NOVO ou ALTERADO (boards antigos continuam abrindo e sendo editados); a tela não
 * desenha o valor inseguro; os importadores o descartam (`stripUnsafeContent`).
 */
import type { MessageDescriptor } from '../i18n/types';
import type { BoardData, CanvasElement } from '../types/canvas';

const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

/** Endereço que pode virar `href` (ou `null`). */
export function safeLinkHref(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const t = link.trim();
  if (!t || CONTROL.test(t)) return null;
  if (t.startsWith('#')) return t;
  const m = SCHEME.exec(t);
  if (!m || !SAFE_SCHEMES.has(m[1].toLowerCase())) return null;
  if (m[1].toLowerCase() !== 'mailto' && !/^https?:\/\/[^/\s]/i.test(t)) return null;
  return t;
}

const ASSET_RE = /^asset:[a-f0-9]{64}$/;
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)(;[a-z0-9=.+-]+)*,/i;

/** Origem de imagem que não sai do LuDraw: arquivo do servidor (`asset:`) ou embutida (`data:image/*`). */
export function isSafeImageSrc(src: unknown): boolean {
  return typeof src === 'string' && (ASSET_RE.test(src) || DATA_IMAGE_RE.test(src));
}

/** URL de imagem externa (`http(s):`/`//`): a tela mostra um espaço reservado com "Carregar imagem externa". */
export function isExternalImageSrc(src: unknown): src is string {
  return typeof src === 'string' && /^(https?:)?\/\//i.test(src.trim());
}

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN_RE = /^(?:rgba?|hsla?)\(\s*[0-9.%\s,/+-]+\)$/i;
const NAME_RE = /^[a-z]{3,24}$/i;

/** Cor que pode ir para o CSS (`background`, `color`) ou `undefined` (o chamador usa a cor padrão). */
export function safeCssColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return HEX_RE.test(t) || FN_RE.test(t) || NAME_RE.test(t) ? t : undefined;
}

/** Funções de CSS que carregam recurso de fora ou escapam do valor (para recusar no servidor). */
const CSS_LOADER_RE = /\b(?:url|image-set|-webkit-image-set|image|cross-fade|element|expression|var)\s*\(|\\/i;
const STYLE_KEY_RE = /(?:color|background|fill|stroke|shadow)$/i;

export type UnsafeKind = 'unsafeLink' | 'imageExternalUrl' | 'unsafeStyle';

const MESSAGES: Record<UnsafeKind, MessageDescriptor> = {
  unsafeLink: { key: 'server.errors.unsafeLink' },
  imageExternalUrl: { key: 'server.errors.imageExternalUrl' },
  unsafeStyle: { key: 'server.errors.unsafeStyle' },
};

function kindOf(key: string, value: string): UnsafeKind | null {
  if (key === 'link') return value === '' || safeLinkHref(value) ? null : 'unsafeLink';
  if (key === 'dataUrl') return isSafeImageSrc(value) ? null : 'imageExternalUrl';
  if (STYLE_KEY_RE.test(key) && CSS_LOADER_RE.test(value)) return 'unsafeStyle';
  return null;
}

/**
 * Primeiro valor inseguro de `next` que é NOVO ou mudou em relação a `prev` (mesmo caminho). Valores antigos
 * iguais passam (board antigo continua editável). Percorre objetos e listas aninhados (cards, colunas, partes).
 */
export function unsafeContentIn(next: unknown, prev?: unknown, depth = 0): MessageDescriptor | null {
  if (depth > 10 || !next || typeof next !== 'object') return null;
  const isArr = Array.isArray(next);
  for (const [k, v] of Object.entries(next as Record<string, unknown>)) {
    const before = prev && typeof prev === 'object' ? (prev as Record<string, unknown>)[isArr ? Number(k) : k] : undefined;
    if (typeof v === 'string') {
      if (v === before) continue;
      const kind = isArr ? null : kindOf(k, v);
      if (kind) return MESSAGES[kind];
    } else if (v && typeof v === 'object') {
      const bad = unsafeContentIn(v, before, depth + 1);
      if (bad) return bad;
    }
  }
  return null;
}

/** Board inteiro sem versão anterior (criar board/modelo): qualquer valor inseguro conta. */
export function unsafeContentInBoard(data: Pick<BoardData, 'elements'>): MessageDescriptor | null {
  for (const el of Object.values(data.elements ?? {})) {
    const bad = unsafeContentIn(el);
    if (bad) return bad;
  }
  return null;
}

/** Tira um valor inseguro de um objeto (links saem; cores viram um neutro; o chamador remove imagens externas inteiras). */
function stripObject(v: unknown, depth: number, counts: { links: number; styles: number }): unknown {
  if (depth > 10 || !v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => stripObject(x, depth + 1, counts));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x === 'string') {
      const kind = k === 'dataUrl' ? null : kindOf(k, x);
      if (kind === 'unsafeLink') {
        counts.links++;
        continue;
      }
      if (kind === 'unsafeStyle') {
        // a chave fica (vários desenhos exigem a cor); o valor vira um neutro seguro
        counts.styles++;
        out[k] = /fill|background/i.test(k) ? 'transparent' : '#808080';
        continue;
      }
      out[k] = x;
    } else out[k] = stripObject(x, depth + 1, counts);
  }
  return out;
}

export interface StripResult<T> {
  data: T;
  /** imagens com endereço externo descartadas */
  images: number;
  links: number;
  styles: number;
}

/**
 * Importadores (arquivo `.ludraw`, backup, trazer boards deste navegador, colar): descarta imagens com endereço
 * externo (o objeto inteiro) e links inseguros; cores com `url(…)` viram um neutro. Devolve as contagens para o aviso.
 */
export function stripUnsafeContent<T extends Pick<BoardData, 'elements'> & { elementOrder?: string[] }>(data: T): StripResult<T> {
  const counts = { links: 0, styles: 0 };
  let images = 0;
  const elements: Record<string, CanvasElement> = {};
  for (const [id, el] of Object.entries(data.elements ?? {})) {
    const src = (el as { dataUrl?: unknown }).dataUrl;
    if (el.type === 'image' && typeof src === 'string' && !isSafeImageSrc(src)) {
      images++;
      continue;
    }
    elements[id] = stripObject(el, 0, counts) as CanvasElement;
  }
  const out = { ...data, elements } as T;
  if (Array.isArray(data.elementOrder)) out.elementOrder = data.elementOrder.filter((id) => id in elements);
  return { data: out, images, links: counts.links, styles: counts.styles };
}

/**
 * Elemento pronto para DESENHAR (Chat 08.7 · R4): o mesmo objeto quando não há nada inseguro (sem custo para o React);
 * senão, uma cópia sem os links inseguros e sem as cores com `url(…)` (a imagem externa fica para o `ImageView`, que
 * mostra o espaço reservado). Protege boards antigos e dados vindos do Yjs/backup que o servidor já não aceita.
 */
export function renderSafeElement<T extends object>(el: T): T {
  if (!hasUnsafeStyleOrLink(el, 0)) return el;
  return stripObject(el, 0, { links: 0, styles: 0 }) as T;
}

function hasUnsafeStyleOrLink(v: unknown, depth: number): boolean {
  if (depth > 10 || !v || typeof v !== 'object') return false;
  const isArr = Array.isArray(v);
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x === 'string') {
      if (!isArr && k !== 'dataUrl' && kindOf(k, x)) return true;
    } else if (x && typeof x === 'object' && hasUnsafeStyleOrLink(x, depth + 1)) return true;
  }
  return false;
}
