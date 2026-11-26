import { useEffect, useRef } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { CANVAS_COLORS, isTransparent } from '../../utils/color';
import { cancelCameraAnimation } from '../../utils/cameraAnimation';
import { expandRect, getBoundsOfRects, getElementBounds, getViewportWorldRect, type Rect } from '../../utils/math';
import type { CanvasElement } from '../../types/canvas';
import { computeRoute } from '../../utils/connectors';


import { useT } from '../../i18n/useT';

const W = 216;
const H = 136;

function elementColor(el: CanvasElement, theme: 'light' | 'dark'): string {
  switch (el.type) {
    case 'sticky':
      return el.color;
    case 'shape':
      return isTransparent(el.fillColor) ? el.strokeColor : el.fillColor;
    case 'text':
      return theme === 'dark' ? '#8a918b' : '#5b605c';
    case 'freehand':
      return el.strokeColor;
    default:
      return theme === 'dark' ? '#45454f' : '#b9bfc8';
  }
}

/**
 * Minimapa interativo: mostra todos os objetos e o retângulo da câmera.
 * Clicar ou arrastar dentro dele move a câmera em tempo real. Vive dentro da Bússola.
 */
export function Minimap() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<{ world: Rect; scale: number; ox: number; oy: number } | null>(null);
  const dragging = useRef(false);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = 0;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const state = useBoardStore.getState();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== W * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const palette = CANVAS_COLORS[theme];
      ctx.fillStyle = state.backgroundColor ?? palette.background;
      ctx.fillRect(0, 0, W, H);

      const view = getViewportWorldRect(state.camera, state.viewport);
      const rects = state.elementOrder.map((id) => state.elements[id]).filter(Boolean).map(getElementBounds);
      // Mantém o mapa enquadrado também quando o conteúdo está fora da viewport
      // Durante o arrasto o enquadramento fica congelado (evita o mapa "fugir" do cursor)
      const world = dragging.current && mapRef.current ? mapRef.current.world : expandRect(getBoundsOfRects([...rects, view]) ?? view, 200);
      const scale = Math.min(W / world.width, H / world.height);
      const ox = (W - world.width * scale) / 2;
      const oy = (H - world.height * scale) / 2;
      mapRef.current = { world, scale, ox, oy };

      for (const id of state.elementOrder) {
        const el = state.elements[id];
        if (!el) continue;
        if (el.type === 'connector') {
          const route = computeRoute(el, (x) => state.elements[x]);
          ctx.strokeStyle = theme === 'dark' ? '#8a918b' : '#5b605c';
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1;
          ctx.beginPath();
          route.points.forEach((p, i) => {
            const mx = ox + (p.x - world.x) * scale;
            const my = oy + (p.y - world.y) * scale;
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
          });
          ctx.stroke();
          continue;
        }
        const b = getElementBounds(el);
        ctx.fillStyle = elementColor(el, theme);
        ctx.globalAlpha = el.type === 'text' ? 0.6 : 0.95;
        ctx.fillRect(ox + (b.x - world.x) * scale, oy + (b.y - world.y) * scale, Math.max(1.5, b.width * scale), Math.max(1.5, b.height * scale));
      }
      ctx.globalAlpha = 1;

      const vx = ox + (view.x - world.x) * scale;
      const vy = oy + (view.y - world.y) * scale;
      const vw = view.width * scale;
      const vh = view.height * scale;
      const selection = theme === 'dark' ? '#9FD08A' : '#1F7A4C';
      ctx.fillStyle = theme === 'dark' ? 'rgba(159,208,138,0.10)' : 'rgba(31,122,76,0.08)';
      ctx.fillRect(vx, vy, vw, vh);
      ctx.strokeStyle = selection;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx + 0.75, vy + 0.75, Math.max(2, vw - 1.5), Math.max(2, vh - 1.5));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    draw();
    const unsub = useBoardStore.subscribe((s, prev) => {
      if (s.camera !== prev.camera || s.elements !== prev.elements || s.elementOrder !== prev.elementOrder || s.viewport !== prev.viewport || s.backgroundColor !== prev.backgroundColor) {
        schedule();
      }
    });
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [theme]);

  const moveCameraTo = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;
    const r = canvas.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    const wx = map.world.x + (mx - map.ox) / map.scale;
    const wy = map.world.y + (my - map.oy) / map.scale;
    const { viewport, camera, setCamera } = useBoardStore.getState();
    cancelCameraAnimation();
    setCamera({ x: viewport.width / 2 - wx * camera.zoom, y: viewport.height / 2 - wy * camera.zoom });
  };

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-line" data-od-floating>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: W, height: H, display: 'block', borderRadius: 8, cursor: 'pointer', touchAction: 'none' }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveCameraTo(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging.current) moveCameraTo(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        aria-label={t('board.minimap.boardMinimap')}
      />
    </div>
  );
}
