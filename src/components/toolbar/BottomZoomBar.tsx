import { useState } from 'react';
import { ChevronDown, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import { selectCanRedo, selectCanUndo, useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import { Menu, type MenuItem } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

/**
 * ZoomCluster — desfazer/refazer + controle de zoom (− % +), com menu
 * "Ajustar à tela / 100% / Selecionar tudo / níveis". Desde a Rodada 0 do Chat 02 fica
 * no centro da Régua (TopBar). Zoom pelos botões é animado e centralizado na tela;
 * atalhos de teclado inalterados (useKeyboardShortcuts).
 */
export function ZoomCluster({ showHistory = true, tooltipSide = 'bottom', className }: { showHistory?: boolean; tooltipSide?: 'top' | 'bottom'; className?: string }) {
  const t = useT();
  const zoom = useBoardStore((s) => s.camera.zoom);
  const canUndo = useBoardStore(selectCanUndo);
  const canRedo = useBoardStore(selectCanRedo);
  const readOnly = useBoardStore((s) => s.readOnly);
  const showUndoRedo = useAppStore((s) => s.preferences.showUndoRedo);
  const [menu, setMenu] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const b = useBoardStore.getState;

  const items: MenuItem[] = [
    { kind: 'item', id: 'fit', label: t('common.fitScreen'), shortcut: 'Shift + 1', onSelect: () => b().zoomToFit() },
    { kind: 'item', id: 'sel', label: t('board.bottomZoomBar.zoomSelection'), shortcut: 'Shift + 2', disabled: b().selectedIds.length === 0, onSelect: () => b().zoomToFit(b().selectedIds) },
    { kind: 'item', id: 'z100', label: t('board.bottomZoomBar.actualSize100'), shortcut: 'Shift + 0', onSelect: () => b().setZoom(1) },
    { kind: 'item', id: 'all', label: t('board.bottomZoomBar.selectAll'), shortcut: 'Ctrl + A', disabled: readOnly, onSelect: () => b().selectAll() },
    { kind: 'separator', id: 's' },
    { kind: 'label', id: 'levels', label: t('board.bottomZoomBar.zoomLevels') },
    ...[0.1, 0.25, 0.5, 1, 1.5, 2, 4].map((z): MenuItem => ({ kind: 'radio', id: `z${z}`, label: `${Math.round(z * 100)}%`, checked: Math.abs(zoom - z) < 0.005, onSelect: () => b().setZoom(z) })),
  ];

  const history = showHistory && showUndoRedo && !readOnly;

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {history && (
        <>
          <Tooltip label={t('board.bottomZoomBar.undo')} shortcut="Ctrl + Z" side={tooltipSide}>
            <button type="button" className="od-tool h-8 w-8" disabled={!canUndo} onClick={() => b().undo()} aria-label={t('board.bottomZoomBar.undo')}>
              <Undo2 size={17} />
            </button>
          </Tooltip>
          <Tooltip label={t('board.bottomZoomBar.redo')} shortcut="Ctrl + Y" side={tooltipSide}>
            <button type="button" className="od-tool h-8 w-8" disabled={!canRedo} onClick={() => b().redo()} aria-label={t('board.bottomZoomBar.redo')}>
              <Redo2 size={17} />
            </button>
          </Tooltip>
          <span className="od-divider-v mx-1.5" />
        </>
      )}
      <Tooltip label={t('board.bottomZoomBar.zoomOut')} shortcut="Ctrl + −" side={tooltipSide}>
        <button type="button" className="od-tool h-8 w-8" onClick={() => b().zoomBy(1 / 1.25)} aria-label={t('board.bottomZoomBar.zoomOut')}>
          <Minus size={17} />
        </button>
      </Tooltip>
      <button
        type="button"
        data-od-menu-trigger
        onClick={(e) => {
          if (menu) {
            setMenu(null);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          const above = tooltipSide === 'top';
          setMenu({ x: r.left + r.width / 2 - 120, y: above ? r.top - 8 : r.bottom + 8, above });
        }}
        className="flex h-8 min-w-[64px] items-center justify-center gap-0.5 rounded-md px-1.5 text-[13px] font-semibold tabular-nums text-ink transition-colors duration-base hover:bg-panel-hover"
        aria-label={t('board.bottomZoomBar.zoomLevelRound', { round: Math.round(zoom * 100) })}
        aria-haspopup="menu"
        aria-expanded={!!menu}
      >
        {Math.round(zoom * 100)}%
        <ChevronDown size={13} className="text-ink-subtle" />
      </button>
      <Tooltip label={t('board.bottomZoomBar.zoom')} shortcut="Ctrl + +" side={tooltipSide}>
        <button type="button" className="od-tool h-8 w-8" onClick={() => b().zoomBy(1.25)} aria-label={t('board.bottomZoomBar.zoom')}>
          <Plus size={17} />
        </button>
      </Tooltip>
      {menu && <Menu items={items} x={menu.x} y={menu.y} placement={menu.above ? 'above' : 'below'} onClose={() => setMenu(null)} minWidth={240} />}
    </div>
  );
}

/**
 * Controles de zoom flutuantes usados só no modo incorporado (embed), onde não há Régua.
 * Nome mantido por compatibilidade com o ARCHITECTURE_MAP.
 */
export function BottomZoomBar() {
  return (
    <div className="od-panel pointer-events-auto absolute bottom-3 end-3 z-40 flex h-11 items-center px-1.5" data-od-floating>
      <ZoomCluster showHistory={false} tooltipSide="top" />
    </div>
  );
}
