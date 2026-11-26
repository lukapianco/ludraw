import { Layers, RotateCw } from 'lucide-react';
import { AdvancedLockIcon, LockIcon } from '../icons/od';
import { buildPermissionContext, useBoardStore } from '../../store/useBoardStore';
import { can, effectiveLockMode } from '../../utils/permissions';
import { useAppStore } from '../../store/useAppStore';
import { cursorFor } from '../../utils/cursors';
import {
  ALL_HANDLES,
  CORNER_HANDLES,
  getBoundsOfElements,
  getElementCorners,
  HANDLE_VECTORS,
  type HandleId,
  type Point,
  rotateVector,
  worldRectToScreen,
  worldToScreen,
} from '../../utils/math';
import type { CanvasElement, ConnectorElement } from '../../types/canvas';
import { computeRoute } from '../../utils/connectors';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';

/**
 * Caixa de seleção (overlay em coordenadas de TELA, para que alças tenham tamanho constante):
 *  - 1 elemento: caixa rotacionada + 8 alças + alça de rotação (Shift = 15°).
 *  - N elementos: caixa alinhada aos eixos envolvendo todos + contornos finos individuais.
 *  - Elemento bloqueado: contorno + selo de cadeado, sem alças.
 */
export function SelectionBox() {
  const t = useT();
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const elements = useBoardStore((s) => s.elements);
  const camera = useBoardStore((s) => s.camera);
  const interaction = useBoardStore((s) => s.interaction);
  const editingId = useBoardStore((s) => s.editingId);
  const hoveredId = useBoardStore((s) => s.hoveredId);
  const readOnly = useBoardStore((s) => s.readOnly || !can(buildPermissionContext(s), 'board.edit'));
  const liveLabel = useBoardStore((s) => s.liveLabel);
  const showObjectSize = useAppStore((s) => s.preferences.showObjectSize);

  // Pins de comentário (Chat 04) não têm caixa: a conversa aberta já indica a seleção
  const selected = selectedIds.map((id) => elements[id]).filter((e): e is CanvasElement => !!e && e.type !== 'comment');
  const hoveredEl = hoveredId && !selectedIds.includes(hoveredId) ? elements[hoveredId] : null;
  const hovered = hoveredEl && hoveredEl.type !== 'comment' ? hoveredEl : null;

  const toScreen = (pts: Point[]) => pts.map((p) => worldToScreen(p, camera));

  if (selected.length === 1 && selected[0].type === 'connector') {
    // Editando o rótulo: as alças do percurso sairiam por cima do campo de texto
    return <ConnectorSelection conn={selected[0]} elements={elements} camera={camera} readOnly={readOnly || editingId === selected[0].id} />;
  }

  const poly = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  let box: { corners: Point[]; rotation: number; width: number; height: number } | null = null;
  if (selected.length === 1) {
    const el = selected[0];
    box = { corners: toScreen(getElementCorners(el)), rotation: el.rotation || 0, width: el.width * camera.zoom, height: el.height * camera.zoom };
  } else if (selected.length > 1) {
    const b = getBoundsOfElements(selected);
    if (b) {
      const r = worldRectToScreen(b, camera);
      box = {
        corners: [
          { x: r.x, y: r.y },
          { x: r.x + r.width, y: r.y },
          { x: r.x + r.width, y: r.y + r.height },
          { x: r.x, y: r.y + r.height },
        ],
        rotation: 0,
        width: r.width,
        height: r.height,
      };
    }
  }

  const allLocked = selected.length > 0 && selected.every((e) => e.locked);
  // Mapa mental e Kanban: o tamanho vem do auto-layout (sem alças de redimensionar/girar) — Chat 04: + kanban
  const autoSized = selected.length === 1 && (selected[0].type === 'mindmap' || selected[0].type === 'kanban');
  const showHandles = !!box && !readOnly && !allLocked && !autoSized && !editingId && interaction !== 'dragging' && interaction !== 'marquee';
  const handles: HandleId[] = box && (box.width < 28 || box.height < 28) ? CORNER_HANDLES : ALL_HANDLES;

  // Ponto de cada alça em tela: centro + vetor local rotacionado
  const handlePos = (h: HandleId): Point => {
    if (!box) return { x: 0, y: 0 };
    const c = { x: (box.corners[0].x + box.corners[2].x) / 2, y: (box.corners[0].y + box.corners[2].y) / 2 };
    const v = HANDLE_VECTORS[h];
    const local = rotateVector({ x: (v.x * box.width) / 2, y: (v.y * box.height) / 2 }, box.rotation);
    return { x: c.x + local.x, y: c.y + local.y };
  };

  const rotatePos = (): Point => {
    if (!box) return { x: 0, y: 0 };
    const sw = handlePos('sw');
    const off = rotateVector({ x: -20, y: 20 }, box.rotation);
    return { x: sw.x + off.x, y: sw.y + off.y };
  };

  const bottomCenter = box ? handlePos('s') : null;
  const sizeLabel =
    selected.length > 0 && (showObjectSize || interaction === 'resizing')
      ? (() => {
          if (selected.length === 1) return `${Math.round(selected[0].width)} × ${Math.round(selected[0].height)}`;
          const b = getBoundsOfElements(selected);
          return b ? `${Math.round(b.width)} × ${Math.round(b.height)}` : '';
        })()
      : '';

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {hovered && hovered.type !== 'connector' && interaction === 'idle' && (
          <polygon points={poly(toScreen(getElementCorners(hovered)))} fill="none" stroke="var(--od-selection)" strokeWidth={1.5} opacity={0.75} />
        )}
        {selected.length > 1 &&
          selected.filter((el) => el.type !== 'connector').map((el) => (
            <polygon key={el.id} points={poly(toScreen(getElementCorners(el)))} fill="none" stroke="var(--od-selection)" strokeWidth={1} opacity={0.6} />
          ))}
        {box && (
          <polygon
            points={poly(box.corners)}
            fill="none"
            stroke="var(--od-selection)"
            strokeWidth={allLocked ? 1.25 : 1.5}
            strokeDasharray={allLocked ? '5 4' : undefined}
          />
        )}
      </svg>

      {box && showHandles &&
        handles.map((h) => {
          const p = handlePos(h);
          const isCorner = HANDLE_VECTORS[h].x !== 0 && HANDLE_VECTORS[h].y !== 0;
          const horizontal = HANDLE_VECTORS[h].y !== 0;
          return (
            <div
              key={h}
              data-handle={h}
              className="pointer-events-auto absolute"
              style={{
                left: p.x,
                top: p.y,
                width: isCorner ? 12 : horizontal ? 18 : 8,
                height: isCorner ? 12 : horizontal ? 8 : 18,
                transform: `translate(-50%, -50%) rotate(${isCorner ? 0 : box!.rotation}deg)`,
                borderRadius: 999,
                background: '#fff',
                border: '1.5px solid var(--od-selection)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                cursor: cursorFor({ target: 'resize-handle', handle: h, rotation: box!.rotation }),
                touchAction: 'none',
              }}
            />
          );
        })}

      {box && showHandles && (
        <div
          data-handle="rotate"
          title={t('board.selectionBox.rotateShift15Steps')}
          className="pointer-events-auto absolute flex h-[22px] w-[22px] items-center justify-center rounded-full bg-panel text-ink-muted shadow-panel transition-colors duration-base hover:text-selection"
          style={{ left: rotatePos().x, top: rotatePos().y, transform: 'translate(-50%, -50%)', cursor: cursorFor({ target: 'rotate-handle' }), touchAction: 'none' }}
        >
          <RotateCw size={13} strokeWidth={2.2} style={{ pointerEvents: 'none' }} />
        </div>
      )}

      {box && allLocked && (
        <div
          className={cn(
            'absolute flex h-6 items-center justify-center gap-1 rounded-full px-1.5 shadow-panel',
            selected.some((e) => effectiveLockMode(e) === 'protected') ? 'bg-brand-900 text-brand-200 dark:bg-brand-200 dark:text-brand-900' : 'bg-panel text-ink-muted',
          )}
          style={{ left: handlePos('ne').x + 4, top: handlePos('ne').y - 4, transform: 'translate(-50%, -50%)' }}
          title={
            selected.some((e) => effectiveLockMode(e) === 'protected')
              ? t('common.facilitatorProtectedLock')
              : selected.some((e) => e.isBackgroundFramework)
                ? t('board.selectionBox.backgroundStructure')
                : t('board.selectionBox.locked')
          }
        >
          {selected.some((e) => effectiveLockMode(e) === 'protected') ? <AdvancedLockIcon size={12} strokeWidth={2.4} /> : <LockIcon size={12} strokeWidth={2.4} />}
          {selected.some((e) => e.isBackgroundFramework) && <Layers size={12} strokeWidth={2.4} />}
        </div>
      )}

      {sizeLabel && bottomCenter && (
        <div
          className="absolute rounded-md bg-selection px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-on-selection"
          style={{ left: bottomCenter.x, top: bottomCenter.y + 14, transform: 'translateX(-50%)' }}
        >
          {sizeLabel}
        </div>
      )}

      {liveLabel && (
        <div
          className="absolute rounded-md bg-ink px-2 py-1 text-xs font-semibold tabular-nums text-ink-inverse shadow-pop"
          style={{ left: liveLabel.x + 14, top: liveLabel.y + 14 }}
        >
          {liveLabel.text}
        </div>
      )}
    </div>
  );
}

