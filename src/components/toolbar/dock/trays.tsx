/**
 * LuDraw — conteúdo das bandejas da Dock (Chat 08.2 · C-1, `STUDIO_V2_SPEC.md` §4). Todas usam `DockTray`
 * (presa ao botão, com língua) e a mesma anatomia. As ações são as mesmas de antes (mesmas funções do store, logo
 * mesmo `ensure()`/`can()` e o mesmo desfazer); o que é novo: proporções do Frame desenhadas, mini-notas do Post-it,
 * "Em bloco (grade)" na cor escolhida, abas e busca de Emojis e adesivos e o ARRASTO para o board.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Blocks, Search, Zap } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { useAppStore } from '../../../store/useAppStore';
import { STICKY_PALETTE } from '../../../utils/factory';
import { getShapePath } from '../../../utils/shapes';
import { insertImageSticker, insertPreset, insertSticker, startPresentation } from '../../../utils/boardActions';
import { scaleNormalizedPath } from '../../../utils/svgPath';
import { screenToWorld, type Point } from '../../../utils/math';
import { PaletteRegistry, ShapeRegistry, StickerRegistry, useRegistry, type ShapeDefinition, type StickerPackDefinition } from '../../../extensions/registries';
import { groupByExtension, useExtensionName } from '../../extensions/extensionUi';
import type { ShapeKind, ToolType } from '../../../types/canvas';
import type { FrameRatio } from '../../../utils/frames';
import { STICKER_EMOJIS } from '../../../utils/stickyMeta';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../ui/Tooltip';
import { useT } from '../../../i18n/useT';
import type { TKey } from '../../../i18n';
import { drawerTrigger, useStudioUi } from '../../studio/studioUi';
import {
  ArrowLineIcon,
  BatonIcon,
  BlockArrowIcon,
  CurveLineIcon,
  DividerIcon,
  ElbowLineIcon,
  EraserIcon,
  FlowchartIcon,
  HighlighterIcon,
  LineIcon,
  PenIcon,
  PrototypeIcon,
  SlidesIcon,
  StickyIcon,
  TemplatesIcon,
  TextDiagramIcon,
} from '../../icons/od';
import { ComingSoonBadge, DockTray, ExtensionBadge, TrayCaption } from './DockTray';
import { useDockUi } from './dockUi';

const done = () => useDockUi.getState().close(false);
const b = useBoardStore.getState;

export function openTextDiagram(): void {
  if (b().ensure('board.edit')) useAppStore.getState().openModal({ type: 'diagram' });
}
export function openTemplateGallery(): void {
  useAppStore.getState().openModal({ type: 'templates', target: 'board' });
}

/** Linha de ação das bandejas (ícone · rótulo · selo opcional). "Em breve" = desabilitada com dica. */
function TrayRow({ icon, label, onClick, soon, hint }: { icon: ReactNode; label: string; onClick?: () => void; soon?: boolean; hint?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn('od-menu-item mx-1.5 w-[calc(100%-12px)]', soon && 'cursor-not-allowed opacity-60')}
      aria-disabled={soon || undefined}
      title={soon ? hint ?? t('studio.dock.comingSoonHint') : undefined}
      onClick={() => {
        if (soon) return;
        done();
        onClick?.();
      }}
    >
      <span className="flex w-5 justify-center text-[var(--od-accent)]">{icon}</span>
      <span className="flex-1">{label}</span>
      {soon && <ComingSoonBadge />}
    </button>
  );
}

/* ------------------------------- Inserção rápida ------------------------------- */

