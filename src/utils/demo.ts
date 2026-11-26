/**
 * LuDraw — Conteúdo de demonstração e presets de inserção rápida.
 * O board de demonstração permite testar imediatamente: seleção, marquee, rotação (Shift = 15°),
 * redimensionamento, smart guides, grupos, bloqueio, camadas, undo/redo e minimapa.
 */

import type { BoardData, CanvasElement, ShapeKind } from '../types/canvas';
import { DEFAULT_GRID } from '../store/useBoardStore';
import { createFreehand, createMindMap, createShape, createStickyNote, createText, STICKY_COLORS, stickyColor } from './factory';
import { createId } from './id';
import { createConnector, getAnchorPoint } from './connectors';
import type { AnchorSide } from '../types/canvas';
import type { Point } from './math';
import type { BoardTemplateId } from '../types/workspace';
import { galleryTemplateData, isGalleryTemplate } from './templates';
import { t } from '../i18n';

export function boardDataFromElements(elements: CanvasElement[]): BoardData {
  const record: Record<string, CanvasElement> = {};
  const order: string[] = [];
  elements.forEach((el, i) => {
    record[el.id] = { ...el, zIndex: i } as CanvasElement;
    order.push(el.id);
  });
  return { version: 1, elements: record, elementOrder: order, gridSettings: { ...DEFAULT_GRID }, backgroundColor: null, initialView: null };
}

