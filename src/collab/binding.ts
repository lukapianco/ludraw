/**
 * LuDraw — liga o `useBoardStore` ao documento Yjs público (Chat 08). O store e o `CanvasStage` não sabem
 * que existe rede: a única porta é `store.applyRemote` (entrada) e a assinatura do store (saída).
 *
 *  store → documento: a assinatura junta as mudanças (~30 Hz, e já no soltar do mouse) e grava só a diferença
 *     (`applyLocalChange`) numa transação de origem `od:local`. Texto de nota privada própria NÃO vai: segue
 *     pelo canal privado (`me.draft`), assim como cédulas e respostas (`me.ballot`, `me.poll`).
 *  documento → store: `observeBoard` entrega os ids que mudaram; só eles viram elementos novos (o resto mantém
 *     a referência, então nada re-renderiza à toa).
 *  desfazer: `Y.UndoManager` só das transações `od:local` — desfazer não apaga o que os outros fizeram.
 */
import * as Y from 'yjs';
import type { BoardSlice, PublicTally } from './codec';
import {
  ORIGIN,
  applyLocalChange,
  bindYjs,
  deepEqual,
  isDraft,
  isSeeded,
  observeBoard,
  publicElement,
  publicFacilitation,
  readElement,
  readFac,
  readMeta,
  readOrder,
  rootsOf,
} from './codec';
import { RATE, type ClientMessage, type ServerMessage, type WireMessage } from './protocol';
import { isEmptyPlan, planReplay, sendReplay, type ReplayPlan } from './replay';
import { assetHashOf, isRasterDataUrl } from '../utils/assetRefs';
import { useBoardStore, type BoardState, type RemotePatch } from '../store/useBoardStore';
import type { BoardActivityEntry, CanvasElement, FacilitationState, StickyNoteElement, StickyTag, VotingState } from '../types/canvas';

bindYjs(Y);

export interface BindingOptions {
  /** envia uma mensagem do canal privado (`me.*`) */
  sendPrivate: (msg: ClientMessage) => void;
  /** gravação local parada (somente leitura ou sem acesso) */
  isReadOnly: () => boolean;
  /** Chat 08.2: o documento está sincronizado com o servidor agora? (falso = escrevendo sem rede) */
  isLive?: () => boolean;
  /** Chat 08.2: chamado UMA vez antes da primeira escrita sem rede (a sessão guarda a base e para de sincronizar) */
  onOfflineWrite?: () => void;
  /**
   * Chat 08.2: imagens no Modo Servidor ao vivo. Imagem embutida nova fica FORA do documento até subir (o documento só
   * recebe `asset:<sha256>`); referência vinda de outro board, até o vínculo por prova de acesso. Falhou → a imagem sai
   * da tela com o motivo (nada é referenciado). Sem rede, entra no documento local e o reenvio sobe antes.
   */
  assets?: {
    upload: (dataUrl: string) => Promise<string>;
    /** devolve os hashes que NÃO puderam ser vinculados */
    link: (hashes: string[]) => Promise<string[]>;
    /** `link` = a imagem veio de um board que a pessoa não pode ver; senão o motivo do envio (ou null) */
    failed: (reason: string | null, link: boolean) => void;
  };
}

/** Chat 08.2: canal do lote de reenvio (`batch on` não espera; `batch off` devolve o resumo do servidor). */
export interface ReplayIo {
  batch: (on: boolean) => Promise<{ accepted: number; denied: { ids: string[]; reason: WireMessage }[] }>;
}

export interface ReplayOutcome {
  plan: ReplayPlan;
  /** recusados pelo servidor (em uso, sem permissão, limites), com o motivo */
  denied: { ids: string[]; reason: WireMessage }[];
  /** apagados por outra pessoa enquanto esta estava sem rede (a edição não os ressuscita) */
  gone: string[];
}