export function QuickTray() {
  const t = useT();
  const items: { id: Parameters<typeof insertPreset>[0]; label: string; description: string; icon: ReactNode }[] = [
    { id: 'sticky-block', label: t('board.leftToolbar.stickyNoteBlock'), description: t('board.leftToolbar.colorful33GridBrainstorming'), icon: <StickyIcon size={18} /> },
    { id: 'flowchart', label: t('board.leftToolbar.simpleFlowchart'), description: t('board.leftToolbar.startDecisionEndReadyEdit'), icon: <FlowchartIcon size={18} /> },
    { id: 'brainwriting', label: t('board.leftToolbar.brainwriting'), description: t('board.leftToolbar.title34GridSticky'), icon: <Blocks size={18} /> },
    { id: 'demo', label: t('board.leftToolbar.demoContent'), description: t('board.leftToolbar.objectsTryEveryTransformation'), icon: <Zap size={18} /> },
  ];
  return (
    <DockTray id="quick" title={t('board.leftToolbar.quickInsert')} label={t('board.leftToolbar.quickInsert')} width={300} footer={t('board.leftToolbar.presetsInsertedCenterYourScreen')}>
      <div className="pb-1.5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className="od-menu-item mx-1.5 min-h-[52px] w-[calc(100%-12px)] items-start py-2"
            onClick={() => {
              done();
              insertPreset(it.id);
            }}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel-sunken text-[var(--od-accent)]">{it.icon}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{it.label}</span>
              <span className="block text-xs text-ink-subtle">{it.description}</span>
            </span>
          </button>
        ))}
        <TrayRow icon={<TemplatesIcon size={17} />} label={t('board.leftToolbar.templateGallery')} onClick={openTemplateGallery} />
      </div>
    </DockTray>
  );
}

/* ---------------------------------- Post-it ---------------------------------- */

export function StickyTray() {
  const t = useT();
  const current = useBoardStore((s) => s.toolOptions.stickyColor);
  const [hover, setHover] = useState<string | null>(null);
  const [block, setBlock] = useState(false);
  const stickyPalettes = useRegistry(PaletteRegistry).filter((p) => p.target === 'sticky');
  const all = [...STICKY_PALETTE.map((c) => ({ hex: c.hex, name: c.name })), ...stickyPalettes.flatMap((p) => p.colors.map((c) => ({ hex: c.hex, name: c.label })))];
  const shownName = all.find((c) => c.hex === (hover ?? current))?.name ?? '';
  const pick = (hex: string) => {
    b().setToolOption('stickyColor', hex);
    done();
    if (block) insertPreset('sticky-block', { stickyColor: hex });
    else b().setActiveTool('sticky');
  };
  const Note = ({ hex, name }: { hex: string; name: string }) => (
    <button
      type="button"
      data-sticky-color={hex}
      aria-label={t('board.leftToolbar.stickyNoteName', { name })}
      title={t('board.leftToolbar.nameClickThenClickBoard', { name })}
      onPointerEnter={() => setHover(hex)}
      onPointerLeave={() => setHover(null)}
      onFocus={() => setHover(hex)}
      onBlur={() => setHover(null)}
      onClick={() => pick(hex)}
      className={cn(
        'relative aspect-square rounded-[5px] shadow-[0_1px_1px_rgba(0,0,0,0.08),0_3px_6px_rgba(0,0,0,0.08)] transition-transform duration-base ease-spring hover:-translate-y-0.5 hover:-rotate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)] [.od-reduce-motion_&]:hover:transform-none',
        current === hex && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]',
      )}
      style={{ background: hex }}
    >
      {/* pedaço de fita */}
      <span aria-hidden="true" className="absolute inset-x-[30%] -top-[3px] h-[6px] rounded-[2px] bg-white/65" />
    </button>
  );
  return (
    <DockTray
      id="sticky"
      title={t('common.stickyNote')}
      label={t('common.stickyNote')}
      headerExtra={<span className="truncate font-display text-[15px] font-bold text-ink" data-sticky-color-name>{shownName}</span>}
      shortcut="N"
      width={340}
      footer={t('studio.dock.stickyFooter')}
    >
      <div className="grid grid-cols-8 gap-1.5 px-3.5 pb-2.5 pt-1.5">
        {STICKY_PALETTE.map((c) => (
          <Note key={c.hex} hex={c.hex} name={c.name} />
        ))}
      </div>
      {stickyPalettes.map((p) => (
        <div key={p.id}>
          <TrayCaption>
            {p.label} {p.source === 'extension' && <ExtensionBadge />}
          </TrayCaption>
          <div className="grid grid-cols-8 gap-1.5 px-3.5 pb-2.5 pt-1">
            {p.colors.map((c) => (
              <Note key={c.hex} hex={c.hex} name={c.label} />
            ))}
          </div>
        </div>
      ))}
      <div className="px-3.5 pb-3">
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-panel-sunken p-0.5" role="radiogroup" aria-label={t('studio.dock.stickyMode')}>
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={block === v}
              data-sticky-mode={v ? 'block' : 'single'}
              className={cn('h-7 rounded-md text-[12px] font-semibold transition-colors duration-base', block === v ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
              onClick={() => setBlock(v)}
            >
              {v ? t('studio.dock.stickyBlock') : t('studio.dock.stickySingle')}
            </button>
          ))}
        </div>
      </div>
    </DockTray>
  );
}

