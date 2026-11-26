/**
 * LuDraw i18n — tipos (Chat 05.6 · I18N_SPEC §2 e §4.2).
 *
 * `TKey` é derivado do catálogo pt-BR: `t('board.topBar.exportar')` com chave inexistente
 * não compila. Formas de plural (`x_one`, `x_other`…) viram a chave lógica `x`, que exige `count`.
 */
import type { Catalog } from './catalogs';

export type TextDirection = 'ltr' | 'rtl';

/** Conteúdo de `src/locales/<código>/_meta.json`. */
export interface LocaleMeta {
  /** Código BCP-47 (ex.: "pt-BR", "en", "es") */
  code: string;
  /** Nome em inglês (ex.: "Portuguese (Brazil)") */
  name: string;
  /** Nome no próprio idioma (ex.: "Português (Brasil)") — é o que o seletor mostra */
  nativeName: string;
  dir: TextDirection;
  /** Idioma consultado antes do pt-BR quando falta uma chave (opcional) */
  fallback?: string;
  translators: string[];
  /** "source" (pt-BR) · "official" (en) · "community" · "draft" (não aparece no seletor) */
  status: 'source' | 'official' | 'community' | 'draft' | string;
}

type StripPlural<K extends string> = K extends `${infer B}_zero`
  ? B
  : K extends `${infer B}_one`
    ? B
    : K extends `${infer B}_two`
      ? B
      : K extends `${infer B}_few`
        ? B
        : K extends `${infer B}_many`
          ? B
          : K extends `${infer B}_other`
            ? B
            : K;

type NamespaceKeys<NS extends keyof Catalog> = `${NS & string}.${StripPlural<keyof Catalog[NS] & string>}`;

/** Toda chave de mensagem válida (`<namespace>.<chave>`). */
export type TKey = { [NS in keyof Catalog]: NamespaceKeys<NS> }[keyof Catalog];

/**
 * Mensagem a traduzir depois: chave + parâmetros. É o que dados persistidos, o motor de
 * permissões e (no Chat 07) a API devolvem — nunca a frase já traduzida.
 */
export interface MessageDescriptor {
  key: TKey;
  params?: MessageParams;
}

export type MessageParamValue = string | number | MessageDescriptor | StoredMessage | null | undefined;
export type MessageParams = Record<string, MessageParamValue>;

/**
 * Mensagem gravada em dados persistidos (Activity Log, servidor): mesma forma do descritor, mas com
 * chave como texto livre — a chave pode ter sido renomeada ou vir de uma extensão. Só JSON simples.
 */
export interface StoredMessage {
  key: string;
  params?: { [name: string]: string | number | StoredMessage | null };
}
