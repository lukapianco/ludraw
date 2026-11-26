import type { MenuItem } from '../components/ui/Menu';
import { useBoardStore } from '../store/useBoardStore';
import { useAppStore } from '../store/useAppStore';
import type { Point } from '../utils/math';
import { startCommentDraft } from '../utils/comments';
import { createFrameAt, createFrameFromSelection, createStickyAt, createTextAt, pickAndInsertImages, setCurrentViewAsInitial, setInitialViewToContent } from '../utils/boardActions';
import { pasteFromSystemClipboard, pickAndImportFiles } from '../utils/importActions';
import { insertKanban } from '../utils/kanbanActions';
import { insertTable } from '../utils/tableActions';
import { insertMindMap } from '../utils/mindmapActions';
import { CommentPinIcon, FrameIcon, PasteIcon, StickyIcon, TextIcon } from '../components/icons/od';
import { useT } from '../i18n/useT';

/**
 * Menu do botão direito em área vazia do board (Chat 08.2 · C-2, `STUDIO_V2_SPEC.md` §5.1). Cabeçalho "Neste ponto"
 * com as coordenadas do mundo · linha rápida criada NO PONTO (Colar · Post-it · Texto · Frame · Conversa) · 4 linhas:
 * Inserir aqui ▸ · Seleção ▸ · Vista ▸ · Grade e navegação ▸. Os 22 itens de antes têm lugar (decisão do usuário: 4
 * linhas); as chaves de grade/encaixe/medidas são as mesmas da gaveta Exibir (uma fonte de estado só).
 */
