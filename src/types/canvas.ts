/**
 * LuDraw — Contratos de dados do Canvas (ARCHITECTURE_MAP.md §2).
 *
 * Regras:
 *  - Este arquivo é a fonte única de tipos para todos os módulos (Chats 01 → 08).
 *  - Toda extensão deve ser RETROCOMPATÍVEL: novas propriedades entram como opcionais
 *    e ganham default na factory (`src/utils/factory.ts`).
 *
 * Extensões feitas no Chat 01 (todas opcionais):
 *  - `RichTextStyle` (fonte nomeada, sublinhado, tachado, listas, link, marca-texto)
 *    aplicada a Sticky, Shape e Text — usada pela FloatingContextToolbar.
 *  - `ShapeKind` ganhou `'speech_bubble'` (balão de fala do menu "Alterar tipo").
 *
 * Extensões do Chat 02 · Rodada A (todas opcionais / retrocompatíveis):
 *  - `ToolType` ganhou `'lasso'` (seleção por laço).
 *  - `StickyTag`, `StickyNoteElement.reactedBy` e `BoardData.boardTags` (tags e reações).
 *
 * Extensões do Chat 02 · Rodada B (opcionais / retrocompatíveis):
 *  - `LockMode`, `lockMode`, `lockedBy`, `isBackgroundFramework`, `createdByName`, `isPrivateDraft`, `votedBy`.
 *  - `BoardActivityEntry`, `FacilitationState` e `BoardData.activityLog / facilitation / facilitatorIds`.
 *
 * Extensões do Chat 03 · Rodada A (opcionais / retrocompatíveis):
 *  - `ConnectorElement.lineJumps` (saltos de linha; ausente = ligado nas rotas em cotovelo).
 *  - `MindMapNodeItem.width / height / side` (tamanho calculado pelo auto-layout e lado do ramo).
 *
 * Extensões do Chat 03 · Rodada B (opcionais / retrocompatíveis):
 *  - `ToolOptions.frameRatio`. `FrameElement` já existia (agora com View, parenting via `parentId`,
 *    `hiddenContent` aplicado na tela/export e `slideOrder` usado no Modo Apresentação).
 *
 * Extensões do Chat 04 (opcionais / retrocompatíveis):
 *  - `KanbanColumn.wipLimit`, `KanbanElement.columnWidth`, `TableCell` (+ `textColor`, `align`),
 *    `TableElement.headerRow`, `CommentMessage` (+ `authorId`, `mentions`, `editedAt`),
 *    `CommentElement.resolvedBy/resolvedByName/resolvedAt/targetId`.
 *  - `TimerState` (+ `endsAt`, `visible`, `startedBy`, `finishedAt`) e `VotingState`
 *    (+ `ballots`, `allowMultiplePerItem`, `endsAt`, `startedBy`, `startedAt`, `revealedAt`).
 *  - `BoardActivityAction` ganhou `'commented' | 'voting' | 'timer'`.
 *
 * Extensões do Chat 05 (opcionais / retrocompatíveis):
 *  - `ShapeElement.customPath` + `customPathBox` (contorno livre de SVG importado).
 *  - `BoardActivityAction` ganhou `'imported'`.
 */

import type { CompositeElementData } from '../extensions/types';
import type { StoredMessage } from '../i18n/types';

export type ToolType =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'shape'
  | 'text'
  | 'connector'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'frame'
  | 'mindmap'
  | 'kanban'
  | 'table'
  | 'comment'
  | 'image'
  | 'lasso';

export type ShapeKind =
  | 'rectangle'
  | 'rounded_rectangle'
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'cylinder'
  | 'parallelogram'
  | 'cloud'
  | 'star'
  | 'hexagon'
  | 'speech_bubble';

export interface CameraState {
  /** Translação em pixels de tela: screenX = worldX * zoom + x */
  x: number;
  /** Translação em pixels de tela: screenY = worldY * zoom + y */
  y: number;
  /** 0.02 (2%) a 4.0 (400%) */
  zoom: number;
}

/** Modo de bloqueio para governança de workshops (Chat 02 · Rodada B). */
export type LockMode = 'none' | 'standard' | 'protected';

