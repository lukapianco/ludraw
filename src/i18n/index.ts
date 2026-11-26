/**
 * LuDraw i18n — motor próprio, sem dependências, sobre a API nativa `Intl` (Chat 05.6).
 *
 * - `t(chave, params?)` funciona dentro e fora do React (store, utils, toasts). Componentes usam
 *   `useT()` para re-renderizar quando o idioma muda.
 * - Interpolação `{nome}`; plural por `Intl.PluralRules` com sufixos `_one`, `_other`… (`count`).
 * - Fallback em cadeia: idioma → `fallback` do `_meta.json` → idioma base → pt-BR → a própria chave.
 * - Pseudo-idioma `qps` (`?lang=qps`): o inglês acentuado e alongado (`[Çŕéàţé ƀõàŕð ~~~]`).
 * - Parâmetros podem ser outra mensagem (`{ key, params }`), traduzida no mesmo idioma.
 *
 * Regras de uso: `ai-memory/I18N_SPEC.md` §4 (texto do usuário nunca é traduzido; dados
 * persistidos guardam chave + parâmetros).
 */
import { ALL_LOCALES, type LocaleBundle } from './catalogs';
import { DEFAULT_LOCALE, PSEUDO_LOCALE, resolveLocale } from './detect';
import { pluralKeyCandidates } from './plural';
import type { LocaleMeta, MessageDescriptor, MessageParams, MessageParamValue, StoredMessage, TKey, TextDirection } from './types';

export type { LocaleMeta, MessageDescriptor, MessageParams, MessageParamValue, StoredMessage, TKey, TextDirection } from './types';
export { DEFAULT_LOCALE, PSEUDO_LOCALE } from './detect';

/* --------------------------------- Catálogos -------------------------------- */

type FlatMessages = Map<string, string>;

const bundles = new Map<string, LocaleBundle>(ALL_LOCALES.map((b) => [b.meta.code, b]));
const flatCache = new Map<string, FlatMessages>();

function flatten(bundle: LocaleBundle | undefined): FlatMessages {
  const out: FlatMessages = new Map();
  if (!bundle) return out;
  for (const [ns, entries] of Object.entries(bundle.messages)) {
    if (!entries) continue;
    for (const [k, v] of Object.entries(entries)) if (typeof v === 'string') out.set(`${ns}.${k}`, v);
  }
  return out;
}

const PSEUDO_META: LocaleMeta = {
  code: PSEUDO_LOCALE,
  name: 'Pseudo-locale',
  nativeName: '[Ƥšéûðõ ~~]',
  dir: 'ltr',
  translators: [],
  status: 'draft',
};

const ACCENTS: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'õ', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Õ', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Acentua letras fora de `{placeholders}` e `<marcas>` e alonga ~35 % (simula idiomas mais longos). */
export function pseudoLocalize(message: string): string {
  let out = '';
  let letters = 0;
  for (const part of message.split(/(\{[^}]*\}|<\/?[a-z]+>)/g)) {
    if (!part) continue;
    if (part.startsWith('{') || part.startsWith('<')) {
      out += part;
      continue;
    }
    for (const ch of part) {
      out += ACCENTS[ch] ?? ch;
      if (/[A-Za-z]/.test(ch)) letters++;
    }
  }
  return `[${out} ${'~'.repeat(Math.max(2, Math.ceil(letters * 0.35)))}]`;
}

function messagesFor(code: string): FlatMessages {
  let flat = flatCache.get(code);
  if (flat) return flat;
  if (code === PSEUDO_LOCALE) {
    flat = new Map();
    const source = messagesFor('en');
    for (const [k, v] of messagesFor(DEFAULT_LOCALE)) flat.set(k, pseudoLocalize(source.get(k) ?? v));
  } else {
    flat = flatten(bundles.get(code));
  }
  flatCache.set(code, flat);
  return flat;
}

/* ------------------------------- Idioma ativo ------------------------------- */

let current = DEFAULT_LOCALE;
let preference: string | null = null;
const listeners = new Set<() => void>();
const chainCache = new Map<string, string[]>();

/** Códigos que o app conhece (pt-BR, en, idiomas da comunidade e o pseudo-idioma). */
export function knownLocales(): string[] {
  return [...bundles.keys(), PSEUDO_LOCALE];
}

export function localeMeta(code: string): LocaleMeta | undefined {
  return code === PSEUDO_LOCALE ? PSEUDO_META : bundles.get(code)?.meta;
}

/** Idiomas oferecidos no seletor (o pseudo-idioma só aparece quando está ativo). */
export function selectableLocales(): LocaleMeta[] {
  const list = [...bundles.values()].map((b) => b.meta).filter((m) => m.status !== 'draft');
  if (current === PSEUDO_LOCALE) list.push(PSEUDO_META);
  return list;
}

/** Cadeia de consulta: idioma → fallback declarado → idioma base disponível → pt-BR. */
function chainFor(code: string): string[] {
  const cached = chainCache.get(code);
  if (cached) return cached;
  const chain: string[] = [code];
  const push = (c: string | undefined) => {
    if (c && !chain.includes(c) && (bundles.has(c) || c === PSEUDO_LOCALE)) chain.push(c);
  };
  push(localeMeta(code)?.fallback);
  const base = code.split('-')[0];
  if (base !== code) push([...bundles.keys()].find((c) => c === base || c.startsWith(`${base}-`)));
  push(DEFAULT_LOCALE);
  chainCache.set(code, chain);
  return chain;
}

