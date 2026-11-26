import { drawerTrigger, useStudioUi } from '../studio/studioUi';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PaletteRegistry, useRegistry, type PaletteDefinition } from '../../extensions/registries';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Minus,
  PaintBucket,
  Plus,
  ShieldCheck,
  Smile,
  Strikethrough,
  Tag,
  Type,
  Underline,
  X,
} from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import type { CanvasElement, ConnectorElement, ElementPatch, FreehandElement, ShapeElement, ShapeKind, StickyNoteElement, TableElement, TextualElement } from '../../types/canvas';
import { ReactionGrid, TagPicker } from './StickyMetaControls';
import { LockLevelPicker, ProtectedUnlockConfirm } from './LockMenu';
import { effectiveLockMode } from '../../utils/permissions';
import { ConnectorControls } from './ConnectorControls';
import { MindMapControls } from './MindMapControls';
import { FrameControls } from './FrameControls';
import { KanbanControls } from './KanbanControls';
import { TableControls } from './TableControls';
import { startCommentOnSelection } from '../../utils/comments';
import { isTextualElement } from '../../types/canvas';
import { DEFAULT_STICKY_COLOR, ELEMENT_TYPE_LABELS, FILL_COLORS, HIGHLIGHT_COLORS, INK_COLORS, isDarkSticky, STICKY_COLORS, stickyColorName, stickyTextColor } from '../../utils/factory';
import { getBoundsOfElements, worldRectToScreen } from '../../utils/math';
import { fontCss, resolveFontName } from '../../utils/text';
import { getShapePath } from '../../utils/shapes';
import { activeRange, useTableUi } from '../../utils/tableActions';
import { rangeName } from '../../utils/table';
import { startKanbanEdit } from '../../utils/kanbanActions';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { Menu, type MenuItem } from '../ui/Menu';
import { useElementMenuItems } from '../../menus/elementMenu';
import { LockButton } from './LockButton';
import { handleToolbarKeys } from '../board/rovingFocus';
import { FontPicker } from '../strip/FontPicker';
import { StripPop } from '../strip/StripPop';
import {
  AdvancedLockIcon,
  CommentPinIcon,
  ConnectorIcon,
  FrameIcon,
  ImageIcon,
  KanbanIcon,
  LinkIcon,
  LockIcon,
  MindMapIcon,
  MoreIcon,
  PenIcon,
  SelectIcon,
  ShapesIcon,
  StickyIcon,
  TableIcon,
  TextIcon,
} from '../icons/od';
import { useT } from '../../i18n/useT';

const board = () => useBoardStore.getState();

/** Distância mínima da Cinta até as bordas do canvas (px). */
const EDGE = 12;
/** Espaço reservado na base para a Dock (12 px de margem + 52 px da Dock + 12 px de folga). */
const DOCK_CLEARANCE = 76;
/** Distância da Cinta até a seleção (§16.2). */
const GAP = 18;
/** Atalhos de tamanho da gaveta Estilo do texto (§16.2). */
const SIZE_SHORTCUTS = [12, 16, 24, 32, 56, 72];

/** Aplica um patch a todos os elementos-alvo (desbloqueados), gravando 1 entrada de histórico. */
function applyPatch<T extends CanvasElement>(targets: T[], fn: (el: T) => ElementPatch, tag?: string) {
  const list = targets.filter((el) => !el.locked);
  if (list.length === 0) return;
  board().pushHistory(tag);
  board().updateElements(list.map((el) => ({ id: el.id, patch: fn(el) })));
}

