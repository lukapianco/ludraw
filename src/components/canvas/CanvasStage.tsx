import { memo, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';
import { ImageIcon } from '../icons/od';
import { applyCursor, cursorFor, resizeCursor, type CursorState } from '../../utils/cursors';
import type { AnchorSide, CameraState, CanvasElement, ConnectorElement, ConnectorEndpoint, ShapeKind } from '../../types/canvas';
import { isTextualElement } from '../../types/canvas';
import { buildPermissionContext, useBoardStore } from '../../store/useBoardStore';
import { can } from '../../utils/permissions';
import { useAppStore } from '../../store/useAppStore';
import {
  angleFromCenter,
  clampZoom,
  computeGroupResize,
  computeResize,
  computeSmartGuides,
  distance,
  distanceToPolyline,
  expandRect,
  getBoundsOfElements,
  getElementBounds,
  getElementCenter,
  getViewportWorldRect,
  HANDLE_VECTORS,
  type HandleId,
  lassoHitsElement,
  mapRectBetweenBoxes,
  marqueeHitsElement,
  normalizeAngle,
  type Point,
  type Rect,
  rectCenter,
  rectFromPoints,
  rectsIntersect,
  rotatePoint,
  screenToWorld,
  simplifyPoints,
  smoothPathFromPoints,
  snapAngle,
  snapToGrid,
  worldToScreen,
  zoomAtPoint,
} from '../../utils/math';
import { cancelCameraAnimation } from '../../utils/cameraAnimation';
import { createFreehand, createShape, resizePatch } from '../../utils/factory';
import { createShapeAt, createStickyAt, createTextAt, defaultWorldSize, extensionShapeFields, quickCreateConnected } from '../../utils/boardActions';
import { importFiles } from '../../utils/importActions';
import { cleanWaypoints, computeRoute, createConnector, getAnchorPoint, isConnectable, labelPositionFromPoint, moveOrthogonalSegment, nearestAnchor, prepareOrthogonalSegmentDrag } from '../../utils/connectors';
import { ConnectionHandles } from './ConnectionHandles';
import { ElementRenderer } from './ElementRenderer';
import { InfiniteGrid } from './InfiniteGrid';
import { MarqueeOverlay, SelectionBox } from './SelectionBox';
import { SmartGuidesOverlay } from './SmartGuidesOverlay';
import { BoardDimensionsOverlay, EmptyBoardHint, Scrollbars } from './ViewOverlays';
import { startEditNode } from '../../utils/mindmapActions';
import { childrenOutside, constrainToRatio, frameChildren, frameRatioInfo, isFrame, isHiddenByFrame, type FrameRatio } from '../../utils/frames';
import { createFrameAt } from '../../utils/boardActions';
import { startCommentDraft } from '../../utils/comments';
import { isVotableElement } from '../../utils/voting';
import { pickIntoPollField } from '../facilitation/PollPanels';
import { startKanbanEdit } from '../../utils/kanbanActions';
import { activeRange, setActiveCell, startEditCell, useTableUi } from '../../utils/tableActions';
import { useT } from '../../i18n/useT';

/* -------------------------------------------------------------------------- */
/*  Estado efêmero de rascunho (traço em andamento, forma sendo desenhada)     */
/* -------------------------------------------------------------------------- */

interface DraftState {
  path: Point[] | null;
  pathColor: string;
  pathWidth: number;
  highlighter: boolean;
  rect: Rect | null;
  rectKind: ShapeKind;
  eraser: Point | null;
  link: { from: Point; to: Point; targetId: string | null; targetAnchor: AnchorSide | null } | null;
  /** Polígono do laço em andamento (mundo) — Chat 02 */
  lasso: Point[] | null;
}

const useDraft = create<DraftState>()(() => ({
  path: null,
  pathColor: '#194B32',
  pathWidth: 3,
  highlighter: false,
  rect: null,
  rectKind: 'rectangle',
  eraser: null,
  link: null,
  lasso: null,
}));

/* -------------------------------------------------------------------------- */
/*  Máquina de interação                                                       */
/* -------------------------------------------------------------------------- */

type Interaction =
  | { kind: 'pan'; start: Point; camStart: CameraState }
  | { kind: 'marquee'; startWorld: Point; additive: boolean; base: string[]; frameworkId?: string; startScreen?: Point }
  | { kind: 'lasso'; points: Point[]; lastScreen: Point; additive: boolean; base: string[] }
  | { kind: 'press'; startScreen: Point; startWorld: Point; hitId: string; wasSelected: boolean; shift: boolean; alt: boolean }
  | {
      kind: 'drag';
      startWorld: Point;
      ids: string[];
      originals: Map<string, Point>;
      connectorEnds: Map<string, { start: ConnectorEndpoint; end: ConnectorEndpoint; waypoints?: Point[] }>;
      startBounds: Rect;
      targets: Rect[];
    }
  | {
      kind: 'resize';
      handle: HandleId;
      originals: Map<string, CanvasElement>;
      startBounds: Rect;
      single: CanvasElement | null;
      widths: number[];
      heights: number[];
    }
  | { kind: 'rotate'; center: Point; startAngle: number; originals: Map<string, CanvasElement>; single: boolean }
  | { kind: 'draw'; points: Point[] }
  | { kind: 'erase'; historyPushed: boolean }
  | { kind: 'create-shape'; startWorld: Point; startScreen: Point; shapeKind: ShapeKind; shapeId?: string }
  | { kind: 'create-frame'; startWorld: Point; startScreen: Point; ratio: FrameRatio }
  | { kind: 'connect'; source: ConnectorEndpoint; sourceId: string | null; startScreen: Point; fromAnchor: boolean; moved: boolean }
  | { kind: 'reconnect'; connectorId: string; which: 'start' | 'end'; historyPushed: boolean }
  | { kind: 'label'; connectorId: string; startScreen: Point; started: boolean }
  | {
      kind: 'path';
      connectorId: string;
      mode: 'ortho' | 'bend' | 'vertex';
      points: Point[];
      index: number;
      started: boolean;
      startScreen: Point;
    };

const DRAG_THRESHOLD = 3;
const board = () => useBoardStore.getState();
/** O perfil efetivo pode editar? (silencioso — o motivo é mostrado por `board().ensure`) */
const editable = () => !board().readOnly && can(buildPermissionContext(board()), 'board.edit');
const prefs = () => useAppStore.getState().preferences;

/** Detecção heurística mouse × trackpad para o modo "Detecção automática". */
let lastDevice: { kind: 'mouse' | 'trackpad'; at: number } = { kind: 'mouse', at: 0 };
function detectDevice(e: WheelEvent): 'mouse' | 'trackpad' {
  const pref = prefs().inputDevice;
  if (pref !== 'auto') return pref;
  const now = performance.now();
  let kind: 'mouse' | 'trackpad';
  if (e.deltaMode !== 0) kind = 'mouse';
  else if (e.deltaX !== 0) kind = 'trackpad';
  else if (Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY)) kind = 'mouse';
  else kind = 'trackpad';
  // Mantém a decisão estável durante um gesto contínuo
  if (now - lastDevice.at < 260 && lastDevice.kind === 'trackpad' && kind === 'mouse' && e.deltaMode === 0) kind = 'trackpad';
  lastDevice = { kind, at: now };
  return kind;
}

