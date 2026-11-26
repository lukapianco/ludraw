/**
 * LuDraw i18n — formatação por `Intl` no idioma ativo (Chat 05.6 · I18N_SPEC §4.6).
 *
 * Números, datas, tempo relativo, listas, tamanhos de arquivo e ordenação. Formatadores ficam em
 * cache por idioma + opções. Nunca formatar à mão no código de interface.
 */
import { getIntlLocale, t } from './index';

const cache = new Map<string, unknown>();

function cached<T>(kind: string, options: object | undefined, make: (locale: string) => T): T {
  const locale = getIntlLocale();
  const id = `${kind}|${locale}|${options ? JSON.stringify(options) : ''}`;
  let value = cache.get(id) as T | undefined;
  if (!value) {
    value = make(locale);
    cache.set(id, value);
  }
  return value;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return cached('number', options, (l) => new Intl.NumberFormat(l, options)).format(value);
}

export function formatPercent(ratio: number, maximumFractionDigits = 0): string {
  return formatNumber(ratio, { style: 'percent', maximumFractionDigits });
}

export function formatDate(value: Date | number | string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return cached('date', options, (l) => new Intl.DateTimeFormat(l, options)).format(date);
}

export function formatDateTime(value: Date | number | string): string {
  return formatDate(value, { dateStyle: 'short', timeStyle: 'short' });
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.34524],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

/** "há 5 minutos" / "5 minutes ago" / "em 2 dias" — a partir de uma data ou timestamp. */
export function formatRelativeTime(value: Date | number | string, now: number = Date.now()): string {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  let delta = (time - now) / 1000;
  const rtf = cached('relative', { numeric: 'auto' }, (l) => new Intl.RelativeTimeFormat(l, { numeric: 'auto' }));
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit);
    delta /= size;
  }
  return rtf.format(Math.round(delta), 'year');
}

/**
 * Tempo decorrido curto para listas (cartões da Mesa, Activity Log, comentários): menos de 45 s →
 * "agora mesmo"; depois minutos, horas e dias pelo `Intl.RelativeTimeFormat` ("há 3 minutos",
 * "ontem", "há 4 dias" / "3 minutes ago", "yesterday").
 */
export function formatTimeAgo(value: Date | number | string, now: number = Date.now()): string {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return t('common.time.justNow');
  const rtf = cached('relative-long', { numeric: 'auto' }, (l) => new Intl.RelativeTimeFormat(l, { numeric: 'auto' }));
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.max(1, Math.round(hours / 24)), 'day');
}

/** "A, B e C" / "A, B, and C" — `type: 'disjunction'` para "ou". */
export function formatList(items: readonly string[], type: 'conjunction' | 'disjunction' | 'unit' = 'conjunction'): string {
  const ListFormat = (Intl as unknown as { ListFormat?: new (l: string, o: object) => { format(items: readonly string[]): string } }).ListFormat;
  if (!ListFormat) return items.join(', ');
  return cached('list', { type }, (l) => new ListFormat(l, { style: 'long', type })).format(items);
}

/** Substantivos contáveis com plural no catálogo (`common.count.<nome>`: "{amount} formas"). */
export type CountNoun = 'shape' | 'line' | 'text' | 'drawing' | 'image' | 'frame' | 'object' | 'file' | 'card' | 'sticky' | 'point' | 'participant' | 'item' | 'response' | 'vote' | 'connector' | 'group';

/** "3 formas", "1 arquivo", "1.250 post-its" — número no formato do idioma e plural correto. */
export function formatCount(noun: CountNoun, count: number): string {
  return t(`common.count.${noun}`, { count, amount: formatNumber(count) });
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/** Tamanho de arquivo com unidade localizada ("1,5 MB"). */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  try {
    return formatNumber(value, { style: 'unit', unit: BYTE_UNITS[unit], unitDisplay: 'short', maximumFractionDigits: unit === 0 ? 0 : 1 });
  } catch {
    return `${formatNumber(value, { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB'][unit]}`;
  }
}

/** Comparador de textos do idioma ativo (acentos e números na ordem natural). */
export function collator(options: Intl.CollatorOptions = { sensitivity: 'base', numeric: true }): Intl.Collator {
  return cached('collator', options, (l) => new Intl.Collator(l, options));
}

export function compareText(a: string, b: string): number {
  return collator().compare(a, b);
}
