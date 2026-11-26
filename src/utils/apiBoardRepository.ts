/**
 * LuDraw — Chat 07 · B: `BoardRepository` do Modo Servidor.
 *
 * O servidor é a fonte da verdade; o IndexedDB guarda só uma CÓPIA DE TRABALHO (banco próprio por servidor,
 * nunca o do Modo Local), para nada se perder quando a conexão cai:
 *  - ler: busca no servidor (com a revisão) e atualiza a cópia; sem rede, abre a cópia;
 *  - gravar: grava a cópia na hora e envia ao servidor em fila (uma gravação por board por vez, sempre a mais
 *    nova); sem rede, tenta de novo quando a conexão volta; 409 = alguém salvou antes (a tela oferece recarregar);
 *  - versões e restauração: sempre no servidor (que tira a versão do conteúdo gravado);
 *  - extensões instaladas no Modo Servidor ficam no banco DESTE servidor (Chat 08.7 · R4 · S-29, decisão (a)): saem
 *    junto com a cópia de trabalho ao sair; o Modo Local tem as suas, no banco dele.
 */
import type { BoardData } from '../types/canvas';
import type { BoardSnapshot } from '../types/workspace';
import type { ExtensionRecord } from '../extensions/types';
import type { CreateBoardRequest } from './apiContract';
import { ApiError, type ApiClient } from './api';
import { connection } from './serverConfig';
import type { LocalBoardRepository, MigrationReport, StorageBackend, StorageEvent } from './boardRepository';

/** Situação do envio de um board ao servidor (a Régua mostra). */
export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict' | 'denied';

const RETRY_MS = 5000;
/** Consulta da revisão enquanto o board está aberto (o tempo real de verdade é do Chat 08). */
const WATCH_MS = 4000;

export class ApiBoardRepository {
  backend: StorageBackend = 'server';
  private readonly revisions = new Map<string, number>();
  private readonly creating = new Map<string, Promise<boolean>>();
  private readonly latest = new Map<string, BoardData>();
  private readonly inflight = new Set<string>();
  private readonly status = new Map<string, SyncStatus>();
  private readonly statusListeners = new Set<(boardId: string, status: SyncStatus) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Alguém gravou o board antes (409): a tela oferece recarregar. */
  onConflict: ((boardId: string) => void) | null = null;
  /** O servidor recusou a gravação (permissão ou limite): a tela mostra o motivo. */
  onRejected: ((boardId: string, error: ApiError) => void) | null = null;
  /** Alguém salvou uma revisão mais nova do board aberto (outra janela, outra pessoa). */
  onRemoteChange: ((boardId: string, revision: number) => void) | null = null;
  /** O link público do visitante deixou de valer (revogado, vencido, trocado). */
  onLinkLost: ((boardId: string) => void) | null = null;
  private readonly notifiedRevision = new Map<string, number>();
  private readonly revChannel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ludraw-srv-revisions') : null;
  private watching: { id: string; timer: ReturnType<typeof setInterval> } | null = null;
  /** Boards com edição ao vivo ativa (Chat 08): o conteúdo vai pelo WebSocket; aqui só a cópia de trabalho local. */
  private readonly live = new Set<string>();

  constructor(
    private readonly api: ApiClient,
    private readonly cache: LocalBoardRepository,
    private readonly local: LocalBoardRepository,
  ) {
    if (typeof window !== 'undefined') window.addEventListener('online', () => this.flushAll());
    // outra aba deste navegador salvou: confere na hora (sem esperar a próxima consulta)
    this.revChannel?.addEventListener('message', (e: MessageEvent<{ boardId?: string; revision?: number }>) => {
      const { boardId, revision } = e.data ?? {};
      if (boardId && typeof revision === 'number' && this.watching?.id === boardId) this.compareRevision(boardId, revision);
    });
  }

  /* ---------------- Vigia do board aberto ---------------- */

  /** Liga/desliga a edição ao vivo do board: ligada, a fila de PUT e o vigia por consulta ficam parados. */
  setLive(boardId: string, on: boolean): void {
    if (on) {
      this.live.add(boardId);
      this.latest.delete(boardId);
      if (this.watching?.id === boardId) this.stopWatching();
    } else this.live.delete(boardId);
  }

  isLive(boardId: string): boolean {
    return this.live.has(boardId);
  }