export function useCanvasMenuItems(world: Point): MenuItem[] {
  const t = useT();
  const grid = useBoardStore((s) => s.gridSettings);
  const lockedCount = useBoardStore((s) => Object.values(s.elements).reduce((n, e) => (e.locked ? n + 1 : n), 0));
  const hasSelection = useBoardStore((s) => s.selectedIds.some((id) => s.elements[id] && s.elements[id].type !== 'frame'));
  const initialView = useBoardStore((s) => s.initialView);
  const preferences = useAppStore((s) => s.preferences);
  const togglePreference = useAppStore((s) => s.togglePreference);
  const setPreference = useAppStore((s) => s.setPreference);
  const b = useBoardStore.getState;

  return [
    { kind: 'header', id: 'h', title: t('menus.canvasMenu.atThisPoint'), detail: t('menus.canvasMenu.coords', { x: Math.round(world.x), y: Math.round(world.y) }), mono: true },
    {
      kind: 'quick',
      id: 'q',
      items: [
        { id: 'paste', label: t('menus.canvasMenu.quickPaste'), icon: <PasteIcon size={18} />, hint: `${t('menus.canvasMenu.paste')} · Ctrl + V`, onSelect: () => void pasteFromSystemClipboard(world) },
        { id: 'sticky', label: t('menus.canvasMenu.quickSticky'), icon: <StickyIcon size={18} />, hint: t('menus.canvasMenu.addStickyNote'), onSelect: () => createStickyAt(world) },
        { id: 'text', label: t('menus.canvasMenu.quickText'), icon: <TextIcon size={18} />, hint: t('menus.canvasMenu.addText'), onSelect: () => createTextAt(world) },
        { id: 'frame', label: t('menus.canvasMenu.quickFrame'), icon: <FrameIcon size={18} />, hint: `${t('menus.canvasMenu.addFrameHere')} · F`, onSelect: () => createFrameAt(null, world, b().toolOptions.frameRatio ?? 'free') },
        { id: 'comment', label: t('menus.canvasMenu.quickComment'), icon: <CommentPinIcon size={18} />, hint: t('menus.canvasMenu.addComment'), onSelect: () => startCommentDraft(world) },
      ],
    },
    { kind: 'separator', id: 's0' },
    {
      kind: 'submenu',
      id: 'insert-here',
      label: t('menus.canvasMenu.insertHere'),
      items: [
        { kind: 'item', id: 'add-image', label: t('menus.canvasMenu.insertImage'), onSelect: () => void pickAndInsertImages() },
        { kind: 'item', id: 'import-file', label: t('menus.canvasMenu.importFile'), hint: t('menus.canvasMenu.spreadsheetsCsvSvgExcalidraw'), onSelect: () => pickAndImportFiles() },
        { kind: 'item', id: 'template', label: t('menus.canvasMenu.template'), onSelect: () => useAppStore.getState().openModal({ type: 'templates', target: 'board' }) },
        { kind: 'separator', id: 'i1' },
        { kind: 'item', id: 'kanban', label: t('board.leftToolbar.kanban'), onSelect: () => void insertKanban(world) },
        { kind: 'item', id: 'table', label: t('board.leftToolbar.table'), onSelect: () => void insertTable(world) },
        { kind: 'item', id: 'mindmap', label: t('common.mindMap'), onSelect: () => void insertMindMap(world) },
        ...(hasSelection ? ([{ kind: 'separator', id: 'i2' }, { kind: 'item', id: 'frame-from-selection', label: t('menus.canvasMenu.createFrameSelection'), onSelect: () => createFrameFromSelection() }] as MenuItem[]) : []),
      ],
    },
    {
      kind: 'submenu',
      id: 'selection',
      label: t('menus.canvasMenu.selection'),
      items: [
        { kind: 'item', id: 'select-all', label: t('menus.canvasMenu.selectAll'), shortcut: 'Ctrl + A', onSelect: () => b().selectAll() },
        // só aparece quando há algo bloqueado (com a contagem)
        ...(lockedCount ? ([{ kind: 'item', id: 'unlock-all', label: t('menus.canvasMenu.unlockAllCount', { count: lockedCount }), onSelect: () => b().unlockAll() }] as MenuItem[]) : []),
      ],
    },
    {
      kind: 'submenu',
      id: 'view',
      label: t('menus.canvasMenu.view'),
      items: [
        { kind: 'item', id: 'initial-view', label: t('menus.canvasMenu.setInitialView'), hint: t('menus.canvasMenu.framesSelectionAllContentSaves'), onSelect: () => setInitialViewToContent() },
        { kind: 'item', id: 'initial-current', label: t('menus.canvasMenu.setCurrentViewAsInitial'), onSelect: () => setCurrentViewAsInitial() },
        { kind: 'item', id: 'go-initial', label: t('menus.canvasMenu.goInitialView'), disabled: !initialView, onSelect: () => initialView && b().animateCameraTo(initialView) },
        { kind: 'separator', id: 'v1' },
        { kind: 'item', id: 'fit', label: t('menus.canvasMenu.showEverything'), shortcut: 'Alt + 1', onSelect: () => b().zoomToFit() },
      ],
    },
    {
      kind: 'submenu',
      id: 'grid-nav',
      label: t('menus.canvasMenu.gridNavigation'),
      items: [
        { kind: 'toggle', variant: 'check', id: 'grid', label: t('menus.canvasMenu.showGrid'), shortcut: 'G', checked: grid.enabled, onToggle: () => b().setGridSettings({ enabled: !grid.enabled }) },
        {
          kind: 'submenu',
          id: 'grid-style',
          label: t('menus.canvasMenu.gridStyle'),
          items: [
            { kind: 'radio', id: 'none', label: t('common.none'), checked: !grid.enabled, onSelect: () => b().setGridSettings({ enabled: false }) },
            { kind: 'radio', id: 'lines', label: t('menus.canvasMenu.lineGrid'), checked: grid.enabled && grid.style === 'lines', onSelect: () => b().setGridSettings({ enabled: true, style: 'lines' }) },
            { kind: 'radio', id: 'dots', label: t('menus.canvasMenu.dotGrid'), checked: grid.enabled && grid.style === 'dots', onSelect: () => b().setGridSettings({ enabled: true, style: 'dots' }) },
          ],
        },
        { kind: 'toggle', variant: 'check', id: 'snap-grid', label: t('menus.canvasMenu.snapGrid'), checked: grid.snapToGrid, onToggle: () => b().setGridSettings({ snapToGrid: !grid.snapToGrid }) },
        { kind: 'toggle', variant: 'check', id: 'snap-objects', label: t('menus.canvasMenu.snapObjects'), checked: preferences.alignObjects, onToggle: () => togglePreference('alignObjects') },
        { kind: 'toggle', variant: 'check', id: 'object-size', label: t('menus.canvasMenu.showObjectsSize'), checked: preferences.showObjectSize, onToggle: () => togglePreference('showObjectSize') },
        { kind: 'toggle', variant: 'check', id: 'suggest-size', label: t('menus.canvasMenu.suggestObjectSize'), checked: preferences.suggestObjectSize, onToggle: () => togglePreference('suggestObjectSize') },
        { kind: 'toggle', variant: 'check', id: 'comments', label: t('menus.canvasMenu.showCommentsBoard'), shortcut: 'Shift + C', checked: preferences.showComments, onToggle: () => togglePreference('showComments') },
        { kind: 'separator', id: 'g1' },
        { kind: 'label', id: 'device-label', label: t('menus.canvasMenu.navigateWith') },
        { kind: 'radio', id: 'auto', label: t('menus.canvasMenu.automaticDetection'), checked: preferences.inputDevice === 'auto', onSelect: () => setPreference('inputDevice', 'auto') },
        { kind: 'radio', id: 'mouse', label: t('menus.canvasMenu.mouse'), checked: preferences.inputDevice === 'mouse', onSelect: () => setPreference('inputDevice', 'mouse') },
        { kind: 'radio', id: 'trackpad', label: t('menus.canvasMenu.trackpad'), checked: preferences.inputDevice === 'trackpad', onSelect: () => setPreference('inputDevice', 'trackpad') },
      ],
    },
  ];
}