export interface BaseElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Em graus (0 a 360) */
  rotation: number;
  zIndex: number;
  /** ID do Frame pai, se estiver agrupado dentro de um Frame */
  parentId?: string | null;
  /** ID de grupo quando agrupado via Ctrl+G */
  groupId?: string | null;
  /** true quando lockMode !== 'none' (mantido para retrocompatibilidade com o Chat 01) */
  locked?: boolean;
  /** 'standard' (qualquer editor destrava segurando 2 s) | 'protected' (só facilitador/admin/lockedBy destrava). Ausente + locked = 'standard'. */
  lockMode?: LockMode;
  /** userId de quem travou */
  lockedBy?: string | null;
  /** Estrutura de fundo: fica atrás das notas e é ignorada pelo marquee/laço comum */
  isBackgroundFramework?: boolean;
  opacity?: number;
  createdAt: number;
  updatedAt: number;
  /** userId do autor (Chat 02: preenchido em toda criação pelo store) */
  createdBy?: string;
  /** Nome exibido no Activity Log e nos post-its */
  createdByName?: string;
}

/** Estilo de texto rico compartilhado por elementos com texto (extensão Chat 01). */
export interface RichTextStyle {
  /** Nome de exibição da fonte (ver BOARD_FONTS em utils/text.ts). Sobrepõe `fontFamily`. */
  fontName?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  strikethrough?: boolean;
  listStyle?: 'none' | 'bullet' | 'numbered';
  /** Nível de recuo da lista (0..4) */
  indent?: number;
  link?: string | null;
  /** Cor do marca-texto aplicada ao texto (null = sem realce) */
  highlightColor?: string | null;
  /** Opacidade só do fundo/preenchimento (0.1–1). `opacity` continua valendo para o objeto todo. */
  fillOpacity?: number;
}

/** Etiqueta (tag) de post-it. O catálogo do board fica em `BoardData.boardTags` (Chat 02). */
export interface StickyTag {
  id: string;
  label: string;
  /** Cor de fundo da pílula (hex) */
  color: string;
}

export interface StickyNoteElement extends BaseElement, RichTextStyle {
  type: 'sticky';
  text: string;
  /** Hex da cor. Novos post-its usam `STICKY_PALETTE` (utils/factory.ts, Chat 05.5; padrão Canário `#FBED7C`); boards antigos mantêm a cor gravada. */
  color: string;
  textColor?: string;
  fontSize?: 'auto' | number;
  textAlign?: 'left' | 'center' | 'right';
  tags: StickyTag[];
  /** Ex: { '👍': 3, '❤️': 1 } */
  reactions: Record<string, number>;
  /** Quem reagiu com cada emoji (ids de usuário) — permite que o clique alterne a reação de cada pessoa (Chat 02) */
  reactedBy?: Record<string, string[]>;
  votes?: number;
  /** IDs anônimos/hash na sessão de votação (Chat 04) */
  votedBy?: string[];
  authorName?: string;
  /** Criado durante o Modo Privado: fica mascarado para os outros até `revealPrivateNotes` (Chat 02) */
  isPrivateDraft?: boolean;
}

export interface ShapeElement extends BaseElement, RichTextStyle {
  type: 'shape';
  shapeKind: ShapeKind;
  text: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  textColor: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  /**
   * Chat 05 (opcional): contorno livre vindo de SVG importado — path NORMALIZADO (só `M L C Q Z`
   * absolutos) desenhado na caixa `customPathBox` e escalado para (width × height). Ausente = forma
   * de `shapeKind`. Converter/trocar o tipo da forma descarta o contorno livre.
   */
  customPath?: string;
  customPathBox?: { width: number; height: number };
  /** Chat 06.5 (opcional): traço extra sem preenchimento da forma de extensão (mesmo espaço do customPath) */
  customDecoration?: string;
  /** Chat 06.5 (opcional): margens do texto em fração da caixa (forma de extensão) */
  customTextInsets?: { top: number; right: number; bottom: number; left: number };
  /** Chat 06.5 (opcional): forma criada por uma extensão (o desenho fica copiado no elemento) */
  shapeRef?: { extensionId: string; shapeId: string; name: string };
}

export interface TextElement extends BaseElement, RichTextStyle {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: 'sans' | 'serif' | 'mono';
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textColor: string;
  /** 'transparent' por padrão */
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
}