/* ----------------------------------- Formas ----------------------------------- */

/** Ícone de forma: do núcleo (`kind`) ou da definição do ShapeRegistry (formas de extensão). */
function ShapeGlyph({ kind, def }: { kind?: ShapeKind; def?: ShapeDefinition }) {
  const d = def ? def.path(20, 20) : getShapePath(kind ?? 'rectangle', 20, 20);
  const deco = def?.customDecoration && def.box ? scaleNormalizedPath(def.customDecoration, def.box.width, def.box.height, 20, 20) : null;
  return (
    <svg width="24" height="24" viewBox="-2 -2 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {deco && <path d={deco} fill="none" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

function ShapeCell({ label, onClick, soon, children }: { label: string; onClick?: () => void; soon?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-disabled={soon || undefined}
      title={soon ? t('studio.dock.comingSoonHint') : label}
      className={cn('flex min-w-0 flex-col items-center gap-1 rounded-[10px] px-0.5 pb-1.5 pt-2 text-2xs font-semibold text-ink-subtle transition-colors duration-base hover:bg-panel-active hover:text-ink', soon && 'cursor-not-allowed opacity-60 hover:bg-transparent')}
      onClick={() => {
        if (soon) return;
        done();
        onClick?.();
      }}
    >
      <span className="text-ink-muted">{children}</span>
      <span className="w-full truncate text-center">{label}</span>
      {soon && <ComingSoonBadge className="px-1 text-2xs" />}
    </button>
  );
}

export function ShapesTray() {
  const t = useT();
  const registry = useRegistry(ShapeRegistry);
  const coreShapes = registry.filter((s) => s.source !== 'extension' && s.kind);
  const extensionGroups = groupByExtension(registry);
  const nameOf = useExtensionName();
  const pick = (kind: ShapeKind) => {
    b().setToolOption('shapeKind', kind);
    b().setToolOption('shapeId', undefined);
    b().setActiveTool('shape');
  };
  const pickExtension = (def: ShapeDefinition) => {
    b().setToolOption('shapeKind', 'rectangle');
    b().setToolOption('shapeId', def.id);
    b().setActiveTool('shape');
  };
  const line = (routing: 'straight' | 'orthogonal' | 'curved', endArrow: 'none' | 'arrow') => () => {
    b().setToolOption('connectorRouting', routing);
    b().setToolOption('connectorStartArrow', 'none');
    b().setToolOption('connectorEndArrow', endArrow);
    b().setActiveTool('connector');
  };
  const lines: { id: string; label: string; icon: ReactNode; run: () => void }[] = [
    { id: 'line', label: t('board.leftToolbar.line'), icon: <LineIcon size={20} />, run: line('straight', 'none') },
    { id: 'arrow', label: t('board.leftToolbar.arrow'), icon: <ArrowLineIcon size={20} />, run: line('straight', 'arrow') },
    { id: 'elbow', label: t('board.leftToolbar.elbowArrow'), icon: <ElbowLineIcon size={20} />, run: line('orthogonal', 'arrow') },
    { id: 'curve', label: t('studio.dock.curve'), icon: <CurveLineIcon size={20} />, run: line('curved', 'arrow') },
  ];
  return (
    <DockTray
      id="shapes"
      title={t('board.leftToolbar.shapes')}
      label={t('board.leftToolbar.shapes')}
      shortcut="S"
      width={340}
      footer={t('studio.dock.shapesFooter')}
      footerAction={
        <button type="button" className="flex shrink-0 items-center gap-1.5 text-[12px] font-bold text-[var(--od-selection)] hover:underline" onClick={() => (done(), openTextDiagram())}>
          <TextDiagramIcon size={14} /> {t('board.leftToolbar.textDiagram2')}
        </button>
      }
    >
      <TrayCaption>{t('studio.dock.lines')}</TrayCaption>
      <div className="grid grid-cols-4 gap-1 px-3.5 pb-2">
        {lines.map((l) => (
          <Tooltip key={l.id} label={l.label} side="top">
            <button type="button" data-line={l.id} aria-label={l.label} className="grid h-9 w-full place-items-center rounded-[9px] bg-panel-sunken text-ink-muted transition-colors duration-base hover:bg-panel-active hover:text-ink" onClick={() => (done(), l.run())}>
              {l.icon}
            </button>
          </Tooltip>
        ))}
      </div>
      <TrayCaption>{t('studio.dock.basicShapes')}</TrayCaption>
      <div className="grid grid-cols-5 gap-1 px-3.5 pb-2">
        {coreShapes.map((s) => (
          <ShapeCell key={s.id} label={s.label} onClick={() => pick(s.kind!)}>
            <ShapeGlyph kind={s.kind} />
          </ShapeCell>
        ))}
        <ShapeCell label={t('board.leftToolbar.blockArrow')} soon>
          <BlockArrowIcon size={22} />
        </ShapeCell>
        <ShapeCell label={t('board.leftToolbar.divider')} soon>
          <DividerIcon size={22} />
        </ShapeCell>
      </div>
      {extensionGroups.map((g) => (
        <div key={g.extensionId}>
          <TrayCaption>
            {nameOf(g.extensionId)} <ExtensionBadge />
          </TrayCaption>
          <div className="grid grid-cols-5 gap-1 px-3.5 pb-2">
            {g.items.map((s) => (
              <ShapeCell key={s.id} label={s.label} onClick={() => pickExtension(s)}>
                <ShapeGlyph def={s} />
              </ShapeCell>
            ))}
          </div>
        </div>
      ))}
    </DockTray>
  );
}

/* ------------------------------------ Pena ------------------------------------ */

const PEN_PRESETS: { color: string; width: number; key: TKey }[] = [
  { color: '#194B32', width: 2, key: 'board.leftToolbar.thin' },
  { color: '#E5484D', width: 4, key: 'board.leftToolbar.medium' },
  { color: '#3FA56F', width: 8, key: 'board.leftToolbar.thick' },
];

export function PenTray() {
  const t = useT();
  const tool = useBoardStore((s) => s.activeTool);
  const opts = useBoardStore((s) => s.toolOptions);
  const set = (next: ToolType) => {
    b().setActiveTool(next);
    done();
  };
  const tools: { id: ToolType; label: string; shortcut?: string; icon: ReactNode }[] = [
    { id: 'pen', label: t('board.leftToolbar.pen'), shortcut: 'P', icon: <PenIcon size={19} /> },
    { id: 'highlighter', label: t('board.leftToolbar.highlighter'), icon: <HighlighterIcon size={19} /> },
    { id: 'eraser', label: t('board.leftToolbar.eraser'), shortcut: 'E', icon: <EraserIcon size={19} /> },
  ];
  return (
    <DockTray id="pen" title={t('board.leftToolbar.pen')} label={t('board.leftToolbar.pen')} shortcut="P" width={300} footer={t('studio.dock.penFooter')}>
      <div className="grid grid-cols-3 gap-1 px-3.5 pb-2">
        {tools.map((x) => (
          <button
            key={x.id}
            type="button"
            data-pen-tool={x.id}
            aria-pressed={tool === x.id}
            className="flex flex-col items-center gap-1 rounded-[10px] py-2 text-[11px] font-semibold text-ink-muted transition-colors duration-base hover:bg-panel-hover aria-pressed:bg-accent aria-pressed:text-[var(--od-accent-contrast)] dark:aria-pressed:bg-accent-soft dark:aria-pressed:text-[var(--od-accent)]"
            onClick={() => set(x.id)}
          >
            {x.icon}
            {x.label}
          </button>
        ))}
      </div>
      <TrayCaption>{t('studio.dock.penThickness')}</TrayCaption>
      <div className="flex items-center gap-1 px-3.5 pb-3">
        {PEN_PRESETS.map((p) => {
          const label = t(p.key);
          const active = tool === 'pen' && opts.penColor === p.color && opts.penWidth === p.width;
          return (
            <Tooltip key={p.key} label={t('board.leftToolbar.lowercasePen', { lowerCase: label.toLowerCase() })} side="top">
              <button
                type="button"
                className="od-tool"
                data-active={active}
                onClick={() => {
                  b().setToolOption('penColor', p.color);
                  b().setToolOption('penWidth', p.width);
                  set('pen');
                }}
                aria-label={t('board.leftToolbar.labelPen', { label })}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-line-strong">
                  <span className="rounded-full" style={{ width: 4 + p.width * 1.6, height: 4 + p.width * 1.6, background: p.color }} />
                </span>
              </button>
            </Tooltip>
          );
        })}
        <span className="mx-1 h-6 w-px bg-line" />
        <Tooltip label={t('common.customColor')} side="top">
          <label className="od-tool cursor-pointer" aria-label={t('board.leftToolbar.customPenColor')}>
            <span className="h-5 w-5 rounded-full ring-1 ring-line-strong" style={{ background: opts.penColor }} />
            <input
              type="color"
              className="sr-only"
              value={opts.penColor}
              onChange={(e) => {
                b().setToolOption('penColor', e.target.value);
                b().setActiveTool('pen');
              }}
            />
          </label>
        </Tooltip>
      </div>
    </DockTray>
  );
}

/* ----------------------------------- Frame ----------------------------------- */

export function FrameTray() {
  const t = useT();
  const current = useBoardStore((s) => s.toolOptions.frameRatio ?? 'free');
  // proporções desenhadas na própria forma (sem aparelhos)
  const presets: { id: FrameRatio; label: string; w: number; h: number; dashed?: boolean; radius?: number }[] = [
    { id: 'free', label: t('board.leftToolbar.free'), w: 30, h: 22, dashed: true },
    { id: '16:9', label: '16:9', w: 34, h: 19 },
    { id: '4:3', label: '4:3', w: 28, h: 21 },
    { id: '1:1', label: '1:1', w: 22, h: 22 },
    { id: 'a4', label: 'A4', w: 18, h: 25 },
    { id: 'mobile', label: t('board.leftToolbar.phone'), w: 13, h: 27, radius: 4 },
  ];
  const pick = (id: FrameRatio) => {
    b().setToolOption('frameRatio', id);
    b().setActiveTool('frame');
    done();
  };
  return (
    <DockTray
      id="frame"
      title={t('board.leftToolbar.frame')}
      label={t('board.leftToolbar.frame')}
      shortcut="F"
      width={360}
      footer={t('board.leftToolbar.dragBoardDrawClickDefault')}
      footerAction={
        <button
          type="button"
          className="shrink-0 text-[12px] font-bold text-[var(--od-selection)] hover:underline"
          onClick={() => {
            done();
            useStudioUi.getState().openDrawer('script', drawerTrigger('script'));
          }}
        >
          {t('studio.dock.frameScript')}
        </button>
      }
    >
      <div className="flex items-end gap-2 px-3.5 pb-2.5 pt-0.5" role="radiogroup" aria-label={t('board.leftToolbar.frameAspectRatio')}>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={current === p.id}
            data-frame-ratio={p.id}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-xl pb-1.5 pt-2.5 text-[11px] font-bold text-ink-muted transition-colors duration-base hover:bg-panel-hover aria-checked:bg-accent-soft aria-checked:text-ink"
            onClick={() => pick(p.id)}
          >
            <i aria-hidden="true" className={cn('block border-[1.75px] border-current', p.dashed && 'border-dashed')} style={{ width: p.w, height: p.h, borderRadius: p.radius ?? 3 }} />
            {p.label}
          </button>
        ))}
      </div>
      <div className="mx-3.5 h-px bg-line" />
      <div className="py-1.5">
        <TrayRow icon={<SlidesIcon size={17} />} label={t('board.leftToolbar.presentFrames')} onClick={() => startPresentation()} />
        <TrayRow icon={<PrototypeIcon size={17} />} label={t('studio.dock.navigablePrototype')} soon />
        <TrayRow icon={<BatonIcon size={17} />} label={t('board.leftToolbar.interactiveActivities')} soon />
      </div>
    </DockTray>
  );
}

