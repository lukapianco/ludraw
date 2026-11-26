/**
 * LuDraw — janela flutuante dos painéis de extensão (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.5; substitui a aba
 * Extensões do Painel). Cartão `.od-pop` arrastável de 340 px com o mesmo iframe isolado (`ExtensionPanelFrame`, que
 * mantém o rodapé "Isolado: …"). Abre pela API (`ludraw.ui.showPanel`, que não mudou), pelo "Mais" → Extensões ou
 * pelo `Ctrl K`. Sempre dentro da tela (também ao redimensionar a janela); `Esc` fecha quando o foco está nela; o
 * cabeçalho move com as setas (Shift = passo maior).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { PanelRegistry, useRegistry } from '../../extensions/registries';
import { useExtensionRuntimeStore } from '../../store/useExtensionRuntimeStore';
import { useT } from '../../i18n/useT';
import { ExtensionPanelFrame } from '../extensions/ExtensionPanelFrame';

const WIDTH = 340;
const MARGIN = 8;

const clamp = (p: { x: number; y: number }, h: number) => ({
  x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN)),
  y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, window.innerHeight - Math.min(h, window.innerHeight - MARGIN * 2) - MARGIN)),
});

export function ExtensionPanelWindow() {
  const t = useT();
  const panels = useRegistry(PanelRegistry);
  const open = useExtensionRuntimeStore((s) => s.openPanel);
  const panel = panels.find((p) => p.id === open);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => ({ x: (typeof window !== 'undefined' ? window.innerWidth : 1200) - WIDTH - 24, y: 72 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const close = () => useExtensionRuntimeStore.getState().setOpenPanel(null);

  // sempre dentro da tela
  useLayoutEffect(() => {
    if (!panel) return;
    const fit = () => setPos((p) => clamp(p, ref.current?.offsetHeight ?? 400));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.contains(document.activeElement)) {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [panel]);

  if (!panel) return null;
  const height = ref.current?.offsetHeight ?? 400;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={panel.label}
      data-od-floating
      data-extension-window={panel.id}
      className="od-pop fixed z-[55] flex max-h-[calc(100vh-16px)] flex-col overflow-hidden rounded-2xl"
      style={{ width: Math.min(WIDTH, window.innerWidth - MARGIN * 2), left: pos.x, top: pos.y }}
    >
      <div
        tabIndex={0}
        role="button"
        aria-label={t('studio.extension.move', { name: panel.label })}
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-line px-3 py-2 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--od-selection)]"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* ponteiro já liberado: arrasta sem a captura */
          }
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        onPointerMove={(e) => drag.current && setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, height))}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 40 : 10;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (!d) return;
          e.preventDefault();
          setPos((p) => clamp({ x: p.x + d[0], y: p.y + d[1] }, height));
        }}
      >
        <GripHorizontal size={15} className="shrink-0 text-ink-subtle" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{panel.label}</span>
        <button type="button" className="od-tool h-7 w-7 shrink-0" onClick={close} aria-label={t('common.close')}>
          <X size={15} />
        </button>
      </div>
      <div className="min-h-[200px] flex-1 overflow-hidden">
        <ExtensionPanelFrame key={panel.id} panelKey={panel.id} />
      </div>
    </div>
  );
}