/** Largura da janela abaixo de `px` (telas estreitas: < 900 e < 640 px, §16.4). */
function useNarrow(px: number): boolean {
  const query = `(max-width: ${px - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return !!narrow;
}

/**
 * CINTA DO OBJETO (Chat 08.2 · C-2, `STUDIO_V2_SPEC.md` §16; substitui a "Barra de ações" flutuante). Peça única com a
 * anatomia dos módulos (44 px, raio 14, segue o tema em todos os tipos — frame incluído), presa à seleção por uma
 * lingueta, 18 px abaixo dela (acima, se não couber). Ordem: identidade · chips de valor · alternâncias e cores ·
 * separador · Comentar · Bloqueio avançado · Bloquear · `⋯`. Cada ação é a MESMA de antes (mesmo store → mesmo
 * `ensure()`/`can()`); nada some — o que não cabe numa tela estreita vai para o `⋯`. Travado: o meio esmaece e fica
 * inerte; Bloquear (segurar 2 s, mouse ou teclado) e `⋯` continuam ativos.
 * Em que difere do padrão de mercado: separa o QUE É o objeto (identidade e valores atuais em chips) do que se FAZ
 * com ele (grupo fixo à direita), com a mesma peça e as mesmas gavetas dos módulos do Estúdio.
 */
export function FloatingContextToolbar() {
  const t = useT();
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const elements = useBoardStore((s) => s.elements);
  const camera = useBoardStore((s) => s.camera);
  const viewport = useBoardStore((s) => s.viewport);
  const interaction = useBoardStore((s) => s.interaction);
  const readOnly = useBoardStore((s) => s.readOnly);
  const showObjectSize = useAppStore((s) => s.preferences.showObjectSize);
  const veryNarrow = useNarrow(640);

  const ref = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 44 });
  const [popover, setPopover] = useState<string | null>(null);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);

  // Pins de comentário (Chat 04) usam a própria conversa flutuante, não a Cinta
  const selected = selectedIds.map((id) => elements[id]).filter((e): e is CanvasElement => !!e && e.type !== 'comment');
  const textual = selected.filter(isTextualElement);
  const freehand = selected.filter((e): e is FreehandElement => e.type === 'freehand');
  const shapes = selected.filter((e): e is ShapeElement => e.type === 'shape');
  const stickies = selected.filter((e): e is StickyNoteElement => e.type === 'sticky');
  const allLocked = selected.length > 0 && selected.every((e) => e.locked);
  const editable = textual.filter((e) => !e.locked);
  const first = textual[0];
  const selectionKey = selectedIds.join('|');

  useLayoutEffect(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      if (Math.abs(r.width - size.width) > 0.5 || Math.abs(r.height - size.height) > 0.5) setSize({ width: r.width, height: r.height });
    }
  });

  useEffect(() => {
    setPopover(null);
    setMoreMenu(null);
  }, [selectionKey]);

  // travado: o meio fica inerte (fora do teclado e do ponteiro), além de esmaecido
  useEffect(() => {
    const el = midRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = allLocked;
  });

  useEffect(() => {
    if (!popover) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setPopover(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [popover]);

  const toggle = useCallback((id: string) => setPopover((p) => (p === id ? null : id)), []);
  const close = useCallback(() => setPopover(null), []);
  const linkExtra: MenuItem[] =
    veryNarrow && textual.length > 0
      ? [
          {
            kind: 'submenu',
            id: 'link',
            label: t('menus.objectMenu.link'),
            items: [{ kind: 'custom', id: 'link-editor', render: (done) => <LinkEditor initial={first?.link ?? ''} onApply={(url) => (applyPatch(editable, () => ({ link: url || null })), done())} /> }],
          },
        ]
      : [];

  if (selected.length === 0 || readOnly) return null;

  const bounds = getBoundsOfElements(selected);
  if (!bounds) return null;
  const screen = worldRectToScreen(bounds, camera);
  // 18 px abaixo da seleção — abaixo também da alça de rotação e do rótulo de medidas — e só sobe quando não couber
  // acima da Dock. A lingueta aponta para o centro da seleção.
  const below = screen.y + screen.height + 18 + (showObjectSize ? 24 : 0) + GAP;
  const above = screen.y - size.height - GAP;
  const floor = viewport.height - size.height - DOCK_CLEARANCE;
  let top = below;
  if (below > floor && above >= EDGE) top = above;
  top = Math.max(EDGE, Math.min(top, floor));
  const placement = top < screen.y ? 'above' : 'below';
  const popDirection = top + size.height / 2 > viewport.height / 2 ? 'up' : 'down';
  const centerX = screen.x + screen.width / 2;
  const left = Math.max(8, Math.min(centerX - size.width / 2, viewport.width - size.width - 8));
  const tongue = Math.max(16, Math.min(centerX - left, size.width - 16));
  const hidden = interaction !== 'idle' && interaction !== 'marquee';
  const offscreen = screen.x > viewport.width || screen.y > viewport.height || screen.x + screen.width < 0 || screen.y + screen.height < 0;

  /* ----------------------------- valores atuais ----------------------------- */
  const fontNames = new Set(textual.map((el) => resolveFontName(el)));
  const fontName = first ? resolveFontName(first) : 'Open Sans';
  const sizeOf = (el: TextualElement): number | 'auto' => (el.type === 'sticky' ? el.fontSize ?? 'auto' : el.fontSize);
  const sizes = new Set(textual.map((el) => String(sizeOf(el))));
  const fontSizeValue: number | 'auto' = first ? sizeOf(first) : 16;
  const mixed = fontNames.size > 1 || sizes.size > 1;
  const textColor = first ? (first.type === 'sticky' ? first.textColor ?? stickyTextColor(first.color) : first.textColor) : '#1C1C1E';
  const fillValue = first ? (first.type === 'sticky' ? first.color : first.type === 'shape' ? first.fillColor : first.backgroundColor) : 'transparent';
  const opacity = selected[0]?.opacity ?? 1;
  const fillOpacity = first?.fillOpacity ?? 1;
  const connectors = selected.filter((e): e is ConnectorElement => e.type === 'connector');
  const onlyConnectors = connectors.length > 0 && connectors.length === selected.length;
  const allSticky = textual.length > 0 && textual.every((e) => e.type === 'sticky');
  const protectedLock = allLocked && selected.some((e) => effectiveLockMode(e) === 'protected');

  /* ------------------------------- ações ------------------------------------ */
  const setFontSize = (value: number | 'auto') => applyPatch(textual, (el) => (el.type === 'sticky' ? { fontSize: value } : { fontSize: value === 'auto' ? 16 : value }));
  const stepFontSize = (dir: 1 | -1) => {
    const current = fontSizeValue === 'auto' ? 24 : fontSizeValue;
    setFontSize(Math.max(6, Math.min(999, current + dir * (current >= 48 ? 8 : current >= 24 ? 4 : 2))));
  };
  const setFill = (color: string) =>
    applyPatch(textual, (el) => {
      if (el.type === 'sticky') return { color, textColor: isDarkSticky(color) ? '#F4F5F2' : el.textColor === '#F4F5F2' ? '#1C1C1E' : el.textColor };
      if (el.type === 'shape') return { fillColor: color };
      return { backgroundColor: color };
    });
  const convert = (target: { type: 'sticky' } | { type: 'text'; withBg?: boolean } | { type: 'shape'; kind: ShapeKind }) => {
    if (target.type === 'text') {
      board().convertSelected({ type: 'text' });
      if (target.withBg) {
        const ids = board().selectedIds;
        board().updateElements(ids.map((id) => ({ id, patch: { backgroundColor: DEFAULT_STICKY_COLOR } })));
      }
    } else {
      board().convertSelected(target);
    }
    setPopover(null);
  };
  const openMore = (el: HTMLElement) => {
    if (moreMenu) {
      setMoreMenu(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setMoreMenu({ x: r.right, y: popDirection === 'up' ? r.top - 8 : r.bottom + 8 });
  };

  const showText = textual.length > 0 && !onlyConnectors;
  const single = selected.length === 1 ? selected[0] : null;

  return (
    <>
      <div
        ref={ref}
        data-context-toolbar
        data-od-floating
        data-placement={placement}
        data-pop={popDirection}
        data-locked={allLocked || undefined}
        role="toolbar"
        aria-label={t('board.strip.label')}
        onKeyDown={handleToolbarKeys}
        className={cn(
          // acima da Dock (z-40): a Cinta nunca a cobre (fica presa acima dela), mas as gavetas podem descer sobre ela
          'od-panel group/ctx absolute z-[45] flex h-11 max-w-[calc(100vw-24px)] items-center gap-1 rounded-[14px] p-1 transition-opacity duration-base ease-out',
          hidden || offscreen ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        style={{ left, top }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const tg = e.target as HTMLElement;
          if (!tg.closest('input, textarea, select, [data-allow-focus]')) e.preventDefault();
        }}
        onMouseDown={(e) => {
          const tg = e.target as HTMLElement;
          if (!tg.closest('input, textarea, select, [data-allow-focus]')) e.preventDefault();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* lingueta: aponta para o centro da seleção (limitada às bordas da peça) */}
        <span
          aria-hidden="true"
          data-strip-tongue
          className={cn('pointer-events-none absolute h-[10px] w-[10px] rotate-45 bg-panel', placement === 'below' ? '-top-[5px] border-s border-t border-line' : '-bottom-[5px] border-b border-e border-line')}
          style={{ left: tongue - 5 }}
        />

        <Identity selected={selected} single={single} open={popover} onToggle={toggle} onConvert={convert} onClose={close} />

        <div ref={midRef} className={cn('flex items-center gap-0.5', allLocked && 'opacity-40')} aria-disabled={allLocked || undefined} data-strip-middle>
          {showText && (
            <>
              <StripPop
                id="text-style"
                open={popover}
                onToggle={toggle}
                variant="chip"
                label={t('board.strip.textStyle')}
                testId="strip-text-style"
                hint={t('board.strip.textStyleKeys')}
                footer={
                  <span className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                    <span className="truncate">{t('board.strip.textStyleFooter')}</span>
                    <span className="shrink-0 font-mono">{t('board.strip.escCloses')}</span>
                  </span>
                }
                align="start"
                trigger={
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-[14px] font-bold" style={{ fontFamily: mixed ? undefined : fontCss(fontName) }} aria-hidden="true">
                      Aa
                    </span>
                    <span className="truncate" data-strip-value>
                      {mixed ? t('board.strip.mixed') : `${fontName} ${fontSizeValue === 'auto' ? t('board.floatingContextToolbar.auto') : Math.round(fontSizeValue)}`}
                    </span>
                    <ChevronDown size={13} className="shrink-0 text-ink-subtle" />
                  </span>
                }
              >
                <TextStyleDrawer
                  fontName={mixed && fontNames.size > 1 ? null : fontName}
                  size={sizes.size > 1 ? null : fontSizeValue}
                  allowAuto={allSticky}
                  first={first}
                  onFont={(name) => applyPatch(textual, () => ({ fontName: name }))}
                  onSize={setFontSize}
                  onStep={stepFontSize}
                  onPatch={(fn) => applyPatch(editable, fn)}
                />
              </StripPop>

              <ToggleIcon label={t('common.bold')} shortcut="Ctrl + B" active={first?.fontWeight === 'bold'} onClick={() => applyPatch(editable, () => ({ fontWeight: first?.fontWeight === 'bold' ? 'normal' : 'bold' }))}>
                <Bold size={17} />
              </ToggleIcon>

              <StripPop
                id="color"
                open={popover}
                onToggle={toggle}
                label={t('common.textColor')}
                trigger={
                  <span className="relative flex flex-col items-center">
                    <Type size={16} />
                    <span className="mt-[1px] h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: textColor }} />
                  </span>
                }
              >
                <Palette colors={INK_COLORS} value={textColor} columns={4} title={t('board.floatingContextToolbar.allColors')} onPick={(c) => applyPatch(editable, () => ({ textColor: c }))} custom extensionTarget="ink" />
              </StripPop>

              {!veryNarrow && (
                <StripPop id="link" open={popover} onToggle={toggle} label={t('board.floatingContextToolbar.insertLink')} trigger={<LinkIcon size={18} className={first?.link ? 'text-selection' : undefined} />}>
                  <LinkEditor
                    initial={first?.link ?? ''}
                    onApply={(url) => {
                      applyPatch(editable, () => ({ link: url || null }));
                      setPopover(null);
                    }}
                  />
                </StripPop>
              )}

              <StripPop
                id="fill"
                open={popover}
                onToggle={toggle}
                label={allSticky ? t('board.floatingContextToolbar.noteColor') : t('board.strip.fill')}
                trigger={
                  <span className="relative block h-[18px] w-[18px] overflow-hidden rounded-full ring-1 ring-line-strong">
                    <span className="od-checker absolute inset-0" />
                    <span className="absolute inset-0" style={{ background: fillValue, opacity: fillOpacity }} />
                  </span>
                }
              >
                <div className="w-[288px]">
                  <Palette
                    colors={allSticky ? STICKY_COLORS : FILL_COLORS}
                    value={fillValue}
                    columns={8}
                    title={allSticky ? t('board.floatingContextToolbar.noteColor') : t('common.backgroundColor')}
                    nameOf={allSticky ? stickyColorName : undefined}
                    onPick={setFill}
                    custom
                    extensionTarget={allSticky ? 'sticky' : 'fill'}
                  />
                  <OpacitySlider value={fillOpacity} targets={textual} field="fillOpacity" />
                  {shapes.length > 0 && <StrokeEditor shapes={shapes} />}
                </div>
              </StripPop>
            </>
          )}

          {stickies.length > 0 && (
            <>
              <StripPop id="tags" open={popover} onToggle={toggle} label={t('common.tags')} trigger={<Tag size={17} className={stickies.some((s) => s.tags?.length) ? 'text-selection' : undefined} />}>
                <TagPicker
                  stickies={stickies}
                  onManage={() => {
                    setPopover(null);
                    useStudioUi.getState().openDrawer('tags', drawerTrigger('card'));
                  }}
                />
              </StripPop>
              <StripPop id="reactions" open={popover} onToggle={toggle} label={t('common.react')} trigger={<Smile size={17} />}>
                <ReactionGrid ids={stickies.map((s) => s.id)} />
              </StripPop>
            </>
          )}

          {textual.length === 0 && freehand.length > 0 && (
            <StripPop
              id="stroke"
              open={popover}
              onToggle={toggle}
              variant="chip"
              name={t('board.strip.stroke')}
              label={t('board.floatingContextToolbar.strokeColorThickness')}
              trigger={
                <span className="flex items-center gap-1.5" data-strip-value>
                  <span className="h-[14px] w-[14px] rounded-full ring-1 ring-line-strong" style={{ background: freehand[0].strokeColor }} />
                  <span className="tabular-nums">{Math.round(freehand[0].strokeWidth)} px</span>
                </span>
              }
            >
              <div className="w-[230px]">
                <Palette colors={INK_COLORS} value={freehand[0].strokeColor} columns={6} title={t('board.floatingContextToolbar.strokeColor')} onPick={(c) => applyPatch(freehand, () => ({ strokeColor: c }))} custom extensionTarget="ink" />
                <div className="px-3 pb-3">
                  <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-muted">
                    <span>{t('board.floatingContextToolbar.thickness')}</span>
                    <span className="tabular-nums">{Math.round(freehand[0].strokeWidth)}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={freehand[0].strokeWidth}
                    className="w-full accent-[var(--od-selection)]"
                    onPointerDown={() => board().pushHistory()}
                    onChange={(e) => board().updateElements(freehand.filter((f) => !f.locked).map((f) => ({ id: f.id, patch: { strokeWidth: Number(e.target.value) } })))}
                  />
                </div>
                <OpacitySlider value={opacity} targets={selected} field="opacity" />
              </div>
            </StripPop>
          )}

          {onlyConnectors && <ConnectorControls connectors={connectors} open={popover} onToggle={toggle} close={close} />}
          {single?.type === 'mindmap' && <MindMapControls element={single} />}
          {single?.type === 'frame' && <FrameControls frame={single} open={popover} onToggle={toggle} />}
          {single?.type === 'kanban' && <KanbanControls element={single} />}
          {single?.type === 'table' && <TableControls element={single} />}
        </div>

        <span className="od-divider-v" />

        {/* direita — igual em todos os tipos: Comentar · Bloqueio avançado · Bloquear · ⋯ */}
        <div className={cn('flex items-center gap-0.5', allLocked && '[&>[data-lock-dim]]:pointer-events-none [&>[data-lock-dim]]:opacity-40')}>
          <span data-lock-dim className="flex">
            <ToggleIcon label={t('board.floatingContextToolbar.comment')} disabled={allLocked} onClick={() => startCommentOnSelection()}>
              <CommentPinIcon size={18} />
            </ToggleIcon>
          </span>
          {!veryNarrow && (
            <span data-lock-dim className="flex">
              <StripPop id="lockLevels" open={popover} onToggle={toggle} label={t('board.floatingContextToolbar.advancedLock')} disabled={allLocked} trigger={<AdvancedLockIcon size={18} />} testId="strip-advanced-lock">
                <LockLevelPicker onDone={close} />
              </StripPop>
            </span>
          )}
          {protectedLock ? (
            <StripPop
              id="unlock"
              open={popover}
              onToggle={toggle}
              label={t('common.facilitatorProtectedLock')}
              testId="strip-protected-lock"
              trigger={
                <span className="relative text-brand-800 dark:text-brand-200">
                  <LockIcon size={18} />
                  <ShieldCheck size={11} className="absolute -bottom-1 -end-1.5 rounded-full bg-panel" />
                </span>
              }
            >
              <ProtectedUnlockConfirm lockedBy={selected.find((e) => effectiveLockMode(e) === 'protected')?.lockedBy ?? null} onDone={close} />
            </StripPop>
          ) : (
            <LockButton
              locked={allLocked}
              onLock={() => board().setLockMode(board().selectedIds, 'standard')}
              onUnlock={() => {
                const before = board().selectedIds.filter((id) => board().elements[id]?.locked).length;
                board().setLockMode(board().selectedIds, 'none');
                const after = board().selectedIds.filter((id) => board().elements[id]?.locked).length;
                if (after < before) useAppStore.getState().toast(t('board.floatingContextToolbar.unlocked'), 'success');
              }}
            />
          )}
          <Tooltip label={t('board.strip.more')} side="top" disabled={!!moreMenu}>
            <button type="button" data-od-menu-trigger data-strip-control="more" className="od-tool" data-active={!!moreMenu} onClick={(e) => openMore(e.currentTarget)} aria-label={t('board.strip.more')} aria-haspopup="menu" aria-expanded={!!moreMenu}>
              <MoreIcon size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
      {moreMenu && <MoreMenu x={moreMenu.x} y={moreMenu.y} up={popDirection === 'up'} extra={linkExtra} onClose={() => setMoreMenu(null)} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Identidade                                                                */
/* -------------------------------------------------------------------------- */

const IDENTITY_CLASS = 'flex h-[34px] min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 rounded-[10px] bg-accent-soft px-2.5 text-[13px] font-bold text-[var(--od-accent)]';

/**
 * Segmento de identidade (§16.2): ícone próprio + tipo (no frame, o NOME do frame) + chevron. Texto/post-it/forma →
 * Converter em…; seleção múltipla → Filtrar a seleção; frame e Kanban → renomear; tipos sem ação → só rótulo.
 */
function Identity({
  selected,
  single,
  open,
  onToggle,
  onConvert,
  onClose,
}: {
  selected: CanvasElement[];
  single: CanvasElement | null;
  open: string | null;
  onToggle: (id: string) => void;
  onConvert: Parameters<typeof TypePicker>[0]['onPick'];
  onClose: () => void;
}) {
  const t = useT();
  const tableRange = useTableUi((s) => (single?.type === 'table' && s.elementId === single.id ? `${s.anchor?.r},${s.anchor?.c}|${s.focus?.r},${s.focus?.c}` : ''));
  void tableRange;
  const label = (text: string, icon: ReactNode, chevron: boolean) => (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="truncate max-[639px]:hidden" data-strip-identity-label>
        {text}
      </span>
      {chevron && <ChevronDown size={14} className="shrink-0 opacity-70" />}
    </>
  );

  if (!single) {
    // seleção múltipla → Filtrar a seleção
    return (
      <StripPop id="filter" open={open} onToggle={onToggle} label={t('board.strip.filterSelection')} align="start" variant="identity" testId="strip-identity" trigger={<span className="flex min-w-0 items-center gap-1.5">{label(t('board.strip.selection', { count: selected.length }), <SelectIcon size={17} />, true)}</span>}>
        <FilterSelection selected={selected} onDone={onClose} />
      </StripPop>
    );
  }
  const typeLabel = ELEMENT_TYPE_LABELS[single.type] ?? single.type;
  if (single.type === 'text' || single.type === 'sticky' || single.type === 'shape') {
    const icon = single.type === 'sticky' ? <StickyIcon size={17} /> : single.type === 'shape' ? <ShapesIcon size={17} /> : <TextIcon size={17} />;
    return (
      <StripPop id="type" open={open} onToggle={onToggle} label={t('board.strip.convertTo')} align="start" variant="identity" testId="strip-identity" trigger={<span className="flex min-w-0 items-center gap-1.5">{label(typeLabel, icon, true)}</span>}>
        <TypePicker onPick={onConvert} />
      </StripPop>
    );
  }
  if (single.type === 'frame' || single.type === 'kanban') {
    // frame e Kanban: o segmento mostra o nome e renomeia ali (Enter confirma, Esc cancela — edição do próprio objeto)
    const name = single.type === 'frame' ? (single as { title?: string }).title?.trim() || typeLabel : typeLabel;
    return (
      <Tooltip label={t('board.strip.renameHint')} side="top">
        <button
          type="button"
          data-testid="strip-identity"
          className={cn(IDENTITY_CLASS, 'transition-colors duration-base hover:brightness-95')}
          onClick={() => (single.type === 'frame' ? board().setEditingId(single.id) : startKanbanEdit(single.id, { kind: 'title' }))}
          aria-label={`${name} — ${t('board.strip.renameHint')}`}
        >
          {label(name, single.type === 'frame' ? <FrameIcon size={17} /> : <KanbanIcon size={17} />, false)}
          {single.locked && <LockIcon size={13} className="shrink-0" />}
        </button>
      </Tooltip>
    );
  }
  // tipos sem ação na identidade: só rótulo
  const icon =
    single.type === 'connector' ? <ConnectorIcon size={17} /> : single.type === 'freehand' ? <PenIcon size={17} /> : single.type === 'mindmap' ? <MindMapIcon size={17} /> : single.type === 'table' ? <TableIcon size={17} /> : single.type === 'image' ? <ImageIcon size={17} /> : <ShapesIcon size={17} />;
  const text =
    single.type === 'freehand'
      ? t('board.strip.drawing')
      : single.type === 'table'
        ? `${t('menus.tableMenu.header')} · ${rangeName(activeRange(single as TableElement))}`
        : typeLabel;
  return (
    <span className={IDENTITY_CLASS} data-testid="strip-identity" title={text}>
      {label(text, icon, false)}
    </span>
  );
}

/** Filtrar a seleção (§16.2): marcar tipos e "Selecionar só os marcados"; um clique no tipo seleciona só ele, como antes. */
function FilterSelection({ selected, onDone }: { selected: CanvasElement[]; onDone: () => void }) {
  const t = useT();
  const counts = selected.reduce<Record<string, number>>((acc, el) => {
    acc[el.type] = (acc[el.type] ?? 0) + 1;
    return acc;
  }, {});
  const [marked, setMarked] = useState<Set<string>>(() => new Set(Object.keys(counts)));
  const selectTypes = (types: Set<string>) => {
    board().setSelectedIds(selected.filter((e) => types.has(e.type)).map((e) => e.id));
    onDone();
  };
  return (
    <div className="w-60 p-1.5" data-filter-selection>
      {Object.entries(counts).map(([type, count]) => (
        <div key={type} className="flex items-center gap-1">
          <input
            type="checkbox"
            className="ms-2 accent-[var(--od-selection)]"
            checked={marked.has(type)}
            onChange={(e) => setMarked((m) => {
              const n = new Set(m);
              if (e.target.checked) n.add(type);
              else n.delete(type);
              return n;
            })}
            aria-label={ELEMENT_TYPE_LABELS[type as CanvasElement['type']] ?? type}
            data-allow-focus
          />
          <button type="button" className="od-menu-item flex-1" data-filter-type={type} onClick={() => selectTypes(new Set([type]))}>
            <span className="flex-1">{ELEMENT_TYPE_LABELS[type as CanvasElement['type']] ?? type}</span>
            <span className="text-xs tabular-nums text-ink-subtle">{count}</span>
          </button>
        </div>
      ))}
      <div className="mx-1 my-1 h-px bg-line" />
      <button type="button" className="od-btn od-btn-soft od-btn-sm w-full" disabled={!marked.size} onClick={() => selectTypes(marked)} data-filter-apply>
        {t('board.strip.selectOnlyMarked')}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gaveta Estilo do texto                                                    */
/* -------------------------------------------------------------------------- */

export function TextStyleDrawer({
  fontName,
  size,
  allowAuto,
  first,
  onFont,
  onSize,
  onStep,
  onPatch,
}: {
  fontName: string | null;
  size: number | 'auto' | null;
  allowAuto: boolean;
  first: TextualElement | undefined;
  onFont: (name: string) => void;
  onSize: (v: number | 'auto') => void;
  onStep: (dir: 1 | -1) => void;
  onPatch: (fn: (el: TextualElement) => ElementPatch) => void;
}) {
  const t = useT();
  const display = size === null ? '' : size === 'auto' ? t('board.floatingContextToolbar.auto') : String(Math.round(size));
  const [draft, setDraft] = useState(display);
  useEffect(() => setDraft(display), [display]);
  const commit = () => {
    if (draft.trim().toLowerCase() === 'auto' && allowAuto) return onSize('auto');
    const n = Number(draft.replace(',', '.'));
    if (Number.isFinite(n) && n >= 1 && n <= 999) onSize(n);
    else setDraft(display);
  };
  const Cap = ({ children }: { children: ReactNode }) => <div className="px-3.5 pb-1.5 pt-2 text-2xs font-extrabold uppercase tracking-[0.06em] text-ink-subtle">{children}</div>;
  // controle segmentado (ref. do Estúdio v2): trilho rebaixado, opção ligada em superfície de painel
  const Seg = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
    <div role="group" aria-label={label} className={cn('flex gap-0.5 rounded-[9px] bg-panel-sunken p-[3px]', className)}>
      {children}
    </div>
  );
  const SegBtn = ({ label, shortcut, pressed, onClick, children }: { label: string; shortcut?: string; pressed?: boolean; onClick: () => void; children: ReactNode }) => (
    <Tooltip label={label} shortcut={shortcut} side="top" className="min-w-0 flex-1">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed ?? undefined}
        onClick={onClick}
        className={cn(
          'flex h-7 w-full items-center justify-center rounded-[7px] text-ink-muted transition-colors duration-base hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)]',
          pressed && 'bg-panel text-ink shadow-panel',
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
  const stepBtn = 'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-panel-sunken text-ink transition-colors duration-base hover:bg-panel-hover';
  const list = first?.listStyle ?? 'none';
  return (
    <div className="flex min-h-0 w-[340px] max-w-[calc(100vw-24px)] flex-col [&>*]:shrink-0" data-text-style-drawer>
      {/* só a lista de fontes encolhe quando falta altura: tamanho, estilo e posição ficam sempre à vista */}
      <div className="flex min-h-[104px] !shrink px-3.5 pb-1 pt-1">
        <FontPicker variant="compact" className="min-h-0 w-full" value={fontName} onPick={onFont} />
      </div>
      <Cap>{t('board.strip.size')}</Cap>
      <div className="px-3.5 pb-1">
        <div className="flex items-center gap-1.5">
          <button type="button" className={stepBtn} onClick={() => onStep(-1)} aria-label={t('board.floatingContextToolbar.smallerFont')}>
            <Minus size={15} />
          </button>
          <input
            data-allow-focus
            value={draft}
            placeholder={t('board.strip.mixed')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit();
            }}
            onBlur={commit}
            className="od-input h-[34px] min-w-0 flex-1 px-1 text-center font-mono text-[14px] font-semibold tabular-nums"
            aria-label={t('board.floatingContextToolbar.fontSize')}
          />
          <button type="button" className={stepBtn} onClick={() => onStep(1)} aria-label={t('board.floatingContextToolbar.largerFont')}>
            <Plus size={15} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {SIZE_SHORTCUTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={size === n}
              className={cn(
                'h-[26px] rounded-[7px] px-[9px] font-mono text-[12px] font-semibold tabular-nums transition-colors duration-base',
                size === n ? 'bg-accent text-[var(--od-accent-contrast)]' : 'bg-panel-sunken text-ink-muted hover:bg-panel-hover hover:text-ink',
              )}
              onClick={() => onSize(n)}
              data-size-shortcut={n}
            >
              {n}
            </button>
          ))}
          {allowAuto && (
            <button
              type="button"
              aria-pressed={size === 'auto'}
              className={cn(
                'h-[26px] rounded-[7px] px-[9px] text-[12px] font-semibold transition-colors duration-base',
                size === 'auto' ? 'bg-accent text-[var(--od-accent-contrast)]' : 'bg-panel-sunken text-ink-muted hover:bg-panel-hover hover:text-ink',
              )}
              onClick={() => onSize('auto')}
            >
              {t('board.floatingContextToolbar.auto')}
            </button>
          )}
        </div>
      </div>
      <Cap>{t('board.strip.styleAndList')}</Cap>
      <div className="flex flex-col gap-2 px-3.5 pb-1">
        <div className="grid grid-cols-[4fr_3fr] gap-2.5">
          <Seg label={t('board.strip.textEmphasis')}>
            <SegBtn label={t('common.bold')} shortcut="Ctrl + B" pressed={first?.fontWeight === 'bold'} onClick={() => onPatch(() => ({ fontWeight: first?.fontWeight === 'bold' ? 'normal' : 'bold' }))}>
              <Bold size={15} strokeWidth={2.5} />
            </SegBtn>
            <SegBtn label={t('common.italic')} shortcut="Ctrl + I" pressed={first?.fontStyle === 'italic'} onClick={() => onPatch(() => ({ fontStyle: first?.fontStyle === 'italic' ? 'normal' : 'italic' }))}>
              <Italic size={15} />
            </SegBtn>
            <SegBtn label={t('board.floatingContextToolbar.underline')} shortcut="Ctrl + U" pressed={!!first?.underline} onClick={() => onPatch(() => ({ underline: !first?.underline }))}>
              <Underline size={15} />
            </SegBtn>
            <SegBtn label={t('board.floatingContextToolbar.strikethrough')} pressed={!!first?.strikethrough} onClick={() => onPatch(() => ({ strikethrough: !first?.strikethrough }))}>
              <Strikethrough size={15} />
            </SegBtn>
          </Seg>
          <Seg label={t('board.strip.listGroup')}>
            <SegBtn label={t('board.strip.noList')} pressed={list === 'none'} onClick={() => onPatch(() => ({ listStyle: 'none' }))}>
              <Minus size={15} />
            </SegBtn>
            <SegBtn label={t('board.floatingContextToolbar.bulletedList')} pressed={list === 'bullet'} onClick={() => onPatch(() => ({ listStyle: 'bullet' }))}>
              <List size={15} />
            </SegBtn>
            <SegBtn label={t('board.floatingContextToolbar.numberedList')} pressed={list === 'numbered'} onClick={() => onPatch(() => ({ listStyle: 'numbered' }))}>
              <ListOrdered size={15} />
            </SegBtn>
          </Seg>
        </div>
        <div className="grid grid-cols-[4fr_3fr] gap-2.5">
          <Seg label={t('board.floatingContextToolbar.alignment')}>
            {(['left', 'center', 'right'] as const).map((a) => (
              <SegBtn key={a} label={a === 'left' ? t('common.left') : a === 'center' ? t('common.center') : t('common.right')} pressed={(first?.textAlign ?? 'left') === a} onClick={() => onPatch(() => ({ textAlign: a }))}>
                {a === 'left' ? <AlignLeft size={15} /> : a === 'center' ? <AlignCenter size={15} /> : <AlignRight size={15} />}
              </SegBtn>
            ))}
          </Seg>
          <Seg label={t('board.strip.indentGroup')}>
            <SegBtn label={t('board.floatingContextToolbar.decreaseIndent')} onClick={() => onPatch((el) => ({ indent: Math.max(0, (el.indent ?? 0) - 1) }))}>
              <IndentDecrease size={15} />
            </SegBtn>
            <SegBtn label={t('board.floatingContextToolbar.increaseIndent')} onClick={() => onPatch((el) => ({ indent: Math.min(4, (el.indent ?? 0) + 1) }))}>
              <IndentIncrease size={15} />
            </SegBtn>
          </Seg>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2 pt-2.5">
        <span className="me-auto text-2xs font-extrabold uppercase tracking-[0.06em] text-ink-subtle">{t('board.floatingContextToolbar.highlighter')}</span>
        <button
          type="button"
          title={t('board.floatingContextToolbar.noHighlight')}
          aria-label={t('board.floatingContextToolbar.noHighlight')}
          aria-pressed={!first?.highlightColor}
          onClick={() => onPatch(() => ({ highlightColor: null }))}
          className={cn('flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-line-strong transition-transform duration-base hover:scale-110', !first?.highlightColor && 'ring-2 ring-selection')}
        >
          <X size={12} className="text-ink-muted" />
        </button>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={c}
            aria-pressed={first?.highlightColor === c}
            onClick={() => onPatch(() => ({ highlightColor: c }))}
            className={cn('h-6 w-6 rounded-full ring-1 ring-black/10 transition-transform duration-base hover:scale-110', first?.highlightColor === c && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]')}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-componentes                                                           */
/* -------------------------------------------------------------------------- */

function MoreMenu({ x, y, up, extra, onClose }: { x: number; y: number; up: boolean; extra: MenuItem[]; onClose: () => void }) {
  const items = useElementMenuItems(extra);
  return <Menu items={items} x={x} y={y} align="end" placement={up ? 'above' : 'below'} onClose={onClose} minWidth={300} />;
}

function ToggleIcon({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="top">
      <button type="button" className="od-tool" data-active={!!active} disabled={disabled} onClick={onClick} aria-label={label} aria-pressed={active}>
        {children}
      </button>
    </Tooltip>
  );
}

function Palette({ colors, value, columns, title, onPick, custom, nameOf, extensionTarget }: { colors: string[]; value: string; columns: number; title: string; onPick: (c: string) => void; custom?: boolean; nameOf?: (c: string) => string; extensionTarget?: PaletteDefinition['target'] }) {
  const t = useT();
  // Chat 06.5: paletas das extensoes ativas para este alvo (post-it, preenchimento ou tinta)
  const extensionPalettes = useRegistry(PaletteRegistry).filter((pal) => !!extensionTarget && pal.target === extensionTarget);
  return (
    <div className="p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{title}</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, 24px)` }}>
        {colors.map((c) => {
          const active = value?.toLowerCase() === c.toLowerCase();
          const transparent = c === 'transparent';
          return (
            <button
              key={c}
              type="button"
              title={transparent ? t('board.floatingContextToolbar.transparent') : nameOf ? nameOf(c) : c}
              aria-label={transparent ? t('board.floatingContextToolbar.transparent') : nameOf ? nameOf(c) : c}
              onClick={() => onPick(c)}
              className={cn(
                'relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-black/10 transition-transform duration-base ease-spring hover:scale-110 dark:ring-white/15',
                active && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]',
              )}
              style={{ background: transparent ? undefined : c }}
            >
              {transparent && (
                <>
                  <span className="od-checker absolute inset-0" />
                  <span className="absolute left-1/2 top-[-2px] h-[28px] w-[2px] -translate-x-1/2 rotate-45 bg-danger" />
                </>
              )}
            </button>
          );
        })}
        {custom && (
          <label
            className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink-muted ring-1 ring-line-strong transition-transform duration-base hover:scale-110"
            title={t('common.customColor')}
            data-allow-focus
          >
            <Plus size={14} />
            <input type="color" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#194b32'} onChange={(e) => onPick(e.target.value)} />
          </label>
        )}
      </div>
      {extensionPalettes.map((pal) => (
        <div key={pal.id} className="mt-3">
          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{pal.label}</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, 24px)` }}>
            {pal.colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                aria-label={c.label}
                onClick={() => onPick(c.hex)}
                className={cn(
                  'relative h-6 w-6 overflow-hidden rounded-full ring-1 ring-black/10 transition-transform duration-base ease-spring hover:scale-110 dark:ring-white/15',
                  value?.toLowerCase() === c.hex.toLowerCase() && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]',
                )}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OpacitySlider({ value, targets, field }: { value: number; targets: CanvasElement[]; field: 'opacity' | 'fillOpacity' }) {
  const t = useT();
  return (
    <div className="border-t border-line px-3 pb-3 pt-2.5">
      <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-muted">
        <span className="flex items-center gap-1.5">
          <PaintBucket size={13} />{' '}{t('board.floatingContextToolbar.opacity')}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={10}
        max={100}
        value={Math.round(value * 100)}
        className="w-full accent-[var(--od-selection)]"
        onPointerDown={() => board().pushHistory()}
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          board().updateElements(targets.filter((t) => !t.locked).map((t) => ({ id: t.id, patch: { [field]: v } })));
        }}
      />
    </div>
  );
}

function StrokeEditor({ shapes }: { shapes: ShapeElement[] }) {
  const t = useT();
  const s = shapes[0];
  return (
    <div className="border-t border-line px-3 pb-3 pt-2.5">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{t('board.floatingContextToolbar.border')}</div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {['transparent', '#1C1C1E', '#194B32', '#5FA067', '#2A57B0', '#B3171C', '#E0A21B', '#A9ADA8'].map((c) => (
          <button
            key={c}
            type="button"
            title={c === 'transparent' ? t('board.floatingContextToolbar.noBorder') : c}
            onClick={() => applyPatch(shapes, () => ({ strokeColor: c }))}
            className={cn(
              'relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-black/10 transition-transform duration-base hover:scale-110',
              s.strokeColor.toLowerCase() === c.toLowerCase() && 'ring-2 ring-selection ring-offset-1 ring-offset-[var(--od-panel)]',
            )}
            style={{ background: c === 'transparent' ? undefined : c }}
          >
            {c === 'transparent' && <span className="od-checker absolute inset-0" />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={24}
          value={s.strokeWidth}
          className="flex-1 accent-[var(--od-selection)]"
          onPointerDown={() => board().pushHistory()}
          onChange={(e) => board().updateElements(shapes.filter((x) => !x.locked).map((x) => ({ id: x.id, patch: { strokeWidth: Number(e.target.value) } })))}
          aria-label={t('board.floatingContextToolbar.borderThickness')}
        />
        <span className="w-6 text-end text-xs tabular-nums text-ink-muted">{Math.round(s.strokeWidth)}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {(['solid', 'dashed', 'dotted'] as const).map((style) => (
          <button
            key={style}
            type="button"
            className={cn('od-btn od-btn-sm flex-1', s.strokeStyle === style ? 'od-btn-soft' : 'od-btn-ghost')}
            onClick={() => applyPatch(shapes, () => ({ strokeStyle: style }))}
          >
            <svg width="28" height="6" aria-hidden="true">
              <line x1="1" y1="3" x2="27" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={style === 'dashed' ? '6 4' : style === 'dotted' ? '2 3' : undefined} strokeLinecap="round" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function LinkEditor({ initial, onApply }: { initial: string; onApply: (url: string) => void }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const apply = () => {
    const v = value.trim();
    if (!v) return onApply('');
    onApply(/^(https?:|mailto:|#)/i.test(v) ? v : `https://${v}`);
  };
  return (
    <div className="flex w-[300px] items-center gap-2 p-2">
      <span className="ps-1 text-xs font-semibold text-ink-muted">{t('board.floatingContextToolbar.link')}</span>
      <input
        ref={inputRef}
        className="od-input h-8 flex-1 text-[13px]"
        placeholder={t('board.floatingContextToolbar.pasteLink')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') apply();
        }}
      />
      <button type="button" className="od-btn od-btn-sm od-btn-ghost text-selection" onClick={apply}>{t('board.floatingContextToolbar.apply')}</button>
    </div>
  );
}

