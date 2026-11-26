/**
 * LuDraw — módulo Vista (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.3): base esquerda, 44 px, 16 px da borda.
 *   Bússola · − · zoom % (clique = ajustar à tela) · + · Encontrar (`Ctrl F`) · Exibir · Roteiro
 * Substitui o zoom da Régua, a Bússola, ⋯ → Visualizar e Editar → Encontrar, e as abas Navegação/Frames/Tags (destacar).
 * Abaixo de 1040 px ficam Bússola + Exibir (zoom e Encontrar vão para a gaveta Exibir).
 */
import { useRef } from 'react';
import { Compass as CompassIcon, Expand, Minus, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { setCurrentViewAsInitial, toggleFullscreen } from '../../utils/boardActions';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Tooltip } from '../ui/Tooltip';
import { Minimap } from '../canvas/Minimap';
import { handleToolbarKeys } from '../board/rovingFocus';
import { ScriptIcon } from '../icons/od';
import { StudioDrawer, useDrawerTrigger } from './StudioDrawer';
import { PrefSwitch, Segmented, SectionTitle } from './YouDrawer';
import { useStudioUi } from './studioUi';
import { FramesTab } from './boardPanels';
import { isCompact, useModuleFit, useModuleFitStore } from './useModuleFit';

function ZoomControls({ inDrawer = false, hidden = false }: { inDrawer?: boolean; hidden?: boolean }) {
  const t = useT();
  const zoom = useBoardStore((s) => s.camera.zoom);
  const b = useBoardStore.getState;
  return (
    <div className={cn('flex items-center gap-0.5', !inDrawer && hidden && 'hidden')}>
      <Tooltip label={t('board.bottomZoomBar.zoomOut')} shortcut="Ctrl −" side="top">
        <button type="button" className="od-tool h-[34px] w-[34px]" onClick={() => b().zoomBy(1 / 1.25)} aria-label={t('board.bottomZoomBar.zoomOut')}>
          <Minus size={17} />
        </button>
      </Tooltip>
      <Tooltip label={t('common.fitScreen')} shortcut="Shift 1" side="top">
        <button type="button" data-testid="studio-zoom" className="h-[34px] min-w-[56px] rounded-md px-1.5 text-[13px] font-semibold tabular-nums text-ink transition-colors duration-base hover:bg-panel-hover" onClick={() => b().zoomToFit()} aria-label={t('studio.view.zoomFit', { zoom: Math.round(zoom * 100) })}>
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <Tooltip label={t('board.bottomZoomBar.zoom')} shortcut="Ctrl +" side="top">
        <button type="button" className="od-tool h-[34px] w-[34px]" onClick={() => b().zoomBy(1.25)} aria-label={t('board.bottomZoomBar.zoom')}>
          <Plus size={17} />
        </button>
      </Tooltip>
    </div>
  );
}

export function ViewModule() {
  const t = useT();
  const pinned = useAppStore((s) => s.preferences.showMinimap);
  const compass = useDrawerTrigger('compass');
  const display = useDrawerTrigger('display');
  const script = useDrawerTrigger('script');
  const ref = useRef<HTMLDivElement>(null);
  // Chat 08.2 · C-1: medido contra a Dock (não só pela largura da janela)
  const fit = useModuleFit('view', ref);
  const compact = isCompact(fit);
  const labels = fit === 'full';
  return (
    <div ref={ref} data-fit={fit} role="toolbar" aria-label={t('studio.view.title')} data-studio-region="view" data-studio-module="view" onKeyDown={handleToolbarKeys} className={cn('od-panel pointer-events-auto absolute start-4 z-40 flex h-11 items-center gap-0.5 rounded-xl px-1 shadow-panel', fit === 'lifted' ? 'bottom-[72px]' : 'bottom-4')}>
      <Tooltip label={t('board.minimap.compass')} side="top">
        <button
          type="button"
          {...compass}
          data-active={pinned || compass['data-active']}
          onClick={(e) => (pinned ? useAppStore.getState().togglePreference('showMinimap') : compass.onClick(e))}
          className="od-tool h-[34px] w-[34px]"
          aria-label={t('board.minimap.compass')}
          aria-expanded={pinned || compass['aria-expanded']}
        >
          <CompassIcon size={18} />
        </button>
      </Tooltip>
      <span className={cn('od-divider-v mx-0.5', compact && 'hidden')} />
      <ZoomControls hidden={compact} />
      <Tooltip label={t('board.topBar.find')} shortcut="Ctrl F" side="top">
        <button type="button" className={cn('od-tool h-[34px] w-[34px]', compact && 'hidden')} onClick={() => useBoardStore.getState().setFindOpen(true)} aria-label={t('board.topBar.find')}>
          <Search size={17} />
        </button>
      </Tooltip>
      <span className="od-divider-v mx-0.5" />
      <Tooltip label={t('studio.view.display')} side="top">
        <button type="button" {...display} data-testid="studio-display" className="od-tool h-[34px] w-auto gap-1.5 px-2" aria-label={t('studio.view.display')}>
          <SlidersHorizontal size={17} />
          <span className={cn('whitespace-nowrap text-[13px] font-semibold', !labels && 'hidden')}>{t('studio.view.display')}</span>
        </button>
      </Tooltip>
      <Tooltip label={t('studio.script.title')} side="top">
        <button type="button" {...script} data-testid="studio-script" className={cn('od-tool h-[34px] w-auto gap-1.5 px-2', compact && 'hidden')} aria-label={t('studio.script.title')}>
          <ScriptIcon size={18} />
          <span className={cn('whitespace-nowrap text-[13px] font-semibold', !labels && 'hidden')}>{t('studio.script.title')}</span>
        </button>
      </Tooltip>
    </div>
  );
}