/* ----------------------------- Emojis e adesivos ----------------------------- */

/** Nome de cada emoji (busca e leitores de tela), na mesma ordem de `STICKER_EMOJIS`. */
const EMOJI_KEYS: TKey[] = [
  'studio.emoji.thumbsUp', 'studio.emoji.thumbsDown', 'studio.emoji.heart', 'studio.emoji.fire', 'studio.emoji.idea', 'studio.emoji.done',
  'studio.emoji.no', 'studio.emoji.party', 'studio.emoji.star', 'studio.emoji.rocket', 'studio.emoji.warning', 'studio.emoji.question',
  'studio.emoji.smile', 'studio.emoji.laugh', 'studio.emoji.love', 'studio.emoji.thinking', 'studio.emoji.surprised', 'studio.emoji.sad',
  'studio.emoji.cheer', 'studio.emoji.clap', 'studio.emoji.strong', 'studio.emoji.thanks', 'studio.emoji.eyes', 'studio.emoji.target',
  'studio.emoji.pin', 'studio.emoji.clip', 'studio.emoji.calendar', 'studio.emoji.alarm', 'studio.emoji.speech', 'studio.emoji.brain',
  'studio.emoji.tools', 'studio.emoji.growth', 'studio.emoji.money', 'studio.emoji.finish', 'studio.emoji.puzzle', 'studio.emoji.sprout',
];

