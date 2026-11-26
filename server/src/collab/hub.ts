/**
 * LuDraw server — tempo real (Chat 08): Hocuspocus (Yjs) na MESMA porta da API, no caminho `/api/v1/collab`.
 *
 * Fluxo de uma conexão:
 *   upgrade (caminho, Origin, limite por IP) → `onAuthenticate` (credencial → sessão/link → `board.view` →
 *   época do documento local) → `onLoadDocument` (Room) → `connected` (presença) → mensagens:
 *   `beforeSync` (limite de taxa; no A-2 também o veto) e `onStateless` (canal privado `me.*`, presença).
 * Só o nome `board:<id>` é aceito como documento. O canal privado não é um documento: ele pertence à
 * conexão autenticada, então não existe "o `:me` de outra pessoa".
 */
import { clientAddress } from '../lib/trust';
import type { LimitResult } from '../lib/limiter';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Hocuspocus, type Connection, type onAuthenticatePayload, type onLoadDocumentPayload, type connectedPayload, type beforeSyncPayload, type onStatelessPayload, type onStoreDocumentPayload, type onDisconnectPayload, type afterHandleMessagePayload } from '@hocuspocus/server';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import * as yjs from 'yjs';
import { bindYjs } from '../../../src/collab/codec';
import { CLOSE, decodeCredential, COLLAB_PATH, boardDocName, parseBoardDocName, parseClientMessage, RATE } from '../../../src/collab/protocol';
import { explain } from '../../../src/utils/permissions';
import { allowedOrigins } from '../config';
import type { MessageDescriptor, StoredMessage } from '../../../src/i18n/types';

/** Motivo para o cliente: chave + parâmetros sem campos indefinidos (formato do fio). */
const wire = (m: MessageDescriptor): StoredMessage => JSON.parse(JSON.stringify(m)) as StoredMessage;
import type { AppContext } from '../context';
import { boardYdocs } from '../db/schema';
import { authorizeConnection, CollabDenied, recheck, type Principal } from './authorize';
import { Room, type Conn } from './room';
import { migrateBoardImages } from '../assets/service';
import { CollabRefusal, installRefusalFilter, type RefusalReason } from './quietLog';

interface ConnContext {
  ip?: string;
  principal?: Principal;
  boardId?: string;
  token?: string | null;
  conn?: Conn;
}

bindYjs(yjs);

/** Fecha a conexão com um código do LuDraw (recusa esperada: a linha do Hocuspocus vai para o logger em debug). */
class CloseWith extends CollabRefusal {
  constructor(code: number, reason: 'denied' | 'rate') {
    super(reason, code);
  }
}

