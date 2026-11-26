/**
 * LuDraw — peças da Cinta do objeto (Chat 08.2 · C-2, `STUDIO_V2_SPEC.md` §16.2): botão (ícone) ou CHIP de valor que
 * abre uma gaveta `.od-pop` logo abaixo da Cinta (ou acima, quando a Cinta está na metade de baixo — `data-pop="up"` no
 * contêiner `group/ctx`), com a mesma anatomia das gavetas dos módulos: cabeçalho (título + tecla) · conteúdo · rodapé.
 * `Esc` fecha e devolve o foco ao botão que abriu. Usado pela Cinta e pelos controles por tipo (conector, frame…).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { shortcutLabel } from '../../utils/format';
import { Tooltip } from '../ui/Tooltip';

/** Classes da gaveta: abaixo da Cinta por padrão; acima quando `data-pop="up"`. */
export const STRIP_DRAWER_POSITION = 'top-[calc(100%+10px)] group-data-[pop=up]/ctx:top-auto group-data-[pop=up]/ctx:bottom-[calc(100%+10px)]';

interface StripPopProps {
  id: string;
  open: string | null;
  onToggle: (id: string) => void;
  /** dica e `aria-label` do botão */
  label: string;
  /** título da gaveta (padrão: `label`) */
  title?: string;
  shortcut?: string;
  /** 'tool' = botão de ícone 36 px · 'chip' = chip de valor 34 px com fundo afundado · 'identity' = segmento de identidade */
  variant?: 'tool' | 'chip' | 'identity';
  /** nome curto do chip (some abaixo de 900 px — fica só o valor) */
  name?: string;
  trigger: ReactNode;
  footer?: ReactNode;
  /** texto curto à direita do título da gaveta (ex.: "Ctrl B · I · U") */
  hint?: string;
  disabled?: boolean;
  /** motivo (do `explain()`) quando desabilitado */
  reason?: string;
  /** alinhamento horizontal da gaveta em relação ao botão */
  align?: 'center' | 'start' | 'end';
  testId?: string;
  children: ReactNode;
}

export function StripPop({ id, open, onToggle, label, title, shortcut, hint, variant = 'tool', name, trigger, footer, disabled, reason, align = 'center', testId, children }: StripPopProps) {
  const isOpen = open === id;
  const btn = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  // altura máxima = espaço livre real: abaixo da barra do topo (gaveta para cima) ou acima da borda de baixo
  const [maxH, setMaxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!isOpen) return setMaxH(null);
    const fit = () => {
      const b = btn.current?.getBoundingClientRect();
      const d = drawer.current?.getBoundingClientRect();
      if (!b || !d) return;
      const up = d.top < b.top;
      const bar = document.querySelector('[data-testid=studio-bar]')?.getBoundingClientRect();
      const safeTop = (bar ? bar.bottom : 0) + 8;
      const avail = up ? b.top - 10 - safeTop - 8 : window.innerHeight - b.bottom - 10 - 12;
      setMaxH(Math.max(160, Math.min(520, Math.floor(avail))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // a gaveta fecha primeiro (sem limpar a seleção nem fechar outras camadas no mesmo Esc)
      e.stopImmediatePropagation();
      onToggle(id);
      btn.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, id, onToggle]);

  const button = (
    <button
      ref={btn}
      type="button"
      data-strip-control={id}
      data-testid={testId}
      className={cn(
        variant === 'identity'
          ? 'flex h-[34px] min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 rounded-[10px] bg-accent-soft px-2.5 text-[13px] font-bold text-[var(--od-accent)] transition-[filter] duration-base hover:brightness-95 data-[active=true]:ring-2 data-[active=true]:ring-[var(--od-selection)]'
          : variant === 'chip'
          ? 'flex h-[34px] max-w-[190px] shrink-0 items-center gap-1.5 rounded-[10px] bg-panel-sunken px-2 text-[12.5px] font-semibold text-ink transition-colors duration-base hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:ring-2 data-[active=true]:ring-[var(--od-selection)]'
          : 'od-tool shrink-0',
      )}
      data-active={isOpen}
      disabled={disabled}
      onClick={() => onToggle(id)}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      title={variant !== 'tool' ? label : undefined}
    >
      {variant === 'chip' && name && <span className="shrink-0 text-ink-subtle max-[899px]:hidden">{name}</span>}
      {trigger}
    </button>
  );
  return (
    <div className="relative shrink-0">
      <Tooltip label={disabled && reason ? reason : label} shortcut={shortcut} side="top" disabled={isOpen}>
        {button}
      </Tooltip>
      {isOpen && (
        <div
          role="dialog"
          aria-label={title ?? label}
          data-strip-drawer={id}
          ref={drawer}
          style={maxH ? { maxHeight: maxH } : undefined}
          className={cn(
            'od-pop absolute z-10 flex max-h-[min(520px,calc(100vh-120px))] animate-pop-in flex-col overflow-hidden [.od-reduce-motion_&]:animate-fade-in',
            STRIP_DRAWER_POSITION,
            align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'start' ? 'start-0' : 'end-0',
          )}
        >
          <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2.5">
            <span className="text-[12.5px] font-bold text-ink">{title ?? label}</span>
            <span className="flex-1" />
            {hint ? <span className="text-[11px] font-semibold text-ink-subtle">{hint}</span> : shortcut && <span className="od-kbd">{shortcutLabel(shortcut)}</span>}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
          {footer && <div className="shrink-0 border-t border-line px-3.5 py-2 text-[11.5px] text-ink-subtle">{footer}</div>}
        </div>
      )}
    </div>
  );
}
