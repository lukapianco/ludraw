/**
 * LuDraw i18n — hooks React (Chat 05.6).
 *
 * `const t = useT()` dentro de componentes e hooks: o componente re-renderiza quando o idioma
 * muda. A função devolvida muda de identidade a cada troca de idioma (bom para dependências de
 * `useMemo`/`useCallback`), mas sempre traduz no idioma ativo — closures antigas não ficam presas
 * ao idioma anterior.
 */
import { useSyncExternalStore } from 'react';
import {
  getIntlLocale,
  getLocale,
  getLocalePreference,
  getTextDirection,
  subscribeLocale,
  t as translate,
  type MessageParams,
  type TKey,
  type TextDirection,
} from './index';

export type TFunction = (key: TKey, params?: MessageParams) => string;

const boundByLocale = new Map<string, TFunction>();

function tForLocale(locale: string): TFunction {
  let fn = boundByLocale.get(locale);
  if (!fn) {
    fn = (key, params) => translate(key, params);
    boundByLocale.set(locale, fn);
  }
  return fn;
}

/** Idioma ativo (re-renderiza ao trocar). */
export function useLocale(): string {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/** Função de tradução do idioma ativo. */
export function useT(): TFunction {
  return tForLocale(useLocale());
}

export interface I18nState {
  t: TFunction;
  locale: string;
  /** Código para as APIs `Intl` */
  intlLocale: string;
  dir: TextDirection;
  /** Preferência salva (`null` = seguir o navegador) */
  preference: string | null;
}

/** Tudo de uma vez: `t`, idioma, direção do texto e a preferência salva. */
export function useI18n(): I18nState {
  const locale = useLocale();
  return { t: tForLocale(locale), locale, intlLocale: getIntlLocale(), dir: getTextDirection(), preference: getLocalePreference() };
}
