/**
 * LuDraw — Estado de EXECUÇÃO das extensões programáveis nesta aba (Chat 06.5 · B).
 *
 * Não persiste nada (o que persiste fica em `useExtensionsStore` → IndexedDB):
 * - estado do Worker de cada extensão (`running`, `killed` + motivo);
 * - registro de acessos à rede (indicador "Extensão X acessou a rede", §5.2/§5.10);
 * - painel de extensão aberto na aba "Extensões" do Painel lateral.
 */
import { create } from 'zustand';
import type { RuntimeState } from '../extensions/types';

export interface NetworkAccess {
  extensionId: string;
  host: string;
  at: number;
  ok: boolean;
}

interface RuntimeStore {
  states: Record<string, { state: RuntimeState; reason?: string }>;
  network: NetworkAccess[];
  /** `"<id da extensão>/<id do painel>"` aberto na aba Extensões */
  openPanel: string | null;
  setState: (id: string, state: RuntimeState, reason?: string) => void;
  clear: (id: string) => void;
  logNetwork: (entry: NetworkAccess) => void;
  setOpenPanel: (key: string | null) => void;
}

export const useExtensionRuntimeStore = create<RuntimeStore>((set) => ({
  states: {},
  network: [],
  openPanel: null,
  setState: (id, state, reason) => set((s) => ({ states: { ...s.states, [id]: { state, reason } } })),
  clear: (id) =>
    set((s) => {
      const states = { ...s.states };
      delete states[id];
      return { states, openPanel: s.openPanel?.startsWith(`${id}/`) ? null : s.openPanel };
    }),
  logNetwork: (entry) => set((s) => ({ network: [...s.network, entry].slice(-50) })),
  setOpenPanel: (key) => set({ openPanel: key }),
}));