/** Chat 08.7 · R5 (S-14): mesma regra de proxy do REST (`lib/trust.ts`) — antes pegava o último X-Forwarded-For. */
export function clientIp(req: IncomingMessage, ctx: Pick<AppContext, 'config'>): string {
  return clientAddress(req, ctx.config.trustProxy);
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export class CollabHub {
  readonly hocuspocus: Hocuspocus;
  readonly rooms = new Map<string, Room>();
  readonly log: FastifyBaseLogger;
  private readonly wss: WebSocketServer;
  private readonly resetting = new Set<string>();
  private sweeper: NodeJS.Timeout | null = null;
  private closed = false;
  /** Recusas esperadas por motivo desde que o servidor subiu (o Hocuspocus imprimiria cada uma no console). */
  readonly refusals = new Map<RefusalReason, number>();
  private readonly uninstallLogFilter: () => void;

  constructor(
    readonly ctx: AppContext,
    app: FastifyInstance,
  ) {
    this.log = app.log;
    this.uninstallLogFilter = installRefusalFilter((e) => {
      // cada recusa gera até 2 linhas no Hocuspocus ([hook] e "closing connection"): conta uma vez, pela linha do hook
      if (e.line !== 'hook') return;
      const count = (this.refusals.get(e.reason) ?? 0) + 1;
      this.refusals.set(e.reason, count);
      const quiet = e.reason === 'rate' || e.reason === 'limit' ? 'info' : 'debug';
      this.log[quiet]({ reason: e.reason, hook: e.hook, count }, 'collab: recusa esperada');
    });
    const cfg = ctx.config.collab;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: cfg.maxPayloadBytes });
    this.hocuspocus = new Hocuspocus<ConnContext>({
      name: 'ludraw',
      quiet: true,
      timeout: 30_000,
      debounce: cfg.storeDebounceMs,
      maxDebounce: Math.max(10_000, cfg.storeDebounceMs * 5),
      onAuthenticate: (d) => this.onAuthenticate(d),
      onLoadDocument: (d) => this.onLoadDocument(d),
      connected: (d) => this.onConnected(d),
      beforeSync: (d) => this.beforeSync(d),
      afterHandleMessage: (d) => this.afterHandleMessage(d),
      onStateless: (d) => this.onStateless(d),
      onStoreDocument: (d) => this.onStoreDocument(d),
      onDisconnect: (d) => this.onDisconnect(d),
      afterUnloadDocument: async ({ documentName }) => {
        const id = parseBoardDocName(documentName);
        if (!id) return;
        this.rooms.get(id)?.dispose();
        this.rooms.delete(id);
        this.resetting.delete(id);
      },
    });
  }

  /* ------------------------------ ligação com o servidor HTTP ------------------------------ */

  attach(server: Server): void {
    server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
    this.sweeper = setInterval(() => void this.recheckAll(), 60_000);
    this.sweeper.unref();
  }

  private reject(socket: Duplex, status: number, text: string): void {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = (req.url ?? '').split('?')[0];
    if (path !== COLLAB_PATH || !this.ctx.config.collab.enabled || this.closed) return this.reject(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins(this.ctx.config).has(origin)) return this.reject(socket, 403, 'Forbidden');
    const ip = clientIp(req, this.ctx);
    socket.on('error', () => undefined);
    const proceed = (limit: LimitResult) => {
      if (!limit.allowed) return this.reject(socket, 429, 'Too Many Requests');
      if (this.closed || socket.destroyed) return socket.destroy();
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, req, ip));
    };
    // em memória a resposta é imediata (mesmo caminho síncrono de sempre); no Redis (Chat 09 · R4) espera — e, com o
    // Redis fora do ar, recusa a conexão (503) em vez de deixar entrar sem contar
    const limit = this.ctx.limiters.collabConnect.hit(ip);
    if (limit instanceof Promise) limit.then(proceed, () => this.reject(socket, 503, 'Service Unavailable'));
    else proceed(limit);
  }

  private accept(ws: WebSocket, req: IncomingMessage, ip: string): void {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://localhost${req.url ?? '/'}`, { headers });
    const cc = this.hocuspocus.handleConnection(ws as never, request, { ip });
    ws.on('message', (data) => cc.handleMessage(toBytes(data)));
    ws.on('pong', () => cc.touch());
    ws.on('close', (code, reason) => cc.handleClose({ code, reason: reason.toString() }));
    ws.on('error', () => undefined);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.sweeper) clearInterval(this.sweeper);
    try {
      this.hocuspocus.flushPendingStores();
      await Promise.all([...this.rooms.values()].map((r) => r.persist()));
      for (const client of this.wss.clients) client.close(1001, 'server shutting down');
      this.wss.close();
      await this.hocuspocus.closeConnections();
    } finally {
      // também quando o fechamento falha: o console.error do processo volta ao normal
      this.uninstallLogFilter();
    }
  }

  /* ------------------------------ hooks do Hocuspocus ------------------------------ */

  private countUserConns(userId: string): number {
    let n = 0;
    for (const room of this.rooms.values()) for (const c of room.conns.values()) if (c.principal.userId === userId) n++;
    return n;
  }

  private async onAuthenticate(d: onAuthenticatePayload<ConnContext>): Promise<ConnContext> {
    const boardId = parseBoardDocName(d.documentName);
    // `board:<id>:me` e qualquer outro nome são recusados: o que é privado não é um documento compartilhado
    if (!boardId) throw new CollabDenied('denied');
    const cred = decodeCredential(d.token);
    if (!cred) throw new CollabDenied('unauthorized');
    if (this.resetting.has(boardId)) throw new CollabDenied('limit');
    const { principal } = await authorizeConnection(this.ctx, cred, boardId);
    if (this.countUserConns(principal.userId) >= this.ctx.config.collab.maxConnectionsPerUser) throw new CollabDenied('limit');

    // cópia local de uma "vida" antiga do documento (restauração, PUT) não pode ser juntada à nova
    const room = this.rooms.get(boardId);
    // Chat 08.2: sala ainda fechada → migra as imagens embutidas AGORA; se migrou, toda cópia local é de outra época
    if (!room && (await migrateBoardImages(this.ctx, boardId)) && cred.e) throw new CollabDenied('reset:epoch');
    const [saved] = room ? [] : await this.ctx.db.select({ epoch: boardYdocs.epoch }).from(boardYdocs).where(eq(boardYdocs.boardId, boardId));
    const epoch = room?.epoch || saved?.epoch;
    // Chat 08.7 · R2 (S-27): sem atalho. O `Room.load` grava a época assim que semeia, então "época desconhecida" só
    // acontece depois de um PUT/restauração (o `resetBoard` apaga `board_ydocs`): quem traz cópia local de uma época que
    // o servidor não reconhece recomeça — senão a cópia antiga desfaria a restauração.
    if (cred.e && cred.e !== epoch) throw new CollabDenied('reset:epoch');

    d.connectionConfig.readOnly = !explain(principal.contextFor(room?.facilitatorIds())(), 'board.comment').allowed;
    return { principal, boardId, token: cred.k === 'v' ? cred.t : null };
  }

  private async onLoadDocument(d: onLoadDocumentPayload<ConnContext>): Promise<void> {
    const boardId = parseBoardDocName(d.documentName);
    if (!boardId) throw new CollabDenied('denied');
    const organizationId = d.context.principal?.organizationId;
    if (!organizationId) throw new CollabDenied('denied');
    const room = new Room(this, boardId, organizationId);
    await room.load(d.document);
    this.rooms.set(boardId, room);
  }

  private onConnected(d: connectedPayload<ConnContext>): Promise<void> {
    const boardId = parseBoardDocName(d.documentName);
    const room = boardId ? this.rooms.get(boardId) : undefined;
    if (!boardId || !room) return Promise.resolve();
    const conn: Conn = {
      id: d.socketId,
      hp: d.connection as Connection,
      principal: d.context.principal as Principal,
      token: d.context.token ?? null,
      boardId,
      win: { start: Date.now(), presence: 0, priv: 0, sync: 0, strikes: 0 },
      follow: null,
      closed: false,
    };
    d.context.conn = conn;
    room.join(conn);
    return Promise.resolve();
  }

  private roomAndConn(context: ConnContext): { room: Room; conn: Conn } {
    const conn = context.conn;
    const room = conn ? this.rooms.get(conn.boardId) : undefined;
    if (!conn || !room) throw new CloseWith(CLOSE.denied, 'denied');
    return { room, conn };
  }

  /** Antes de aplicar qualquer atualização do Yjs: limite de taxa (e, no A-2, o veto por permissão). */
  private async beforeSync(d: beforeSyncPayload<ConnContext>): Promise<void> {
    const { room, conn } = this.roomAndConn(d.context);
    this.restoreSkip(conn);
    room.touch(conn);
    // 0 = SyncStep1 (só pede o estado); 1 e 2 trazem alterações
    if (d.type === 0) return;
    if (!room.admit(conn, 'sync')) {
      room.send(conn, { t: 'denied', scope: 'rate', reason: { key: 'server.errors.tooManyAttempts' } });
      throw new CloseWith(CLOSE.rateLimited, 'rate');
    }
    // somente leitura: o próprio Hocuspocus não aplica (e responde "não sincronizado")
    if (conn.hp.readOnly) return;
    const batch = this.openBatch(conn);
    // A-2: VETO antes de aplicar e de transmitir — a escrita recusada não chega a ninguém
    const refused = room.validate(conn, d.payload);
    if (batch) batch.updates += 1;
    if (refused) {
      room.noteDenied(conn, refused.reason);
      if (batch) {
        // Chat 08.2: reenvio offline objeto por objeto — recusa SÓ esta atualização e mantém a conexão. O Hocuspocus não
        // aplica (nem transmite) mensagem de conexão somente leitura; o `readOnly` vale só para esta mensagem.
        batch.denied.push({ ids: refused.ids, reason: refused.reason });
        room.send(conn, { t: 'denied', scope: 'object', ids: refused.ids, reason: wire(refused.reason) });
        conn.skipOnce = { prev: conn.hp.readOnly };
        conn.hp.readOnly = true;
        return;
      }
      room.send(conn, { t: 'denied', scope: 'document', reason: wire(refused.reason) });
      throw new CloseWith(CLOSE.denied, 'denied');
    }
    if (batch) batch.accepted += 1;
  }

  /** Lote de reenvio aberto e dentro dos tetos (`RATE.batchMaxUpdates`, `RATE.batchMaxMs`)? Fora deles, a recusa volta a fechar. */
  private openBatch(conn: Conn): NonNullable<Conn['batch']> | null {
    const b = conn.batch;
    if (!b) return null;
    if (Date.now() > b.until || b.updates >= RATE.batchMaxUpdates) return null;
    return b;
  }

  /** Desfaz o `readOnly` de uma única mensagem recusada no lote. */
  private restoreSkip(conn: Conn): void {
    if (!conn.skipOnce) return;
    conn.hp.readOnly = conn.skipOnce.prev;
    conn.skipOnce = null;
  }

  private async afterHandleMessage(d: afterHandleMessagePayload): Promise<void> {
    const conn = (d.context as ConnContext | undefined)?.conn;
    if (conn) this.restoreSkip(conn);
  }

  /** `batch on` abre um lote; `batch off` fecha e devolve o resumo (as mensagens chegam em fila: o resumo vem depois de todas). */
  private handleBatch(room: Room, conn: Conn, on: boolean): void {
    if (on) {
      if (conn.hp.readOnly) return;
      conn.batch = { until: Date.now() + RATE.batchMaxMs, updates: 0, accepted: 0, denied: [] };
      return;
    }
    const b = conn.batch;
    conn.batch = null;
    room.send(conn, { t: 'batch.result', accepted: b?.accepted ?? 0, denied: (b?.denied ?? []).map((x) => ({ ids: x.ids, reason: wire(x.reason) })) });
  }

  private async onStateless(d: onStatelessPayload): Promise<void> {
    const context = (d.connection.context ?? {}) as ConnContext;
    const conn = context.conn;
    const room = conn ? this.rooms.get(conn.boardId) : undefined;
    if (!conn || !room) return;
    const msg = parseClientMessage(d.payload);
    if (!msg) return;
    room.touch(conn);
    const kind = msg.t.startsWith('me.') ? 'priv' : 'presence';
    if (!room.admit(conn, kind)) {
      if (conn.win.strikes >= RATE.strikesToClose) this.kick(conn, CLOSE.rateLimited, 'rate');
      return;
    }
    if (msg.t === 'batch') {
      this.handleBatch(room, conn, msg.on);
      return;
    }
    if (msg.t === 'ping') {
      room.send(conn, { t: 'pong', c: msg.c, s: Date.now() });
      return;
    }
    if (kind === 'priv') room.handlePrivate(conn, msg);
    else room.handlePresence(conn, msg);
  }

  private async onStoreDocument(d: onStoreDocumentPayload<ConnContext>): Promise<void> {
    const boardId = parseBoardDocName(d.documentName);
    await (boardId ? this.rooms.get(boardId)?.persist() : undefined);
  }

  private async onDisconnect(d: onDisconnectPayload<ConnContext>): Promise<void> {
    const boardId = parseBoardDocName(d.documentName);
    const room = boardId ? this.rooms.get(boardId) : undefined;
    if (room && d.context.conn) room.leave(d.context.conn.id);
  }

  /* ------------------------------ operações usadas pelas rotas REST ------------------------------ */

  /** Fecha uma conexão de verdade (o socket também), com um motivo que o cliente entende. */
  kick(conn: Conn, code: number, reason: string): void {
    if (conn.closed) return;
    conn.closed = true;
    try {
      conn.hp.close({ code, reason } as never);
      conn.hp.webSocket.close(code === CLOSE.reset ? 1000 : 1008, reason);
    } catch {
      /* já fechada */
    }
  }

  /** Grava agora o que está em memória (antes de criar uma versão). */
  async flush(boardId: string): Promise<void> {
    await this.rooms.get(boardId)?.persist(true);
  }

  /**
   * O conteúdo do board foi trocado por fora (PUT, restauração de versão): descarta a vida atual do documento,
   * avisa quem está conectado e obriga a recomeçar a partir do banco.
   */
  async resetBoard(boardId: string, reason: 'restored' | 'replaced', by?: string): Promise<void> {
    const room = this.rooms.get(boardId);
    this.resetting.add(boardId);
    try {
      await this.ctx.db.delete(boardYdocs).where(eq(boardYdocs.boardId, boardId));
      if (!room) {
        this.resetting.delete(boardId);
        return;
      }
      room.disposed = true;
      room.broadcast({ t: 'reload', reason, ...(by ? { by } : {}) });
      for (const c of [...room.conns.values()]) this.kick(c, CLOSE.reset, 'reset');
      const name = boardDocName(boardId);
      for (let i = 0; i < 40; i++) {
        this.hocuspocus.flushPendingStores();
        const doc = this.hocuspocus.documents.get(name);
        if (!doc) break;
        if (this.hocuspocus.shouldUnloadDocument(doc)) {
          await this.hocuspocus.unloadDocument(doc);
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      this.resetting.delete(boardId);
    }
  }

  /** Repete a conferência de acesso de todas as conexões que passam pelo filtro. */
  async recheckWhere(filter: (c: Conn) => boolean): Promise<void> {
    for (const room of [...this.rooms.values()]) {
      for (const conn of [...room.conns.values()]) {
        if (!filter(conn)) continue;
        const res = await recheck(this.ctx, conn.principal, conn.boardId, conn.token);
        if (!res.ok) {
          room.send(conn, { t: 'reload', reason: 'access' });
          this.kick(conn, res.reason === 'unauthorized' ? CLOSE.unauthorized : CLOSE.denied, res.reason);
          continue;
        }
        conn.principal = res.principal;
        const canComment = explain(res.principal.contextFor(room.facilitatorIds())(), 'board.comment').allowed;
        const canView = explain(res.principal.contextFor(room.facilitatorIds())(), 'board.view').allowed;
        if (!canView) {
          room.send(conn, { t: 'reload', reason: 'access' });
          this.kick(conn, CLOSE.denied, 'denied');
          continue;
        }
        // rebaixar editor→leitor vale já: a conexão passa a ser só de leitura, e o navegador recomeça sem o que
        // ainda não tinha sido aceito (com aviso traduzido e a opção de baixar o que foi descartado)
        const wasReadOnly = conn.skipOnce ? conn.skipOnce.prev : conn.hp.readOnly;
        // mensagem recusada num lote ainda em curso: ela continua sem efeito; o papel novo vale logo depois dela
        if (conn.skipOnce) conn.skipOnce = { prev: !canComment };
        else conn.hp.readOnly = !canComment;
        if (!wasReadOnly && !canComment) {
          const why = explain(res.principal.contextFor(room.facilitatorIds())(), 'board.comment').reason ?? { key: 'permissions.denied.noAccess' };
          room.send(conn, { t: 'denied', scope: 'document', reason: wire(why) });
        }
        room.sendMeState(conn);
      }
    }
  }

  recheckAll(): Promise<void> {
    return this.recheckWhere(() => true);
  }

  /** Mudou algo na organização (papéis, ACL, link público, suspensão): confere de novo quem está conectado. */
  async invalidateOrg(organizationId: string): Promise<void> {
    for (const room of this.rooms.values()) if (room.organizationId === organizationId) await room.loadPolicies();
    await this.recheckWhere((c) => c.principal.organizationId === organizationId);
  }

  invalidateBoard(boardId: string): Promise<void> {
    return this.recheckWhere((c) => c.boardId === boardId);
  }
}

