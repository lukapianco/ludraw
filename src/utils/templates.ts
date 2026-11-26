/**
 * LuDraw — Galeria de Templates (Chat 04): estruturas prontas de autoria própria.
 *
 * Cada template é montado do zero com os elementos nativos do board. As estruturas de fundo
 * (Frames, faixas, títulos e rótulos) nascem com `lockMode: 'protected'` + `isBackgroundFramework`:
 * participantes só mexem nos post-its e no conteúdo; só facilitadores/admins destravam.
 *
 * Sala limpa: nomes, textos, disposição e cores foram escritos para o projeto. O "Modelo de
 * negócio em 9 blocos" é uma estrutura genérica própria (nomes, perguntas e grade 3 × 3 nossos) —
 * decisão do usuário registrada em docs/PROVENANCE.md.
 */

import type { BoardData, CanvasElement, KanbanCard, TableElement } from '../types/canvas';
import type { BoardTemplateId } from '../types/workspace';
import { DEFAULT_GRID } from '../store/useBoardStore';
import { createFrame, createFreehand, createKanban, createShape, createStickyNote, createTable, createText, cloneElements, stickyColor } from './factory';
import { createKanbanCard, createKanbanColumn } from './kanban';
import { createConnector, getAnchorPoint } from './connectors';
import { buildDiagramElements, parseDiagram } from './diagram';
import { computeReparent, isFrame } from './frames';
import { getBoundsOfElements, rectCenter, type Point } from './math';
import type { AnchorSide } from '../types/canvas';
import { t } from '../i18n';

/* --------------------------------- Helpers ---------------------------------- */

type LockKind = 'protected' | 'standard';

/** Marca como estrutura de fundo travada. */
function structure<T extends CanvasElement>(el: T, lock: LockKind = 'protected'): T {
  return { ...el, locked: true, lockMode: lock, lockedBy: null, isBackgroundFramework: true };
}

/** Ordena (frames → estruturas de fundo → conteúdo), calcula o `parentId` e monta o BoardData. */
export function templateBoardData(elements: CanvasElement[]): BoardData {
  const frames = elements.filter(isFrame);
  const back = elements.filter((e) => !isFrame(e) && e.isBackgroundFramework);
  const rest = elements.filter((e) => !isFrame(e) && !e.isBackgroundFramework);
  const ordered = [...frames, ...back, ...rest];
  const record: Record<string, CanvasElement> = {};
  ordered.forEach((el, i) => (record[el.id] = { ...el, zIndex: i } as CanvasElement));
  frames.forEach((f, i) => (record[f.id] = { ...record[f.id], slideOrder: i } as CanvasElement));
  const order = ordered.map((e) => e.id);
  for (const { id, patch } of computeReparent(record, order, undefined, frames.map((f) => f.id))) record[id] = { ...record[id], ...patch } as CanvasElement;
  return { version: 1, elements: record, elementOrder: order, gridSettings: { ...DEFAULT_GRID }, backgroundColor: null, initialView: null };
}

function title(x: number, y: number, text: string, subtitle?: string, width = 1400): CanvasElement[] {
  const out: CanvasElement[] = [structure(createText({ x, y, width, text, fontSize: 48, fontName: 'Fraunces', fontWeight: 'bold', textColor: '#194B32' }))];
  if (subtitle) out.push(structure(createText({ x, y: y + 74, width, text: subtitle, fontSize: 20, textColor: '#4F5A53' })));
  return out;
}

function label(x: number, y: number, text: string, width = 400, size = 18, color = '#4F5A53', bold = false): CanvasElement {
  return structure(createText({ x, y, width, text, fontSize: size, textColor: color, fontWeight: bold ? 'bold' : 'normal' }));
}

function sticky(x: number, y: number, text: string, color: string, size = 180): CanvasElement {
  return createStickyNote({ x, y, width: size, height: size, text, color });
}

