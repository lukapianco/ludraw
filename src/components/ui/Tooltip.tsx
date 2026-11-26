import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { shortcutLabel } from '../../utils/format';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  label: ReactNode;
  shortcut?: string;
  side?: Side;
  /** Desativa (ex.: enquanto um menu do botão está aberto) */
  disabled?: boolean;
  children: ReactElement;
  delay?: number;
  /** classes extras do invólucro (ex.: `flex-1` dentro de um controle segmentado) */
  className?: string;
}

/**
 * Tooltip leve (sem dependências): aparece após `delay` ms com fade/scale suave.
 * Envolve o filho em um <span> inline-flex para medir a posição.
 */
export function Tooltip({ label, shortcut, side = 'bottom', disabled, children, delay = 420, className }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);
  useEffect(() => {
    if (disabled) {
      clear();
      setPos(null);
    }
  }, [disabled]);

  const show = () => {
    if (disabled) return;
    clear();
    timer.current = window.setTimeout(() => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const gap = 8;
      const p =
        side === 'right'
          ? { x: r.right + gap, y: r.top + r.height / 2 }
          : side === 'left'
            ? { x: r.left - gap, y: r.top + r.height / 2 }
            : side === 'top'
              ? { x: r.left + r.width / 2, y: r.top - gap }
              : { x: r.left + r.width / 2, y: r.bottom + gap };
      setPos(p);
    }, delay);
  };

  const hide = () => {
    clear();
    setPos(null);
  };

  const transform =
    side === 'right'
      ? 'translate(0, -50%)'
      : side === 'left'
        ? 'translate(-100%, -50%)'
        : side === 'top'
          ? 'translate(-50%, -100%)'
          : 'translate(-50%, 0)';

  return (
    <span ref={anchorRef} className={className ? `inline-flex ${className}` : 'inline-flex'} onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide}>
      {children}
      {pos &&
        createPortal(
          <div className="pointer-events-none fixed z-[1000]" style={{ left: pos.x, top: pos.y, transform }}>
            <div className="od-tooltip flex animate-pop-in items-center gap-2">
              <span>{label}</span>
              {shortcut && <span className="font-medium opacity-60">{shortcutLabel(shortcut)}</span>}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
