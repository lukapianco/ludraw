/** Foco está num campo de texto (atalhos de teclado não devem agir)? */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && !!el.closest('input, textarea, select, [contenteditable="true"]');
}
