/**
 * LuDraw — protocolo do tempo real (Chat 08). PURO: cliente e servidor importam este arquivo.
 *
 * Um board em colaboração tem UM documento Yjs compartilhado (`board:<id>`) e um canal PRIVADO por
 * conexão (mensagens `stateless` autenticadas). O Hocuspocus guarda um `Document` por NOME, então um
 * documento "só meu" não pode ter o mesmo nome para todos: o que é privado (texto das próprias notas
 * privadas, cédulas e respostas de enquete da própria pessoa) viaja pelo canal `me.*`, cujo dono é, por
 * construção, a pessoa autenticada naquela conexão (a mensagem nem tem campo de dono).
 */
import type { StoredMessage } from '../i18n/types';
import type { BoardActivityEntry, StickyTag } from '../types/canvas';
import { sanitizeActivityEntry } from '../utils/activityRules';

export const COLLAB_PATH = '/api/v1/collab';
export const PROTOCOL_VERSION = 1;

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** Único nome de documento aceito pelo servidor. Qualquer outro (inclusive `board:<id>:me`) é recusado. */
export function boardDocName(boardId: string): string {
  return `board:${boardId}`;
}

/** Devolve o id do board se `name` for EXATAMENTE `board:<id>`; senão null. */
export function parseBoardDocName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.startsWith('board:')) return null;
  const id = name.slice(6);
  return ID_RE.test(id) ? id : null;
}

/** Credencial no handshake: JSON em string (o provider só aceita string). `e` = época do documento local. */
export interface CollabCredential {
  /** access token (membro) ou token de visitante */
  t: string;
  /** 'v' = visitante (link público) */
  k?: 'v';
  /** época do documento guardado no navegador (y-indexeddb); ausente = nenhum */
  e?: string | null;
}

export function encodeCredential(c: CollabCredential): string {
  return JSON.stringify(c);
}

export function decodeCredential(raw: unknown): CollabCredential | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const v = JSON.parse(raw) as CollabCredential;
    if (!v || typeof v.t !== 'string' || !v.t) return null;
    if (v.k !== undefined && v.k !== 'v') return null;
    if (v.e !== undefined && v.e !== null && typeof v.e !== 'string') return null;
    return v;
  } catch {
    return null;
  }
}

/** Códigos de fechamento (4000+ = decisão do LuDraw). */
export const CLOSE = {
  denied: 4403,
  notFound: 4404,
  unauthorized: 4401,
  rateLimited: 4429,
  tooLarge: 4413,
  reset: 4409,
} as const;

/** Mensagem traduzível enviada pelo servidor (chave + parâmetros; o cliente traduz). */
export type WireMessage = StoredMessage;

/* ------------------------------ cliente → servidor ------------------------------ */

export type ClientMessage =
  | { t: 'cursor'; x: number; y: number }
  /** centro da tela da pessoa em coordenadas do board + zoom (independe do tamanho da janela) */
  | { t: 'view'; x: number; y: number; zoom: number }
  | { t: 'follow'; userId: string | null }
  | { t: 'editing'; id: string | null }
  /** elementos que a pessoa selecionou (caixa de seleção colorida nas telas dos outros) */
  | { t: 'select'; ids: string[] }
  /** caixa de seleção por arrasto, em coordenadas do board (null = soltou o mouse) */
  | { t: 'marquee'; rect: WireRect | null }
  | { t: 'ping'; c: number }
  /** texto/tags da própria nota privada (privado até ser revelada) */
  | { t: 'me.draft'; id: string; text: string; tags: StickyTag[]; rev: number }
  /** cédulas da própria pessoa na votação por pontos (`session` = `startedAt` da votação) */
  | { t: 'me.ballot'; session: number; ballot: Record<string, number> }
  /** resposta da própria pessoa numa enquete */
  | { t: 'me.poll'; session: number; options: string[]; name?: string }
  /** pede o estado privado de volta (abertura da conexão) */
  | { t: 'me.hello' }
  /**
   * Chat 08.2: reenvio das mudanças feitas sem rede, objeto por objeto. Entre `on` e `off`, uma atualização recusada
   * pelo veto NÃO fecha a conexão: volta `denied` com `scope: 'object'` e os ids; no `off` vem `batch.result`.
   */
  | { t: 'batch'; on: boolean }
  /** entradas do Activity Log criadas por esta pessoa (o servidor carimba o autor e grava) */
  | { t: 'me.activity'; entries: BoardActivityEntry[] };