/** Código BCP-47 usado nas APIs `Intl` (o pseudo-idioma formata como inglês). */
export function intlLocaleOf(code: string): string {
  return code === PSEUDO_LOCALE ? 'en' : code;
}

export function getLocale(): string {
  return current;
}

export function getIntlLocale(): string {
  return intlLocaleOf(current);
}

export function getTextDirection(): TextDirection {
  return localeMeta(current)?.dir === 'rtl' ? 'rtl' : 'ltr';
}

/** Preferência salva (`null` = "Seguir o navegador"). */
export function getLocalePreference(): string | null {
  return preference;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyDocument(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = current === PSEUDO_LOCALE ? 'en-XA' : current;
  root.dir = getTextDirection();
}

/** Troca o idioma ativo na hora (sem recarregar). Códigos desconhecidos são ignorados. */
export function setLocale(code: string): void {
  if (!knownLocales().includes(code)) return;
  if (code !== current) {
    current = code;
    applyDocument();
    for (const l of [...listeners]) l();
  } else {
    applyDocument();
  }
}

/**
 * Aplica a preferência do usuário (ausente = seguir o navegador). `?lang=` na URL tem prioridade
 * para testes e não é salvo.
 */
export function applyLocalePreference(pref: string | null | undefined): string {
  preference = pref ?? null;
  const next = resolveLocale(preference, knownLocales());
  setLocale(next);
  return next;
}

/* --------------------------------- Tradução --------------------------------- */

function lookup(code: string, key: string, count: number | undefined): string | undefined {
  const plural = typeof count === 'number' && Number.isFinite(count);
  for (const loc of chainFor(code)) {
    const messages = messagesFor(loc);
    if (plural) {
      for (const candidate of pluralKeyCandidates(intlLocaleOf(loc), key, count)) {
        const hit = messages.get(candidate);
        if (hit !== undefined) return hit;
      }
    } else {
      const hit = messages.get(key);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

const warned = new Set<string>();

function formatParam(code: string, value: MessageParamValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return translateIn(code, value.key, value.params as MessageParams | undefined);
  return String(value);
}

/** Substitui `{nome}` pelos parâmetros (os ausentes ficam como estão, para aparecerem nos testes). */
export function interpolate(message: string, params: MessageParams | undefined, code = current): string {
  if (!params || message.indexOf('{') === -1) return message;
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => (name in params ? formatParam(code, params[name]) : whole));
}

function translateIn(code: string, key: string, params?: MessageParams): string {
  const count = params && typeof params.count === 'number' ? params.count : undefined;
  const message = lookup(code, key, count);
  if (message === undefined) {
    if (!warned.has(key) && typeof console !== 'undefined') {
      warned.add(key);
      console.warn(`[i18n] chave sem tradução: ${key}`);
    }
    return key;
  }
  return interpolate(message, params, code);
}

/** Traduz no idioma ativo. Chave inexistente: erro de compilação (e, em tempo de execução, a própria chave). */
export function t(key: TKey, params?: MessageParams): string {
  return translateIn(current, key, params);
}

/** Traduz uma mensagem guardada como chave + parâmetros (permissões, dados persistidos, API). */
export function translateMessage(message: MessageDescriptor): string {
  return translateIn(current, message.key, message.params);
}

/** Traduz uma mensagem gravada (chave livre + parâmetros), com parâmetros extras (ex.: `{ actor }`). */
export function translateStored(message: StoredMessage, extra?: MessageParams): string {
  return translateIn(current, message.key, extra ? { ...(message.params as MessageParams | undefined), ...extra } : (message.params as MessageParams | undefined));
}

/** Versão sem tipagem estrita, para chaves vindas de dados (extensões, servidor). */
export function tDynamic(key: string, params?: MessageParams): string {
  return translateIn(current, key, params);
}

/** Mensagem crua (com `{placeholders}` e marcas) — usada por `<Trans>`. */
export function rawMessage(key: string, params?: MessageParams): string | undefined {
  const count = params && typeof params.count === 'number' ? params.count : undefined;
  return lookup(current, key, count);
}

export function hasMessage(key: string): boolean {
  return chainFor(current).some((loc) => messagesFor(loc).has(key));
}

/** Atalho para montar descritores tipados: `msg('permissions.denied.noAccess')`. */
export function msg(key: TKey, params?: MessageParams): MessageDescriptor {
  return params ? { key, params } : { key };
}

/**
 * Objeto com propriedades traduzidas na hora da leitura — para listas e tabelas de rótulos
 * definidas no nível do módulo (que seriam avaliadas uma vez só, no idioma da abertura).
 * `labels({ admin: 'permissions.roles.admin' })` → `obj.admin` sempre no idioma ativo.
 */
export function translatedRecord<K extends string>(keys: Record<K, TKey>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(keys) as K[]) {
    Object.defineProperty(out, k, { enumerable: true, get: () => t(keys[k]) });
  }
  return out;
}

applyDocument();