export interface FreehandElement extends BaseElement {
  type: 'freehand';
  /** Coordenadas relativas ao x,y do elemento */
  points: { x: number; y: number; pressure?: number }[];
  strokeColor: string;
  strokeWidth: number;
  isHighlighter: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  /** Base64 ou URL do servidor */
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  alt?: string;
}

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface ConnectorEndpoint {
  /** Se conectado a um objeto, guarda o ID; se livre, null */
  elementId: string | null;
  anchor: AnchorSide;
  /** Posição no mundo caso desconectado */
  x: number;
  y: number;
}

/**
 * Estilo do texto da linha (Chat 03). Todos os campos são opcionais: ausente = visual padrão
 * (Figtree 600 14, fundo do painel do tema, borda 1,5 px na cor da linha, raio 12).
 */
export interface ConnectorLabelStyle {
  fontSize?: number;
  fontName?: string;
  /** Ausente = semibold (600) */
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  /** Ausente = cor de texto do tema */
  textColor?: string;
  /** Ausente = fundo do painel do tema · 'transparent' = sem fundo */
  fillColor?: string;
  /** Ausente = cor da linha */
  borderColor?: string;
  /** Ausente = 1,5 · 0 = sem borda */
  borderWidth?: number;
  /** Ausente = 12 (limitado à metade da altura = pílula) */
  borderRadius?: number;
}

export interface ConnectorElement extends BaseElement {
  type: 'connector';
  start: ConnectorEndpoint;
  end: ConnectorEndpoint;
  routingType: 'straight' | 'curved' | 'orthogonal';
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  startArrow: 'none' | 'arrow' | 'filled_arrow' | 'diamond' | 'circle';
  endArrow: 'none' | 'arrow' | 'filled_arrow' | 'diamond' | 'circle';
  /** Texto desenhado numa pílula sobre a rota (Chat 03) */
  label?: string;
  /** Posição do rótulo ao longo do COMPRIMENTO da rota: 0 = início, 1 = fim. Ausente = meio (0,5). (Chat 03) */
  labelPosition?: number;
  /** Aparência do rótulo (tamanho, fonte, cores, borda, raio). Ausente = padrão. (Chat 03) */
  labelStyle?: ConnectorLabelStyle;
  waypoints?: { x: number; y: number }[];
  /** Saltos (arcos) onde trechos horizontais cruzam trechos verticais de outras linhas em cotovelo. Ausente = true. (Chat 03) */
  lineJumps?: boolean;
}

export interface FrameElement extends BaseElement {
  type: 'frame';
  title: string;
  fillColor: string;
  ratioPreset: 'free' | '16:9' | '4:3' | '1:1' | 'a4' | 'mobile';
  /** Para dinâmicas onde o facilitador oculta o quadro temporariamente */
  hiddenContent: boolean;
  slideOrder: number;
}

export interface MindMapNodeItem {
  id: string;
  parentId: string | null;
  text: string;
  color: string;
  collapsed?: boolean;
  /** Canto superior esquerdo do nó relativo a (x, y) do elemento — escrito pelo auto-layout */
  offsetX: number;
  offsetY: number;
  /** Tamanho do nó calculado pelo auto-layout (Chat 03) */
  width?: number;
  height?: number;
  /** Só ramos de 1º nível, layout horizontal: lado da raiz (fixado na criação). Ausente = 'right'. (Chat 03) */
  side?: 'left' | 'right';
}

export interface MindMapElement extends BaseElement {
  type: 'mindmap';
  layoutDirection: 'horizontal' | 'vertical';
  nodes: MindMapNodeItem[];
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  /** Data no formato ISO "AAAA-MM-DD" (campo `<input type="date">`) */
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  storyPoints?: number;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
  /** Limite de trabalho em andamento (WIP). Ausente = sem limite. (Chat 04) */
  wipLimit?: number;
}

export interface KanbanElement extends BaseElement {
  type: 'kanban';
  title: string;
  columns: KanbanColumn[];
  /** Largura de cada coluna em unidades de mundo. Ausente = 264. O tamanho do elemento vem do layout (`utils/kanban.ts`). (Chat 04) */
  columnWidth?: number;
}