function MiniShape({ kind }: { kind: ShapeKind }) {
  return (
    <svg width="20" height="20" viewBox="-2 -2 24 24" aria-hidden="true">
      <path d={getShapePath(kind, 20, 20)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function TypePicker({ onPick }: { onPick: (t: { type: 'sticky' } | { type: 'text'; withBg?: boolean } | { type: 'shape'; kind: ShapeKind }) => void }) {
  const t = useT();
  const [more, setMore] = useState(false);
  const primary: { label: string; node: ReactNode; target: Parameters<typeof onPick>[0] }[] = [
    {
      label: t('board.floatingContextToolbar.textBackground'),
      node: (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      ),
      target: { type: 'text', withBg: true },
    },
    { label: t('common.text'), node: <Type size={19} />, target: { type: 'text' } },
    {
      label: t('common.stickyNote'),
      node: (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 3h14v10l-4 4H3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M13 17v-4h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      ),
      target: { type: 'sticky' },
    },
    { label: t('common.rectangle'), node: <MiniShape kind="rectangle" />, target: { type: 'shape', kind: 'rectangle' } },
    { label: t('board.floatingContextToolbar.rounded'), node: <MiniShape kind="rounded_rectangle" />, target: { type: 'shape', kind: 'rounded_rectangle' } },
    { label: t('common.oval'), node: <MiniShape kind="circle" />, target: { type: 'shape', kind: 'circle' } },
    { label: t('common.triangle'), node: <MiniShape kind="triangle" />, target: { type: 'shape', kind: 'triangle' } },
    { label: t('common.diamond'), node: <MiniShape kind="diamond" />, target: { type: 'shape', kind: 'diamond' } },
    { label: t('board.floatingContextToolbar.speechBubble'), node: <MiniShape kind="speech_bubble" />, target: { type: 'shape', kind: 'speech_bubble' } },
    { label: t('board.floatingContextToolbar.parallelogram'), node: <MiniShape kind="parallelogram" />, target: { type: 'shape', kind: 'parallelogram' } },
    { label: t('board.floatingContextToolbar.star'), node: <MiniShape kind="star" />, target: { type: 'shape', kind: 'star' } },
    { label: t('board.floatingContextToolbar.hexagon'), node: <MiniShape kind="hexagon" />, target: { type: 'shape', kind: 'hexagon' } },
  ];
  const extra: typeof primary = [
    { label: t('board.floatingContextToolbar.cylinder'), node: <MiniShape kind="cylinder" />, target: { type: 'shape', kind: 'cylinder' } },
    { label: t('board.floatingContextToolbar.cloud'), node: <MiniShape kind="cloud" />, target: { type: 'shape', kind: 'cloud' } },
  ];
  return (
    <div className="w-[176px] p-2">
      <div className="grid grid-cols-4 gap-1">
        {[...primary, ...(more ? extra : [])].map((it) => (
          <Tooltip key={it.label} label={it.label} side="top">
            <button type="button" className="od-tool h-9 w-9" onClick={() => onPick(it.target)} aria-label={it.label}>
              {it.node}
            </button>
          </Tooltip>
        ))}
      </div>
      <button type="button" className="od-btn od-btn-sm od-btn-ghost mt-1 w-full text-ink-muted" onClick={() => setMore((m) => !m)}>
        {more ? t('board.floatingContextToolbar.fewerShapes') : t('board.floatingContextToolbar.moreShapes')}
      </button>
    </div>
  );
}

export type { TextualElement };