/* ------------------------------ servidor → cliente ------------------------------ */

export interface WireRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  role: string;
  /** vários navegadores da mesma pessoa contam como uma só */
  connections: number;
}

export type ServerMessage =
  | { t: 'hello'; v: number; epoch: string; userId: string; name: string; color: string; readOnly: boolean; serverTime: number; hideCursors: boolean; maxPayloadMb: number }
  | { t: 'presence'; users: PresenceUser[] }
  | { t: 'pointers'; at: number; cursors: Record<string, { x: number; y: number }>; editing: Record<string, string | null>; selection: Record<string, string[]>; marquee: Record<string, WireRect | null> }
  | { t: 'view'; userId: string; x: number; y: number; zoom: number }
  | {
      t: 'me.state';
      drafts: Record<string, { text: string; tags: StickyTag[]; rev: number }>;
      ballot: Record<string, number> | null;
      poll: { options: string[]; name?: string } | null;
      session: number | null;
      /** minha chave opaca nas respostas de enquete anônima (para não contar a mim duas vezes) */
      pollKey: string;
      /** resultado parcial da enquete, só para quem gerencia a votação */
      pollAll: { responses: Record<string, string[]>; voterNames: Record<string, string> } | null;
    }
  | { t: 'denied'; reason: WireMessage; scope: 'document' | 'private' | 'rate' }
  /** Chat 08.2: no reenvio offline, só esta atualização (estes objetos) foi recusada; a conexão continua */
  | { t: 'denied'; reason: WireMessage; scope: 'object'; ids: string[] }
  /** Chat 08.2: fim de um lote de reenvio — quantas atualizações entraram e o que foi recusado */
  | { t: 'batch.result'; accepted: number; denied: { ids: string[]; reason: WireMessage }[] }
  /**
   * Chat 08.2: o servidor arbitrou a seleção/edição. `inUse` = outra pessoa (`by`) chegou antes; `idle` = a pessoa
   * ficou sem atividade e o servidor soltou o objeto para os outros. O cliente desmarca estes ids.
   */
  | { t: 'select.denied'; ids: string[]; by: string | null; reason: 'inUse' | 'idle' }
  | { t: 'reset'; reason: 'epoch' | 'replaced' }
  | { t: 'reload'; reason: 'restored' | 'replaced' | 'access'; by?: string }
  /** Activity Log carimbado pelo servidor; `replace` = lista inteira (ao entrar) */
  | { t: 'activity'; entries: BoardActivityEntry[]; replace?: boolean }
  | { t: 'pong'; c: number; s: number }
  | { t: 'cursors.hidden'; hidden: boolean };

export function encodeMessage(m: ClientMessage | ServerMessage): string {
  return JSON.stringify(m);
}

const CLIENT_TYPES = new Set(['cursor', 'view', 'follow', 'editing', 'select', 'marquee', 'ping', 'batch', 'me.draft', 'me.ballot', 'me.poll', 'me.hello', 'me.activity']);