export interface Binding {
  /** Reconcilia o store com o documento inteiro (depois de carregar do navegador e a cada sincronização). `force` = o documento manda em tudo. */
  hydrate: (force?: boolean) => void;
  /** Activity Log carimbado pelo servidor (`replace` = lista inteira). */
  applyActivity: (entries: BoardActivityEntry[], replace: boolean) => void;
  /** Estado privado devolvido pelo servidor (`me.state`). */
  applyMeState: (m: Extract<ServerMessage, { t: 'me.state' }>) => void;
  /** Escritas locais pendentes vão agora (soltar do mouse, fechar a aba). */
  flush: () => void;
  /** Descarta o que o servidor não aceitou: o documento local recomeça. */
  destroy: () => void;
  /** Chat 08.2: o servidor confirmou tudo o que o documento tem (a sombra vira a base confirmada). */
  markConfirmed: () => void;
  /** Chat 08.2: base confirmada atual (null = ainda não sincronizou nesta vida do documento). */
  confirmedSlice: () => BoardSlice | null;
  /** Chat 08.2: base confirmada guardada no navegador (página recarregada ainda sem rede). */
  setConfirmed: (slice: BoardSlice) => void;
  /** Chat 08.2: estado desejado agora (o store, em termos do documento). */
  snapshot: () => BoardSlice;
  /** Chat 08.2: há mudanças em relação à base confirmada (feitas sem rede ou não confirmadas)? */
  hasOfflineChanges: () => boolean;
  /** Chat 08.2: reenvia, objeto por objeto, o que mudou entre `base` e `desired` (documento já sincronizado e hidratado). */
  replay: (base: BoardSlice, desired: BoardSlice, io: ReplayIo) => Promise<ReplayOutcome>;
}

/** Objetos por lote de reenvio (folga sob `RATE.batchMaxUpdates`) e por janela de taxa (folga sob `RATE.syncPerWindow`). */
const REPLAY_LOT = Math.max(1, RATE.batchMaxUpdates - 100);
const REPLAY_PACE = Math.max(1, RATE.syncPerWindow - 50);

const FLUSH_MS = 33;
const DRAFT_MS = 250;

const stripZ = (el: CanvasElement): Record<string, unknown> => {
  const { zIndex: _z, ...rest } = el as unknown as Record<string, unknown>;
  void _z;
  return rest;
};

const sumBallots = (ballots: Record<string, Record<string, number>>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const byItem of Object.values(ballots)) for (const [k, n] of Object.entries(byItem)) if (n > 0) out[k] = (out[k] ?? 0) + n;
  return out;
};

