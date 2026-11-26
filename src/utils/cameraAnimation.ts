/**
 * LuDraw — Animação suave de câmera (interpolação com easeOutCubic).
 * Interpola o zoom em escala logarítmica para que a sensação de velocidade seja constante.
 */

import type { CameraState } from '../types/canvas';
import { easeOutCubic } from './math';

let frame: number | null = null;

export function cancelCameraAnimation(): void {
  if (frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}

export function isCameraAnimating(): boolean {
  return frame !== null;
}

export function animateCamera(
  from: CameraState,
  to: CameraState,
  apply: (camera: CameraState) => void,
  duration = 320,
): void {
  cancelCameraAnimation();
  if (duration <= 1) {
    apply(to);
    return;
  }
  const start = performance.now();
  const logFrom = Math.log(from.zoom);
  const logTo = Math.log(to.zoom);

  // Para manter o movimento estável, interpolamos o ponto de mundo no centro relativo.
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / duration);
    const e = easeOutCubic(p);
    const zoom = Math.exp(logFrom + (logTo - logFrom) * e);
    // Interpolação de x/y ponderada pelo zoom (evita "derrapagem" visual em zooms grandes)
    const k = from.zoom === to.zoom ? e : (zoom - from.zoom) / (to.zoom - from.zoom);
    const x = from.x + (to.x - from.x) * (Number.isFinite(k) ? k : e);
    const y = from.y + (to.y - from.y) * (Number.isFinite(k) ? k : e);
    apply({ x, y, zoom });
    if (p < 1) {
      frame = requestAnimationFrame(step);
    } else {
      frame = null;
      apply(to);
    }
  };
  frame = requestAnimationFrame(step);
}