/** Objeto conectável sob o ponteiro (ignora `excludeId`) e a âncora mais próxima. */
function findConnectTarget(clientX: number, clientY: number, excludeId: string | null): { el: CanvasElement; anchor: AnchorSide } | null {
  const s = useBoardStore.getState();
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    const host = (node as HTMLElement).closest?.('[data-element-id]') as HTMLElement | null;
    const id = host?.dataset.elementId;
    if (!id || id === excludeId) continue;
    const el = s.elements[id];
    if (!isConnectable(el)) continue;
    const rect = (s.camera && containerRect()) || null;
    const world = rect ? { x: (clientX - rect.left - s.camera.x) / s.camera.zoom, y: (clientY - rect.top - s.camera.y) / s.camera.zoom } : { x: 0, y: 0 };
    return { el, anchor: nearestAnchor(el, world) };
  }
  return null;
}

function containerRect(): DOMRect | null {
  return document.querySelector('[data-canvas-stage]')?.getBoundingClientRect() ?? null;
}


/* -------------------------------------------------------------------------- */
/*  Componente                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Palco infinito: câmera (pan/zoom), seleção, marquee, arrasto com smart guides,
 * redimensionamento (8 alças), rotação, criação de objetos e desenho livre.
 * Não conhece tipos de elementos — a renderização é delegada ao ElementRenderer.
 */
