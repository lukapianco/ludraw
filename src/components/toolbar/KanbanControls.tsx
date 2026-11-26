import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, Columns3, Plus } from 'lucide-react';
import type { KanbanElement } from '../../types/canvas';
import { useCan } from '../../hooks/useCan';
import { KANBAN_COLUMN_WIDTHS, columnWidthOf, totalStoryPoints } from '../../utils/kanban';
import { kanbanAddCard, kanbanAddColumn, kanbanSetColumnWidth, kanbanSortByPriority, startKanbanEdit } from '../../utils/kanbanActions';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

/**
 * Controles do Kanban na Barra de ações (Chat 04): renomear, novo card (1ª coluna), nova coluna,
 * largura das colunas e ordenar todas as colunas por prioridade. Permissão pela via oficial
 * (`useCan('board.edit')`); as ações reaplicam `ensure`.
 */
export function KanbanControls({ element }: { element: KanbanElement }) {
  const t = useT();
  const edit = useCan('board.edit');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canEdit = edit.allowed && !element.locked;
  const reason = element.locked ? t('board.kanbanControls.theKanbanLocked') : edit.reason ?? '';
  const width = columnWidthOf(element);
  const cards = element.columns.flatMap((c) => c.cards);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  return (
    <div ref={ref} className="flex items-center gap-0.5">
      <span className="hidden px-1.5 text-[12px] font-semibold text-ink-subtle lg:inline">
        {t('board.kanbanControls.countCardsTotalstorypointsPts', { count: cards.length, totalStoryPoints: totalStoryPoints(cards) })}</span>
      {/* Chat 08.2 · C-2: renomear o quadro fica no segmento de identidade da Cinta */}
      <Tooltip label={canEdit ? t('board.kanbanControls.newCardIn', { column: element.columns[0]?.title ?? t('board.kanbanControls.columnFallback') }) : reason} side="top">
        <button type="button" className="od-tool w-auto gap-1 px-2 text-[12.5px] font-semibold" disabled={!canEdit || !element.columns.length} onClick={() => element.columns[0] && kanbanAddCard(element.id, element.columns[0].id)} aria-label={t('board.kanbanControls.newCard')}>
          <Plus size={16} />{' '}{t('board.kanbanControls.card')}</button>
      </Tooltip>
      <Tooltip label={canEdit ? t('board.kanbanControls.newColumn') : reason} side="top">
        <button
          type="button"
          className="od-tool w-auto gap-1 px-2 text-[12.5px] font-semibold"
          disabled={!canEdit}
          onClick={() => {
            const id = kanbanAddColumn(element.id);
            if (id) startKanbanEdit(element.id, { kind: 'column', columnId: id });
          }}
          aria-label={t('board.kanbanControls.newColumn')}
        >
          <Plus size={16} />{' '}{t('board.kanbanControls.column')}</button>
      </Tooltip>
      <div className="relative">
        <Tooltip label={canEdit ? t('board.kanbanControls.columnWidth') : reason} side="top" disabled={open}>
          <button type="button" className="od-tool" data-active={open} disabled={!canEdit} onClick={() => setOpen((o) => !o)} aria-label={t('board.kanbanControls.columnWidth')} aria-expanded={open}>
            <Columns3 size={17} />
          </button>
        </Tooltip>
        {open && (
          <div className="od-pop absolute left-1/2 top-[calc(100%+10px)] z-10 w-[200px] -translate-x-1/2 animate-pop-in p-1.5 group-data-[pop=up]/ctx:bottom-[calc(100%+10px)] group-data-[pop=up]/ctx:top-auto">
            <div className="px-2 pb-1 pt-0.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('board.kanbanControls.columnWidth')}</div>
            {KANBAN_COLUMN_WIDTHS.map((w) => (
              <button
                key={w.id}
                type="button"
                className="od-menu-item"
                onClick={() => {
                  kanbanSetColumnWidth(element.id, w.width);
                  setOpen(false);
                }}
              >
                <span className="flex-1">{w.label}</span>
                <span className="text-xs tabular-nums text-ink-subtle">{w.width}</span>
                {width === w.width && <Check size={15} className="text-selection" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <Tooltip label={canEdit ? t('board.kanbanControls.sortEveryColumnPriority') : reason} side="top">
        <button type="button" className="od-tool" disabled={!canEdit || cards.length < 2} onClick={() => kanbanSortByPriority(element.id)} aria-label={t('board.kanbanControls.sortPriority')}>
          <ArrowUpDown size={17} />
        </button>
      </Tooltip>
      <span className="od-divider-v" />
    </div>
  );
}
