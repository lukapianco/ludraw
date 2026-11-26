import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AnchorSide, CanvasElement } from '../../types/canvas';
import { buildPermissionContext, useBoardStore } from '../../store/useBoardStore';
import { can } from '../../utils/permissions';
import { ANCHOR_SIDES, getAnchorDirection, getAnchorPoint, isConnectable } from '../../utils/connectors';
import { ghostRectFor } from '../../utils/boardActions';
import { worldRectToScreen, worldToScreen } from '../../utils/math';
import { isTransparent } from '../../utils/color';
import { useT } from '../../i18n/useT';
import { cursorFor } from '../../utils/cursors';

const OFFSET = 16;

function fillOf(el: CanvasElement): string {
  if (el.type === 'sticky') return el.color;
  if (el.type === 'shape') return isTransparent(el.fillColor) ? '#FFFFFF' : el.fillColor;
  return '#E4EED5';
}

/**
 * 4 pontos de conexão ao redor do objeto (selecionado ou sob o mouse).
 * Passar o mouse mostra a prévia (linha + caixa simulada à frente); clicar cria a caixa ligada;
 * arrastar puxa uma linha até outro objeto.
 */
export function ConnectionHandles() {
  const t = useT();
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const hoveredId = useBoardStore((s) => s.hoveredId);
  const elements = useBoardStore((s) => s.elements);
  const camera = useBoardStore((s) => s.camera);
  const interaction = useBoardStore((s) => s.interaction);
  const editingId = useBoardStore((s) => s.editingId);
  const activeTool = useBoardStore((s) => s.activeTool);
  const readOnly = useBoardStore((s) => s.readOnly || !can(buildPermissionContext(s), 'board.edit'));
  const [hoverAnchor, setHoverAnchor] = useState<{ id: string; anchor: AnchorSide } | null>(null);

  const single = selectedIds.length === 1 ? elements[selectedIds[0]] : undefined;
  const hovered = hoveredId ? elements[hoveredId] : undefined;
  const host = [hovered, single].find((el) => isConnectable(el) && !el.locked && el.type !== 'frame');
  const visible = !!host && !readOnly && activeTool === 'select' && !editingId && (interaction === 'idle' || interaction === 'creating');
  if (!visible || !host) return null;

  const screenSize = Math.min(host.width, host.height) * camera.zoom;
  if (screenSize < 24) return null;

  const ghost = hoverAnchor && hoverAnchor.id === host.id && interaction === 'idle' ? ghostRectFor(host, hoverAnchor.anchor) : null;
  const ghostScreen = ghost ? worldRectToScreen(ghost, camera) : null;
  const from = hoverAnchor && ghost ? worldToScreen(getAnchorPoint(host, hoverAnchor.anchor), camera) : null;
  const to = ghostScreen && hoverAnchor
    ? (() => {
        const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left', center: 'center' }[hoverAnchor.anchor] as AnchorSide;
        const temp = { ...host, ...ghost, rotation: 0 } as CanvasElement;
        return worldToScreen(getAnchorPoint(temp, opp), camera);
      })()
    : null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {ghostScreen && from && to && (
        <>
          <div
            className="absolute animate-fade-in"
            style={{
              left: ghostScreen.x,
              top: ghostScreen.y,
              width: ghostScreen.width,
              height: ghostScreen.height,
              background: fillOf(host),
              opacity: 0.5,
              borderRadius: host.type === 'shape' && host.shapeKind === 'circle' ? '50%' : Math.min(14, ghostScreen.height * 0.18),
            }}
          />
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--od-text-subtle)" strokeWidth={1.5} />
            <path
              d={(() => {
                const a = Math.atan2(to.y - from.y, to.x - from.x);
                const s = 8;
                const p1 = { x: to.x - s * Math.cos(a) + (s * 0.55) * Math.sin(a), y: to.y - s * Math.sin(a) - (s * 0.55) * Math.cos(a) };
                const p2 = { x: to.x - s * Math.cos(a) - (s * 0.55) * Math.sin(a), y: to.y - s * Math.sin(a) + (s * 0.55) * Math.cos(a) };
                return `M ${p1.x} ${p1.y} L ${to.x} ${to.y} L ${p2.x} ${p2.y}`;
              })()}
              fill="none"
              stroke="var(--od-text-subtle)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </svg>
        </>
      )}
      {ANCHOR_SIDES.map((side) => {
        const p = worldToScreen(getAnchorPoint(host, side), camera);
        const d = getAnchorDirection(host, side);
        const x = p.x + d.x * OFFSET;
        const y = p.y + d.y * OFFSET;
        const active = hoverAnchor?.id === host.id && hoverAnchor.anchor === side;
        const angle = (Math.atan2(d.y, d.x) * 180) / Math.PI;
        return (
          <div
            key={side}
            data-anchor={side}
            data-anchor-host={host.id}
            className="pointer-events-auto absolute flex items-center justify-center"
            style={{ left: x, top: y, width: 34, height: 34, transform: 'translate(-50%, -50%)', cursor: cursorFor({ target: 'connection-point' }), touchAction: 'none' }}
            onPointerEnter={() => setHoverAnchor({ id: host.id, anchor: side })}
            onPointerLeave={() => setHoverAnchor(null)}
            title={t('board.connectionHandles.clickCreateLinkedObjectDrag')}
          >
            <span
              className="flex items-center justify-center rounded-full bg-selection text-on-selection shadow-[0_1px_4px_rgba(0,0,0,0.25)] ring-2 ring-[var(--od-panel)] transition-all duration-base ease-spring"
              style={{ width: active ? 22 : 9, height: active ? 22 : 9 }}
            >
              {active && <ArrowRight size={13} strokeWidth={2.6} style={{ transform: `rotate(${angle}deg)` }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
