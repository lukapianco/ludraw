/**
 * LuDraw — sessão de edição ao vivo de UM board no Modo Servidor (Chat 08).
 *
 *   documento Yjs  ⇄  y-indexeddb (cópia no navegador: o board abre e edita sem rede)
 *                  ⇄  HocuspocusProvider  →  WebSocket `/api/v1/collab`  →  servidor
 *   binding        ⇄  useBoardStore (só pela ação `applyRemote`)
 * Se o servidor não anuncia tempo real (`/info.realtime`), nada disto liga e o salvamento continua por PUT.
 *
 * Chat 08.2 — sem rede: quando a conexão cai, o provider é desligado (o documento e o desfazer continuam). A base que o
 * servidor já confirmou fica guardada no navegador. Quando o servidor volta a responder: sem mudanças offline, o mesmo
 * documento reconecta; com mudanças, a sessão abre um documento NOVO vindo do servidor e reenvia o que a pessoa fez
 * OBJETO POR OBJETO (`binding.replay`), para o veto recusar só o que está em uso/negado e aceitar o resto.
 */
import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { t, translateStored } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { setEditGuard, useBoardStore } from '../store/useBoardStore';
import type { BoardData, CanvasElement } from '../types/canvas';
import { api, ApiError } from '../utils/api';
import { assetHashOf, assetHashesOf, isRasterDataUrl } from '../utils/assetRefs';
import { inlineAssetImages, linkAssetRefs, uploadDataUrl } from './assets';
import { serverBoardRepository } from '../utils/boardRepository';
import { collabDbName, connection, isServerMode } from '../utils/serverConfig';
import { personLabel } from '../utils/storedNames';
import { cameraToView, sameView, throttleLatest, viewToCamera } from '../utils/collaboration';
import { createBinding, type Binding, type ReplayOutcome } from './binding';
import { useCollabUi } from './presenceStore';
import { bindYjs, docEpoch, sliceToBoardData, type BoardSlice } from './codec';
import { boardDocName, COLLAB_PATH, encodeCredential, encodeMessage, RATE, type ClientMessage, type ServerMessage, type WireMessage } from './protocol';

bindYjs(Y);

export type CollabStatus = 'connecting' | 'live' | 'offline' | 'syncing' | 'readOnly';

export interface CollabSession {
  boardId: string;
  status: CollabStatus;
  readOnly: boolean;
  userId: string;
  send: (msg: ClientMessage) => void;
  stop: () => void;
  /** Chat 08.7 · R4 (S-29): há edição deste navegador que o servidor ainda não confirmou? */
  unsynced: () => boolean;
}

type Listener = (s: CollabSession | null) => void;
const listeners = new Set<Listener>();
let active: CollabSession | null = null;

export const currentCollab = (): CollabSession | null => active;
export function onCollabChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(active));

const toast = (...args: Parameters<ReturnType<typeof useAppStore.getState>['toast']>) => useAppStore.getState().toast(...args);

/** Chat 08.2: chave (no y-indexeddb do board) da base confirmada pelo servidor antes de editar sem rede. */
const BASE_KEY = 'od:offline-base';
/** Chat 08.2: espera máxima pelo resumo de um lote de reenvio. */
const BATCH_TIMEOUT_MS = 20_000;

interface SavedBase {
  epoch: string | null;
  slice: BoardSlice;
}

function readSavedBase(raw: unknown): SavedBase | null {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw) as SavedBase;
    return v && v.slice && typeof v.slice === 'object' && v.slice.elements && Array.isArray(v.slice.elementOrder) ? v : null;
  } catch {
    return null;
  }
}

/** Chat 08.2: reenvio pendente para a próxima conexão (documento novo vindo do servidor). */
interface ReplayRequest {
  base: BoardSlice;
  desired: BoardSlice;
  /** época do documento em que as mudanças foram feitas (restaurado nesse meio-tempo = recusa por época, como antes) */
  epoch: string | null;
}

