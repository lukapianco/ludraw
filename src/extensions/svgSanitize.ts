/**
 * LuDraw — Sanitizador de SVG para stickers de extensões (Chat 06.5 · Rodada A).
 *
 * PURO (sem DOM): tokenizador próprio de tags/atributos. O SVG de saída é RECONSTRUÍDO a partir
 * dos tokens aceitos (nunca devolvemos o texto original), com valores reescapados.
 *
 * Política (ajuste do usuário, 07/11/2026):
 * - elementos aceitos: svg, g, path, rect, circle, ellipse, line, polyline, polygon, title, desc, text, tspan;
 * - metadados de editores (`metadata`, `sodipodi:*`, `inkscape:*`) são descartados com o conteúdo;
 * - RECUSA o arquivo inteiro se aparecer: `script`, `style`, `use`, `image`, `a`, `foreignObject`
 *   (ou qualquer outro elemento fora da lista), atributo `on*`, `style`, `href`/`xlink:href`
 *   (qualquer `*:href`), qualquer `url(` ou `data:` em atributo, `javascript:`, DOCTYPE/ENTITY/CDATA;
 * - limites: 64 KB, 2.000 elementos, profundidade 32.
 *
 * O resultado só é usado como `<img src="data:image/svg+xml;base64,…">` (imagem não executa script),
 * então a sanitização é uma segunda camada.
 */

export const SVG_STICKER_LIMITS = { maxBytes: 64 * 1024, maxElements: 2000, maxDepth: 32 } as const;

export type SvgSanitizeIssue =
  | 'tooLarge'
  | 'syntax'
  | 'forbiddenElement'
  | 'forbiddenAttribute'
  | 'forbiddenValue'
  | 'notSvg'
  | 'tooComplex'
  | 'noSize';

export type SvgSanitizeResult = { ok: true; svg: string } | { ok: false; issue: SvgSanitizeIssue; detail?: string };

const ALLOWED_ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'title', 'desc', 'text', 'tspan']);
const DROPPED_ELEMENTS = /^(metadata|sodipodi:.+|inkscape:.+)$/i;
const TEXT_ELEMENTS = new Set(['title', 'desc', 'text', 'tspan']);