/** Célula de tabela (chave "row-col" em `TableElement.cells`). */
/** Borda de um lado da célula (Ajuste da tabela, pós-Chat 04). `width: 0` = sem borda. */
export interface TableBorder {
  color: string;
  width: number;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface TableCell {
  text: string;
  bgColor?: string;
  bold?: boolean;
  /** Cor do texto. Ausente = automática (escura sobre fundos claros, clara sobre escuros). (Chat 04) */
  textColor?: string;
  /** Alinhamento horizontal. Ausente = esquerda. (Chat 04) */
  align?: 'left' | 'center' | 'right';
  /* --- Ajuste da tabela (pós-Chat 04) — todos opcionais, boards antigos continuam iguais --- */
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Nome de exibição da fonte (BOARD_FONTS). Ausente = Figtree. */
  fontName?: string;
  /** Tamanho em px do mundo. Ausente = 14. */
  fontSize?: number;
  /** Alinhamento vertical. Ausente = topo. */
  valign?: 'top' | 'middle' | 'bottom';
  /** Mesclagem: só a célula do canto superior esquerdo guarda o tamanho; as cobertas ficam sem conteúdo. */
  rowSpan?: number;
  colSpan?: number;
  /** Bordas por lado (t = topo, r = direita, b = baixo, l = esquerda). Ausente = grade padrão do estilo. */
  borders?: { t?: TableBorder; r?: TableBorder; b?: TableBorder; l?: TableBorder };
}

/** Estilos prontos da tabela (cores de cabeçalho, faixas e grade). */
export type TableStyleId = 'sage' | 'forest' | 'blue' | 'gray' | 'amber' | 'plain';

export interface TableElement extends BaseElement {
  type: 'table';
  rows: number;
  cols: number;
  /** Largura de cada coluna (mundo). A soma = `width`. */
  colWidths: number[];
  /** Altura mínima de cada linha (mundo). O texto que não cabe faz a linha crescer. A soma = `height`. */
  rowHeights: number[];
  /** chave: "row-col" */
  cells: Record<string, TableCell>;
  /** Primeira linha como cabeçalho (fundo sálvia + negrito). Ausente = true. (Chat 04) */
  headerRow?: boolean;
  /** Primeira coluna em destaque (cor do cabeçalho + negrito). Ausente = false. */
  headerCol?: boolean;
  /** Linhas alternadas (faixas). Ausente = false. */
  banded?: boolean;
  /** Estilo pronto. Ausente = 'sage'. */
  tableStyle?: TableStyleId;
}

export interface CommentMessage {
  id: string;
  /** Nome exibido do autor */
  author: string;
  text: string;
  createdAt: number;
  /** userId do autor (Chat 04) — permite apagar a própria thread com `comment.delete` */
  authorId?: string;
  /** Nomes @mencionados no texto (Chat 04) */
  mentions?: string[];
  editedAt?: number;
}

/**
 * Pin de comentário (Chat 04). `x, y` = ponta do pin no mundo; `width`/`height` = 0 (o pin é
 * desenhado em tamanho fixo de tela). Não sai no PNG/PDF; some com "Mostrar comentários" desligado.
 */
export interface CommentElement extends BaseElement {
  type: 'comment';
  resolved: boolean;
  messages: CommentMessage[];
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: number | null;
  /** Objeto comentado (opcional): o pin nasce no canto dele. (Chat 04) */
  targetId?: string | null;
}

/**
 * Chat 06.5: elemento COMPOSTO de uma extensão (peças declarativas, sem JS de render). As peças ficam
 * copiadas no elemento: o board abre igual mesmo com a extensão desligada ou removida. Validado em
 * toda leitura (`validateCompositeElement`): inválido é ignorado na tela e no export.
 */
export interface CompositeElement extends BaseElement, CompositeElementData {
  type: 'composite';
}

export type CanvasElement =
  | CompositeElement
  | StickyNoteElement
  | ShapeElement
  | TextElement
  | FreehandElement
  | ImageElement
  | ConnectorElement
  | FrameElement
  | MindMapElement
  | KanbanElement
  | TableElement
  | CommentElement;

export type CanvasElementType = CanvasElement['type'];

/** Elementos que possuem texto editável no Chat 01. */
export type TextualElement = StickyNoteElement | ShapeElement | TextElement;

export function isTextualElement(el: CanvasElement | undefined | null): el is TextualElement {
  return !!el && (el.type === 'sticky' || el.type === 'shape' || el.type === 'text');
}

/** Patch genérico aplicado em `updateElement(s)`. */
export type ElementPatch = Partial<CanvasElement> & Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/*  Configurações do board                                                    */
/* -------------------------------------------------------------------------- */

export interface GridSettings {
  enabled: boolean;
  snapToGrid: boolean;
  /** Tamanho base da célula em unidades de mundo */
  size: number;
  style: 'dots' | 'lines';
}

export interface SmartGuide {
  orientation: 'vertical' | 'horizontal';
  /** Coordenada fixa da linha (x para vertical, y para horizontal) em mundo */
  position: number;
  /** Início/fim ao longo do outro eixo, em mundo */
  start: number;
  end: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dados persistidos de um board (localStorage no Chat 01 → IndexedDB/Yjs no Chat 06). */
export interface BoardData {
  version: 1;
  elements: Record<string, CanvasElement>;
  elementOrder: string[];
  gridSettings: GridSettings;
  backgroundColor: string | null;
  initialView: CameraState | null;
  /** Catálogo de tags do board (Chat 02). Ausente em boards antigos = catálogo derivado dos post-its. */
  boardTags?: StickyTag[];
  /** Registro de atividades (máx. 200 entradas recentes) — Chat 02 · Rodada B */
  activityLog?: BoardActivityEntry[];
  /** Estado de facilitação do board (Modo Privado agora; Timer/Votação no Chat 04) */
  facilitation?: FacilitationState;
  /** Facilitadores do board; owner e admins são facilitadores implícitos (ARCHITECTURE_MAP §5). Ausente = [ownerId]. */
  facilitatorIds?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Auditoria e facilitação (Chat 02 · Rodada B)                               */
/* -------------------------------------------------------------------------- */

export type BoardActivityAction =
  | 'created'
  | 'updated'
  | 'moved'
  | 'deleted'
  | 'locked'
  | 'unlocked'
  | 'private_mode_toggled'
  | 'private_notes_revealed'
  | 'snapshot_restored'
  | 'exported'
  /** Chat 04: comentário novo, resposta, resolver/reabrir */
  | 'commented'
  /** Chat 04: iniciar/encerrar/revelar votação */
  | 'voting'
  /** Chat 04: iniciar/pausar/zerar o cronômetro */
  | 'timer'
  /** Chat 06: facilitadores, pessoas ou link público do board alterados */
  | 'access_changed'
  /** Chat 05: importou planilha/SVG/arquivo de outro programa (formatos abertos) */
  | 'imported'
  /** Chat 08: começou/parou de conduzir a tela de todos ("Trazer todos até mim") */
  | 'follow_me';

export interface BoardActivityEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorRole: 'admin' | 'member' | 'guest_b2b' | 'visitor';
  action: BoardActivityAction;
  targetType?: CanvasElement['type'] | 'board' | 'frame';
  targetCount?: number;
  /**
   * Frase pronta em pt-BR — só nas entradas gravadas até o Chat 05.6 (Rodada A). As novas usam
   * `message` e a tela traduz no idioma ativo.
   */
  summary?: string;
  /** Chat 05.6: mensagem como chave + parâmetros (`{actor}` vem de `actorName` na hora de exibir) */
  message?: StoredMessage;
  /** Até 20 ids; clicar na entrada foca a câmera nesses elementos */
  elementIds?: string[];
  /** Fim da janela de agrupamento (coalescing de 8 s: mesmo ator + ação + tipo) */
  lastTimestamp?: number;
  /** Complemento do resumo — chave (`board.activity.detail.*`; antigas: texto pt-BR); entra no agrupamento */
  detail?: string;
  /** Chat 06.5 · B (opcional): feito por uma extensão (API `ludraw.*`) — rótulo "via extensão X" no Painel */
  viaExtension?: { id: string; name: string };
}

export interface FacilitationState {
  privateMode: {
    enabled: boolean;
    startedBy?: string;
    startedAt?: number;
    /** Simular a visão de outro participante (testar o borrado em modo single-player) */
    previewOwnNotes: boolean;
  };
  timer?: TimerState;
  voting?: VotingState;
  /** Follow-me ("Bring everyone to me") */
  leaderUserId?: string | null;
}

export type MusicTrack = 'none' | 'lofi' | 'ambient' | 'focus';

/**
 * Cronômetro do board (Chat 04). Rodando: o tempo restante é `endsAt - agora` (cada cliente
 * calcula sozinho — nada é gravado a cada segundo). Pausado: vale `remainingMs`.
 */
export interface TimerState {
  running: boolean;
  durationMs: number;
  remainingMs: number;
  musicTrack: MusicTrack;
  /** Instante (ms) em que o tempo acaba quando `running` (Chat 04) */
  endsAt?: number | null;
  /** Cronômetro visível na Régua/flutuante (false = fechado) (Chat 04) */
  visible?: boolean;
  startedBy?: string | null;
  /** Fim já tocou o alarme (evita repetir ao recarregar) (Chat 04) */
  finishedAt?: number | null;
}

/** Item votável: id do elemento (post-it/forma) ou `"<kanbanId>::<cardId>"` (card de Kanban). */
export type VoteTargetKey = string;

/**
 * Sessão de votação por pontos (Chat 04). Os votos ficam na facilitação (fora do desfazer).
 * Com `anonymous`, a UI esconde a contagem dos outros até `revealed` (o servidor aplica de verdade no Chat 08).
 */
export interface VotingState {
  active: boolean;
  title: string;
  dotsPerUser: number;
  anonymous: boolean;
  hideCursors: boolean;
  revealed: boolean;
  /** Total por item (soma de `ballots`) */
  votesByElement: Record<VoteTargetKey, number>;
  /** Cédulas: userId → item → pontos (Chat 04) */
  ballots?: Record<string, Record<VoteTargetKey, number>>;
  /** Vários pontos no mesmo item? Ausente = true (Chat 04) */
  allowMultiplePerItem?: boolean;
  /** Fim automático (ms) — opcional (Chat 04) */
  endsAt?: number | null;
  startedBy?: string | null;
  startedAt?: number | null;
  revealedAt?: number | null;
  /** Tipo de votação. Ausente = 'dots' (pontos nos itens do board). 'poll' = enquete com pergunta e respostas. */
  kind?: 'dots' | 'poll';
  /** Dados da enquete (só quando `kind === 'poll'`). Em enquete, `anonymous` = não mostrar quem votou. */
  poll?: PollData;
}

/** Resposta de uma enquete. `sourceId` = elemento do board de onde o texto foi copiado (opcional). */
export interface PollOption {
  id: string;
  text: string;
  sourceId?: string;
}

export interface PollData {
  options: PollOption[];
  /** Múltipla escolha (cada pessoa marca várias respostas)? */
  multiple: boolean;
  /** userId → respostas escolhidas (a pessoa pode mudar até o fim) */
  responses: Record<string, string[]>;
  /** userId → nome exibido (para mostrar quem votou quando a enquete não é anônima) */
  voterNames?: Record<string, string>;
  /** Mostrar o resultado parcial a todos enquanto a enquete está aberta? Ausente = false. */
  liveResults?: boolean;
}

export interface ToolOptions {
  stickyColor: string;
  shapeKind: ShapeKind;
  /** Chat 06.5: forma de extensão escolhida no Dock (id do ShapeRegistry); ausente = `shapeKind` */
  shapeId?: string;
  penColor: string;
  penWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  connectorRouting: ConnectorElement['routingType'];
  connectorStartArrow: ConnectorElement['startArrow'];
  connectorEndArrow: ConnectorElement['endArrow'];
  /** Proporção da ferramenta Frame (Chat 03 · Rodada B). Ausente = 'free'. */
  frameRatio?: FrameElement['ratioPreset'];
}

/** Interação em andamento no canvas (antes em `useBoardStore.ts`, que a reexporta). */
export type InteractionKind =
  | 'idle'
  | 'panning'
  | 'marquee'
  | 'dragging'
  | 'resizing'
  | 'rotating'
  | 'drawing'
  | 'erasing'
  | 'creating';
