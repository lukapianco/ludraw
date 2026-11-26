import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownAZ,
  ArrowUpZA,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  CaseSensitive,
  Columns3,
  Combine,
  Copy,
  Download,
  Eraser,
  FileSpreadsheet,
  PaintBucket,
  Palette,
  Rows3,
  SquareSplitHorizontal,
  Trash2,
  Type,
} from 'lucide-react';
import type { MenuItem } from '../components/ui/Menu';
import type { TableElement } from '../types/canvas';
import { useBoardStore, buildPermissionContext } from '../store/useBoardStore';
import { can } from '../utils/permissions';
import { getCell, rangeIsSingle, rangeName, TABLE_CELL_FILLS } from '../utils/table';
import { INK_COLORS } from '../utils/factory';
import { copyTableForSpreadsheet, exportTableCsv } from '../utils/exportActions';
import {
  activeRange,
  tableCanUnmerge,
  tableClearRange,
  tableCopyRange,
  tableDeleteCols,
  tableDeleteRows,
  tableDeleteTable,
  tableEqualizeCols,
  tableEqualizeRows,
  tableInsertCol,
  tableInsertRow,
  tableMerge,
  tablePatchCells,
  tableSort,
  tableUnmerge,
  useTableUi,
} from '../utils/tableActions';
import { BorderIcon, TableBorderPanel, TableFontPanel, TableStylePanel, TableSwatches } from '../components/toolbar/TableFormatPanels';
import { CopyIcon, LockIcon, TrashIcon, UnlockIcon } from '../components/icons/od';
import { useT } from '../i18n/useT';

const I = 16;

/**
 * Menu do botão direito sobre uma tabela (ajuste pós-Chat 04), no estilo das planilhas: o clique
 * direito marca a célula (ou mantém o intervalo selecionado) e o menu traz as ações da seleção —
 * inserir/excluir linhas e colunas, mesclar, texto, alinhamento, cores, bordas, estilo da tabela,
 * ordenar e copiar. Devolve null quando a seleção não é uma única tabela.
 */
