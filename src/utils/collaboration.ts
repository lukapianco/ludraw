/**
 * LuDraw — utilitários puros da presença ao vivo (Chat 08): tempos, envio com limite de frequência e a
 * conversão entre a câmera local e a "visão" que viaja pela rede (centro em coordenadas do board + zoom,
 * que não depende do tamanho da janela de cada pessoa).
 */
import type { CameraState } from '../types/canvas';
import { screenToWorld, type Point, type Size } from './math';

/** O cursor de quem está parado some depois disto (DESIGN_SYSTEM §7 · Colaboração ao vivo). */
export const CURSOR_IDLE_MS = 6000;
/** Quantos objetos selecionados por pessoa aparecem com contorno (o resto só conta). */
export const MAX_REMOTE_SELECTION = 40;

export interface RemoteView {
  x: number;
  y: number;
  zoom: number;
}

export function cameraToView(camera: CameraState, viewport: Size): RemoteView {
  const c = screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera);
  return { x: c.x, y: c.y, zoom: camera.zoom };
}

export function viewToCamera(view: RemoteView, viewport: Size): CameraState {
  return { x: viewport.width / 2 - view.x * view.zoom, y: viewport.height / 2 - view.y * view.zoom, zoom: view.zoom };
}

export const sameView = (a: RemoteView | null, b: RemoteView | null): boolean => !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.zoom - b.zoom) < 0.001;

/** Envia no máximo 1 vez por `ms`, sempre com o ÚLTIMO valor (o intermediário não importa para cursor/câmera). */
export function throttleLatest<T>(fn: (value: T) => void, ms: number): { push: (value: T) => void; cancel: () => void } {
  let last = 0;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    last = Date.now();
    fn(value);
  };
  return {
    push: (value) => {
      pending = { value };
      const wait = ms - (Date.now() - last);
      if (wait <= 0) {
        if (timer) clearTimeout(timer);
        run();
      } else if (!timer) timer = setTimeout(run, wait);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

export type { Point };

/** Deslize do cursor remoto com inércia: duração e desaceleração (tokens de movimento do DESIGN_SYSTEM). */
export const CURSOR_GLIDE = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