export function CanvasStage() {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const smoothZoom = useRef<{ target: number; focus: Point; raf: number | null }>({ target: 1, focus: { x: 0, y: 0 }, raf: null });
  const lastMoveStamp = useRef(0);

  const activeTool = useBoardStore((s) => s.activeTool);
  const spaceHeld = useBoardStore((s) => s.spaceHeld);
  const interaction = useBoardStore((s) => s.interaction);
  const readOnly = useBoardStore((s) => s.readOnly);
  const showScrollbars = useAppStore((s) => s.preferences.showScrollbars);
  const [dropActive, setDropActive] = useState(false);
  // Chat 08.2 · C-2: cursor decidido por `cursorFor()` (utils/cursors.ts) e escrito no DOM só quando muda
  const cursorCtx = useRef<Pick<Extract<CursorState, { target: 'canvas' }>, 'hover' | 'blocked' | 'copy' | 'resize'>>({ hover: null, blocked: false, copy: false, resize: null });
  const updateCursor = () => {
    const s = board();
    applyCursor(containerRef.current, cursorFor({ target: 'canvas', interaction: s.interaction, tool: s.activeTool, spaceHeld: s.spaceHeld, readOnly: s.readOnly, ...cursorCtx.current }));
  };
  useEffect(updateCursor, [interaction, activeTool, spaceHeld, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragDepth = useRef(0);
  const showDimensions = useAppStore((s) => s.preferences.showBoardDimensions);
  const presenting = useBoardStore((s) => s.presenting);

  /* ---------- Viewport (ResizeObserver) ---------- */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const r = node.getBoundingClientRect();
      board().setViewport({ width: Math.round(r.width), height: Math.round(r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /* ---------- Zoom suave (mouse) ---------- */
  const stopSmoothZoom = () => {
    if (smoothZoom.current.raf) cancelAnimationFrame(smoothZoom.current.raf);
    smoothZoom.current.raf = null;
  };

  const smoothZoomTo = (targetZoom: number, focus: Point) => {
    const s = smoothZoom.current;
    s.target = clampZoom(targetZoom);
    s.focus = focus;
    if (!board().motionEnabled) {
      board().setCamera(zoomAtPoint(board().camera, s.target, focus));
      return;
    }
    if (s.raf) return;
    const step = () => {
      const cam = board().camera;
      const logCur = Math.log(cam.zoom);
      const logTarget = Math.log(s.target);
      const diff = logTarget - logCur;
      if (Math.abs(diff) < 0.0015) {
        board().setCamera(zoomAtPoint(cam, s.target, s.focus));
        s.raf = null;
        return;
      }
      board().setCamera(zoomAtPoint(cam, Math.exp(logCur + diff * 0.32), s.focus));
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  };

  /* ---------- Roda do mouse / trackpad ---------- */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-editing="true"]') && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      cancelCameraAnimation();
      const rect = node.getBoundingClientRect();
      const focus = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const cam = board().camera;
      const device = detectDevice(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;

      if (e.ctrlKey || e.metaKey) {
        // Pinça do trackpad chega como ctrl+wheel com deltas pequenos
        if (device === 'trackpad' || Math.abs(dy) < 40) {
          stopSmoothZoom();
          board().setCamera(zoomAtPoint(cam, cam.zoom * Math.exp(-dy * 0.01), focus));
        } else {
          const base = smoothZoom.current.raf ? smoothZoom.current.target : cam.zoom;
          smoothZoomTo(base * Math.pow(1.0018, -dy), focus);
        }
        return;
      }
      if (device === 'mouse') {
        if (e.shiftKey) {
          stopSmoothZoom();
          board().setCamera({ x: cam.x - dy });
          return;
        }
        const base = smoothZoom.current.raf ? smoothZoom.current.target : cam.zoom;
        smoothZoomTo(base * Math.pow(1.0018, -dy), focus);
      } else {
        stopSmoothZoom();
        board().setCamera({ x: cam.x - dx, y: cam.y - dy });
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => stopSmoothZoom(), []);

  /* ---------- Helpers ---------- */
  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const visibleOtherRects = (exclude: Set<string>): Rect[] => {
    const s = board();
    const view = expandRect(getViewportWorldRect(s.camera, s.viewport), 200 / s.camera.zoom);
    const out: Rect[] = [];
    for (const id of s.elementOrder) {
      if (exclude.has(id)) continue;
      const el = s.elements[id];
      if (!el || el.type === 'connector') continue;
      const b = getElementBounds(el);
      if (rectsIntersect(view, b)) out.push(b);
    }
    return out;
  };

  /** Captura o ponteiro (ponteiros já soltos ou sintéticos não derrubam a interação). */
  const capturePointer = (pointerId: number) => {
    try {
      containerRef.current?.setPointerCapture(pointerId);
    } catch {
      /* ponteiro inexistente: segue sem captura */
    }
  };

  const finishInteraction = (pointerId?: number) => {
    const s = board();
    interactionRef.current = null;
    cursorCtx.current = { ...cursorCtx.current, blocked: false, copy: false, resize: null };
    s.setInteraction('idle');
    s.setSmartGuides([]);
    s.setMarquee(null);
    s.setLiveLabel(null);
    useDraft.setState({ path: null, rect: null, link: null, lasso: null });
    if (pointerId !== undefined && containerRef.current?.hasPointerCapture(pointerId)) {
      containerRef.current.releasePointerCapture(pointerId);
    }
  };

  /* ---------- Pointer down ---------- */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = board();
    const target = e.target as HTMLElement;
    if (target.closest('[data-od-floating]')) return;
    if (target.closest('[data-editing="true"]')) return;

    if (s.contextMenu) s.setContextMenu(null);
    cancelCameraAnimation();
    stopSmoothZoom();
    // Impede que o "mousedown" padrão do navegador roube o foco (era o que fechava
    // o texto recém-criado). Campos de outras barras perdem o foco explicitamente.
    e.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    // Enquete em configuração: com um campo dela focado, clicar num texto do board copia o texto
    // para o campo (o preventDefault acima mantém o foco no campo)
    const pollField = active?.closest?.('[data-poll-field]') as HTMLElement | null;
    if (pollField && e.button === 0) {
      const pickId = (target.closest('[data-element-id]') as HTMLElement | null)?.dataset.elementId;
      const pickEl = pickId ? s.elements[pickId] : undefined;
      if (pickEl && pickIntoPollField(pollField.dataset.pollField ?? '', target, pickEl)) return;
    }
    if (active && active !== document.body && !active.closest('[data-editing="true"]')) active.blur();

    const sp = screenPoint(e);
    const wp = screenToWorld(sp, s.camera);
    s.setLastPointerWorld(wp);

    // Clique fora do elemento em edição finaliza a edição
    if (s.editingId) {
      const hitNode = target.closest('[data-element-id]') as HTMLElement | null;
      if (hitNode?.dataset.elementId !== s.editingId) s.setEditingId(null);
      else return;
    }

    const wantsPan = e.button === 1 || (e.button === 0 && (s.spaceHeld || s.activeTool === 'hand' || s.readOnly));
    if (wantsPan) {
      e.preventDefault();
      interactionRef.current = { kind: 'pan', start: sp, camStart: { ...s.camera } };
      s.setInteraction('panning');
      capturePointer(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    // Pontos de conexão (4 bolinhas ao redor do objeto)
    const anchorNode = target.closest('[data-anchor]') as HTMLElement | null;
    if (anchorNode && editable()) {
      const hostId = anchorNode.dataset.anchorHost ?? '';
      const anchor = anchorNode.dataset.anchor as AnchorSide;
      const host = s.elements[hostId];
      if (host) {
        const p = getAnchorPoint(host, anchor);
        interactionRef.current = {
          kind: 'connect',
          source: { elementId: hostId, anchor, x: p.x, y: p.y },
          sourceId: hostId,
          startScreen: sp,
          fromAnchor: true,
          moved: false,
        };
        s.setInteraction('creating');
        capturePointer(e.pointerId);
        return;
      }
    }

    // Rótulo de um conector selecionado: arrastar desliza o texto ao longo da linha
    const labelNode = target.closest('[data-connector-label]') as HTMLElement | null;
    if (labelNode && s.selectedIds.length === 1 && s.selectedIds[0] === labelNode.dataset.connectorLabel && s.editingId !== labelNode.dataset.connectorLabel && editable()) {
      const conn = s.elements[s.selectedIds[0]];
      if (conn?.type === 'connector' && !conn.locked) {
        interactionRef.current = { kind: 'label', connectorId: conn.id, startScreen: sp, started: false };
        s.setInteraction('resizing');
        capturePointer(e.pointerId);
        return;
      }
    }

    // Percurso de um conector selecionado (trechos e dobras)
    const segNode = target.closest('[data-segment-index], [data-vertex-index]') as HTMLElement | null;
    if (segNode && s.selectedIds.length === 1 && editable()) {
      const conn = s.elements[s.selectedIds[0]];
      if (conn?.type === 'connector' && !conn.locked) {
        const route = computeRoute(conn, (id) => s.elements[id]);
        const isVertex = segNode.dataset.vertexIndex !== undefined;
        const index = Number(isVertex ? segNode.dataset.vertexIndex : segNode.dataset.segmentIndex);
        interactionRef.current = {
          kind: 'path',
          connectorId: conn.id,
          mode: isVertex ? 'vertex' : conn.routingType === 'orthogonal' ? 'ortho' : 'bend',
          points: route.vertices.map((p) => ({ ...p })),
          index,
          started: false,
          startScreen: sp,
        };
        s.setInteraction('resizing');
        capturePointer(e.pointerId);
        return;
      }
    }

    // Extremidades de um conector selecionado (religar)
    const endNode = target.closest('[data-connector-end]') as HTMLElement | null;
    if (endNode && s.selectedIds.length === 1 && editable()) {
      const conn = s.elements[s.selectedIds[0]];
      if (conn?.type === 'connector' && !conn.locked) {
        interactionRef.current = { kind: 'reconnect', connectorId: conn.id, which: endNode.dataset.connectorEnd as 'start' | 'end', historyPushed: false };
        s.setInteraction('resizing');
        capturePointer(e.pointerId);
        return;
      }
    }

    // Alças de redimensionamento / rotação
    const handleAttr = (target.closest('[data-handle]') as HTMLElement | null)?.dataset.handle;
    if (handleAttr && s.selectedIds.length > 0) {
      if (!s.ensure('board.edit')) return;
      // conectores seguem os objetos; mapas mentais têm tamanho do auto-layout (não redimensionam)
      const sel = s.selectedIds.map((id) => s.elements[id]).filter((el): el is CanvasElement => !!el && !el.locked && el.type !== 'connector' && el.type !== 'mindmap');
      if (sel.length === 0) return;
      s.pushHistory();
      const originals = new Map(sel.map((el) => [el.id, el]));
      const single = sel.length === 1 ? sel[0] : null;
      const startBounds = single ? { x: single.x, y: single.y, width: single.width, height: single.height } : getBoundsOfElements(sel)!;
      if (handleAttr === 'rotate') {
        const center = single ? getElementCenter(single) : rectCenter(startBounds);
        interactionRef.current = { kind: 'rotate', center, startAngle: angleFromCenter(center, wp), originals, single: !!single };
        s.setInteraction('rotating');
      } else {
        const exclude = new Set(sel.map((el) => el.id));
        const others = visibleOtherRects(exclude);
        cursorCtx.current.resize = resizeCursor(handleAttr as HandleId, single?.rotation ?? 0);
        interactionRef.current = {
          kind: 'resize',
          handle: handleAttr as HandleId,
          originals,
          startBounds,
          single,
          widths: others.map((r) => r.width),
          heights: others.map((r) => r.height),
        };
        s.setInteraction('resizing');
      }
      s.setHoveredId(null);
      capturePointer(e.pointerId);
      return;
    }

    switch (s.activeTool) {
      case 'select': {
        const hitNode = target.closest('[data-element-id]') as HTMLElement | null;
        const hitId = hitNode?.dataset.elementId;
        // Votação ativa (Chat 04): clicar num post-it/forma distribui um ponto; Shift + clique retira
        const vote = s.facilitation.voting;
        const hitEl = hitId ? s.elements[hitId] : undefined;
        if (vote?.active && !vote.revealed && vote.kind !== 'poll' && hitEl && isVotableElement(hitEl) && !hitEl.isBackgroundFramework) {
          if (e.shiftKey) s.retractVote(hitEl.id);
          else s.castVote(hitEl.id);
          return;
        }
        if (hitId && s.elements[hitId]?.isBackgroundFramework && !s.selectedIds.includes(hitId) && !e.shiftKey) {
          // Estrutura de fundo: arrastar sobre ela faz seleção por área (sem pegar a estrutura); clique simples a seleciona
          s.clearSelection();
          interactionRef.current = { kind: 'marquee', startWorld: wp, additive: false, base: [], frameworkId: hitId, startScreen: sp };
        } else if (hitId && s.elements[hitId]) {
          const groupIds = s.expandGroups([hitId]);
          const wasSelected = s.selectedIds.includes(hitId);
          if (e.shiftKey) {
            if (wasSelected) s.setSelectedIds(s.selectedIds.filter((id) => !groupIds.includes(id)));
            else s.setSelectedIds([...s.selectedIds, ...groupIds]);
          } else if (!wasSelected) {
            s.setSelectedIds(groupIds);
          }
          interactionRef.current = { kind: 'press', startScreen: sp, startWorld: wp, hitId, wasSelected, shift: e.shiftKey, alt: e.altKey };
        } else {
          if (!e.shiftKey) s.clearSelection();
          interactionRef.current = { kind: 'marquee', startWorld: wp, additive: e.shiftKey, base: e.shiftKey ? [...s.selectedIds] : [] };
        }
        capturePointer(e.pointerId);
        return;
      }
      case 'lasso': {
        if (!e.shiftKey) s.clearSelection();
        interactionRef.current = { kind: 'lasso', points: [wp], lastScreen: sp, additive: e.shiftKey, base: e.shiftKey ? [...s.selectedIds] : [] };
        useDraft.setState({ lasso: [wp] });
        s.setInteraction('marquee');
        capturePointer(e.pointerId);
        return;
      }
      case 'sticky': {
        s.setActiveTool('select');
        createStickyAt(wp, { color: s.toolOptions.stickyColor });
        return;
      }
      case 'text': {
        s.setActiveTool('select');
        createTextAt(wp);
        return;
      }
      case 'shape': {
        interactionRef.current = { kind: 'create-shape', startWorld: wp, startScreen: sp, shapeKind: s.toolOptions.shapeKind, shapeId: s.toolOptions.shapeId };
        useDraft.setState({ rect: null, rectKind: s.toolOptions.shapeKind });
        s.setInteraction('creating');
        capturePointer(e.pointerId);
        return;
      }
      case 'pen':
      case 'highlighter': {
        const highlighter = s.activeTool === 'highlighter';
        interactionRef.current = { kind: 'draw', points: [wp] };
        useDraft.setState({
          path: [wp],
          pathColor: highlighter ? s.toolOptions.highlighterColor : s.toolOptions.penColor,
          pathWidth: (highlighter ? s.toolOptions.highlighterWidth : s.toolOptions.penWidth) / Math.max(s.camera.zoom, 0.05),
          highlighter,
        });
        s.setInteraction('drawing');
        capturePointer(e.pointerId);
        return;
      }
      case 'frame': {
        interactionRef.current = { kind: 'create-frame', startWorld: wp, startScreen: sp, ratio: s.toolOptions.frameRatio ?? 'free' };
        useDraft.setState({ rect: null, rectKind: 'rectangle' });
        s.setInteraction('creating');
        capturePointer(e.pointerId);
        return;
      }
      case 'connector': {
        const hitNode = target.closest('[data-element-id]') as HTMLElement | null;
        const hit = hitNode?.dataset.elementId ? s.elements[hitNode.dataset.elementId] : undefined;
        const source: ConnectorEndpoint = isConnectable(hit)
          ? (() => {
              const anchor = nearestAnchor(hit, wp);
              const p = getAnchorPoint(hit, anchor);
              return { elementId: hit.id, anchor, x: p.x, y: p.y };
            })()
          : { elementId: null, anchor: 'center', x: wp.x, y: wp.y };
        interactionRef.current = { kind: 'connect', source, sourceId: source.elementId, startScreen: sp, fromAnchor: false, moved: false };
        s.setInteraction('creating');
        capturePointer(e.pointerId);
        return;
      }
      case 'comment': {
        // Chat 04: clique abre o compositor de um comentário novo (o pin nasce ao enviar)
        const hitNode = target.closest('[data-element-id]') as HTMLElement | null;
        const hitId = hitNode?.dataset.elementId;
        const hit = hitId ? s.elements[hitId] : undefined;
        startCommentDraft(wp, hit && hit.type !== 'comment' ? hit.id : null);
        return;
      }
      case 'eraser': {
        interactionRef.current = { kind: 'erase', historyPushed: false };
        s.setInteraction('erasing');
        eraseAt(wp);
        capturePointer(e.pointerId);
        return;
      }
      default:
        s.setActiveTool('select');
    }
  };

  /* ---------- Borracha ---------- */
  const eraseAt = (wp: Point) => {
    const it = interactionRef.current;
    if (!it || it.kind !== 'erase') return;
    const s = board();
    const tolerance = 8 / s.camera.zoom;
    const hits: string[] = [];
    for (const id of s.elementOrder) {
      const el = s.elements[id];
      if (!el || el.type !== 'freehand' || el.locked) continue;
      if (!rectsIntersect(expandRect(getElementBounds(el), tolerance + el.strokeWidth), { x: wp.x, y: wp.y, width: 0, height: 0 })) continue;
      const local = rotatePoint(wp, getElementCenter(el), -(el.rotation || 0));
      const rel = { x: local.x - el.x, y: local.y - el.y };
      if (distanceToPolyline(rel, el.points) <= el.strokeWidth / 2 + tolerance) hits.push(id);
    }
    useDraft.setState({ eraser: wp });
    if (hits.length === 0) return;
    if (!it.historyPushed) {
      s.pushHistory();
      it.historyPushed = true;
    }
    s.deleteElements(hits, { recordHistory: false });
  };

  /* ---------- Pointer move ---------- */
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = board();
    const it = interactionRef.current;
    const sp = screenPoint(e);
    const wp = screenToWorld(sp, s.camera);

    const now = performance.now();
    if (now - lastMoveStamp.current > 33) {
      lastMoveStamp.current = now;
      s.setLastPointerWorld(wp);
    }

    if (!it) {
      if (s.activeTool === 'select' && !s.spaceHeld) {
        const t = e.target as HTMLElement;
        const hitNode = t.closest('[data-element-id]') as HTMLElement | null;
        const anchorHost = (t.closest('[data-anchor-host]') as HTMLElement | null)?.dataset.anchorHost;
        s.setHoveredId(hitNode?.dataset.elementId ?? anchorHost ?? null);
        const hoverId = hitNode?.dataset.elementId;
        const hoverEl = hoverId ? s.elements[hoverId] : undefined;
        cursorCtx.current.hover = hoverEl ? { selected: s.selectedIds.includes(hoverEl.id), locked: !!hoverEl.locked } : null;
      } else {
        if (s.hoveredId) s.setHoveredId(null);
        cursorCtx.current.hover = null;
      }
      updateCursor();
      if (s.activeTool === 'eraser') useDraft.setState({ eraser: wp });
      return;
    }

    switch (it.kind) {
      case 'pan': {
        s.setCamera({ x: it.camStart.x + (sp.x - it.start.x), y: it.camStart.y + (sp.y - it.start.y) });
        return;
      }
      case 'press': {
        if (distance(sp, it.startScreen) < DRAG_THRESHOLD || s.readOnly) return;
        if (!editable()) {
          // Sem permissão de edição (ex.: visitante leitor): arrastar um objeto move a câmera
          interactionRef.current = { kind: 'pan', start: it.startScreen, camStart: { ...s.camera } };
          s.setInteraction('panning');
          return;
        }
        let ids = s.selectedIds.filter((id) => s.elements[id] && !s.elements[id].locked);
        if (ids.length === 0) {
          if (it.hitId && s.elements[it.hitId]?.locked && !cursorCtx.current.blocked) {
            cursorCtx.current.blocked = true;
            updateCursor();
          }
          return;
        }
        cursorCtx.current.copy = !!it.alt;
        // Mover um frame move os filhos junto (os travados ficam onde estão)
        const withChildren = new Set(ids);
        for (const id of ids) {
          if (!isFrame(s.elements[id])) continue;
          for (const child of frameChildren(s.elements, id)) if (!child.locked) withChildren.add(child.id);
        }
        ids = s.elementOrder.filter((id) => withChildren.has(id));
        s.pushHistory();
        if (it.alt) ids = s.cloneInPlace(ids);
        const st = board();
        const els = ids.map((id) => st.elements[id]);
        const originals = new Map(els.map((el) => [el.id, { x: el.x, y: el.y }]));
        const connectorEnds = new Map<string, { start: ConnectorEndpoint; end: ConnectorEndpoint; waypoints?: Point[] }>();
        els.forEach((el) => {
          if (el.type === 'connector') connectorEnds.set(el.id, { start: el.start, end: el.end, waypoints: el.waypoints });
        });
        interactionRef.current = {
          kind: 'drag',
          startWorld: it.startWorld,
          ids,
          originals,
          connectorEnds,
          startBounds: getBoundsOfElements(els)!,
          targets: visibleOtherRects(new Set(ids)),
        };
        s.setInteraction('dragging');
        s.setHoveredId(null);
        onPointerMove(e);
        return;
      }
      case 'drag': {
        let dx = wp.x - it.startWorld.x;
        let dy = wp.y - it.startWorld.y;
        const proposed = { ...it.startBounds, x: it.startBounds.x + dx, y: it.startBounds.y + dy };
        let guides: ReturnType<typeof computeSmartGuides>['guides'] = [];
        if (s.gridSettings.snapToGrid && !e.ctrlKey) {
          dx += snapToGrid(proposed.x, s.gridSettings.size) - proposed.x;
          dy += snapToGrid(proposed.y, s.gridSettings.size) - proposed.y;
        } else if (prefs().alignObjects && !e.ctrlKey && !e.metaKey) {
          const result = computeSmartGuides(proposed, it.targets, 6 / s.camera.zoom);
          dx += result.dx;
          dy += result.dy;
          guides = result.guides;
        }
        s.updateElements(
          it.ids.map((id) => {
            const ends = it.connectorEnds.get(id);
            if (ends) {
              // Conectores: só as pontas soltas acompanham; pontas ligadas seguem seus objetos
              const move = (ep: ConnectorEndpoint) => (ep.elementId ? ep : { ...ep, x: ep.x + dx, y: ep.y + dy });
              const waypoints = ends.waypoints?.map((p) => ({ x: p.x + dx, y: p.y + dy }));
              return { id, patch: { start: move(ends.start), end: move(ends.end), ...(waypoints ? { waypoints } : {}) } };
            }
            return { id, patch: { x: it.originals.get(id)!.x + dx, y: it.originals.get(id)!.y + dy } };
          }),
        );
        s.setSmartGuides(guides);
        return;
      }
      case 'marquee': {
        const rect = rectFromPoints(it.startWorld, wp);
        s.setMarquee(rect);
        s.setInteraction('marquee');
        const precise = !prefs().selectOnTouch;
        const lookup = (x: string) => s.elements[x];
        const hits = s.elementOrder.filter((id) => {
          const el = s.elements[id];
          if (!el || el.isBackgroundFramework || el.type === 'comment' || isHiddenByFrame(el, lookup)) return false;
          // frame só entra se estiver inteiro dentro da área (arrastar dentro dele seleciona o conteúdo)
          return marqueeHitsElement(rect, el, precise || el.type === 'frame');
        });
        const expanded = s.expandGroups(hits);
        s.setSelectedIds(it.additive ? Array.from(new Set([...it.base, ...expanded])) : expanded);
        return;
      }
      case 'lasso': {
        // Amostra a cada ~4 px de tela para manter o polígono leve
        if (distance(sp, it.lastScreen) < 4) return;
        it.lastScreen = sp;
        it.points.push(wp);
        useDraft.setState({ lasso: [...it.points] });
        if (it.points.length < 3) return;
        const precise = !prefs().selectOnTouch;
        const lookup = (x: string) => s.elements[x];
        const hits = s.elementOrder.filter((id) => {
          const el = s.elements[id];
          if (!el || el.isBackgroundFramework || el.type === 'comment' || isHiddenByFrame(el, lookup)) return false;
          return lassoHitsElement(it.points, el, precise || el.type === 'frame');
        });
        const expanded = s.expandGroups(hits);
        s.setSelectedIds(it.additive ? Array.from(new Set([...it.base, ...expanded])) : expanded);
        return;
      }
      case 'resize': {
        const hv = HANDLE_VECTORS[it.handle];
        const corner = hv.x !== 0 && hv.y !== 0;
        const minSize = Math.max(4, 8 / s.camera.zoom);
        if (it.single) {
          const el = it.single;
          const aspectType = el.type === 'sticky' || el.type === 'image' || el.type === 'text' || (el.type === 'frame' && el.ratioPreset !== 'free');
          const keepAspect = corner ? aspectType !== e.shiftKey : e.shiftKey;
          const rect = computeResize({ original: el, handle: it.handle, pointer: wp, keepAspect, fromCenter: e.altKey, minSize });
          if (prefs().suggestObjectSize && !keepAspect && !el.rotation) {
            const tol = 5 / s.camera.zoom;
            if (hv.x !== 0) {
              const w = it.widths.find((v) => Math.abs(v - rect.width) < tol);
              if (w) {
                if (hv.x < 0) rect.x += rect.width - w;
                rect.width = w;
              }
            }
            if (hv.y !== 0) {
              const h = it.heights.find((v) => Math.abs(v - rect.height) < tol);
              if (h) {
                if (hv.y < 0) rect.y += rect.height - h;
                rect.height = h;
              }
            }
          }
          s.updateElement(el.id, resizePatch(el, rect, corner));
        } else {
          const box = computeGroupResize(it.startBounds, it.handle, wp, corner || e.shiftKey, e.altKey, minSize);
          s.updateElements(
            Array.from(it.originals.values()).map((orig) => {
              const mapped = mapRectBetweenBoxes({ x: orig.x, y: orig.y, width: orig.width, height: orig.height }, it.startBounds, box);
              return { id: orig.id, patch: resizePatch(orig, mapped, corner) };
            }),
          );
        }
        return;
      }
      case 'rotate': {
        const delta = angleFromCenter(it.center, wp) - it.startAngle;
        if (it.single) {
          const orig = Array.from(it.originals.values())[0];
          let rotation = normalizeAngle(orig.rotation + delta);
          if (e.shiftKey) rotation = snapAngle(rotation, 15);
          else {
            // Ímã suave nos ângulos retos
            const nearest = Math.round(rotation / 90) * 90;
            if (Math.abs(rotation - nearest) < 2) rotation = normalizeAngle(nearest);
          }
          s.updateElement(orig.id, { rotation });
          s.setLiveLabel({ text: `${Math.round(rotation) % 360}°`, x: sp.x, y: sp.y });
        } else {
          const d = e.shiftKey ? Math.round(delta / 15) * 15 : delta;
          s.updateElements(
            Array.from(it.originals.values()).map((orig) => {
              const c = rotatePoint(getElementCenter(orig), it.center, d);
              return { id: orig.id, patch: { x: c.x - orig.width / 2, y: c.y - orig.height / 2, rotation: normalizeAngle(orig.rotation + d) } };
            }),
          );
          s.setLiveLabel({ text: `${Math.round(normalizeAngle(d))}°`, x: sp.x, y: sp.y });
        }
        return;
      }
      case 'draw': {
        const last = it.points[it.points.length - 1];
        if (distance(last, wp) * s.camera.zoom < 1.5) return;
        it.points.push(wp);
        useDraft.setState({ path: [...it.points] });
        return;
      }
      case 'erase': {
        eraseAt(wp);
        return;
      }
      case 'connect': {
        if (!it.moved && distance(sp, it.startScreen) < 5) return;
        it.moved = true;
        const target = findConnectTarget(e.clientX, e.clientY, it.sourceId);
        const to = target ? getAnchorPoint(target.el, target.anchor) : wp;
        useDraft.setState({
          link: { from: { x: it.source.x, y: it.source.y }, to, targetId: target?.el.id ?? null, targetAnchor: target?.anchor ?? null },
        });
        return;
      }
      case 'reconnect': {
        const conn = s.elements[it.connectorId];
        if (!conn || conn.type !== 'connector') return;
        if (!it.historyPushed) {
          s.pushHistory();
          it.historyPushed = true;
        }
        const otherId = it.which === 'start' ? conn.end.elementId : conn.start.elementId;
        const target = findConnectTarget(e.clientX, e.clientY, otherId);
        const ep: ConnectorEndpoint = target
          ? { elementId: target.el.id, anchor: target.anchor, ...getAnchorPoint(target.el, target.anchor) }
          : { elementId: null, anchor: 'center', x: wp.x, y: wp.y };
        s.updateElement(conn.id, it.which === 'start' ? { start: ep, waypoints: undefined } : { end: ep, waypoints: undefined });
        useDraft.setState({ link: target ? { from: wp, to: getAnchorPoint(target.el, target.anchor), targetId: target.el.id, targetAnchor: target.anchor } : null });
        return;
      }
      case 'label': {
        const conn = s.elements[it.connectorId];
        if (!conn || conn.type !== 'connector') return;
        if (!it.started) {
          if (distance(sp, it.startScreen) < DRAG_THRESHOLD) return;
          s.pushHistory();
          it.started = true;
        }
        const route = computeRoute(conn, (id) => s.elements[id]);
        const pos = labelPositionFromPoint(conn, route, wp);
        if (pos !== conn.labelPosition) s.updateElement(conn.id, { labelPosition: pos });
        return;
      }
      case 'path': {
        if (!it.started) {
          if (distance(sp, it.startScreen) < 2) return;
          s.pushHistory();
          it.started = true;
          if (it.mode === 'ortho') {
            const prepared = prepareOrthogonalSegmentDrag(it.points, it.index);
            it.points = prepared.points;
            it.index = prepared.index;
          } else if (it.mode === 'bend') {
            it.points.splice(it.index + 1, 0, { ...wp });
            it.index += 1;
            it.mode = 'vertex';
          }
        }
        if (it.mode === 'ortho') {
          const moved = moveOrthogonalSegment(it.points, it.index, wp);
          s.updateElement(it.connectorId, { waypoints: moved.slice(1, -1) });
        } else {
          it.points[it.index] = { ...wp };
          s.updateElement(it.connectorId, { waypoints: it.points.slice(1, -1).map((p) => ({ ...p })) });
        }
        return;
      }
      case 'create-frame': {
        if (distance(sp, it.startScreen) < DRAG_THRESHOLD) return;
        const raw = rectFromPoints(it.startWorld, wp);
        const ratio = frameRatioInfo(it.ratio).ratio ?? (e.shiftKey ? 1 : null);
        useDraft.setState({ rect: constrainToRatio(raw, it.startWorld, ratio) });
        return;
      }
      case 'create-shape': {
        if (distance(sp, it.startScreen) < DRAG_THRESHOLD) return;
        let rect = rectFromPoints(it.startWorld, wp);
        if (e.shiftKey) {
          const size = Math.max(rect.width, rect.height);
          rect = {
            x: wp.x < it.startWorld.x ? it.startWorld.x - size : it.startWorld.x,
            y: wp.y < it.startWorld.y ? it.startWorld.y - size : it.startWorld.y,
            width: size,
            height: size,
          };
        }
        useDraft.setState({ rect });
        return;
      }
    }
  };

  /* ---------- Pointer up ---------- */
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = board();
    const it = interactionRef.current;
    if (!it) return;

    switch (it.kind) {
      case 'press': {
        const hit = s.elements[it.hitId];
        if (!it.shift && hit) {
          const groupIds = s.expandGroups([it.hitId]);
          const onlyThis = s.selectedIds.length === groupIds.length && groupIds.every((id) => s.selectedIds.includes(id));
          if (it.wasSelected && onlyThis && groupIds.length === 1 && isTextualElement(hit) && !hit.locked && !s.readOnly) {
            // Segundo clique em um objeto já selecionado entra em edição
            s.setEditingId(hit.id);
          } else if (it.wasSelected && !onlyThis) {
            s.setSelectedIds(groupIds);
          }
        }
        break;
      }
      case 'drag': {
        s.commitMove(it.ids);
        break;
      }
      case 'marquee': {
        // Clique simples (sem arrastar) numa estrutura de fundo a seleciona
        if (it.frameworkId && it.startScreen && distance(screenPoint(e), it.startScreen) < DRAG_THRESHOLD && s.elements[it.frameworkId]) {
          s.setSelectedIds(s.expandGroups([it.frameworkId]));
        }
        break;
      }
      case 'lasso': {
        // Com algo selecionado, volta para "Selecionar" para que a seleção possa ser movida
        if (it.points.length >= 3 && s.selectedIds.length > 0) s.setActiveTool('select');
        break;
      }
      case 'draw': {
        const zoom = s.camera.zoom;
        const points = simplifyPoints(it.points, 0.8 / zoom);
        const draft = useDraft.getState();
        if (points.length >= 1) {
          const single = points.length === 1 ? [points[0], { x: points[0].x + 0.1, y: points[0].y + 0.1 }] : points;
          const el = createFreehand(single, { strokeColor: draft.pathColor, strokeWidth: draft.pathWidth, isHighlighter: draft.highlighter });
          s.addElements([el]);
        }
        break;
      }
      case 'label':
        // clique simples na pílula: mantém a seleção; o duplo clique edita (onDoubleClick)
        break;
      case 'path': {
        const conn = s.elements[it.connectorId];
        if (it.started && conn?.type === 'connector') {
          const route = computeRoute(conn, (id) => s.elements[id]);
          const cleaned = cleanWaypoints(route.vertices, conn.routingType === 'orthogonal');
          s.updateElement(conn.id, { waypoints: cleaned.length ? cleaned : undefined });
        }
        break;
      }
      case 'connect': {
        if (!it.moved) {
          if (it.fromAnchor && it.sourceId) quickCreateConnected(it.sourceId, it.source.anchor);
          break;
        }
        const link = useDraft.getState().link;
        if (!link) break;
        const end: ConnectorEndpoint =
          link.targetId && link.targetAnchor
            ? { elementId: link.targetId, anchor: link.targetAnchor, x: link.to.x, y: link.to.y }
            : { elementId: null, anchor: 'center', x: link.to.x, y: link.to.y };
        const opts = s.toolOptions;
        const conn: ConnectorElement = createConnector(
          it.source,
          end,
          it.fromAnchor
            ? { routingType: 'orthogonal' }
            : { routingType: opts.connectorRouting, startArrow: opts.connectorStartArrow, endArrow: opts.connectorEndArrow },
          (id) => s.elements[id],
        );
        s.addElements([conn], { select: true });
        if (s.activeTool === 'connector') s.setActiveTool('select');
        break;
      }
      case 'create-frame': {
        const draft = useDraft.getState();
        const big = draft.rect && draft.rect.width * s.camera.zoom > 12 && draft.rect.height * s.camera.zoom > 12;
        createFrameAt(big ? draft.rect : null, it.startWorld, it.ratio);
        s.setActiveTool('select');
        break;
      }
      case 'resize': {
        // Frames redimensionados: adotam o que ficou dentro; filhos que ficaram de fora → perguntar
        const ids = Array.from(it.originals.keys());
        const frames = ids.filter((id) => isFrame(s.elements[id]));
        s.syncFrameMembership(
          ids.filter((id) => !isFrame(s.elements[id])),
          frames,
        );
        const outside = frames.flatMap((fid) => {
          const f = s.elements[fid];
          return isFrame(f) ? childrenOutside(board().elements, f).map((c) => c.id) : [];
        });
        if (outside.length) useAppStore.getState().openModal({ type: 'frame-children', mode: 'resize', frameIds: frames, childIds: outside });
        break;
      }
      case 'create-shape': {
        const draft = useDraft.getState();
        if (draft.rect && draft.rect.width > 2 && draft.rect.height > 2) {
          const zoom = s.camera.zoom;
          const el = createShape(it.shapeKind, {
            ...draft.rect,
            fontSize: Math.max(6, Math.round(16 / zoom)),
            strokeWidth: Math.max(1, 2 / zoom),
            ...(extensionShapeFields(it.shapeId) ?? {}),
          });
          s.addElements([el], { select: true });
        } else {
          const size = defaultWorldSize(180);
          createShapeAt(it.shapeKind, { x: it.startWorld.x + size / 2, y: it.startWorld.y + size / 2 }, it.shapeId);
        }
        s.setActiveTool('select');
        break;
      }
      default:
        break;
    }
    finishInteraction(e.pointerId);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => finishInteraction(e.pointerId);

  /* ---------- Duplo clique ---------- */
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const s = board();
    if (s.readOnly || s.activeTool !== 'select') return;
    // Com captura de ponteiro o alvo do dblclick vira o próprio palco: usa o que está sob o cursor
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) ?? (e.target as HTMLElement);
    const vertexNode = target.closest('[data-vertex-index]') as HTMLElement | null;
    if (vertexNode && s.selectedIds.length === 1) {
      const conn = s.elements[s.selectedIds[0]];
      if (conn?.type === 'connector' && conn.waypoints) {
        const k = Number(vertexNode.dataset.vertexIndex) - 1;
        const next = conn.waypoints.filter((_, i) => i !== k);
        s.pushHistory();
        s.updateElement(conn.id, { waypoints: next.length ? next : undefined });
      }
      return;
    }
    const worldAt = screenToWorld(screenPoint(e), s.camera);
    // Duplo clique numa alça de trecho de uma linha selecionada edita o rótulo naquele ponto
    if (target.closest('[data-segment-index]') && s.selectedIds.length === 1) {
      const conn = s.elements[s.selectedIds[0]];
      if (conn?.type === 'connector' && !conn.locked) editConnectorLabelAt(conn, worldAt);
      return;
    }
    if (target.closest('[data-handle]') || target.closest('[data-editing="true"]') || target.closest('[data-od-floating]')) return;
    const hitNode = target.closest('[data-element-id]') as HTMLElement | null;
    const id = hitNode?.dataset.elementId;
    if (id) {
      const el = s.elements[id];
      const mmNode = (target.closest('[data-mm-node]') as HTMLElement | null)?.dataset.mmNode;
      if (el?.type === 'kanban') {
        // Chat 04: título do quadro ou da coluna; os cards abrem o editor no clique
        const colId = (target.closest('[data-kanban-col-title]') as HTMLElement | null)?.dataset.kanbanColTitle;
        if (colId) startKanbanEdit(id, { kind: 'column', columnId: colId });
        else if (target.closest('[data-kanban-title]')) startKanbanEdit(id, { kind: 'title' });
        return;
      }
      if (el?.type === 'table') {
        const cellAttr = (target.closest('[data-table-cell]') as HTMLElement | null)?.dataset.tableCell;
        if (cellAttr) {
          const [r, c] = cellAttr.split('-').map(Number);
          if (Number.isFinite(r) && Number.isFinite(c)) startEditCell(id, { r, c });
        }
        return;
      }
      if (el?.type === 'comment') return;
      if (el?.type === 'mindmap' && mmNode) startEditNode(id, mmNode);
      else if (el?.type === 'connector' && !el.locked) editConnectorLabelAt(el, target.closest('[data-connector-label]') ? null : worldAt);
      else if ((isTextualElement(el) || el?.type === 'connector' || el?.type === 'frame' || el?.type === 'composite') && !el.locked) s.setEditingId(id);
      return;
    }
    createStickyAt(worldAt);
  };

  /**
   * Edita o rótulo de uma linha. Com `at`, o rótulo vai para o ponto da rota mais próximo do
   * clique (perto do meio fica centralizado); `null` (duplo clique na própria pílula) não move.
   * `setEditingId` grava o passo de desfazer antes da mudança de posição.
   */
  const editConnectorLabelAt = (conn: ConnectorElement, at: Point | null) => {
    const s = board();
    s.setEditingId(conn.id);
    if (!at || board().editingId !== conn.id) return;
    const pos = labelPositionFromPoint(conn, computeRoute(conn, (id) => s.elements[id]), at);
    if (pos !== conn.labelPosition) s.updateElement(conn.id, { labelPosition: pos });
  };

  /* ---------- Menu de contexto ---------- */
  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = board();
    if (s.readOnly) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-editing="true"]')) return;
    const world = screenToWorld(screenPoint(e), s.camera);
    s.setLastPointerWorld(world);
    const hitNode = target.closest('[data-element-id]') as HTMLElement | null;
    const id = hitNode?.dataset.elementId;
    if (id && s.elements[id]) {
      if (!s.selectedIds.includes(id)) s.setSelectedIds(s.expandGroups([id]));
      // Tabela: o botão direito marca a célula clicada (mantém o intervalo se o clique cair dentro dele)
      const tableEl = s.elements[id];
      const cellAttr = (target.closest('[data-table-cell]') as HTMLElement | null)?.dataset.tableCell;
      if (tableEl.type === 'table' && cellAttr) {
        const [r, c] = cellAttr.split('-').map(Number);
        if (board().selectedIds.length !== 1) s.setSelectedIds([id]);
        const range = useTableUi.getState().elementId === id && useTableUi.getState().focus ? activeRange(tableEl) : null;
        if (!range || r < range.r0 || r > range.r1 || c < range.c0 || c > range.c1) setActiveCell(id, { r, c });
      }
      s.setContextMenu({ x: e.clientX, y: e.clientY, world, target: 'element' });
    } else {
      s.setContextMenu({ x: e.clientX, y: e.clientY, world, target: 'canvas' });
    }
  };

  /* ---------- Arrastar e soltar imagens (Chat 02) e arquivos (Chat 05: planilhas, SVG, .excalidraw…) ---------- */
  const hasFiles = (e: ReactDragEvent<HTMLDivElement>) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e) || board().readOnly) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDropActive(true);
  };
  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e) || board().readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropActive(false);
  };
  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const s = board();
    if (s.readOnly) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    // Chat 05: cada arquivo vai para o importador do seu formato (imagens continuam pelo caminho do Chat 02)
    void importFiles(files, screenToWorld(screenPoint(e), s.camera));
  };



  return (
    <div
      ref={containerRef}
      className="absolute inset-0 select-none overflow-hidden"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => {
        if (!interactionRef.current) board().setHoveredId(null);
        useDraft.setState({ eraser: null });
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onScroll={(e) => {
        // Focar um <textarea> pode rolar um contêiner overflow:hidden — a câmera é a única fonte de deslocamento.
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
      data-canvas-stage
    >
      {!presenting && <InfiniteGrid />}
      <WorldLayer />
      <DraftLayer />
      {!presenting && <EmptyBoardHint />}
      {showDimensions && !presenting && <BoardDimensionsOverlay />}
      <SmartGuidesOverlay />
      <SelectionBox />
      <ConnectionHandles />
      <MarqueeOverlay />
      {showScrollbars && !presenting && <Scrollbars />}
      {dropActive && (
        <div className="pointer-events-none absolute inset-3 z-[5] flex animate-fade-in items-center justify-center rounded-2xl border-2 border-dashed border-selection bg-[var(--od-selection-fill)]">
          <span className="od-panel flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink">
            <ImageIcon size={18} className="text-brand-700 dark:text-brand-300" />{' '}{t('board.canvasStage.dropInsertHereImagesSpreadsheets')}</span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Camada de mundo com culling de viewport                                   */
/* -------------------------------------------------------------------------- */

const WorldLayer = memo(function WorldLayer() {
  const camera = useBoardStore((s) => s.camera);
  const viewport = useBoardStore((s) => s.viewport);
  const elements = useBoardStore((s) => s.elements);
  const elementOrder = useBoardStore((s) => s.elementOrder);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const editingId = useBoardStore((s) => s.editingId);
  const showConnectors = useAppStore((s) => s.preferences.showConnectors);
  const showComments = useAppStore((s) => s.preferences.showComments);
  const presenting = useBoardStore((s) => s.presenting);

  const visibleIds = useMemo(() => {
    const view = expandRect(getViewportWorldRect(camera, viewport), 240 / camera.zoom);
    const pinned = new Set(selectedIds);
    if (editingId) pinned.add(editingId);
    const lookup = (x: string) => elements[x];
    return elementOrder.filter((id) => {
      const el = elements[id];
      if (!el) return false;
      if (!showConnectors && el.type === 'connector') return false;
      // Chat 04: pins de comentário somem com "Mostrar comentários" desligado (Shift + C) e na apresentação
      if (el.type === 'comment' && (!showComments || presenting)) return false;
      // conteúdo de frames com "ocultar conteúdo" ligado não é desenhado (nem clicável)
      if (isHiddenByFrame(el, lookup)) return false;
      if (pinned.has(id)) return true;
      return rectsIntersect(view, getElementBounds(el));
    });
  }, [camera, viewport, elements, elementOrder, selectedIds, editingId, showConnectors, showComments, presenting]);

  return (
    <div
      className="absolute left-0 top-0"
      style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, transformOrigin: '0 0' }}
    >
      {visibleIds.map((id) => (
        <ElementRenderer key={id} id={id} />
      ))}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  Rascunhos (traço em andamento / forma sendo desenhada / borracha)          */
/* -------------------------------------------------------------------------- */

function DraftLayer() {
  const draft = useDraft();
  const camera = useBoardStore((s) => s.camera);
  const theme = useAppStore((s) => s.theme);
  const tool = useBoardStore((s) => s.activeTool);
  if (!draft.path && !draft.rect && !draft.link && !draft.lasso && !(draft.eraser && tool === 'eraser')) return null;
  const link = draft.link ? { from: worldToScreen(draft.link.from, camera), to: worldToScreen(draft.link.to, camera) } : null;

  const pathScreen = draft.path ? draft.path.map((p) => worldToScreen(p, camera)) : null;
  const rectScreen = draft.rect
    ? { ...worldToScreen(draft.rect, camera), width: draft.rect.width * camera.zoom, height: draft.rect.height * camera.zoom }
    : null;
  const stroke = draft.highlighter ? draft.pathColor : theme === 'dark' && draft.pathColor.toLowerCase() === '#1c1c1e' ? '#eceee9' : draft.pathColor;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      {pathScreen && (
        <path
          d={smoothPathFromPoints(pathScreen)}
          fill="none"
          stroke={stroke}
          strokeWidth={draft.pathWidth * camera.zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={draft.highlighter ? 0.45 : 1}
        />
      )}
      {draft.lasso && draft.lasso.length > 1 && (
        <path
          d={`M ${draft.lasso.map((p) => { const q = worldToScreen(p, camera); return `${q.x} ${q.y}`; }).join(' L ')} Z`}
          fill="var(--od-selection-fill)"
          stroke="var(--od-selection)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          strokeLinejoin="round"
        />
      )}
      {rectScreen && (
        <rect
          x={rectScreen.x}
          y={rectScreen.y}
          width={rectScreen.width}
          height={rectScreen.height}
          rx={draft.rectKind === 'circle' ? Math.min(rectScreen.width, rectScreen.height) / 2 : 2}
          fill="var(--od-selection-fill)"
          stroke="var(--od-selection)"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      )}
      {link && (
        <g>
          <line x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y} stroke="var(--od-selection)" strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />
          <circle cx={link.from.x} cy={link.from.y} r={5} fill="var(--od-selection)" stroke="#fff" strokeWidth={2} />
          <circle cx={link.to.x} cy={link.to.y} r={draft.link?.targetId ? 7 : 4} fill={draft.link?.targetId ? 'var(--od-selection)' : '#fff'} stroke={draft.link?.targetId ? '#fff' : 'var(--od-selection)'} strokeWidth={2} />
        </g>
      )}
      {draft.eraser && tool === 'eraser' && (
        <circle
          cx={worldToScreen(draft.eraser, camera).x}
          cy={worldToScreen(draft.eraser, camera).y}
          r={8}
          fill="rgba(255,255,255,0.35)"
          stroke="var(--od-selection)"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}
