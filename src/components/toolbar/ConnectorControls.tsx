import type { ReactNode } from 'react';
import { Check, Plus, Route } from 'lucide-react';
import type { ConnectorElement, ElementPatch, ShapeKind } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { INK_COLORS } from '../../utils/factory';
import { getShapePath } from '../../utils/shapes';
import { insertShapeIntoConnector, swapConnectorEnds, type InsertTarget } from '../../utils/boardActions';
import type { ArrowHead } from '../../utils/connectors';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { ConnectorLabelPanel } from './ConnectorLabelControls';
import { StripPop } from '../strip/StripPop';
import { LineLabelIcon, SwapIcon } from '../icons/od';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';

const board = () => useBoardStore.getState();

const ARROWS: { id: ArrowHead; label: string }[] = [
  { id: 'none', get label() { return t('common.none'); } },
  { id: 'arrow', get label() { return t('board.connectorControls.arrow'); } },
  { id: 'filled_arrow', get label() { return t('board.connectorControls.filledArrow'); } },
  { id: 'diamond', get label() { return t('common.diamond'); } },
  { id: 'circle', get label() { return t('board.connectorControls.circle'); } },
];

function apply(connectors: ConnectorElement[], fn: (c: ConnectorElement) => ElementPatch, history = true) {
  const list = connectors.filter((c) => !c.locked);
  if (!list.length) return;
  if (history) board().pushHistory();
  board().updateElements(list.map((c) => ({ id: c.id, patch: fn(c) })));
}

