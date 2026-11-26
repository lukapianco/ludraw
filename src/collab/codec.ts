/**
 * LuDraw — codec entre o conteúdo do board e o documento Yjs público (Chat 08). PURO (sem DOM, sem i18n):
 * o cliente (binding com o `useBoardStore`) e o servidor (Room) usam as mesmas funções.
 *
 * Esquema v1 do documento `board:<id>`:
 *   meta  : Y.Map  — v, epoch, grid, bg, view, tags, facilitators (cada campo é um valor JSON)
 *   els   : Y.Map<id, Y.Map>  — um Y.Map por elemento; cada campo do elemento é uma chave; `text` é Y.Text
 *   order : Y.Array<id>       — ordem de empilhamento (saneada a cada leitura: sem duplicados nem órfãos)
 *   fac   : Y.Map  — privateMode, timer, voting (parte pública), leader
 * Fora do documento: `zIndex` (derivado de `order`), `activityLog` (o servidor é a fonte), cédulas/respostas
 * (canal privado), texto das notas privadas (canal privado) e tudo que é só da tela.
 */
import { PROTO_KEYS } from '../utils/safeKeys';
import type * as Y from 'yjs';

/**
 * O módulo `yjs` NÃO é importado aqui: raiz e `server/` têm cada um a sua cópia, e duas cópias no mesmo processo quebram
 * `instanceof`. Quem usa este arquivo entrega a sua cópia uma vez, com `bindYjs(yjs)`.
 */
type YModule = typeof import('yjs');
let YV!: YModule;
export function bindYjs(mod: YModule): void {
  YV = mod;
}
import type { BoardData, CameraState, CanvasElement, FacilitationState, GridSettings, StickyNoteElement, StickyTag, TimerState, VotingState } from '../types/canvas';

export const SCHEMA_VERSION = 1;

/** Origens das transações (o binding do cliente ignora o eco da própria origem). */
export const ORIGIN = { local: 'od:local', server: 'od:server', seed: 'od:seed', replay: 'od:replay' } as const;

/** Campos do elemento que NÃO vão para o documento. */
export const EXCLUDED_ELEMENT_KEYS: ReadonlySet<string> = new Set(['zIndex']);

export interface PublicMeta {
  gridSettings: GridSettings;
  backgroundColor: string | null;
  initialView: CameraState | null;
  boardTags: StickyTag[];
  facilitatorIds: string[] | null;
}

export interface PublicPrivateMode {
  enabled: boolean;
  startedBy?: string;
  startedAt?: number;
}

/**
 * Totais da votação que o SERVIDOR decide mostrar (só ele escreve `fac.tally`): sem cédulas enquanto a
 * votação anônima não foi revelada; com cédulas e totais quando é aberta ou depois de revelar.
 */
export interface PublicTally {
  /** `startedAt` da votação a que os totais pertencem */
  session: number | null;
  votesByElement: Record<string, number>;
  ballots?: Record<string, Record<string, number>>;
  poll?: { responses: Record<string, string[]>; voterNames: Record<string, string> };
}

export interface PublicFac {
  privateMode: PublicPrivateMode;
  timer?: TimerState;
  voting?: VotingState;
  leaderUserId?: string | null;
  /** escrito só pelo servidor; o cliente nunca grava */
  tally?: PublicTally;
}

/** Fatia do board que vai para o documento. */
export interface BoardSlice {
  elements: Record<string, CanvasElement>;
  elementOrder: string[];
  meta: PublicMeta;
  fac: PublicFac;
}

export interface BoardRoots {
  meta: Y.Map<unknown>;
  els: Y.Map<Y.Map<unknown>>;
  order: Y.Array<string>;
  fac: Y.Map<unknown>;
}

export function rootsOf(doc: Y.Doc): BoardRoots {
  return { meta: doc.getMap('meta'), els: doc.getMap('els') as Y.Map<Y.Map<unknown>>, order: doc.getArray<string>('order'), fac: doc.getMap('fac') };
}

/* ------------------------------ utilidades ------------------------------ */

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

