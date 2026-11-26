import { type ReactNode } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import type { ToolType } from '../../types/canvas';
import { pickAndInsertImages } from '../../utils/boardActions';
import { cn } from '../../utils/cn';
import { LogoMark } from '../ui/Logo';
import { Tooltip } from '../ui/Tooltip';
import { handleToolbarKeys } from '../board/rovingFocus';
import { useT } from '../../i18n/useT';
import {
  CommentPinIcon,
  ConnectorIcon,
  EraserIcon,
  FrameIcon,
  HandIcon,
  HighlighterIcon,
  ImageIcon,
  LassoIcon,
  PenIcon,
  SelectIcon,
  ShapesIcon,
  StickerIcon,
  StickyIcon,
  TextIcon,
  ToolboxIcon,
} from '../icons/od';
import { useDockUi, type TrayId } from './dock/dockUi';
import { EmojiTray, FrameTray, PenTray, QuickTray, ShapesTray, StickyTray } from './dock/trays';
import { Toolbox } from './dock/Toolbox';

/**
 * Dock — barra horizontal flutuante, centralizada na base do canvas (posição e forma do Chat 02).
 * Chat 08.2 · C-1 (`STUDIO_V2_SPEC.md` §4): ordem nova (Mão antes de Selecionar), ícones próprios (§9), ponto de 4 px
 * nos botões com bandeja, bandejas PRESAS ao botão (`dock/DockTray.tsx`) e a Caixa de ferramentas no lugar do
 * "Mais ferramentas". Atalhos de teclado continuam em `useKeyboardShortcuts` (+ `Shift+E` e `/`).
 */