/** Minimapa acima da Vista: abre pelo botão (fecha ao clicar fora) ou fica fixo com "Bússola sempre aberta". */
export function CompassPanel() {
  const t = useT();
  const pinned = useAppStore((s) => s.preferences.showMinimap);
  const open = useStudioUi((s) => s.open === 'compass');
  // com a Vista acima da Dock (telas estreitas), a Bússola fixa sobe junto
  const viewFit = useModuleFitStore((s) => s.view);
  if (!pinned && !open) return null;
  const body = (
    <div className="px-1.5 pb-1.5 pt-1.5" data-testid="compass-panel">
      <Minimap />
    </div>
  );
  if (pinned)
    return (
      <section aria-label={t('board.minimap.compass')} data-studio-keep className={cn('od-panel pointer-events-auto absolute start-4 z-40 animate-fade-in overflow-hidden rounded-xl', viewFit === 'lifted' ? 'bottom-[124px]' : 'bottom-[68px]')}>
        {body}
      </section>
    );
  return (
    <StudioDrawer id="compass" title={t('board.minimap.compass')} width={248} from="bottom" align="start">
      {body}
    </StudioDrawer>
  );
}

/** Gaveta Exibir: grade e encaixe, no board, pessoas, módulos da tela e destacar por tag (as chaves de antes). */
export function DisplayDrawer() {
  const t = useT();
  // zoom e Encontrar moram aqui quando a Vista está compacta
  const viewFit = useModuleFitStore((s) => s.view);
  const grid = useBoardStore((s) => s.gridSettings);
  const tags = useBoardStore((s) => s.boardTags);
  const highlighted = useStudioUi((s) => s.highlightTags);
  const b = useBoardStore.getState;
  const gridValue = !grid.enabled ? 'none' : grid.style === 'lines' ? 'lines' : 'dots';
  return (
    <StudioDrawer
      id="display"
      title={t('studio.view.display')}
      width={320}
      from="bottom"
      align="start"
      headerExtra={
        <button type="button" className="od-btn od-btn-ghost od-btn-sm h-7 shrink-0 px-2" onClick={() => toggleFullscreen()}>
          <Expand size={14} /> {t('studio.view.fullscreen')} <span className="od-kbd">F11</span>
        </button>
      }
    >
      <div className="pb-2" data-testid="display-drawer">
        {/* em telas estreitas o zoom e o Encontrar moram aqui */}
        <div className={cn('flex items-center gap-1 px-3 pt-2', !isCompact(viewFit) && 'hidden')}>
          <ZoomControls inDrawer />
          <button type="button" className="od-btn od-btn-ghost od-btn-sm ms-auto h-8" onClick={() => (useStudioUi.getState().close(), b().setFindOpen(true))}>
            <Search size={14} /> {t('board.topBar.find')}
          </button>
        </div>

        <SectionTitle>{t('studio.view.gridSnap')}</SectionTitle>
        <div className="flex items-center justify-between px-4 pb-0.5 text-[12px] text-ink-muted">
          <span>{t('menus.boardMenu.grid')}</span>
          <span className="od-kbd">G</span>
        </div>
        <Segmented
          label={t('menus.boardMenu.grid')}
          value={gridValue}
          onChange={(v) => b().setGridSettings(v === 'none' ? { enabled: false } : { enabled: true, style: v })}
          options={[
            { id: 'dots', label: t('studio.view.gridDots') },
            { id: 'lines', label: t('studio.view.gridLines') },
            { id: 'none', label: t('common.none') },
          ]}
        />
        <button type="button" role="switch" aria-checked={grid.snapToGrid} className="od-menu-item mx-1.5 w-[calc(100%-12px)] justify-between" onClick={() => b().setGridSettings({ snapToGrid: !grid.snapToGrid })}>
          <span className="text-[13px]">{t('menus.boardMenu.snapGrid')}</span>
          <SwitchLike on={grid.snapToGrid} />
        </button>
        <PrefSwitch pref="alignObjects" label={t('studio.view.snapObjects')} />
        <PrefSwitch pref="showObjectSize" label={t('studio.view.objectSize')} />
        <PrefSwitch pref="suggestObjectSize" label={t('menus.canvasMenu.suggestObjectSize')} />
        <PrefSwitch pref="showBoardDimensions" label={t('studio.view.boardSize')} />

        <SectionTitle>{t('studio.view.onBoard')}</SectionTitle>
        <PrefSwitch pref="showComments" label={t('menus.boardMenu.commentsBoard')} />
        <PrefSwitch pref="showConnectors" label={t('studio.view.connectors')} />
        <PrefSwitch pref="showScrollbars" label={t('menus.boardMenu.scrollbars')} />

        <SectionTitle>{t('studio.view.people')}</SectionTitle>
        <PrefSwitch pref="showCursors" label={t('menus.boardMenu.showCollaboratorsCursors')} />
        <PrefSwitch pref="cursorInertia" label={t('menus.boardMenu.cursorInertia')} />

        <SectionTitle>{t('studio.view.modules')}</SectionTitle>
        <PrefSwitch pref="showMinimap" label={t('studio.view.compassPinned')} />
        <PrefSwitch pref="showUndoRedo" label={t('studio.view.timeModule')} />

        <SectionTitle>{t('studio.view.highlightTags')}</SectionTitle>
        {tags.length === 0 ? (
          <p className="px-4 pb-1 text-xs text-ink-subtle">{t('studio.view.noTags')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-4 pb-1" data-testid="highlight-tags">
            {tags.map((tag) => {
              const on = highlighted.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={on}
                  data-highlight-tag={tag.id}
                  onClick={() => useStudioUi.getState().setHighlightTags(on ? highlighted.filter((x) => x !== tag.id) : [...highlighted, tag.id])}
                  className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition-colors', on ? 'ring-[var(--od-selection)]' : 'ring-line opacity-80 hover:opacity-100')}
                  style={{ background: tag.color, color: '#fff' }}
                >
                  {tag.label}
                </button>
              );
            })}
            {highlighted.length > 0 && (
              <button type="button" className="od-btn od-btn-ghost od-btn-sm h-7 px-2" onClick={() => useStudioUi.getState().setHighlightTags([])}>
                {t('studio.view.clearHighlight')}
              </button>
            )}
          </div>
        )}
      </div>
    </StudioDrawer>
  );
}

