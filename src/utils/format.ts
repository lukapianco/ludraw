/** LuDraw — formatação de datas e textos. pt-BR mantém o formato de sempre; outros idiomas usam `Intl` (Chat 05.6). */
import { getIntlLocale, getLocale, t } from '../i18n';
import { formatDate } from '../i18n/format';

const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** "Hoje", "Ontem" ou "30 de jul." (com ano se for de outro ano). */
export function formatRelativeDay(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return t('common.time.today');
  if (diffDays === 1) return t('common.time.yesterdayTitle');
  if (getLocale() !== 'pt-BR') {
    return formatDate(d, d.getFullYear() === today.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const base = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ''; // data ausente/inválida em dados antigos: não derruba a tela
  if (getLocale() !== 'pt-BR') return new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return t('common.greeting.night');
  if (h < 12) return t('common.greeting.morning');
  if (h < 18) return t('common.greeting.afternoon');
  return t('common.greeting.night');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function slugifyFileName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return base || 'board';
}

/** Rótulo de atalho adaptado ao sistema (⌘ no macOS). */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function shortcutLabel(shortcut: string): string {
  if (!IS_MAC) return shortcut;
  return shortcut.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧');
}
