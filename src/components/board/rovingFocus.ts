import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Navegação por setas dentro de uma barra (`role="toolbar"`): ← → (ou ↑ ↓) movem o foco
 * entre os botões, Home/End vão às pontas. Só age quando o foco está num botão da própria
 * barra, e interrompe a propagação para não acionar os atalhos do canvas (ex.: mover seleção).
 */
export function handleToolbarKeys(e: ReactKeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const bar = e.currentTarget;
  const items = Array.from(bar.querySelectorAll<HTMLElement>('button:not([disabled]), [role="button"]:not([aria-disabled="true"])')).filter(
    // Chat 08.2 · C-2: botões de uma gaveta aberta (Cinta) não entram no percurso das setas da barra
    (el) => el.offsetParent !== null && el.closest('[role="toolbar"]') === bar && !el.closest('[data-strip-drawer]'),
  );
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  e.preventDefault();
  e.stopPropagation();
  let next = index;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = items.length - 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
  else next = (index + 1) % items.length;
  items[next]?.focus();
}
