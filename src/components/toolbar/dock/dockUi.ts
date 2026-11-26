/**
 * LuDraw — estado das bandejas da Dock (Chat 08.2 · C-1, `STUDIO_V2_SPEC.md` §4). Fora do componente para que
 * os atalhos (`Shift + E` abre Emojis e adesivos, `/` abre a Caixa de ferramentas) e a paleta `Ctrl K` consigam
 * abrir a mesma bandeja, presa ao mesmo botão. Uma bandeja aberta por vez.
 */
import { create } from 'zustand';

export type TrayId = 'quick' | 'sticky' | 'shapes' | 'pen' | 'frame' | 'emoji' | 'toolbox';

interface DockUiState {
  open: TrayId | null;
  toggle: (id: TrayId) => void;
  openTray: (id: TrayId) => void;
  close: (restoreFocus?: boolean) => void;
}

/** Botão da Dock que abre a bandeja (a língua aponta para ele; o foco volta para ele). */
export const trayTrigger = (id: TrayId): HTMLElement | null => document.querySelector<HTMLElement>(`[data-dock-tray-trigger="${id}"]`);

export const useDockUi = create<DockUiState>((set, get) => ({
  open: null,
  toggle: (id) => set({ open: get().open === id ? null : id }),
  openTray: (id) => set({ open: id }),
  close: (restoreFocus = false) => {
    const was = get().open;
    if (!was) return;
    set({ open: null });
    if (restoreFocus) trayTrigger(was)?.focus({ preventScroll: true });
  },
}));

/* ------------------------- Recentes da Caixa de ferramentas ------------------------- */

const RECENT_KEY = 'ludraw:toolbox-recent';

/** Até 3 itens usados por último (só neste navegador; sem armazenamento nada quebra). */
export function readToolboxRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function rememberToolboxItem(id: string): void {
  try {
    const next = [id, ...readToolboxRecent().filter((x) => x !== id)].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* armazenamento indisponível: só não guarda os recentes */
  }
}
