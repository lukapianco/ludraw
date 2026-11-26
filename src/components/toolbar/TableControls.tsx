import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownAZ,
  ArrowUpZA,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  Columns3,
  Combine,
  Italic,
  PaintBucket,
  Palette,
  Rows3,
  SquareSplitHorizontal,
  Trash2,
  Type,
  CaseSensitive,
} from 'lucide-react';
import type { TableElement } from '../../types/canvas';
import { useCan } from '../../hooks/useCan';
import { getCell, rangeIsSingle, rangeName, TABLE_CELL_FILLS } from '../../utils/table';
import { INK_COLORS } from '../../utils/factory';
import {
  activeRange,
  rangeAll,
  tableCanUnmerge,
  tableDeleteCols,
  tableDeleteRows,
  tableEqualizeCols,
  tableEqualizeRows,
  tableInsertCol,
  tableInsertRow,
  tableMerge,
  tablePatchCells,
  tableSort,
  tableToggleStyle,
  tableUnmerge,
  useTableUi,
} from '../../utils/tableActions';
import { Tooltip } from '../ui/Tooltip';
import { BorderIcon, TableBorderPanel, TableFontPanel, TableStylePanel, TableSwatches } from './TableFormatPanels';
import { useT } from '../../i18n/useT';

type PopId = 'rows' | 'cols' | 'font' | 'fill' | 'ink' | 'align' | 'borders' | 'style';

/**
 * Controles da Tabela na Barra de ações (Chat 04 + ajuste). Agem sobre o intervalo de células
 * selecionado (ou a tabela inteira quando nenhuma célula está ativa). O botão direito numa célula
 * abre as mesmas ações em formato de menu (`menus/tableMenu.tsx`).
 */