type StickerItem = { key: string; label: string; emoji?: string; dataUrl?: string };

/** Coloca o adesivo: no centro da tela ou no ponto do board onde foi solto (mesmas ações do store: `ensure` + desfazer). */
function placeSticker(it: StickerItem, at?: Point): void {
  if (it.emoji) insertSticker(it.emoji, at);
  else if (it.dataUrl) void insertImageSticker(it.dataUrl, at);
}

/** Ponto do board sob o ponteiro, se ele foi solto sobre o canvas (não sobre a Dock, bandejas, gavetas ou módulos). */
export function boardPointAt(clientX: number, clientY: number): Point | null {
  const el = document.elementFromPoint(clientX, clientY);
  const stage = el?.closest<HTMLElement>('[data-canvas-stage]');
  // dentro do canvas vale soltar em cima de objetos (cartões de Kanban também marcam `data-od-floating`); só as camadas
  // de interface ficam de fora
  if (!el || !stage || el.closest('[data-od-toolbar], [data-dock-tray], [data-studio-drawer], [data-studio-region], [data-studio-part]')) return null;
  const r = stage.getBoundingClientRect();
  return screenToWorld({ x: clientX - r.left, y: clientY - r.top }, b().camera);
}

function StickerButton({ it, onGhost }: { it: StickerItem; onGhost: (g: { it: StickerItem; x: number; y: number } | null) => void }) {
  const t = useT();
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const suppress = useRef(false);
  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, dragging: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético ou já solto */
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s) return;
    if (!s.dragging && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6) s.dragging = true;
    if (s.dragging) onGhost({ it, x: e.clientX, y: e.clientY });
  };
  const onUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    start.current = null;
    if (!s?.dragging) return;
    suppress.current = true;
    onGhost(null);
    const at = boardPointAt(e.clientX, e.clientY);
    if (!at) return;
    done();
    placeSticker(it, at);
  };
  return (
    <button
      type="button"
      data-sticker={it.key}
      title={it.label}
      aria-label={t('board.leftToolbar.insertStickerEmoji', { emoji: it.label })}
      className="flex aspect-square items-center justify-center rounded-lg text-[20px] transition-transform duration-base ease-spring hover:scale-125 hover:bg-panel-hover [.od-reduce-motion_&]:hover:scale-100"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        start.current = null;
        onGhost(null);
      }}
      onClick={() => {
        if (suppress.current) {
          suppress.current = false;
          return;
        }
        done();
        placeSticker(it);
      }}
    >
      {it.emoji ?? (it.dataUrl ? <img src={it.dataUrl} alt="" className="h-6 w-6 object-contain" draggable={false} /> : null)}
    </button>
  );
}

