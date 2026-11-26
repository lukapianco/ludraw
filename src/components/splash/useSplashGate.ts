import { useEffect, useLayoutEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Portão da splash (Chat 03 · pré-tarefa 2 — `ai-memory/refs/SPLASH_SPEC.md` §3).
 *
 * A splash monta UMA vez, na abertura do app (não a cada troca de rota), e sai quando:
 *  (a) passou o tempo mínimo (~1,1 s) **e**
 *  (b) o app está pronto: store `persist` reidratado + `document.fonts.ready` **e**
 *  (c) a animação terminou com o logo completo — isso fica a cargo da `SplashScreen`
 *      (`settleAtEnd`), que chama `onExited` ao fim da saída.
 * Failsafe: aos 4 s a splash é removida de qualquer jeito (a saída forçada começa antes,
 * para terminar dentro do prazo). Não bloqueia nada: o app monta por baixo desde o início.
 */

export const SPLASH_MIN_MS = 1100;
export const SPLASH_MAX_MS = 4000;
/** Duração da saída (mesma da `SplashScreen`). */
export const SPLASH_EXIT_MS = 420;
/** Fontes externas podem não carregar offline: não esperamos por elas além disto. */
const FONTS_WAIT_CAP_MS = 2400;

export interface SplashGate {
  /** A splash ainda está no DOM. */
  visible: boolean;
  /** Tempo mínimo + app pronto: a splash pode terminar a volta atual e sair. */
  ready: boolean;
  /** Failsafe: sair já (logo completo, sem esperar a animação). */
  force: boolean;
  /** Chamado pela splash ao terminar a saída: remove do DOM. */
  dismiss: () => void;
}

function waitHydration(): Promise<void> {
  const api = useAppStore.persist;
  if (!api || api.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = api.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

function waitFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.ready) return Promise.resolve();
  return Promise.race([fonts.ready.then(() => undefined), new Promise<void>((r) => setTimeout(r, FONTS_WAIT_CAP_MS))]);
}

/** Remove o boot splash estático de `index.html` (sem salto: a splash React já está pintada por cima). */
export function removeBootSplash(): void {
  if (typeof document === 'undefined') return;
  document.getElementById('od-boot')?.remove();
  document.documentElement.removeAttribute('data-od-boot');
}

export function useSplashGate(options: { enabled?: boolean } = {}): SplashGate {
  // decidido uma única vez, na abertura
  const [enabled] = useState(() => options.enabled ?? true);
  const [visible, setVisible] = useState(enabled);
  const [ready, setReady] = useState(false);
  const [force, setForce] = useState(false);

  // O boot splash sai no mesmo commit em que a splash React monta (antes do paint).
  useLayoutEffect(() => {
    removeBootSplash();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const minTime = new Promise<void>((r) => setTimeout(r, SPLASH_MIN_MS));
    Promise.all([minTime, waitHydration(), waitFonts()]).then(() => {
      if (alive) setReady(true);
    });
    const forceTimer = window.setTimeout(() => setForce(true), SPLASH_MAX_MS - SPLASH_EXIT_MS - 40);
    const hardTimer = window.setTimeout(() => setVisible(false), SPLASH_MAX_MS);
    return () => {
      alive = false;
      window.clearTimeout(forceTimer);
      window.clearTimeout(hardTimer);
    };
  }, [enabled]);

  return { visible, ready, force, dismiss: () => setVisible(false) };
}
