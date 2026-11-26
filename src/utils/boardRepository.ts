/**
 * LuDraw — Chat 06 · Rodada B: persistência dos boards atrás de `BoardRepository`.
 *
 * - Implementação principal: **IndexedDB** (sem o limite de ~5 MB do localStorage), com stores
 *   `boards` (BoardData por id), `snapshots` (histórico de versões, índice por board) e `meta`.
 * - **Migração automática e transparente**: na primeira abertura, cada `localStorage["ludraw:board:<id>"]`
 *   é copiado para o IndexedDB, conferido (lido de volta) e só então removido do localStorage.
 * - **Fallback seguro**: sem IndexedDB (navegador antigo, modo privado restrito, file://), tudo continua
 *   no localStorage com a mesma interface — nada se perde, só volta o limite de espaço.
 * - Cache em memória com escrita imediata no cache: `load` logo depois de `save` nunca lê dado velho.
 *
 * A UI e os stores NUNCA falam com IndexedDB: só com `boardRepository` (trocável por servidor/Yjs nos
 * Chats 07/08). Nenhuma dependência: API nativa `indexedDB`.
 *
 * Chat 06.5 — banco v2: stores `extensions` (ExtensionRecord por id) e `extensionFiles` (bytes de cada
 * arquivo instalado, chave `"<id>/<caminho>"`). Upgrade idempotente (só cria o que falta): boards e
 * versões do v1 ficam intactos. Atualização bloqueada por outra aba → aviso e espera (não cai mais em
 * silêncio para o localStorage); outra aba atualizou o banco → esta fecha a conexão e avisa para recarregar.
 */
import type { BoardData } from '../types/canvas';
import type { BoardRepository, BoardSnapshot } from '../types/workspace';
import type { ExtensionRecord } from '../extensions/types';
import { api } from './api';
import { ApiBoardRepository } from './apiBoardRepository';
import { boardDbName, isServerMode, serverKey } from './serverConfig';

const DB_NAME = 'ludraw';
const DB_VERSION = 2;
const LS_PREFIX = 'ludraw:board:';
const LS_SNAP_PREFIX = 'ludraw:snapshots:';
const MIGRATION_FLAG = 'localStorageMigrated';

/** Chat 07: `server` = Modo Servidor (a cópia local é só cache de trabalho). */
export type StorageBackend = 'indexeddb' | 'localstorage' | 'server';

export interface MigrationReport {
  migrated: number;
  failed: number;
}

/**
 * Chat 06.5: eventos do armazenamento que a interface precisa mostrar.
 * - `blocked`: a atualização do banco espera outra aba do LuDraw fechar;
 * - `versionchange`: outra aba atualizou o banco — esta precisa recarregar;
 * - `outdated`: o banco é de uma versão mais nova do app (esta aba é antiga);
 * - `fallback`: sem IndexedDB — boards no localStorage e extensões só nesta sessão.
 */
export type StorageEvent = 'blocked' | 'versionchange' | 'outdated' | 'fallback';

/** Validação mínima de um BoardData lido do disco (igual à do Chat 01). */
export function isBoardData(value: unknown): value is BoardData {
  const v = value as BoardData | null;
  return !!v && typeof v === 'object' && !!v.elements && typeof v.elements === 'object' && Array.isArray(v.elementOrder);
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

function openDb(name: string, onBlocked: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('indexeddb-unavailable'));
    const r = indexedDB.open(name, DB_VERSION);
    // idempotente: só cria o que falta (v0 → v2 e v1 → v2 passam pelo mesmo código; nada é apagado)
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('boards')) db.createObjectStore('boards');
      if (!db.objectStoreNames.contains('snapshots')) {
        const s = db.createObjectStore('snapshots', { keyPath: 'id' });
        s.createIndex('boardId', 'boardId', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      // Chat 06.5
      if (!db.objectStoreNames.contains('extensions')) db.createObjectStore('extensions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('extensionFiles')) db.createObjectStore('extensionFiles');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    // outra aba com o banco aberto numa versão antiga: avisa e CONTINUA esperando (o pedido conclui
    // sozinho quando a outra aba fechar a conexão — as abas do app fecham ao receber `versionchange`)
    r.onblocked = () => onBlocked();
  });
}