  /** Começa a vigiar o board aberto; devolve a função que para. */
  watch(boardId: string): () => void {
    this.stopWatching();
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void this.checkRemote(boardId);
    };
    this.watching = { id: boardId, timer: setInterval(tick, WATCH_MS) };
    return () => {
      if (this.watching?.id === boardId) this.stopWatching();
    };
  }

  private stopWatching(): void {
    if (this.watching) clearInterval(this.watching.timer);
    this.watching = null;
  }

  private async checkRemote(boardId: string): Promise<void> {
    if (this.inflight.has(boardId) || this.creating.has(boardId)) return;
    try {
      const { revision } = await this.api.boardRevision(boardId, this.visitor(boardId));
      this.compareRevision(boardId, revision);
    } catch (e) {
      if (e instanceof ApiError && this.visitor(boardId) && (e.status === 401 || e.status === 403 || e.status === 404)) {
        this.stopWatching();
        this.onLinkLost?.(boardId);
      }
    }
  }

  private compareRevision(boardId: string, remote: number): void {
    const known = this.revisions.get(boardId);
    if (known === undefined || remote <= known || this.inflight.has(boardId)) return;
    if ((this.notifiedRevision.get(boardId) ?? -1) >= remote) return;
    this.notifiedRevision.set(boardId, remote);
    this.setStatus(boardId, 'conflict');
    this.onRemoteChange?.(boardId, remote);
  }

  get migration(): MigrationReport | null {
    return this.local.migration;
  }

  init(): Promise<void> {
    return Promise.all([this.local.init(), this.cache.init()]).then(() => undefined);
  }

  onReady(fn: () => void): () => void {
    return this.local.onReady(fn);
  }

  onStorageEvent(fn: (e: StorageEvent) => void): () => void {
    return this.local.onStorageEvent(fn);
  }

  /* ---------------- Situação do envio ---------------- */

  statusOf(boardId: string): SyncStatus {
    return this.status.get(boardId) ?? 'saved';
  }

  onSyncStatus(fn: (boardId: string, status: SyncStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(boardId: string, s: SyncStatus): void {
    if (this.status.get(boardId) === s) return;
    this.status.set(boardId, s);
    this.statusListeners.forEach((fn) => fn(boardId, s));
  }

  private visitor(id: string): boolean {
    return !!this.api.visitorTokenFor(id);
  }

  /* ---------------- Boards ---------------- */

  /** Board novo: cria no servidor (com o conteúdo inicial); as gravações seguintes esperam a criação. */
  registerNewBoard(req: CreateBoardRequest & { id: string }): Promise<boolean> {
    void this.cache.trySaveBoard(req.id, req.data);
    const p = this.api
      .createBoard(req)
      .then((r) => {
        this.revisions.set(req.id, r.revision);
        this.setStatus(req.id, 'saved');
        return true;
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && !e.offline) this.onRejected?.(req.id, e);
        else this.setStatus(req.id, 'offline');
        return false;
      })
      .finally(() => this.creating.delete(req.id));
    this.creating.set(req.id, p);
    return p;
  }

  async loadBoard(id: string): Promise<BoardData | null> {
    await this.creating.get(id);
    try {
      const env = await this.api.boardData(id, this.visitor(id));
      this.revisions.set(id, env.revision);
      void this.cache.trySaveBoard(id, env.data);
      this.setStatus(id, 'saved');
      return env.data;
    } catch (e) {
      if (e instanceof ApiError && e.offline) {
        this.setStatus(id, 'offline');
        return this.cache.loadBoard(id);
      }
      return null;
    }
  }

  async saveBoard(id: string, data: BoardData): Promise<void> {
    await this.trySaveBoard(id, data);
  }

  /** Grava a cópia de trabalho e põe o envio na fila. `false` = sem espaço local (mesmo contrato do modo local). */
  async trySaveBoard(id: string, data: BoardData): Promise<boolean> {
    const ok = await this.cache.trySaveBoard(id, data);
    // Chat 08: servidor com tempo real = o conteúdo só vai pelo WebSocket. Um PUT (ex.: a gravação final ao SAIR do
    // board, que roda depois de a sessão ao vivo fechar) apagaria a história do documento de quem está conectado.
    if (this.live.has(id) || connection.info?.realtime === true) return ok;
    this.latest.set(id, data);
    void this.flush(id);
    return ok;
  }

  private async flush(id: string): Promise<void> {
    if (this.inflight.has(id)) return;
    this.inflight.add(id);
    try {
      await this.creating.get(id);
      while (this.latest.has(id)) {
        const data = this.latest.get(id)!;
        this.latest.delete(id);
        this.setStatus(id, 'saving');
        try {
          let rev = this.revisions.get(id);
          if (rev === undefined) {
            const env = await this.api.boardData(id, this.visitor(id));
            rev = env.revision;
          }
          const r = await this.api.saveBoardData(id, data, rev, this.visitor(id));
          this.revisions.set(id, r.revision);
          try {
            this.revChannel?.postMessage({ boardId: id, revision: r.revision });
          } catch {
            /* sem canal */
          }
          if (!this.latest.has(id)) this.setStatus(id, 'saved');
        } catch (e) {
          if (e instanceof ApiError && e.offline) {
            if (!this.latest.has(id)) this.latest.set(id, data);
            this.setStatus(id, 'offline');
            this.scheduleRetry();
            return;
          }
          if (e instanceof ApiError && e.status === 409) {
            this.latest.delete(id);
            this.setStatus(id, 'conflict');
            this.onConflict?.(id);
            return;
          }
          this.latest.delete(id);
          this.setStatus(id, 'denied');
          if (e instanceof ApiError) this.onRejected?.(id, e);
          return;
        }
      }
    } finally {
      this.inflight.delete(id);
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flushAll();
    }, RETRY_MS);
  }

  private flushAll(): void {
    for (const id of this.latest.keys()) void this.flush(id);
  }

  /** Esquece a revisão conhecida (depois de recarregar ou restaurar, a próxima leitura traz a nova). */
  resetRevision(id: string, revision?: number): void {
    if (revision === undefined) this.revisions.delete(id);
    else this.revisions.set(id, revision);
    this.status.delete(id);
  }

  /** Só a cópia local sai — excluir de verdade é do servidor (lixeira/regras). */
  async deleteBoard(id: string): Promise<void> {
    this.revisions.delete(id);
    this.latest.delete(id);
    await this.cache.deleteBoard(id);
  }

  listBoardIds(): Promise<string[]> {
    return this.cache.listBoardIds();
  }

  /* ---------------- Versões (sempre no servidor) ---------------- */

  async listSnapshots(boardId: string): Promise<BoardSnapshot[]> {
    try {
      return (await this.api.snapshots(boardId)).snapshots;
    } catch {
      return [];
    }
  }

  async saveSnapshot(s: BoardSnapshot): Promise<void> {
    // a versão é tirada do conteúdo GRAVADO: o envio pendente vai antes
    await this.flush(s.boardId);
    await this.api.createSnapshot(s.boardId, { id: s.id, name: s.name, kind: s.kind ?? 'auto', ...(s.reason ? { reason: s.reason } : {}) });
  }

  async deleteSnapshot(id: string, boardId?: string): Promise<void> {
    if (!boardId) return;
    await this.api.deleteSnapshot(boardId, id);
  }

  /** Restaura no servidor (com versão de segurança e registro) e devolve o conteúdo novo. */
  async restoreSnapshot(boardId: string, snapshotId: string): Promise<BoardData | null> {
    await this.flush(boardId);
    const r = await this.api.restoreSnapshot(boardId, snapshotId);
    this.revisions.set(boardId, r.revision);
    return this.loadBoard(boardId);
  }

  /** O backup `.ludraw-workspace` é do Modo Local; no servidor o backup é do próprio banco (Chat 09). */
  async listAllSnapshots(): Promise<BoardSnapshot[]> {
    return [];
  }

  estimateUsage(): Promise<number | null> {
    return this.cache.estimateUsage();
  }

  /* -------- Extensões: no banco deste servidor (Chat 08.7 · R4 · S-29: apagadas junto com ele ao sair) -------- */

  get extensionsPersistent(): boolean {
    return this.cache.extensionsPersistent;
  }

  listExtensionRecords(): Promise<ExtensionRecord[]> {
    return this.cache.listExtensionRecords();
  }

  saveExtension(record: ExtensionRecord, files?: Record<string, Uint8Array>): Promise<void> {
    return this.cache.saveExtension(record, files);
  }

  deleteExtension(id: string): Promise<void> {
    return this.cache.deleteExtension(id);
  }

  loadExtensionFiles(id: string): Promise<Record<string, Uint8Array>> {
    return this.cache.loadExtensionFiles(id);
  }

  getExtensionMeta<T>(key: string): Promise<T | undefined> {
    return this.cache.getExtensionMeta<T>(key);
  }

  setExtensionMeta(key: string, value: unknown): Promise<void> {
    return this.cache.setExtensionMeta(key, value);
  }

  /** Chat 08.7 · R4 (S-29): há gravação deste navegador que ainda não chegou ao servidor? */
  hasUnsynced(): boolean {
    return this.latest.size > 0 || this.inflight.size > 0;
  }

  /** Conteúdos ainda não enviados (para "Baixar e sair"). */
  unsyncedBoards(): Array<{ id: string; data: BoardData }> {
    return [...this.latest.entries()].map(([id, data]) => ({ id, data }));
  }

  /** Sair do servidor: para envios e consultas, fecha a cópia de trabalho e não grava mais nada. */
  shutdown(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.watching) clearInterval(this.watching.timer);
    this.watching = null;
    this.latest.clear();
    try {
      this.revChannel?.close();
    } catch {
      /* sem canal */
    }
    this.cache.shutdown();
  }

  forget(id?: string): void {
    this.cache.forget(id);
  }
}