export function createDemoElements(): CanvasElement[] {
  const els: CanvasElement[] = [];

  // Área de fundo (fica atrás de tudo — teste "Enviar para trás/Trazer para frente")
  els.push(
    createShape('rounded_rectangle', {
      x: -760,
      y: -300,
      width: 1520,
      height: 380,
      fillColor: '#EEF4E4',
      strokeColor: '#D0E4AE',
      strokeWidth: 2,
      text: '',
    }),
  );

  els.push(
    createText({
      x: -760,
      y: -470,
      width: 1100,
      text: t('templates.demo.welcomeLudraw'),
      fontSize: 56,
      fontName: 'Fraunces',
      fontWeight: 'bold',
      textColor: '#194B32',
    }),
    createText({
      x: -760,
      y: -385,
      width: 1200,
      text: t('templates.demo.anInfiniteBoardOpenYours'),
      fontSize: 22,
      textColor: '#4F5A53',
    }),
  );

  const tips = [
    t('templates.demo.doubleClickEditText'),
    t('templates.demo.shiftClickSelectSeveral'),
    t('templates.demo.holdSpaceDragMoveCamera'),
    t('templates.demo.ctrlMouseWheelZoomCursor'),
    t('templates.demo.altDragDuplicatesObject'),
    t('templates.demo.rightClickOpensContextMenu'),
  ];
  const tipColors = (['canario', 'lima', 'hortensia', 'algodao-doce', 'damasco', 'jade'] as const).map(stickyColor);
  tips.forEach((text, i) => {
    els.push(createStickyNote({ x: -700 + i * 240, y: -250, width: 200, height: 200, text, color: tipColors[i] }));
  });

  // Post-it girado (teste de rotação)
  els.push(createStickyNote({ x: -700, y: 160, width: 220, height: 220, text: t('templates.demo.imRotated6UseHandle'), color: stickyColor('damasco'), rotation: 354 }));

  // Grupo (Ctrl+G / Ctrl+Shift+G)
  const groupId = createId();
  els.push(
    createShape('rounded_rectangle', {
      x: -420,
      y: 160,
      width: 260,
      height: 120,
      fillColor: '#194B32',
      strokeColor: '#194B32',
      textColor: '#D0E4AE',
      fontSize: 20,
      fontWeight: 'bold',
      text: t('templates.demo.wereGroup'),
      groupId,
    }),
    createStickyNote({ x: -390, y: 300, width: 200, height: 120, text: t('templates.demo.ctrlShiftGUngroups'), color: stickyColor('lima'), groupId }),
  );

  // Galeria de formas
  const kinds: ShapeKind[] = ['rectangle', 'circle', 'diamond', 'triangle', 'hexagon', 'star', 'cloud', 'cylinder', 'parallelogram', 'speech_bubble'];
  const fills = ['#FFFFFF', '#BFD5FF', '#FFD0EC', '#FFF6A5', '#8FE3D3', '#FFE066', '#E7F1D6', '#D9EDA8', '#FFC58F', '#BBA9FF'];
  kinds.forEach((kind, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    els.push(
      createShape(kind, {
        x: -80 + col * 170,
        y: 150 + row * 170,
        width: 140,
        height: 130,
        fillColor: fills[i],
        strokeColor: '#194B32',
        strokeWidth: 2,
        fontSize: 15,
        text: [t('common.rectangle'), t('templates.demo.oval'), t('templates.demo.diamond'), t('templates.demo.triangle'), t('common.hexagon'), t('templates.demo.star'), t('templates.demo.cloud'), t('templates.demo.cylinder'), t('templates.demo.parallel'), t('templates.demo.bubble')][i],
      }),
    );
  });

  // Elemento bloqueado
  els.push(
    createShape('rectangle', {
      x: 800,
      y: -250,
      width: 300,
      height: 200,
      fillColor: '#F4F5F2',
      strokeColor: '#5B605C',
      strokeStyle: 'dashed',
      strokeWidth: 2,
      fontSize: 17,
      text: t('templates.demo.imLockedHoldPadlockBar'),
      locked: true,
    }),
  );

  // Texto estilizado (teste da barra contextual)
  els.push(
    createText({
      x: 800,
      y: 10,
      width: 320,
      text: t('templates.demo.clickMeSeeTextBar'),
      fontSize: 20,
      textColor: '#194B32',
      highlightColor: '#C8F0B4',
    }),
  );

  // Desenho livre
  const wave: Point[] = [];
  for (let i = 0; i <= 60; i++) {
    wave.push({ x: 800 + i * 5, y: 220 + Math.sin(i / 5) * 26 });
  }
  els.push(createFreehand(wave, { strokeColor: '#3A8156', strokeWidth: 4, isHighlighter: false }));
  els.push(
    createText({ x: 800, y: 270, width: 320, text: t('templates.demo.freehandDrawingPHighlighterNext'), fontSize: 16, textColor: '#4F5A53' }),
  );
  const hl: Point[] = [
    { x: 805, y: 330 },
    { x: 960, y: 333 },
    { x: 1100, y: 330 },
  ];
  els.push(createFreehand(hl, { strokeColor: '#F5E663', strokeWidth: 18, isHighlighter: true }));

  // Conectores (passe o mouse num objeto e use os 4 pontos para ligar)
  const a = createShape('rounded_rectangle', { x: -700, y: 520, width: 300, height: 100, fillColor: '#FFC58F', strokeColor: '#FFC58F', fontSize: 18, text: t('templates.demo.hoverUseDotsConnect') });
  const bShape = createShape('rounded_rectangle', { x: -260, y: 520, width: 300, height: 100, fillColor: '#FFC58F', strokeColor: '#FFC58F', fontSize: 16, text: t('templates.demo.moveBoxesLineFollows') });
  els.push(a, bShape, link(a, 'right', bShape, 'left', els.concat([a, bShape])));

  return els;
}

/** Cria um conector entre dois elementos já existentes. */
function link(from: CanvasElement, fromSide: AnchorSide, to: CanvasElement, toSide: AnchorSide, all: CanvasElement[]): CanvasElement {
  const lookup = (id: string) => all.find((e) => e.id === id);
  return createConnector(
    { elementId: from.id, anchor: fromSide, ...getAnchorPoint(from, fromSide) },
    { elementId: to.id, anchor: toSide, ...getAnchorPoint(to, toSide) },
    { routingType: 'orthogonal' },
    lookup,
  );
}