/** Aceita só o que tem a forma esperada (o servidor nunca confia no que chega). */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 600_000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (typeof m.t !== 'string' || !CLIENT_TYPES.has(m.t)) return null;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e9;
  /** instante em ms (timestamp de 13 dígitos): `startedAt` da votação identifica a sessão */
  const stamp = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 1e15;
  switch (m.t) {
    case 'cursor':
      return num(m.x) && num(m.y) ? { t: 'cursor', x: m.x as number, y: m.y as number } : null;
    case 'view':
      return num(m.x) && num(m.y) && num(m.zoom) && (m.zoom as number) > 0 ? { t: 'view', x: m.x as number, y: m.y as number, zoom: m.zoom as number } : null;
    case 'follow':
      return m.userId === null || (typeof m.userId === 'string' && m.userId.length <= 80) ? { t: 'follow', userId: m.userId as string | null } : null;
    case 'editing':
      return m.id === null || (typeof m.id === 'string' && m.id.length <= 80) ? { t: 'editing', id: m.id as string | null } : null;
    case 'marquee': {
      const r = m.rect as Record<string, unknown> | null;
      if (r === null) return { t: 'marquee', rect: null };
      return r && typeof r === 'object' && num(r.x) && num(r.y) && num(r.width) && num(r.height) ? { t: 'marquee', rect: { x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number } } : null;
    }
    case 'select':
      return Array.isArray(m.ids) && m.ids.length <= 200 && m.ids.every((i) => typeof i === 'string' && i.length <= 80) ? { t: 'select', ids: m.ids as string[] } : null;
    case 'ping':
      return num(m.c) ? { t: 'ping', c: m.c as number } : null;
    case 'batch':
      return typeof m.on === 'boolean' ? { t: 'batch', on: m.on } : null;
    case 'me.hello':
      return { t: 'me.hello' };
    case 'me.activity': {
      if (!Array.isArray(m.entries) || m.entries.length > 20 || raw.length > 40_000) return null;
      const entries = (m.entries as unknown[]).map(activityEntry).filter((e): e is BoardActivityEntry => !!e);
      return entries.length ? { t: 'me.activity', entries } : null;
    }
    case 'me.draft': {
      if (typeof m.id !== 'string' || m.id.length > 80 || typeof m.text !== 'string' || !Array.isArray(m.tags) || m.tags.length > 50 || !Number.isInteger(m.rev)) return null;
      const tags = (m.tags as unknown[]).filter((t): t is StickyTag => !!t && typeof t === 'object' && typeof (t as StickyTag).id === 'string' && typeof (t as StickyTag).label === 'string');
      return { t: 'me.draft', id: m.id, text: m.text, tags, rev: m.rev as number };
    }
    case 'me.ballot': {
      if (!stamp(m.session) || !m.ballot || typeof m.ballot !== 'object' || Array.isArray(m.ballot)) return null;
      const ballot: Record<string, number> = {};
      for (const [k, n] of Object.entries(m.ballot as Record<string, unknown>)) {
        if (k.length > 160 || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1000) return null;
        if (n > 0) ballot[k] = n;
        if (Object.keys(ballot).length > 2000) return null;
      }
      return { t: 'me.ballot', session: m.session as number, ballot };
    }
    case 'me.poll': {
      if (!stamp(m.session) || !Array.isArray(m.options) || m.options.length > 50 || m.options.some((o) => typeof o !== 'string' || o.length > 80)) return null;
      if (m.name !== undefined && (typeof m.name !== 'string' || m.name.length > 200)) return null;
      return { t: 'me.poll', session: m.session as number, options: m.options as string[], ...(m.name !== undefined ? { name: m.name as string } : {}) };
    }
  }
  return null;
}

/**
 * Entrada do Activity Log enviada pelo cliente: só campos conhecidos, tipo da lista e tamanhos limitados (o autor é
 * do servidor). Chat 08.7 · R2 (S-03): a regra mora em `utils/activityRules.ts` (a mesma do PUT).
 */
function activityEntry(v: unknown): BoardActivityEntry | null {
  return sanitizeActivityEntry(v) as BoardActivityEntry | null;
}

/** Limites de taxa por conexão (mensagens por janela). Usado pelo servidor; o cliente respeita para não ser cortado. */
export const RATE = {
  windowMs: 1000,
  /** cursor/view/editing/follow juntos */
  presencePerWindow: 80,
  /** me.* juntos */
  privatePerWindow: 40,
  /** sync do Yjs (atualizações do documento) */
  syncPerWindow: 150,
  /** estouro seguido por X janelas → fecha a conexão */
  strikesToClose: 5,
  /**
   * Chat 08.7 · R2 (S-03): entradas NOVAS do Activity Log por conexão por minuto (o excesso é ignorado). Atualizar a
   * própria entrada agrupada (8 s) não conta. Medido no store real: colar 200 objetos de 3 tipos = 3 entradas;
   * 10 colagens seguidas = 6 entradas (16 mensagens) — o teto deixa folga de mais de 20×.
   */
  activityNewPerMinute: 120,
  /** Chat 08.2: teto de atualizações num lote de reenvio offline (acima disso o lote acaba e a recusa volta a fechar) */
  batchMaxUpdates: 400,
  /** Chat 08.2: duração máxima de um lote de reenvio offline (ms) */
  batchMaxMs: 30_000,
  /** envio de cursor do cliente (ms) — ~30 Hz; a tela interpola em 60 FPS */
  cursorIntervalMs: 33,
  viewIntervalMs: 120,
} as const;

/** Paleta de presença (mesma de `COLLABORATOR_COLORS` em `components/ui/Presence.tsx`). */
export const COLLABORATOR_PALETTE: readonly string[] = ['#E5484D', '#2C64A8', '#A66A12', '#8C4A7A', '#0E8A7D', '#D9480F', '#6634D9', '#3A8156'];

/** Cor estável de presença para quem não tem `avatarColor` (visitantes). */
export function presenceColor(userId: string, palette: readonly string[]): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