/** Pré-visualização de uma ponta de seta (aponta para a direita, ou esquerda se `flip`). */
function ArrowPreview({ type, flip, active }: { type: ArrowHead; flip?: boolean; active?: boolean }) {
  const color = active ? 'var(--od-selection)' : 'currentColor';
  const head =
    type === 'arrow' ? (
      <path d="M 22 5 L 30 10 L 22 15" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ) : type === 'filled_arrow' ? (
      <path d="M 30 10 L 21 5 L 21 15 Z" fill={color} />
    ) : type === 'diamond' ? (
      <path d="M 30 10 L 25 6.5 L 20 10 L 25 13.5 Z" fill={color} />
    ) : type === 'circle' ? (
      <circle cx="26" cy="10" r="3.6" fill={color} />
    ) : null;
  return (
    <svg width="34" height="20" viewBox="0 0 32 20" style={{ transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
      <line x1="2" y1="10" x2={type === 'none' ? 30 : 27} y2="10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {head}
    </svg>
  );
}

interface Props {
  connectors: ConnectorElement[];
  open: string | null;
  onToggle: (id: never) => void;
  close: () => void;
}

/**
 * Controles da barra contextual quando a seleção é de linhas (imagens 9–12):
 * ponta inicial, trocar extremidades, ponta final, tipo de linha (com saltos de linha), cor,
 * inserir forma, inserir/editar o texto da linha (rótulo — Chat 03) e o estilo desse texto
 * ("Aa" → `ConnectorLabelPanel`: tamanho, fonte, cores, fundo, borda e cantos).
 */
export function ConnectorControls({ connectors, open, onToggle, close }: Props) {
  const t = useT();
  const c = connectors[0];
  const toggle = (id: string) => (onToggle as (id: string) => void)(id);
  const jumpsOn = connectors.filter((x) => x.routingType === 'orthogonal').every((x) => x.lineJumps !== false);

  return (
    <>
      {/* Chat 08.2 · C-2: Pontas (início e fim num chip só, com texto nos botões) e, ao lado, ⇄ Inverter o sentido */}
      <CPop
        id="c-ends"
        open={open}
        onToggle={toggle}
        label={t('board.strip.ends')}
        variant="chip"
        name={t('board.strip.ends')}
      >
        {{
          trigger: (
            <span className="flex items-center gap-0.5" data-strip-value>
              {c.startArrow === 'none' ? <span className="px-0.5 text-[11.5px] text-ink-subtle">{t('common.none')}</span> : <ArrowPreview type={c.startArrow} flip />}
              <span className="text-ink-subtle">·</span>
              {c.endArrow === 'none' ? <span className="px-0.5 text-[11.5px] text-ink-subtle">{t('common.none')}</span> : <ArrowPreview type={c.endArrow} />}
            </span>
          ),
          content: (
            <div className="flex gap-1 p-1">
              <div data-ends="start">
                <div className="px-2 pt-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('board.strip.start')}</div>
                <ArrowList value={c.startArrow} flip onPick={(a) => apply(connectors, () => ({ startArrow: a }))} />
              </div>
              <span className="w-px bg-line" />
              <div data-ends="end">
                <div className="px-2 pt-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('board.strip.end')}</div>
                <ArrowList value={c.endArrow} onPick={(a) => apply(connectors, () => ({ endArrow: a }))} />
              </div>
            </div>
          ),
        }}
      </CPop>
      <Tooltip label={t('board.connectorControls.swapLinesEnds')} side="top">
        <button type="button" className="od-tool" onClick={() => swapConnectorEnds(c.id)} aria-label={t('board.connectorControls.swapLinesEnds')} data-strip-control="swap">
          <SwapIcon size={18} />
        </button>
      </Tooltip>
      {connectors.some((x) => x.waypoints?.length) && (
        <Tooltip label={t('board.connectorControls.adjustRouteAutomatically')} side="top">
          <button type="button" className="od-tool" onClick={() => apply(connectors, () => ({ waypoints: undefined }))} aria-label={t('board.connectorControls.adjustRouteAutomatically')}>
            <Route size={17} />
          </button>
        </Tooltip>
      )}
      <span className="od-divider-v" />
      <CPop id="c-type" open={open} onToggle={toggle} label={t('board.connectorControls.lineType')} title={t('board.strip.stroke')} variant="chip" name={t('board.strip.stroke')}>
        {{
          trigger: (
            <span className="flex items-center gap-1" data-strip-value>
              <RoutingIcon kind={c.routingType} />
              <span className="tabular-nums">{c.strokeWidth} px</span>
            </span>
          ),
          content: (
            <div className="w-[240px] p-4">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={c.strokeWidth}
                  className="flex-1 accent-[var(--od-selection)]"
                  onPointerDown={() => board().pushHistory()}
                  onChange={(e) => apply(connectors, () => ({ strokeWidth: Number(e.target.value) }), false)}
                  aria-label={t('board.connectorControls.lineThickness')}
                />
                <span className="w-5 text-end text-xs tabular-nums text-ink-muted">{c.strokeWidth}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1">
                {(['straight', 'orthogonal', 'curved'] as const).map((r) => (
                  <Tooltip key={r} label={r === 'straight' ? t('board.connectorControls.straight') : r === 'orthogonal' ? t('board.connectorControls.elbow') : t('board.connectorControls.curved')} side="top">
                    <button type="button" className="od-tool w-full" data-active={c.routingType === r} onClick={() => apply(connectors, () => ({ routingType: r, waypoints: undefined }))}>
                      <RoutingIcon kind={r} />
                    </button>
                  </Tooltip>
                ))}
                {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                  <Tooltip key={st} label={st === 'solid' ? t('board.connectorControls.solid') : st === 'dashed' ? t('board.connectorControls.dashed') : t('board.connectorControls.dotted')} side="top">
                    <button type="button" className="od-tool w-full" data-active={c.strokeStyle === st} onClick={() => apply(connectors, () => ({ strokeStyle: st }))}>
                      <svg width="26" height="6" aria-hidden="true">
                        <line x1="1" y1="3" x2="25" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={st === 'dashed' ? '5 4' : st === 'dotted' ? '0.1 4' : undefined} />
                      </svg>
                    </button>
                  </Tooltip>
                ))}
              </div>
              <div className="my-3 h-px bg-line" />
              <button
                type="button"
                className="od-menu-item"
                disabled={!connectors.some((x) => x.waypoints?.length)}
                onClick={() => {
                  apply(connectors, () => ({ waypoints: undefined }));
                  close();
                }}
              >
                <Route size={17} />{' '}{t('board.connectorControls.adjustRouteAutomatically')}</button>
              <button
                type="button"
                className="od-menu-item"
                role="menuitemcheckbox"
                aria-checked={jumpsOn}
                disabled={!connectors.some((x) => x.routingType === 'orthogonal')}
                title={connectors.some((x) => x.routingType === 'orthogonal') ? t('board.connectorControls.arcsWhereThisLineCrosses') : t('board.connectorControls.availableElbowLines')}
                onClick={() => apply(connectors, () => ({ lineJumps: !jumpsOn }))}
              >
                <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
                  <path d="M1 9 H7 A4 4 0 0 1 15 9 H21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="flex-1">{t('board.connectorControls.lineJumps')}</span>
                {jumpsOn && <Check size={15} className="text-selection" />}
              </button>
            </div>
          ),
        }}
      </CPop>
      <CPop id="c-color" open={open} onToggle={toggle} label={t('board.connectorControls.lineColor')}>
        {{
          trigger: <span className="h-[18px] w-[18px] rounded-full ring-1 ring-line-strong" style={{ background: c.strokeColor }} />,
          content: (
            // largura própria: dentro do botão (posição absoluta) o cartão encolhia e as bolinhas se sobrepunham
            <div className="w-max p-3">
              <div className="mb-2 text-xs font-semibold text-ink-muted">{t('board.connectorControls.lineColor')}</div>
              <div className="grid grid-cols-6 gap-2">
                {INK_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    title={col}
                    onClick={() => apply(connectors, () => ({ strokeColor: col }))}
                    className={cn(
                      'h-6 w-6 rounded-full ring-1 ring-black/10 transition-transform duration-base ease-spring hover:scale-110 dark:ring-white/15',
                      c.strokeColor.toLowerCase() === col.toLowerCase() && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]',
                    )}
                    style={{ background: col }}
                  />
                ))}
                <label className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink-muted ring-1 ring-line-strong" data-allow-focus title={t('common.customColor')}>
                  <Plus size={14} />
                  <input type="color" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(c.strokeColor) ? c.strokeColor : '#1c1c1e'} onChange={(e) => apply(connectors, () => ({ strokeColor: e.target.value }))} />
                </label>
              </div>
            </div>
          ),
        }}
      </CPop>
      <span className="od-divider-v" />
      <CPop id="c-insert" open={open} onToggle={toggle} label={t('board.connectorControls.insertShape')}>
        {{
          trigger: (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 2 L5 5 M13 13 L16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <rect x="5.5" y="5.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          ),
          content: (
            <InsertPicker
              disabled={connectors.length !== 1}
              onPick={(t) => {
                insertShapeIntoConnector(c.id, t);
                close();
              }}
            />
          ),
        }}
      </CPop>
      <Tooltip label={connectors.length === 1 ? (c.label ? t('board.connectorControls.editLinesText') : t('board.connectorControls.insertTextLine')) : t('board.connectorControls.selectOnlyOneLine')} side="top">
        <button
          type="button"
          className="od-tool"
          disabled={connectors.length !== 1}
          onClick={() => {
            close();
            // `setEditingId` checa `board.edit` e grava o passo de desfazer
            board().setEditingId(c.id);
          }}
          aria-label={t('board.strip.lineText')}
          data-strip-control="line-text"
        >
          <LineLabelIcon size={18} />
        </button>
      </Tooltip>
      {connectors.some((x) => x.label && x.label.trim()) && (
        <CPop id="c-label" open={open} onToggle={toggle} label={t('board.connectorControls.lineTextStyle')}>
          {{
            trigger: (
              <span className="flex flex-col items-center leading-none">
                <span className="text-[14px] font-bold">Aa</span>
                <span className="mt-0.5 text-2xs text-ink-subtle">{t('common.text')}</span>
              </span>
            ),
            content: <ConnectorLabelPanel connectors={connectors.filter((x) => x.label && x.label.trim())} />,
          }}
        </CPop>
      )}
      <span className="od-divider-v" />
    </>
  );
}

