/**
 * LuDraw i18n — qual idioma usar (Chat 05.6 · I18N_SPEC §3).
 *
 * Ordem: `?lang=<código>` na URL (só para testar, não é salvo) → preferência salva
 * (`preferences.locale`) → melhor correspondência em `navigator.languages` → pt-BR.
 */

export const DEFAULT_LOCALE = 'pt-BR';
/** Pseudo-idioma de teste (`?lang=qps`): acentua e alonga os textos para achar texto fixo e estouro de layout. */
export const PSEUDO_LOCALE = 'qps';

function baseOf(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Melhor correspondência de `requested` entre `available`: igual (sem diferenciar maiúsculas) →
 * mesmo idioma base (pt-PT → pt-BR, en-GB → en) → nada.
 */
export function matchLocale(requested: string | null | undefined, available: readonly string[]): string | null {
  if (!requested) return null;
  const want = requested.trim().replace('_', '-').toLowerCase();
  if (!want) return null;
  const exact = available.find((c) => c.toLowerCase() === want);
  if (exact) return exact;
  const base = baseOf(want);
  return available.find((c) => c.toLowerCase() === base) ?? available.find((c) => baseOf(c) === base) ?? null;
}

/** Idiomas do navegador em ordem de preferência. */
export function browserLocales(): string[] {
  if (typeof navigator === 'undefined') return [];
  const list = Array.isArray(navigator.languages) && navigator.languages.length ? [...navigator.languages] : [];
  if (!list.length && navigator.language) list.push(navigator.language);
  return list;
}

/** Primeiro idioma do navegador que temos (ou null). */
export function detectBrowserLocale(available: readonly string[]): string | null {
  for (const code of browserLocales()) {
    const hit = matchLocale(code, available);
    if (hit) return hit;
  }
  return null;
}

/** `?lang=` na busca da URL ou na consulta do hash (`#/board/x?lang=en`). */
export function queryLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('lang');
    if (fromSearch) return fromSearch;
    const hashQuery = window.location.hash.split('?')[1];
    return hashQuery ? new URLSearchParams(hashQuery).get('lang') : null;
  } catch {
    return null;
  }
}

/**
 * Decide o idioma ativo. `preference` ausente = "Seguir o navegador".
 * `available` deve incluir o pseudo-idioma para que `?lang=qps` funcione.
 */
export function resolveLocale(preference: string | null | undefined, available: readonly string[]): string {
  return (
    matchLocale(queryLocale(), available) ??
    matchLocale(preference, available) ??
    detectBrowserLocale(available.filter((c) => c !== PSEUDO_LOCALE)) ??
    DEFAULT_LOCALE
  );
}
