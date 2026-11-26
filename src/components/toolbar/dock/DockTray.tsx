/**
 * LuDraw — bandeja da Dock presa ao botão (Chat 08.2 · C-1, `STUDIO_V2_SPEC.md` §4). Substitui os flyouts.
 *
 * Como prende ao botão:
 *  - posição `fixed`, com a BASE 12 px acima do topo do botão e CENTRADA nele, presa às bordas da tela (12 px);
 *  - uma "língua" de 14 px (quadrado girado 45°, fundo do painel, borda nos dois lados de baixo) sempre aponta para o
 *    centro do botão — mesmo quando a bandeja encosta na borda (limitada a 18 px das pontas);
 *  - recalcula ao redimensionar a janela e quando o conteúdo muda de tamanho (ResizeObserver).
 * Anatomia única: cabeçalho (título + tecla) · conteúdo (rolagem interna) · rodapé (dica curta + ação opcional).
 * Teclado: o foco entra no primeiro item; `Esc` e clique fora fecham e devolvem o foco ao botão. "Reduzir movimento":
 * só opacidade.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { shortcutLabel } from '../../../utils/format';
import { cn } from '../../../utils/cn';
import { useT } from '../../../i18n/useT';
import { trayTrigger, useDockUi, type TrayId } from './dockUi';

const EDGE = 12;
const GAP = 12;
const TONGUE_MIN = 18;

interface DockTrayProps {
  id: TrayId;
  title: ReactNode;
  /** texto do título para leitores de tela (quando `title` tem enfeites) */
  label: string;
  shortcut?: string;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  footerAction?: ReactNode;
  width: number;
  /** foca este seletor ao abrir (padrão: primeiro botão/campo) */
  autoFocus?: string;
  children: ReactNode;
}

export function DockTray({ id, title, label, shortcut, headerExtra, footer, footerAction, width, autoFocus, children }: DockTrayProps) {
  const t = useT();
  const reduce = useAppStore((s) => s.preferences.reduceMotion);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ left: number; bottom: number; tongue: number; w: number } | null>(null);

  // presa ao botão (e às bordas da tela)
  useLayoutEffect(() => {
    const place = () => {
      const btn = trayTrigger(id)?.getBoundingClientRect();
      if (!btn) return;
      const w = Math.min(width, window.innerWidth - EDGE * 2);
      const center = btn.left + btn.width / 2;
      const left = Math.max(EDGE, Math.min(center - w / 2, window.innerWidth - w - EDGE));
      const tongue = Math.max(TONGUE_MIN, Math.min(center - left, w - TONGUE_MIN));
      setPos({ left, bottom: window.innerHeight - btn.top + GAP, tongue, w });
    };
    place();
    window.addEventListener('resize', place);
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', place);
      ro.disconnect();
    };
  }, [id, width]);

  // Esc / clique fora fecham e devolvem o foco ao botão
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useAppStore.getState().modal) return;
      e.stopPropagation();
      useDockUi.getState().close(true);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest('[data-dock-tray-trigger], [data-od-menu], [role="dialog"]:not([data-dock-tray])')) return;
      useDockUi.getState().close(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, []);

  // o foco entra na bandeja
  useEffect(() => {
    if (!pos) return;
    const first = ref.current?.querySelector<HTMLElement>(autoFocus ?? 'input, button:not([disabled]):not([aria-disabled="true"]), [tabindex="0"]');
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pos]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      data-dock-tray={id}
      data-od-floating
      className={cn('fixed z-[800]', !pos && 'invisible', reduce ? 'animate-fade-in' : 'origin-bottom animate-pop-in')}
      style={pos ? { left: pos.left, bottom: pos.bottom, width: pos.w } : { left: 0, bottom: 0, width }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="od-pop flex max-h-[calc(100vh-140px)] flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 px-3.5 pb-1.5 pt-3">
          <h4 id={titleId} className="text-[13px] font-bold text-ink" aria-label={label}>
            {title}
          </h4>
          {headerExtra}
          <span className="flex-1" />
          {shortcut && <span className="od-kbd">{shortcutLabel(shortcut)}</span>}
          <button type="button" className="od-tool -me-1.5 h-7 w-7" onClick={() => useDockUi.getState().close(true)} aria-label={t('common.close')}>
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {(footer || footerAction) && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3.5 py-2 text-[11.5px] text-ink-subtle">
            <span className="min-w-0">{footer}</span>
            {footerAction}
          </div>
        )}
      </div>
      {/* língua: aponta para o centro do botão */}
      <span
        aria-hidden="true"
        data-dock-tongue
        className="absolute -bottom-[7px] h-[14px] w-[14px] rotate-45 rounded-br-[3px] border-b border-r border-line bg-panel"
        style={{ left: (pos?.tongue ?? width / 2) - 7 }}
      />
    </div>
  );
}

/** Selo único "Em breve": item visível, desabilitado, com dica. */
export function ComingSoonBadge({ className }: { className?: string }) {
  const t = useT();
  return <span className={cn('max-w-full shrink-0 truncate whitespace-nowrap rounded-full bg-panel-sunken px-1.5 py-px text-2xs font-bold text-ink-subtle ring-1 ring-line', className)} title={t('studio.dock.comingSoonHint')}>{t('studio.dock.comingSoon')}</span>;
}

/** Selo "extensão" (seções e itens que vêm de extensões ativas). */
export function ExtensionBadge() {
  const t = useT();
  return <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-2xs font-extrabold text-[var(--od-selection)]">{t('studio.dock.extensionBadge')}</span>;
}

/** Rótulo de seção das bandejas (sem Fraunces). */
export function TrayCaption({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center gap-1.5 px-3.5 pb-1.5 pt-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle', className)}>{children}</div>;
}
