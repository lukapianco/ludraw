/**
 * LuDraw — estado efêmero da presença ao vivo (Chat 08). Nada daqui é salvo nem entra no desfazer:
 * quem está online, cursores, seleção/edição dos outros e o "seguir".
 */
import { create } from 'zustand';
import type { PresenceUser, WireRect } from './protocol';

export interface RemoteCursor {
  x: number;
  y: number;
  /** quando chegou (some depois de `CURSOR_IDLE_MS`) */
  at: number;
}

interface CollabUiState {
  users: PresenceUser[];
  cursors: Record<string, RemoteCursor>;
  selection: Record<string, string[]>;
  /** caixa de seleção por arrasto de cada pessoa, em coordenadas do board */
  marquee: Record<string, WireRect | null>;
  editing: Record<string, string | null>;
  /** votação anônima com cursores ocultos: o servidor não manda posição, seleção nem edição */
  hidden: boolean;
  /** pessoa que estou seguindo (câmera) */
  following: string | null;
  /** mexi na câmera: o seguir está em pausa */
  paused: boolean;
  /** estou seguindo porque alguém está conduzindo ("Trazer todos até mim") */
  forced: boolean;
  /** condutor de quem eu saí (não volto a seguir até a condução mudar) */
  optOut: string | null;
  setUsers: (users: PresenceUser[]) => void;
  applyPointers: (m: { cursors: Record<string, { x: number; y: number }>; editing: Record<string, string | null>; selection: Record<string, string[]>; marquee: Record<string, WireRect | null> }) => void;
  setHidden: (hidden: boolean) => void;
  follow: (userId: string | null) => void;
  setPaused: (paused: boolean) => void;
  /** a condução do board mudou (null = ninguém conduzindo) */
  setLeader: (leaderId: string | null, me: string) => void;
  /** sair da condução: para de seguir e não volta enquanto for o mesmo condutor */
  leaveLeader: () => void;
  reset: () => void;
}

const EMPTY = { users: [] as PresenceUser[], cursors: {}, selection: {}, marquee: {}, editing: {}, hidden: false, following: null as string | null, paused: false, forced: false, optOut: null as string | null };

export const useCollabUi = create<CollabUiState>()((set) => ({
  ...EMPTY,
  setUsers: (users) =>
    set((s) => {
      const ids = new Set(users.map((u) => u.id));
      const keep = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([id]) => ids.has(id))) as Record<string, T>;
      return { users, cursors: keep(s.cursors), selection: keep(s.selection), marquee: keep(s.marquee), editing: keep(s.editing), ...(s.following && !ids.has(s.following) ? { following: null, paused: false } : {}) };
    }),
  applyPointers: (m) =>
    set((s) => {
      const now = Date.now();
      const cursors = { ...s.cursors };
      for (const [id, c] of Object.entries(m.cursors)) cursors[id] = { x: c.x, y: c.y, at: now };
      return { cursors, editing: { ...s.editing, ...m.editing }, selection: { ...s.selection, ...m.selection }, marquee: { ...s.marquee, ...m.marquee } };
    }),
  setHidden: (hidden) => set(hidden ? { hidden, cursors: {}, selection: {}, marquee: {}, editing: {} } : { hidden }),
  follow: (userId) => set((s) => ({ following: s.following === userId ? null : userId, paused: false, forced: false })),
  setLeader: (leaderId, me) =>
    set((s) => {
      if (!leaderId || leaderId === me) return s.forced ? { following: null, forced: false, paused: false, optOut: null } : { optOut: null };
      if (s.optOut === leaderId) return {};
      return { following: leaderId, forced: true, paused: false };
    }),
  leaveLeader: () => set((s) => ({ optOut: s.forced ? s.following : s.optOut, following: null, forced: false, paused: false })),
  setPaused: (paused) => set({ paused }),
  reset: () => set({ ...EMPTY }),
}));
