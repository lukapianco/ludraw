import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

/**
 * Popover em portal ancorado a um botão (Chat 04 — Timer e Votação da Régua). Abre abaixo do
 * botão, alinhado pela borda direita (`align="end"`) e preso à janela; fecha com Esc ou clique
 * fora (o próprio gatilho usa `data-od-menu-trigger`). Mesmo visual de `.od-pop`.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  width = 320,
  align = 'end',
  className,
  children,
  label,
}: {
  anchor: DOMRect;
  onClose: () => void;
  width?: number;
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: align === 'end' ? anchor.right - width : anchor.left, top: anchor.bottom + 8 });

  useLayoutEffect(() => {
    const el = ref.current;
    const h = el?.getBoundingClientRect().height ?? 0;
    const ideal = align === 'end' ? anchor.right - width : anchor.left;
    const left = Math.max(8, Math.min(ideal, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [anchor, width, align]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest('[data-od-menu-trigger]') || t.closest('[data-od-menu]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-od-popover
      className={cn('od-pop fixed z-[900] max-h-[calc(100vh-24px)] origin-top-right animate-pop-in overflow-y-auto', className)}
      style={{ left: pos.left, top: pos.top, width }}
    >
      {children}
    </div>,
    document.body,
  );
}
