import { Bold, Italic, Strikethrough, Underline, X } from 'lucide-react';
import type { TableElement } from '../../types/canvas';
import { FontPicker } from '../strip/FontPicker';
import { getCell, TABLE_BORDER_COLORS, TABLE_FONT_SIZE, TABLE_FONT_SIZES, TABLE_STYLES, type BorderPreset } from '../../utils/table';
import { activeRange, rangeAll, setBorderPen, tablePatchCells, tableSetBorders, tableSetStyle, tableToggleBanded, tableToggleHeader, tableToggleHeaderCol, tableToggleStyle, useTableUi } from '../../utils/tableActions';
import { cn } from '../../utils/cn';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';

/**
 * Painéis de formatação da Tabela (ajuste pós-Chat 04) — usados na Barra de ações
 * (`TableControls`) e no menu do botão direito (`menus/tableMenu.tsx`), para que as duas entradas
 * façam exatamente o mesmo.
 */

/* --------------------------------- Cores ---------------------------------- */

export function TableSwatches({ colors, value, title, onPick }: { colors: string[]; value: string; title: string; onPick: (c: string) => void }) {
  const t = useT();
  return (
    <div className="w-[248px] p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{title}</div>
      <div className="grid grid-cols-8 gap-1.5">
        {colors.map((c) => (
          <button
            key={c || 'none'}
            type="button"
            title={c || t('board.tableFormatPanels.automaticNoColor')}
            aria-label={c || t('board.tableFormatPanels.automaticNoColor')}
            onClick={() => onPick(c)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-black/10 transition-transform duration-base hover:scale-110 dark:ring-white/15',
              (value || '') === c && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]',
            )}
            style={{ background: c || 'transparent' }}
          >
            {!c && <X size={12} className="text-ink-muted" />}
          </button>
        ))}
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-muted">{t('board.tableFormatPanels.anotherColor')}<input type="color" className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onPick(e.target.value)} aria-label={t('board.tableFormatPanels.pickAnotherColor')} />
      </label>
    </div>
  );
}

/* --------------------------------- Bordas --------------------------------- */

export const BORDER_PRESETS: { id: BorderPreset; label: string }[] = [
  { id: 'all', get label() { return t('board.tableFormatPanels.allBorders'); } },
  { id: 'outer', get label() { return t('board.tableFormatPanels.outerBorders'); } },
  { id: 'inner', get label() { return t('board.tableFormatPanels.innerBorders'); } },
  { id: 'horizontal', get label() { return t('board.tableFormatPanels.innerHorizontalLines'); } },
  { id: 'vertical', get label() { return t('board.tableFormatPanels.innerVerticalLines'); } },
  { id: 'top', get label() { return t('board.tableFormatPanels.topBorder'); } },
  { id: 'bottom', get label() { return t('board.tableFormatPanels.bottomBorder'); } },
  { id: 'left', get label() { return t('board.tableFormatPanels.leftBorder'); } },
  { id: 'right', get label() { return t('board.tableFormatPanels.rightBorder'); } },
  { id: 'none', get label() { return t('board.tableFormatPanels.noBorders'); } },
  { id: 'clear', get label() { return t('board.tableFormatPanels.backDefault'); } },
];

/** Ícone 18 × 18 de um modelo de borda: grade 2 × 2 clara + traços escuros nos lados escolhidos. */
export function BorderIcon({ preset, size = 18 }: { preset: BorderPreset; size?: number }) {
  const s = size;
  const m = 2;
  const e = s - m;
  const h = s / 2;
  const L = {
    top: `M${m} ${m}H${e}`,
    bottom: `M${m} ${e}H${e}`,
    left: `M${m} ${m}V${e}`,
    right: `M${e} ${m}V${e}`,
    midH: `M${m} ${h}H${e}`,
    midV: `M${h} ${m}V${e}`,
  };
  const strong: string[] =
    preset === 'all' ? Object.values(L)
    : preset === 'outer' ? [L.top, L.bottom, L.left, L.right]
    : preset === 'inner' ? [L.midH, L.midV]
    : preset === 'horizontal' ? [L.midH]
    : preset === 'vertical' ? [L.midV]
    : preset === 'top' ? [L.top]
    : preset === 'bottom' ? [L.bottom]
    : preset === 'left' ? [L.left]
    : preset === 'right' ? [L.right]
    : [];
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      <path d={Object.values(L).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1} strokeDasharray="1.5 1.5" />
      {strong.length > 0 && <path d={strong.join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />}
      {preset === 'clear' && <path d={`M${m + 3} ${e - 3}L${e - 3} ${m + 3}`} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />}
    </svg>
  );
}