const ALLOWED_ATTRS = new Set([
  'id', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'viewbox',
  'preserveaspectratio', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing',
  'dx', 'dy', 'version', 'visibility', 'vector-effect', 'paint-order',
]);
/** Nomes que fazem a sanitização recusar o arquivo (não apenas descartar o atributo). */
const FORBIDDEN_ATTR = /^(on.*|style|href|.*:href|src|formaction|xlink:.*)$/i;
const FORBIDDEN_VALUE = /url\s*\(|data:|javascript:|vbscript:|expression\s*\(|[<>]/i;

const NAME = /^[A-Za-z_][A-Za-z0-9:._-]*$/;
const ENTITY = /&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g;

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}
/** Decodifica só as entidades básicas; qualquer outra `&` vira erro. */
function decodeEntities(s: string): string | null {
  if (/&(?!(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/.test(s)) return null;
  return s.replace(ENTITY, (_, e: string) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

interface Attr {
  name: string;
  value: string;
}

/** Lê os atributos de uma tag (só `nome="valor"` ou `nome='valor'`). */
function parseAttrs(src: string): Attr[] | null {
  const attrs: Attr[] = [];
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    const nameStart = i;
    while (i < src.length && /[^\s=/>]/.test(src[i])) i++;
    const name = src.slice(nameStart, i);
    if (!NAME.test(name)) return null;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '=') return null;
    i++;
    while (i < src.length && /\s/.test(src[i])) i++;
    const q = src[i];
    if (q !== '"' && q !== "'") return null;
    const end = src.indexOf(q, i + 1);
    if (end < 0) return null;
    const value = decodeEntities(src.slice(i + 1, end));
    if (value === null) return null;
    attrs.push({ name, value });
    i = end + 1;
  }
  return attrs;
}

/** Sanitiza um SVG de sticker. Devolve o SVG reconstruído ou o motivo da recusa. */
export function sanitizeSvg(input: string): SvgSanitizeResult {
  if (typeof input !== 'string') return { ok: false, issue: 'syntax' };
  if (new TextEncoder().encode(input).byteLength > SVG_STICKER_LIMITS.maxBytes) return { ok: false, issue: 'tooLarge' };
  const src = input.replace(/^﻿/, '');
  const out: string[] = [];
  const stack: string[] = [];
  let dropDepth = 0;
  let elements = 0;
  let sawRoot = false;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const text = src.slice(i, lt < 0 ? src.length : lt);
    if (text) {
      const decoded = decodeEntities(text);
      if (decoded === null) return { ok: false, issue: 'syntax' };
      if (decoded.trim()) {
        const parent = stack[stack.length - 1];
        if (!dropDepth) {
          if (!parent || !TEXT_ELEMENTS.has(parent)) return { ok: false, issue: 'syntax' };
          out.push(escapeText(decoded));
        }
      } else if (!dropDepth && stack.length) out.push(decoded.replace(/[^\s]/g, ''));
    }
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) return { ok: false, issue: 'syntax' };
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end < 0 || !/^<\?xml[\s?]/i.test(src.slice(lt, lt + 6)) || stack.length) return { ok: false, issue: 'syntax' };
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) return { ok: false, issue: 'forbiddenElement', detail: src.slice(lt, lt + 12) };
    const gt = src.indexOf('>', lt + 1);
    if (gt < 0) return { ok: false, issue: 'syntax' };
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (!open || open.toLowerCase() !== name.toLowerCase()) return { ok: false, issue: 'syntax' };
      if (dropDepth) {
        dropDepth--;
        continue;
      }
      out.push(`</${open}>`);
      continue;
    }

    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = /^([^\s/>]+)/.exec(body);
    if (!nameMatch || !NAME.test(nameMatch[1])) return { ok: false, issue: 'syntax' };
    const name = nameMatch[1];
    const lower = name.toLowerCase();
    const attrs = parseAttrs(body.slice(name.length));
    if (!attrs) return { ok: false, issue: 'syntax' };

    // recusados em QUALQUER lugar, mesmo dentro de metadados descartados
    if (/^(script|style|use|image|a|foreignobject|iframe|object|embed|animate.*|set|handler|listener)$/i.test(name)) return { ok: false, issue: 'forbiddenElement', detail: name };
    if (dropDepth || DROPPED_ELEMENTS.test(name)) {
      if (!selfClosing) {
        stack.push(name);
        dropDepth++;
      }
      continue;
    }
    if (!ALLOWED_ELEMENTS.has(name)) return { ok: false, issue: 'forbiddenElement', detail: name };
    if (!sawRoot) {
      if (lower !== 'svg' || stack.length) return { ok: false, issue: 'notSvg' };
      sawRoot = true;
    } else if (!stack.length) return { ok: false, issue: 'syntax' };
    if (++elements > SVG_STICKER_LIMITS.maxElements || stack.length >= SVG_STICKER_LIMITS.maxDepth) return { ok: false, issue: 'tooComplex' };

    const kept: Attr[] = [];
    for (const a of attrs) {
      const an = a.name.toLowerCase();
      if (an === 'xmlns' || an.startsWith('xmlns:') || an.startsWith('sodipodi:') || an.startsWith('inkscape:') || an.startsWith('data-')) continue;
      if (FORBIDDEN_ATTR.test(an)) return { ok: false, issue: 'forbiddenAttribute', detail: a.name };
      if (FORBIDDEN_VALUE.test(a.value)) return { ok: false, issue: 'forbiddenValue', detail: a.name };
      if (!ALLOWED_ATTRS.has(an)) continue;
      if (a.value.length > 20_000) return { ok: false, issue: 'tooComplex' };
      kept.push({ name: an === 'viewbox' ? 'viewBox' : an === 'preserveaspectratio' ? 'preserveAspectRatio' : a.name, value: a.value });
    }
    if (lower === 'svg' && stack.length === 0) {
      const has = (n: string) => kept.some((a) => a.name.toLowerCase() === n);
      if (!has('viewbox') && !(has('width') && has('height'))) return { ok: false, issue: 'noSize' };
      kept.unshift({ name: 'xmlns', value: 'http://www.w3.org/2000/svg' });
    }
    const attrText = kept.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`).join('');
    if (selfClosing) out.push(`<${name}${attrText}/>`);
    else {
      out.push(`<${name}${attrText}>`);
      stack.push(name);
    }
  }
  if (stack.length || !sawRoot) return { ok: false, issue: sawRoot ? 'syntax' : 'notSvg' };
  return { ok: true, svg: out.join('').trim() };
}

/** Confere a assinatura de PNG/WebP (stickers em imagem). */
export function rasterKind(bytes: Uint8Array): 'png' | 'webp' | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'webp';
  return null;
}
