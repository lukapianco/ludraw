import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpDown, Gauge, Palette, Plus } from 'lucide-react';
import { MoreIcon, PencilIcon, TrashIcon } from '../icons/od';
import type { KanbanColumn, KanbanElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import {
  assigneeInitials,
  dropTargetAt,
  formatDueDate,
  isOverdue,
  KANBAN_CARD_DESC_FONT,
  KANBAN_CARD_PAD,
  KANBAN_CARD_TITLE_FONT,
  KANBAN_COL_FONT,
  KANBAN_COLORS,
  KANBAN_COLUMN_COLORS,
  KANBAN_FONT,
  KANBAN_HEADER_H,
  KANBAN_META_FONT,
  KANBAN_PAD,
  KANBAN_TAG_FONT,
  KANBAN_TITLE_FONT,
  layoutKanban,
  PRIORITY_META,
  type KanbanCardLayout,
  type KanbanColumnLayout,
} from '../../utils/kanban';
import {
  commitKanbanText,
  kanbanAddCard,
  kanbanAddColumn,
  kanbanDeleteColumn,
  kanbanEditable,
  kanbanMoveCard,
  kanbanMoveColumn,
  kanbanSortByPriority,
  kanbanUpdateColumn,
  startKanbanEdit,
  stopKanbanEdit,
  useKanbanUi,
  type KanbanEditTarget,
} from '../../utils/kanbanActions';
import { kanbanVoteKey } from '../../utils/voting';
import { screenPointToWorld } from '../../utils/boardActions';
import { fontWithLineHeight } from '../../utils/text';
import { cn } from '../../utils/cn';
import { Menu, type MenuItem } from '../ui/Menu';
import { useT } from '../../i18n/useT';

interface Props {
  element: KanbanElement;
  isEditing: boolean;
}

const TITLE_LH = 19;
const DESC_LH = 17;
const DRAG_THRESHOLD = 4;

/**
 * Quadro Kanban (Chat 04). Um único elemento do board com colunas e cards desenhados a partir do
 * layout puro de `utils/kanban.ts` (a mesma geometria do PNG/PDF).
 *
 * Interação: arrastar o fundo ou o título move o quadro inteiro (CanvasStage); arrastar um card o
 * leva para outra coluna/posição; clicar num card abre o editor completo (modal); duplo clique no
 * título do quadro ou de uma coluna renomeia; o menu ⋯ da coluna muda cor, limite WIP, ordem e exclui.
 * Durante uma votação, clicar num card distribui um ponto (Shift + clique retira).
 */
export const KanbanView = memo(function KanbanView({ element, isEditing }: Props) {
  const t = useT();
  const layout = layoutKanban(element);
  const selected = useBoardStore((s) => s.selectedIds.length === 1 && s.selectedIds[0] === element.id);
  const readOnly = useBoardStore((s) => s.readOnly);
  const canEdit = useBoardStore(() => kanbanEditable(element, true));
  const voting = useBoardStore((s) => !!s.facilitation.voting?.active && !s.facilitation.voting.revealed);
  const drag = useKanbanUi((s) => (s.drag?.elementId === element.id ? s.drag : null));
  const editing = useKanbanUi((s) => (isEditing && s.editing?.elementId === element.id ? s.editing.target : null));
  const [menu, setMenu] = useState<{ columnId: string; x: number; y: number } | null>(null);
  const interactive = selected && canEdit && !readOnly && !voting;

  return (
    <div className="absolute inset-0" style={{ userSelect: 'none', fontFamily: KANBAN_FONT, color: KANBAN_COLORS.text }}>
      {/* Superfície */}
      <div
        className="absolute inset-0"
        style={{ background: KANBAN_COLORS.surface, border: `1px solid ${KANBAN_COLORS.surfaceBorder}`, borderRadius: 14, boxShadow: '0 2px 12px rgba(20,36,26,0.10)' }}
      />

      {/* Cabeçalho do quadro */}
      <div
        data-kanban-title
        className="absolute flex items-center"
        style={{ left: KANBAN_PAD + 4, top: KANBAN_PAD, width: layout.width - KANBAN_PAD * 2 - 8, height: KANBAN_HEADER_H - 8 }}
      >
        {editing?.kind === 'title' ? (
          <KanbanTextEditor elementId={element.id} target={editing} initial={element.title} font={KANBAN_TITLE_FONT} />
        ) : (
          <span className="min-w-0 flex-1 truncate" style={{ font: KANBAN_TITLE_FONT }} title={t('widgets.kanbanView.doubleClickRename')}>
            {layout.titleText}
          </span>
        )}
        <span className="ml-3 shrink-0" style={{ font: KANBAN_META_FONT, color: KANBAN_COLORS.subtle }}>
          {layout.summary}
        </span>
      </div>

      {layout.columns.map((col) => (
        <ColumnView
          key={col.column.id}
          element={element}
          col={col}
          interactive={interactive}
          voting={voting}
          editingColumn={editing?.kind === 'column' && editing.columnId === col.column.id ? editing : null}
          draggingId={drag?.cardId ?? null}
          onMenu={(x, y) => setMenu({ columnId: col.column.id, x, y })}
        />
      ))}

      {/* Indicador de soltura */}
      {drag?.target && <DropIndicator element={element} target={drag.target} draggingId={drag.cardId} />}

      {/* Card fantasma seguindo o ponteiro */}
      {drag && (() => {
        const source = layout.columns.flatMap((c) => c.cards).find((c) => c.card.id === drag.cardId);
        if (!source) return null;
        return (
          <div className="pointer-events-none absolute" style={{ left: drag.local.x - drag.offset.x, top: drag.local.y - drag.offset.y, width: source.width, height: source.height, transform: 'rotate(2deg)', zIndex: 5 }}>
            <CardBody layout={{ ...source, x: 0, y: 0 }} ghost />
          </div>
        );
      })()}

      {/* Nova coluna (fora da borda direita, só com o quadro selecionado) */}
      {interactive && (
        <button
          type="button"
          data-od-floating
          className="absolute flex flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed text-[12px] font-semibold transition-colors duration-fast hover:bg-[rgba(25,75,50,0.06)]"
          style={{ left: layout.width + 10, top: KANBAN_PAD + KANBAN_HEADER_H, width: 44, height: layout.columns[0]?.height ?? 120, borderColor: '#B9C2B3', color: KANBAN_COLORS.muted }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={() => {
            const id = kanbanAddColumn(element.id);
            if (id) startKanbanEdit(element.id, { kind: 'column', columnId: id });
          }}
          aria-label={t('widgets.kanbanView.addColumn')}
          title={t('widgets.kanbanView.addColumn')}
        >
          <Plus size={18} />
        </button>
      )}

      {menu && <ColumnMenu element={element} columnId={menu.columnId} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
});

/* -------------------------------------------------------------------------- */

function ColumnView({
  element,
  col,
  interactive,
  voting,
  editingColumn,
  draggingId,
  onMenu,
}: {
  element: KanbanElement;
  col: KanbanColumnLayout;
  interactive: boolean;
  voting: boolean;
  editingColumn: KanbanEditTarget | null;
  draggingId: string | null;
  onMenu: (x: number, y: number) => void;
}) {
  const t = useT();
  const count = col.column.wipLimit ? `${col.column.cards.length}/${col.column.wipLimit}` : String(col.column.cards.length);
  return (
    <>
      <div className="absolute" style={{ left: col.x, top: col.y, width: col.width, height: col.height, background: KANBAN_COLORS.column, borderRadius: 10 }}>
        <div className="absolute" style={{ left: 10, right: 10, top: 9, height: 4, borderRadius: 2, background: col.column.color }} />
        <div data-kanban-col-title={col.column.id} className="absolute flex items-center" style={{ left: 12, right: interactive ? 34 : 12, top: 19, height: 20 }}>
          {editingColumn ? (
            <KanbanTextEditor elementId={element.id} target={editingColumn} initial={col.column.title} font={KANBAN_COL_FONT} />
          ) : (
            <span className="min-w-0 flex-1 truncate" style={{ font: KANBAN_COL_FONT }} title={t('widgets.kanbanView.doubleClickRename')}>
              {col.titleText}
            </span>
          )}
          <span className="ml-2 shrink-0 tabular-nums" style={{ font: KANBAN_META_FONT, color: col.wipOver ? KANBAN_COLORS.wipOver : KANBAN_COLORS.subtle }} title={col.wipOver ? t('widgets.kanbanView.overWorkProgressLimit') : undefined}>
            {col.points ? t('widgets.kanbanView.countPointsPts', { count, points: col.points }) : count}
          </span>
        </div>
        {interactive && (
          <button
            type="button"
            data-od-floating
            data-od-menu-trigger
            className="absolute flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-fast hover:bg-[rgba(20,36,26,0.08)]"
            style={{ right: 8, top: 17, color: KANBAN_COLORS.muted }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onMenu(r.right, r.bottom + 6);
            }}
            aria-label={t('widgets.kanbanView.optionsColumnTitle', { title: col.column.title })}
          >
            <MoreIcon size={16} />
          </button>
        )}
      </div>

      {col.cards.map((c) => (
        <CardView key={c.card.id} element={element} layout={c} dimmed={draggingId === c.card.id} voting={voting} />
      ))}

      {interactive && (
        <button
          type="button"
          data-od-floating
          className="absolute flex items-center gap-1.5 rounded-lg px-2 text-left transition-colors duration-fast hover:bg-[rgba(20,36,26,0.07)]"
          style={{ left: col.x + 8, top: col.addY, width: col.width - 16, height: 30, font: KANBAN_META_FONT, color: KANBAN_COLORS.muted }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={() => kanbanAddCard(element.id, col.column.id)}
        >
          <Plus size={15} />{' '}{t('widgets.kanbanView.addCard')}</button>
      )}
    </>
  );
}

/** Corpo visual do card (mesma geometria do export). */
function CardBody({ layout: c, ghost }: { layout: KanbanCardLayout; ghost?: boolean }) {
  const t = useT();
  const p = PRIORITY_META[c.card.priority];
  const left = KANBAN_CARD_PAD + 4;
  const due = c.card.dueDate;
  const overdue = isOverdue(due);
  const pill = (bg: string, fg: string): CSSProperties => ({ background: bg, color: fg, font: fontWithLineHeight(KANBAN_META_FONT, 20), height: 20, padding: '0 7px', borderRadius: 10, whiteSpace: 'nowrap' });
  return (
    <div
      className="absolute inset-0"
      style={{
        background: KANBAN_COLORS.card,
        border: `1px solid ${KANBAN_COLORS.cardBorder}`,
        borderRadius: 8,
        boxShadow: ghost ? '0 12px 28px -6px rgba(20,36,26,0.35)' : '0 1px 4px rgba(20,36,26,0.08)',
      }}
    >
      <span className="absolute" style={{ left: 5, top: 8, bottom: 8, width: 3, borderRadius: 1.5, background: p.color }} />
      <div className="absolute" style={{ left, right: KANBAN_CARD_PAD, top: c.titleY, font: fontWithLineHeight(KANBAN_CARD_TITLE_FONT, TITLE_LH), color: c.card.title.trim() ? KANBAN_COLORS.text : KANBAN_COLORS.subtle }}>
        {c.titleLines.map((l, i) => (
          <span key={i} className="block whitespace-pre">
            {l}
          </span>
        ))}
      </div>
      {c.descLines.length > 0 && (
        <div className="absolute" style={{ left, right: KANBAN_CARD_PAD, top: c.descY, font: fontWithLineHeight(KANBAN_CARD_DESC_FONT, DESC_LH), color: KANBAN_COLORS.muted }}>
          {c.descLines.map((l, i) => (
            <span key={i} className="block whitespace-pre">
              {l}
            </span>
          ))}
        </div>
      )}
      {c.tags.length > 0 && (
        <div className="absolute" style={{ left, top: c.tagsY, height: 20 }}>
          {c.tags.map((t, i) => (
            <span key={i} className="absolute whitespace-nowrap" style={{ left: t.x, width: t.width, height: 20, padding: '0 8px', borderRadius: 10, background: '#E4EED5', color: '#194B32', font: fontWithLineHeight(KANBAN_TAG_FONT, 20), overflow: 'hidden' }}>
              {t.label}
            </span>
          ))}
          {c.extraTags > 0 && (
            <span className="absolute whitespace-nowrap" style={{ left: c.tags[c.tags.length - 1].x + c.tags[c.tags.length - 1].width + 6, font: fontWithLineHeight(KANBAN_TAG_FONT, 20), color: KANBAN_COLORS.muted }}>
              +{c.extraTags}
            </span>
          )}
        </div>
      )}
      <div className="absolute flex items-center gap-1.5" style={{ left, right: KANBAN_CARD_PAD + (c.card.assignee?.trim() ? 28 : 0), top: c.metaY, height: 22, overflow: 'hidden' }}>
        <span style={pill(p.soft, p.color)}>{p.label}</span>
        {due && <span style={pill(overdue ? '#FBE6E2' : '#F1F3EE', overdue ? '#C2412D' : KANBAN_COLORS.muted)}>{formatDueDate(due)}</span>}
        {typeof c.card.storyPoints === 'number' && <span style={pill('#E3EDF9', '#2C64A8')}>{t('widgets.kanbanView.storypointsPts', { storyPoints: c.card.storyPoints })}</span>}
      </div>
      {c.card.assignee?.trim() && (
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{ right: KANBAN_CARD_PAD, top: c.metaY, width: 22, height: 22, background: '#194B32', color: '#D0E4AE', font: `700 10px ${KANBAN_FONT}` }}
          title={t('widgets.kanbanView.assigneeAssignee', { assignee: c.card.assignee })}
        >
          {assigneeInitials(c.card.assignee)}
        </span>
      )}
    </div>
  );
}

/** Card interativo: clique abre o editor, arrastar move entre colunas, votação distribui pontos. */
function CardView({ element, layout: c, dimmed, voting }: { element: KanbanElement; layout: KanbanCardLayout; dimmed: boolean; voting: boolean }) {
  const t = useT();
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = useBoardStore.getState();
    if (s.editingId && s.editingId !== element.id) s.setEditingId(null);
    if (voting) {
      const key = kanbanVoteKey(element.id, c.card.id);
      if (e.shiftKey) s.retractVote(key);
      else s.castVote(key);
      return;
    }
    if (s.activeTool !== 'select' && s.activeTool !== 'hand') return;
    if (s.activeTool === 'select') s.setSelectedIds([element.id]);
    const start = { x: e.clientX, y: e.clientY };
    const stage = document.querySelector('[data-canvas-stage]') as HTMLElement | null;
    const canDrag = s.activeTool === 'select' && kanbanEditable(element, true);
    let dragging = false;

    const localAt = (ev: PointerEvent) => {
      const rect = stage?.getBoundingClientRect();
      const w = rect ? screenPointToWorld(ev.clientX, ev.clientY, rect) : { x: 0, y: 0 };
      const el = useBoardStore.getState().elements[element.id];
      return { x: w.x - (el?.x ?? element.x), y: w.y - (el?.y ?? element.y) };
    };
    const onMove = (ev: PointerEvent) => {
      if (!canDrag) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        dragging = true;
        const local = localAt(ev);
        useKanbanUi.setState({ drag: { elementId: element.id, cardId: c.card.id, local, offset: { x: local.x - c.x, y: local.y - c.y }, target: null } });
      }
      const local = localAt(ev);
      const el = useBoardStore.getState().elements[element.id];
      const target = el && el.type === 'kanban' ? dropTargetAt(el, local, c.card.id) : null;
      const cur = useKanbanUi.getState().drag;
      if (cur) useKanbanUi.setState({ drag: { ...cur, local, target } });
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      cleanup.current = null;
      const d = useKanbanUi.getState().drag;
      useKanbanUi.setState({ drag: null });
      if (dragging) {
        if (commit && d?.target) kanbanMoveCard(element.id, c.card.id, d.target.columnId, d.target.index);
      } else if (commit) {
        useAppStore.getState().openModal({ type: 'kanban-card', elementId: element.id, cardId: c.card.id });
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragging) {
        ev.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    cleanup.current = () => finish(false);
  };

  return (
    <div
      data-od-floating
      data-kanban-card={c.card.id}
      className={cn('absolute', voting ? 'cursor-pointer' : 'cursor-grab')}
      style={{ left: c.x, top: c.y, width: c.width, height: c.height, opacity: dimmed ? 0.35 : 1, transition: 'top 160ms cubic-bezier(0.22,1,0.36,1), left 160ms cubic-bezier(0.22,1,0.36,1)' }}
      onPointerDown={onPointerDown}
      role="button"
      aria-label={t('widgets.kanbanView.cardAria', { title: c.card.title || t('widgets.kanbanView.untitled'), priority: PRIORITY_META[c.card.priority].label })}
    >
      <CardBody layout={{ ...c, x: 0, y: 0 }} />
    </div>
  );
}

function DropIndicator({ element, target, draggingId }: { element: KanbanElement; target: { columnId: string; index: number }; draggingId: string }) {
  const layout = layoutKanban(element);
  const col = layout.columns.find((c) => c.column.id === target.columnId);
  if (!col) return null;
  const cards = col.cards.filter((c) => c.card.id !== draggingId);
  const y = target.index < cards.length ? cards[target.index].y - 5 : cards.length ? cards[cards.length - 1].y + cards[cards.length - 1].height + 3 : col.y + 44;
  return <div className="pointer-events-none absolute rounded-full" style={{ left: col.x + 8, top: y, width: col.width - 16, height: 3, background: 'var(--od-selection)', zIndex: 4 }} />;
}

/** Campo de texto no lugar (título do quadro ou da coluna) — grava a cada tecla, Enter/Esc/clique fora fecham. */
function KanbanTextEditor({ elementId, target, initial, font }: { elementId: string; target: KanbanEditTarget; initial: string; font: string }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      data-editing="true"
      defaultValue={initial}
      spellCheck={false}
      aria-label={target.kind === 'title' ? t('widgets.kanbanView.boardName') : t('widgets.kanbanView.columnName')}
      className="min-w-0 flex-1 rounded border-0 bg-white px-1 outline-none"
      style={{ font, color: KANBAN_COLORS.text, boxShadow: '0 0 0 2px var(--od-selection)', userSelect: 'text' }}
      onChange={(e) => commitKanbanText(elementId, target, e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => stopKanbanEdit(elementId)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          stopKanbanEdit(elementId);
        }
      }}
    />
  );
}

/** Menu ⋯ da coluna (portal do componente Menu). */
function ColumnMenu({ element, columnId, x, y, onClose }: { element: KanbanElement; columnId: string; x: number; y: number; onClose: () => void }) {
  const t = useT();
  const col: KanbanColumn | undefined = element.columns.find((c) => c.id === columnId);
  if (!col) return null;
  const i = element.columns.indexOf(col);
  const items: MenuItem[] = [
    { kind: 'label', id: 'l', label: col.title || t('widgets.kanbanView.column') },
    { kind: 'item', id: 'rename', label: t('widgets.kanbanView.rename'), icon: <PencilIcon size={16} />, onSelect: () => startKanbanEdit(element.id, { kind: 'column', columnId }) },
    { kind: 'item', id: 'add', label: t('widgets.kanbanView.addCard'), icon: <Plus size={16} />, onSelect: () => kanbanAddCard(element.id, columnId) },
    {
      kind: 'submenu',
      id: 'color',
      label: t('widgets.kanbanView.columnColor'),
      icon: <Palette size={16} />,
      items: [
        {
          kind: 'custom',
          id: 'palette',
          render: (close) => (
            <div className="grid grid-cols-5 gap-2 p-2.5">
              {KANBAN_COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className={cn('h-7 w-7 rounded-md ring-1 ring-black/10 transition-transform duration-base hover:scale-110', col.color === c && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]')}
                  style={{ background: c }}
                  onClick={() => {
                    kanbanUpdateColumn(element.id, columnId, { color: c });
                    close();
                  }}
                />
              ))}
            </div>
          ),
        },
      ],
    },
    {
      kind: 'submenu',
      id: 'wip',
      label: t('widgets.kanbanView.cardLimitWip'),
      icon: <Gauge size={16} />,
      badge: col.wipLimit ? String(col.wipLimit) : undefined,
      items: [0, 2, 3, 4, 5, 6, 8, 10].map((n) => ({
        kind: 'radio' as const,
        id: `wip-${n}`,
        label: n === 0 ? t('widgets.kanbanView.noLimit') : `${n} cards`,
        checked: (col.wipLimit ?? 0) === n,
        onSelect: () => kanbanUpdateColumn(element.id, columnId, { wipLimit: n || undefined }),
      })),
    },
    { kind: 'item', id: 'sort', label: t('widgets.kanbanView.sortPriority'), icon: <ArrowUpDown size={16} />, disabled: col.cards.length < 2, onSelect: () => kanbanSortByPriority(element.id, columnId) },
    { kind: 'separator', id: 's1' },
    { kind: 'item', id: 'left', label: t('widgets.kanbanView.moveLeft'), icon: <ArrowLeft size={16} />, disabled: i === 0, onSelect: () => kanbanMoveColumn(element.id, columnId, -1) },
    { kind: 'item', id: 'right', label: t('widgets.kanbanView.moveRight'), icon: <ArrowRight size={16} />, disabled: i === element.columns.length - 1, onSelect: () => kanbanMoveColumn(element.id, columnId, 1) },
    { kind: 'separator', id: 's2' },
    {
      kind: 'item',
      id: 'delete',
      label: col.cards.length ? t('widgets.kanbanView.deleteColumnItsCardsMove') : t('widgets.kanbanView.deleteColumn'),
      icon: <TrashIcon size={16} />,
      danger: true,
      disabled: element.columns.length <= 1,
      hint: element.columns.length <= 1 ? t('widgets.kanbanView.theKanbanNeedsLeastOne') : undefined,
      onSelect: () => kanbanDeleteColumn(element.id, columnId),
    },
  ];
  return <Menu items={items} x={x} y={y} align="end" minWidth={250} onClose={onClose} />;
}
