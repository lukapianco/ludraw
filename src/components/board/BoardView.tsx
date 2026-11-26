import { useEffect, useLayoutEffect, useState } from 'react';
import { CommandPalette } from '../dashboard/CommandPalette';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { loadBoardData } from '../../utils/storage';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useAutosave } from '../../hooks/useAutosave';
import { usePermissionSync } from '../../hooks/usePermissionSync';
import { CanvasStage } from '../canvas/CanvasStage';
import { CanvasContextMenu } from '../canvas/CanvasContextMenu';

import { TopBar } from '../toolbar/TopBar';
import { LeftToolbar } from '../toolbar/LeftToolbar';
import { BottomZoomBar } from '../toolbar/BottomZoomBar';
import { FloatingContextToolbar } from '../toolbar/FloatingContextToolbar';
import { FindPanel } from '../modals/FindPanel';

import { BoardBanners } from './BoardBanners';
import { PresentationDrawer } from './PresentationDrawer';
import { CommentThreadPanel } from './CommentThreadPanel';
import { TimerWidget } from '../facilitation/TimerWidget';
import { VotingOverlay, VotingResultsPanel } from '../facilitation/VotingOverlay';
import { PollCard, PollSetupPanel } from '../facilitation/PollPanels';
import { useVotingUi } from '../facilitation/votingUi';
import { useFacilitationClock } from '../../hooks/useFacilitationClock';
import { useCommentUi } from '../../utils/comments';
import { useKanbanUi } from '../../utils/kanbanActions';
import { resetImportUi } from '../../utils/importActions';
import { useTableUi } from '../../utils/tableActions';
import { useT } from '../../i18n/useT';
import { useCan } from '../../hooks/useCan';
import { BoardNoAccess } from './BoardNoAccess';
import { StudioLayer } from '../studio/StudioLayer';
import { VersionPreviewLayer } from '../studio/VersionPreviewLayer';
import { useStudioUi } from '../studio/studioUi';

import { useAutoSnapshots } from '../../utils/versionHistory';
import { serverBoardRepository } from '../../utils/boardRepository';
import { FollowBanner } from '../collab/FollowBanner';
import { RemotePresence } from '../collab/RemotePresence';
import { api } from '../../utils/api';
import { collabAvailable, startCollab } from '../../collab/session';

interface BoardViewProps {
  id: string;
  focus?: string;
  embed?: boolean;
  embedView?: 'fit' | 'initial' | 'current';
  embedCam?: string;
}



/**
 * Tela de um board — composição "Estúdio" (Rodada 0 do Chat 02, ai-memory/DESIGN_REDESIGN.md §3):
 *  Régua docada no topo · canvas · Dock centralizada na base · Bússola no canto inferior
 *  esquerdo · Painel docado à direita (gaveta abaixo de 1100 px) · Barra de ações abaixo da seleção.
 */
