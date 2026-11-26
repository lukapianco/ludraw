/**
 * LuDraw — gaveta do Estúdio v2 (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §1, §2). Mesma anatomia em todas: cabeçalho
 * (título + atalho) · conteúdo · rodapé com dica curta. Nasce do botão que a abriu: as da barra do topo 8 px abaixo,
 * centradas no botão; as da base 8 px acima do módulo, alinhadas à borda dele. Sempre dentro da tela
 * (`max-height: calc(100vh - 16px)` com rolagem interna). `Esc` fecha e devolve o foco; clique fora fecha.
 * "Reduzir movimento": só opacidade.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { useStudioUi, type DrawerId } from './studioUi';

export interface StudioDrawerProps {
  id: DrawerId;
  title: ReactNode;
  /** atalho mostrado no cabeçalho (ex.: "Ctrl F") */
  shortcut?: string;
  /** ações à direita no cabeçalho (ex.: "Tela inteira") */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  width: number;
  /** 'top' = abre abaixo (barra do topo, centrada no botão); 'bottom' = abre acima (módulos da base) */
  from: 'top' | 'bottom';
  /** na base: alinhar à borda esquerda ou direita do módulo */
  align?: 'center' | 'start' | 'end';
  children: ReactNode;
  className?: string;
}

const MARGIN = 8;

export function StudioDrawer({ id, title, shortcut, headerExtra, footer, width, from, align = 'center', children, className }: StudioDrawerProps) {
  const t = useT();
  const open = useStudioUi((s) => s.open === id);
  const anchor = useStudioUi((s) => s.anchor);
  const reduceMotion = useAppStore((s) => s.preferences.reduceMotion);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  // posição presa ao botão (e à borda do módulo, na base); refeita ao redimensionar a janela
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor?.closest<HTMLElement>('[data-studio-module]') ?? anchor;
      const btn = anchor?.getBoundingClientRect();
      const mod = a?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - MARGIN * 2);
      let left: number;
      if (!btn || !mod) left = (vw - w) / 2;
      else if (from === 'top' || align === 'center') left = btn.left + btn.width / 2 - w / 2;
      else if (align === 'start') left = mod.left;
      else left = mod.right - w;
      left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
      if (from === 'top') {
        const top = (mod?.bottom ?? 56) + MARGIN;
        setPos({ left, top, maxHeight: vh - top - MARGIN });
      } else {
        const bottom = vh - (mod?.top ?? vh - 64) + MARGIN;
        setPos({ left, bottom, maxHeight: vh - bottom - MARGIN });
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchor, width, from, align]);

  // Esc fecha e devolve o foco; clique fora fecha (menus, modais e o próprio botão não contam)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useAppStore.getState().modal) return;
      if (document.querySelector('[data-od-menu]')) return; // um menu aberto dentro da gaveta fecha primeiro
      e.stopPropagation();
      useStudioUi.getState().close(true);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest('[data-studio-trigger], [data-od-menu], [role="dialog"], [data-od-floating], [data-studio-keep]')) return;
      useStudioUi.getState().close(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  // o foco entra na gaveta (primeiro elemento focável) para o teclado continuar dali
  useEffect(() => {
    if (!open || !pos) return;
    const first = ref.current?.querySelector<HTMLElement>('input, button:not([disabled]), [tabindex]:not([tabindex="-1"]), select, textarea');
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!pos]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      data-studio-drawer={id}
      className={cn('od-pop fixed z-[60] flex flex-col overflow-hidden rounded-2xl', reduceMotion ? 'animate-fade-in' : 'animate-pop-in', className)}
      style={{ width: Math.min(width, window.innerWidth - MARGIN * 2), left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{title}</h2>
        {shortcut && <span className="od-kbd shrink-0">{shortcut}</span>}
        {headerExtra}
        <button type="button" className="od-tool h-7 w-7 shrink-0" onClick={() => useStudioUi.getState().close(true)} aria-label={t('common.close')}>
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="shrink-0 border-t border-line px-4 py-2 text-xs text-ink-subtle">{footer}</div>}
    </div>
  );
}

/** Botão que abre/fecha uma gaveta (aria-expanded, foco devolvido, `\` reabre a última). */
export function useDrawerTrigger(id: DrawerId) {
  const open = useStudioUi((s) => s.open === id);
  return {
    'data-studio-trigger': id,
    'aria-expanded': open,
    'aria-haspopup': 'dialog' as const,
    'data-active': open,
    onClick: (e: React.MouseEvent<HTMLElement>) => useStudioUi.getState().toggle(id, e.currentTarget),
  };
}
