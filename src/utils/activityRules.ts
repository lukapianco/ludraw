/**
 * LuDraw — regras do Activity Log do board (Chat 08.7 · R2, achado S-03). PURO: cliente e servidor.
 *
 * Uma entrada vinda do cliente (tempo real `me.activity` ou PUT `activityLog`) só é aceita se:
 *  1. tem a forma conhecida, com tamanhos limitados (`sanitizeActivityEntry`): tipo de ação da lista, mensagem
 *     com chave `board.activity.*` (também nos parâmetros aninhados), poucos parâmetros, strings curtas;
 *  2. quem mandou PODE fazer o que a entrada descreve (`activityPermission` → ação do `can()`): comentário exige
 *     comentar, objetos exigem editar, votação exige gerenciar a votação etc. Leitor e visitante só leem.
 * O autor (`actorId`, `actorName`, `actorRole`) nunca vem do cliente: o servidor carimba.
 * Limite honesto: quem pode editar ainda pode registrar uma entrada inventada sobre o que ele mesmo pode fazer
 * (registrado no QUALITY_BACKLOG §Chat 08.7).
 */
import type { BoardActivityAction, BoardActivityEntry } from '../types/canvas';
import type { PermissionAction } from './permissions';

export const ACTIVITY_LIMITS = {
  idChars: 40,
  keyChars: 120,
  /** parâmetro de texto (título de votação, nome de arquivo…) */
  stringChars: 300,
  /** parâmetros por mensagem */
  params: 8,
  /** mensagens aninhadas (`withDetail` → `text` → `nouns` = 3) */
  depth: 3,
  elementIds: 20,
  elementIdChars: 80,
  targetTypeChars: 40,
  extensionChars: 120,
} as const;

const ACTIONS: ReadonlySet<BoardActivityAction> = new Set<BoardActivityAction>([
  'created', 'updated', 'moved', 'deleted', 'locked', 'unlocked', 'private_mode_toggled', 'private_notes_revealed',
  'snapshot_restored', 'exported', 'commented', 'voting', 'timer', 'access_changed', 'imported', 'follow_me',
]);

const KEY_PREFIX = 'board.activity.';
const DETAIL_PREFIX = 'board.activity.detail.';
/** `BoardActivityEntry['targetType']`: tipo de objeto do board ou o próprio board (o tipo obriga a listar um tipo novo). */
const TARGET_TYPES: Record<NonNullable<BoardActivityEntry['targetType']>, true> = {
  composite: true,
  sticky: true,
  shape: true,
  text: true,
  freehand: true,
  image: true,
  connector: true,
  frame: true,
  mindmap: true,
  kanban: true,
  table: true,
  comment: true,
  board: true,
};

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const shortStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Mensagem `{ key: 'board.activity.*', params? }` com parâmetros simples ou mensagens aninhadas (profundidade limitada). */
function validMessage(v: unknown, depth: number): boolean {
  if (!isPlain(v) || depth > ACTIVITY_LIMITS.depth) return false;
  for (const k of Object.keys(v)) if (k !== 'key' && k !== 'params') return false;
  if (!shortStr(v.key, ACTIVITY_LIMITS.keyChars) || !v.key.startsWith(KEY_PREFIX)) return false;
  if (v.params === undefined) return true;
  if (!isPlain(v.params)) return false;
  const entries = Object.entries(v.params);
  if (entries.length > ACTIVITY_LIMITS.params) return false;
  for (const [k, p] of entries) {
    if (k.length > 40) return false;
    if (p === null || typeof p === 'boolean' || isNum(p)) continue;
    if (typeof p === 'string') {
      if (p.length > ACTIVITY_LIMITS.stringChars) return false;
      continue;
    }
    if (!validMessage(p, depth + 1)) return false;
  }
  return true;
}

/**
 * Forma e tamanhos de uma entrada vinda do cliente. Devolve só os campos conhecidos (sem autor) ou `null`.
 * Usado pelo `parseClientMessage` (tempo real) e pelo `writeGuard` (PUT).
 */
export function sanitizeActivityEntry(v: unknown): Omit<BoardActivityEntry, 'actorId' | 'actorName' | 'actorRole'> | null {
  if (!isPlain(v)) return null;
  const e = v;
  if (!shortStr(e.id, ACTIVITY_LIMITS.idChars) || !isNum(e.timestamp)) return null;
  if (typeof e.action !== 'string' || !ACTIONS.has(e.action as BoardActivityAction)) return null;
  const out: Record<string, unknown> = { id: e.id, timestamp: e.timestamp, action: e.action };
  if (e.lastTimestamp !== undefined) {
    if (!isNum(e.lastTimestamp)) return null;
    out.lastTimestamp = e.lastTimestamp;
  }
  if (e.targetType !== undefined) {
    if (!shortStr(e.targetType, ACTIVITY_LIMITS.targetTypeChars) || !Object.prototype.hasOwnProperty.call(TARGET_TYPES, e.targetType)) return null;
    out.targetType = e.targetType;
  }
  if (e.targetCount !== undefined) {
    if (!Number.isInteger(e.targetCount) || (e.targetCount as number) < 0 || (e.targetCount as number) > 1_000_000) return null;
    out.targetCount = e.targetCount;
  }
  if (e.elementIds !== undefined) {
    if (!Array.isArray(e.elementIds) || e.elementIds.length > ACTIVITY_LIMITS.elementIds || !e.elementIds.every((x) => shortStr(x, ACTIVITY_LIMITS.elementIdChars))) return null;
    out.elementIds = [...e.elementIds];
  }
  if (e.detail !== undefined) {
    if (!shortStr(e.detail, ACTIVITY_LIMITS.keyChars) || !e.detail.startsWith(DETAIL_PREFIX)) return null;
    out.detail = e.detail;
  }
  if (e.message !== undefined) {
    if (!validMessage(e.message, 1)) return null;
    out.message = e.message;
  }
  if (e.viaExtension !== undefined) {
    const x = e.viaExtension;
    if (!isPlain(x) || Object.keys(x).some((k) => k !== 'id' && k !== 'name') || !shortStr(x.id, ACTIVITY_LIMITS.extensionChars) || !shortStr(x.name, ACTIVITY_LIMITS.extensionChars)) return null;
    out.viaExtension = { id: x.id, name: x.name };
  }
  return out as Omit<BoardActivityEntry, 'actorId' | 'actorName' | 'actorRole'>;
}

/** Ação do `can()` que a pessoa precisa ter para registrar esta entrada (`null` = nunca aceita). */
export function activityPermission(e: Pick<BoardActivityEntry, 'action' | 'targetType'>): PermissionAction | null {
  if (e.targetType === 'comment' || e.action === 'commented') return 'board.comment';
  switch (e.action) {
    case 'created':
    case 'updated':
    case 'moved':
    case 'deleted':
    case 'imported':
      return 'board.edit';
    case 'locked':
    case 'unlocked':
      return 'element.lockStandard';
    case 'voting':
      return 'voting.manage';
    case 'timer':
      return 'timer.manage';
    case 'private_mode_toggled':
      return 'privateMode.toggle';
    case 'private_notes_revealed':
      return 'privateMode.reveal';
    case 'follow_me':
      return 'followMe.lead';
    case 'access_changed':
      return 'board.share';
    case 'snapshot_restored':
      return 'board.restoreSnapshot';
    case 'exported':
      return 'board.export';
    default:
      return null;
  }
}