export function createBinding(doc: Y.Doc, opts: BindingOptions): Binding {
  const store = useBoardStore;
  const roots = rootsOf(doc);
  const me = () => store.getState().access.userId;

  /* ---------- o que o documento já reflete, em termos do store ---------- */
  const sliceOf = (s: BoardState, prevFacRef?: { ref: FacilitationState; pub: ReturnType<typeof publicFacilitation> }): BoardSlice => ({
    elements: s.elements,
    elementOrder: s.elementOrder,
    meta: { gridSettings: s.gridSettings, backgroundColor: s.backgroundColor, initialView: s.initialView, boardTags: s.boardTags, facilitatorIds: s.facilitatorIds },
    fac: prevFacRef && prevFacRef.ref === s.facilitation ? prevFacRef.pub : publicFacilitation(s.facilitation),
  });
  let facCache: { ref: FacilitationState; pub: ReturnType<typeof publicFacilitation> } = { ref: store.getState().facilitation, pub: publicFacilitation(store.getState().facilitation) };
  const current = (): BoardSlice => {
    const s = store.getState();
    if (facCache.ref !== s.facilitation) facCache = { ref: s.facilitation, pub: publicFacilitation(s.facilitation) };
    return sliceOf(s, facCache);
  };
  let shadow: BoardSlice = current();
  let seededAtAttach = isSeeded(doc);
  /** Chat 08.2: o que o servidor já confirmou (base do reenvio por objeto) */
  let confirmed: BoardSlice | null = null;
  let offlineNoted = false;
  /** o que o servidor sabe do canal privado */
  const mineDrafts = new Map<string, { text: string; tags: StickyTag[]; rev: number }>();
  const sentDrafts = new Map<string, { text: string; tags: string }>();
  let draftRev = Date.now();
  let session: number | null = null;
  let sentBallot = '';
  let sentPoll = '';

  /* ---------- store → documento ---------- */
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const canWrite = () => isSeeded(doc) && !opts.isReadOnly();

  /* ---------- Chat 08.2: imagens que esperam subir/vincular antes de entrar no documento ---------- */
  /** hashes que este board já usa (estão ou estiveram no documento, ou subiram daqui) */
  const knownHashes = new Set<string>();
  const remember = (els: Record<string, CanvasElement>, ids?: Iterable<string>) => {
    for (const id of ids ?? Object.keys(els)) {
      const h = els[id]?.type === 'image' ? assetHashOf((els[id] as unknown as { dataUrl?: string }).dataUrl ?? '') : null;
      if (h) knownHashes.add(h);
    }
  };
  remember(shadow.elements);
  /** id → fonte que está subindo/vinculando agora */
  const pendingImages = new Map<string, string>();

  const settleImage = (id: string, source: string, outcome: { ref: string } | { error: string | null; link?: boolean }) => {
    if (pendingImages.get(id) !== source) return;
    pendingImages.delete(id);
    if (disposed) return;
    const cur = store.getState().elements[id] as (CanvasElement & { dataUrl?: string }) | undefined;
    if (!cur || cur.type !== 'image' || cur.dataUrl !== source) return; // mudou ou saiu nesse meio-tempo
    if ('ref' in outcome) {
      const h = assetHashOf(outcome.ref);
      if (h) knownHashes.add(h);
      // troca a fonte sem passo de desfazer nem atividade; a assinatura leva o elemento (já com a referência) ao documento
      store.getState().applyRemote({ upsert: [{ ...cur, dataUrl: outcome.ref } as CanvasElement] });
      schedule();
      return;
    }
    // falhou: a referência não é gravada; o objeto volta ao que o documento tem (ou sai, se era novo)
    const before = shadow.elements[id];
    store.getState().applyRemote(before ? { upsert: [before] } : { remove: [id] });
    opts.assets?.failed(outcome.error, !!outcome.link);
  };

  /** Ids de imagem que ainda não podem ir ao documento (e dispara o envio/vínculo). */
  const heldImages = (next: BoardSlice): Set<string> => {
    const held = new Set<string>();
    const assets = opts.assets;
    if (!assets || !(opts.isLive?.() ?? true)) return held;
    for (const [id, el] of Object.entries(next.elements)) {
      if (el.type !== 'image' || el === shadow.elements[id]) continue;
      const src = (el as unknown as { dataUrl?: string }).dataUrl ?? '';
      const before = (shadow.elements[id] as unknown as { dataUrl?: string } | undefined)?.dataUrl;
      if (src === before) continue;
      const hash = assetHashOf(src);
      if (!isRasterDataUrl(src) && !(hash && !knownHashes.has(hash))) continue;
      held.add(id);
      if (pendingImages.get(id) === src) continue;
      pendingImages.set(id, src);
      if (hash) {
        void assets.link([hash]).then(
          (missing) => settleImage(id, src, missing.length ? { error: null, link: true } : { ref: src }),
          () => settleImage(id, src, { error: null, link: true }),
        );
      } else {
        void assets.upload(src).then(
          (ref) => settleImage(id, src, { ref }),
          (e: unknown) => settleImage(id, src, { error: (e as { text?: () => string })?.text?.() ?? null }),
        );
      }
    }
    return held;
  };

  const flushPublic = () => {
    timer = null;
    if (disposed || applying || !canWrite()) return;
    let next = current();
    if (next.elements === shadow.elements && next.elementOrder === shadow.elementOrder && next.fac === shadow.fac && sameMeta(next.meta, shadow.meta)) return;
    // Chat 08.2: primeira escrita sem rede — a sessão guarda a base confirmada e deixa de sincronizar este documento
    // (ao reconectar, o reenvio é feito objeto por objeto)
    if (opts.isLive && !opts.isLive() && !offlineNoted) {
      offlineNoted = true;
      opts.onOfflineWrite?.();
    }
    // Chat 08.2: imagens que ainda estão subindo ficam como o documento as tem (voltam na próxima rodada)
    const held = heldImages(next);
    if (held.size) {
      const elements = { ...next.elements };
      for (const id of held) {
        if (shadow.elements[id]) elements[id] = shadow.elements[id];
        else delete elements[id];
      }
      next = { ...next, elements };
    }
    applyLocalChange(doc, shadow, next, ORIGIN.local, publicElement);
    remember(next.elements);
    shadow = { ...next, meta: sameMeta(next.meta, shadow.meta) ? shadow.meta : next.meta };
  };

  const sameMeta = (a: BoardSlice['meta'], b: BoardSlice['meta']) =>
    a.gridSettings === b.gridSettings && a.backgroundColor === b.backgroundColor && a.initialView === b.initialView && a.boardTags === b.boardTags && a.facilitatorIds === b.facilitatorIds;

  const schedule = () => {
    if (timer === null) timer = setTimeout(flushPublic, FLUSH_MS);
  };

  const draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pushDraft = (id: string) => {
    draftTimers.delete(id);
    const el = store.getState().elements[id] as StickyNoteElement | undefined;
    if (!el || el.type !== 'sticky' || !el.isPrivateDraft || el.createdBy !== me()) return;
    const tags = JSON.stringify(el.tags ?? []);
    const prev = sentDrafts.get(id);
    if (prev && prev.text === el.text && prev.tags === tags) return;
    sentDrafts.set(id, { text: el.text, tags });
    draftRev += 1;
    opts.sendPrivate({ t: 'me.draft', id, text: el.text, tags: el.tags ?? [], rev: draftRev });
  };

  const syncPrivate = (s: BoardState, prev: BoardState) => {
    // rascunhos próprios que mudaram
    if (s.elements !== prev.elements) {
      for (const [id, el] of Object.entries(s.elements)) {
        if (el === prev.elements[id] || el.type !== 'sticky') continue;
        const st = el as StickyNoteElement;
        if (!st.isPrivateDraft || st.createdBy !== s.access.userId) continue;
        if (draftTimers.has(id)) clearTimeout(draftTimers.get(id)!);
        draftTimers.set(id, setTimeout(() => pushDraft(id), DRAFT_MS));
      }
    }
    if (s.facilitation !== prev.facilitation) {
      const v = s.facilitation.voting;
      const uid = s.access.userId;
      if (v && v.active) {
        if (v.kind === 'poll') {
          const options = v.poll?.responses?.[uid] ?? [];
          const key = JSON.stringify([v.startedAt, options]);
          if (key !== sentPoll) {
            sentPoll = key;
            opts.sendPrivate({ t: 'me.poll', session: v.startedAt ?? 0, options, name: v.poll?.voterNames?.[uid] });
          }
        } else {
          const mine = v.ballots?.[uid] ?? {};
          const key = JSON.stringify([v.startedAt, mine]);
          if (key !== sentBallot) {
            sentBallot = key;
            opts.sendPrivate({ t: 'me.ballot', session: v.startedAt ?? 0, ballot: mine });
          }
        }
      }
    }
  };

  const unsubscribe = store.subscribe((s, prev) => {
    if (applying || disposed) return;
    syncPrivate(s, prev);
    // Activity Log: o que esta pessoa registrou (ou agrupou nos 8 s) vai para o servidor, que carimba o autor
    if (s.activityLog !== prev.activityLog && !opts.isReadOnly()) {
      const before = new Map(prev.activityLog.map((e) => [e.id, e]));
      const fresh = s.activityLog.filter((e) => before.get(e.id) !== e && e.actorId === s.access.userId).slice(0, 20);
      if (fresh.length) opts.sendPrivate({ t: 'me.activity', entries: fresh });
    }
    if (s.elements !== prev.elements || s.elementOrder !== prev.elementOrder || s.gridSettings !== prev.gridSettings || s.backgroundColor !== prev.backgroundColor || s.initialView !== prev.initialView || s.boardTags !== prev.boardTags || s.facilitatorIds !== prev.facilitatorIds || s.facilitation !== prev.facilitation) {
      schedule();
    }
  });

  /* ---------- documento → store ---------- */

  /** Elemento do documento no formato do store (a nota privada PRÓPRIA mantém o texto que só esta pessoa tem). */
  const fromDoc = (id: string): CanvasElement | null => {
    const y = roots.els.get(id);
    if (!y) return null;
    const el = readElement(y);
    if (isDraft(el) && el.createdBy === me()) {
      const cur = store.getState().elements[id] as StickyNoteElement | undefined;
      const known = mineDrafts.get(id);
      const own = cur && cur.type === 'sticky' ? cur : null;
      const s = el as StickyNoteElement;
      return { ...s, text: own?.text ?? known?.text ?? '', tags: own?.tags ?? known?.tags ?? [], authorName: own?.authorName ?? s.authorName, createdByName: own?.createdByName ?? s.createdByName } as CanvasElement;
    }
    return el;
  };

  let myBallot: Record<string, number> | null = null;
  let myPoll: { options: string[]; name?: string } | null = null;
  let pollKey = '';
  let pollAll: { responses: Record<string, string[]>; voterNames: Record<string, string> } | null = null;

  const composeVoting = (pub: VotingState | undefined, tally: PublicTally | undefined): VotingState | undefined => {
    if (!pub) return undefined;
    const uid = me();
    const same = !!tally && tally.session === (pub.startedAt ?? null);
    if (pub.kind === 'poll' && pub.poll) {
      const responses: Record<string, string[]> = { ...(same ? (tally?.poll?.responses ?? {}) : {}), ...(pollAll?.responses ?? {}) };
      if (pollKey) delete responses[pollKey];
      const voterNames: Record<string, string> = { ...(same ? (tally?.poll?.voterNames ?? {}) : {}), ...(pollAll?.voterNames ?? {}) };
      const local = store.getState().facilitation.voting;
      const mine = local && local.startedAt === pub.startedAt ? local.poll?.responses?.[uid] : undefined;
      const options = mine ?? myPoll?.options;
      if (options && options.length) {
        responses[uid] = options;
        const nm = local?.poll?.voterNames?.[uid] ?? myPoll?.name;
        if (nm) voterNames[uid] = nm;
      }
      return { ...pub, poll: { ...pub.poll, responses, voterNames } };
    }
    const ballots: Record<string, Record<string, number>> = { ...(same ? (tally?.ballots ?? {}) : {}) };
    const local = store.getState().facilitation.voting;
    const mine = local && local.startedAt === pub.startedAt ? local.ballots?.[uid] : undefined;
    const b = mine ?? myBallot ?? undefined;
    if (b && Object.keys(b).length) ballots[uid] = b;
    else delete ballots[uid];
    return { ...pub, ballots, votesByElement: sumBallots(ballots) };
  };

  const facFromDoc = (): Partial<FacilitationState> => {
    const f = readFac(roots.fac);
    const out: Partial<FacilitationState> = { privateMode: { enabled: f.privateMode.enabled, previewOwnNotes: false, ...(f.privateMode.startedBy !== undefined ? { startedBy: f.privateMode.startedBy } : {}), ...(f.privateMode.startedAt !== undefined ? { startedAt: f.privateMode.startedAt } : {}) } };
    out.timer = f.timer;
    out.voting = composeVoting(f.voting, f.tally);
    out.leaderUserId = f.leaderUserId;
    return out;
  };

  const applyPatch = (patch: RemotePatch, touched: string[], orderChanged: boolean) => {
    applying = true;
    try {
      store.getState().applyRemote(patch);
    } finally {
      applying = false;
    }
    // o documento já reflete o que acabou de chegar: sem eco
    const s = store.getState();
    const elements = { ...shadow.elements };
    for (const id of touched) {
      if (s.elements[id]) elements[id] = s.elements[id];
      else delete elements[id];
    }
    remember(s.elements, touched);
    shadow = {
      ...shadow,
      elements,
      elementOrder: orderChanged ? s.elementOrder : shadow.elementOrder,
      meta: {
        gridSettings: patch.gridSettings ? s.gridSettings : shadow.meta.gridSettings,
        backgroundColor: patch.backgroundColor !== undefined ? s.backgroundColor : shadow.meta.backgroundColor,
        initialView: patch.initialView !== undefined ? s.initialView : shadow.meta.initialView,
        boardTags: patch.boardTags ? s.boardTags : shadow.meta.boardTags,
        facilitatorIds: patch.facilitatorIds !== undefined ? s.facilitatorIds : shadow.meta.facilitatorIds,
      },
      fac: patch.facilitation ? publicFacilitation(s.facilitation) : shadow.fac,
    };
    if (patch.facilitation) facCache = { ref: s.facilitation, pub: shadow.fac };
    // Chat 08.2: o que veio do documento (de outras pessoas ou do servidor) também já está no servidor — entra na base
    // confirmada; senão um reenvio offline trataria objetos criados por outros como "novos" e tentaria recriar o que
    // eles apagaram. Só com o provider ligado: o documento LOCAL (recarregado sem rede) tem as edições offline e não
    // pode virar base
    if (confirmed && (!opts.isLive || opts.isLive())) {
      const ce = { ...confirmed.elements };
      for (const id of touched) {
        if (s.elements[id]) ce[id] = s.elements[id];
        else delete ce[id];
      }
      confirmed = {
        elements: ce,
        elementOrder: orderChanged ? s.elementOrder : confirmed.elementOrder,
        meta: {
          gridSettings: patch.gridSettings ? s.gridSettings : confirmed.meta.gridSettings,
          backgroundColor: patch.backgroundColor !== undefined ? s.backgroundColor : confirmed.meta.backgroundColor,
          initialView: patch.initialView !== undefined ? s.initialView : confirmed.meta.initialView,
          boardTags: patch.boardTags ? s.boardTags : confirmed.meta.boardTags,
          facilitatorIds: patch.facilitatorIds !== undefined ? s.facilitatorIds : confirmed.meta.facilitatorIds,
        },
        fac: patch.facilitation ? shadow.fac : confirmed.fac,
      };
    }
  };

  const offObserve = observeBoard(doc, (change) => {
    if (change.origin === ORIGIN.local) return;
    const patch: RemotePatch = {};
    const touched: string[] = [];
    if (change.ids.size) {
      const upsert: CanvasElement[] = [];
      const remove: string[] = [];
      for (const id of change.ids) {
        const el = fromDoc(id);
        if (el) upsert.push(el);
        else remove.push(id);
        touched.push(id);
      }
      if (upsert.length) patch.upsert = upsert;
      if (remove.length) patch.remove = remove;
    }
    if (change.order) patch.order = readOrder(roots);
    if (change.meta) {
      const m = readMeta(roots.meta);
      patch.gridSettings = m.gridSettings;
      patch.backgroundColor = m.backgroundColor;
      patch.initialView = m.initialView;
      patch.boardTags = m.boardTags;
      patch.facilitatorIds = m.facilitatorIds;
    }
    if (change.fac) patch.facilitation = facFromDoc();
    applyPatch(patch, touched, !!change.order);
  });

  /* ---------- desfazer por pessoa ---------- */
  const undoManager = new Y.UndoManager([roots.els, roots.order, roots.meta, roots.fac], { trackedOrigins: new Set([ORIGIN.local]), captureTimeout: 600 });
  const syncUndoCounts = () => store.getState().setRemoteHistory(undoManager.undoStack.length, undoManager.redoStack.length);
  for (const ev of ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const) undoManager.on(ev, syncUndoCounts);
  store.getState().setHistoryAdapter({
    mark: () => {
      flushPublic();
      undoManager.stopCapturing();
    },
    undo: () => {
      flushPublic();
      undoManager.undo();
    },
    redo: () => {
      flushPublic();
      undoManager.redo();
    },
  });
  store.getState().setCollab(true);

  /* ---------- reconciliação completa ---------- */
  const hydrate = (force = false) => {
    if (disposed || !isSeeded(doc)) return;
    // reenvio offline: o documento novo veio do servidor e manda em tudo; o que a pessoa fez vai depois, por objeto
    if (force) seededAtAttach = true;
    const s = store.getState();
    const baseline = shadow;
    const upsert: CanvasElement[] = [];
    const touched: string[] = [];
    const ids = new Set<string>();
    roots.els.forEach((_y, id) => ids.add(id));
    for (const id of ids) {
      const el = fromDoc(id);
      if (!el) continue;
      const cur = s.elements[id];
      // aberto sem rede antes de a história começar: o que a pessoa mudou à mão ganha do documento
      if (!seededAtAttach && cur && baseline.elements[id] && cur !== baseline.elements[id]) continue;
      if (!cur || !deepEqual(stripZ(cur), stripZ(el))) {
        upsert.push(el);
        touched.push(id);
      }
    }
    const remove: string[] = [];
    for (const id of Object.keys(s.elements)) {
      if (ids.has(id)) continue;
      if (!seededAtAttach && !baseline.elements[id]) continue; // criado localmente, ainda não enviado
      remove.push(id);
      touched.push(id);
    }
    const patch: RemotePatch = { order: readOrder(roots) };
    if (upsert.length) patch.upsert = upsert;
    if (remove.length) patch.remove = remove;
    const m = readMeta(roots.meta);
    patch.gridSettings = m.gridSettings;
    patch.backgroundColor = m.backgroundColor;
    patch.initialView = m.initialView;
    patch.boardTags = m.boardTags;
    patch.facilitatorIds = m.facilitatorIds;
    patch.facilitation = facFromDoc();
    applyPatch(patch, touched, true);
    if (!seededAtAttach) {
      // o que ficou só no store (edições feitas sem rede) sobe agora
      seededAtAttach = true;
      schedule();
    }
  };

  const onPointerUp = () => flushPublic();
  window.addEventListener('pointerup', onPointerUp, true);
  const onUnload = () => flushPublic();
  window.addEventListener('beforeunload', onUnload);

  const replay = async (base: BoardSlice, desired: BoardSlice, io: ReplayIo): Promise<ReplayOutcome> => {
    const plan = planReplay(base, desired);
    // um objeto por transação (cada uma com clientID novo), em lotes que cabem no teto do servidor; depois a ordem
    const { denied, gone } = await sendReplay(doc, plan, io, { origin: ORIGIN.replay, lot: REPLAY_LOT, pace: REPLAY_PACE, windowMs: RATE.windowMs, stopped: () => disposed });
    // o texto das próprias notas privadas não vai ao documento: segue pelo canal privado
    const out = new Set([...denied.flatMap((d) => d.ids), ...gone]);
    const drafts: CanvasElement[] = [];
    for (const step of plan.steps) {
      if (step.kind !== 'element' || !step.next || out.has(step.id)) continue;
      const n = step.next as StickyNoteElement;
      if (n.type !== 'sticky' || !n.isPrivateDraft || n.createdBy !== me()) continue;
      const cur = store.getState().elements[step.id];
      if (cur) drafts.push({ ...cur, text: n.text, tags: n.tags ?? [] } as CanvasElement);
    }
    if (drafts.length) {
      applyPatch({ upsert: drafts }, drafts.map((d) => d.id), false);
      for (const d of drafts) {
        sentDrafts.delete(d.id);
        pushDraft(d.id);
      }
    }
    return { plan, denied, gone };
  };

  return {
    hydrate,
    flush: flushPublic,
    markConfirmed: () => {
      confirmed = shadow;
      offlineNoted = false;
    },
    confirmedSlice: () => confirmed,
    setConfirmed: (slice) => {
      confirmed = slice;
    },
    snapshot: () => current(),
    hasOfflineChanges: () => !!confirmed && !isEmptyPlan(planReplay(confirmed, current())),
    replay,
    applyActivity: (entries, replace) => {
      const cur = replace ? [] : store.getState().activityLog;
      const byId = new Map(cur.map((e) => [e.id, e]));
      for (const e of entries) byId.set(e.id, e);
      const activityLog = [...byId.values()].sort((a, b) => (b.lastTimestamp ?? b.timestamp) - (a.lastTimestamp ?? a.timestamp)).slice(0, 200);
      applyPatch({ activityLog }, [], false);
    },
    applyMeState: (m) => {
      session = m.session;
      for (const [id, d] of Object.entries(m.drafts)) {
        mineDrafts.set(id, d);
        sentDrafts.set(id, { text: d.text, tags: JSON.stringify(d.tags) });
        draftRev = Math.max(draftRev, d.rev);
      }
      myBallot = m.ballot;
      myPoll = m.poll;
      pollKey = m.pollKey;
      pollAll = m.pollAll;
      const s = store.getState();
      // texto das notas privadas próprias que o documento público não traz
      const upsert: CanvasElement[] = [];
      for (const [id, d] of Object.entries(m.drafts)) {
        const cur = s.elements[id] as StickyNoteElement | undefined;
        if (cur && cur.type === 'sticky' && cur.isPrivateDraft && cur.createdBy === s.access.userId && (cur.text !== d.text || JSON.stringify(cur.tags) !== JSON.stringify(d.tags)) && cur.text === '') {
          upsert.push({ ...cur, text: d.text, tags: d.tags } as CanvasElement);
        }
      }
      const patch: RemotePatch = { facilitation: facFromDoc() };
      if (upsert.length) patch.upsert = upsert;
      applyPatch(patch, upsert.map((u) => u.id), false);
      void session;
    },
    destroy: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      for (const t of draftTimers.values()) clearTimeout(t);
      unsubscribe();
      offObserve();
      undoManager.destroy();
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('beforeunload', onUnload);
      store.getState().setHistoryAdapter(null);
      store.getState().setRemoteHistory(0, 0);
      store.getState().setCollab(false);
    },
  };
}