export function LeftToolbar() {
  const t = useT();
  const activeTool = useBoardStore((s) => s.activeTool);
  const stickyColor = useBoardStore((s) => s.toolOptions.stickyColor);
  const open = useDockUi((s) => s.open);
  const toggle = useDockUi((s) => s.toggle);
  const b = useBoardStore.getState;

  const selectTool = (tool: ToolType) => {
    b().setActiveTool(tool);
    useDockUi.getState().close(false);
  };
  const selectConnector = () => {
    b().setToolOption('connectorRouting', 'straight');
    b().setToolOption('connectorStartArrow', 'none');
    b().setToolOption('connectorEndArrow', 'arrow');
    selectTool('connector');
  };
  const isPenFamily = activeTool === 'pen' || activeTool === 'highlighter' || activeTool === 'eraser';

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3" data-od-toolbar>
        <div
          role="toolbar"
          aria-label={t('board.leftToolbar.toolDock')}
          onKeyDown={handleToolbarKeys}
          data-od-dock
          className="od-panel pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto p-1 no-scrollbar"
          data-od-floating
        >
          <Tooltip label={t('board.leftToolbar.quickInsert')} side="top" disabled={open === 'quick'}>
            <button
              type="button"
              data-dock-tray-trigger="quick"
              onClick={() => toggle('quick')}
              className={cn(
                'me-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-base ease-spring hover:scale-[1.05] active:scale-95 sm:flex',
                open === 'quick' && 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--od-panel)]',
              )}
              aria-label={t('board.leftToolbar.quickInsert')}
              aria-haspopup="dialog"
              aria-expanded={open === 'quick'}
            >
              <LogoMark size={34} />
            </button>
          </Tooltip>

          <DockGroup label={t('board.leftToolbar.navigate')}>
            <ToolButton id="hand" label={t('board.leftToolbar.handMoveBoard')} shortcut="H" active={activeTool === 'hand'} onClick={() => selectTool('hand')}>
              <HandIcon size={20} />
            </ToolButton>
            <ToolButton id="select" label={t('board.leftToolbar.select')} shortcut="V" active={activeTool === 'select'} onClick={() => selectTool('select')}>
              <SelectIcon size={20} />
            </ToolButton>
            <ToolButton id="lasso" label={t('board.leftToolbar.lassoFreeformSelection')} active={activeTool === 'lasso'} onClick={() => selectTool('lasso')}>
              <LassoIcon size={20} />
            </ToolButton>
          </DockGroup>

          <DockGroup label={t('board.leftToolbar.create')}>
            <ToolButton id="sticky" tray="sticky" label={t('common.stickyNote')} shortcut="N" active={activeTool === 'sticky'} onClick={() => toggle('sticky')}>
              <StickyIcon size={20} />
              <span className="absolute bottom-[6px] end-[6px] h-[7px] w-[7px] rounded-full ring-1 ring-black/10" style={{ background: stickyColor }} />
            </ToolButton>
            <ToolButton id="text" label={t('common.text')} shortcut="T" active={activeTool === 'text'} onClick={() => selectTool('text')}>
              <TextIcon size={20} />
            </ToolButton>
            <ToolButton id="shapes" tray="shapes" label={t('board.leftToolbar.shapes')} shortcut="S" active={activeTool === 'shape'} onClick={() => toggle('shapes')}>
              <ShapesIcon size={20} />
            </ToolButton>
            <ToolButton id="connector" label={t('board.leftToolbar.connectorArrow')} shortcut="L" active={activeTool === 'connector'} onClick={selectConnector}>
              <ConnectorIcon size={20} />
            </ToolButton>
            <ToolButton id="pen" tray="pen" label={t('board.leftToolbar.pen')} shortcut="P" active={isPenFamily} onClick={() => toggle('pen')}>
              {activeTool === 'highlighter' ? <HighlighterIcon size={20} /> : activeTool === 'eraser' ? <EraserIcon size={20} /> : <PenIcon size={20} />}
            </ToolButton>
          </DockGroup>

          <DockGroup label={t('common.insert')} className="hidden sm:flex">
            <ToolButton id="frame" tray="frame" label={t('board.leftToolbar.frame')} shortcut="F" active={activeTool === 'frame'} onClick={() => toggle('frame')}>
              <FrameIcon size={20} />
            </ToolButton>
            <ToolButton
              id="image"
              label={t('board.leftToolbar.imageAlsoDragCtrlV')}
              onClick={() => {
                useDockUi.getState().close(false);
                void pickAndInsertImages();
              }}
            >
              <ImageIcon size={20} />
            </ToolButton>
            <ToolButton id="emoji" tray="emoji" label={t('studio.dock.emojiTitle')} shortcut="Shift+E" onClick={() => toggle('emoji')}>
              <StickerIcon size={20} />
            </ToolButton>
            <ToolButton id="comment" label={t('board.leftToolbar.comment')} shortcut="C" active={activeTool === 'comment'} onClick={() => selectTool('comment')}>
              <CommentPinIcon size={20} />
            </ToolButton>
          </DockGroup>

          <DockGroup label={t('studio.toolbox.title')} last>
            <ToolButton id="toolbox" tray="toolbox" label={t('studio.toolbox.title')} shortcut="/" onClick={() => toggle('toolbox')}>
              <ToolboxIcon size={20} />
            </ToolButton>
          </DockGroup>
        </div>
      </div>

      {open === 'quick' && <QuickTray />}
      {open === 'sticky' && <StickyTray />}
      {open === 'shapes' && <ShapesTray />}
      {open === 'pen' && <PenTray />}
      {open === 'frame' && <FrameTray />}
      {open === 'emoji' && <EmojiTray />}
      {open === 'toolbox' && <Toolbox />}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function DockGroup({ label, last, className, children }: { label: string; last?: boolean; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn('flex shrink-0 items-center gap-0.5', className)}>
      <span className="od-divider-v mx-1" aria-hidden="true" />
      {children}
      {last && <span className="sr-only">{label}</span>}
    </div>
  );
}

interface ToolButtonProps {
  id: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  /** abre esta bandeja (ponto de 4 px no canto; a bandeja prende neste botão) */
  tray?: TrayId;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({ id, label, shortcut, active, tray, onClick, children }: ToolButtonProps) {
  const open = useDockUi((s) => (tray ? s.open === tray : false));
  const on = !!active || open;
  return (
    <Tooltip label={label} shortcut={shortcut} side="top" disabled={open}>
      <button
        type="button"
        className="od-tool od-dock-tool shrink-0"
        data-dock-tool={id}
        data-active={on}
        data-dock-tray-trigger={tray}
        onClick={onClick}
        aria-label={label}
        aria-pressed={tray ? undefined : !!active}
        aria-haspopup={tray ? 'dialog' : undefined}
        aria-expanded={tray ? open : undefined}
      >
        {children}
        {tray && <span className="pointer-events-none absolute end-[4px] top-[4px] h-[4px] w-[4px] rounded-full bg-current opacity-45" aria-hidden="true" data-tray-dot />}
      </button>
    </Tooltip>
  );
}
