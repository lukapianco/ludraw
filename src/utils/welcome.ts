/**
 * LuDraw — Conteúdo do board de boas-vindas ("Comece por aqui").
 * Criado na Rodada 0 do Chat 02 (em `components/board/welcomeBoard.ts`) e movido para
 * `utils/` no Chat 03 (pré-tarefa 1) para que `useAppStore` o use sem criar dependência
 * `store`/`utils` → `components`. `components/board/welcomeBoard.ts` continua reexportando.
 *
 * Só dados: usa as factories existentes (`utils/factory`, `utils/connectors`) e o mesmo
 * formato `BoardData` (version 1). Nenhuma regra do motor muda.
 *
 * Composição:
 *  - título + subtítulo;
 *  - coluna numerada de 5 passos em cartões de uma cor só (sálvia/floresta), cada cartão
 *    agrupado (Ctrl+Shift+G desagrupa) com os "keycaps" dos atalhos;
 *  - mini fluxograma de exemplo: Ideia → Rascunho → Revisão → Entrega (com retorno);
 *  - um post-it livre para o primeiro teste.
 */

import type { AnchorSide, BoardData, CanvasElement } from '../types/canvas';
import { createShape, createStickyNote, createText, stickyColor } from './factory';
import { createConnector, getAnchorPoint } from './connectors';
import { boardDataFromElements } from './demo';
import { createId } from './id';
import { t } from '../i18n';

/** Nome sugerido para o board criado a partir deste conteúdo (no idioma ativo; depois é do usuário). */
export function welcomeBoardName(): string {
  return t('templates.welcome.startHere');
}

const FOREST = '#194B32';
const PISTACHE = '#D0E4AE';
const SAGE = '#EEF4E4';
const INK_MUTED = '#4F5A53';

interface Step {
  title: string;
  body: string;
  keys: string[];
}

const STEPS: Step[] = [
  {
    get title() { return t('templates.welcome.createStickyNote'); },
    get body() { return t('templates.welcome.pickStickyNoteDockBottom'); },
    keys: ['N'],
  },
  {
    get title() { return t('templates.welcome.writeFormat'); },
    get body() { return t('templates.welcome.doubleClickWriteObjectStrip'); },
    keys: ['Enter'],
  },
  {
    get title() { return t('templates.welcome.connectIdeas'); },
    get body() { return t('templates.welcome.hoverOverShapeDragOne'); },
    keys: ['L'],
  },
  {
    get title() { return t('templates.welcome.moveAroundBoard'); },
    get body() { return t('templates.welcome.spaceDragMovesCameraCtrl'); },
    get keys() { return [t('templates.welcome.spaceKey'), 'Shift 1']; },
  },
  {
    get title() { return t('templates.welcome.comeBackAnytime'); },
    // Chat 08.6 · C (D-07): o Painel saiu no Chat 08.2 — outros boards pela busca (Ctrl K) ou pela Mesa
    get body() { return t('templates.welcome.ctrlKFindsBoardsMarkDesk'); },
    keys: ['Ctrl K'],
  },
];

const COL_X = -780;
const CARD_W = 720;
const CARD_H = 128;
const CARD_GAP = 22;
const FIRST_Y = -300;

function keycapWidth(label: string): number {
  return Math.max(44, Math.round(20 + label.length * 9.5));
}

function stepCard(step: Step, index: number): CanvasElement[] {
  const y = FIRST_Y + index * (CARD_H + CARD_GAP);
  const groupId = createId();
  const els: CanvasElement[] = [];

  // Keycaps alinhados à direita; o texto ocupa o espaço que sobra à esquerda deles
  const keycaps: CanvasElement[] = [];
  let right = COL_X + CARD_W - 26;
  [...step.keys].reverse().forEach((label) => {
    const w = keycapWidth(label);
    right -= w;
    keycaps.push(
      createShape('rounded_rectangle', {
        x: right,
        y: y + CARD_H / 2 - 20,
        width: w,
        height: 40,
        fillColor: '#FFFFFF',
        strokeColor: FOREST,
        strokeWidth: 1.5,
        text: label,
        textColor: FOREST,
        fontSize: 15,
        fontWeight: 'bold',
        groupId,
      }),
    );
    right -= 8;
  });
  const textX = COL_X + 112;
  const textWidth = right - textX - 16;

  els.push(
    createShape('rounded_rectangle', {
      x: COL_X,
      y,
      width: CARD_W,
      height: CARD_H,
      fillColor: SAGE,
      strokeColor: PISTACHE,
      strokeWidth: 2,
      groupId,
    }),
    createShape('circle', {
      x: COL_X + 26,
      y: y + 34,
      width: 60,
      height: 60,
      fillColor: FOREST,
      strokeColor: FOREST,
      strokeWidth: 2,
      text: String(index + 1),
      textColor: PISTACHE,
      fontSize: 24,
      fontWeight: 'bold',
      groupId,
    }),
    // Fundo igual ao do cartão: o texto mantém a cor em Light e Dark (adaptInk só age em texto sem fundo)
    createText({
      x: textX,
      y: y + 20,
      width: textWidth,
      text: step.title,
      fontSize: 22,
      fontWeight: 'bold',
      textColor: FOREST,
      backgroundColor: SAGE,
      groupId,
    }),
    createText({
      x: textX,
      y: y + 56,
      width: textWidth,
      height: 64,
      text: step.body,
      fontSize: 15,
      textColor: INK_MUTED,
      backgroundColor: SAGE,
      groupId,
    }),
    ...keycaps,
  );

  return els;
}

