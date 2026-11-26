/**
 * LuDraw — Store principal do quadro (Zustand).
 * API padronizada pelo ARCHITECTURE_MAP.md §3 + extensões do Chat 01.
 *
 * Histórico (Undo/Redo):
 *  - Snapshots imutáveis de { elements, elementOrder } (compartilhamento estrutural = barato).
 *  - Ações discretas (add, delete, group, camadas, colar, duplicar, alinhar, converter...) gravam
 *    o histórico automaticamente.
 *  - `updateElement(s)` NÃO grava sozinho (é chamado a 60 FPS durante arrastos). Quem inicia uma
 *    interação contínua chama `pushHistory()` uma única vez antes da primeira alteração.
 */

import type { MessageDescriptor } from '../i18n/types';
import { create } from 'zustand';
import type {
  BoardActivityAction,
  BoardActivityEntry,
  BoardData,
  CameraState,
  CanvasElement,
  CommentElement,
  CommentMessage,
  ElementPatch,
  FacilitationState,
  GridSettings,
  LockMode,
  SmartGuide,
  StickyNoteElement,
  StickyTag,
  TextualElement,
  ToolOptions,
  ToolType,
  MusicTrack,
  TimerState,
  VoteTargetKey,
  VotingState,
} from '../types/canvas';
import { isTextualElement } from '../types/canvas';
import {
  centerCameraOn,
  clampZoom,
  fitRectInViewport,
  getBoundsOfElements,
  getElementBounds,
  rectCenter,
  type Point,
  type Rect,
  type Size,
  zoomAtPoint,
} from '../utils/math';
import { animateCamera, cancelCameraAnimation } from '../utils/cameraAnimation';
import {
  cloneElements,
  createComment,
  convertElement,
  type ConvertTarget,
  type CopiedStyle,
  DEFAULT_STICKY_COLOR,
  extractStyle,
  styleToPatch,
} from '../utils/factory';
import { createId } from '../utils/id';
import { syncConnectors } from '../utils/connectors';
import { computeReparent, isFrame, isHiddenByFrame } from '../utils/frames';
import { nextTagColor, toggleReactionPatch } from '../utils/stickyMeta';
import { ACTIVITY_DETAIL, appendActivity, elementMessage, GEOMETRY_ONLY_KEYS, groupByType, type ActivityTarget } from '../utils/activity';
import type { StoredMessage } from '../i18n/types';
import { effectiveLockMode, explain, isPrivateDraftHidden, unlockActionFor, type PermissionAction, type PermissionContext, type ViewAsProfile } from '../utils/permissions';
import type { BoardRole, PublicShareLink, WorkspacePolicies, WorkspaceRole } from '../types/workspace';
import { t, translateMessage } from '../i18n';
import { DEFAULT_AUTHOR_NAME } from '../utils/storedNames';

export const CLIPBOARD_MIME_MARKER = 'ludraw/elements@1';
const HISTORY_LIMIT = 120;

interface HistoryEntry {
  elements: Record<string, CanvasElement>;
  elementOrder: string[];
  /** Catálogo de tags no momento do snapshot (Chat 02) — desfazer restaura tags e post-its juntos */
  boardTags: StickyTag[];
}

/** Movido para `types/canvas.ts` (Chat 08.2 · C-2) para os cursores não puxarem o store; reexportado aqui. */
import type { InteractionKind } from '../types/canvas';
export type { InteractionKind };

export interface ContextMenuState {
  x: number;
  y: number;
  world: Point;
  target: 'canvas' | 'element';
}

export interface LiveLabel {
  text: string;
  x: number;
  y: number;
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Quem está usando o board agora (sincronizado por `hooks/usePermissionSync.ts` a partir da
 * sessão do app e do "Visualizar como…"). O store usa isto para montar o `PermissionContext`
 * de `can()` e para a autoria do Activity Log — sem importar o store do app.
 */
export interface BoardAccess {
  userId: string;
  userName: string;
  workspaceRole: WorkspaceRole;
  boardRole?: BoardRole | null;
  shareAccessLevel?: PublicShareLink['accessLevel'];
  isBoardOwner: boolean;
  /** Titular do board (default de facilitatorIds) */
  ownerId: string;
  policies?: Partial<WorkspacePolicies>;
  allowDownload?: boolean;
  /** Chat 06: false = a hierarquia não dá acesso a este board (ver `PermissionContext.boardAccess`) */
  boardAccess?: boolean;
  /** Emenda v1.1: conta isolada do modo "Continuar sem conta" */
  isolated?: boolean;
  /** Perfil simulado ativo (null = o próprio usuário) */
  viewAs: ViewAsProfile | null;
}

export const DEFAULT_ACCESS: BoardAccess = {
  userId: 'local',
  userName: DEFAULT_AUTHOR_NAME,
  workspaceRole: 'admin',
  isBoardOwner: true,
  ownerId: 'local',
  viewAs: null,
};

/**
 * Chat 08 — tempo real. Em colaboração o desfazer é POR PESSOA (Y.UndoManager do binding): o desfazer por
 * foto de { elements, elementOrder } apagaria o que os outros fizeram. O binding registra este adaptador.
 */
export interface HistoryAdapter {
  /** início de um passo (chamado onde antes se gravava a foto) */
  mark: () => void;
  undo: () => void;
  redo: () => void;
}


let historyAdapter: HistoryAdapter | null = null;

/** Chat 08: devolve o NOME de quem está editando o objeto agora (outra pessoa), ou null. Registrado pelo tempo real. */
let editGuard: ((id: string) => string | null) | null = null;
export function setEditGuard(fn: ((id: string) => string | null) | null): void {
  editGuard = fn;
}

/** Mudanças que chegam de outras pessoas (ou do próprio desfazer coletivo): aplicadas SEM `ensure`, histórico nem log. */
export interface RemotePatch {
  /** elementos criados/alterados, no formato final (sem zIndex) */
  upsert?: CanvasElement[];
  remove?: string[];
  order?: string[];
  gridSettings?: GridSettings;
  backgroundColor?: string | null;
  initialView?: CameraState | null;
  boardTags?: StickyTag[];
  facilitatorIds?: string[] | null;
  /** Activity Log já carimbado pelo servidor (Chat 08 · A-2) */
  activityLog?: BoardActivityEntry[];
  /** parte compartilhada da facilitação (previewOwnNotes é só local e nunca vem daqui) */
  facilitation?: Partial<FacilitationState>;
}

const DEFAULT_FACILITATION: FacilitationState = { privateMode: { enabled: false, previewOwnNotes: false } };

/** Ferramentas que criam conteúdo (exigem `board.edit`). */
const CREATION_TOOLS = new Set<ToolType>(['sticky', 'shape', 'text', 'connector', 'pen', 'highlighter', 'eraser', 'frame', 'mindmap', 'kanban', 'table', 'image']);

/** Monta o PermissionContext do usuário efetivo (inclui "Visualizar como…"). */
export function buildPermissionContext(
  state: Pick<BoardState, 'access' | 'facilitatorIds'>,
  extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>,
): PermissionContext {
  const a = state.access;
  const facilitators = state.facilitatorIds ?? [a.ownerId];
  return {
    userId: a.userId,
    workspaceRole: a.workspaceRole,
    boardRole: a.boardRole ?? null,
    isBoardOwner: a.isBoardOwner,
    // perfil genérico simulado decide sozinho; usuário simulado (conta do diretório) segue a lista real
    isFacilitator: a.viewAs && !a.viewAs.simulatedUserId ? a.viewAs.isFacilitator : a.isBoardOwner || facilitators.includes(a.userId),
    shareAccessLevel: a.shareAccessLevel,
    policies: a.policies,
    allowDownload: a.allowDownload,
    boardAccess: a.boardAccess,
    isolated: a.isolated,
    ...extra,
  };
}

/**
 * Chat 06 · B: exclusão em massa (a partir de `BULK_DELETE_THRESHOLD` objetos) avisa ANTES de apagar,
 * para o Histórico de Versões gravar um snapshot de segurança (CLAUDE.md §1.6). O store não conhece o
 * repositório: quem registra o handler é `utils/versionHistory.ts`.
 */
export const BULK_DELETE_THRESHOLD = 20;
let bulkDeleteHandler: ((before: BoardData, count: number) => void) | null = null;
export function setBulkDeleteHandler(fn: ((before: BoardData, count: number) => void) | null): void {
  bulkDeleteHandler = fn;
}

/**
 * Chat 06.5 · B: mutações feitas por uma extensão (API `ludraw.*`) rodam dentro de `runAsExtension`.
 * As ações do store são síncronas, então o contexto vale exatamente para aquela chamada: o Activity Log
 * grava `viaExtension` e o agrupamento de 8 s só junta entradas da mesma extensão (EXTENSIONS_SPEC §5.5).
 */
let currentVia: { id: string; name: string } | null = null;
export function runAsExtension<T>(via: { id: string; name: string }, fn: () => T): T {
  const prev = currentVia;
  currentVia = via;
  try {
    return fn();
  } finally {
    currentVia = prev;
  }
}

/**
 * Chat 06.5 · B: mesma decisão do `ensure()` (somente leitura, Modo Apresentação, `explain()`), mas
 * devolvendo o motivo em vez de mostrar toast — usada pela API das extensões para responder ao script.
 */
export function checkBoardAction(action: PermissionAction): { allowed: boolean; reason?: MessageDescriptor } {
  const s = useBoardStore.getState();
  if (!s.boardId || s.readOnly) return { allowed: false, reason: { key: 'permissions.denied.noAccess' } };
  if (s.presenting && !PRESENTATION_ALLOWED.has(action)) return { allowed: false, reason: { key: 'board.useBoardStore.leavePresentationModeEditBoard' } };
  return explain(buildPermissionContext(s), action);
}

let deniedHandler: (reason: string) => void = () => undefined;
let lastDenied = { reason: '', at: 0 };
/** O app registra aqui como mostrar o motivo de uma ação negada (toast). */
export function setPermissionDeniedHandler(fn: (reason: string) => void): void {
  deniedHandler = fn;
}
function reportDenied(reason: string): void {
  const t = Date.now();
  if (reason === lastDenied.reason && t - lastDenied.at < 2500) return;
  lastDenied = { reason, at: t };
  deniedHandler(reason);
}

export const DEFAULT_GRID: GridSettings = { enabled: true, snapToGrid: false, size: 20, style: 'dots' };

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  stickyColor: DEFAULT_STICKY_COLOR,
  shapeKind: 'rectangle',
  penColor: '#194B32',
  penWidth: 3,
  highlighterColor: '#F5E663',
  highlighterWidth: 18,
  connectorRouting: 'straight',
  connectorStartArrow: 'none',
  connectorEndArrow: 'arrow',
  frameRatio: 'free',
};

/** Ações permitidas durante o Modo Apresentação (o resto é bloqueado no `ensure`). */
const PRESENTATION_ALLOWED = new Set<PermissionAction>(['board.view', 'board.export', 'timer.manage']);