function SwitchLike({ on }: { on: boolean }) {
  return (
    <span className={cn('relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors', on ? 'bg-accent' : 'bg-line-strong')}>
      <span className={cn('absolute h-[14px] w-[14px] rounded-full bg-panel shadow transition-transform', on ? 'translate-x-[14px]' : 'translate-x-[2px]')} />
    </span>
  );
}

/** Gaveta Roteiro: frames na ordem dos slides (arrastar/↑↓, ▷ por frame) e a vista inicial. */
export function ScriptDrawer() {
  const t = useT();
  const initialView = useBoardStore((s) => s.initialView);
  const canEdit = useBoardStore((s) => !s.readOnly);
  return (
    <StudioDrawer id="script" title={t('studio.script.title')} width={300} from="bottom" align="start" footer={t('studio.script.footer')}>
      <div data-testid="script-drawer">
        <FramesTab />
        <div className="border-t border-line p-1.5">
          <button type="button" className="od-menu-item w-full" disabled={!initialView} title={initialView ? undefined : t('board.boardSidebar.setBoardInitialView')} onClick={() => initialView && useBoardStore.getState().animateCameraTo(initialView)}>
            {t('board.boardSidebar.goInitialView')}
          </button>
          <button type="button" className="od-menu-item w-full" disabled={!canEdit} onClick={() => setCurrentViewAsInitial()}>
            {t('studio.script.useAsInitial')}
          </button>
        </div>
      </div>
    </StudioDrawer>
  );
}
