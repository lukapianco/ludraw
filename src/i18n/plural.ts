/**
 * LuDraw i18n — escolha da forma de plural (Chat 05.6 · I18N_SPEC §2).
 *
 * Cada idioma só precisa das categorias que usa (`Intl.PluralRules(...).resolvedOptions().pluralCategories`).
 * Chaves de plural usam sufixos: `_zero | _one | _two | _few | _many | _other`.
 * `_zero` é opcional e vale só para `count === 0` (mesmo em idiomas sem a categoria "zero").
 */

export const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralCategory = (typeof PLURAL_SUFFIXES)[number];

const rulesCache = new Map<string, Intl.PluralRules>();

function rulesFor(locale: string): Intl.PluralRules {
  let rules = rulesCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules('pt-BR');
    }
    rulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * Convenções do LuDraw por cima do CLDR. Em português o CLDR põe o 0 em "one" ("0 linha"); o
 * app sempre escreveu "0 linhas" (singular só para 1), então o 0 vai para "other". Para um caso
 * especial de zero ("Nenhuma tag"), use a chave `_zero`.
 */
const ZERO_IS_OTHER = new Set(['pt']);

/** Categoria de plural do número no idioma (ex.: pt-BR 1 → "one", 0 e 2 → "other"; en 0 → "other"). */
export function pluralCategory(locale: string, count: number): PluralCategory {
  if (count === 0 && ZERO_IS_OTHER.has(locale.toLowerCase().split('-')[0] ?? '')) return 'other';
  return rulesFor(locale).select(count) as PluralCategory;
}

/** Categorias exigidas pelo idioma — usadas pela verificação de catálogos (Rodada B). */
export function requiredPluralCategories(locale: string): PluralCategory[] {
  return rulesFor(locale).resolvedOptions().pluralCategories as PluralCategory[];
}

/**
 * Procura a forma certa da chave: `<key>_zero` (só para 0) → `<key>_<categoria>` → `<key>_other` → `<key>`.
 * `has` diz se a chave existe no catálogo consultado.
 */
export function pluralKeyCandidates(locale: string, key: string, count: number): string[] {
  const out: string[] = [];
  if (count === 0) out.push(`${key}_zero`);
  const cat = pluralCategory(locale, count);
  out.push(`${key}_${cat}`);
  if (cat !== 'other') out.push(`${key}_other`);
  out.push(key);
  return out;
}

/** `true` se a chave termina com um sufixo de plural. */
export function isPluralVariant(key: string): boolean {
  return PLURAL_SUFFIXES.some((s) => key.endsWith(`_${s}`));
}

/** Remove o sufixo de plural (`x_one` → `x`). */
export function pluralBase(key: string): string {
  for (const s of PLURAL_SUFFIXES) if (key.endsWith(`_${s}`)) return key.slice(0, -(s.length + 1));
  return key;
}