/** Cronômetro padrão (5 min, sem música) — Chat 04. */
export const DEFAULT_TIMER: TimerState = { running: false, durationMs: 5 * 60_000, remainingMs: 5 * 60_000, musicTrack: 'none', endsAt: null, visible: false };

/** Tempo restante agora (rodando: `endsAt - agora`; pausado: `remainingMs`). */
export function timerRemaining(t: TimerState | undefined, now = Date.now()): number {
  if (!t) return 0;
  if (t.running && t.endsAt) return Math.max(0, t.endsAt - now);
  return Math.max(0, t.remainingMs);
}

/** Configuração para iniciar uma votação (Chat 04). */
export interface VotingConfig {
  title: string;
  dotsPerUser: number;
  anonymous: boolean;
  allowMultiplePerItem: boolean;
  /** null/0 = sem fim automático */
  durationMs?: number | null;
  /** Enquete (pergunta + respostas). Ausente = votação por pontos. */
  kind?: 'dots' | 'poll';
  pollOptions?: { text: string; sourceId?: string }[];
  pollMultiple?: boolean;
  pollLiveResults?: boolean;
}

/** Totais por resposta de uma enquete. */
export function tallyPoll(responses: Record<string, string[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const uid in responses) for (const id of responses[uid]) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** Pontos já usados por um usuário na votação. */
export function votesUsedBy(v: VotingState | undefined, userId: string): number {
  if (!v?.ballots?.[userId]) return 0;
  return Object.values(v.ballots[userId]).reduce((n, k) => n + k, 0);
}

/** Totais por item a partir das cédulas. */
function tallyBallots(ballots: Record<string, Record<VoteTargetKey, number>>): Record<VoteTargetKey, number> {
  const out: Record<VoteTargetKey, number> = {};
  for (const uid in ballots) for (const key in ballots[uid]) if (ballots[uid][key] > 0) out[key] = (out[key] ?? 0) + ballots[uid][key];
  return out;
}

export interface BoardState {
  boardId: string | null;
  readOnly: boolean;
  motionEnabled: boolean;

  elements: Record<string, CanvasElement>;
  elementOrder: string[];
  selectedIds: string[];
  activeTool: ToolType;
  toolOptions: ToolOptions;
  camera: CameraState;
  viewport: Size;
  gridSettings: GridSettings;
  backgroundColor: string | null;
  initialView: CameraState | null;
  /** Catálogo de tags do board (Chat 02 · Rodada A) */
  boardTags: StickyTag[];
  /* ---------- Governança (Chat 02 · Rodada B) ---------- */
  access: BoardAccess;
  /** null = padrão [ownerId] (owner e admins são facilitadores implícitos) */
  facilitatorIds: string[] | null;
  /** Chat 08: tamanho das pilhas do desfazer por pessoa (os botões de desfazer/refazer leem isto) */
  remoteUndo: number;
  remoteRedo: number;
  setRemoteHistory: (undo: number, redo: number) => void;
  /** Chat 08: "Trazer todos até mim" — a tela de todos passa a seguir a minha (`followMe.lead`) */
  bringEveryone: () => void;
  /** Chat 08: para de conduzir (cada pessoa volta a mexer na própria tela) */
  stopLeading: () => void;
  facilitation: FacilitationState;
  activityLog: BoardActivityEntry[];

  editingId: string | null;
  hoveredId: string | null;
  /** Modo Apresentação ativo (Chat 03 · Rodada B): nenhuma edição passa pelo `ensure` */
  presenting: boolean;
  smartGuides: SmartGuide[];
  marquee: Rect | null;
  interaction: InteractionKind;
  liveLabel: LiveLabel | null;
  spaceHeld: boolean;
  contextMenu: ContextMenuState | null;
  findOpen: boolean;
  lastPointerWorld: Point | null;

  history: { past: HistoryEntry[]; future: HistoryEntry[] };
  clipboard: CanvasElement[] | null;
  copiedStyle: CopiedStyle | null;

  /* ---------- Contrato ARCHITECTURE_MAP §3 ---------- */
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, patch: ElementPatch) => void;
  updateElements: (patches: { id: string; patch: ElementPatch }[]) => void;
  deleteElements: (ids: string[], options?: { recordHistory?: boolean; logActivity?: boolean }) => void;
  setSelectedIds: (ids: string[]) => void;
  setActiveTool: (tool: ToolType) => void;
  setCamera: (camera: Partial<CameraState>) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: (tag?: string) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  duplicateSelected: () => void;

  /* ---------- Extensões Chat 01 ---------- */
  loadBoard: (boardId: string, data: BoardData | null, options?: { readOnly?: boolean }) => void;
  serialize: () => BoardData;
  /**
   * Chat 06 · B: substitui o CONTEÚDO do board pelo de uma versão (elementos, ordem, tags, grade, fundo,
   * visão inicial). Exige `board.restoreSnapshot`; vira 1 passo de desfazer. Activity Log, facilitação e
   * facilitadores NÃO voltam no tempo (são trilha de auditoria e configuração de acesso).
   */
  replaceContent: (data: BoardData) => boolean;
  addElements: (elements: CanvasElement[], options?: { select?: boolean; recordHistory?: boolean }) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  expandGroups: (ids: string[]) => string[];
  deleteSelected: () => void;
  copySelected: () => string | null;
  cutSelected: () => string | null;
  pasteElements: (elements: CanvasElement[], at?: Point | null) => void;
  pasteFromClipboardText: (text: string, at?: Point | null) => boolean;
  cloneInPlace: (ids: string[]) => string[];
  nudgeSelected: (dx: number, dy: number) => void;
  alignSelected: (mode: AlignMode) => void;
  distributeSelected: (axis: 'horizontal' | 'vertical') => void;
  setLocked: (ids: string[], locked: boolean) => void;
  unlockAll: () => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  clearContent: (ids: string[]) => void;
  convertSelected: (target: ConvertTarget) => void;
  setToolOption: <K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => void;
  setGridSettings: (patch: Partial<GridSettings>) => void;
  setBackgroundColor: (color: string | null) => void;
  setInitialView: (view: CameraState | null) => void;
  setViewport: (size: Size) => void;
  setEditingId: (id: string | null) => void;
  setHoveredId: (id: string | null) => void;
  setSmartGuides: (guides: SmartGuide[]) => void;
  setMarquee: (rect: Rect | null) => void;
  setInteraction: (kind: InteractionKind) => void;
  setLiveLabel: (label: LiveLabel | null) => void;
  setSpaceHeld: (held: boolean) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  setFindOpen: (open: boolean) => void;
  setLastPointerWorld: (p: Point | null) => void;
  setMotionEnabled: (enabled: boolean) => void;
  animateCameraTo: (target: CameraState, duration?: number) => void;
  zoomBy: (factor: number, focus?: Point, animate?: boolean) => void;
  setZoom: (zoom: number, focus?: Point, animate?: boolean) => void;
  zoomToFit: (ids?: string[], animate?: boolean) => void;
  zoomToElement: (id: string, animate?: boolean) => void;
  centerOn: (point: Point, animate?: boolean) => void;

  /* ---------- Tags e reações (Chat 02 · Rodada A — ARCHITECTURE_MAP §3) ---------- */
  /** Cria (ou devolve a existente com o mesmo nome) uma tag no catálogo. */
  createBoardTag: (label: string, color?: string) => StickyTag | null;
  /** Renomeia/recolore a tag no catálogo e em todos os post-its que a usam. */
  updateBoardTag: (id: string, patch: Partial<Pick<StickyTag, 'label' | 'color'>>) => void;
  /** Exclui a tag do catálogo e de todos os post-its. */
  deleteBoardTag: (id: string) => void;
  /** Se todos os post-its de `elementIds` têm a tag, remove; senão, adiciona aos que faltam. */
  toggleElementTag: (elementIds: string[], tagId: string) => void;
  /** Alterna a reação `emoji` do usuário no post-it (1 reação por pessoa por emoji). */
  toggleElementReaction: (elementId: string, emoji: string, userId?: string) => void;
  /** Reage em vários post-its com 1 entrada de histórico (todos têm → remove; senão adiciona). */
  toggleReactionOnMany: (elementIds: string[], emoji: string, userId?: string) => void;

  /* ---------- Governança (Chat 02 · Rodada B — ARCHITECTURE_MAP §3 e §5) ---------- */
  setAccess: (access: BoardAccess) => void;
  /** Chat 08: edição ao vivo ligada? (o binding liga e desliga) */
  collab: boolean;
  setCollab: (on: boolean) => void;
  /** Chat 08: registra (ou tira) o desfazer por pessoa do tempo real */
  setHistoryAdapter: (adapter: HistoryAdapter | null) => void;
  /** Chat 08: aplica o que veio da rede (não passa por permissão, desfazer nem Activity Log) */
  applyRemote: (patch: RemotePatch) => void;
  /** Consulta o motor de permissões; se negar, mostra o motivo (toast) e devolve false. */
  ensure: (action: PermissionAction, extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => boolean;
  /** Bloqueio em 3 níveis: 'none' destrava (respeitando o protegido), 'standard', 'protected' (+ estrutura de fundo). */
  setLockMode: (ids: string[], mode: LockMode, userId?: string, isBackgroundFramework?: boolean) => void;
  setPrivateMode: (enabled: boolean) => void;
  togglePreviewAsParticipant: () => void;
  revealPrivateNotes: () => void;
  /** Chat 05.6: a mensagem é chave + parâmetros (`{actor}` é preenchido na tela) */
  recordActivity: (action: BoardActivityAction, message: StoredMessage, meta?: Partial<BoardActivityEntry>) => void;
  clearActivityLog: () => void;
  /**
   * Chat 06: define os facilitadores do board (o titular é sempre facilitador implícito).
   * Exige `board.share`; registra `access_changed` no Activity Log. Salvo pelo autosave (`facilitatorIds`).
   */
  setFacilitators: (userIds: string[]) => void;
  /** Registra "moveu" ao soltar um arrasto (o movimento em si já foi aplicado) e atualiza o frame-pai. */
  commitMove: (ids: string[]) => void;

  /* ---------- Frames e apresentação (Chat 03 · Rodada B — ARCHITECTURE_MAP §3) ---------- */
  /** Recalcula `parentId` (frame que contém o centro) de `ids`; `adoptFrames` adotam elementos soltos dentro deles. Sem histórico próprio. */
  syncFrameMembership: (ids?: string[], adoptFrames?: string[]) => void;
  /** Exclui frames mantendo o conteúdo (solto no board) ou junto com os filhos. Um passo de desfazer. */
  deleteFrames: (frameIds: string[], keepChildren: boolean, alsoDelete?: string[]) => void;
  /** Olhinho: oculta/mostra o conteúdo do frame (facilitador — `frame.toggleHidden`). */
  setFrameHidden: (frameId: string, hidden: boolean) => void;
  /** Reordena os slides: `frameIds` na nova ordem (grava `slideOrder` 0..n-1). */
  setSlideOrder: (frameIds: string[]) => void;
  /** Entra/sai do Modo Apresentação (ferramenta "selecionar", sem seleção nem edição). */
  setPresenting: (on: boolean) => void;

  /* ---------- Comentários (Chat 04) — exigem `board.comment` (comentadores podem) ---------- */
  /** Cria um pin com a 1ª mensagem em `at` (ponta do pin). Devolve o id ou null. */
  addComment: (at: Point, text: string, options?: { targetId?: string | null; mentions?: string[] }) => string | null;
  replyToComment: (id: string, text: string, mentions?: string[]) => void;
  setCommentResolved: (id: string, resolved: boolean) => void;
  /** Exclui a thread (`comment.delete`: autor da thread ou quem edita o board). */
  deleteComment: (id: string) => void;

  /* ---------- Cronômetro (Chat 04) — `timer.manage` (facilitador) ---------- */
  /** Inicia (ou retoma) a contagem. `durationMs` redefine a duração e começa do zero. */
  startTimer: (durationMs?: number) => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  /** Soma tempo (ex.: +1 min) — rodando ou pausado. */
  addTimerTime: (ms: number) => void;
  setTimerMusic: (track: MusicTrack) => void;
  setTimerVisible: (visible: boolean) => void;
  /** Fecha o tempo quando ele acaba (sem checar permissão: consequência do relógio). Devolve true se acabou agora. */
  completeTimer: () => boolean;

  /* ---------- Votação por pontos (Chat 04) ---------- */
  /** `voting.manage` (facilitador). */
  startVoting: (config: VotingConfig) => void;
  /** `voting.cast` (comentador+). Devolve true se o ponto foi registrado. */
  castVote: (key: VoteTargetKey) => boolean;
  /** Remove 1 ponto do próprio usuário no item. */
  retractVote: (key: VoteTargetKey) => boolean;
  /** Enquete: grava (ou troca) as respostas do usuário — `voting.cast`. Lista vazia apaga a resposta. */
  answerPoll: (optionIds: string[]) => boolean;
  /** Encerra e revela o ranking (`voting.manage`). */
  revealVoting: () => void;
  /** Encerra sozinho quando o prazo acaba (sem checar permissão). */
  autoRevealVoting: () => void;
  /** Cancela a votação sem revelar (`voting.manage`). */
  cancelVoting: () => void;
  /** Fecha o painel de resultados e limpa a sessão (`voting.manage`). */
  closeVoting: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Helpers puros                                                             */
/* -------------------------------------------------------------------------- */

/** Mantém `zIndex` = posição em `elementOrder` (somente cria objetos novos quando muda). */
function syncZ(elements: Record<string, CanvasElement>, order: string[]): Record<string, CanvasElement> {
  let changed = false;
  const next: Record<string, CanvasElement> = { ...elements };
  order.forEach((id, index) => {
    const el = next[id];
    if (el && el.zIndex !== index) {
      next[id] = { ...el, zIndex: index } as CanvasElement;
      changed = true;
    }
  });
  return changed ? next : elements;
}

function snapshot(state: Pick<BoardState, 'elements' | 'elementOrder' | 'boardTags'>): HistoryEntry {
  return { elements: state.elements, elementOrder: state.elementOrder, boardTags: state.boardTags };
}

/** Une o catálogo com as tags encontradas nos post-its (boards antigos, colagem de outro board). */
function mergeTagCatalog(catalog: StickyTag[], elements: Iterable<CanvasElement>): StickyTag[] {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  let changed = false;
  for (const el of elements) {
    if (el.type !== 'sticky' || !Array.isArray(el.tags)) continue;
    for (const t of el.tags) {
      if (t && t.id && !byId.has(t.id)) {
        byId.set(t.id, { id: t.id, label: t.label, color: t.color });
        changed = true;
      }
    }
  }
  return changed ? Array.from(byId.values()) : catalog;
}

function ordered(state: Pick<BoardState, 'elements' | 'elementOrder'>, ids: string[]): CanvasElement[] {
  const set = new Set(ids);
  return state.elementOrder.filter((id) => set.has(id)).map((id) => state.elements[id]).filter(Boolean);
}

let lastHistoryTag: { tag: string; at: number } | null = null;

/* -------------------------------------------------------------------------- */
/*  Store                                                                     */
/* -------------------------------------------------------------------------- */

export const useBoardStore = create<BoardState>()((set, get) => {
  const commitHistory = (tag?: string) => {
    if (historyAdapter) {
      historyAdapter.mark();
      return;
    }
    const state = get();
    const t = Date.now();
    if (tag && lastHistoryTag && lastHistoryTag.tag === tag && t - lastHistoryTag.at < 600) {
      lastHistoryTag.at = t;
      return;
    }
    lastHistoryTag = tag ? { tag, at: t } : null;
    const past = [...state.history.past, snapshot(state)];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ history: { past, future: [] } });
  };

  const applyCamera = (camera: CameraState) => set({ camera: { ...camera, zoom: clampZoom(camera.zoom) } });

  /* ---------- Governança: permissões e auditoria (Chat 02 · Rodada B) ---------- */

  /** Toda ação que altera o board passa por aqui: `can()` + motivo do `explain()` em toast. */
  const ensure = (action: PermissionAction, extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>): boolean => {
    if (get().readOnly) return false;
    if (get().presenting && !PRESENTATION_ALLOWED.has(action)) {
      reportDenied(t('board.useBoardStore.leavePresentationModeEditBoard'));
      return false;
    }
    const decision = explain(buildPermissionContext(get(), extra), action);
    if (!decision.allowed && decision.reason) reportDenied(translateMessage(decision.reason));
    return decision.allowed;
  };

  const actor = () => {
    const a = get().access;
    return { actorId: a.userId, actorName: a.userName, actorRole: a.workspaceRole, ...(currentVia ? { viaExtension: { ...currentVia } } : {}) };
  };

  const logActivity = (action: BoardActivityAction, targetType: ActivityTarget, ids: string[], detail?: string) => {
    if (ids.length === 0) return;
    const who = actor();
    set((state) => ({
      activityLog: appendActivity(state.activityLog, {
        ...who,
        action,
        targetType,
        elementIds: ids,
        targetCount: ids.length,
        detail,
        message: elementMessage(action, targetType, ids.length, detail),
      }),
    }));
  };

  const logElements = (action: BoardActivityAction, els: CanvasElement[], detail?: string) => {
    groupByType(els).forEach((ids, type) => logActivity(action, type, ids, detail));
  };

  /** Aplica patches SEM checar permissão (uso interno, depois do `ensure`). */
  const applyPatches = (patches: { id: string; patch: ElementPatch }[]) => {
    if (patches.length === 0) return;
    set((state) => {
      const elements = { ...state.elements };
      const t = Date.now();
      for (const { id, patch } of patches) {
        const el = elements[id];
        if (el) elements[id] = { ...el, ...patch, updatedAt: t } as CanvasElement;
      }
      return { elements: syncConnectors(elements) };
    });
  };

  /** Edições "de conteúdo" (não só reposicionamento) entram no log como "editou". */
  const logContentUpdates = (patches: { id: string; patch: ElementPatch }[]) => {
    const els = get().elements;
    const changed = patches
      .filter(({ patch }) => Object.keys(patch).some((k) => !GEOMETRY_ONLY_KEYS.has(k)))
      .map(({ id }) => els[id])
      .filter((el): el is CanvasElement => !!el);
    if (changed.length) logElements('updated', changed);
  };

  /** Autoria + Modo Privado em toda criação. */
  const stampNew = (els: CanvasElement[]): CanvasElement[] => {
    const a = get().access;
    const privateOn = get().facilitation.privateMode.enabled;
    return els.map(
      (el) =>
        ({
          ...el,
          createdBy: a.userId,
          createdByName: a.userName,
          ...(el.type === 'sticky' ? { authorName: a.userName, ...(privateOn ? { isPrivateDraft: true } : {}) } : {}),
        }) as CanvasElement,
    );
  };

  /** Aplica `computeReparent` sem histórico e sem log (o pai é consequência de mover/criar). */
  const applyMembership = (ids?: string[], adoptFrames: string[] = []) => {
    const { elements, elementOrder } = get();
    const patches = computeReparent(elements, elementOrder, ids, adoptFrames);
    if (patches.length) applyPatches(patches);
  };

  return {
    boardId: null,
    readOnly: false,
    motionEnabled: true,

    elements: {},
    elementOrder: [],
    selectedIds: [],
    activeTool: 'select',
    toolOptions: { ...DEFAULT_TOOL_OPTIONS },
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: { width: typeof window !== 'undefined' ? window.innerWidth : 1280, height: typeof window !== 'undefined' ? window.innerHeight : 800 },
    gridSettings: { ...DEFAULT_GRID },
    backgroundColor: null,
    initialView: null,
    boardTags: [],
    access: DEFAULT_ACCESS,
    facilitatorIds: null,
    remoteUndo: 0,
    remoteRedo: 0,
    bringEveryone: () => {
      if (!ensure('followMe.lead')) return;
      const f = get().facilitation;
      const me = get().access.userId;
      if (f.leaderUserId === me) return;
      set({ facilitation: { ...f, leaderUserId: me } });
      get().recordActivity('follow_me', { key: 'board.activity.followMeStarted' }, { targetType: 'board' });
    },
    stopLeading: () => {
      const f = get().facilitation;
      if (!f.leaderUserId || !ensure('followMe.lead')) return;
      set({ facilitation: { ...f, leaderUserId: null } });
      get().recordActivity('follow_me', { key: 'board.activity.followMeStopped' }, { targetType: 'board' });
    },
    setRemoteHistory: (undo, redo) => {
      if (get().remoteUndo !== undo || get().remoteRedo !== redo) set({ remoteUndo: undo, remoteRedo: redo });
    },
    facilitation: DEFAULT_FACILITATION,
    activityLog: [],

    editingId: null,
    hoveredId: null,
    presenting: false,
    smartGuides: [],
    marquee: null,
    interaction: 'idle',
    liveLabel: null,
    spaceHeld: false,
    contextMenu: null,
    findOpen: false,
    lastPointerWorld: null,

    history: { past: [], future: [] },
    clipboard: null,
    copiedStyle: null,

    /* ---------------- Contrato ---------------- */

    addElement: (element) => {
      get().addElements([element], { select: false });
    },

    addElements: (incoming, options) => {
      if (incoming.length === 0) return;
      if (!ensure('board.edit')) return;
      // frames colados/duplicados ganham uma posição própria na ordem de slides
      const used = new Set(Object.values(get().elements).filter(isFrame).map((f) => f.slideOrder));
      let nextSlide = used.size ? Math.max(...used) + 1 : 0;
      const newElements = stampNew(incoming).map((el) => {
        if (!isFrame(el) || !used.has(el.slideOrder)) {
          if (isFrame(el)) used.add(el.slideOrder);
          return el;
        }
        const fixed = { ...el, slideOrder: nextSlide } as CanvasElement;
        used.add(nextSlide++);
        return fixed;
      });
      if (options?.recordHistory !== false) commitHistory();
      set((state) => {
        const elements = { ...state.elements };
        const elementOrder = [...state.elementOrder];
        for (const el of newElements) {
          elements[el.id] = { ...el, zIndex: elementOrder.length } as CanvasElement;
          if (el.type === 'frame') {
            // Frames ficam no bloco de baixo (atrás do conteúdo e das estruturas de fundo)
            let i = 0;
            while (i < elementOrder.length && isFrame(elements[elementOrder[i]])) i++;
            elementOrder.splice(i, 0, el.id);
          } else if (el.isBackgroundFramework) {
            // Estruturas de fundo (templates do Chat 04): logo acima dos frames e das outras estruturas
            let i = 0;
            while (i < elementOrder.length && (isFrame(elements[elementOrder[i]]) || elements[elementOrder[i]]?.isBackgroundFramework)) i++;
            elementOrder.splice(i, 0, el.id);
          } else {
            elementOrder.push(el.id);
          }
        }
        return {
          elements: syncConnectors(syncZ(elements, elementOrder)),
          elementOrder,
          selectedIds: options?.select ? newElements.filter((e) => e.type !== 'comment').map((e) => e.id) : state.selectedIds,
          boardTags: mergeTagCatalog(state.boardTags, newElements),
        };
      });
      // Parenting: novos objetos entram no frame que os contém; frames novos adotam o que está dentro
      applyMembership(
        newElements.filter((e) => e.type !== 'frame').map((e) => e.id),
        newElements.filter((e) => e.type === 'frame').map((e) => e.id),
      );
      logElements('created', newElements);
    },

    updateElement: (id, patch) => {
      if (!get().elements[id] || !ensure('board.edit')) return;
      applyPatches([{ id, patch }]);
      logContentUpdates([{ id, patch }]);
    },

    updateElements: (patches) => {
      if (patches.length === 0 || !ensure('board.edit')) return;
      applyPatches(patches);
      logContentUpdates(patches);
    },

    deleteElements: (ids, options) => {
      if (ids.length === 0 || !ensure('board.edit')) return;
      const removed = ids.map((id) => get().elements[id]).filter((el): el is CanvasElement => !!el);
      // Chat 06 · B: snapshot de segurança antes de exclusão em massa
      if (removed.length >= BULK_DELETE_THRESHOLD && bulkDeleteHandler && !get().readOnly) bulkDeleteHandler(get().serialize(), removed.length);
      if (options?.recordHistory !== false) commitHistory();
      set((state) => {
        const remove = new Set(ids);
        const elements = { ...state.elements };
        ids.forEach((id) => delete elements[id]);
        const elementOrder = state.elementOrder.filter((id) => !remove.has(id));
        return {
          elements: syncConnectors(syncZ(elements, elementOrder)),
          elementOrder,
          selectedIds: state.selectedIds.filter((id) => !remove.has(id)),
          editingId: state.editingId && remove.has(state.editingId) ? null : state.editingId,
          hoveredId: state.hoveredId && remove.has(state.hoveredId) ? null : state.hoveredId,
        };
      });
      if (options?.logActivity !== false) logElements('deleted', removed);
    },

    setSelectedIds: (ids) => {
      let unique = Array.from(new Set(ids)).filter((id) => !!get().elements[id]);
      if (editGuard) {
        const busy = unique.find((id) => editGuard!(id));
        if (busy) {
          reportDenied(t('collab.inUseBy', { name: editGuard(busy) ?? '' }));
          unique = unique.filter((id) => !editGuard!(id));
        }
      }
      const current = get().selectedIds;
      if (unique.length === current.length && unique.every((id, i) => id === current[i])) return;
      set({ selectedIds: unique });
    },

    setActiveTool: (tool) => {
      if (CREATION_TOOLS.has(tool) && !ensure('board.edit')) return;
      if (tool === 'comment' && !ensure('board.comment')) return;
      set({ activeTool: tool, editingId: null, contextMenu: null });
    },

    setCamera: (camera) => {
      const current = get().camera;
      applyCamera({ ...current, ...camera });
    },

    undo: () => {
      if (!ensure('board.edit')) return;
      if (historyAdapter) {
        historyAdapter.undo();
        return;
      }
      const state = get();
      const past = [...state.history.past];
      const previous = past.pop();
      if (!previous) return;
      const future = [snapshot(state), ...state.history.future];
      set({
        elements: previous.elements,
        elementOrder: previous.elementOrder,
        boardTags: previous.boardTags,
        history: { past, future },
        selectedIds: state.selectedIds.filter((id) => !!previous.elements[id]),
        editingId: null,
      });
      lastHistoryTag = null;
    },

    redo: () => {
      if (!ensure('board.edit')) return;
      if (historyAdapter) {
        historyAdapter.redo();
        return;
      }
      const state = get();
      const [next, ...future] = state.history.future;
      if (!next) return;
      const past = [...state.history.past, snapshot(state)];
      set({
        elements: next.elements,
        elementOrder: next.elementOrder,
        boardTags: next.boardTags,
        history: { past, future },
        selectedIds: state.selectedIds.filter((id) => !!next.elements[id]),
        editingId: null,
      });
      lastHistoryTag = null;
    },

    pushHistory: (tag) => commitHistory(tag),

    bringToFront: (ids) => {
      if (ids.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      set((state) => {
        const move = new Set(ids);
        const elementOrder = [...state.elementOrder.filter((id) => !move.has(id)), ...state.elementOrder.filter((id) => move.has(id))];
        return { elementOrder, elements: syncZ(state.elements, elementOrder) };
      });
    },

    sendToBack: (ids) => {
      if (ids.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      set((state) => {
        const move = new Set(ids);
        const elementOrder = [...state.elementOrder.filter((id) => move.has(id)), ...state.elementOrder.filter((id) => !move.has(id))];
        return { elementOrder, elements: syncZ(state.elements, elementOrder) };
      });
    },

    bringForward: (ids) => {
      if (ids.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      set((state) => {
        const move = new Set(ids);
        const order = [...state.elementOrder];
        for (let i = order.length - 2; i >= 0; i--) {
          if (move.has(order[i]) && !move.has(order[i + 1])) {
            [order[i], order[i + 1]] = [order[i + 1], order[i]];
          }
        }
        return { elementOrder: order, elements: syncZ(state.elements, order) };
      });
    },

    sendBackward: (ids) => {
      if (ids.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      set((state) => {
        const move = new Set(ids);
        const order = [...state.elementOrder];
        for (let i = 1; i < order.length; i++) {
          if (move.has(order[i]) && !move.has(order[i - 1])) {
            [order[i], order[i - 1]] = [order[i - 1], order[i]];
          }
        }
        return { elementOrder: order, elements: syncZ(state.elements, order) };
      });
    },

    groupSelected: () => {
      const { selectedIds } = get();
      if (selectedIds.length < 2 || !ensure('board.edit')) return;
      commitHistory();
      const groupId = createId();
      get().updateElements(selectedIds.map((id) => ({ id, patch: { groupId } })));
    },

    ungroupSelected: () => {
      const { selectedIds, elements } = get();
      const grouped = selectedIds.filter((id) => elements[id]?.groupId);
      if (grouped.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      get().updateElements(grouped.map((id) => ({ id, patch: { groupId: null } })));
    },

    duplicateSelected: () => {
      const state = get();
      // duplicar um frame duplica o conteúdo dele junto
      const withChildren = new Set(state.selectedIds);
      for (const id of state.selectedIds) {
        if (!isFrame(state.elements[id])) continue;
        for (const cid in state.elements) if (state.elements[cid].parentId === id) withChildren.add(cid);
      }
      const source = ordered(state, Array.from(withChildren));
      if (source.length === 0) return;
      const bounds = getBoundsOfElements(source);
      const offsetX = bounds ? bounds.width + 24 : 24;
      const clones = cloneElements(source, { x: offsetX, y: 0 }).map(
        (c) => ({ ...c, locked: false, lockMode: 'none', lockedBy: null, isBackgroundFramework: false }) as CanvasElement,
      );
      state.addElements(clones, { select: true });
    },

    /* ---------------- Extensões ---------------- */

    loadBoard: (boardId, data, options) => {
      cancelCameraAnimation();
      const elements = data?.elements ?? {};
      const elementOrder = (data?.elementOrder ?? []).filter((id) => !!elements[id]);
      const viewport = get().viewport;
      let camera: CameraState = { x: viewport.width / 2, y: viewport.height / 2, zoom: 1 };
      if (data?.initialView) {
        camera = data.initialView;
      } else {
        const bounds = getBoundsOfElements(elementOrder.map((id) => elements[id]));
        if (bounds) camera = fitRectInViewport(bounds, viewport, 96, 1);
      }
      lastHistoryTag = null;
      set({
        boardId,
        readOnly: !!options?.readOnly,
        elements: syncConnectors(syncZ(elements, elementOrder)),
        elementOrder,
        selectedIds: [],
        activeTool: 'select',
        camera,
        gridSettings: { ...DEFAULT_GRID, ...(data?.gridSettings ?? {}) },
        backgroundColor: data?.backgroundColor ?? null,
        initialView: data?.initialView ?? null,
        boardTags: mergeTagCatalog(Array.isArray(data?.boardTags) ? data.boardTags : [], Object.values(elements)),
        facilitatorIds: Array.isArray(data?.facilitatorIds) ? data.facilitatorIds : null,
        remoteUndo: 0,
        remoteRedo: 0,
        facilitation: {
          ...DEFAULT_FACILITATION,
          ...(data?.facilitation ?? {}),
          privateMode: { ...DEFAULT_FACILITATION.privateMode, ...(data?.facilitation?.privateMode ?? {}) },
        },
        activityLog: Array.isArray(data?.activityLog) ? data.activityLog : [],
        editingId: null,
        hoveredId: null,
        presenting: false,
        smartGuides: [],
        marquee: null,
        interaction: 'idle',
        liveLabel: null,
        contextMenu: null,
        findOpen: false,
        history: { past: [], future: [] },
      });
    },

    serialize: () => {
      const s = get();
      return {
        version: 1,
        elements: s.elements,
        elementOrder: s.elementOrder,
        gridSettings: s.gridSettings,
        backgroundColor: s.backgroundColor,
        initialView: s.initialView,
        boardTags: s.boardTags,
        activityLog: s.activityLog,
        facilitation: s.facilitation,
        facilitatorIds: s.facilitatorIds ?? [s.access.ownerId],
      };
    },

    replaceContent: (data) => {
      if (!ensure('board.restoreSnapshot')) return false;
      commitHistory();
      const elements = data.elements ?? {};
      const elementOrder = (data.elementOrder ?? []).filter((id) => !!elements[id]);
      set({
        elements: syncConnectors(syncZ(elements, elementOrder)),
        elementOrder,
        boardTags: mergeTagCatalog(Array.isArray(data.boardTags) ? data.boardTags : [], Object.values(elements)),
        gridSettings: { ...DEFAULT_GRID, ...(data.gridSettings ?? {}) },
        backgroundColor: data.backgroundColor ?? null,
        initialView: data.initialView ?? null,
        selectedIds: [],
        editingId: null,
        hoveredId: null,
        contextMenu: null,
      });
      return true;
    },

    selectAll: () =>
      set((state) => ({
        // conteúdo oculto por frames não entra na seleção
        // pins de comentário também ficam de fora (Chat 04: Ctrl+A + Delete não apaga conversas)
        selectedIds: state.elementOrder.filter((id) => state.elements[id] && state.elements[id].type !== 'comment' && !isHiddenByFrame(state.elements[id], (x) => state.elements[x]) && !editGuard?.(id)),
        editingId: null,
      })),

    clearSelection: () => {
      if (get().selectedIds.length === 0 && !get().editingId) return;
      set({ selectedIds: [], editingId: null });
    },

    expandGroups: (ids) => {
      const { elements, elementOrder } = get();
      const groups = new Set(ids.map((id) => elements[id]?.groupId).filter((g): g is string => !!g));
      if (groups.size === 0) return ids;
      const extra = elementOrder.filter((id) => {
        const g = elements[id]?.groupId;
        return !!g && groups.has(g);
      });
      return Array.from(new Set([...ids, ...extra]));
    },

    deleteSelected: () => {
      const { selectedIds, elements } = get();
      const deletable = selectedIds.filter((id) => elements[id] && !elements[id].locked);
      get().deleteElements(deletable);
    },

    copySelected: () => {
      const state = get();
      const source = ordered(state, state.selectedIds);
      if (source.length === 0) return null;
      const copies = JSON.parse(JSON.stringify(source)) as CanvasElement[];
      set({ clipboard: copies });
      return `${CLIPBOARD_MIME_MARKER}\n${JSON.stringify(copies)}`;
    },

    cutSelected: () => {
      const payload = get().copySelected();
      if (payload) get().deleteSelected();
      return payload;
    },

    pasteElements: (source, at) => {
      if (source.length === 0) return;
      const bounds = getBoundsOfElements(source);
      let offset: Point = { x: 24, y: 24 };
      if (at && bounds) {
        const c = rectCenter(bounds);
        offset = { x: at.x - c.x, y: at.y - c.y };
      }
      const clones = cloneElements(source, offset);
      get().addElements(clones, { select: true });
      set({ clipboard: clones.map((c) => JSON.parse(JSON.stringify(c)) as CanvasElement) });
    },

    pasteFromClipboardText: (text, at) => {
      if (!text.startsWith(CLIPBOARD_MIME_MARKER)) return false;
      try {
        const parsed = JSON.parse(text.slice(CLIPBOARD_MIME_MARKER.length + 1)) as CanvasElement[];
        if (!Array.isArray(parsed)) return false;
        get().pasteElements(parsed, at);
        return true;
      } catch {
        return false;
      }
    },

    cloneInPlace: (ids) => {
      if (!ensure('board.edit')) return [];
      const state = get();
      const source = ordered(state, ids);
      const clones = stampNew(
        cloneElements(source).map((c) => ({ ...c, locked: false, lockMode: 'none', lockedBy: null, isBackgroundFramework: false }) as CanvasElement),
      );
      set((s) => {
        const elements = { ...s.elements };
        const elementOrder = [...s.elementOrder];
        for (const el of clones) {
          elements[el.id] = { ...el, zIndex: elementOrder.length } as CanvasElement;
          if (el.type === 'frame') {
            // cópia de frame também vai para o bloco de baixo (atrás do conteúdo)
            let i = 0;
            while (i < elementOrder.length && isFrame(elements[elementOrder[i]])) i++;
            elementOrder.splice(i, 0, el.id);
          } else {
            elementOrder.push(el.id);
          }
        }
        return { elements: syncConnectors(syncZ(elements, elementOrder)), elementOrder, selectedIds: clones.map((c) => c.id) };
      });
      logElements('created', clones);
      return clones.map((c) => c.id);
    },

    nudgeSelected: (dx, dy) => {
      const { selectedIds, elements } = get();
      const chosen = new Set(selectedIds.filter((id) => elements[id] && !elements[id].locked));
      // setas num frame movem o conteúdo junto (Chat 03 · Rodada B)
      for (const id of Array.from(chosen)) {
        if (!isFrame(elements[id])) continue;
        for (const cid in elements) if (elements[cid].parentId === id && !elements[cid].locked) chosen.add(cid);
      }
      const movable = Array.from(chosen);
      if (movable.length === 0 || !ensure('board.edit')) return;
      commitHistory('nudge');
      get().updateElements(movable.map((id) => ({ id, patch: { x: elements[id].x + dx, y: elements[id].y + dy } })));
      logElements('moved', movable.map((id) => get().elements[id]).filter(Boolean));
      applyMembership(
        movable.filter((id) => !isFrame(get().elements[id])),
        movable.filter((id) => isFrame(get().elements[id])),
      );
    },

    alignSelected: (mode) => {
      const state = get();
      const els = ordered(state, state.selectedIds).filter((e) => !e.locked);
      if (els.length < 2 || !ensure('board.edit')) return;
      const box = getBoundsOfElements(els);
      if (!box) return;
      commitHistory();
      logElements('moved', els);
      state.updateElements(
        els.map((el) => {
          const b = getElementBounds(el);
          let dx = 0;
          let dy = 0;
          if (mode === 'left') dx = box.x - b.x;
          if (mode === 'center') dx = box.x + box.width / 2 - (b.x + b.width / 2);
          if (mode === 'right') dx = box.x + box.width - (b.x + b.width);
          if (mode === 'top') dy = box.y - b.y;
          if (mode === 'middle') dy = box.y + box.height / 2 - (b.y + b.height / 2);
          if (mode === 'bottom') dy = box.y + box.height - (b.y + b.height);
          return { id: el.id, patch: { x: el.x + dx, y: el.y + dy } };
        }),
      );
    },

    distributeSelected: (axis) => {
      const state = get();
      const els = ordered(state, state.selectedIds).filter((e) => !e.locked);
      if (els.length < 3 || !ensure('board.edit')) return;
      commitHistory();
      logElements('moved', els);
      const withBounds = els.map((el) => ({ el, b: getElementBounds(el) }));
      if (axis === 'horizontal') {
        withBounds.sort((a, b) => a.b.x - b.b.x);
        const first = withBounds[0].b;
        const last = withBounds[withBounds.length - 1].b;
        const total = withBounds.reduce((acc, w) => acc + w.b.width, 0);
        const gap = (last.x + last.width - first.x - total) / (withBounds.length - 1);
        let cursor = first.x;
        state.updateElements(
          withBounds.map(({ el, b }) => {
            const patch = { x: el.x + (cursor - b.x) };
            cursor += b.width + gap;
            return { id: el.id, patch };
          }),
        );
      } else {
        withBounds.sort((a, b) => a.b.y - b.b.y);
        const first = withBounds[0].b;
        const last = withBounds[withBounds.length - 1].b;
        const total = withBounds.reduce((acc, w) => acc + w.b.height, 0);
        const gap = (last.y + last.height - first.y - total) / (withBounds.length - 1);
        let cursor = first.y;
        state.updateElements(
          withBounds.map(({ el, b }) => {
            const patch = { y: el.y + (cursor - b.y) };
            cursor += b.height + gap;
            return { id: el.id, patch };
          }),
        );
      }
    },

    /** Atalho do Chat 01 (Ctrl+Shift+L, cadeado simples): bloqueio padrão ↔ destravar. */
    setLocked: (ids, locked) => get().setLockMode(ids, locked ? 'standard' : 'none'),

    unlockAll: () => {
      const { elements } = get();
      const locked = Object.values(elements).filter((e) => e.locked || effectiveLockMode(e) !== 'none').map((e) => e.id);
      if (locked.length === 0) return;
      get().setLockMode(locked, 'none');
    },

    copyStyle: () => {
      const { selectedIds, elements } = get();
      const el = elements[selectedIds[0]];
      if (!el) return;
      set({ copiedStyle: extractStyle(el) });
    },

    pasteStyle: () => {
      const { selectedIds, elements, copiedStyle } = get();
      if (!copiedStyle || selectedIds.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      get().updateElements(
        selectedIds
          .map((id) => elements[id])
          .filter((el): el is CanvasElement => !!el && !el.locked)
          .map((el) => ({ id: el.id, patch: styleToPatch(copiedStyle, el) })),
      );
    },

    clearContent: (ids) => {
      const { elements } = get();
      const targets = ids.map((id) => elements[id]).filter((el): el is TextualElement => isTextualElement(el) && !el.locked);
      if (targets.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      get().updateElements(targets.map((el) => ({ id: el.id, patch: { text: '' } })));
    },

    convertSelected: (target) => {
      const { selectedIds, elements } = get();
      const targets = selectedIds.map((id) => elements[id]).filter((el): el is TextualElement => isTextualElement(el) && !el.locked);
      if (targets.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      logElements('updated', targets);
      set((state) => {
        const next = { ...state.elements };
        for (const el of targets) {
          next[el.id] = { ...convertElement(el, target), zIndex: el.zIndex, updatedAt: Date.now() } as CanvasElement;
        }
        return { elements: syncConnectors(next) };
      });
    },

    setToolOption: (key, value) => set((state) => ({ toolOptions: { ...state.toolOptions, [key]: value } })),

    setGridSettings: (patch) => {
      if (!ensure('board.edit')) return;
      set((state) => ({ gridSettings: { ...state.gridSettings, ...patch } }));
    },

    setBackgroundColor: (color) => {
      if (!ensure('board.edit')) return;
      set({ backgroundColor: color });
    },

    setInitialView: (view) => {
      if (!ensure('board.edit')) return;
      set({ initialView: view });
    },

    setViewport: (size) => {
      const v = get().viewport;
      if (v.width === size.width && v.height === size.height) return;
      set({ viewport: size });
    },

    setEditingId: (id) => {
      const state = get();
      const previous = state.editingId;
      if (previous === id) return;
      if (id) {
        const el = state.elements[id];
        if (!el || el.locked || state.readOnly) return;
        const busy = editGuard?.(id);
        if (busy) {
          reportDenied(t('collab.inUseBy', { name: busy }));
          return;
        }
        if (!ensure('board.edit')) return;
        if (el.type === 'sticky' && isPrivateDraftHidden(el, state.access.userId, state.facilitation.privateMode.previewOwnNotes)) {
          reportDenied(t('board.useBoardStore.thisNoteHiddenPrivateMode'));
          return;
        }
        commitHistory();
        set({ editingId: id, selectedIds: [id] });
      } else {
        set({ editingId: null });
      }
      // Texto solto vazio é removido ao sair da edição (não deixa caixas invisíveis no board).
      if (previous && previous !== id) {
        const prevEl = get().elements[previous];
        if (prevEl && prevEl.type === 'text' && prevEl.text.trim() === '') {
          get().deleteElements([previous], { recordHistory: false, logActivity: false });
        }
      }
    },

    setHoveredId: (id) => {
      if (get().hoveredId !== id) set({ hoveredId: id });
    },

    setSmartGuides: (guides) => {
      if (guides.length === 0 && get().smartGuides.length === 0) return;
      set({ smartGuides: guides });
    },

    setMarquee: (rect) => set({ marquee: rect }),

    setInteraction: (kind) => {
      if (get().interaction !== kind) set({ interaction: kind });
    },

    setLiveLabel: (label) => set({ liveLabel: label }),

    setSpaceHeld: (held) => {
      if (get().spaceHeld !== held) set({ spaceHeld: held });
    },

    setContextMenu: (menu) => set({ contextMenu: menu }),

    setFindOpen: (open) => set({ findOpen: open }),

    setLastPointerWorld: (p) => set({ lastPointerWorld: p }),

    setMotionEnabled: (enabled) => set({ motionEnabled: enabled }),

    animateCameraTo: (target, duration = 340) => {
      const { camera, motionEnabled } = get();
      const to = { ...target, zoom: clampZoom(target.zoom) };
      animateCamera(camera, to, applyCamera, motionEnabled ? duration : 0);
    },

    zoomBy: (factor, focus, animate = true) => {
      const { camera } = get();
      get().setZoom(camera.zoom * factor, focus, animate);
    },

    setZoom: (zoom, focus, animate = true) => {
      const { camera, viewport } = get();
      const f = focus ?? { x: viewport.width / 2, y: viewport.height / 2 };
      const target = zoomAtPoint(camera, zoom, f);
      if (animate) get().animateCameraTo(target, 220);
      else {
        cancelCameraAnimation();
        applyCamera(target);
      }
    },

    zoomToFit: (ids, animate = true) => {
      const { elements, elementOrder, viewport } = get();
      const list = (ids && ids.length > 0 ? ids : elementOrder).map((id) => elements[id]).filter(Boolean);
      const bounds = getBoundsOfElements(list);
      const target = bounds
        ? fitRectInViewport(bounds, viewport, ids && ids.length > 0 ? 140 : 90, ids && ids.length > 0 ? 2 : 1)
        : centerCameraOn({ x: 0, y: 0 }, viewport, 1);
      if (animate) get().animateCameraTo(target);
      else applyCamera(target);
    },

    zoomToElement: (id, animate = true) => {
      if (!get().elements[id]) return;
      get().zoomToFit([id], animate);
    },

    centerOn: (point, animate = true) => {
      const { viewport, camera } = get();
      const target = centerCameraOn(point, viewport, camera.zoom);
      if (animate) get().animateCameraTo(target, 260);
      else applyCamera(target);
    },

    /* ---------------- Tags e reações (Chat 02 · Rodada A) ---------------- */

    createBoardTag: (label, color) => {
      const clean = label.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!clean || !ensure('board.edit')) return null;
      const existing = get().boardTags.find((t) => t.label.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'));
      if (existing) return existing;
      const tag: StickyTag = { id: createId(8), label: clean, color: color ?? nextTagColor(get().boardTags) };
      commitHistory();
      set((state) => ({ boardTags: [...state.boardTags, tag] }));
      return tag;
    },

    updateBoardTag: (id, patch) => {
      const current = get().boardTags.find((t) => t.id === id);
      if (!current || !ensure('board.edit')) return;
      const label = patch.label !== undefined ? patch.label.trim().replace(/\s+/g, ' ').slice(0, 40) : current.label;
      if (!label) return;
      const next: StickyTag = { ...current, label, color: patch.color ?? current.color };
      if (next.label === current.label && next.color === current.color) return;
      commitHistory(`tag:${id}`);
      set((state) => {
        const elements = { ...state.elements };
        const t = Date.now();
        for (const elId of state.elementOrder) {
          const el = elements[elId];
          if (el?.type === 'sticky' && el.tags?.some((tg) => tg.id === id)) {
            elements[elId] = { ...el, tags: el.tags.map((tg) => (tg.id === id ? next : tg)), updatedAt: t };
          }
        }
        return { boardTags: state.boardTags.map((tg) => (tg.id === id ? next : tg)), elements };
      });
    },

    deleteBoardTag: (id) => {
      if (!get().boardTags.some((t) => t.id === id) || !ensure('board.edit')) return;
      commitHistory();
      set((state) => {
        const elements = { ...state.elements };
        const t = Date.now();
        for (const elId of state.elementOrder) {
          const el = elements[elId];
          if (el?.type === 'sticky' && el.tags?.some((tg) => tg.id === id)) {
            elements[elId] = { ...el, tags: el.tags.filter((tg) => tg.id !== id), updatedAt: t };
          }
        }
        return { boardTags: state.boardTags.filter((tg) => tg.id !== id), elements };
      });
    },

    toggleElementTag: (elementIds, tagId) => {
      const state = get();
      const tag = state.boardTags.find((t) => t.id === tagId);
      if (!tag) return;
      const stickies = elementIds.map((id) => state.elements[id]).filter((el): el is StickyNoteElement => el?.type === 'sticky' && !el.locked);
      if (stickies.length === 0) return;
      const allHave = stickies.every((el) => el.tags?.some((t) => t.id === tagId));
      if (!ensure('board.edit')) return;
      commitHistory();
      get().updateElements(
        stickies.map((el) => ({
          id: el.id,
          patch: { tags: allHave ? (el.tags ?? []).filter((t) => t.id !== tagId) : el.tags?.some((t) => t.id === tagId) ? el.tags : [...(el.tags ?? []), tag] },
        })),
      );
    },

    toggleElementReaction: (elementId, emoji, userId) => {
      const el = get().elements[elementId];
      if (!el || el.type !== 'sticky' || !ensure('board.comment')) return;
      commitHistory(); // cada reação é um passo próprio no desfazer
      applyPatches([{ id: elementId, patch: toggleReactionPatch(el, emoji, userId ?? get().access.userId) }]);
    },

    toggleReactionOnMany: (elementIds, emoji, userId) => {
      const uid = userId ?? get().access.userId;
      const els = get().elements;
      const stickies = elementIds.map((id) => els[id]).filter((el): el is StickyNoteElement => el?.type === 'sticky');
      if (stickies.length === 0 || !ensure('board.comment')) return;
      const add = !stickies.every((el) => !!el.reactedBy?.[emoji]?.includes(uid));
      const patches = stickies.filter((el) => !!el.reactedBy?.[emoji]?.includes(uid) !== add).map((el) => ({ id: el.id, patch: toggleReactionPatch(el, emoji, uid) }));
      if (patches.length === 0) return;
      commitHistory();
      applyPatches(patches);
    },

    /* ---------------- Governança (Chat 02 · Rodada B) ---------------- */

    collab: false,
    setCollab: (on) => {
      if (get().collab !== on) set({ collab: on });
    },
    setHistoryAdapter: (adapter) => {
      historyAdapter = adapter;
      lastHistoryTag = null;
      if (adapter) set({ history: { past: [], future: [] } });
    },
    applyRemote: (patch) => {
      set((state) => {
        const next: Partial<BoardState> = {};
        let elements = state.elements;
        let order = patch.order ?? state.elementOrder;
        if (patch.upsert?.length || patch.remove?.length) {
          elements = { ...state.elements };
          for (const el of patch.upsert ?? []) elements[el.id] = { ...el, zIndex: state.elements[el.id]?.zIndex ?? 0 } as CanvasElement;
          for (const id of patch.remove ?? []) delete elements[id];
        }
        if (elements !== state.elements || patch.order) {
          order = order.filter((id, i, arr) => !!elements[id] && arr.indexOf(id) === i);
          for (const id of Object.keys(elements)) if (!order.includes(id)) order.push(id);
          next.elements = syncConnectors(syncZ(elements, order));
          next.elementOrder = order;
          if (state.selectedIds.some((id) => !elements[id])) next.selectedIds = state.selectedIds.filter((id) => !!elements[id]);
          if (state.editingId && !elements[state.editingId]) next.editingId = null;
        }
        if (patch.gridSettings) next.gridSettings = { ...DEFAULT_GRID, ...patch.gridSettings };
        if (patch.backgroundColor !== undefined) next.backgroundColor = patch.backgroundColor;
        if (patch.initialView !== undefined) next.initialView = patch.initialView;
        if (patch.boardTags) next.boardTags = patch.boardTags;
        if (patch.facilitatorIds !== undefined) next.facilitatorIds = patch.facilitatorIds;
        if (patch.activityLog) next.activityLog = patch.activityLog;
        if (patch.facilitation) {
          const f = state.facilitation;
          const merged: FacilitationState = { ...f, ...patch.facilitation, privateMode: { ...f.privateMode, ...(patch.facilitation.privateMode ?? {}), previewOwnNotes: f.privateMode.previewOwnNotes } };
          if (!('timer' in patch.facilitation)) merged.timer = f.timer;
          next.facilitation = merged;
        }
        return next;
      });
    },

    setAccess: (access) => {
      const cur = get().access;
      const same =
        cur.userId === access.userId &&
        cur.userName === access.userName &&
        cur.workspaceRole === access.workspaceRole &&
        cur.boardRole === access.boardRole &&
        cur.shareAccessLevel === access.shareAccessLevel &&
        cur.isBoardOwner === access.isBoardOwner &&
        cur.ownerId === access.ownerId &&
        cur.allowDownload === access.allowDownload &&
        cur.policies === access.policies &&
        cur.boardAccess === access.boardAccess &&
        cur.isolated === access.isolated &&
        cur.viewAs === access.viewAs;
      if (same) return;
      const leaveEdit = get().editingId && access.viewAs !== cur.viewAs;
      set({ access, ...(leaveEdit ? { editingId: null } : {}) });
      // Perdeu a permissão de edição (ex.: "Visualizar como visitante"): volta para Selecionar
      if (CREATION_TOOLS.has(get().activeTool) && !explain(buildPermissionContext(get()), 'board.edit').allowed) set({ activeTool: 'select' });
    },

    ensure: (action, extra) => ensure(action, extra),

    setLockMode: (ids, mode, userId, isBackgroundFramework) => {
      const state = get();
      const els = ids.map((id) => state.elements[id]).filter((el): el is CanvasElement => !!el);
      if (els.length === 0 || state.readOnly) return;
      if (mode === 'none') {
        const targets = els.filter((el) => effectiveLockMode(el) !== 'none' || el.isBackgroundFramework);
        const allowed: CanvasElement[] = [];
        let reason: string | undefined;
        for (const el of targets) {
          const d = explain(buildPermissionContext(state, { lockedBy: el.lockedBy ?? null }), unlockActionFor(el));
          if (d.allowed) allowed.push(el);
          else reason = d.reason ? translateMessage(d.reason) : reason;
        }
        if (reason) reportDenied(reason);
        if (allowed.length === 0) return;
        commitHistory();
        applyPatches(allowed.map((el) => ({ id: el.id, patch: { locked: false, lockMode: 'none', lockedBy: null, isBackgroundFramework: false } })));
        logElements('unlocked', allowed);
        return;
      }
      if (!ensure(mode === 'protected' ? 'element.lockProtected' : 'element.lockStandard')) return;
      const by = userId ?? state.access.userId;
      const framework = !!isBackgroundFramework;
      commitHistory();
      applyPatches(els.map((el) => ({ id: el.id, patch: { locked: true, lockMode: mode, lockedBy: by, isBackgroundFramework: framework } })));
      if (framework) {
        // Estrutura de fundo vai para trás das notas
        set((s2) => {
          const move = new Set(els.map((e) => e.id));
          const elementOrder = [...s2.elementOrder.filter((id) => move.has(id)), ...s2.elementOrder.filter((id) => !move.has(id))];
          return { elementOrder, elements: syncZ(s2.elements, elementOrder) };
        });
      }
      if (ids.includes(get().editingId ?? '')) set({ editingId: null });
      const detail = framework ? (mode === 'protected' ? ACTIVITY_DETAIL.backgroundProtected : ACTIVITY_DETAIL.background) : mode === 'protected' ? ACTIVITY_DETAIL.protectedLock : undefined;
      logElements('locked', els, detail);
    },

    setPrivateMode: (enabled) => {
      const f = get().facilitation;
      if (f.privateMode.enabled === enabled || !ensure('privateMode.toggle')) return;
      const who = actor();
      set({
        facilitation: {
          ...f,
          privateMode: {
            enabled,
            startedBy: enabled ? who.actorId : f.privateMode.startedBy,
            startedAt: enabled ? Date.now() : f.privateMode.startedAt,
            previewOwnNotes: enabled ? f.privateMode.previewOwnNotes : false,
          },
        },
      });
      get().recordActivity(
        'private_mode_toggled',
        { key: enabled ? 'board.activity.privateModeOn' : 'board.activity.privateModeOffKept' },
        { targetType: 'board' },
      );
    },

    togglePreviewAsParticipant: () => {
      const f = get().facilitation;
      set({ facilitation: { ...f, privateMode: { ...f.privateMode, previewOwnNotes: !f.privateMode.previewOwnNotes } } });
    },

    revealPrivateNotes: () => {
      if (!ensure('privateMode.reveal')) return;
      const state = get();
      const drafts = state.elementOrder.map((id) => state.elements[id]).filter((el): el is StickyNoteElement => el?.type === 'sticky' && !!el.isPrivateDraft);
      if (drafts.length) {
        commitHistory();
        applyPatches(drafts.map((el) => ({ id: el.id, patch: { isPrivateDraft: false } })));
      }
      const f = get().facilitation;
      set({ facilitation: { ...f, privateMode: { ...f.privateMode, enabled: false, previewOwnNotes: false } } });
      get().recordActivity(
        'private_notes_revealed',
        { key: 'board.activity.privateNotesRevealed', params: { count: drafts.length } },
        { targetType: 'sticky', targetCount: drafts.length, elementIds: drafts.slice(0, 20).map((d) => d.id) },
      );
    },

    recordActivity: (action, message, meta) => {
      const who = actor();
      set((state) => ({
        activityLog: appendActivity(state.activityLog, {
          ...who,
          action,
          message,
          targetType: meta?.targetType,
          targetCount: meta?.targetCount,
          elementIds: meta?.elementIds,
          detail: meta?.detail,
        }),
      }));
    },

    clearActivityLog: () => {
      if (!ensure('board.clearActivityLog')) return;
      set({ activityLog: [] });
    },

    setFacilitators: (userIds) => {
      if (!ensure('board.share')) return;
      const owner = get().access.ownerId;
      const extra = [...new Set(userIds)].filter((id) => id !== owner);
      const current = (get().facilitatorIds ?? [owner]).filter((id) => id !== owner);
      if (extra.length === current.length && extra.every((id) => current.includes(id))) return;
      set({ facilitatorIds: [owner, ...extra] });
      get().recordActivity(
        'access_changed',
        extra.length ? { key: 'board.activity.facilitatorsChanged', params: { count: extra.length } } : { key: 'board.activity.facilitatorsCleared' },
        { targetType: 'board' },
      );
    },

    commitMove: (ids) => {
      const els = ids.map((id) => get().elements[id]).filter((el): el is CanvasElement => !!el);
      logElements('moved', els);
      // Soltou dentro/fora de um frame → atualiza o pai; frame movido adota o que ficou dentro dele
      applyMembership(
        els.filter((e) => e.type !== 'frame').map((e) => e.id),
        els.filter((e) => e.type === 'frame').map((e) => e.id),
      );
    },

    /* ---------------- Frames e apresentação (Chat 03 · Rodada B) ---------------- */

    syncFrameMembership: (ids, adoptFrames) => {
      if (get().readOnly) return;
      applyMembership(ids, adoptFrames ?? []);
    },

    deleteFrames: (frameIds, keepChildren, alsoDelete = []) => {
      const { elements } = get();
      const frames = frameIds.filter((id) => isFrame(elements[id]) && !elements[id].locked);
      if (frames.length === 0 || !ensure('board.edit')) return;
      const frameSet = new Set(frames);
      const children = Object.values(elements).filter((el) => el.parentId && frameSet.has(el.parentId));
      commitHistory();
      const extra = alsoDelete.filter((id) => elements[id] && !elements[id].locked && !frameSet.has(id));
      if (keepChildren) {
        applyPatches(children.filter((c) => !extra.includes(c.id)).map((c) => ({ id: c.id, patch: { parentId: null } })));
        get().deleteElements([...frames, ...extra], { recordHistory: false });
      } else {
        const removable = children.filter((c) => !c.locked).map((c) => c.id);
        get().deleteElements(Array.from(new Set([...frames, ...removable, ...extra])), { recordHistory: false });
        // filhos travados não são excluídos: ficam soltos no board
        applyPatches(children.filter((c) => c.locked).map((c) => ({ id: c.id, patch: { parentId: null } })));
      }
    },

    setFrameHidden: (frameId, hidden) => {
      const el = get().elements[frameId];
      if (!isFrame(el) || !!el.hiddenContent === hidden || !ensure('frame.toggleHidden')) return;
      commitHistory();
      applyPatches([{ id: frameId, patch: { hiddenContent: hidden } }]);
      // se algo oculto estava selecionado/em edição, sai da seleção
      if (hidden) {
        const state = get();
        const visible = state.selectedIds.filter((id) => state.elements[id] && !isHiddenByFrame(state.elements[id], (x) => state.elements[x]));
        if (visible.length !== state.selectedIds.length) set({ selectedIds: visible, editingId: null });
      }
      logActivity('updated', 'frame', [frameId], hidden ? ACTIVITY_DETAIL.contentHidden : ACTIVITY_DETAIL.contentShown);
    },

    setSlideOrder: (frameIds) => {
      const { elements } = get();
      const patches = frameIds
        .map((id, i) => ({ id, i, el: elements[id] }))
        .filter((x) => isFrame(x.el) && x.el.slideOrder !== x.i)
        .map((x) => ({ id: x.id, patch: { slideOrder: x.i } }));
      if (patches.length === 0 || !ensure('board.edit')) return;
      commitHistory();
      applyPatches(patches);
      logActivity('updated', 'frame', patches.map((p) => p.id), ACTIVITY_DETAIL.slideOrder);
    },

    setPresenting: (on) => {
      if (get().presenting === on) return;
      set({ presenting: on, activeTool: 'select', selectedIds: [], editingId: null, contextMenu: null, hoveredId: null });
    },

    /* ---------------- Comentários (Chat 04) ---------------- */

    addComment: (at, text, options) => {
      const clean = text.trim();
      if (!clean || !ensure('board.comment')) return null;
      const a = get().access;
      const message: CommentMessage = { id: createId(8), author: a.userName, authorId: a.userId, text: clean, createdAt: Date.now(), ...(options?.mentions?.length ? { mentions: options.mentions } : {}) };
      const pin = { ...createComment(at, message, options?.targetId ?? null), createdBy: a.userId, createdByName: a.userName } as CommentElement;
      commitHistory();
      set((state) => {
        const elements = { ...state.elements, [pin.id]: { ...pin, zIndex: state.elementOrder.length } as CanvasElement };
        const elementOrder = [...state.elementOrder, pin.id];
        return { elements, elementOrder };
      });
      applyMembership([pin.id]);
      get().recordActivity('commented', { key: 'board.activity.commented', params: { excerpt: clean.length > 48 ? `${clean.slice(0, 47)}…` : clean } }, { targetType: 'comment', targetCount: 1, elementIds: [pin.id] });
      return pin.id;
    },

    replyToComment: (id, text, mentions) => {
      const el = get().elements[id];
      const clean = text.trim();
      if (!el || el.type !== 'comment' || !clean || !ensure('board.comment')) return;
      const a = get().access;
      const message: CommentMessage = { id: createId(8), author: a.userName, authorId: a.userId, text: clean, createdAt: Date.now(), ...(mentions?.length ? { mentions } : {}) };
      commitHistory();
      // responder reabre uma conversa resolvida
      applyPatches([{ id, patch: { messages: [...el.messages, message], resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null } }]);
      get().recordActivity('commented', { key: 'board.activity.replied' }, { targetType: 'comment', targetCount: 1, elementIds: [id] });
    },

    setCommentResolved: (id, resolved) => {
      const el = get().elements[id];
      if (!el || el.type !== 'comment' || el.resolved === resolved || !ensure('board.comment')) return;
      const a = get().access;
      commitHistory();
      applyPatches([{ id, patch: resolved ? { resolved: true, resolvedBy: a.userId, resolvedByName: a.userName, resolvedAt: Date.now() } : { resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null } }]);
      get().recordActivity('commented', { key: resolved ? 'board.activity.commentResolved' : 'board.activity.commentReopened' }, { targetType: 'comment', targetCount: 1, elementIds: [id] });
    },

    deleteComment: (id) => {
      const el = get().elements[id];
      if (!el || el.type !== 'comment') return;
      const authorId = el.messages[0]?.authorId ?? el.createdBy ?? null;
      if (!ensure('comment.delete', { authorId })) return;
      commitHistory();
      set((state) => {
        const elements = { ...state.elements };
        delete elements[id];
        const elementOrder = state.elementOrder.filter((x) => x !== id);
        return { elements: syncZ(elements, elementOrder), elementOrder, selectedIds: state.selectedIds.filter((x) => x !== id) };
      });
      logActivity('deleted', 'comment', [id]);
    },

    /* ---------------- Cronômetro (Chat 04) ---------------- */

    startTimer: (durationMs) => {
      if (!ensure('timer.manage')) return;
      const f = get().facilitation;
      const cur = f.timer ?? DEFAULT_TIMER;
      const now = Date.now();
      const duration = durationMs !== undefined ? Math.max(1000, Math.round(durationMs)) : cur.durationMs;
      const remaining = durationMs !== undefined || timerRemaining(cur, now) <= 0 ? duration : timerRemaining(cur, now);
      set({ facilitation: { ...f, timer: { ...cur, durationMs: duration, remainingMs: remaining, running: true, endsAt: now + remaining, visible: true, startedBy: get().access.userId, finishedAt: null } } });
      const minutes = Math.round(remaining / 60000);
      get().recordActivity('timer', minutes >= 1 ? { key: 'board.activity.timerStartedMinutes', params: { minutes } } : { key: 'board.activity.timerStartedSeconds', params: { seconds: Math.round(remaining / 1000) } }, { targetType: 'board' });
    },

    pauseTimer: () => {
      const f = get().facilitation;
      const cur = f.timer;
      if (!cur?.running || !ensure('timer.manage')) return;
      set({ facilitation: { ...f, timer: { ...cur, running: false, remainingMs: timerRemaining(cur), endsAt: null } } });
    },

    resetTimer: () => {
      const f = get().facilitation;
      const cur = f.timer ?? DEFAULT_TIMER;
      if (!ensure('timer.manage')) return;
      set({ facilitation: { ...f, timer: { ...cur, running: false, remainingMs: cur.durationMs, endsAt: null, finishedAt: null } } });
    },

    addTimerTime: (ms) => {
      const f = get().facilitation;
      const cur = f.timer ?? DEFAULT_TIMER;
      if (!ensure('timer.manage')) return;
      const now = Date.now();
      const remaining = Math.max(0, timerRemaining(cur, now) + ms);
      const durationMs = Math.max(cur.durationMs, remaining);
      set({
        facilitation: {
          ...f,
          timer: cur.running ? { ...cur, durationMs, endsAt: now + remaining, remainingMs: remaining } : { ...cur, durationMs, remainingMs: remaining, finishedAt: null },
        },
      });
    },

    setTimerMusic: (track) => {
      const f = get().facilitation;
      const cur = f.timer ?? DEFAULT_TIMER;
      if (cur.musicTrack === track || !ensure('timer.manage')) return;
      set({ facilitation: { ...f, timer: { ...cur, musicTrack: track } } });
    },

    setTimerVisible: (visible) => {
      const f = get().facilitation;
      const cur = f.timer ?? DEFAULT_TIMER;
      if (!!cur.visible === visible || !ensure('timer.manage')) return;
      // fechar o cronômetro também para a contagem e a música
      set({ facilitation: { ...f, timer: visible ? { ...cur, visible: true } : { ...cur, visible: false, running: false, remainingMs: timerRemaining(cur), endsAt: null } } });
    },

    completeTimer: () => {
      const f = get().facilitation;
      const cur = f.timer;
      if (!cur?.running || !cur.endsAt || cur.endsAt > Date.now() || get().readOnly) return false;
      set({ facilitation: { ...f, timer: { ...cur, running: false, remainingMs: 0, endsAt: null, finishedAt: Date.now() } } });
      return true;
    },

    /* ---------------- Votação por pontos (Chat 04) ---------------- */

    startVoting: (config) => {
      if (!ensure('voting.manage')) return;
      const f = get().facilitation;
      const now = Date.now();
      if (config.kind === 'poll') {
        const options = (config.pollOptions ?? []).map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
        if (options.length < 2) {
          reportDenied(t('board.useBoardStore.pollNeedsQuestionAnswers'));
          return;
        }
        const poll: VotingState = {
          active: true,
          kind: 'poll',
          title: config.title.trim() || t('board.useBoardStore.pollDefaultTitle'),
          dotsPerUser: config.pollMultiple ? options.length : 1,
          anonymous: config.anonymous,
          hideCursors: config.anonymous,
          revealed: false,
          votesByElement: {},
          endsAt: config.durationMs ? now + config.durationMs : null,
          startedBy: get().access.userId,
          startedAt: now,
          revealedAt: null,
          poll: {
            options: options.map((o, i) => ({ id: `opt${i + 1}-${Math.random().toString(36).slice(2, 7)}`, text: o.text.slice(0, 280), ...(o.sourceId ? { sourceId: o.sourceId } : {}) })),
            multiple: !!config.pollMultiple,
            responses: {},
            voterNames: {},
            ...(config.pollLiveResults ? { liveResults: true } : {}),
          },
        };
        set({ facilitation: { ...f, voting: poll }, activeTool: 'select', editingId: null });
        get().recordActivity('voting', { key: `board.activity.pollOpened${poll.poll!.multiple ? 'Multiple' : ''}${config.anonymous ? 'Anonymous' : ''}`, params: { title: poll.title, count: options.length } }, { targetType: 'board' });
        return;
      }
      const dots = Math.max(1, Math.min(99, Math.round(config.dotsPerUser)));
      const voting: VotingState = {
        active: true,
        title: config.title.trim() || t('board.useBoardStore.voteDefaultTitle'),
        dotsPerUser: dots,
        anonymous: config.anonymous,
        hideCursors: config.anonymous,
        revealed: false,
        votesByElement: {},
        ballots: {},
        allowMultiplePerItem: config.allowMultiplePerItem,
        endsAt: config.durationMs ? now + config.durationMs : null,
        startedBy: get().access.userId,
        startedAt: now,
        revealedAt: null,
      };
      set({ facilitation: { ...f, voting }, activeTool: 'select', editingId: null });
      get().recordActivity('voting', { key: config.anonymous ? 'board.activity.voteStartedAnonymous' : 'board.activity.voteStarted', params: { title: voting.title, count: dots } }, { targetType: 'board' });
    },

    answerPoll: (optionIds) => {
      const f = get().facilitation;
      const v = f.voting;
      if (!v?.active || v.revealed || v.kind !== 'poll' || !v.poll) return false;
      if (!ensure('voting.cast')) return false;
      const valid = new Set(v.poll.options.map((o) => o.id));
      let ids = Array.from(new Set(optionIds.filter((id) => valid.has(id))));
      if (!v.poll.multiple) ids = ids.slice(0, 1);
      const uid = get().access.userId;
      const responses = { ...v.poll.responses };
      const voterNames = { ...(v.poll.voterNames ?? {}) };
      if (ids.length) {
        responses[uid] = ids;
        voterNames[uid] = get().access.userName;
      } else {
        delete responses[uid];
        delete voterNames[uid];
      }
      set({ facilitation: { ...f, voting: { ...v, votesByElement: tallyPoll(responses), poll: { ...v.poll, responses, voterNames } } } });
      return true;
    },

    castVote: (key) => {
      const f = get().facilitation;
      const v = f.voting;
      if (!v?.active || v.revealed || v.kind === 'poll') return false;
      if (!ensure('voting.cast')) return false;
      const uid = get().access.userId;
      const mine = { ...(v.ballots?.[uid] ?? {}) };
      const used = Object.values(mine).reduce((n, k) => n + k, 0);
      if (used >= v.dotsPerUser) {
        reportDenied(t('board.useBoardStore.allDotsUsed', { count: v.dotsPerUser }));
        return false;
      }
      if (v.allowMultiplePerItem === false && (mine[key] ?? 0) >= 1) {
        reportDenied(t('board.useBoardStore.oneDotPerItem'));
        return false;
      }
      mine[key] = (mine[key] ?? 0) + 1;
      const ballots = { ...(v.ballots ?? {}), [uid]: mine };
      set({ facilitation: { ...f, voting: { ...v, ballots, votesByElement: tallyBallots(ballots) } } });
      return true;
    },

    retractVote: (key) => {
      const f = get().facilitation;
      const v = f.voting;
      if (!v?.active || v.revealed) return false;
      const uid = get().access.userId;
      const mine = { ...(v.ballots?.[uid] ?? {}) };
      if (!mine[key]) return false;
      if (!ensure('voting.cast')) return false;
      mine[key] -= 1;
      if (mine[key] <= 0) delete mine[key];
      const ballots = { ...(v.ballots ?? {}), [uid]: mine };
      set({ facilitation: { ...f, voting: { ...v, ballots, votesByElement: tallyBallots(ballots) } } });
      return true;
    },

    revealVoting: () => {
      const f = get().facilitation;
      const v = f.voting;
      if (!v?.active || v.revealed || !ensure('voting.manage')) return;
      set({ facilitation: { ...f, voting: { ...v, revealed: true, revealedAt: Date.now(), endsAt: null } } });
      if (v.kind === 'poll' && v.poll) {
        const people = Object.keys(v.poll.responses).length;
        const top = [...v.poll.options].sort((a, b) => (v.votesByElement[b.id] ?? 0) - (v.votesByElement[a.id] ?? 0))[0];
        const leader = top && (v.votesByElement[top.id] ?? 0) > 0 ? top.text.slice(0, 60) : null;
        get().recordActivity('voting', leader ? { key: 'board.activity.pollEndedLeader', params: { title: v.title, count: people, leader } } : { key: 'board.activity.pollEnded', params: { title: v.title, count: people } }, { targetType: 'board' });
        return;
      }
      const total = Object.values(v.votesByElement).reduce((n, k) => n + k, 0);
      get().recordActivity('voting', { key: 'board.activity.voteEnded', params: { title: v.title, count: total } }, { targetType: 'board' });
    },

    autoRevealVoting: () => {
      const f = get().facilitation;
      const v = f.voting;
      if (!v?.active || v.revealed || !v.endsAt || v.endsAt > Date.now() || get().readOnly) return;
      set({ facilitation: { ...f, voting: { ...v, revealed: true, revealedAt: Date.now(), endsAt: null } } });
      get().recordActivity('voting', { key: v.kind === 'poll' ? 'board.activity.pollTimeUp' : 'board.activity.voteTimeUp', params: { title: v.title } }, { targetType: 'board' });
    },

    cancelVoting: () => {
      const f = get().facilitation;
      if (!f.voting || !ensure('voting.manage')) return;
      const title = f.voting.title;
      const { voting: _discard, ...rest } = f;
      void _discard;
      set({ facilitation: rest as FacilitationState });
      get().recordActivity('voting', { key: f.voting.kind === 'poll' ? 'board.activity.pollCanceled' : 'board.activity.voteCanceled', params: { title } }, { targetType: 'board' });
    },

    closeVoting: () => {
      const f = get().facilitation;
      if (!f.voting || !ensure('voting.manage')) return;
      const { voting: _discard, ...rest } = f;
      void _discard;
      set({ facilitation: rest as FacilitationState });
    },
  };
});

/* -------------------------------------------------------------------------- */
/*  Seletores utilitários                                                     */
/* -------------------------------------------------------------------------- */

export function getSelectedElements(state: Pick<BoardState, 'elements' | 'selectedIds'>): CanvasElement[] {
  return state.selectedIds.map((id) => state.elements[id]).filter(Boolean);
}

export function selectCanUndo(state: BoardState): boolean {
  return state.collab ? state.remoteUndo > 0 : state.history.past.length > 0;
}

export function selectCanRedo(state: BoardState): boolean {
  return state.collab ? state.remoteRedo > 0 : state.history.future.length > 0;
}
