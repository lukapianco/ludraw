import { useCallback } from 'react';
import { useBoardStore, type ContextMenuState } from '../../store/useBoardStore';
import { Menu } from '../ui/Menu';
import { useCanvasMenuItems } from '../../menus/canvasMenu';
import { useElementMenuItems } from '../../menus/elementMenu';
import { useTableMenuItems } from '../../menus/tableMenu';
import { MoreIcon } from '../icons/od';
import { useT } from '../../i18n/useT';

/** Renderiza o menu do botão direito (objeto ou área vazia) conforme `contextMenu` da store. */
export function CanvasContextMenu() {
  const menu = useBoardStore((s) => s.contextMenu);
  const close = useCallback(() => useBoardStore.getState().setContextMenu(null), []);
  if (!menu) return null;
  return menu.target === 'element' ? <ElementContext menu={menu} onClose={close} /> : <CanvasContext menu={menu} onClose={close} />;
}

function ElementContext({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const t = useT();
  const items = useElementMenuItems();
  const tableItems = useTableMenuItems();
  // Tabela: ações da faixa de células primeiro (como nas planilhas); a 6ª linha, "Objeto ▸", é o menu do objeto inteiro
  // (sem o cabeçalho e a linha rápida dele, que a tabela já tem)
  const all = tableItems
    ? [...tableItems, { kind: 'submenu' as const, id: 'obj-more', label: t('menus.tableMenu.object'), icon: <MoreIcon size={16} />, items: items.filter((it) => it.kind !== 'header' && it.kind !== 'quick' && it.id !== 's0') }]
    : items;
  return <Menu items={all} x={menu.x} y={menu.y} onClose={onClose} minWidth={300} />;
}

function CanvasContext({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const items = useCanvasMenuItems(menu.world);
  return <Menu items={items} x={menu.x} y={menu.y} onClose={onClose} minWidth={300} />;
}