function RoutingIcon({ kind }: { kind: ConnectorElement['routingType'] }) {
  const d = kind === 'straight' ? 'M3 15 L19 5' : kind === 'orthogonal' ? 'M3 15 H11 V5 H19' : 'M3 13 C 8 1, 14 19, 19 7';
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowList({ value, flip, onPick }: { value: ArrowHead; flip?: boolean; onPick: (a: ArrowHead) => void }) {
  const t = useT();
  return (
    <div className="flex w-[92px] flex-col items-stretch p-1.5">
      {ARROWS.map((a) => (
        <Tooltip key={a.id} label={a.label} side="right">
          <button type="button" className="od-tool h-9 w-full" data-active={value === a.id} onClick={() => onPick(a.id)} aria-label={a.label}>
            {a.id === 'none' ? <span className="text-[12px] font-medium">{t('common.none')}</span> : <ArrowPreview type={a.id} flip={flip} active={value === a.id} />}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function Mini({ kind }: { kind: ShapeKind }) {
  return (
    <svg width="20" height="20" viewBox="-2 -2 24 24" aria-hidden="true">
      <path d={getShapePath(kind, 20, 20)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function InsertPicker({ onPick, disabled }: { onPick: (t: InsertTarget) => void; disabled: boolean }) {
  const t = useT();
  const items: { label: string; node: ReactNode; target: InsertTarget }[] = [
    { label: t('common.text'), node: <span className="text-[15px] font-bold">T</span>, target: { type: 'text' } },
    {
      label: t('common.stickyNote'),
      node: (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 3h14v10l-4 4H3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      ),
      target: { type: 'sticky' },
    },
    { label: t('common.rectangle'), node: <Mini kind="rectangle" />, target: { type: 'shape', kind: 'rectangle' } },
    { label: t('board.connectorControls.rounded'), node: <Mini kind="rounded_rectangle" />, target: { type: 'shape', kind: 'rounded_rectangle' } },
    { label: t('common.oval'), node: <Mini kind="circle" />, target: { type: 'shape', kind: 'circle' } },
    { label: t('common.triangle'), node: <Mini kind="triangle" />, target: { type: 'shape', kind: 'triangle' } },
    { label: t('common.diamond'), node: <Mini kind="diamond" />, target: { type: 'shape', kind: 'diamond' } },
    { label: t('board.connectorControls.speechBubble'), node: <Mini kind="speech_bubble" />, target: { type: 'shape', kind: 'speech_bubble' } },
    { label: t('board.connectorControls.parallelogram'), node: <Mini kind="parallelogram" />, target: { type: 'shape', kind: 'parallelogram' } },
    { label: t('board.connectorControls.star'), node: <Mini kind="star" />, target: { type: 'shape', kind: 'star' } },
    { label: t('board.connectorControls.hexagon'), node: <Mini kind="hexagon" />, target: { type: 'shape', kind: 'hexagon' } },
    { label: t('board.connectorControls.cylinder'), node: <Mini kind="cylinder" />, target: { type: 'shape', kind: 'cylinder' } },
  ];
  return (
    <div className="w-[160px] p-2">
      {disabled && <div className="px-1 pb-2 text-xs text-ink-subtle">{t('board.connectorControls.selectOnlyOneLine2')}</div>}
      <div className="grid grid-cols-3 gap-1">
        {items.map((it) => (
          <Tooltip key={it.label} label={it.label} side="top">
            <button type="button" disabled={disabled} className="od-tool h-10 w-full" onClick={() => onPick(it.target)} aria-label={it.label}>
              {it.node}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function CPop({
  id,
  open,
  onToggle,
  label,
  title,
  variant,
  name,
  children,
}: {
  id: string;
  open: string | null;
  onToggle: (id: string) => void;
  label: string;
  title?: string;
  variant?: 'tool' | 'chip';
  name?: string;
  children: { trigger: ReactNode; content: ReactNode };
}) {
  // Chat 08.2 · C-2: mesma gaveta da Cinta (cabeçalho · conteúdo; Esc devolve o foco ao botão)
  return (
    <StripPop id={id} open={open} onToggle={onToggle} label={label} title={title} variant={variant} name={name} trigger={children.trigger}>
      {children.content}
    </StripPop>
  );
}
