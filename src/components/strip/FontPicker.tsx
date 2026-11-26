/**
 * LuDraw — seletor de fonte do board (Chat 08.2 · C-2, `STUDIO_V2_SPEC.md` §10): busca, "Recentes" no topo e grupos
 * por categoria (Sem serifa · Serifa · Manuscrita · Display · Mono). O nome de cada família é escrito NA PRÓPRIA FONTE
 * só quando o item está visível na lista (IntersectionObserver): abrir o seletor não baixa as 40 famílias, só as que
 * aparecem na rolagem. É o MESMO seletor da gaveta Estilo do texto, do texto da linha do conector e da célula da tabela.
 *
 * `variant="compact"` (gaveta Estilo do texto, ref. `estudio-v2-barra-contexto.html`): lista curta (≈ 4 linhas) para o
 * tamanho e o estilo ficarem à vista sem rolar a gaveta; mesma ordem (Recentes, depois as categorias), mas sem títulos
 * de grupo: a categoria (e "recente") aparece à direita de cada fonte.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { BOARD_FONTS, type BoardFont, type FontCategory } from '../../utils/text';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';

const RECENT_KEY = 'ludraw:recent-fonts';
const CATEGORIES: FontCategory[] = ['sans', 'serif', 'hand', 'display', 'mono'];
const CATEGORY_KEY: Record<FontCategory, TKey> = {
  sans: 'board.strip.fontSans',
  serif: 'board.strip.fontSerif',
  hand: 'board.strip.fontHand',
  display: 'board.strip.fontDisplay',
  mono: 'board.strip.fontMono',
};

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && BOARD_FONTS.some((f) => f.name === x)).slice(0, 4) : [];
  } catch {
    return [];
  }
}
function remember(name: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...readRecent().filter((x) => x !== name)].slice(0, 4)));
  } catch {
    /* sem armazenamento: só não guarda os recentes */
  }
}

interface FontPickerProps {
  /** fonte atual (null = "Misto" ou automática) */
  value: string | null;
  onPick: (name: string) => void;
  /** item extra no topo (ex.: "Automática" nas células da tabela) */
  defaultOption?: { label: string; selected: boolean; onPick: () => void };
  variant?: 'grouped' | 'compact';
  className?: string;
}

