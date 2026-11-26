import { useEffect } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { persistCurrentBoard } from '../utils/boardActions';
import { markSaveScheduled } from '../utils/pendingSaves';

/**
 * Salvamento automático (local-first): grava o board ~0,5 s após cada alteração e
 * atualiza a miniatura do dashboard no máximo a cada 8 s. Também salva ao sair da tela
 * ou fechar a aba. (Chat 06 troca o destino para IndexedDB + Yjs.)
 */
export function useAutosave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    let lastThumb = 0;

    const flush = () => {
      timer = null;
      markSaveScheduled(false);
      const now = Date.now();
      const withThumb = now - lastThumb > 8000;
      if (withThumb) lastThumb = now;
      void persistCurrentBoard(withThumb);
    };

    const unsub = useBoardStore.subscribe((s, prev) => {
      if (
        s.boardId &&
        s.boardId === prev.boardId &&
        (s.elements !== prev.elements ||
          s.elementOrder !== prev.elementOrder ||
          s.gridSettings !== prev.gridSettings ||
          s.backgroundColor !== prev.backgroundColor ||
          s.initialView !== prev.initialView ||
          s.boardTags !== prev.boardTags ||
          s.activityLog !== prev.activityLog ||
          s.facilitation !== prev.facilitation ||
          s.facilitatorIds !== prev.facilitatorIds)
      ) {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(flush, 500);
        markSaveScheduled(true);
      }
    });

    const onUnload = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
      markSaveScheduled(false);
      void persistCurrentBoard(false);
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      unsub();
      window.removeEventListener('beforeunload', onUnload);
      if (timer) window.clearTimeout(timer);
      markSaveScheduled(false);
      void persistCurrentBoard(true);
    };
  }, [enabled]);
}