function link(from: CanvasElement, fromSide: AnchorSide, to: CanvasElement, toSide: AnchorSide, text?: string): CanvasElement {
  const conn = createConnector(
    { elementId: from.id, anchor: fromSide, ...getAnchorPoint(from, fromSide) },
    { elementId: to.id, anchor: toSide, ...getAnchorPoint(to, toSide) },
    { routingType: 'orthogonal', strokeColor: '#1C1C1E' },
    (id) => (id === from.id ? from : id === to.id ? to : undefined),
  );
  return text ? ({ ...conn, label: text } as CanvasElement) : conn;
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* -------------------------------- Templates --------------------------------- */

export function createSwotElements(): CanvasElement[] {
  const W = 760;
  const H = 540;
  const G = 40;
  const x0 = 120;
  const y0 = 160;
  const quads = [
    { t: t('templates.templates.strengths'), sub: t('templates.templates.internalHelps'), fill: '#E7F1D6', sticky: stickyColor('lima'), q: [t('templates.templates.whatDoWeDoBetter'), t('templates.templates.whatResourceDoOnlyWe')] },
    { t: t('templates.templates.weaknesses'), sub: t('templates.templates.internalHurts'), fill: '#FBE6E2', sticky: stickyColor('coral'), q: [t('templates.templates.whereAreWeLosingCustomers'), t('templates.templates.whatsMissingTeamProduct')] },
    { t: t('templates.templates.opportunities'), sub: t('templates.templates.externalHelps'), fill: '#E3EDF9', sticky: stickyColor('hortensia'), q: [t('templates.templates.whatTrendCanWeRide'), t('templates.templates.whatPartnershipWouldOpenDoors')] },
    { t: t('templates.templates.threats'), sub: t('templates.templates.externalHurts'), fill: '#FBF0DC', sticky: stickyColor('damasco'), q: [t('templates.templates.whatCompetitionGettingReady'), t('templates.templates.whatChangeOutThereWorries')] },
  ];
  const els: CanvasElement[] = [...title(x0, -40, t('templates.templates.swotMatrix'), t('templates.templates.strengthsWeaknessesLookInwardOpportunities'))];
  // acima dos cabeçalhos dos frames (que ficam fora do corpo, em tamanho fixo de tela)
  els.push(label(x0, y0 - 84, t('templates.templates.helpsGoal'), W, 18, '#3A8156', true), label(x0 + W + G, y0 - 84, t('templates.templates.hurtsGoal'), W, 18, '#C2412D', true));
  els.push({ ...label(x0 - 100, y0 + H / 2 - 14, t('templates.templates.internal'), 160, 18, '#4F5A53', true), rotation: 270 } as CanvasElement, { ...label(x0 - 100, y0 + H + G + H / 2 - 14, t('templates.templates.external'), 160, 18, '#4F5A53', true), rotation: 270 } as CanvasElement);
  quads.forEach((q, i) => {
    const x = x0 + (i % 2) * (W + G);
    const y = y0 + Math.floor(i / 2) * (H + G);
    els.push(structure(createFrame({ x, y, width: W, height: H }, { title: q.t, fillColor: q.fill })));
    els.push(label(x + 28, y + 24, q.sub, 400, 16, '#4F5A53'));
    q.q.forEach((text, k) => els.push(sticky(x + 28 + k * 210, y + 70, text, q.sticky)));
  });
  return els;
}

export function createRetroElements(): CanvasElement[] {
  const W = 560;
  const H = 860;
  const G = 40;
  const x0 = 0;
  const y0 = 170;
  const cols = [
    { t: t('templates.templates.startDoing'), q: t('templates.templates.whatsWorthTryingNextSprint'), fill: '#E7F1D6', sticky: stickyColor('lima'), ex: t('templates.templates.pairingNewTasks') },
    { t: t('templates.templates.stopDoing'), q: t('templates.templates.whatSlowsUsDownDoesnt'), fill: '#FBE6E2', sticky: stickyColor('damasco'), ex: t('templates.templates.meetingsWithoutAgenda') },
    { t: t('templates.templates.keepDoing'), q: t('templates.templates.whatWorkedDoWeWant'), fill: '#E3EDF9', sticky: stickyColor('hortensia'), ex: t('templates.templates.shortDemoEveryFriday') },
  ];
  const els: CanvasElement[] = [...title(x0, -20, t('templates.templates.sprintRetrospective'), t('templates.templates.n5MinutesWritingSilencePrivate'), 1760)];
  cols.forEach((c, i) => {
    const x = x0 + i * (W + G);
    els.push(structure(createFrame({ x, y: y0, width: W, height: H }, { title: c.t, fillColor: c.fill })));
    els.push(label(x + 28, y0 + 24, c.q, W - 56, 17, '#4F5A53'));
    els.push(sticky(x + 28, y0 + 80, c.ex, c.sticky));
  });
  const actions = createTable(
    { x: x0, y: y0 + H + 60 },
    { data: [[t('templates.templates.agreedAction'), t('common.assignee'), t('templates.templates.due')], ['', '', ''], ['', '', ''], ['', '', '']], colWidths: [860, 400, 500] },
  );
  els.push(label(x0, y0 + H + 22, t('templates.templates.retrospectiveActions'), 600, 20, '#194B32', true), actions);
  return els;
}

export function createBusinessModelElements(): CanvasElement[] {
  const W = 540;
  const H = 420;
  const G = 24;
  const x0 = 0;
  const y0 = 170;
  const blocks = [
    { t: t('templates.templates.n1WhoIts'), q: t('templates.templates.whoAreCustomersWhatProblem'), fill: '#E7F1D6' },
    { t: t('templates.templates.n2ValueDelivered'), q: t('templates.templates.whatDoWeSolveThem'), fill: '#E7F1D6' },
    { t: t('templates.templates.n3HowWeReachThem'), q: t('templates.templates.whereDoCustomersFindLearn'), fill: '#E7F1D6' },
    { t: t('templates.templates.n4CustomerRelationship'), q: t('templates.templates.howDoWeWinServe'), fill: '#E3EDF9' },
    { t: t('templates.templates.n5KeyActivities'), q: t('templates.templates.whatMustWeDoReally'), fill: '#E3EDF9' },
    { t: t('templates.templates.n6KeyResources'), q: t('templates.templates.peopleTechnologyDataBrandWhat'), fill: '#E3EDF9' },
    { t: t('templates.templates.n7Partners'), q: t('templates.templates.whoHelpsUsDeliverSuppliers'), fill: '#FBF0DC' },
    { t: t('templates.templates.n8Costs'), q: t('templates.templates.whereDoesMoneyGoFixed'), fill: '#FBF0DC' },
    { t: t('templates.templates.n9Revenue'), q: t('templates.templates.whereDoesMoneyComeHow'), fill: '#FBF0DC' },
  ];
  const els: CanvasElement[] = [...title(x0, -20, t('templates.templates.n9BlockBusinessModel'), t('templates.templates.readOrderCustomerValueRow'), 1660)];
  blocks.forEach((b, i) => {
    const x = x0 + (i % 3) * (W + G);
    const y = y0 + Math.floor(i / 3) * (H + G);
    els.push(structure(createFrame({ x, y, width: W, height: H }, { title: b.t, fillColor: b.fill })));
    els.push(label(x + 24, y + 22, b.q, W - 48, 16, '#4F5A53'));
  });
  els.push(sticky(x0 + 24, y0 + 96, t('templates.templates.eGSmallFactoriesThat'), stickyColor('canario'), 200));
  return els;
}

export function createSprintKanbanElements(): CanvasElement[] {
  const card = (title: string, priority: KanbanCard['priority'], points: number, assignee: string, tags: string[], due?: number, description?: string) =>
    createKanbanCard({ title, priority, storyPoints: points, assignee, tags, dueDate: due !== undefined ? isoInDays(due) : undefined, description });
  const columns = [
    createKanbanColumn('Backlog', '#5B605C', [card(t('templates.templates.exportReportAsPdf'), 'low', 3, 'Bruno', [t('templates.templates.reports')]), card(t('templates.templates.userPreferencesScreen'), 'medium', 5, 'Carla', ['ux'])]),
    createKanbanColumn(t('common.toDo'), '#2C64A8', [card(t('templates.templates.signEmailPassword'), 'high', 5, 'Ana', ['auth'], 3, t('templates.templates.validateCompanyDomainLockAfter')), card(t('templates.templates.errorMessagesPlainLanguage'), 'medium', 2, 'Bruno', ['ux'], 5)]),
    { ...createKanbanColumn(t('templates.templates.inProgress'), '#E0A21B', [card(t('templates.templates.syncBoardRealTime'), 'high', 8, 'Carla', [t('templates.templates.realTime')], 2)]), wipLimit: 3 },
    { ...createKanbanColumn(t('templates.templates.inReview'), '#8C4A7A', [card(t('templates.templates.fixDarkModeContrast'), 'low', 1, 'Ana', ['acessibilidade'], 1)]), wipLimit: 2 },
    createKanbanColumn(t('templates.templates.done'), '#3A8156', [card(t('templates.templates.setUpTestEnvironment'), 'medium', 3, 'Bruno', ['infra'])]),
  ];
  const kanban = createKanban({ x: 0, y: 0 }, { title: t('templates.templates.sprint12TeamBoard'), columns, columnWidth: 248 });
  const kx = 40;
  const ky = 300;
  const placed = { ...kanban, x: kx, y: ky };
  const frameW = Math.max(1900, placed.width + 80 + 520);
  const frameH = placed.height + 340;
  const goal = createStickyNote({ x: 40, y: 80, width: 640, height: 180, text: t('templates.templates.sprintGoalTeamCanSign'), color: stickyColor('canario'), fontSize: 22 });
  const capacity = createTable(
    { x: kx + placed.width + 40, y: ky },
    { data: [[t('templates.templates.person'), t('templates.templates.daysOff'), t('templates.templates.points')], ['Ana', '8', '13'], ['Bruno', '9', '13'], ['Carla', '7', '11'], [t('templates.templates.total'), '24', '37']], colWidths: [180, 140, 120] },
  );
  const capCells: TableElement['cells'] = { ...capacity.cells, '4-0': { text: t('templates.templates.total'), bold: true }, '4-1': { text: '24', bold: true }, '4-2': { text: '37', bold: true } };
  const els: CanvasElement[] = [
    structure(createFrame({ x: 0, y: 0, width: frameW, height: frameH }, { title: t('templates.templates.sprint122Weeks'), fillColor: '#F4F9EC' })),
    label(720, 90, t('templates.templates.workingAgreementsMost3Cards'), 1100, 18, '#4F5A53'),
    goal,
    placed,
    label(kx + placed.width + 40, ky - 40, t('templates.templates.teamCapacity'), 400, 18, '#194B32', true),
    { ...capacity, cells: capCells },
  ];
  return els;
}

export function createJourneyElements(): CanvasElement[] {
  const stages = [t('templates.templates.discover'), t('templates.templates.evaluate'), t('templates.templates.purchase'), t('templates.templates.use'), t('templates.templates.recommend')];
  const rows = [
    { t: t('templates.templates.doing'), fill: '#FFFFFF' },
    { t: t('templates.templates.thinking'), fill: '#F4F9EC' },
    { t: t('templates.templates.feeling'), fill: '#FFFFFF' },
    { t: t('templates.templates.painPoints'), fill: '#FBE6E2' },
    { t: t('templates.templates.opportunities'), fill: '#E7F1D6' },
  ];
  const labelW = 220;
  const colW = 360;
  const rowH = 230;
  const headH = 90;
  const fx = 0;
  const fy = 0;
  const width = labelW + stages.length * colW + 60;
  const height = 300 + headH + rows.length * rowH + 40;
  const els: CanvasElement[] = [structure(createFrame({ x: fx, y: fy, width, height }, { title: t('templates.templates.userJourneyMap'), fillColor: '#FFFFFF' }))];
  els.push(label(40, 30, t('templates.templates.journeySomeoneAdoptingNewTool'), width - 80, 30, '#194B32', true));
  els.push(createShape('rounded_rectangle', { x: 40, y: 92, width: 760, height: 150, text: t('templates.templates.personaMarina34RunsPurchasing'), fillColor: '#FFF6A5', strokeColor: '#E0A21B', fontSize: 18, textAlign: 'left' }));
  els.push(label(840, 110, t('templates.templates.howUseOneStickyNote'), width - 900, 17, '#4F5A53'));
  const top = 300;
  stages.forEach((s, i) => {
    const x = 40 + labelW + i * colW;
    els.push(structure(createShape('rounded_rectangle', { x: x + 6, y: top, width: colW - 12, height: headH - 14, text: `${i + 1}. ${s}`, fillColor: '#194B32', strokeColor: '#194B32', textColor: '#D0E4AE', fontSize: 20, fontWeight: 'bold' })));
  });
  rows.forEach((r, i) => {
    const y = top + headH + i * rowH;
    els.push(structure(createShape('rectangle', { x: 40, y, width: labelW + stages.length * colW, height: rowH - 8, fillColor: r.fill, strokeColor: '#DDE2D8', strokeWidth: 1.5 })));
    els.push(structure(createShape('rectangle', { x: 40, y, width: labelW - 12, height: rowH - 8, text: r.t, fillColor: '#ECEFE8', strokeColor: '#DDE2D8', strokeWidth: 1.5, fontSize: 18, fontWeight: 'bold', textColor: '#18211C' })));
  });
  // curva de emoção de exemplo (linha "Como se sente")
  const emoY = top + headH + 2 * rowH;
  const levels = [0.55, 0.3, 0.75, 0.2, 0.65];
  const pts: Point[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * (levels.length - 1);
    const k = Math.min(levels.length - 2, Math.floor(t));
    const f = t - k;
    const v = levels[k] + (levels[k + 1] - levels[k]) * (0.5 - Math.cos(f * Math.PI) / 2);
    pts.push({ x: 40 + labelW + colW / 2 + t * colW, y: emoY + 20 + v * (rowH - 60) });
  }
  els.push(structure(createFreehand(pts, { strokeColor: '#3A8156', strokeWidth: 5, isHighlighter: false })));
  const ex: [number, number, string, string][] = [
    [0, 0, t('templates.templates.searchesHowCutLeftoversFinds'), stickyColor('hortensia')],
    [1, 1, t('templates.templates.willTeamReallyUse'), stickyColor('algodao-doce')],
    [2, 3, t('templates.templates.purchaseApprovalTakes3Weeks'), stickyColor('coral')],
    [3, 4, t('templates.templates.shortVideoTrainingInsideApp'), stickyColor('lima')],
    [4, 0, t('templates.templates.recommendsAnotherSiteCompany'), stickyColor('hortensia')],
  ];
  for (const [col, row, text, color] of ex) els.push(sticky(40 + labelW + col * colW + 24, top + headH + row * rowH + 18, text, color, 170));
  return els;
}

export function createArchitectureElements(): CanvasElement[] {
  const box = (kind: Parameters<typeof createShape>[0], x: number, y: number, w: number, h: number, text: string, fill: string) =>
    createShape(kind, { x, y, width: w, height: h, text, fillColor: fill, strokeColor: '#194B32', fontSize: 17 });
  const ox = 0;
  const oy = 0;
  const web = box('rectangle', ox + 60, oy + 120, 240, 100, t('templates.templates.browserWebApp'), '#FFFFFF');
  const desk = box('rectangle', ox + 60, oy + 260, 240, 100, t('templates.templates.desktopApp'), '#FFFFFF');
  const proxy = box('hexagon', ox + 380, oy + 185, 240, 110, t('templates.templates.reverseProxyHttps'), '#E3EDF9');
  const api = box('rounded_rectangle', ox + 700, oy + 100, 260, 110, t('templates.templates.apiAuthenticationPermissions'), '#D0E4AE');
  const rt = box('rounded_rectangle', ox + 700, oy + 270, 260, 110, t('templates.templates.realTimeWebsocket'), '#D0E4AE');
  const db = box('cylinder', ox + 1050, oy + 90, 220, 140, t('templates.templates.database'), '#E7F1D6');
  const files = box('cylinder', ox + 1050, oy + 270, 220, 140, t('templates.templates.filesImages'), '#E7F1D6');
  const queue = box('parallelogram', ox + 700, oy + 440, 260, 100, t('templates.templates.jobQueueExports'), '#FBF0DC');
  const shapes = [web, desk, proxy, api, rt, db, files, queue];
  const arch: CanvasElement[] = [
    structure(createFrame({ x: ox, y: oy, width: 1340, height: 600 }, { title: t('templates.templates.systemArchitecture'), fillColor: '#FFFFFF' })),
    label(ox + 60, oy + 40, t('templates.templates.containerViewWhoTalksWhom'), 900, 18, '#4F5A53'),
    ...shapes,
    link(web, 'right', proxy, 'left', 'HTTPS'),
    link(desk, 'right', proxy, 'left'),
    link(proxy, 'right', api, 'left', 'REST'),
    link(proxy, 'right', rt, 'left', 'WS'),
    link(api, 'right', db, 'left', 'SQL'),
    link(rt, 'right', files, 'left'),
    link(api, 'bottom', queue, 'top', 'jobs'),
  ];
  // Fluxograma gerado pelo mesmo motor do "Diagrama por texto"
  const flow = buildDiagramElements(
    parseDiagram(t('templates.templates.flowchartTdUserOpensBoard')),
    { x: 1500, y: 90 },
  );
  const fb = getBoundsOfElements(flow.filter((e) => e.type !== 'connector'))!;
  const flowFrame = structure(createFrame({ x: fb.x - 60, y: fb.y - 70, width: fb.width + 120, height: fb.height + 130 }, { title: t('templates.templates.accessFlow'), fillColor: '#F4F9EC' }));
  return [...arch, flowFrame, ...flow];
}

/* --------------------------------- Catálogo ---------------------------------- */

export type GalleryTemplateId = 'swot' | 'retro' | 'business9' | 'sprint' | 'journey' | 'architecture';

export interface GalleryTemplate {
  id: GalleryTemplateId;
  label: string;
  description: string;
  category: 'brainstorm' | 'planning' | 'diagram' | 'strategy';
  build: () => CanvasElement[];
}

export const GALLERY_TEMPLATES: GalleryTemplate[] = [
  { id: 'swot', get label() { return t('templates.templates.swotMatrix2'); }, get description() { return t('templates.templates.swotDescription'); }, category: 'strategy', build: createSwotElements },
  { id: 'retro', get label() { return t('templates.templates.agileRetrospective'); }, get description() { return t('templates.templates.startStopContinueActionTable'); }, category: 'brainstorm', build: createRetroElements },
  { id: 'business9', get label() { return t('templates.templates.n9BlockBusinessModel'); }, get description() { return t('templates.templates.n33GridQuestionsEach'); }, category: 'strategy', build: createBusinessModelElements },
  { id: 'sprint', get label() { return t('templates.templates.sprintKanban'); }, get description() { return t('templates.templates.boardWipSprintGoalCapacity'); }, category: 'planning', build: createSprintKanbanElements },
  { id: 'journey', get label() { return t('templates.templates.userJourneyMap'); }, get description() { return t('templates.templates.n5Stages5LayersPersona'); }, category: 'planning', build: createJourneyElements },
  { id: 'architecture', get label() { return t('templates.templates.architectureFlowchart'); }, get description() { return t('templates.templates.containersProtocolsAccessFlow'); }, category: 'diagram', build: createArchitectureElements },
];

export const GALLERY_CATEGORY_LABELS: Record<GalleryTemplate['category'] | 'all', string> = {
  get all() {
    return t('templates.templates.all');
  },
  get brainstorm() { return t('templates.templates.ideation'); },
  get planning() {
    return t('templates.templates.planning');
  },
  get strategy() { return t('templates.templates.strategy'); },
  get diagram() {
    return t('templates.templates.diagrams');
  },
};

export function isGalleryTemplate(id: BoardTemplateId): id is GalleryTemplateId {
  return GALLERY_TEMPLATES.some((t) => t.id === id);
}

export function galleryTemplateData(id: GalleryTemplateId): BoardData {
  const t = GALLERY_TEMPLATES.find((g) => g.id === id)!;
  return templateBoardData(t.build());
}

/**
 * Prepara elementos para inserir num board aberto: novos ids, centralizados em `center`,
 * bloqueio protegido só se quem insere pode aplicá-lo (senão vira bloqueio padrão), `lockedBy` = quem insere.
 */
export function prepareTemplateInsert(elements: CanvasElement[], center: Point, options: { userId: string; canProtect: boolean }): CanvasElement[] {
  const content = elements.filter((e) => e.type !== 'connector');
  const b = getBoundsOfElements(content.length ? content : elements);
  if (!b) return [];
  const c = rectCenter(b);
  const clones = cloneElements(elements, { x: center.x - c.x, y: center.y - c.y });
  return clones.map((el) => {
    if (!el.locked && (!el.lockMode || el.lockMode === 'none')) return el;
    const mode = el.lockMode === 'protected' && !options.canProtect ? 'standard' : el.lockMode ?? 'standard';
    return { ...el, locked: true, lockMode: mode, lockedBy: options.userId } as CanvasElement;
  });
}
