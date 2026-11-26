import { toggleLastDrawer } from '../components/studio/StudioLayer';
import { useDockUi } from '../components/toolbar/dock/dockUi';
import { useEffect } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { useAppStore } from '../store/useAppStore';
import { isTextualElement } from '../types/canvas';
import { copyLinkToElement, copySelectionAsImage, viewportCenterWorld } from '../utils/boardActions';
import { snapshotFromDataTransfer } from '../utils/clipboard';
import { handlePasteSnapshot } from '../utils/importActions';
import { handleMindMapKey } from '../utils/mindmapActions';
import { deleteSelectionWithFramePrompt } from '../utils/boardActions';
import { handleTableKey } from '../utils/tableActions';
import { cancelCommentDraft, useCommentUi } from '../utils/comments';
import { startKanbanEdit } from '../utils/kanbanActions';
import { useT } from '../i18n/useT';

const board = () => useBoardStore.getState();
const app = () => useAppStore.getState();

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

function toggleTextStyle(key: 'fontWeight' | 'fontStyle' | 'underline') {
  const s = board();
  const targets = s.selectedIds.map((id) => s.elements[id]).filter(isTextualElement).filter((el) => !el.locked);
  if (targets.length === 0) return;
  const first = targets[0];
  s.pushHistory();
  s.updateElements(
    targets.map((el) => ({
      id: el.id,
      patch:
        key === 'fontWeight'
          ? { fontWeight: first.fontWeight === 'bold' ? 'normal' : 'bold' }
          : key === 'fontStyle'
            ? { fontStyle: first.fontStyle === 'italic' ? 'normal' : 'italic' }
            : { underline: !first.underline },
    })),
  );
}

/**
 * Atalhos de teclado do board. Ignorados enquanto o foco está em campos de texto.
 * Copiar/Recortar/Colar usam os eventos nativos `copy`/`cut`/`paste` (sem pedir permissão).
 */