function link(from: CanvasElement, fromSide: AnchorSide, to: CanvasElement, toSide: AnchorSide, all: CanvasElement[], dashed = false): CanvasElement {
  const lookup = (id: string) => all.find((e) => e.id === id);
  return createConnector(
    { elementId: from.id, anchor: fromSide, ...getAnchorPoint(from, fromSide) },
    { elementId: to.id, anchor: toSide, ...getAnchorPoint(to, toSide) },
    { routingType: 'orthogonal', strokeColor: dashed ? '#7D877F' : FOREST, strokeWidth: 2, strokeStyle: dashed ? 'dashed' : 'solid' },
    lookup,
  );
}

function exampleFlow(): CanvasElement[] {
  const x = 80;
  const label = createText({
    x,
    y: -300,
    width: 420,
    text: t('templates.welcome.sampleFlow'),
    fontSize: 22,
    fontWeight: 'bold',
    textColor: FOREST,
  });
  const hint = createText({
    x,
    y: -264,
    width: 440,
    height: 44,
    text: t('templates.welcome.dragBoxesArrowsFollowSelect'),
    fontSize: 15,
    textColor: INK_MUTED,
  });

  const node = (kind: 'rounded_rectangle' | 'rectangle' | 'diamond', y: number, text: string, fill: string, textColor = '#1C1C1E', h = 84) =>
    createShape(kind, {
      x: x + (kind === 'diamond' ? 20 : 40),
      y,
      width: kind === 'diamond' ? 220 : 180,
      height: h,
      fillColor: fill,
      strokeColor: FOREST,
      strokeWidth: 2,
      text,
      textColor,
      fontSize: 17,
      fontWeight: 'bold',
    });

  const idea = node('rounded_rectangle', -180, t('templates.welcome.idea'), PISTACHE);
  const draft = node('rectangle', -40, t('templates.welcome.draft'), '#FFFFFF');
  const review = node('diamond', 90, t('templates.welcome.review'), '#FFF6A5', '#1C1C1E', 120);
  const ship = node('rounded_rectangle', 270, t('templates.welcome.delivery'), FOREST, PISTACHE);
  const back = createText({
    x: x + 290,
    y: 30,
    width: 170,
    height: 44,
    text: t('templates.welcome.needsChangesBack'),
    fontSize: 14,
    fontStyle: 'italic',
    textColor: '#7D877F',
  });

  const nodes = [idea, draft, review, ship];
  return [
    label,
    hint,
    ...nodes,
    back,
    link(idea, 'bottom', draft, 'top', nodes),
    link(draft, 'bottom', review, 'top', nodes),
    link(review, 'bottom', ship, 'top', nodes),
    link(review, 'right', draft, 'right', nodes, true),
  ];
}

/** Elementos do board "Comece por aqui". Ids novos a cada chamada. */
export function createWelcomeElements(): CanvasElement[] {
  const els: CanvasElement[] = [];

  els.push(
    createText({
      x: COL_X,
      y: -480,
      width: 900,
      text: t('templates.welcome.startHere'),
      fontSize: 56,
      fontName: 'Fraunces',
      fontWeight: 'bold',
      textColor: FOREST,
    }),
    createText({
      x: COL_X,
      y: -396,
      width: 1100,
      text: t('templates.welcome.fiveShortStepsGetHang'),
      fontSize: 21,
      textColor: INK_MUTED,
    }),
  );

  STEPS.forEach((step, i) => els.push(...stepCard(step, i)));
  els.push(...exampleFlow());

  els.push(
    createStickyNote({
      x: 380,
      y: 270,
      width: 200,
      height: 200,
      color: stickyColor('lima'),
      text: t('templates.welcome.thisStickyNoteYoursDouble'),
      rotation: 3,
    }),
  );

  return els;
}

/** `BoardData` pronto para `createBoard({ data })`. */
export function createWelcomeBoardData(): BoardData {
  return boardDataFromElements(createWelcomeElements());
}