type EmojiTab = 'emoji' | 'stickers' | 'extensions';

export function EmojiTray() {
  const t = useT();
  const packs = useRegistry(StickerRegistry);
  const [tab, setTab] = useState<EmojiTab>('emoji');
  const [query, setQuery] = useState('');
  const [ghost, setGhost] = useState<{ it: StickerItem; x: number; y: number } | null>(null);
  const corePacks = packs.filter((p) => p.source !== 'extension');
  const extPacks = packs.filter((p) => p.source === 'extension');
  const fromPacks = (list: StickerPackDefinition[]): StickerItem[] => list.flatMap((p) => p.items.map((i) => ({ key: `${p.id}/${i.id}`, label: i.label, emoji: i.emoji, dataUrl: i.dataUrl })));
  const items = useMemo(() => {
    const base: StickerItem[] =
      tab === 'emoji' ? STICKER_EMOJIS.map((emoji, i) => ({ key: emoji, emoji, label: EMOJI_KEYS[i] ? t(EMOJI_KEYS[i]) : emoji })) : fromPacks(tab === 'stickers' ? corePacks : extPacks);
    const q = query.trim().toLowerCase();
    return q ? base.filter((i) => i.label.toLowerCase().includes(q) || i.emoji === q) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, packs, t]);
  const tabs: { id: EmojiTab; label: string }[] = [
    { id: 'emoji', label: t('studio.dock.tabEmojis') },
    { id: 'stickers', label: t('studio.dock.tabStickers') },
    { id: 'extensions', label: t('studio.dock.tabFromExtensions') },
  ];
  return (
    <DockTray id="emoji" title={t('studio.dock.emojiTitle')} label={t('studio.dock.emojiTitle')} shortcut="Shift+E" width={340} footer={t('studio.dock.emojiFooter')}>
      <div className="px-3.5 pb-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input className="od-input h-8 ps-8 text-[13px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('studio.dock.emojiSearch')} aria-label={t('studio.dock.emojiSearch')} />
        </div>
      </div>
      <div className="flex gap-1 px-3.5 pb-2" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-emoji-tab={x.id} className={cn('od-btn od-btn-sm', tab === x.id ? 'od-btn-soft' : 'od-btn-ghost text-ink-muted')} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {items.length ? (
        <div className="grid grid-cols-8 gap-0.5 px-3 pb-2.5">
          {items.map((it) => (
            <StickerButton key={it.key} it={it} onGhost={setGhost} />
          ))}
        </div>
      ) : (
        <p className="px-3.5 pb-3 text-[12px] text-ink-subtle">{query ? t('studio.dock.emojiNone') : tab === 'extensions' ? t('studio.dock.emojiNoExtensions') : t('studio.dock.emojiNoStickers')}</p>
      )}
      {ghost &&
        createPortal(
          <div className="pointer-events-none fixed z-[900] -translate-x-1/2 -translate-y-1/2 text-[34px] opacity-90" style={{ left: ghost.x, top: ghost.y }} data-sticker-ghost>
            {ghost.it.emoji ?? (ghost.it.dataUrl ? <img src={ghost.it.dataUrl} alt="" className="h-10 w-10 object-contain" /> : null)}
          </div>,
          document.body,
        )}
    </DockTray>
  );
}
