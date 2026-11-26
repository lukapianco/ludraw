import { useEffect, useRef } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { CANVAS_COLORS, gridColorsFor } from '../../utils/color';

/**
 * Fundo infinito do board em Canvas 2D (pontos ou linhas).
 * Densidade adaptativa: dois níveis de grade (menor/maior, fator 5) com
 * fade suave do nível menor conforme o zoom — nunca fica "poluído" nem vazio.
 */
export function InfiniteGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camera = useBoardStore((s) => s.camera);
  const viewport = useBoardStore((s) => s.viewport);
  const grid = useBoardStore((s) => s.gridSettings);
  const customBg = useBoardStore((s) => s.backgroundColor);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = viewport.width;
    const h = viewport.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = CANVAS_COLORS[theme];
    const bg = customBg ?? palette.background;
    const colors = customBg ? gridColorsFor(customBg) : { dot: palette.dot, dotMajor: palette.dotMajor };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (!grid.enabled) return;

    // Escolhe o passo de mundo para que o espaçamento em tela fique entre ~10 e ~50px
    const zoom = camera.zoom;
    let step = grid.size;
    while (step * zoom < 10) step *= 5;
    while (step * zoom > 50 && step / 5 >= grid.size) step /= 5;
    const screenStep = step * zoom;
    const major = step * 5;
    const minorAlpha = Math.max(0, Math.min(1, (screenStep - 10) / 14));

    const startX = Math.floor(-camera.x / zoom / step) * step;
    const startY = Math.floor(-camera.y / zoom / step) * step;
    const endX = (w - camera.x) / zoom;
    const endY = (h - camera.y) / zoom;
    const isMajor = (v: number) => Math.abs(v / major - Math.round(v / major)) < 1e-6;

    if (grid.style === 'dots') {
      const rMinor = screenStep > 30 ? 1.25 : 1;
      const rMajor = 1.5;
      for (let wx = startX; wx <= endX; wx += step) {
        const sx = wx * zoom + camera.x;
        const mx = isMajor(wx);
        for (let wy = startY; wy <= endY; wy += step) {
          const sy = wy * zoom + camera.y;
          const majorPoint = mx && isMajor(wy);
          if (majorPoint) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = colors.dotMajor;
            ctx.beginPath();
            ctx.arc(sx, sy, rMajor, 0, Math.PI * 2);
            ctx.fill();
          } else if (minorAlpha > 0.02) {
            ctx.globalAlpha = minorAlpha;
            ctx.fillStyle = colors.dot;
            ctx.fillRect(sx - rMinor, sy - rMinor, rMinor * 2, rMinor * 2);
          }
        }
      }
    } else {
      ctx.lineWidth = 1;
      for (let wx = startX; wx <= endX; wx += step) {
        const sx = Math.round(wx * zoom + camera.x) + 0.5;
        const m = isMajor(wx);
        ctx.globalAlpha = m ? 1 : minorAlpha * 0.9;
        ctx.strokeStyle = m ? colors.dotMajor : colors.dot;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      for (let wy = startY; wy <= endY; wy += step) {
        const sy = Math.round(wy * zoom + camera.y) + 0.5;
        const m = isMajor(wy);
        ctx.globalAlpha = m ? 1 : minorAlpha * 0.9;
        ctx.strokeStyle = m ? colors.dotMajor : colors.dot;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [camera, viewport, grid, customBg, theme]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}