/** Troca o conteúdo de um Y.Text pelo mínimo de operações (prefixo/sufixo comuns). */
export function setYText(yt: Y.Text, next: string): void {
  const cur = yt.toString();
  if (cur === next) return;
  const max = Math.min(cur.length, next.length);
  let a = 0;
  while (a < max && cur.charCodeAt(a) === next.charCodeAt(a)) a++;
  let b = 0;
  while (b < max - a && cur.charCodeAt(cur.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++;
  const del = cur.length - a - b;
  if (del > 0) yt.delete(a, del);
  const ins = next.slice(a, next.length - b);
  if (ins) yt.insert(a, ins);
}

/* ------------------------------ privacidade da visão pública ------------------------------ */

/** Nota privada ativa? (o texto dela nunca entra no documento público). */
export const isDraft = (el: CanvasElement): el is StickyNoteElement => el.type === 'sticky' && !!(el as StickyNoteElement).isPrivateDraft;

/** O que o documento público guarda de um elemento: nota privada vai sem texto, tags e nomes (mesma regra do `redactBoard`). */
export function publicElement(el: CanvasElement): CanvasElement {
  if (!isDraft(el)) return el;
  return { ...el, text: '', tags: [], authorName: undefined, createdByName: undefined } as CanvasElement;
}

/** Parte pública da votação: sem cédulas, totais nem respostas (o servidor decide quando revelar). */
export function publicVoting(v: VotingState | undefined): VotingState | undefined {
  if (!v) return undefined;
  const { ballots: _b, votesByElement: _t, ...rest } = v;
  void _b;
  void _t;
  if (!rest.poll) return { ...rest, votesByElement: {} } as VotingState;
  const { responses: _r, voterNames: _n, ...pollRest } = rest.poll;
  void _r;
  void _n;
  return { ...rest, votesByElement: {}, poll: { ...pollRest, responses: {} } } as VotingState;
}

export function publicFacilitation(f: FacilitationState): PublicFac {
  const pm = f.privateMode;
  return {
    privateMode: { enabled: !!pm?.enabled, ...(pm?.startedBy !== undefined ? { startedBy: pm.startedBy } : {}), ...(pm?.startedAt !== undefined ? { startedAt: pm.startedAt } : {}) },
    ...(f.timer ? { timer: f.timer } : {}),
    ...(f.voting ? { voting: publicVoting(f.voting) } : {}),
    ...(f.leaderUserId !== undefined ? { leaderUserId: f.leaderUserId } : {}),
  };
}

/* ------------------------------ escrita ------------------------------ */

/** Cria/atualiza os campos de um elemento. `prev` (opcional) evita reler o que não mudou. */
export function writeElement(els: Y.Map<Y.Map<unknown>>, el: CanvasElement, prev?: CanvasElement): void {
  const rec = el as unknown as Record<string, unknown>;
  const existing = els.get(el.id);
  if (!existing) {
    const y = new YV.Map<unknown>();
    for (const [k, v] of Object.entries(rec)) {
      if (EXCLUDED_ELEMENT_KEYS.has(k) || v === undefined) continue;
      y.set(k, k === 'text' && typeof v === 'string' ? new YV.Text(v) : v);
    }
    els.set(el.id, y);
    return;
  }
  const before = (prev ?? undefined) as unknown as Record<string, unknown> | undefined;
  const keys = new Set([...Object.keys(rec), ...(before ? Object.keys(before) : [])]);
  for (const k of keys) {
    if (EXCLUDED_ELEMENT_KEYS.has(k)) continue;
    const v = rec[k];
    if (before && before[k] === v) continue;
    if (v === undefined) {
      if (existing.has(k)) existing.delete(k);
      continue;
    }
    if (k === 'text' && typeof v === 'string') {
      const cur = existing.get(k);
      if (cur instanceof YV.Text) setYText(cur, v);
      else existing.set(k, new YV.Text(v));
      continue;
    }
    const cur = existing.get(k);
    if (cur instanceof YV.Text ? true : !deepEqual(cur, v)) existing.set(k, v);
  }
}

/**
 * Chat 08.7 · R4 (S-32): chaves que mexeriam no protótipo de um objeto comum (`out[k] = v` com `__proto__` troca o
 * protótipo daquele objeto). Vêm de outra pessoa pelo documento ao vivo: são ignoradas.
 */
export { PROTO_KEYS } from '../utils/safeKeys';

export function readElement(y: Y.Map<unknown>): CanvasElement {
  const out: Record<string, unknown> = {};
  y.forEach((v, k) => {
    if (PROTO_KEYS.has(k)) return;
    out[k] = v instanceof YV.Text ? v.toString() : v;
  });
  return out as unknown as CanvasElement;
}

export function readMeta(meta: Y.Map<unknown>): PublicMeta {
  return {
    gridSettings: (meta.get('grid') as GridSettings | undefined) ?? ({} as GridSettings),
    backgroundColor: (meta.get('bg') as string | null | undefined) ?? null,
    initialView: (meta.get('view') as CameraState | null | undefined) ?? null,
    boardTags: (meta.get('tags') as StickyTag[] | undefined) ?? [],
    facilitatorIds: (meta.get('facilitators') as string[] | null | undefined) ?? null,
  };
}

export function readFac(fac: Y.Map<unknown>): PublicFac {
  const pm = fac.get('privateMode') as PublicPrivateMode | undefined;
  const timer = fac.get('timer') as TimerState | undefined;
  const voting = fac.get('voting') as VotingState | undefined;
  const leader = fac.get('leader') as string | null | undefined;
  const tally = fac.get('tally') as PublicTally | undefined;
  return { privateMode: pm ?? { enabled: false }, ...(timer ? { timer } : {}), ...(voting ? { voting } : {}), ...(leader !== undefined ? { leaderUserId: leader } : {}), ...(tally ? { tally } : {}) };
}

/** Só o servidor chama: grava os totais visíveis (sem mudar nada se já estiverem iguais). */
export function writeTally(doc: Y.Doc, tally: PublicTally | null, origin: string = ORIGIN.server): boolean {
  const fac = doc.getMap('fac');
  const cur = fac.get('tally');
  if (tally === null ? cur === undefined : deepEqual(cur, tally)) return false;
  doc.transact(() => {
    if (tally === null) fac.delete('tally');
    else fac.set('tally', tally);
  }, origin);
  return true;
}

/** Ordem saneada: sem duplicados, sem ids que não existem, e os elementos fora da lista entram no fim (ordem estável). */
export function readOrder(roots: BoardRoots): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of roots.order.toArray()) {
    if (typeof id !== 'string' || seen.has(id) || !roots.els.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const missing: CanvasElement[] = [];
  roots.els.forEach((y, id) => {
    if (!seen.has(id)) missing.push(readElement(y));
  });
  missing.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || (a.id < b.id ? -1 : 1));
  for (const el of missing) out.push(el.id);
  return out;
}

export function readSlice(doc: Y.Doc): BoardSlice {
  const roots = rootsOf(doc);
  const elements: Record<string, CanvasElement> = {};
  roots.els.forEach((y, id) => {
    if (PROTO_KEYS.has(id)) return;
    elements[id] = readElement(y);
  });
  return { elements, elementOrder: readOrder(roots), meta: readMeta(roots.meta), fac: readFac(roots.fac) };
}

export function docEpoch(doc: Y.Doc): string | null {
  const v = doc.getMap('meta').get('epoch');
  return typeof v === 'string' ? v : null;
}

export function isSeeded(doc: Y.Doc): boolean {
  return docEpoch(doc) !== null;
}

export function writeMetaFields(meta: Y.Map<unknown>, next: PublicMeta, prev?: PublicMeta): void {
  const pairs: [string, unknown, unknown][] = [
    ['grid', next.gridSettings, prev?.gridSettings],
    ['bg', next.backgroundColor, prev?.backgroundColor],
    ['view', next.initialView, prev?.initialView],
    ['tags', next.boardTags, prev?.boardTags],
    ['facilitators', next.facilitatorIds, prev?.facilitatorIds],
  ];
  for (const [k, v, p] of pairs) {
    if (prev && deepEqual(v, p)) continue;
    if (!deepEqual(meta.get(k), v)) meta.set(k, v);
  }
}

export function writeFacFields(fac: Y.Map<unknown>, next: PublicFac, prev?: PublicFac): void {
  const pairs: [string, unknown, unknown][] = [
    ['privateMode', next.privateMode, prev?.privateMode],
    ['timer', next.timer, prev?.timer],
    ['voting', next.voting, prev?.voting],
    ['leader', next.leaderUserId, prev?.leaderUserId],
  ];
  for (const [k, v, p] of pairs) {
    if (prev && deepEqual(v, p)) continue;
    if (v === undefined) {
      if (fac.has(k)) fac.delete(k);
    } else if (!deepEqual(fac.get(k), v)) fac.set(k, v);
  }
}

/** Primeira gravação de um documento vazio (semeadura a partir do que está no banco). */
export function seedDoc(doc: Y.Doc, slice: BoardSlice, epoch: string): void {
  doc.transact(() => {
    const r = rootsOf(doc);
    r.meta.set('v', SCHEMA_VERSION);
    r.meta.set('epoch', epoch);
    writeMetaFields(r.meta, slice.meta);
    const ids = slice.elementOrder.filter((id) => slice.elements[id]);
    for (const id of Object.keys(slice.elements)) if (!ids.includes(id)) ids.push(id);
    for (const id of ids) writeElement(r.els, slice.elements[id]);
    r.order.push(slice.elementOrder.filter((id) => slice.elements[id]));
    writeFacFields(r.fac, slice.fac);
  }, ORIGIN.seed);
}

function applyOrderChange(order: Y.Array<string>, prev: string[], next: string[]): void {
  if (deepEqual(prev, next)) return;
  const isPrefix = prev.length <= next.length && prev.every((id, i) => next[i] === id);
  if (isPrefix) {
    const added = next.slice(prev.length);
    if (added.length) order.push(added);
    return;
  }
  const keep = new Set(next);
  const removedOnly = prev.filter((id) => keep.has(id)).length === next.length && next.every((id, i) => prev.filter((p) => keep.has(p))[i] === id);
  if (removedOnly) {
    // remove pelos índices ATUAIS do documento (outras pessoas podem ter mexido na lista)
    const gone = new Set(prev.filter((id) => !keep.has(id)));
    const cur = order.toArray();
    for (let i = cur.length - 1; i >= 0; i--) if (gone.has(cur[i])) order.delete(i, 1);
    return;
  }
  // reordenação: troca a lista inteira
  const len = order.length;
  if (len) order.delete(0, len);
  if (next.length) order.push(next);
}

/**
 * Grava no documento a diferença entre dois estados do store. `transform` converte cada elemento no que
 * vai para o documento público (ex.: `publicElement`). Devolve true se algo foi escrito.
 */
export function applyLocalChange(doc: Y.Doc, prev: BoardSlice, next: BoardSlice, origin: string = ORIGIN.local, transform: (el: CanvasElement) => CanvasElement = (e) => e): boolean {
  let wrote = false;
  doc.transact(() => {
    const r = rootsOf(doc);
    for (const [id, el] of Object.entries(next.elements)) {
      const before = prev.elements[id];
      if (before === el) continue;
      writeElement(r.els, transform(el), before ? transform(before) : undefined);
      wrote = true;
    }
    for (const id of Object.keys(prev.elements)) {
      if (!next.elements[id] && r.els.has(id)) {
        r.els.delete(id);
        wrote = true;
      }
    }
    if (prev.elementOrder !== next.elementOrder) {
      applyOrderChange(r.order, prev.elementOrder, next.elementOrder);
      wrote = true;
    }
    if (prev.meta !== next.meta) writeMetaFields(r.meta, next.meta, prev.meta);
    if (prev.fac !== next.fac) writeFacFields(r.fac, next.fac, prev.fac);
  }, origin);
  return wrote;
}

/* ------------------------------ observação ------------------------------ */

export interface BoardChange {
  /** elementos que mudaram (criados, alterados ou removidos) */
  ids: Set<string>;
  order: boolean;
  meta: boolean;
  fac: boolean;
  origin: unknown;
  local: boolean;
}

/** Observa o documento e entrega, por transação, o que mudou (sem reler tudo). Devolve a função que desliga. */
export function observeBoard(doc: Y.Doc, handler: (change: BoardChange, transaction: Y.Transaction) => void): () => void {
  const r = rootsOf(doc);
  const mk = (tr: Y.Transaction): BoardChange => ({ ids: new Set(), order: false, meta: false, fac: false, origin: tr.origin, local: tr.local });
  const onEls = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
    const c = mk(tr);
    for (const ev of events) {
      if (ev.target === r.els) (ev as Y.YMapEvent<Y.Map<unknown>>).keysChanged.forEach((k) => c.ids.add(k));
      else if (typeof ev.path[0] === 'string') c.ids.add(ev.path[0]);
    }
    if (c.ids.size) handler(c, tr);
  };
  const onOrder = (_e: unknown, tr: Y.Transaction) => handler({ ...mk(tr), order: true }, tr);
  const onMeta = (_e: unknown, tr: Y.Transaction) => handler({ ...mk(tr), meta: true }, tr);
  const onFac = (_e: unknown, tr: Y.Transaction) => handler({ ...mk(tr), fac: true }, tr);
  r.els.observeDeep(onEls);
  r.order.observeDeep(onOrder);
  r.meta.observeDeep(onMeta);
  r.fac.observeDeep(onFac);
  return () => {
    r.els.unobserveDeep(onEls);
    r.order.unobserveDeep(onOrder);
    r.meta.unobserveDeep(onMeta);
    r.fac.unobserveDeep(onFac);
  };
}