/** Caixa de seleção por arrasto (marquee). */
export function MarqueeOverlay() {
  const marquee = useBoardStore((s) => s.marquee);
  const camera = useBoardStore((s) => s.camera);
  if (!marquee) return null;
  const r = worldRectToScreen(marquee, camera);
  return (
    <div
      className="pointer-events-none absolute rounded-[2px]"
      style={{
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
        background: 'var(--od-selection-fill)',
        border: '1px solid var(--od-selection)',
      }}
    />
  );
}

/** Conector selecionado: rota destacada + extremidades arrastáveis (religar a outro objeto). */
function ConnectorSelection({
  conn,
  elements,
  camera,
  readOnly,
}: {
  conn: ConnectorElement;
  elements: Record<string, CanvasElement>;
  camera: { x: number; y: number; zoom: number };
  readOnly: boolean;
}) {
  const t = useT();
  const route = computeRoute(conn, (id) => elements[id]);
  const start = worldToScreen(route.start, camera);
  const end = worldToScreen(route.end, camera);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          <path d={route.d} fill="none" stroke="var(--od-selection)" strokeWidth={2 / camera.zoom} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        </g>
      </svg>
      {!readOnly && !conn.locked && (
        <>
          {route.vertices.slice(0, -1).map((a, i) => {
            const b = route.vertices[i + 1];
            const sa = worldToScreen(a, camera);
            const sb = worldToScreen(b, camera);
            if (Math.hypot(sb.x - sa.x, sb.y - sa.y) < 18) return null;
            const ortho = conn.routingType === 'orthogonal';
            const edge = i === 0 || i === route.vertices.length - 2;
            const hollow = ortho && !edge;
            const horizontal = Math.abs(sa.y - sb.y) <= Math.abs(sa.x - sb.x);
            return (
              <div
                key={`seg-${i}`}
                data-segment-index={i}
                className="pointer-events-auto absolute rounded-full"
                style={{
                  left: (sa.x + sb.x) / 2,
                  top: (sa.y + sb.y) / 2,
                  width: hollow ? 11 : 9,
                  height: hollow ? 11 : 9,
                  transform: 'translate(-50%, -50%)',
                  background: hollow ? '#fff' : 'var(--od-selection)',
                  border: hollow ? '2px solid var(--od-selection)' : '2px solid #fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  cursor: ortho ? (horizontal ? 'ns-resize' : 'ew-resize') : 'copy',
                  touchAction: 'none',
                }}
                title={ortho ? t('board.selectionBox.dragAdjustRoute') : t('board.selectionBox.dragCreateBend')}
              />
            );
          })}
          {conn.routingType !== 'orthogonal' &&
            route.vertices.slice(1, -1).map((v, k) => {
              const sv = worldToScreen(v, camera);
              return (
                <div
                  key={`v-${k}`}
                  data-vertex-index={k + 1}
                  className="pointer-events-auto absolute rounded-full bg-white"
                  style={{
                    left: sv.x,
                    top: sv.y,
                    width: 11,
                    height: 11,
                    transform: 'translate(-50%, -50%)',
                    border: '2px solid var(--od-selection)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    cursor: 'move',
                    touchAction: 'none',
                  }}
                  title={t('board.selectionBox.dragMoveDoubleClickRemoves')}
                />
              );
            })}
          {(
            [
              ['start', start],
              ['end', end],
            ] as const
          ).map(([which, p]) => (
            <div
              key={which}
              data-connector-end={which}
              className="pointer-events-auto absolute rounded-full bg-white"
              style={{
                left: p.x,
                top: p.y,
                width: 12,
                height: 12,
                transform: 'translate(-50%, -50%)',
                border: '2px solid var(--od-selection)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                cursor: 'move',
                touchAction: 'none',
              }}
              title={t('board.selectionBox.dragLinkAnotherObject')}
            />
          ))}
        </>
      )}
    </div>
  );
}