export function useTableMenuItems(): MenuItem[] | null {
  const t = useT();
  const el = useBoardStore((s) => {
    if (s.selectedIds.length !== 1) return null;
    const e = s.elements[s.selectedIds[0]];
    return e && e.type === 'table' ? (e as TableElement) : null;
  });
  // re-renderiza quando a célula ativa muda
  useTableUi((s) => `${s.elementId}|${s.anchor?.r},${s.anchor?.c}|${s.focus?.r},${s.focus?.c}`);
  const canEdit = useBoardStore((s) => !s.readOnly && !s.presenting && can(buildPermissionContext(s), 'board.edit'));
  if (!el) return null;

  const id = el.id;
  const editable = canEdit && !el.locked;
  const range = activeRange(el);
  const single = rangeIsSingle(range);
  const nRows = range.r1 - range.r0 + 1;
  const nCols = range.c1 - range.c0 + 1;
  const first = getCell(el, range.r0, range.c0);
  const canUnmerge = tableCanUnmerge(el);
  const ro = !editable;
  const hint = el.locked ? t('menus.tableMenu.tableLocked') : undefined;

  const raw: MenuItem[] = [
    { kind: 'label', id: 't-label', label: t(single ? 'menus.tableMenu.tableCell' : 'menus.tableMenu.tableRange', { range: rangeName(range) }) },
    { kind: 'item', id: 't-copy', label: single ? t('menus.tableMenu.copyCellText') : t('menus.tableMenu.copyCells'), icon: <Copy size={I} />, shortcut: single ? undefined : 'Ctrl+C', onSelect: () => tableCopyRange(id) },
    {
      kind: 'submenu',
      id: 't-sheet',
      label: t('menus.tableMenu.takeSpreadsheets'),
      icon: <FileSpreadsheet size={I} />,
      items: [
        { kind: 'item', id: 't-copy-sheet', label: t('menus.tableMenu.copyWholeTableTsvHtml'), icon: <Copy size={I} />, hint: t('menus.tableMenu.pastesMergesBoldColors'), onSelect: () => void copyTableForSpreadsheet(id, true) },
        { kind: 'item', id: 't-copy-range', label: single ? t('menus.tableMenu.copyCellTsvHtml') : t('menus.tableMenu.copyRangenameTsvHtml', { rangeName: rangeName(range) }), onSelect: () => void copyTableForSpreadsheet(id) },
        { kind: 'separator', id: 't-sheet-s' },
        { kind: 'item', id: 't-csv-semicolon', label: t('menus.tableMenu.exportTableCsvSemicolon'), icon: <Download size={I} />, onSelect: () => exportTableCsv(id, ';') },
        { kind: 'item', id: 't-csv-comma', label: t('menus.tableMenu.exportTableCsvComma'), icon: <Download size={I} />, onSelect: () => exportTableCsv(id, ',') },
      ],
    },
    { kind: 'item', id: 't-clear', label: t('menus.tableMenu.clearContent'), icon: <Eraser size={I} />, shortcut: 'Delete', onSelect: () => tableClearRange(id), disabled: ro, hint },
    { kind: 'separator', id: 't-s1' },
    { kind: 'item', id: 't-row-above', label: nRows > 1 ? t('menus.tableMenu.insertNrowsRowsAbove', { nRows }) : t('menus.tableMenu.insertRowAbove'), icon: <BetweenHorizontalStart size={I} className="rotate-180" />, onSelect: () => repeat(nRows, () => tableInsertRow(id, 'above')), disabled: ro },
    { kind: 'item', id: 't-row-below', label: nRows > 1 ? t('menus.tableMenu.insertNrowsRowsBelow', { nRows }) : t('menus.tableMenu.insertRowBelow'), icon: <BetweenHorizontalStart size={I} />, onSelect: () => repeat(nRows, () => tableInsertRow(id, 'below')), disabled: ro },
    { kind: 'item', id: 't-col-left', label: nCols > 1 ? t('menus.tableMenu.insertNcolsColumnsLeft', { nCols }) : t('menus.tableMenu.insertColumnLeft'), icon: <BetweenVerticalStart size={I} />, onSelect: () => repeat(nCols, () => tableInsertCol(id, 'left')), disabled: ro },
    { kind: 'item', id: 't-col-right', label: nCols > 1 ? t('menus.tableMenu.insertNcolsColumnsRight', { nCols }) : t('menus.tableMenu.insertColumnRight'), icon: <BetweenVerticalStart size={I} className="rotate-180" />, onSelect: () => repeat(nCols, () => tableInsertCol(id, 'right')), disabled: ro },
    { kind: 'separator', id: 't-s2' },
    {
      kind: 'item',
      id: 't-del-row',
      label: nRows > 1 ? t('menus.tableMenu.deleteRowsValueValue2', { value: range.r0 + 1, value2: range.r1 + 1 }) : t('menus.tableMenu.deleteRowValue', { value: range.r0 + 1 }),
      icon: <Trash2 size={I} />,
      danger: true,
      onSelect: () => tableDeleteRows(id),
      disabled: ro || nRows >= el.rows,
      hint: nRows >= el.rows ? t('menus.tableMenu.theTableNeeds1Row') : hint,
    },
    {
      kind: 'item',
      id: 't-del-col',
      label: nCols > 1 ? t('menus.tableMenu.deleteColumnsColletters', { colLetters: colLetters(range.c0, range.c1) }) : t('menus.tableMenu.deleteColumnColletters', { colLetters: colLetters(range.c0, range.c0) }),
      icon: <Trash2 size={I} />,
      danger: true,
      onSelect: () => tableDeleteCols(id),
      disabled: ro || nCols >= el.cols,
      hint: nCols >= el.cols ? t('menus.tableMenu.theTableNeeds1Column') : hint,
    },
    { kind: 'separator', id: 't-s3' },
    canUnmerge
      ? { kind: 'item', id: 't-unmerge', label: t('menus.tableMenu.unmerge'), icon: <SquareSplitHorizontal size={I} />, onSelect: () => tableUnmerge(id), disabled: ro }
      : { kind: 'item', id: 't-merge', label: t('menus.tableMenu.mergeCells'), icon: <Combine size={I} />, onSelect: () => tableMerge(id), disabled: ro || single, hint: single ? t('menus.tableMenu.select2Cells') : undefined },
    { kind: 'submenu', id: 't-text', label: t('menus.tableMenu.textFont'), icon: <CaseSensitive size={I + 2} />, disabled: ro, items: [{ kind: 'custom', id: 't-font-panel', render: () => <TableFontPanel element={el} /> }] },
    {
      kind: 'submenu',
      id: 't-align',
      label: t('menus.tableMenu.alignment'),
      icon: <AlignLeft size={I} />,
      disabled: ro,
      items: [
        { kind: 'label', id: 'ah', label: t('menus.tableMenu.horizontal') },
        { kind: 'radio', id: 'al', label: t('common.left'), icon: <AlignLeft size={I} />, checked: (first.align ?? 'left') === 'left', onSelect: () => tablePatchCells(id, { align: undefined }) },
        { kind: 'radio', id: 'ac', label: t('common.center'), icon: <AlignCenter size={I} />, checked: first.align === 'center', onSelect: () => tablePatchCells(id, { align: 'center' }) },
        { kind: 'radio', id: 'ar', label: t('common.right'), icon: <AlignRight size={I} />, checked: first.align === 'right', onSelect: () => tablePatchCells(id, { align: 'right' }) },
        { kind: 'separator', id: 'as' },
        { kind: 'label', id: 'av', label: t('menus.tableMenu.vertical') },
        { kind: 'radio', id: 'vt', label: t('menus.tableMenu.top'), icon: <AlignVerticalJustifyStart size={I} />, checked: (first.valign ?? 'top') === 'top', onSelect: () => tablePatchCells(id, { valign: undefined }) },
        { kind: 'radio', id: 'vm', label: t('menus.tableMenu.middle'), icon: <AlignVerticalJustifyCenter size={I} />, checked: first.valign === 'middle', onSelect: () => tablePatchCells(id, { valign: 'middle' }) },
        { kind: 'radio', id: 'vb', label: t('menus.tableMenu.bottom'), icon: <AlignVerticalJustifyEnd size={I} />, checked: first.valign === 'bottom', onSelect: () => tablePatchCells(id, { valign: 'bottom' }) },
      ],
    },
    {
      kind: 'submenu',
      id: 't-fill',
      label: t('common.backgroundColor'),
      icon: <PaintBucket size={I} />,
      disabled: ro,
      items: [{ kind: 'custom', id: 't-fill-panel', render: (close) => <TableSwatches colors={TABLE_CELL_FILLS} value={first.bgColor ?? ''} title={t('common.backgroundColor')} onPick={(c) => { tablePatchCells(id, { bgColor: c || undefined }); close(); }} /> }],
    },
    {
      kind: 'submenu',
      id: 't-ink',
      label: t('common.textColor'),
      icon: <Type size={I} />,
      disabled: ro,
      items: [{ kind: 'custom', id: 't-ink-panel', render: (close) => <TableSwatches colors={['', ...INK_COLORS]} value={first.textColor ?? ''} title={t('menus.tableMenu.textColorEmptyAutomatic')} onPick={(c) => { tablePatchCells(id, { textColor: c || undefined }); close(); }} /> }],
    },
    { kind: 'submenu', id: 't-borders', label: t('menus.tableMenu.borders'), icon: <BorderIcon preset="all" size={16} />, disabled: ro, items: [{ kind: 'custom', id: 't-border-panel', render: () => <TableBorderPanel elementId={id} /> }] },
    { kind: 'separator', id: 't-s4' },
    { kind: 'item', id: 't-sort-asc', label: t('menus.tableMenu.sortZColumnColletters', { colLetters: colLetters(range.c0, range.c0) }), icon: <ArrowDownAZ size={I} />, onSelect: () => tableSort(id, 'asc'), disabled: ro },
    { kind: 'item', id: 't-sort-desc', label: t('menus.tableMenu.sortZColumnColletters2', { colLetters: colLetters(range.c0, range.c0) }), icon: <ArrowUpZA size={I} />, onSelect: () => tableSort(id, 'desc'), disabled: ro },
    {
      kind: 'submenu',
      id: 't-table',
      label: t('menus.tableMenu.table'),
      icon: <Palette size={I} />,
      disabled: ro,
      items: [
        { kind: 'custom', id: 't-style-panel', render: () => <TableStylePanel element={el} /> },
        { kind: 'separator', id: 'ts' },
        { kind: 'item', id: 't-eq-cols', label: t('menus.tableMenu.distributeColumnsEvenly'), icon: <Columns3 size={I} />, onSelect: () => tableEqualizeCols(id) },
        { kind: 'item', id: 't-eq-rows', label: t('menus.tableMenu.distributeRowsEvenly'), icon: <Rows3 size={I} />, onSelect: () => tableEqualizeRows(id) },
      ],
    },
    { kind: 'item', id: 't-delete', label: t('menus.tableMenu.deleteTable'), icon: <Trash2 size={I} />, danger: true, onSelect: () => tableDeleteTable(id), disabled: ro, hint },
  ];

  // Chat 08.2 · C-2 (§5.2): os MESMOS itens de antes, reagrupados — cabeçalho "Tabela · B3", linha rápida e 6 linhas
  // (a 6ª, "Objeto ▸", é o menu do objeto inteiro e é acrescentada por quem monta o menu)
  const byId = new Map(raw.map((it) => [it.id, it]));
  const pick = (...ids: string[]) => ids.map((k) => byId.get(k)).filter((it): it is MenuItem => !!it);
  const tableSub = byId.get('t-table');
  const eqItems = tableSub && tableSub.kind === 'submenu' ? tableSub.items.filter((it) => it.id === 't-eq-cols' || it.id === 't-eq-rows') : [];
  const stylePanel = tableSub && tableSub.kind === 'submenu' ? tableSub.items.filter((it) => it.id === 't-style-panel') : [];
  const mergeItem = byId.get('t-unmerge') ?? byId.get('t-merge');
  return [
    { kind: 'header', id: 't-h', title: t('menus.tableMenu.header'), detail: rangeName(range), mono: true },
    {
      kind: 'quick',
      id: 't-q',
      items: [
        { id: 't-copy', label: t('menus.objectMenu.quickCopy'), icon: <CopyIcon size={18} />, hint: single ? t('menus.tableMenu.copyCellText') : t('menus.tableMenu.copyCells'), onSelect: () => (byId.get('t-copy') as { onSelect: () => void }).onSelect() },
        { id: 't-clear', label: t('menus.tableMenu.quickClear'), icon: <Eraser size={18} />, hint: t('menus.tableMenu.clearContent'), disabled: ro, onSelect: () => tableClearRange(id) },
        canUnmerge
          ? { id: 't-unmerge', label: t('menus.tableMenu.quickUnmerge'), icon: <SquareSplitHorizontal size={18} />, hint: t('menus.tableMenu.unmerge'), disabled: ro, onSelect: () => tableUnmerge(id) }
          : { id: 't-merge', label: t('menus.tableMenu.quickMerge'), icon: <Combine size={18} />, hint: t('menus.tableMenu.mergeCells'), disabled: ro || single, onSelect: () => tableMerge(id) },
        el.locked
          ? { id: 't-unlock', label: t('menus.objectMenu.quickUnlock'), icon: <UnlockIcon size={18} />, hint: t('menus.elementMenu.unlock'), onSelect: () => useBoardStore.getState().setLockMode([id], 'none') }
          : { id: 't-lock', label: t('menus.objectMenu.quickLock'), icon: <LockIcon size={18} />, hint: t('board.lockMenu.standardLock'), onSelect: () => useBoardStore.getState().setLockMode([id], 'standard') },
        { id: 't-delete', label: t('menus.tableMenu.quickDeleteTable'), icon: <TrashIcon size={18} />, hint: t('menus.tableMenu.deleteTable'), danger: true, disabled: ro, onSelect: () => tableDeleteTable(id) },
      ],
    },
    { kind: 'separator', id: 't-s0' },
    { kind: 'submenu', id: 't-rows-cols', label: t('menus.tableMenu.rowsColumns'), icon: <Rows3 size={I} />, items: [...pick('t-row-above', 't-row-below', 't-col-left', 't-col-right'), { kind: 'separator', id: 'rc1' }, ...pick('t-del-row', 't-del-col'), { kind: 'separator', id: 'rc2' }, ...eqItems] },
    { kind: 'submenu', id: 't-text-align', label: t('menus.tableMenu.textAlign'), icon: <CaseSensitive size={I + 2} />, disabled: ro, items: [...pick('t-text', 't-align', 't-ink'), ...(mergeItem ? [{ kind: 'separator', id: 'ta1' } as MenuItem, mergeItem] : [])] },
    { kind: 'submenu', id: 't-fill-borders', label: t('menus.tableMenu.fillBorders'), icon: <PaintBucket size={I} />, disabled: ro, items: [...pick('t-fill', 't-borders'), ...(stylePanel.length ? [{ kind: 'separator', id: 'fb1' } as MenuItem, { kind: 'label', id: 'fb-l', label: t('menus.tableMenu.table') } as MenuItem, ...stylePanel] : [])] },
    { kind: 'submenu', id: 't-sort', label: t('menus.tableMenu.sort'), icon: <ArrowDownAZ size={I} />, disabled: ro, items: pick('t-sort-asc', 't-sort-desc') },
    ...pick('t-sheet'),
  ];
}

/** Repete uma inserção (as ações de inserir já reposicionam a célula ativa). */
function repeat(n: number, fn: () => void) {
  for (let i = 0; i < n; i++) fn();
}

function colLetters(c0: number, c1: number): string {
  const name = (c: number) => rangeName({ r0: 0, c0: c, r1: 0, c1: c }).replace(/\d+$/, '');
  return c0 === c1 ? name(c0) : `${name(c0)}–${name(c1)}`;
}