export interface RepositoryOptions {
  dbName?: string;
  lsPrefix?: string;
  lsSnapPrefix?: string;
  /** migrar boards do localStorage antigo (só o banco do Modo Local) */
  migrateLegacy?: boolean;
}

const extFileKey = (id: string, path: string) => `${id}/${path}`;
const extFileRange = (id: string) => IDBKeyRange.bound(`${id}/`, `${id}/￿`);
const EXT_META_PREFIX = 'ext:';

function lsKeys(prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
  } catch {
    /* sem localStorage */
  }
  return keys;
}

function lsRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsWrite(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export class LocalBoardRepository implements BoardRepository {
  private db: IDBDatabase | null = null;
  private ready: Promise<void> | null = null;
  private cache = new Map<string, BoardData>();
  backend: StorageBackend = 'localstorage';
  migration: MigrationReport | null = null;
  private listeners = new Set<() => void>();
  private storageListeners = new Set<(e: StorageEvent) => void>();
  /** Chat 06.5: sem IndexedDB, extensões ficam só na memória desta sessão */
  private memExtensions = new Map<string, { record: ExtensionRecord; files: Record<string, Uint8Array> }>();
  private memMeta = new Map<string, unknown>();
  /** Outras abas avisam quando gravam/apagam um board → este cache esquece a cópia velha. */
  private channel: BroadcastChannel | null;
  private readonly dbName: string;
  private readonly lsPrefix: string;
  private readonly lsSnapPrefix: string;
  private readonly migrateLegacy: boolean;

  /**
   * Chat 07: o Modo Servidor usa outra instância com outro banco (`ludraw-srv-<servidor>`) como cópia de
   * trabalho — nunca o banco do Modo Local. A migração do localStorage antigo só roda no banco local.
   */
  constructor(options: RepositoryOptions = {}) {
    this.dbName = options.dbName ?? DB_NAME;
    this.lsPrefix = options.lsPrefix ?? LS_PREFIX;
    this.lsSnapPrefix = options.lsSnapPrefix ?? LS_SNAP_PREFIX;
    this.migrateLegacy = options.migrateLegacy ?? this.dbName === DB_NAME;
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${this.dbName}-boards`) : null;
    this.channel?.addEventListener('message', (e: MessageEvent<{ id?: string }>) => this.forget(e.data?.id));
  }

  private announce(id: string): void {
    try {
      this.channel?.postMessage({ id });
    } catch {
      /* sem canal */
    }
  }

  /** Abre o IndexedDB e migra o localStorage (idempotente; chamado no boot e por qualquer operação). */
  init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        try {
          this.db = await openDb(this.dbName, () => this.emitStorage('blocked'));
          this.backend = 'indexeddb';
          // outra aba (versão nova do app, limpeza) precisa do banco: fecha esta conexão (para não
          // bloquear a outra) e avisa o usuário para recarregar; a próxima operação reabre
          this.db.onversionchange = () => {
            this.db?.close();
            this.db = null;
            this.ready = null;
            this.emitStorage('versionchange');
          };
          this.migration = this.migrateLegacy ? await this.migrateFromLocalStorage() : { migrated: 0, failed: 0 };
        } catch (err) {
          this.db = null;
          this.backend = 'localstorage';
          this.emitStorage((err as DOMException | null)?.name === 'VersionError' ? 'outdated' : 'fallback');
        }
        this.listeners.forEach((fn) => fn());
      })();
    }
    return this.ready;
  }

  /**
   * Chat 08.7 · R4 (S-29): sair do servidor — fecha a conexão (para o banco poder ser apagado) e trava as próximas
   * operações (ficam esperando para sempre; a página recarrega logo em seguida). Nada é gravado depois disto.
   */
  shutdown(): void {
    try {
      this.db?.close();
    } catch {
      /* já fechado */
    }
    this.db = null;
    this.ready = new Promise<void>(() => undefined);
    try {
      this.channel?.close();
    } catch {
      /* sem canal */
    }
    this.channel = null;
    this.cache.clear();
  }

  onReady(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Chat 06.5: eventos do armazenamento para a interface avisar o usuário. */
  onStorageEvent(fn: (e: StorageEvent) => void): () => void {
    this.storageListeners.add(fn);
    return () => this.storageListeners.delete(fn);
  }

  private emitStorage(e: StorageEvent): void {
    this.storageListeners.forEach((fn) => fn(e));
  }

  private async migrateFromLocalStorage(): Promise<MigrationReport> {
    const db = this.db!;
    const flag = await req(db.transaction('meta').objectStore('meta').get(MIGRATION_FLAG));
    const keys = lsKeys(this.lsPrefix);
    // já migrado e nada novo no localStorage (ex.: board criado por uma versão antiga em outra aba)
    if (flag && keys.length === 0) return { migrated: 0, failed: 0 };
    let migrated = 0;
    let failed = 0;
    for (const key of keys) {
      const id = key.slice(this.lsPrefix.length);
      const data = lsRead<BoardData>(key);
      if (!isBoardData(data)) {
        failed++;
        continue;
      }
      try {
        // não sobrescreve um board que já está no IndexedDB (o mais novo vence pelo próprio fluxo de gravação)
        const existing = await req(db.transaction('boards').objectStore('boards').get(id));
        if (!existing) {
          const tx = db.transaction('boards', 'readwrite');
          tx.objectStore('boards').put(data, id);
          await done(tx);
        }
        // confere a cópia antes de apagar o original
        const back = await req(db.transaction('boards').objectStore('boards').get(id));
        if (isBoardData(back)) {
          localStorage.removeItem(key);
          migrated++;
        } else failed++;
      } catch {
        failed++;
      }
    }
    // snapshots gravados pelo fallback de localStorage (se houver) também migram
    for (const key of lsKeys(this.lsSnapPrefix)) {
      const list = lsRead<BoardSnapshot[]>(key) ?? [];
      try {
        const tx = db.transaction('snapshots', 'readwrite');
        list.forEach((snap) => tx.objectStore('snapshots').put(snap));
        await done(tx);
        localStorage.removeItem(key);
      } catch {
        /* fica no localStorage para a próxima tentativa */
      }
    }
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(Date.now(), MIGRATION_FLAG);
    await done(tx);
    return { migrated, failed };
  }

  /* ------------------------------ Boards ------------------------------ */

  async loadBoard(id: string): Promise<BoardData | null> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    await this.init();
    let data: BoardData | null = null;
    if (this.db) {
      try {
        data = (await req(this.db.transaction('boards').objectStore('boards').get(id))) as BoardData | null;
      } catch {
        data = null;
      }
    }
    // fallback (ou dado que ficou no localStorage por falha de migração)
    if (!isBoardData(data)) data = lsRead<BoardData>(this.lsPrefix + id);
    if (!isBoardData(data)) return null;
    this.cache.set(id, data);
    return data;
  }

  /** Grava (cache na hora; disco em seguida). Devolve false se o armazenamento recusou. */
  async saveBoard(id: string, data: BoardData): Promise<void> {
    const ok = await this.trySaveBoard(id, data);
    if (!ok) throw new Error('storage-full');
  }

  async trySaveBoard(id: string, data: BoardData): Promise<boolean> {
    this.cache.set(id, data);
    await this.init();
    let ok: boolean;
    if (this.db) {
      try {
        const tx = this.db.transaction('boards', 'readwrite');
        tx.objectStore('boards').put(data, id);
        await done(tx);
        ok = true;
      } catch {
        ok = false;
      }
    } else ok = lsWrite(this.lsPrefix + id, data);
    if (ok) this.announce(id);
    return ok;
  }

  async deleteBoard(id: string): Promise<void> {
    this.cache.delete(id);
    this.announce(id);
    await this.init();
    if (this.db) {
      try {
        const tx = this.db.transaction(['boards', 'snapshots'], 'readwrite');
        tx.objectStore('boards').delete(id);
        const idx = tx.objectStore('snapshots').index('boardId');
        const keys = await req(idx.getAllKeys(IDBKeyRange.only(id)));
        keys.forEach((k) => tx.objectStore('snapshots').delete(k));
        await done(tx);
      } catch {
        /* nada a fazer */
      }
    }
    try {
      localStorage.removeItem(this.lsPrefix + id);
      localStorage.removeItem(this.lsSnapPrefix + id);
    } catch {
      /* sem localStorage */
    }
  }

  /** Ids de todos os boards gravados (backup do workspace). */
  async listBoardIds(): Promise<string[]> {
    await this.init();
    const ids = new Set<string>(lsKeys(this.lsPrefix).map((k) => k.slice(this.lsPrefix.length)));
    if (this.db) {
      try {
        (await req(this.db.transaction('boards').objectStore('boards').getAllKeys())).forEach((k) => ids.add(String(k)));
      } catch {
        /* só o que houver no localStorage */
      }
    }
    return [...ids];
  }

  /* ----------------------------- Snapshots ----------------------------- */

  async listSnapshots(boardId: string): Promise<BoardSnapshot[]> {
    await this.init();
    let list: BoardSnapshot[] = [];
    if (this.db) {
      try {
        list = await req(this.db.transaction('snapshots').objectStore('snapshots').index('boardId').getAll(IDBKeyRange.only(boardId)));
      } catch {
        list = [];
      }
    } else list = lsRead<BoardSnapshot[]>(this.lsSnapPrefix + boardId) ?? [];
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveSnapshot(s: BoardSnapshot): Promise<void> {
    await this.init();
    if (this.db) {
      const tx = this.db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(s);
      await done(tx);
      return;
    }
    const list = (lsRead<BoardSnapshot[]>(this.lsSnapPrefix + s.boardId) ?? []).filter((x) => x.id !== s.id);
    if (!lsWrite(this.lsSnapPrefix + s.boardId, [s, ...list])) throw new Error('storage-full');
  }

  async deleteSnapshot(id: string, boardId?: string): Promise<void> {
    await this.init();
    if (this.db) {
      const tx = this.db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').delete(id);
      await done(tx);
      return;
    }
    if (!boardId) return;
    const list = (lsRead<BoardSnapshot[]>(this.lsSnapPrefix + boardId) ?? []).filter((x) => x.id !== id);
    lsWrite(this.lsSnapPrefix + boardId, list);
  }

  /** Todos os snapshots (backup do workspace). */
  async listAllSnapshots(): Promise<BoardSnapshot[]> {
    await this.init();
    if (this.db) {
      try {
        return await req(this.db.transaction('snapshots').objectStore('snapshots').getAll());
      } catch {
        return [];
      }
    }
    return lsKeys(this.lsSnapPrefix).flatMap((k) => lsRead<BoardSnapshot[]>(k) ?? []);
  }

  /** Bytes usados (estimativa do navegador quando houver; senão, soma do JSON). */
  async estimateUsage(): Promise<number | null> {
    await this.init();
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage !== undefined) return est.usage;
    } catch {
      /* sem a API */
    }
    let total = 0;
    for (const id of await this.listBoardIds()) {
      const d = await this.loadBoard(id);
      if (d) total += JSON.stringify(d).length * 2;
    }
    return total;
  }

  /* ------------------------- Extensões (Chat 06.5) ------------------------- */

  /** As extensões instaladas sobrevivem a recarregar a página? (false = sem IndexedDB) */
  get extensionsPersistent(): boolean {
    return this.backend === 'indexeddb';
  }

  async listExtensionRecords(): Promise<ExtensionRecord[]> {
    await this.init();
    if (!this.db) return [...this.memExtensions.values()].map((e) => e.record);
    try {
      return await req(this.db.transaction('extensions').objectStore('extensions').getAll());
    } catch {
      return [];
    }
  }

  /**
   * Grava o registro e, se vierem `files`, SUBSTITUI todos os arquivos da extensão — numa só transação
   * (não existe meio-instalado).
   */
  async saveExtension(record: ExtensionRecord, files?: Record<string, Uint8Array>): Promise<void> {
    await this.init();
    if (!this.db) {
      const cur = this.memExtensions.get(record.id);
      this.memExtensions.set(record.id, { record, files: files ?? cur?.files ?? {} });
      return;
    }
    const tx = this.db.transaction(['extensions', 'extensionFiles'], 'readwrite');
    tx.objectStore('extensions').put(record);
    if (files) {
      const store = tx.objectStore('extensionFiles');
      store.delete(extFileRange(record.id));
      for (const [path, bytes] of Object.entries(files)) store.put(bytes, extFileKey(record.id, path));
    }
    await done(tx);
  }

  async deleteExtension(id: string): Promise<void> {
    await this.init();
    if (!this.db) {
      this.memExtensions.delete(id);
      return;
    }
    const tx = this.db.transaction(['extensions', 'extensionFiles'], 'readwrite');
    tx.objectStore('extensions').delete(id);
    tx.objectStore('extensionFiles').delete(extFileRange(id));
    await done(tx);
  }

  /** Arquivos instalados de uma extensão (a extensão sempre usa esta cópia, nunca a origem). */
  async loadExtensionFiles(id: string): Promise<Record<string, Uint8Array>> {
    await this.init();
    if (!this.db) return { ...(this.memExtensions.get(id)?.files ?? {}) };
    const out: Record<string, Uint8Array> = {};
    const store = this.db.transaction('extensionFiles').objectStore('extensionFiles');
    const [keys, values] = await Promise.all([req(store.getAllKeys(extFileRange(id))), req(store.getAll(extFileRange(id)))]);
    keys.forEach((k, i) => {
      const value: unknown = values[i];
      const path = String(k).slice(id.length + 1);
      if (value instanceof Uint8Array) out[path] = value;
      else if (value instanceof ArrayBuffer) out[path] = new Uint8Array(value);
    });
    return out;
  }

  async getExtensionMeta<T>(key: string): Promise<T | undefined> {
    await this.init();
    if (!this.db) return this.memMeta.get(key) as T | undefined;
    try {
      return (await req(this.db.transaction('meta').objectStore('meta').get(EXT_META_PREFIX + key))) as T | undefined;
    } catch {
      return undefined;
    }
  }

  async setExtensionMeta(key: string, value: unknown): Promise<void> {
    await this.init();
    if (!this.db) {
      this.memMeta.set(key, value);
      return;
    }
    const tx = this.db.transaction('meta', 'readwrite');
    if (value === undefined || value === null) tx.objectStore('meta').delete(EXT_META_PREFIX + key);
    else tx.objectStore('meta').put(value, EXT_META_PREFIX + key);
    await done(tx);
  }

  /** Esquece o cache (outra aba gravou; usado ao restaurar backup). */
  forget(id?: string): void {
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }
}

/** O que o app usa do repositório (as duas implementações oferecem o mesmo). */
export type AppBoardRepository = { [K in keyof LocalBoardRepository]: LocalBoardRepository[K] };

/** Banco do Modo Local (também guarda as extensões no Modo Servidor — elas são por navegador). */
export const localBoardRepository = new LocalBoardRepository();

/**
 * Chat 07: no Modo Servidor, o mesmo contrato sobre a API (cópia de trabalho em um banco próprio do servidor).
 * Escolhido uma vez, no carregamento da página (`utils/serverConfig.ts`).
 */
export const serverBoardRepository: ApiBoardRepository | null =
  isServerMode() && api
    ? new ApiBoardRepository(
        api,
        new LocalBoardRepository({ dbName: boardDbName(), lsPrefix: `ludraw-srv:${serverKey()}:board:`, lsSnapPrefix: `ludraw-srv:${serverKey()}:snapshots:`, migrateLegacy: false }),
        localBoardRepository,
      )
    : null;

/** Repositório único do app. */
export const boardRepository: AppBoardRepository = serverBoardRepository ?? localBoardRepository;
