import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bold, ChevronDown, Italic, Minus, Plus, RotateCcw } from 'lucide-react';
import type { ConnectorElement, ConnectorLabelStyle } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { FILL_COLORS, INK_COLORS } from '../../utils/factory';
import { fontCss } from '../../utils/text';
import { FontPicker } from '../strip/FontPicker';
import {
  LABEL_DEFAULT_BORDER,
  LABEL_DEFAULT_FONT_NAME,
  LABEL_DEFAULT_RADIUS,
  LABEL_FONT_SIZE,
  LABEL_FONT_SIZES,
  LABEL_MAX_FONT,
  LABEL_MIN_FONT,
  resolveLabelStyle,
} from '../../utils/connectors';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

const board = () => useBoardStore.getState();

/** Grava o estilo do rótulo nas linhas (sem chaves vazias; estilo todo padrão = campo ausente). */
function applyStyle(connectors: ConnectorElement[], patch: Partial<ConnectorLabelStyle> | null, history = true) {
  const list = connectors.filter((c) => !c.locked);
  if (!list.length) return;
  if (history) board().pushHistory();
  board().updateElements(
    list.map((c) => {
      if (!patch) return { id: c.id, patch: { labelStyle: undefined } };
      const next: ConnectorLabelStyle = { ...(c.labelStyle ?? {}), ...patch };
      (Object.keys(next) as (keyof ConnectorLabelStyle)[]).forEach((k) => next[k] === undefined && delete next[k]);
      return { id: c.id, patch: { labelStyle: Object.keys(next).length ? next : undefined } };
    }),
  );
}

/**
 * Painel "Texto da linha" (Chat 03): tamanho, fonte, negrito/itálico, cor do texto, fundo (ou
 * sem fundo), borda (espessura e cor) e cantos do rótulo. Os valores mostrados são os da 1ª
 * linha; a mudança vale para todas as linhas selecionadas. Sliders gravam um passo de desfazer
 * ao começar o arrasto.
 */