export function BoardView({ id, focus, embed = false, embedView, embedCam }: BoardViewProps) {
  const t = useT();
  const loadedId = useBoardStore((s) => s.boardId);
  const exists = useAppStore((s) => s.boards.some((b) => b.id === id));
  const boardName = useAppStore((s) => s.boards.find((b) => b.id === id)?.name) ?? t('board.topBar.board');
  const reduceMotion = useAppStore((s) => s.preferences.reduceMotion);
  const presenting = useBoardStore((s) => s.presenting);
  const viewAccess = useCan('board.view');

  useLayoutEffect(() => {
    if (!exists) return;
    // Chat 06 · B: leitura assíncrona do BoardRepository (IndexedDB); a tela fica no fundo do canvas até carregar
    let alive = true;
    void loadBoardData(id).then((data) => {
      if (!alive) return;
      useBoardStore.getState().loadBoard(id, data, { readOnly: embed });
      if (embed && embedView === 'fit') useBoardStore.getState().zoomToFit(undefined, false);
      if (embed && embedView === 'current' && embedCam) {
        const [x, y, zoom] = embedCam.split(',').map(Number);
        if ([x, y, zoom].every(Number.isFinite)) useBoardStore.getState().setCamera({ x, y, zoom });
      }
    });
    if (!embed) useAppStore.getState().touchBoard(id, { lastOpenedAt: Date.now() });
    // Chat 04: estados de interface dos widgets não atravessam boards
    useCommentUi.setState({ draft: null });
    useKanbanUi.setState({ drag: null, editing: null });
    useTableUi.setState({ elementId: null, anchor: null, focus: null, editing: null, draftInitial: null });
    resetImportUi();
    useVotingUi.setState({ resultsHidden: false, focusKey: null, pollDraft: null, pollMinimized: false });
    useStudioUi.getState().reset();
    return () => {
      alive = false;
    };
  }, [id, embed, exists]);

  useEffect(() => {
    if (!exists) {
      useAppStore.getState().toast(t('board.boardView.boardNotFoundThisDevice'), 'danger');
      useAppStore.getState().navigate({ name: 'dashboard' });
    }
  }, [exists]);

  useEffect(() => {
    useBoardStore.getState().setMotionEnabled(!reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    if (!focus || loadedId !== id) return;
    const t = window.setTimeout(() => {
      const s = useBoardStore.getState();
      if (s.elements[focus]) {
        s.setSelectedIds([focus]);
        s.zoomToElement(focus);
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [focus, loadedId, id]);

  // Chat 08.2: `\`, `Ctrl /` e `F6` agora são do Estúdio v2 (`studio/StudioLayer.tsx`)

  // Chat 06.5 · B: Ctrl/⌘ + K no board abre a paleta (comandos das extensões + busca)
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (embed) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k') return;
      const a = useAppStore.getState();
      if (a.modal || a.dev || useBoardStore.getState().presenting) return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embed]);

  // Chat 08: Modo Servidor com tempo real — edição ao vivo (Yjs) no lugar do salvamento por PUT
  const live = !embed && collabAvailable();
  useEffect(() => {
    if (!live || loadedId !== id) return;
    return startCollab(id, { visitor: !!api?.visitorTokenFor(id) });
  }, [live, loadedId, id]);

  // Chat 07 · B: servidor SEM tempo real — vigia a revisão do board aberto (aviso na hora quando outra janela/pessoa salva;
  // visitante perde o acesso na hora quando o link é revogado).
  useEffect(() => {
    if (embed || live || !serverBoardRepository || loadedId !== id) return;
    return serverBoardRepository.watch(id);
  }, [embed, live, loadedId, id]);

  // Sair do board sai da apresentação
  useEffect(() => () => useBoardStore.getState().setPresenting(false), []);

  usePermissionSync();
  useKeyboardShortcuts(!embed && loadedId === id);
  useAutosave(!embed && loadedId === id);
  // Chat 04: fim do cronômetro (alarme), prazo da votação e música ambiente
  useFacilitationClock(!embed && loadedId === id);
  // Chat 06 · B: versões automáticas (autoSnapshotIntervalMin)
  useAutoSnapshots(!embed && loadedId === id && viewAccess.allowed);

  if (!exists || loadedId !== id) return <div className="h-full w-full bg-canvas" />;
  // Chat 06: a hierarquia (Espaço Pessoal alheio, time, lixeira, convite vencido) pode tirar o acesso
  if (!embed && !viewAccess.allowed) return <BoardNoAccess reason={viewAccess.reason} />;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--od-app-bg)]">
      {/* Chat 08.6 · A (D-12): título da página para leitores de tela (o nome visível fica na Ficha) */}
      <h1 className="sr-only">{boardName}</h1>
      <div className="relative flex min-h-0 flex-1">
        <main
          className="relative min-w-0 flex-1 overflow-hidden bg-canvas"
          onScroll={(e) => {
            e.currentTarget.scrollTop = 0;
            e.currentTarget.scrollLeft = 0;
          }}
        >
          <CanvasStage />
          {!embed && <VotingOverlay />}
          {!embed && <RemotePresence />}
          {!embed && !presenting && <VersionPreviewLayer />}
          {!embed && <FollowBanner />}
          {!embed && <TimerWidget />}
          {presenting ? (
            // Modo Apresentação (Chat 03 · Rodada B): sem Régua, Dock, Painel, Bússola nem Barra de ações
            <PresentationDrawer />
          ) : (
            <>
              {!embed && <FloatingContextToolbar />}
              {!embed && <CommentThreadPanel />}
              {!embed && <VotingResultsPanel />}
              {!embed && <PollCard />}
              {!embed && <PollSetupPanel />}
              {!embed && <BoardBanners />}
              {embed && <TopBar embed />}
              {!embed && <LeftToolbar />}
              {/* Chat 08.2: Estúdio v2 — barra do topo (Ficha │ Roda), Vista, Tempo e gavetas */}
              {!embed && <StudioLayer />}
              {embed && <BottomZoomBar />}
              <FindPanel />
              <CanvasContextMenu />
            </>
          )}
        </main>
      </div>
      {!embed && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
