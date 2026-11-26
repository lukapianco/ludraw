import { memo, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { fontWithLineHeight } from '../../utils/text';
import { Plus } from 'lucide-react';
import type { TableElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { anchorOf, edgeDashArray, expandRange, layoutTable, normalizeRange, TABLE_COLORS, TABLE_PAD_X, TABLE_PAD_Y, TABLE_RADIUS, tableStyleOf, type CellRef } from '../../utils/table';
import {
  moveEditCell,
  setActiveCell,
  setCellText,
  stopEditCell,
  tableEditable,
  tableInsertCol,
  tableInsertRow,
  tableSetColWidth,
  tableSetRowHeight,
  useTableUi,
} from '../../utils/tableActions';
import { useT } from '../../i18n/useT';

interface Props {
  element: TableElement;
  isEditing: boolean;
}

/**
 * Tabela interativa no canvas (Chat 04). Geometria única (`utils/table.ts`): o texto quebra dentro
 * da célula e a linha cresce — igual no PNG/PDF.
 *
 * - 1º clique seleciona a tabela e a célula; com a tabela selecionada, arrastar sobre as células
 *   seleciona um intervalo (Shift + clique estende). Para mover a tabela, arraste a alça "⋮⋮" acima dela.
 * - Duplo clique, Enter, F2 ou digitar editam a célula; Tab/Shift+Tab andam, Enter desce, Esc fecha.
 * - Bordas das colunas e das linhas podem ser arrastadas para redimensionar; "+" nas bordas cria
 *   linha/coluna. Botão direito numa célula abre o menu da tabela (inserir/excluir, mesclar,
 *   texto, alinhamento, cores, bordas, estilo, ordenar); os mesmos controles estão na Barra de ações.
 */
export const TableView = memo(function TableView({ element, isEditing }: Props) {
  const t = useT();
  const layout = layoutTable(element);
  const zoom = useBoardStore((s) => s.camera.zoom);
  const selected = useBoardStore((s) => s.selectedIds.length === 1 && s.selectedIds[0] === element.id);
  const canEdit = useBoardStore(() => tableEditable(element, true));
  const ui = useTableUi((s) => (s.elementId === element.id ? s : null));
  const editingCell = isEditing && ui?.editing ? ui.editing : null;
  const range = selected && ui?.focus ? expandRange(element, normalizeRange(ui.anchor ?? ui.focus, ui.focus)) : null;
  const style = tableStyleOf(element);
  const radius = layout.customOuter ? 0 : TABLE_RADIUS;
  const interactive = selected && canEdit;
  const px = 1 / zoom;

  const onCellPointerDown = (e: ReactPointerEvent<HTMLDivElement>, cell: CellRef) => {
    if (e.button !== 0) return;
    const s = useBoardStore.getState();
    if (s.activeTool !== 'select') return;
    const isSel = s.selectedIds.length === 1 && s.selectedIds[0] === element.id;
    const ui0 = useTableUi.getState();
    if (ui0.elementId === element.id && ui0.editing && (ui0.editing.r !== cell.r || ui0.editing.c !== cell.c)) stopEditCell(element.id);
    if (!isSel) {
      // 1º clique: deixa o palco selecionar (e permitir arrastar a tabela) e marca a célula
      setActiveCell(element.id, cell);
      return;
    }
    // Tabela já selecionada: o ponteiro seleciona células (arrastar = intervalo)
    e.stopPropagation();
    e.preventDefault();
    setActiveCell(element.id, cell, e.shiftKey);
    const onMove = (ev: PointerEvent) => {
      const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-table-cell]') as HTMLElement | null;
      if (!hit || hit.closest('[data-element-id]')?.getAttribute('data-element-id') !== element.id) return;
      const [r, c] = (hit.dataset.tableCell ?? '').split('-').map(Number);
      if (Number.isFinite(r) && Number.isFinite(c)) {
        const f = useTableUi.getState().focus;
        if (!f || f.r !== r || f.c !== c) setActiveCell(element.id, { r, c }, true);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="absolute inset-0" style={{ userSelect: 'none', fontFamily: 'Figtree, system-ui, sans-serif' }}>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ background: TABLE_COLORS.body, borderRadius: radius, boxShadow: layout.customOuter ? `0 ${2 * px}px ${8 * px}px rgba(20,36,26,0.08)` : `0 0 0 ${px}px ${style.border}, 0 ${2 * px}px ${8 * px}px rgba(20,36,26,0.08)` }}
      >
        {layout.cells.map((cell) => (
          <div
            key={`${cell.r}-${cell.c}`}
            data-table-cell={`${cell.r}-${cell.c}`}
            className="absolute overflow-hidden"
            style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height, background: cell.background === TABLE_COLORS.body ? undefined : cell.background }}
            onPointerDown={(e) => onCellPointerDown(e, { r: cell.r, c: cell.c })}
          >
            {!(editingCell && editingCell.r === cell.r && editingCell.c === cell.c) && (
              <div
                style={{
                  padding: `${cell.textTop}px ${TABLE_PAD_X}px 0`,
                  font: fontWithLineHeight(cell.font, cell.lineHeight),
                  color: cell.color,
                  textAlign: cell.align,
                  textDecoration: [cell.underline && 'underline', cell.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
                }}
              >
                {cell.lines.map((l, i) => (
                  <span key={i} className="block whitespace-pre">
                    {l || ' '}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Grade e bordas (mesma lista do export) — fora do recorte para bordas grossas no contorno */}
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
        {layout.edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            x2={e.x2}
            y1={e.y1}
            y2={e.y2}
            stroke={e.color}
            strokeWidth={Math.max(px, e.width)}
            strokeDasharray={edgeDashArray(e)}
            strokeLinecap={e.style === 'dotted' ? 'round' : 'square'}
          />
        ))}
      </svg>

      {/* Intervalo selecionado */}
      {range && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: layout.colX[range.c0] ?? 0,
            top: layout.rowY[range.r0] ?? 0,
            width: (layout.colX[range.c1] ?? 0) + (layout.colW[range.c1] ?? 0) - (layout.colX[range.c0] ?? 0),
            height: (layout.rowY[range.r1] ?? 0) + (layout.rowH[range.r1] ?? 0) - (layout.rowY[range.r0] ?? 0),
            boxShadow: `inset 0 0 0 ${2 * px}px var(--od-selection)`,
            background: range.r0 === range.r1 && range.c0 === range.c1 ? undefined : 'var(--od-selection-fill)',
          }}
        />
      )}

      {/* Célula em edição */}
      {editingCell && editingCell.r < element.rows && editingCell.c < element.cols && (
        <CellEditor element={element} cell={editingCell} rect={layout.byKey[`${editingCell.r}-${editingCell.c}`]} />
      )}

      {/* Alça para mover a tabela (com ela selecionada, arrastar nas células seleciona intervalos) */}
      {selected && !element.locked && (
        <div
          className="absolute flex items-center gap-1 rounded-t-md"
          style={{
            left: 0,
            bottom: '100%',
            height: 18,
            padding: '0 6px',
            transform: `scale(${px})`,
            transformOrigin: 'bottom left',
            background: 'var(--od-selection)',
            color: '#fff',
            font: '700 10.5px Figtree, system-ui, sans-serif',
            cursor: 'move',
            whiteSpace: 'nowrap',
          }}
          title={t('widgets.tableView.dragMoveTable')}
        >{t('widgets.tableView.tableRowsCols', { rows: element.rows, cols: element.cols })}
        </div>
      )}

      {/* Redimensionar colunas e linhas + inserir nas bordas */}
      {interactive && !editingCell && (
        <>
          {/* faixas só onde a linha da grade existe (nunca por dentro de uma célula mesclada) */}
          {layout.colX.flatMap((x, i) =>
            handleSegments(element.rows, (r) => i === element.cols - 1 || !sameAnchor(element, r, i, r, i + 1)).map(([a, b]) => (
              <ResizeHandle key={`cw${i}-${a}`} axis="col" index={i} element={element} pos={x + layout.colW[i]} start={layout.rowY[a]} length={layout.rowY[b] + layout.rowH[b] - layout.rowY[a]} size={layout.colW[i]} zoom={zoom} />
            )),
          )}
          {layout.rowY.flatMap((y, i) =>
            handleSegments(element.cols, (c) => i === element.rows - 1 || !sameAnchor(element, i, c, i + 1, c)).map(([a, b]) => (
              <ResizeHandle key={`rh${i}-${a}`} axis="row" index={i} element={element} pos={y + layout.rowH[i]} start={layout.colX[a]} length={layout.colX[b] + layout.colW[b] - layout.colX[a]} size={layout.rowH[i]} zoom={zoom} />
            )),
          )}
          {/* nos cantos: o meio de cada lado é dos pontos de conexão */}
          <EdgeButton label={t('widgets.tableView.addColumnRight')} style={{ left: layout.width + 14 * px, top: Math.min(layout.height / 2, 14 * px) }} zoom={zoom} onClick={() => {
            setActiveCell(element.id, { r: 0, c: element.cols - 1 });
            tableInsertCol(element.id, 'right');
          }} />
          <EdgeButton label={t('widgets.tableView.addRowBelow')} style={{ left: Math.min(layout.width / 2, 44 * px), top: layout.height + 14 * px }} zoom={zoom} onClick={() => {
            setActiveCell(element.id, { r: element.rows - 1, c: 0 });
            tableInsertRow(element.id, 'below');
          }} />
        </>
      )}
    </div>
  );
});

function sameAnchor(el: TableElement, r1: number, c1: number, r2: number, c2: number): boolean {
  const a = anchorOf(el, r1, c1);
  const b = anchorOf(el, r2, c2);
  return a.r === b.r && a.c === b.c;
}

/** Trechos contínuos [início, fim] (índices) onde `visible` é verdadeiro. */
function handleSegments(count: number, visible: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= count; i++) {
    const v = i < count && visible(i);
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

function EdgeButton({ label, style, zoom, onClick }: { label: string; style: { left: number; top: number }; zoom: number; onClick: () => void }) {
  return (
    <button
      type="button"
      data-od-floating
      className="absolute flex h-5 w-5 items-center justify-center rounded-full text-white shadow-panel transition-transform duration-fast ease-out hover:scale-110"
      style={{ ...style, transform: `translate(-50%, -50%) scale(${1 / zoom})`, background: 'var(--od-selection)' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Plus size={13} strokeWidth={2.6} />
    </button>
  );
}

/** Faixa arrastável na borda direita de uma coluna (ou inferior de uma linha). */
function ResizeHandle({ axis, index, element, pos, start: from = 0, length, size, zoom }: { axis: 'col' | 'row'; index: number; element: TableElement; pos: number; start?: number; length: number; size: number; zoom: number }) {
  const grip = 8 / zoom;
  return (
    <div
      data-od-floating
      className="group absolute"
      style={
        axis === 'col'
          ? { left: pos - grip / 2, top: from, width: grip, height: length, cursor: 'col-resize' }
          : { left: from, top: pos - grip / 2, width: length, height: grip, cursor: 'row-resize' }
      }
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const start = axis === 'col' ? e.clientX : e.clientY;
        const z = useBoardStore.getState().camera.zoom;
        let first = true;
        const onMove = (ev: PointerEvent) => {
          const delta = ((axis === 'col' ? ev.clientX : ev.clientY) - start) / z;
          if (axis === 'col') tableSetColWidth(element.id, index, size + delta, first);
          else tableSetRowHeight(element.id, index, size + delta, first);
          first = false;
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-hidden="true"
    >
      <span
        className="absolute opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        style={axis === 'col' ? { left: grip / 2 - 1 / zoom, top: 0, width: 2 / zoom, height: '100%', background: 'var(--od-selection)' } : { top: grip / 2 - 1 / zoom, left: 0, height: 2 / zoom, width: '100%', background: 'var(--od-selection)' }}
      />
    </div>
  );
}

/** Campo da célula: grava a cada tecla; Tab/Shift+Tab/Enter navegam, Shift+Enter quebra linha, Esc fecha. */
function CellEditor({ element, cell, rect }: { element: TableElement; cell: CellRef; rect: ReturnType<typeof layoutTable>['cells'][number] | undefined }) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    const draft = useTableUi.getState().draftInitial;
    ta.focus({ preventScroll: true });
    if (draft !== null) {
      useTableUi.setState({ draftInitial: null });
      setCellText(element.id, cell, draft);
      ta.value = draft;
      ta.setSelectionRange(draft.length, draft.length);
    } else {
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [cell.r, cell.c]); // o campo remonta a cada célula (key) — foca e aplica o texto inicial
  if (!rect) return null;
  return (
    <textarea
      key={`${cell.r}-${cell.c}`}
      ref={ref}
      data-editing="true"
      defaultValue={element.cells[`${cell.r}-${cell.c}`]?.text ?? ''}
      spellCheck={false}
      aria-label={t('widgets.tableView.cellRowValueColumnValue2', { value: cell.r + 1, value2: cell.c + 1 })}
      className="absolute m-0 box-border resize-none overflow-hidden border-0 outline-none"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        padding: `${rect.valign === 'top' ? TABLE_PAD_Y : rect.textTop}px ${TABLE_PAD_X}px ${TABLE_PAD_Y}px`,
        font: fontWithLineHeight(rect.font, rect.lineHeight),
        color: rect.color,
        textAlign: rect.align,
        textDecoration: [rect.underline && 'underline', rect.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
        background: rect.background,
        boxShadow: 'inset 0 0 0 2px var(--od-selection)',
        userSelect: 'text',
        zIndex: 3,
      }}
      onChange={(e) => setCellText(element.id, cell, e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Tab') {
          e.preventDefault();
          moveEditCell(element.id, e.shiftKey ? 'prev' : 'next');
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          moveEditCell(element.id, 'down');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          stopEditCell(element.id);
        }
      }}
    />
  );
}
