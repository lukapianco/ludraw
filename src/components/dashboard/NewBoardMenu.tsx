import { useState } from 'react';
import { ChevronDown, FolderInput, LayoutTemplate, ListOrdered, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { importBackup } from '../../utils/boardActions';
import { cn } from '../../utils/cn';
import { Menu, type MenuItem } from '../ui/Menu';
import { startFromTemplate, templateById } from './templates';
import { useT } from '../../i18n/useT';

/**
 * Botão dividido "Novo board": a parte principal cria um board em branco; a seta abre
 * Em branco · Comece por aqui · A partir de template · Importar backup.
 */
export function NewBoardMenu({ onTemplates, className }: { onTemplates: () => void; className?: string }) {
  const t = useT();
  const createBoard = useAppStore((s) => s.createBoard);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const items: MenuItem[] = [
    { kind: 'item', id: 'blank', label: t('common.blank'), icon: <Plus size={16} />, onSelect: () => createBoard({ template: 'blank', open: true }) },
    {
      kind: 'item',
      id: 'welcome',
      label: t('dashboard.newBoardMenu.startHereGuided'),
      icon: <ListOrdered size={16} />,
      onSelect: () => {
        const t = templateById('welcome');
        if (t) startFromTemplate(t);
      },
    },
    { kind: 'item', id: 'template', label: t('dashboard.newBoardMenu.fromTemplate'), icon: <LayoutTemplate size={16} />, onSelect: onTemplates },
    { kind: 'separator', id: 's' },
    { kind: 'item', id: 'import', label: t('dashboard.newBoardMenu.importBackupLudraw'), icon: <FolderInput size={16} />, onSelect: () => void importBackup() },
  ];

  return (
    <div className={cn('inline-flex shrink-0 items-stretch overflow-hidden rounded-lg shadow-panel', className)}>
      <button type="button" className="od-btn od-btn-primary rounded-none ps-3.5 pe-3" onClick={() => createBoard({ template: 'blank', open: true })}>
        <Plus size={17} />{' '}{t('common.newBoard')}</button>
      <span className="w-px bg-brand-950/40 dark:bg-brand-950/25" aria-hidden="true" />
      <button
        type="button"
        data-od-menu-trigger
        className="od-btn od-btn-primary rounded-none px-2.5"
        aria-label={t('dashboard.newBoardMenu.moreWaysCreateBoard')}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(e) => {
          if (menu) {
            setMenu(null);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.right, y: r.bottom + 6 });
        }}
      >
        <ChevronDown size={16} className={cn('transition-transform duration-base ease-out', menu && 'rotate-180')} />
      </button>
      {menu && <Menu items={items} x={menu.x} y={menu.y} align="end" minWidth={250} onClose={() => setMenu(null)} />}
    </div>
  );
}