/** O servidor anunciou tempo real e este navegador consegue abrir WebSocket? */
export function collabAvailable(): boolean {
  return isServerMode() && connection.info?.realtime === true && typeof WebSocket !== 'undefined' && typeof indexedDB !== 'undefined';
}

function collabUrl(): string {
  const base = connection.url ? new URL(connection.url) : new URL(window.location.href);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = COLLAB_PATH;
  base.search = '';
  base.hash = '';
  return base.toString();
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

function downloadJson(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Chat 08.2: o que ficou de fora do reenvio, num JSON de board (mesmo formato do "baixar o descartado"): só os objetos
 * recusados/apagados por outra pessoa, como a pessoa os deixou (excluídos = como estavam).
 */
export function discardedBoardJson(outcome: ReplayOutcome, ids: string[]): string {
  const { base, desired } = outcome.plan;
  const elements: Record<string, CanvasElement> = {};
  for (const id of ids) {
    const el = desired.elements[id] ?? base.elements[id];
    if (el) elements[id] = el;
  }
  const order = [...desired.elementOrder, ...base.elementOrder].filter((id, i, all) => elements[id] && all.indexOf(id) === i);
  return JSON.stringify(sliceToBoardData({ elements, elementOrder: order, meta: desired.meta, fac: { privateMode: { enabled: false } } }, { activityLog: [] }));
}

/** Liga a edição ao vivo do board aberto; devolve a função que desliga. */
export function startCollab(boardId: string, opts: { visitor: boolean }): () => void {
  if (!api || !collabAvailable()) return () => undefined;
  let stopped = false;
  let generation = 0;
  let teardown: (() => void) | null = null;
  const boardName = () => useAppStore.getState().boards.find((b) => b.id === boardId)?.name ?? 'board';
  /** Chat 08.2: o arquivo baixado leva as imagens embutidas (funciona fora do servidor). */
  const downloadLost = async (json: string) => {
    let text = json;
    try {
      const parsed = JSON.parse(json) as BoardData;
      text = JSON.stringify(await inlineAssetImages(parsed, boardId));
    } catch {
      /* fica como está */
    }
    downloadJson(text, `${boardName()}-local.json`);
  };

  const open = async (replay: ReplayRequest | null = null): Promise<void> => {
    const gen = ++generation;
    const doc = new Y.Doc();
    const dbName = collabDbName(boardId);
    const idb = new IndexeddbPersistence(dbName, doc);
    await idb.whenSynced;
    // página recarregada ainda sem rede: a base confirmada guardada antes de editar offline
    const saved = replay ? null : readSavedBase(await idb.get(BASE_KEY).catch(() => undefined));
    if (stopped || gen !== generation) {
      void idb.destroy();
      doc.destroy();
      return;
    }

    let socket: HocuspocusProviderWebsocket | null = null;
    let provider: HocuspocusProvider | null = null;
    /** só testa se o servidor voltou a responder (sem documento): decide entre reconectar e reenviar por objeto */
    let probe: HocuspocusProviderWebsocket | null = null;
    let binding: Binding | null = null;
    let closing = false;
    let pendingReplay = replay;
    let replayRunning = false;
    let batchWaiter: ((r: { accepted: number; denied: { ids: string[]; reason: WireMessage }[] }) => void) | null = null;
    let maxPayloadMb = 24;
    const session: CollabSession = {
      boardId,
      status: 'connecting',
      readOnly: false,
      userId: useBoardStore.getState().access.userId,
      send: (msg) => {
        if (provider && socket?.status === WebSocketStatus.Connected) provider.sendStateless(encodeMessage(msg));
      },
      stop: () => undefined,
      unsynced: () => false,
    };
    const setStatus = (status: CollabStatus) => {
      session.status = session.readOnly && status === 'live' ? 'readOnly' : status;
      emit();
    };

    /** Recomeça do zero: apaga a cópia local desta "vida" do documento e abre outra. `keep` = o que dá para baixar. */
    let restarting = false;
    const restart = async (message?: string, tone: 'neutral' | 'danger' = 'neutral', keep: boolean | string = false) => {
      if (restarting || stopped) return;
      restarting = true;
      // o que a pessoa tinha neste aparelho e vai ser descartado pode ser baixado (JSON do próprio board)
      const lost = typeof keep === 'string' ? keep : keep ? JSON.stringify(useBoardStore.getState().serialize()) : null;
      if (message) {
        toast(message, tone, {
          durationMs: lost ? 30_000 : 12_000,
          ...(lost ? { action: { label: t('collab.reset.exportLost'), run: () => void downloadLost(lost) } } : {}),
        });
      }
      close(false);
      await deleteDb(dbName);
      // o conteúdo vem do servidor de novo (mantém a câmera)
      const { reloadOpenBoard } = await import('../utils/serverSync');
      await reloadOpenBoard(boardId);
      if (!stopped) void open();
    };

    /** Guarda no navegador a base confirmada (sobrevive a recarregar a página sem rede). */
    const persistBase = () => {
      const slice = binding?.confirmedSlice();
      if (slice) void idb.set(BASE_KEY, JSON.stringify({ epoch: docEpoch(doc), slice } satisfies SavedBase)).catch(() => undefined);
    };

    /** Chat 08.2: a conexão caiu — desliga o provider (as mudanças ficam no documento local) e espera o servidor voltar. */
    const goOffline = () => {
      if (closing || restarting || !provider) return;
      if (binding?.hasOfflineChanges()) persistBase();
      provider.destroy();
      socket?.destroy();
      provider = null;
      socket = null;
      batchWaiter = null;
      // presença velha não deve bloquear objetos enquanto estou sem rede
      useCollabUi.getState().reset();
      setStatus('offline');
      waitForServer();
    };

    const waitForServer = () => {
      if (closing || probe) return;
      const p = new HocuspocusProviderWebsocket({ url: collabUrl(), WebSocketPolyfill: WebSocket });
      probe = p;
      // `open` (o WebSocket abriu): o `connect` do provider só vem depois da 1ª mensagem do servidor, que nunca chega
      // a uma conexão sem documento
      p.on('open', () => {
        if (probe !== p) return;
        probe = null;
        p.destroy();
        if (closing || restarting || stopped) return;
        if (binding?.hasOfflineChanges()) void replayRestart();
        else {
          void idb.del(BASE_KEY).catch(() => undefined);
          attachProvider();
        }
      });
      void p.connect();
    };
    const onOnline = () => {
      if (probe) void probe.connect();
    };
    window.addEventListener('online', onOnline);

    /** Documento novo vindo do servidor + reenvio por objeto do que foi feito sem rede. */
    const replayRestart = async () => {
      if (restarting || stopped || !binding) return;
      const base = binding.confirmedSlice();
      if (!base) {
        attachProvider();
        return;
      }
      restarting = true;
      const desired = binding.snapshot();
      const epoch = docEpoch(doc);
      close(false);
      await deleteDb(dbName);
      if (!stopped) void open({ base, desired, epoch });
    };

    const sendBatch = (on: boolean): Promise<{ accepted: number; denied: { ids: string[]; reason: WireMessage }[] }> => {
      session.send({ t: 'batch', on });
      if (on) return Promise.resolve({ accepted: 0, denied: [] });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          batchWaiter = null;
          reject(new Error('batch timeout'));
        }, BATCH_TIMEOUT_MS);
        batchWaiter = (r) => {
          clearTimeout(timer);
          batchWaiter = null;
          resolve(r);
        };
      });
    };

    /** O aviso do reenvio: só o que ficou de fora entra na mensagem e no "baixar o descartado". */
    const reportReplay = (outcome: ReplayOutcome) => {
      const refusedIds = [...new Set(outcome.denied.flatMap((d) => d.ids))];
      const boardLevel = outcome.denied.some((d) => !d.ids.length);
      const changed = outcome.plan.steps.length;
      if (!outcome.denied.length && !outcome.gone.length) {
        if (changed) toast(t('collab.replay.done', { count: changed }), 'neutral');
        return false;
      }
      const parts: string[] = [];
      if (outcome.denied.length) {
        const reason = translateStored(outcome.denied[0].reason);
        parts.push(refusedIds.length ? t('collab.replay.refused', { count: refusedIds.length, reason }) : t('collab.replay.refusedBoard', { reason }));
      }
      if (outcome.gone.length) parts.push(t('collab.replay.gone', { count: outcome.gone.length }));
      if (boardLevel && refusedIds.length) parts.push(t('collab.replay.boardSettings'));
      const lostIds = [...refusedIds, ...outcome.gone];
      const lost = lostIds.length ? discardedBoardJson(outcome, lostIds) : null;
      const message = parts.join(' ');
      // recusado = o documento local tem o que o servidor não aceitou: recomeça (o que entrou já está no servidor)
      if (outcome.denied.length) {
        void restart(message, 'danger', lost ?? false);
        return true;
      }
      toast(message, 'neutral', {
        durationMs: 30_000,
        ...(lost ? { action: { label: t('collab.reset.exportLost'), run: () => void downloadLost(lost) } } : {}),
      });
      return false;
    };

    /**
     * Chat 08.2: no estado desejado, imagem embutida nova/alterada sobe agora e vira referência; referência vinda de
     * outro board passa pela prova de acesso. O que falhar fica fora do reenvio e entra no aviso como recusado.
     */
    const prepareReplayImages = async (r: ReplayRequest): Promise<{ desired: BoardSlice; denied: ReplayOutcome['denied'] }> => {
      const elements = { ...r.desired.elements };
      const denied: ReplayOutcome['denied'] = [];
      const known = new Set([...assetHashesOf(r.base.elements)]);
      for (const [id, el] of Object.entries(r.desired.elements)) {
        if (el.type !== 'image') continue;
        const src = (el as unknown as { dataUrl?: string }).dataUrl ?? '';
        if (src === (r.base.elements[id] as unknown as { dataUrl?: string } | undefined)?.dataUrl) continue;
        const hash = assetHashOf(src);
        try {
          if (isRasterDataUrl(src)) elements[id] = { ...el, dataUrl: await uploadDataUrl(boardId, src) } as CanvasElement;
          else if (hash && !known.has(hash) && (await linkAssetRefs(boardId, [hash])).length) denied.push({ ids: [id], reason: { key: 'server.errors.imageNotAvailable' } });
        } catch (e) {
          denied.push({ ids: [id], reason: e instanceof ApiError ? e.storedMessage : { key: 'server.client.offline' } });
        }
      }
      for (const d of denied) for (const id of d.ids) delete elements[id];
      // a tela já mostra a imagem com a referência (sem esperar o eco do documento)
      return { desired: { ...r.desired, elements, elementOrder: r.desired.elementOrder.filter((id) => elements[id]) }, denied };
    };

    const runReplay = async (r: ReplayRequest) => {
      if (!binding || !provider) return;
      replayRunning = true;
      setStatus('syncing');
      binding.hydrate(true);
      const st = useBoardStore.getState();
      useCollabUi.getState().setLeader(st.facilitation.leaderUserId ?? null, st.access.userId);
      provider.sendStateless(encodeMessage({ t: 'me.hello' }));
      let outcome: ReplayOutcome;
      try {
        // Chat 08.2: imagens inseridas sem rede sobem ANTES do reenvio (o documento só recebe a referência)
        const prep = await prepareReplayImages(r);
        outcome = await binding.replay(r.base, prep.desired, { batch: sendBatch });
        if (prep.denied.length) outcome = { ...outcome, plan: { ...outcome.plan, desired: r.desired }, denied: [...prep.denied, ...outcome.denied] };
      } catch {
        replayRunning = false;
        // sem resposta do servidor no meio do reenvio: recomeça e oferece TUDO o que foi feito sem rede
        const ids = [...new Set([...Object.keys(r.desired.elements), ...Object.keys(r.base.elements)])];
        const fake: ReplayOutcome = { plan: { steps: [], created: [], reordered: false, base: r.base, desired: r.desired }, denied: [], gone: [] };
        void restart(t('collab.replay.failed'), 'danger', discardedBoardJson(fake, ids));
        return;
      }
      replayRunning = false;
      if (closing || reportReplay(outcome)) return;
      binding.markConfirmed();
      setStatus('live');
    };

    const attachProvider = () => {
      if (closing || provider) return;
      const ws = new HocuspocusProviderWebsocket({ url: collabUrl(), WebSocketPolyfill: WebSocket });
      socket = ws;
      provider = new HocuspocusProvider({
        websocketProvider: ws,
        name: boardDocName(boardId),
        document: doc,
        token: async () => encodeCredential({ t: (await api!.socketToken(boardId, opts.visitor)) ?? '', ...(opts.visitor ? { k: 'v' as const } : {}), e: pendingReplay ? pendingReplay.epoch : docEpoch(doc) }),
        onStatus: ({ status }) => {
          if (status === WebSocketStatus.Connected) setStatus('syncing');
          else if (status === WebSocketStatus.Connecting) setStatus('connecting');
          else goOffline();
        },
        onSynced: () => {
          if (pendingReplay) {
            const r = pendingReplay;
            pendingReplay = null;
            void runReplay(r);
            return;
          }
          binding?.hydrate();
          const st = useBoardStore.getState();
          useCollabUi.getState().setLeader(st.facilitation.leaderUserId ?? null, st.access.userId);
          setStatus('live');
          provider?.sendStateless(encodeMessage({ t: 'me.hello' }));
        },
        // tudo o que o documento tem foi aplicado pelo servidor: vira a base de um eventual reenvio offline
        onUnsyncedChanges: ({ number }) => {
          if (number === 0 && !replayRunning && session.status === 'live') binding?.markConfirmed();
        },
        onAuthenticationFailed: ({ reason }) => {
          // visitante: o link foi revogado, venceu ou foi trocado → mesma saída do vigia do Chat 07
          if (opts.visitor && (reason === 'unauthorized' || reason === 'denied')) {
            serverBoardRepository?.onLinkLost?.(boardId);
            return;
          }
          if (reason === 'reset:epoch') void restart(t('collab.reset.epoch'), 'danger', true);
          else if (reason === 'unauthorized') {
            // access token vencido ou sessão renovada: renova e conecta de novo
            void api!.refresh().then((ok) => {
              if (ok && !stopped) goOffline();
            });
          } else setStatus('offline');
        },
        // mensagem maior que o limite do servidor (ex.: imagem enorme): o WebSocket cai com 1009; descarta a alteração, sem reenvio
        onClose: ({ event }) => {
          if (event?.code === 1009) void restart(t('collab.tooLarge', { mb: maxPayloadMb }), 'danger', true);
        },
        onStateless: ({ payload }) => {
          let m: ServerMessage;
          try {
            m = JSON.parse(payload) as ServerMessage;
          } catch {
            return;
          }
          switch (m.t) {
            case 'hello':
              session.readOnly = m.readOnly;
              maxPayloadMb = m.maxPayloadMb;
              useCollabUi.getState().setHidden(m.hideCursors);
              session.userId = m.userId;
              setStatus(session.status === 'readOnly' ? 'live' : session.status);
              {
                // conexão nova: o servidor não conhece a minha seleção/edição (ele arbitra a partir de agora)
                const st = useBoardStore.getState();
                if (st.selectedIds.length) session.send({ t: 'select', ids: st.selectedIds });
                if (st.editingId) session.send({ t: 'editing', id: st.editingId });
              }
              break;
            case 'presence':
              useCollabUi.getState().setUsers(m.users);
              break;
            case 'pointers':
              useCollabUi.getState().applyPointers(m);
              break;
            case 'cursors.hidden':
              useCollabUi.getState().setHidden(m.hidden);
              break;
            case 'view': {
              const ui = useCollabUi.getState();
              if (ui.following === m.userId && !ui.paused) {
                const st = useBoardStore.getState();
                if (st.viewport.width > 0) st.animateCameraTo(viewToCamera(m, st.viewport), 140);
              }
              break;
            }
            case 'me.state':
              binding?.applyMeState(m);
              break;
            case 'activity':
              binding?.applyActivity(m.entries, !!m.replace);
              break;
            case 'batch.result':
              batchWaiter?.({ accepted: m.accepted, denied: m.denied });
              break;
            case 'select.denied': {
              // Chat 08.2: o servidor arbitrou — outra pessoa chegou antes, ou a minha seleção foi solta por inatividade
              const st = useBoardStore.getState();
              const ids = new Set(m.ids);
              if (st.editingId && ids.has(st.editingId)) st.setEditingId(null);
              const keep = st.selectedIds.filter((id) => !ids.has(id));
              if (keep.length !== st.selectedIds.length) useBoardStore.getState().setSelectedIds(keep);
              toast(m.reason === 'idle' ? t('collab.selectionReleasedIdle') : t('collab.inUseBy', { name: m.by ? personLabel(m.by) : t('collab.cursor.fallback') }), 'neutral');
              break;
            }
            case 'denied':
              if (m.scope === 'rate') toast(t('collab.denied.rate'), 'danger');
              else if (m.scope === 'object') break; // reenvio offline: o resumo chega no `batch.result`
              else if (m.scope === 'document') void restart(t('collab.reset.discarded', { reason: translateStored(m.reason) }), 'danger', true);
              else toast(translateStored(m.reason), 'danger');
              break;
            case 'reload': {
              const who = m.by ? useAppStore.getState().directory.find((u) => u.id === m.by)?.name : undefined;
              const message = m.reason === 'restored' ? (who ? t('collab.reload.restored', { name: personLabel(who) }) : t('collab.reload.restoredUnknown')) : m.reason === 'access' ? t('collab.reload.access') : t('collab.reload.replaced');
              if (m.reason !== 'access') void restart(message);
              else if (opts.visitor) serverBoardRepository?.onLinkLost?.(boardId);
              else {
                toast(message, 'neutral');
                void import('../utils/serverSync').then((x) => x.hydrateFromServer());
              }
              break;
            }
            default:
              break;
          }
        },
      });
      provider.attach();
    };

    binding = createBinding(doc, {
      sendPrivate: (msg) => session.send(msg),
      isReadOnly: () => session.readOnly,
      // sem provider = sem rede: a primeira escrita guarda a base confirmada no navegador
      isLive: () => provider !== null,
      onOfflineWrite: persistBase,
      // Chat 08.2: imagens sobem ao servidor antes de entrar no documento ao vivo
      assets: {
        upload: (dataUrl) => uploadDataUrl(boardId, dataUrl),
        link: (hashes) => linkAssetRefs(boardId, hashes),
        failed: (reason, link) => toast(link ? t('server.assets.linkFailed') : t('server.assets.uploadFailed', { reason: reason ?? t('server.client.offline') }), 'danger'),
      },
    });
    if (saved) binding.setConfirmed(saved.slice);
    // cópia do navegador com conteúdo (offline): já mostra o que estava salvo
    binding.hydrate();
    // mudanças feitas sem rede numa vida anterior desta página: só reenvia, por objeto, quando o servidor responder
    if (saved && binding.hasOfflineChanges()) {
      setStatus('offline');
      waitForServer();
    } else attachProvider();

    // presença: o que esta pessoa faz vai para os outros (o servidor carimba a identidade e descarta em votação anônima)
    const cursor = throttleLatest<{ x: number; y: number }>((p) => session.send({ t: 'cursor', x: Math.round(p.x), y: Math.round(p.y) }), RATE.cursorIntervalMs);
    let lastSentView: ReturnType<typeof cameraToView> | null = null;
    const view = throttleLatest<ReturnType<typeof cameraToView>>((v) => {
      if (sameView(v, lastSentView)) return;
      lastSentView = v;
      session.send({ t: 'view', x: Math.round(v.x), y: Math.round(v.y), zoom: v.zoom });
    }, RATE.viewIntervalMs);
    const marquee = throttleLatest<{ x: number; y: number; width: number; height: number }>((r) => session.send({ t: 'marquee', rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }), 50);
    const alone = () => useCollabUi.getState().users.length < 2;
    const unsubPresence = useBoardStore.subscribe((st, prev) => {
      if (st.facilitation.leaderUserId !== prev.facilitation.leaderUserId) useCollabUi.getState().setLeader(st.facilitation.leaderUserId ?? null, st.access.userId);
      // Chat 08.2: seleção e edição vão SEMPRE (mesmo sozinho): o servidor arbitra quem chegou primeiro, inclusive
      // contra alguém que entrar depois
      if (st.selectedIds !== prev.selectedIds) session.send({ t: 'select', ids: st.selectedIds });
      if (st.editingId !== prev.editingId) session.send({ t: 'editing', id: st.editingId });
      if (alone()) return;
      if (st.lastPointerWorld && st.lastPointerWorld !== prev.lastPointerWorld) cursor.push(st.lastPointerWorld);
      if (st.marquee !== prev.marquee) {
        if (st.marquee) marquee.push(st.marquee);
        else {
          marquee.cancel();
          session.send({ t: 'marquee', rect: null });
        }
      }
      if (st.camera !== prev.camera && st.viewport.width > 0) view.push(cameraToView(st.camera, st.viewport));
      // mexer na câmera à mão (arrastar o fundo) pausa o seguir
      if (st.interaction === 'panning' && prev.interaction !== 'panning') {
        const ui = useCollabUi.getState();
        if (ui.following && !ui.paused) ui.setPaused(true);
      }
    });
    const onWheel = () => {
      const ui = useCollabUi.getState();
      if (ui.following && !ui.paused) ui.setPaused(true);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    // seguir/parar de seguir: avisa o servidor (ele manda a última visão da pessoa na hora)
    let lastFollow: string | null = null;
    const unsubFollow = useCollabUi.subscribe((ui) => {
      const target = ui.paused ? null : ui.following;
      if (target !== lastFollow) {
        lastFollow = target;
        session.send({ t: 'follow', userId: target });
      }
    });
    // o objeto que outra pessoa está editando fica bloqueado para mim enquanto ela edita (DESIGN_SYSTEM §7 · Colaboração ao vivo)
    setEditGuard((id) => {
      // objeto em uso por outra pessoa (selecionado OU sendo editado) fica bloqueado até ela soltar — sempre ligado
      const ui = useCollabUi.getState();
      const me = useBoardStore.getState().access.userId;
      // Chat 08.2: conversa é compartilhada — várias pessoas abrem e respondem ao mesmo tempo (o servidor faz igual)
      if (useBoardStore.getState().elements[id]?.type === 'comment') return null;
      const who = (uid: string) => ui.users.find((u) => u.id === uid)?.name ?? t('collab.cursor.fallback');
      for (const [uid, eid] of Object.entries(ui.editing)) if (eid === id && uid !== me) return who(uid);
      for (const [uid, ids] of Object.entries(ui.selection)) if (uid !== me && ids.includes(id)) return who(uid);
      return null;
    });
    serverBoardRepository?.setLive(boardId, true);
    active = session;
    emit();

    const close = (_clear: boolean) => {
      closing = true;
      teardown = null;
      binding?.flush();
      cursor.cancel();
      marquee.cancel();
      view.cancel();
      unsubPresence();
      unsubFollow();
      setEditGuard(null);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('online', onOnline);
      useCollabUi.getState().reset();
      binding?.destroy();
      binding = null;
      provider?.destroy();
      socket?.destroy();
      probe?.destroy();
      provider = null;
      socket = null;
      probe = null;
      batchWaiter = null;
      serverBoardRepository?.setLive(boardId, false);
      if (active === session) active = null;
      emit();
      void idb.destroy();
      doc.destroy();
    };
    session.stop = () => close(false);
    session.unsynced = () => !!binding?.hasOfflineChanges() || !!provider?.hasUnsyncedChanges;
    teardown = () => close(false);
  };

  void open().catch(() => {
    toast(t('collab.error.connect'), 'danger');
  });

  return () => {
    stopped = true;
    generation++;
    teardown?.();
  };
}