/** Conteúdo completo do documento como `BoardData` (sem Activity Log; o servidor acrescenta o que é dele). */
export function sliceToBoardData(slice: BoardSlice, base?: Partial<BoardData>): BoardData {
  const f: FacilitationState = {
    privateMode: { enabled: !!slice.fac.privateMode.enabled, previewOwnNotes: false, ...stripUndefined({ startedBy: slice.fac.privateMode.startedBy, startedAt: slice.fac.privateMode.startedAt }) },
    ...(slice.fac.timer ? { timer: slice.fac.timer } : {}),
    ...(slice.fac.voting ? { voting: slice.fac.voting } : {}),
    ...(slice.fac.leaderUserId !== undefined ? { leaderUserId: slice.fac.leaderUserId } : {}),
  };
  return {
    ...(base ?? {}),
    version: 1,
    elements: slice.elements,
    elementOrder: slice.elementOrder,
    gridSettings: slice.meta.gridSettings,
    backgroundColor: slice.meta.backgroundColor,
    initialView: slice.meta.initialView,
    boardTags: slice.meta.boardTags,
    facilitation: f,
    ...(slice.meta.facilitatorIds ? { facilitatorIds: slice.meta.facilitatorIds } : {}),
  } as BoardData;
}

/** `BoardData` → fatia pública (o que o documento guarda). */
export function boardDataToSlice(data: BoardData): BoardSlice {
  const elements: Record<string, CanvasElement> = {};
  for (const [id, el] of Object.entries(data.elements)) elements[id] = publicElement(el);
  const facilitation: FacilitationState = data.facilitation ?? { privateMode: { enabled: false, previewOwnNotes: false } };
  return {
    elements,
    elementOrder: data.elementOrder.filter((id) => !!data.elements[id]),
    meta: {
      gridSettings: data.gridSettings,
      backgroundColor: data.backgroundColor ?? null,
      initialView: data.initialView ?? null,
      boardTags: data.boardTags ?? [],
      facilitatorIds: data.facilitatorIds ?? null,
    },
    fac: publicFacilitation(facilitation),
  };
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}