export function TableControls({ element }: { element: TableElement }) {
  const t = useT();
  const edit = useCan('board.edit');
  const ui = useTableUi((s) => (s.elementId === element.id ? s : null));
  const [open, setOpen] = useState<PopId | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const canEdit = edit.allowed && !element.locked;
  const reason = element.locked ? t('board.tableControls.theTableLocked') : edit.reason ?? '';
  const range = activeRange(element);
  const first = getCell(element, range.r0, range.c0);
  const single = rangeIsSingle(range);
  const scope = ui?.focus ? (single ? t('board.tableControls.inCellRangename', { rangeName: rangeName(range) }) : `em ${rangeName(range)}`) : t('board.tableControls.inWholeTable');
  const canUnmerge = tableCanUnmerge(element);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(null);
  };
  const p = { open, setOpen, disabled: !canEdit };

  return (
    <div ref={ref} className="flex items-center gap-0.5">
      <Pop id="rows" {...p} label={canEdit ? t('board.tableControls.rows') : reason} trigger={<Rows3 size={17} />}>
        <div className="flex w-[240px] flex-col p-1.5">
          <button type="button" className="od-menu-item" onClick={run(() => tableInsertRow(element.id, 'above'))}>
            <BetweenHorizontalStart size={16} className="rotate-180" />{' '}{t('board.tableControls.insertRowAbove')}</button>
          <button type="button" className="od-menu-item" onClick={run(() => tableInsertRow(element.id, 'below'))}>
            <BetweenHorizontalStart size={16} />{' '}{t('board.tableControls.insertRowBelow')}</button>
          <button type="button" className="od-menu-item is-danger" disabled={element.rows <= 1} onClick={run(() => tableDeleteRows(element.id))}>
            <Trash2 size={16} /> {range.r1 > range.r0 ? t('board.tableControls.deleteValueRows', { value: range.r1 - range.r0 + 1 }) : t('board.tableControls.deleteRowValue', { value: range.r0 + 1 })}
          </button>
          <div className="mx-1 my-1 h-px bg-line" />
          <button type="button" className="od-menu-item" onClick={run(() => tableEqualizeRows(element.id))}>
            <Rows3 size={16} />{' '}{t('board.tableControls.distributeRowsEvenly')}</button>
          <button type="button" className="od-menu-item" onClick={run(() => tableSort(element.id, 'asc'))}>
            <ArrowDownAZ size={16} />{' '}{t('board.tableControls.sortZThisColumn')}</button>
          <button type="button" className="od-menu-item" onClick={run(() => tableSort(element.id, 'desc'))}>
            <ArrowUpZA size={16} />{' '}{t('board.tableControls.sortZThisColumn2')}</button>
        </div>
      </Pop>
      <Pop id="cols" {...p} label={canEdit ? t('board.tableControls.columns') : reason} trigger={<Columns3 size={17} />}>
        <div className="flex w-[240px] flex-col p-1.5">
          <button type="button" className="od-menu-item" onClick={run(() => tableInsertCol(element.id, 'left'))}>
            <BetweenVerticalStart size={16} />{' '}{t('board.tableControls.insertColumnLeft')}</button>
          <button type="button" className="od-menu-item" onClick={run(() => tableInsertCol(element.id, 'right'))}>
            <BetweenVerticalStart size={16} className="rotate-180" />{' '}{t('board.tableControls.insertColumnRight')}</button>
          <button type="button" className="od-menu-item is-danger" disabled={element.cols <= 1} onClick={run(() => tableDeleteCols(element.id))}>
            <Trash2 size={16} /> {range.c1 > range.c0 ? t('board.tableControls.deleteValueColumns', { value: range.c1 - range.c0 + 1 }) : t('board.tableControls.deleteColumn')}
          </button>
          <div className="mx-1 my-1 h-px bg-line" />
          <button type="button" className="od-menu-item" onClick={run(() => tableEqualizeCols(element.id))}>
            <Columns3 size={16} />{' '}{t('board.tableControls.distributeColumnsEvenly')}</button>
        </div>
      </Pop>
      <Tooltip label={!canEdit ? reason : canUnmerge ? t('board.tableControls.unmergeScope', { scope }) : single ? t('board.tableControls.mergeCellsSelect2More') : t('board.tableControls.mergeRangename', { rangeName: rangeName(range) })} side="top">
        <button
          type="button"
          className="od-tool"
          disabled={!canEdit || (single && !canUnmerge)}
          data-active={canUnmerge}
          onClick={() => (canUnmerge ? tableUnmerge(element.id) : tableMerge(element.id))}
          aria-label={canUnmerge ? t('board.tableControls.unmerge') : t('board.tableControls.mergeCells')}
        >
          {canUnmerge ? <SquareSplitHorizontal size={17} /> : <Combine size={17} />}
        </button>
      </Tooltip>
      <span className="od-divider-v" />
      <Tooltip label={canEdit ? t('board.tableControls.boldScopeCtrlB', { scope }) : reason} side="top">
        <button type="button" className="od-tool" disabled={!canEdit} data-active={rangeAll(element, 'bold', range)} onClick={() => tableToggleStyle(element.id, 'bold')} aria-label={t('common.bold')}>
          <Bold size={17} />
        </button>
      </Tooltip>
      <Tooltip label={canEdit ? t('board.tableControls.italicScopeCtrlI', { scope }) : reason} side="top">
        <button type="button" className="od-tool" disabled={!canEdit} data-active={rangeAll(element, 'italic', range)} onClick={() => tableToggleStyle(element.id, 'italic')} aria-label={t('common.italic')}>
          <Italic size={17} />
        </button>
      </Tooltip>
      <Pop id="font" {...p} label={canEdit ? t('board.tableControls.fontSizeTextStyleScope', { scope }) : reason} trigger={<CaseSensitive size={19} />}>
        <TableFontPanel element={element} />
      </Pop>
      <Pop
        id="ink"
        {...p}
        label={canEdit ? t('board.tableControls.textColorScope', { scope }) : reason}
        trigger={<span className="relative flex flex-col items-center"><Type size={16} /><span className="mt-[1px] h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: first.textColor || '#18211C' }} /></span>}
      >
        <TableSwatches colors={['', ...INK_COLORS]} value={first.textColor ?? ''} title={t('board.tableControls.textColorEmptyAutomatic')} onPick={(c) => { tablePatchCells(element.id, { textColor: c || undefined }); setOpen(null); }} />
      </Pop>
      <Pop
        id="fill"
        {...p}
        label={canEdit ? t('board.tableControls.backgroundColorScope', { scope }) : reason}
        trigger={<span className="relative flex flex-col items-center"><PaintBucket size={16} /><span className="mt-[1px] h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: first.bgColor || 'transparent' }} /></span>}
      >
        <TableSwatches colors={TABLE_CELL_FILLS} value={first.bgColor ?? ''} title={t('common.backgroundColor')} onPick={(c) => { tablePatchCells(element.id, { bgColor: c || undefined }); setOpen(null); }} />
      </Pop>
      <Pop id="align" {...p} label={canEdit ? t('board.tableControls.alignmentScope', { scope }) : reason} trigger={first.align === 'center' ? <AlignCenter size={17} /> : first.align === 'right' ? <AlignRight size={17} /> : <AlignLeft size={17} />}>
        <AlignPanel elementId={element.id} align={first.align ?? 'left'} valign={first.valign ?? 'top'} />
      </Pop>
      <Pop id="borders" {...p} label={canEdit ? t('board.tableControls.bordersScope', { scope }) : reason} trigger={<BorderIcon preset="all" />}>
        <TableBorderPanel elementId={element.id} />
      </Pop>
      <Pop id="style" {...p} label={canEdit ? t('board.tableControls.tableStyleColorsHeaderBanded') : reason} trigger={<Palette size={17} />}>
        <TableStylePanel element={element} />
      </Pop>
      <span className="od-divider-v" />
    </div>
  );
}

export function AlignPanel({ elementId, align, valign }: { elementId: string; align: 'left' | 'center' | 'right'; valign: 'top' | 'middle' | 'bottom' }) {
  const t = useT();
  return (
    <div className="w-[196px] p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
        <AlignHorizontalJustifyCenter size={13} />{' '}{t('board.tableControls.horizontal')}</div>
      <div className="flex gap-0.5">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} type="button" className="od-tool" data-active={align === a} onClick={() => tablePatchCells(elementId, { align: a === 'left' ? undefined : a })} aria-label={a === 'left' ? t('common.left') : a === 'center' ? t('common.center') : t('common.right')} title={a === 'left' ? t('common.left') : a === 'center' ? t('common.center') : t('common.right')}>
            {a === 'left' ? <AlignLeft size={17} /> : a === 'center' ? <AlignCenter size={17} /> : <AlignRight size={17} />}
          </button>
        ))}
      </div>
      <div className="mb-1 mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
        <AlignVerticalJustifyCenter size={13} />{' '}{t('board.tableControls.vertical')}</div>
      <div className="flex gap-0.5">
        {(['top', 'middle', 'bottom'] as const).map((a) => (
          <button key={a} type="button" className="od-tool" data-active={valign === a} onClick={() => tablePatchCells(elementId, { valign: a === 'top' ? undefined : a })} aria-label={a === 'top' ? t('board.tableControls.top') : a === 'middle' ? t('board.tableControls.middle') : t('board.tableControls.bottom')} title={a === 'top' ? t('board.tableControls.top') : a === 'middle' ? t('board.tableControls.middle') : t('board.tableControls.bottom')}>
            {a === 'top' ? <AlignVerticalJustifyStart size={17} /> : a === 'middle' ? <AlignVerticalJustifyCenter size={17} /> : <AlignVerticalJustifyEnd size={17} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pop({ id, open, setOpen, label, disabled, trigger, children }: { id: PopId; open: PopId | null; setOpen: (id: PopId | null) => void; label: string; disabled?: boolean; trigger: ReactNode; children: ReactNode }) {
  const isOpen = open === id;
  return (
    <div className="relative">
      <Tooltip label={label} side="top" disabled={isOpen}>
        <button type="button" className="od-tool" data-active={isOpen} disabled={disabled} onClick={() => setOpen(isOpen ? null : id)} aria-label={label} aria-expanded={isOpen}>
          {trigger}
        </button>
      </Tooltip>
      {isOpen && (
        <div className="od-pop absolute left-1/2 top-[calc(100%+10px)] z-10 max-h-[min(70vh,520px)] -translate-x-1/2 animate-pop-in overflow-y-auto group-data-[pop=up]/ctx:bottom-[calc(100%+10px)] group-data-[pop=up]/ctx:top-auto">{children}</div>
      )}
    </div>
  );
}