export function TableBorderPanel({ elementId, onDone }: { elementId: string; onDone?: () => void }) {
  const t = useT();
  const pen = useTableUi((s) => s.borderPen);
  return (
    <div className="w-[268px] p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{t('board.tableFormatPanels.selectionBorders')}</div>
      <div className="grid grid-cols-6 gap-1">
        {BORDER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="od-tool h-9 w-9 text-ink"
            title={p.label}
            aria-label={p.label}
            onClick={() => {
              tableSetBorders(elementId, p.id);
              onDone?.();
            }}
          >
            <BorderIcon preset={p.id} />
          </button>
        ))}
      </div>
      <div className="mt-3 text-[11px] font-semibold text-ink-muted">{t('board.tableFormatPanels.borderColor')}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TABLE_BORDER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={t('board.tableFormatPanels.borderColorC', { c })}
            className={cn('h-5 w-5 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110', pen.color === c && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]')}
            style={{ background: c }}
            onClick={() => setBorderPen({ color: c })}
          />
        ))}
        <input type="color" className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0" value={pen.color} onChange={(e) => setBorderPen({ color: e.target.value })} aria-label={t('board.tableFormatPanels.anotherBorderColor')} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] font-semibold text-ink-muted">{t('board.tableFormatPanels.thickness')}</div>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4].map((w) => (
              <button key={w} type="button" className="od-tool h-8 w-8" data-active={pen.width === w} onClick={() => setBorderPen({ width: w })} aria-label={`${w} px`} title={`${w} px`}>
                <span className="block w-4 rounded-full bg-current" style={{ height: w }} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-ink-muted">{t('board.tableFormatPanels.style')}</div>
          <div className="mt-1 flex gap-1">
            {(['solid', 'dashed', 'dotted'] as const).map((st) => (
              <button key={st} type="button" className="od-tool h-8 w-8" data-active={(pen.style ?? 'solid') === st} onClick={() => setBorderPen({ style: st })} aria-label={st === 'solid' ? t('board.tableFormatPanels.solid') : st === 'dashed' ? t('board.tableFormatPanels.dashed') : t('board.tableFormatPanels.dotted')} title={st === 'solid' ? t('board.tableFormatPanels.solid') : st === 'dashed' ? t('board.tableFormatPanels.dashed') : t('board.tableFormatPanels.dotted')}>
                <svg width="18" height="6" aria-hidden="true">
                  <line x1="1" y1="3" x2="17" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={st === 'dashed' ? '4 3' : st === 'dotted' ? '0.1 3.5' : undefined} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[11px] leading-snug text-ink-subtle">{t('board.tableFormatPanels.pickColorThicknessStyleThen')}</p>
    </div>
  );
}

/* ------------------------------ Fonte e texto ------------------------------- */

export function TableFontPanel({ element }: { element: TableElement }) {
  const t = useT();
  const range = activeRange(element);
  const first = getCell(element, range.r0, range.c0);
  const size = first.fontSize ?? TABLE_FONT_SIZE;
  const toggles = [
    { key: 'bold' as const, label: t('board.tableFormatPanels.boldCtrlB'), icon: <Bold size={16} /> },
    { key: 'italic' as const, label: t('board.tableFormatPanels.italicCtrlI'), icon: <Italic size={16} /> },
    { key: 'underline' as const, label: t('board.tableFormatPanels.underlineCtrlU'), icon: <Underline size={16} /> },
    { key: 'strikethrough' as const, label: t('board.tableFormatPanels.strikethrough'), icon: <Strikethrough size={16} /> },
  ];
  return (
    <div className="w-[264px] p-3">
      <div className="flex gap-1">
        {toggles.map((t) => (
          <button key={t.key} type="button" className="od-tool h-8 w-8" data-active={rangeAll(element, t.key, range)} onClick={() => tableToggleStyle(element.id, t.key)} aria-label={t.label} title={t.label}>
            {t.icon}
          </button>
        ))}
      </div>
      <div className="mt-3 text-[11px] font-semibold text-ink-muted">{t('board.tableFormatPanels.size')}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" className="od-tool h-8 w-8 font-bold" onClick={() => tablePatchCells(element.id, { fontSize: Math.max(8, size - 1) === TABLE_FONT_SIZE ? undefined : Math.max(8, size - 1) })} aria-label={t('board.tableFormatPanels.smallerFont')}>
          −
        </button>
        <input
          className="od-input h-8 w-14 px-2 text-center tabular-nums"
          inputMode="numeric"
          value={size}
          aria-label={t('board.tableFormatPanels.fontSize')}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ''));
            if (n >= 6 && n <= 120) tablePatchCells(element.id, { fontSize: n === TABLE_FONT_SIZE ? undefined : n });
          }}
        />
        <button type="button" className="od-tool h-8 w-8 font-bold" onClick={() => tablePatchCells(element.id, { fontSize: Math.min(120, size + 1) })} aria-label={t('board.tableFormatPanels.largerFont')}>
          +
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {TABLE_FONT_SIZES.map((n) => (
          <button key={n} type="button" className={cn('od-btn od-btn-sm h-7 min-w-[34px] px-1.5 tabular-nums', n === size ? 'od-btn-soft' : 'od-btn-ghost')} onClick={() => tablePatchCells(element.id, { fontSize: n === TABLE_FONT_SIZE ? undefined : n })}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 text-[11px] font-semibold text-ink-muted">{t('board.tableFormatPanels.font')}</div>
      {/* Chat 08.2 · C-2: o mesmo seletor da gaveta Estilo do texto ("Padrão (Figtree)" no topo) */}
      <div className="mt-1 rounded-lg ring-1 ring-line">
        <FontPicker
          className="w-full"
          value={first.fontName ?? null}
          onPick={(name) => tablePatchCells(element.id, { fontName: name })}
          defaultOption={{ label: t('board.tableFormatPanels.defaultFigtree'), selected: !first.fontName, onPick: () => tablePatchCells(element.id, { fontName: undefined }) }}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Estilo da tabela ---------------------------- */

export function TableStylePanel({ element }: { element: TableElement }) {
  const t = useT();
  const current = element.tableStyle ?? 'sage';
  const toggles = [
    { label: t('board.tableFormatPanels.n1stRowAsHeader'), on: element.headerRow !== false, run: () => tableToggleHeader(element.id) },
    { label: t('board.tableFormatPanels.highlight1stColumn'), on: !!element.headerCol, run: () => tableToggleHeaderCol(element.id) },
    { label: t('board.tableFormatPanels.bandedRows'), on: !!element.banded, run: () => tableToggleBanded(element.id) },
  ];
  return (
    <div className="w-[268px] p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{t('board.tableFormatPanels.tableStyle')}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {TABLE_STYLES.map((st) => (
          <button
            key={st.id}
            type="button"
            className={cn('rounded-lg p-1.5 text-start ring-1 transition-colors', current === st.id ? 'bg-accent-soft ring-brand-300' : 'ring-line hover:bg-panel-hover')}
            onClick={() => tableSetStyle(element.id, st.id)}
            aria-pressed={current === st.id}
          >
            <span className="block overflow-hidden rounded-[4px] ring-1" style={{ ['--tw-ring-color' as string]: st.border }}>
              <span className="block h-2.5" style={{ background: st.header }} />
              {[0, 1, 2].map((i) => (
                <span key={i} className="block h-2" style={{ background: i % 2 === 1 ? st.band : '#fff', borderTop: `1px solid ${st.grid}` }} />
              ))}
            </span>
            <span className="mt-1 block truncate text-[11px] font-semibold text-ink">{st.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-0.5">
        {toggles.map((t) => (
          <button key={t.label} type="button" className="od-menu-item" onClick={t.run} role="switch" aria-checked={t.on}>
            <span className="flex-1 text-start">{t.label}</span>
            <span className={cn('h-4 w-7 rounded-full p-0.5 transition-colors', t.on ? 'bg-selection' : 'bg-panel-sunken ring-1 ring-line-strong')}>
              <span className={cn('block h-3 w-3 rounded-full bg-white transition-transform', t.on && 'translate-x-3')} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