/** Grade de post-its (preset "Bloco" e template Brainwriting). */
export function createStickyGrid(origin: Point, rows: number, cols: number, size = 180, gap = 20, colors = STICKY_COLORS): CanvasElement[] {
  const els: CanvasElement[] = [];
  // Paletas antigas tinham branco e quase preto; a do Chat 05.5 não tem, o filtro só protege chamadas com `colors` próprio.
  const palette = colors.filter((c) => c !== '#1F2421' && c !== '#F4F5F2');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      els.push(
        createStickyNote({
          x: origin.x + c * (size + gap),
          y: origin.y + r * (size + gap),
          width: size,
          height: size,
          color: palette[(r * cols + c) % palette.length],
        }),
      );
    }
  }
  return els;
}

/** Fluxograma simples com formas (conectores chegam no Chat 03). */
export function createFlowchartPreset(origin: Point): CanvasElement[] {
  const s = (kind: ShapeKind, dx: number, dy: number, text: string, fill: string, w = 200, h = 100) =>
    createShape(kind, { x: origin.x + dx, y: origin.y + dy, width: w, height: h, text, fillColor: fill, strokeColor: '#194B32', fontSize: 16 });
  const start = s('rounded_rectangle', 0, 0, t('templates.demo.start'), '#D0E4AE');
  const collect = s('rectangle', 0, 160, t('templates.demo.collectData'), '#FFFFFF');
  const valid = s('diamond', 10, 320, t('templates.demo.valid'), '#FFF6A5', 180, 140);
  const fix = s('rectangle', 280, 340, t('templates.demo.fix'), '#FFD0EC');
  const process = s('rectangle', 0, 520, t('templates.demo.process'), '#FFFFFF');
  const end = { ...s('rounded_rectangle', 0, 680, t('templates.demo.end'), '#194B32'), textColor: '#D0E4AE' } as CanvasElement;
  const shapes = [start, collect, valid, fix, process, end];
  return [
    ...shapes,
    link(start, 'bottom', collect, 'top', shapes),
    link(collect, 'bottom', valid, 'top', shapes),
    link(valid, 'right', fix, 'left', shapes),
    link(fix, 'top', collect, 'right', shapes),
    link(valid, 'bottom', process, 'top', shapes),
    link(process, 'bottom', end, 'top', shapes),
  ];
}

export function createBrainwritingPreset(origin: Point): CanvasElement[] {
  const header = createText({
    x: origin.x,
    y: origin.y - 90,
    width: 760,
    text: t('templates.demo.brainwritingEachPersonWrites3'),
    fontSize: 32,
    fontName: 'Fraunces',
    fontWeight: 'bold',
    textColor: '#194B32',
  });
  return [header, ...createStickyGrid(origin, 3, 4)];
}

export function createTemplateData(template: BoardTemplateId): BoardData {
  // Chat 04: Galeria de Templates (SWOT, Retrospectiva, 9 blocos, Sprint, Jornada, Arquitetura)
  if (isGalleryTemplate(template)) return galleryTemplateData(template);
  switch (template) {
    case 'demo':
      return boardDataFromElements(createDemoElements());
    case 'flowchart':
      return boardDataFromElements(createFlowchartPreset({ x: -100, y: -380 }));
    case 'brainwriting':
      return boardDataFromElements(createBrainwritingPreset({ x: -390, y: -260 }));
    case 'mindmap':
      // Chat 03: mapa mental nativo pronto para ramificar (Tab = filho, Enter = irmão)
      return boardDataFromElements([createMindMap({ x: 0, y: 0 }, { rootText: t('templates.demo.centralTheme'), branches: [t('templates.demo.goals'), t('templates.demo.ideas'), t('templates.demo.risks'), t('templates.demo.nextSteps')] })]);
    default:
      return boardDataFromElements([]);
  }
}