export function ConnectorLabelPanel({ connectors }: { connectors: ConnectorElement[] }) {
  const t = useT();
  const c = connectors[0];
  const st = resolveLabelStyle(c.labelStyle);
  const raw = c.labelStyle ?? {};
  const [fontsOpen, setFontsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(520);
  // Altura máxima = espaço livre na tela no lado em que o popover abriu (nunca corta o painel)
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = !!el.closest('[data-pop="up"]');
    const room = up ? r.bottom - 12 : window.innerHeight - r.top - 12;
    setMaxH(Math.max(200, Math.min(520, Math.floor(room))));
  }, []);
  const set = (patch: Partial<ConnectorLabelStyle>, history = true) => applyStyle(connectors, patch, history);
  const setSize = (n: number) => {
    const v = Math.max(LABEL_MIN_FONT, Math.min(LABEL_MAX_FONT, Math.round(n)));
    set({ fontSize: v === LABEL_FONT_SIZE ? undefined : v });
  };
  const stepSize = (dir: 1 | -1) => {
    const cur = st.fontSize;
    const next = dir > 0 ? LABEL_FONT_SIZES.find((s) => s > cur) ?? cur + 8 : [...LABEL_FONT_SIZES].reverse().find((s) => s < cur) ?? cur - 2;
    setSize(next);
  };

  return (
    <div ref={panelRef} className="flex w-[296px] flex-col gap-2.5 overflow-y-auto p-3" style={{ maxHeight: maxH }}>
      {/* Fonte */}
      <div>
        <button type="button" className="od-menu-item justify-between rounded-lg ring-1 ring-line" onClick={() => setFontsOpen((o) => !o)} aria-expanded={fontsOpen}>
          <span className="truncate text-[14px]" style={{ fontFamily: fontCss(st.fontName) }}>
            {st.fontName}
          </span>
          <ChevronDown size={15} className={cn('shrink-0 text-ink-subtle transition-transform duration-fast', fontsOpen && 'rotate-180')} />
        </button>
        {fontsOpen && (
          // Chat 08.2 · C-2: o mesmo seletor da gaveta Estilo do texto (busca, grupos, recentes, prévia só do visível)
          <div className="mt-1 rounded-lg ring-1 ring-line">
            <FontPicker
              className="w-full"
              value={st.fontName}
              onPick={(name) => {
                set({ fontName: name === LABEL_DEFAULT_FONT_NAME ? undefined : name });
                setFontsOpen(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Tamanho + negrito/itálico */}
      <div className="flex items-center gap-1">
        <Tooltip label={t('board.connectorLabelControls.smallerText')} side="top">
          <button type="button" className="od-tool h-8 w-8" onClick={() => stepSize(-1)} disabled={st.fontSize <= LABEL_MIN_FONT} aria-label={t('board.connectorLabelControls.smallerText')}>
            <Minus size={15} />
          </button>
        </Tooltip>
        <input
          type="number"
          min={LABEL_MIN_FONT}
          max={LABEL_MAX_FONT}
          value={st.fontSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= LABEL_MIN_FONT) setSize(n);
          }}
          className="od-input h-8 w-14 px-1 text-center text-[13px] tabular-nums"
          aria-label={t('board.connectorLabelControls.textSize')}
        />
        <Tooltip label={t('board.connectorLabelControls.largerText')} side="top">
          <button type="button" className="od-tool h-8 w-8" onClick={() => stepSize(1)} disabled={st.fontSize >= LABEL_MAX_FONT} aria-label={t('board.connectorLabelControls.largerText')}>
            <Plus size={15} />
          </button>
        </Tooltip>
        <span className="od-divider-v" />
        <Tooltip label={t('common.bold')} side="top">
          <button
            type="button"
            className="od-tool h-8 w-8"
            data-active={st.fontWeight === 700}
            aria-pressed={st.fontWeight === 700}
            onClick={() => set({ fontWeight: st.fontWeight === 700 ? 'normal' : 'bold' })}
            aria-label={t('common.bold')}
          >
            <Bold size={15} />
          </button>
        </Tooltip>
        <Tooltip label={t('common.italic')} side="top">
          <button type="button" className="od-tool h-8 w-8" data-active={st.italic} aria-pressed={st.italic} onClick={() => set({ fontStyle: st.italic ? undefined : 'italic' })} aria-label={t('common.italic')}>
            <Italic size={15} />
          </button>
        </Tooltip>
      </div>

      <Section title={t('common.textColor')}>
        <Chip active={!raw.textColor} onClick={() => set({ textColor: undefined })}>{t('board.connectorLabelControls.automatic')}</Chip>
        <CustomColor palette={INK_COLORS} value={raw.textColor} onPick={(col) => set({ textColor: col })} label={t('board.connectorLabelControls.customTextColor')} />
        <Swatches colors={INK_COLORS} value={raw.textColor} onPick={(col) => set({ textColor: col })} />
      </Section>

      <Section title={t('board.connectorLabelControls.background')}>
        <Chip active={!raw.fillColor} onClick={() => set({ fillColor: undefined })}>{t('board.connectorLabelControls.default')}</Chip>
        <Chip active={raw.fillColor === 'transparent'} onClick={() => set({ fillColor: 'transparent' })}>{t('board.connectorLabelControls.noBackground')}</Chip>
        <CustomColor palette={FILL_COLORS} value={raw.fillColor} onPick={(col) => set({ fillColor: col })} label={t('board.connectorLabelControls.customBackground')} />
        <Swatches colors={FILL_COLORS.filter((x) => x !== 'transparent')} value={raw.fillColor} onPick={(col) => set({ fillColor: col })} />
      </Section>

      <Section title={t('board.connectorLabelControls.border')}>
        <Slider
          label={t('board.connectorLabelControls.borderThickness')}
          min={0}
          max={8}
          step={0.5}
          value={st.borderWidth}
          format={(v) => (v === 0 ? 'sem' : `${v}`)}
          onChange={(v, history) => set({ borderWidth: v === LABEL_DEFAULT_BORDER ? undefined : v }, history)}
        />
        <Chip active={!raw.borderColor} onClick={() => set({ borderColor: undefined })} disabled={st.borderWidth === 0}>{t('board.connectorLabelControls.lineColor')}</Chip>
        <CustomColor palette={INK_COLORS} value={raw.borderColor} onPick={(col) => set({ borderColor: col })} disabled={st.borderWidth === 0} label={t('board.connectorLabelControls.customBorderColor')} />
        <Swatches colors={INK_COLORS} value={raw.borderColor} onPick={(col) => set({ borderColor: col })} disabled={st.borderWidth === 0} />
      </Section>

      <Section title={t('board.connectorLabelControls.corners')}>
        <Slider
          label={t('board.connectorLabelControls.cornerRadius')}
          min={0}
          max={32}
          step={1}
          value={Math.min(32, st.borderRadius)}
          format={(v) => (st.borderRadius >= 999 ? t('board.connectorLabelControls.pill') : `${v}`)}
          onChange={(v, history) => set({ borderRadius: v === LABEL_DEFAULT_RADIUS ? undefined : v }, history)}
        />
        <Chip active={st.borderRadius === 0} onClick={() => set({ borderRadius: 0 })}>{t('board.connectorLabelControls.square')}</Chip>
        <Chip active={st.borderRadius === 6} onClick={() => set({ borderRadius: 6 })}>{t('board.connectorLabelControls.soft')}</Chip>
        <Chip active={st.borderRadius >= 999} onClick={() => set({ borderRadius: 999 })}>{t('board.connectorLabelControls.pill2')}</Chip>
      </Section>

      <div className="h-px bg-line" />
      <button type="button" className="od-menu-item" disabled={!connectors.some((x) => x.labelStyle)} onClick={() => applyStyle(connectors, null)}>
        <RotateCcw size={15} />{' '}{t('board.connectorLabelControls.restoreDefaultStyle')}</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-ink-muted">{title}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 rounded-full px-2.5 text-[12px] font-medium ring-1 transition-colors duration-fast disabled:opacity-40',
        active ? 'bg-accent-soft text-ink ring-selection' : 'text-ink-muted ring-line hover:bg-panel-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Swatches({ colors, value, onPick, disabled }: { colors: string[]; value?: string; onPick: (c: string) => void; disabled?: boolean }) {
  const current = value?.toLowerCase();
  return (
    <div className={cn('mt-0.5 grid w-full grid-cols-12 gap-1', disabled && 'pointer-events-none opacity-40')}>
      {colors.map((col) => (
        <button
          key={col}
          type="button"
          title={col}
          aria-label={col}
          onClick={() => onPick(col)}
          className={cn(
            'h-5 w-5 rounded-full ring-1 ring-black/10 transition-transform duration-base ease-spring hover:scale-110 dark:ring-white/15',
            current === col.toLowerCase() && 'ring-2 ring-selection ring-offset-1 ring-offset-[var(--od-panel)]',
          )}
          style={{ background: col }}
        />
      ))}
    </div>
  );
}

/** Botão "+" com o seletor de cor do sistema (cor personalizada). */
function CustomColor({ palette, value, onPick, disabled, label }: { palette: string[]; value?: string; onPick: (c: string) => void; disabled?: boolean; label: string }) {
  const current = value?.toLowerCase();
  const custom = !!current && /^#[0-9a-f]{6}$/.test(current) && !palette.some((p) => p.toLowerCase() === current);
  return (
    <label
      className={cn('relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-ink-muted ring-1 ring-line-strong', disabled && 'pointer-events-none opacity-40')}
      data-allow-focus
      title={label}
      style={custom ? { background: current, color: 'transparent' } : undefined}
    >
      <Plus size={13} />
      <input type="color" className="sr-only" aria-label={label} value={custom ? current : '#1c1c1e'} onChange={(e) => onPick(e.target.value)} />
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number, history: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="flex-1 accent-[var(--od-selection)]"
        onPointerDown={() => board().pushHistory()}
        // solta o foco ao terminar o arrasto: Ctrl+Z volta a desfazer no board
        onPointerUp={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => e.key.startsWith('Arrow') && board().pushHistory()}
        onChange={(e) => onChange(Number(e.target.value), false)}
        aria-label={label}
      />
      <span className="w-10 text-end text-xs tabular-nums text-ink-muted">{format(value)}</span>
    </div>
  );
}