export function useKeyboardShortcuts(enabled: boolean): void {
  const t = useT();
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const s = board();
      const a = app();
      if (a.modal || a.dev) return;
      if (isTypingTarget(e.target)) return;
      // Mapa mental selecionado: Tab/Enter/Delete/setas/+/− agem sobre o nó ativo (Chat 03)
      if (handleMindMapKey(e)) return;
      // Tabela com célula ativa: setas/Enter/Tab/Delete/digitar agem sobre as células (Chat 04)
      if (handleTableKey(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) s.setSpaceHeld(true);
        return;
      }

      if (s.readOnly) {
        if (e.shiftKey && e.code === 'Digit1') s.zoomToFit();
        return;
      }

      /* ------------------------- combinações com Ctrl/⌘ ------------------------- */
      if (mod) {
        if (key === '/' || e.code === 'Slash' || e.code === 'IntlRo') {
          e.preventDefault();
          // Chat 08.2: reabre a última gaveta do Estúdio (antes: o Painel)
          toggleLastDrawer();
        } else if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          s.undo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          s.redo();
        } else if (key === 'd') {
          e.preventDefault();
          s.duplicateSelected();
        } else if (key === 'a') {
          e.preventDefault();
          s.selectAll();
        } else if (key === 'g') {
          e.preventDefault();
          if (e.shiftKey) s.ungroupSelected();
          else s.groupSelected();
        } else if (key === 'l' && e.shiftKey) {
          e.preventDefault();
          const sel = s.selectedIds.map((id) => s.elements[id]).filter(Boolean);
          if (sel.length) s.setLocked(s.selectedIds, !sel.every((el) => el.locked));
        } else if (key === 'c' && e.altKey && e.shiftKey) {
          e.preventDefault();
          if (s.selectedIds[0]) void copyLinkToElement(s.selectedIds[0]);
        } else if (key === 'c' && e.altKey) {
          e.preventDefault();
          s.copyStyle();
          app().toast(t('board.useKeyboardShortcuts.styleCopied'));
        } else if (key === 'v' && e.altKey) {
          e.preventDefault();
          s.pasteStyle();
        } else if (key === 'c' && e.shiftKey) {
          e.preventDefault();
          void copySelectionAsImage();
        } else if (key === 'f') {
          e.preventDefault();
          s.setFindOpen(true);
        } else if (key === '=' || key === '+') {
          e.preventDefault();
          s.zoomBy(1.25);
        } else if (key === '-' || key === '_') {
          e.preventDefault();
          s.zoomBy(0.8);
        } else if (key === '0') {
          e.preventDefault();
          s.setZoom(1);
        } else if (key === 'backspace') {
          e.preventDefault();
          s.clearContent(s.selectedIds);
        } else if (key === 'b') {
          e.preventDefault();
          toggleTextStyle('fontWeight');
        } else if (key === 'i') {
          e.preventDefault();
          toggleTextStyle('fontStyle');
        } else if (key === 'u') {
          e.preventDefault();
          toggleTextStyle('underline');
        } else if (e.key === 'PageUp') {
          e.preventDefault();
          s.bringForward(s.selectedIds);
        } else if (e.key === 'PageDown') {
          e.preventDefault();
          s.sendBackward(s.selectedIds);
        }
        return;
      }

      /* ------------------------------- teclas simples ------------------------------ */
      switch (e.key) {
        case 'Delete':
        case 'Backspace': {
          e.preventDefault();
          // Chat 04: uma conversa selecionada sai por `comment.delete` (o autor comentador também pode)
          const only = s.selectedIds.length === 1 ? s.elements[s.selectedIds[0]] : undefined;
          if (only?.type === 'comment') {
            s.deleteComment(only.id);
            return;
          }
          // frames com conteúdo perguntam se o conteúdo fica ou sai junto (Chat 03)
          deleteSelectionWithFramePrompt();
          return;
        }
        case 'Escape':
          if (useCommentUi.getState().draft) cancelCommentDraft();
          else if (s.contextMenu) s.setContextMenu(null);
          else if (s.findOpen) s.setFindOpen(false);
          else if (s.activeTool !== 'select') s.setActiveTool('select');
          else s.clearSelection();
          return;
        case 'Enter': {
          if (s.selectedIds.length === 1) {
            const el = s.elements[s.selectedIds[0]];
            // Enter edita o texto (post-it, forma, texto), o rótulo da linha ou o título do frame (Chat 03)
            if ((isTextualElement(el) || el?.type === 'connector' || el?.type === 'frame' || el?.type === 'composite') && !el.locked) {
              e.preventDefault();
              s.setEditingId(el.id);
            } else if (el?.type === 'kanban' && !el.locked) {
              // Chat 04: Enter renomeia o quadro Kanban
              e.preventDefault();
              startKanbanEdit(el.id, { kind: 'title' });
            }
          }
          return;
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (s.selectedIds.length === 0) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          s.nudgeSelected(dx, dy);
          return;
        }
        case 'PageUp':
          e.preventDefault();
          s.bringToFront(s.selectedIds);
          return;
        case 'PageDown':
          e.preventDefault();
          s.sendToBack(s.selectedIds);
          return;
        case '?':
          app().openModal({ type: 'shortcuts' });
          return;
        default:
          break;
      }

      if ((e.shiftKey || e.altKey) && e.code === 'Digit1') {
        e.preventDefault();
        s.zoomToFit();
        return;
      }
      if (e.shiftKey && e.code === 'Digit2') {
        e.preventDefault();
        if (s.selectedIds.length) s.zoomToFit(s.selectedIds);
        return;
      }
      if (e.shiftKey && e.code === 'Digit0') {
        e.preventDefault();
        s.setZoom(1);
        return;
      }
      if (e.shiftKey && e.code === 'KeyC') {
        app().togglePreference('showComments');
        app().toast(app().preferences.showComments ? t('board.useKeyboardShortcuts.commentsVisible') : t('board.useKeyboardShortcuts.commentsHidden'));
        return;
      }

      /* --------------------------- atalhos de 1 caractere --------------------------- */
      // Chat 08.2 · C-1: Shift+E abre "Emojis e adesivos" (E sozinho continua sendo a borracha) e / abre a Caixa de
      // ferramentas — os dois são caracteres imprimíveis, então seguem a preferência de atalhos de 1 caractere
      if (a.preferences.singleKeyShortcuts && !e.altKey && e.shiftKey && e.code === 'KeyE') {
        e.preventDefault();
        useDockUi.getState().openTray('emoji');
        return;
      }
      if (!a.preferences.singleKeyShortcuts || e.altKey || e.shiftKey) return;
      if (key === '/') {
        e.preventDefault();
        useDockUi.getState().openTray('toolbox');
        return;
      }
      switch (key) {
        case 'v':
          s.setActiveTool('select');
          break;
        case 'h':
          s.setActiveTool('hand');
          break;
        case 'n':
          s.setActiveTool('sticky');
          break;
        case 't':
          s.setActiveTool('text');
          break;
        case 'r':
          s.setToolOption('shapeKind', 'rectangle');
          s.setToolOption('shapeId', undefined);
          s.setActiveTool('shape');
          break;
        case 'o':
          s.setToolOption('shapeKind', 'circle');
          s.setToolOption('shapeId', undefined);
          s.setActiveTool('shape');
          break;
        case 's':
          s.setActiveTool('shape');
          break;
        case 'p':
          s.setActiveTool('pen');
          break;
        case 'e':
          s.setActiveTool('eraser');
          break;
        case 'g':
          s.setGridSettings({ enabled: !s.gridSettings.enabled });
          break;
        case 'l':
          s.setToolOption('connectorRouting', 'straight');
          s.setToolOption('connectorStartArrow', 'none');
          s.setToolOption('connectorEndArrow', 'arrow');
          s.setActiveTool('connector');
          break;
        case 'f':
          s.setActiveTool('frame');
          break;
        case 'c':
          // Chat 04: ferramenta Comentário (clique no board abre o compositor)
          s.setActiveTool('comment');
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') board().setSpaceHeld(false);
    };
    const onBlur = () => board().setSpaceHeld(false);

    const onCopy = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || app().modal) return;
      const payload = board().copySelected();
      if (!payload) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', payload);
    };
    const onCut = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || app().modal || board().readOnly) return;
      const payload = board().cutSelected();
      if (!payload) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', payload);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || app().modal || board().readOnly) return;
      const s = board();
      const at = s.lastPointerWorld ?? viewportCenterWorld();
      // Chat 05: colagem genérica — só tipos padrão (texto, HTML genérico, SVG, imagens e arquivos).
      // Objetos do LuDraw, planilhas/tabelas, SVG, .excalidraw, listas e imagens viram objetos nativos.
      const snapshot = snapshotFromDataTransfer(e.clipboardData, 'paste');
      e.preventDefault();
      void handlePasteSnapshot(snapshot, at);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [enabled]);
}
