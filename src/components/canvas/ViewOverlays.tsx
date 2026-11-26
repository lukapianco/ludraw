import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { cancelCameraAnimation } from '../../utils/cameraAnimation';
import { expandRect, getBoundsOfElements, getBoundsOfRects, getViewportWorldRect, worldRectToScreen } from '../../utils/math';
import { useT } from '../../i18n/useT';

/**
 * Barras de rolagem opcionais (Visualizar → Barra de rolagem). Arrastáveis: movem a câmera.
 * O "documento" rolável é a união do conteúdo com a viewport atual + margem.
 */
export function Scrollbars() {
  const camera = useBoardStore((s) => s.camera);
  const viewport = useBoardStore((s) => s.viewport);
  const elements = useBoardStore((s) => s.elements);
  const drag = useRef<{ axis: 'x' | 'y'; start: number; camStart: number; ratio: number } | null>(null);

  const view = getViewportWorldRect(camera, viewport);
  const content = getBoundsOfElements(Object.values(elements));
  const docRect = expandRect(getBoundsOfRects(content ? [content, view] : [view]) ?? view, 400);

  const trackW = viewport.width - 24;
  const trackH = viewport.height - 24;
  const thumbW = Math.max(40, (view.width / docRect.width) * trackW);
  const thumbH = Math.max(40, (view.height / docRect.height) * trackH);
  const thumbX = ((view.x - docRect.x) / docRect.width) * trackW;
  const thumbY = ((view.y - docRect.y) / docRect.height) * trackH;

  const onDown = (axis: 'x' | 'y') => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    cancelCameraAnimation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      axis,
      start: axis === 'x' ? e.clientX : e.clientY,
      camStart: axis === 'x' ? camera.x : camera.y,
      ratio: axis === 'x' ? (docRect.width / trackW) * camera.zoom : (docRect.height / trackH) * camera.zoom,
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = (d.axis === 'x' ? e.clientX : e.clientY) - d.start;
    useBoardStore.getState().setCamera(d.axis === 'x' ? { x: d.camStart - delta * d.ratio } : { y: d.camStart - delta * d.ratio });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <>
      <div className="pointer-events-none absolute bottom-1 left-3 right-3 h-2" data-od-floating>
        <div
          className="pointer-events-auto absolute top-0 h-2 rounded-full bg-[rgba(25,45,32,0.28)] transition-colors hover:bg-[rgba(25,45,32,0.45)] dark:bg-[rgba(236,238,233,0.25)] dark:hover:bg-[rgba(236,238,233,0.4)]"
          style={{ left: thumbX, width: thumbW, touchAction: 'none' }}
          onPointerDown={onDown('x')}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-1 top-3 w-2" data-od-floating>
        <div
          className="pointer-events-auto absolute left-0 w-2 rounded-full bg-[rgba(25,45,32,0.28)] transition-colors hover:bg-[rgba(25,45,32,0.45)] dark:bg-[rgba(236,238,233,0.25)] dark:hover:bg-[rgba(236,238,233,0.4)]"
          style={{ top: thumbY, height: thumbH, touchAction: 'none' }}
          onPointerDown={onDown('y')}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      </div>
    </>
  );
}

/** Visualizar → Dimensões do projeto: contorno tracejado com a largura × altura total do conteúdo. */
export function BoardDimensionsOverlay() {
  const t = useT();
  const camera = useBoardStore((s) => s.camera);
  const elements = useBoardStore((s) => s.elements);
  const content = getBoundsOfElements(Object.values(elements));
  if (!content) return null;
  const r = worldRectToScreen(content, camera);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute rounded-sm border border-dashed border-selection" style={{ left: r.x - 8, top: r.y - 8, width: r.width + 16, height: r.height + 16 }}>
        <span className="absolute -top-6 left-0 rounded-md bg-panel px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-muted shadow-panel">
          {t('board.viewOverlays.roundRound2Px', { round: Math.round(content.width), round2: Math.round(content.height) })}</span>
      </div>
    </div>
  );
}

/** Dica exibida no board vazio (some suavemente ao criar o primeiro objeto). */
export function EmptyBoardHint() {
  const t = useT();
  const isEmpty = useBoardStore((s) => s.elementOrder.length === 0);
  const readOnly = useBoardStore((s) => s.readOnly);
  const name = useAppStore((s) => s.user?.name?.split(' ')[0]);
  if (!isEmpty || readOnly) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="animate-fade-in text-center">
        <p className="font-display text-2xl text-ink-muted">{name ? t('board.viewOverlays.allSetName', { name }) : t('board.viewOverlays.allSet')}</p>
        <p className="mt-2 text-base text-ink-subtle">{t('board.viewOverlays.doubleClickCreateStickyNote')}</p>
      </div>
    </div>
  );
}