export function FontPicker({ value, onPick, defaultOption, variant = 'grouped', className }: FontPickerProps) {
  const compact = variant === 'compact';
  const t = useT();
  const [query, setQuery] = useState('');
  const [recent] = useState(readRecent);
  const listRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<string>>(() => new Set());

  const q = query.trim().toLowerCase();
  const matches = (f: BoardFont) => !q || f.name.toLowerCase().includes(q);
  const groups = useMemo(() => CATEGORIES.map((c) => ({ c, fonts: BOARD_FONTS.filter((f) => f.category === c && matches(f)) })).filter((g) => g.fonts.length), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const recentFonts = q ? [] : recent.map((n) => BOARD_FONTS.find((f) => f.name === n)).filter((f): f is BoardFont => !!f);

  // prévia na própria fonte só para o que está visível na rolagem
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).dataset.fontName ?? '');
        if (seen.length) setVisible((prev) => (seen.every((n) => prev.has(n)) ? prev : new Set([...prev, ...seen])));
      },
      { root, rootMargin: '40px 0px' },
    );
    root.querySelectorAll('[data-font-name]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [q, groups.length]);

  // abre com a fonte atual à vista (rola só a lista, nunca a página)
  useLayoutEffect(() => {
    const root = listRef.current;
    const cur = value ? root?.querySelector<HTMLElement>(`[data-font-name="${CSS.escape(value)}"]`) : null;
    if (!root || !cur) return;
    const top = cur.offsetTop - root.offsetTop;
    if (top < root.scrollTop || top + cur.offsetHeight > root.scrollTop + root.clientHeight) root.scrollTop = Math.max(0, top - 4);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recentSet = new Set(recentFonts.map((f) => f.name));
  const Item = ({ f, prefix }: { f: BoardFont; prefix: string }) =>
    compact ? (
      <button
        type="button"
        role="option"
        aria-selected={f.name === value}
        data-font-name={f.name}
        data-font-preview={visible.has(f.name) || undefined}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-start text-[16px] text-ink transition-colors duration-base hover:bg-panel-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)]',
          f.name === value && 'bg-accent-soft font-bold text-[var(--od-accent)] hover:bg-accent-soft',
        )}
        style={visible.has(f.name) ? { fontFamily: f.css } : undefined}
        onClick={() => {
          remember(f.name);
          onPick(f.name);
        }}
      >
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
        <span className="shrink-0 font-sans text-2xs font-semibold text-ink-subtle">
          {t(CATEGORY_KEY[f.category])}
          {prefix === 'r-' || recentSet.has(f.name) ? ` · ${t('board.strip.fontRecentOne')}` : ''}
        </span>
      </button>
    ) : (
      <button
        type="button"
        data-font-name={f.name}
        data-font-preview={visible.has(f.name) || undefined}
        className={cn('od-menu-item text-[15px]', f.name === value && 'bg-accent-soft')}
        style={visible.has(f.name) ? { fontFamily: f.css } : undefined}
        onClick={() => {
          remember(f.name);
          onPick(f.name);
        }}
      >
        <span className="flex-1 truncate">{f.name}</span>
        {f.name === value && <Check size={15} className="text-selection" />}
      </button>
    );
  // na lista compacta a fonte recente aparece uma vez só (no topo)
  const groupFonts = (fonts: BoardFont[]) => (compact ? fonts.filter((f) => !recentSet.has(f.name)) : fonts);

  return (
    <div className={cn('flex w-[240px] flex-col', className)} data-font-picker={variant}>
      <div className={cn('relative', compact ? 'pb-1' : 'px-1.5 pb-1 pt-1.5')}>
        <Search size={14} className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle', compact ? 'start-2.5 mt-[-2px]' : 'start-4 mt-[2px]')} />
        <input
          className={cn('od-input ps-8', compact ? 'h-[34px] text-[13px]' : 'h-8 text-[13px]')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={compact ? t('board.strip.fontSearchCount', { count: BOARD_FONTS.length }) : t('board.strip.fontSearch')}
          aria-label={t('board.strip.fontSearch')}
          data-allow-focus
        />
      </div>
      <div
        ref={listRef}
        className={cn('overflow-y-auto', compact ? 'mt-0.5 max-h-[128px] min-h-[58px] shrink pe-0.5' : 'max-h-[280px] px-1.5 pb-1.5')}
        role="listbox"
        aria-label={t('board.floatingContextToolbar.font')}
      >
        {defaultOption && !q && (
          <button type="button" className={cn('od-menu-item', defaultOption.selected && 'bg-accent-soft')} onClick={defaultOption.onPick}>
            <span className="flex-1">{defaultOption.label}</span>
            {defaultOption.selected && <Check size={15} className="text-selection" />}
          </button>
        )}
        {recentFonts.length > 0 && (
          <>
            {!compact && <div className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('board.strip.fontRecent')}</div>}
            {recentFonts.map((f) => (
              <Item key={`r-${f.name}`} f={f} prefix="r-" />
            ))}
          </>
        )}
        {groups.map((g) => (
          <div key={g.c} data-font-group={g.c}>
            {!compact && <div className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t(CATEGORY_KEY[g.c])}</div>}
            {groupFonts(g.fonts).map((f) => (
              <Item key={f.name} f={f} prefix="" />
            ))}
          </div>
        ))}
        {!groups.length && <div className="px-2.5 py-4 text-center text-[12.5px] text-ink-subtle">{t('board.strip.fontNone')}</div>}
      </div>
    </div>
  );
}
