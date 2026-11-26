/**
 * LuDraw — estado da interface do Estúdio v2 (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §2). Só visualização: nada aqui é
 * conteúdo do board nem passa pelo `useBoardStore`.
 *
 *  - Uma gaveta aberta por vez (abrir uma fecha as outras); `\` reabre a última usada (ou a Ficha).
 *  - `highlightTags`: "Destacar por tag" (Exibir) — esmaece os post-its sem as tags escolhidas; só na tela.
 *  - `previewSnapshotId`: versão em prévia na linha do tempo (camada somente leitura sobre o board).
 */
import { create } from 'zustand';
import type { BoardData } from '../../types/canvas';

/** Versão em prévia (somente leitura) na linha do tempo. */
export interface PreviewVersion {
  id: string;
  createdAt: number;
  data: BoardData;
}

export type DrawerId = 'card' | 'tags' | 'facilitate' | 'conversations' | 'you' | 'display' | 'script' | 'timeline' | 'compass';

interface StudioUiState {
  open: DrawerId | null;
  last: DrawerId | null;
  /** botão que abriu a gaveta (o foco volta para ele ao fechar) */
  anchor: HTMLElement | null;
  highlightTags: string[];
  previewSnapshotId: string | null;
  preview: PreviewVersion | null;
  /** pin de conversa destacado por 1,5 s depois do "Ir até" */
  flashId: string | null;
  flash: (id: string) => void;
  toggle: (id: DrawerId, anchor?: HTMLElement | null) => void;
  openDrawer: (id: DrawerId, anchor?: HTMLElement | null) => void;
  close: (restoreFocus?: boolean) => void;
  setHighlightTags: (ids: string[]) => void;
  setPreview: (v: PreviewVersion | null) => void;
  reset: () => void;
}

/** Botão de cada gaveta, para reabrir pelo `\` ou por outro lugar (Ficha → Histórico abre a linha do tempo). */
export const drawerTrigger = (id: DrawerId): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(`[data-studio-trigger="${id}"]`));

export const useStudioUi = create<StudioUiState>((set, get) => ({
  open: null,
  last: null,
  anchor: null,
  highlightTags: [],
  previewSnapshotId: null,
  preview: null,
  flashId: null,
  flash: (id) => {
    set({ flashId: id });
    setTimeout(() => {
      if (get().flashId === id) set({ flashId: null });
    }, 1500);
  },
  toggle: (id, anchor) => (get().open === id ? get().close(true) : get().openDrawer(id, anchor)),
  openDrawer: (id, anchor) => set({ open: id, last: id, anchor: anchor ?? drawerTrigger(id) }),
  close: (restoreFocus = false) => {
    const { anchor, open } = get();
    if (!open) return;
    set({ open: null });
    if (restoreFocus && anchor?.isConnected) anchor.focus();
  },
  setHighlightTags: (ids) => set({ highlightTags: ids }),
  setPreview: (v) => set({ previewSnapshotId: v?.id ?? null, preview: v }),
  reset: () => set({ open: null, anchor: null, highlightTags: [], previewSnapshotId: null, preview: null }),
}));
