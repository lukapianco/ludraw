/**
 * LuDraw server — uma sala de colaboração = um board aberto por alguém (Chat 08).
 *
 * A sala guarda:
 *  - o documento Yjs PÚBLICO (`board:<id>`), que o Hocuspocus transmite igual a todos;
 *  - os SEGREDOS que nunca entram nele: texto/tags das notas privadas, cédulas e respostas de enquete;
 *  - o Activity Log recente e os contadores de taxa de cada conexão.
 * Gravação: documento → `BoardData` completo (com os segredos) → `boards.data` + `revision`, mais o estado do
 * CRDT em `board_ydocs`. O REST (leitura, versões, busca, exportação) continua enxergando `boards.data`.
 */
import type { Connection, Document } from '@hocuspocus/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { boardDataToSlice, docEpoch, observeBoard, readElement, readFac, readSlice, rootsOf, seedDoc, sliceToBoardData, writeElement, writeTally, ORIGIN, type BoardChange, type PublicTally } from '../../../src/collab/codec';
import { pickDistinctColor } from '../../../src/collab/colors';
import { COLLABORATOR_PALETTE, encodeMessage, presenceColor, RATE, type ClientMessage, type PresenceUser, type ServerMessage, type WireRect } from '../../../src/collab/protocol';
import type { BoardActivityEntry, BoardData, CanvasElement, StickyNoteElement, StickyTag, VotingState } from '../../../src/types/canvas';
import { checkBoardData } from '../../../src/utils/boardLimits';
import { activityPermission } from '../../../src/utils/activityRules';
import { createId } from '../../../src/utils/id';
import { BOARD_LIMITS } from '../../../src/utils/boardLimits';
import { allowed, type Principal } from './authorize';
import { boardActivity, boards, boardYdocs } from '../db/schema';
import { loadOrganization } from '../workspace/state';
import type { WorkspacePolicies } from '../../../src/types/workspace';
import { boardDataOf, loadBoardRow } from '../boards/core';
import { linkedHashes, migrateBoardImages } from '../assets/service';
import { ballotsHidden, sumBallots } from '../boards/redact';
import type { CollabHub } from './hub';
import { Veto } from './veto';
import { recordAudit } from '../lib/audit';
import { SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import type { MessageDescriptor } from '../../../src/i18n/types';

export interface DraftSecret {
  text: string;
  tags: StickyTag[];
  authorName?: string;
  createdByName?: string;
  rev: number;
}

export interface PollSecret {
  responses: Record<string, string[]>;
  voterNames: Record<string, string>;
}

export interface Secrets {
  drafts: Map<string, DraftSecret>;
  /** userId → item → pontos */
  ballots: Record<string, Record<string, number>>;
  poll: PollSecret;
  /** `startedAt` da votação a que cédulas/respostas pertencem */
  session: number | null;
}

export interface Conn {
  id: string;
  hp: Connection;
  principal: Principal;
  /** credencial original (para repetir a conferência de visitante) */
  token: string | null;
  boardId: string;
  win: { start: number; presence: number; priv: number; sync: number; strikes: number };
  follow: string | null;
  closed: boolean;
  /** Chat 08.2: lote de reenvio offline aberto nesta conexão (recusa do veto não fecha; ver `hub.beforeSync`) */
  batch?: { until: number; updates: number; accepted: number; denied: { ids: string[]; reason: MessageDescriptor }[] } | null;
  /** Chat 08.2: esta mensagem foi recusada dentro de um lote — `readOnly` só para ela; volta a `prev` no `afterHandleMessage` */
  skipOnce?: { prev: boolean } | null;
  /** Chat 08.7 · R2 (S-03): entradas novas do Activity Log aceitas nesta janela de 1 min (`RATE.activityNewPerMinute`) */
  activity?: { start: number; fresh: number };
}

export function secretsFromData(data: BoardData): Secrets {
  const drafts = new Map<string, DraftSecret>();
  for (const el of Object.values(data.elements)) {
    if (el.type !== 'sticky' || !(el as StickyNoteElement).isPrivateDraft) continue;
    const s = el as StickyNoteElement;
    drafts.set(s.id, { text: s.text ?? '', tags: s.tags ?? [], authorName: s.authorName, createdByName: s.createdByName, rev: 0 });
  }
  const v = data.facilitation?.voting;
  return {
    drafts,
    ballots: v?.ballots ? structuredClone(v.ballots) : {},
    poll: { responses: v?.poll?.responses ? structuredClone(v.poll.responses) : {}, voterNames: v?.poll?.voterNames ? structuredClone(v.poll.voterNames) : {} },
    session: v?.startedAt ?? null,
  };
}

export class Room {
  doc!: Document;
  epoch = '';
  baseRevision = 0;
  secrets: Secrets = { drafts: new Map(), ballots: {}, poll: { responses: {}, voterNames: {} }, session: null };
  /** mais novo primeiro, teto do Activity Log */
  activity: BoardActivityEntry[] = [];
  /** entradas do Activity Log ainda não gravadas */
  pendingActivity: BoardActivityEntry[] = [];
  readonly conns = new Map<string, Conn>();
  /** presença ao vivo (por pessoa): o servidor carimba a identidade e junta os envios em lotes */
  private readonly cursors = new Map<string, { x: number; y: number }>();
  private readonly editing = new Map<string, string | null>();
  private readonly selection = new Map<string, string[]>();
  /** Chat 08.2: conexão que definiu a seleção/edição atual de cada pessoa (sai essa aba, solta o objeto) */
  private readonly holder = new Map<string, string>();
  /** Chat 08.2: última mensagem de cada pessoa (seleção de quem fica ocioso é solta) */
  private readonly lastSeen = new Map<string, number>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private readonly views = new Map<string, { x: number; y: number; zoom: number }>();
  private readonly marquees = new Map<string, WireRect | null>();
  private readonly dirtyPointers = { cursors: new Set<string>(), editing: new Set<string>(), selection: new Set<string>(), marquee: new Set<string>() };
  private pointerTimer: ReturnType<typeof setTimeout> | null = null;
  private hidden = false;
  /** sal da chave opaca das respostas de enquete anônima (muda a cada sala) */
  private readonly pollSalt = createId(10);
  /** cor de presença de cada pessoa NESTE board (distinta das outras; some quando a pessoa sai) */
  private readonly colors = new Map<string, string>();
  /** política do admin: separar cores iguais/parecidas (padrão ligado) */
  private distinctColors = true;
  private dirty = false;
  private offObserve: (() => void) | null = null;
  private persisting: Promise<void> = Promise.resolve();
  disposed = false;
  /** cópia-sombra que decide se uma atualização pode entrar (A-2) */
  veto!: Veto;
  boardName = '';
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  /** Chat 08.2: imagens vinculadas a este board (o veto só aceita referência nova que esteja aqui) */
  readonly linked = new Set<string>();
  /** recusas por pessoa, agrupadas antes de ir ao Audit Log */
  private readonly denials = new Map<string, { count: number; reason: MessageDescriptor; name: string; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    readonly hub: CollabHub,
    readonly boardId: string,
    readonly organizationId: string,
  ) {
    const idleMs = hub.ctx.config.collab.selectionIdleMs;
    this.idleTimer = setInterval(() => this.releaseIdle(), Math.min(30_000, Math.max(250, Math.floor(idleMs / 2))));
    this.idleTimer.unref?.();
  }

  /* ------------------------------ carregar ------------------------------ */

  /** Chat 08.2: imagem enviada/vinculada agora (rotas de imagem avisam a sala aberta). */
  linkAssets(hashes: Iterable<string>): void {
    for (const h of hashes) this.linked.add(h);
  }

  /* ------------------------------ carregar ------------------------------ */

  /** Chamado pelo `onLoadDocument`: restaura o CRDT salvo ou semeia a partir de `boards.data`. */
  async load(document: Document): Promise<void> {
    this.doc = document;
    const db = this.hub.ctx.db;
    // Chat 08.2: imagens embutidas → arquivos (normalmente já feito na autenticação; aqui por garantia)
    await migrateBoardImages(this.hub.ctx, this.boardId);
    const row = await loadBoardRow(db, this.boardId);
    const data = boardDataOf(row);
    for (const h of await linkedHashes(db, this.boardId)) this.linked.add(h);
    const [saved] = await db.select().from(boardYdocs).where(eq(boardYdocs.boardId, this.boardId));
    if (saved && saved.baseRevision === row.revision) {
      Y.applyUpdate(document, saved.state, ORIGIN.seed);
      this.epoch = docEpoch(document) ?? saved.epoch;
    } else {
      this.epoch = createId(12);
      seedDoc(document, boardDataToSlice(data), this.epoch);
      this.dirty = true;
    }
    this.baseRevision = row.revision;
    this.boardName = row.name;
    this.veto = new Veto(document);
    this.secrets = secretsFromData(data);
    await this.loadPolicies();
    this.activity = [...(data.activityLog ?? [])];
    this.offObserve = observeBoard(document, (change) => this.onDocChange(change));
    document.on('update', () => {
      this.dirty = true;
    });
    this.publishTally();
    this.scheduleClock();
    if (this.dirty) await this.persist();
  }

  dispose(): void {
    this.disposed = true;
    if (this.pointerTimer) clearTimeout(this.pointerTimer);
    if (this.clockTimer) clearTimeout(this.clockTimer);
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    for (const [uid, d] of this.denials) {
      clearTimeout(d.timer);
      void this.writeDenials(uid);
    }
    this.offObserve?.();
    this.offObserve = null;
  }

  facilitatorIds(): string[] | undefined {
    const f = rootsOf(this.doc).meta.get('facilitators');
    return Array.isArray(f) ? (f as string[]) : undefined;
  }

  can(conn: Conn, action: Parameters<typeof allowed>[2], extra?: Parameters<typeof allowed>[3]): boolean {
    return allowed(conn.principal, this.facilitatorIds(), action, extra);
  }

  /* ------------------------------ observar o documento ------------------------------ */

  private onDocChange(change: BoardChange): void {
    if (change.origin === ORIGIN.server) return;
    if (change.ids.size) this.reconcileDrafts(change.ids);
    if (change.fac) {
      this.syncVotingSession();
      this.publishTally();
      this.syncCursorsHidden();
      this.scheduleClock();
    }
  }

  /**
   * Nota privada revelada (`isPrivateDraft` virou falso) → o texto guardado volta para o documento público;
   * nota apagada → o segredo some. (Quem pode revelar é decidido antes, no veto do Chat 08 · A-2.)
   */
  private reconcileDrafts(ids: Iterable<string>): void {
    const els = rootsOf(this.doc).els;
    const reveal: CanvasElement[] = [];
    for (const id of ids) {
      const secret = this.secrets.drafts.get(id);
      if (!secret) continue;
      const y = els.get(id);
      if (!y) {
        this.secrets.drafts.delete(id);
        this.dirty = true;
        continue;
      }
      const el = readElement(y) as StickyNoteElement;
      if (el.isPrivateDraft) continue;
      reveal.push({ ...el, text: secret.text, tags: secret.tags, ...(secret.authorName !== undefined ? { authorName: secret.authorName } : {}), ...(secret.createdByName !== undefined ? { createdByName: secret.createdByName } : {}) } as CanvasElement);
      this.secrets.drafts.delete(id);
    }
    if (!reveal.length) return;
    this.doc.transact(() => {
      for (const el of reveal) {
        const y = els.get(el.id);
        if (y) writeElement(els, el, readElement(y));
      }
    }, ORIGIN.server);
    this.dirty = true;
  }

  /** Votação nova/encerrada → cédulas e respostas da anterior não valem mais. */
  private syncVotingSession(): void {
    const v = readFac(rootsOf(this.doc).fac).voting;
    const session = v?.startedAt ?? null;
    if (session === this.secrets.session) return;
    this.secrets.session = session;
    this.secrets.ballots = {};
    this.secrets.poll = { responses: {}, voterNames: {} };
    this.dirty = true;
    this.sendMeStateToAll();
  }

  /** O que cada pessoa pode ver da votação: o servidor decide e escreve em `fac.tally`. */
  publishTally(): void {
    const v = readFac(rootsOf(this.doc).fac).voting;
    if (!v) {
      writeTally(this.doc, null);
      return;
    }
    const tally: PublicTally = { session: v.startedAt ?? null, votesByElement: {} };
    if (v.kind === 'poll') {
      if (v.revealed || v.poll?.liveResults) {
        // enquete anônima com resultado parcial: a contagem sai, a identidade não (chaves opacas por pessoa)
        if (v.anonymous && !v.revealed) {
          const responses: Record<string, string[]> = {};
          for (const [uid, opts] of Object.entries(this.secrets.poll.responses)) responses[this.pollKey(uid)] = opts;
          tally.poll = { responses, voterNames: {} };
        } else tally.poll = { responses: this.secrets.poll.responses, voterNames: this.secrets.poll.voterNames };
      }
    } else if (!ballotsHidden(v)) {
      tally.ballots = this.secrets.ballots;
      tally.votesByElement = sumBallots(this.secrets.ballots);
    }
    writeTally(this.doc, tally);
  }

  /** Chave opaca de uma pessoa nas respostas de enquete anônima (cada uma só reconhece a própria). */
  pollKey(userId: string): string {
    return `a:${createHash('sha256').update(`${this.pollSalt}|${userId}`).digest('hex').slice(0, 12)}`;
  }

  /* ------------------------------ canal privado (me.*) ------------------------------ */

  handlePrivate(conn: Conn, msg: ClientMessage): void {
    switch (msg.t) {
      case 'me.hello':
        this.sendMeState(conn);
        return;
      case 'me.draft':
        this.acceptDraft(conn, msg);
        return;
      case 'me.ballot':
        this.acceptBallot(conn, msg);
        return;
      case 'me.poll':
        this.acceptPoll(conn, msg);
        return;
      case 'me.activity':
        this.acceptActivity(conn, msg.entries);
        return;
      default:
        return;
    }
  }

  private denyPrivate(conn: Conn, key: string): void {
    this.send(conn, { t: 'denied', scope: 'private', reason: { key } });
  }

  private acceptDraft(conn: Conn, msg: Extract<ClientMessage, { t: 'me.draft' }>): void {
    if (!this.can(conn, 'board.edit')) return this.denyPrivate(conn, 'permissions.denied.noEdit');
    if (msg.text.length > BOARD_LIMITS.textChars) return this.denyPrivate(conn, 'server.errors.textTooLong');
    const y = rootsOf(this.doc).els.get(msg.id);
    const el = y ? (readElement(y) as StickyNoteElement) : null;
    if (!el || el.type !== 'sticky' || !el.isPrivateDraft || el.createdBy !== conn.principal.userId) return this.denyPrivate(conn, 'server.errors.invalidRequest');
    const prev = this.secrets.drafts.get(msg.id);
    if (prev && msg.rev < prev.rev) return;
    this.secrets.drafts.set(msg.id, { text: msg.text, tags: msg.tags, authorName: conn.principal.name, createdByName: conn.principal.name, rev: msg.rev });
    this.dirty = true;
    this.sendMeStateToUser(conn.principal.userId, conn.id);
  }

  private votingNow(): VotingState | undefined {
    return readFac(rootsOf(this.doc).fac).voting;
  }

  private acceptBallot(conn: Conn, msg: Extract<ClientMessage, { t: 'me.ballot' }>): void {
    const v = this.votingNow();
    if (!this.can(conn, 'voting.cast')) return this.denyPrivate(conn, 'permissions.denied.noVote');
    if (!v || !v.active || v.revealed || v.kind === 'poll' || (v.startedAt ?? null) !== msg.session) return this.denyPrivate(conn, 'server.errors.invalidRequest');
    const els = rootsOf(this.doc).els;
    let total = 0;
    for (const [key, n] of Object.entries(msg.ballot)) {
      if (!els.has(key.split('::')[0])) return this.denyPrivate(conn, 'server.errors.invalidRequest');
      if (v.allowMultiplePerItem === false && n > 1) return this.denyPrivate(conn, 'server.errors.invalidRequest');
      total += n;
    }
    if (total > v.dotsPerUser) return this.denyPrivate(conn, 'server.errors.invalidRequest');
    if (Object.keys(msg.ballot).length) this.secrets.ballots[conn.principal.userId] = msg.ballot;
    else delete this.secrets.ballots[conn.principal.userId];
    this.afterVote(conn);
  }

  private acceptPoll(conn: Conn, msg: Extract<ClientMessage, { t: 'me.poll' }>): void {
    const v = this.votingNow();
    if (!this.can(conn, 'voting.cast')) return this.denyPrivate(conn, 'permissions.denied.noVote');
    if (!v || !v.active || v.revealed || v.kind !== 'poll' || !v.poll || (v.startedAt ?? null) !== msg.session) return this.denyPrivate(conn, 'server.errors.invalidRequest');
    const valid = new Set(v.poll.options.map((o) => o.id));
    if (msg.options.some((o) => !valid.has(o)) || (!v.poll.multiple && msg.options.length > 1)) return this.denyPrivate(conn, 'server.errors.invalidRequest');
    const uid = conn.principal.userId;
    if (msg.options.length) {
      this.secrets.poll.responses[uid] = msg.options;
      this.secrets.poll.voterNames[uid] = msg.name ?? conn.principal.name;
    } else {
      delete this.secrets.poll.responses[uid];
      delete this.secrets.poll.voterNames[uid];
    }
    this.afterVote(conn);
  }

  private afterVote(conn: Conn): void {
    this.dirty = true;
    this.publishTally();
    this.sendMeStateToAll(conn.id);
  }

  meState(conn: Conn): Extract<ServerMessage, { t: 'me.state' }> {
    const uid = conn.principal.userId;
    const els = rootsOf(this.doc).els;
    const drafts: Record<string, { text: string; tags: StickyTag[]; rev: number }> = {};
    for (const [id, d] of this.secrets.drafts) {
      const y = els.get(id);
      if (y && y.get('createdBy') === uid) drafts[id] = { text: d.text, tags: d.tags, rev: d.rev };
    }
    const v = this.votingNow();
    const mine = this.secrets.ballots[uid];
    const options = this.secrets.poll.responses[uid];
    return {
      t: 'me.state',
      drafts,
      ballot: mine ?? null,
      poll: options ? { options, name: this.secrets.poll.voterNames[uid] } : null,
      session: v?.startedAt ?? null,
      pollKey: this.pollKey(uid),
      // contagem parcial só pelo documento (`fac.tally`), e só quando o interruptor está ligado ou a votação foi revelada
      pollAll: null,
    };
  }

  sendMeState(conn: Conn): void {
    this.send(conn, this.meState(conn));
  }

  /** Atualiza as outras abas da mesma pessoa (a aba que enviou já tem o estado). */
  sendMeStateToUser(userId: string, exceptConnId?: string): void {
    for (const c of this.conns.values()) if (c.principal.userId === userId && c.id !== exceptConnId) this.sendMeState(c);
  }

  sendMeStateToAll(exceptConnId?: string): void {
    for (const c of this.conns.values()) if (c.id !== exceptConnId) this.sendMeState(c);
  }

  /* ------------------------------ conexões e presença ------------------------------ */

  send(conn: Conn, msg: ServerMessage): void {
    if (conn.closed) return;
    try {
      conn.hp.sendStateless(encodeMessage(msg));
    } catch {
      /* conexão já caiu */
    }
  }

  broadcast(msg: ServerMessage, except?: string): void {
    for (const c of this.conns.values()) if (c.id !== except) this.send(c, msg);
  }

  presence(): PresenceUser[] {
    const byUser = new Map<string, PresenceUser>();
    for (const c of this.conns.values()) {
      const cur = byUser.get(c.principal.userId);
      if (cur) cur.connections += 1;
      else byUser.set(c.principal.userId, { id: c.principal.userId, name: c.principal.name, color: this.colorFor(c.principal), role: c.principal.role, connections: 1 });
    }
    return [...byUser.values()];
  }

  /** A cor da pessoa neste board: a dela, se não se confunde com as de quem já está; senão uma bem diferente. */
  colorFor(p: Principal): string {
    const cur = this.colors.get(p.userId);
    if (cur) return cur;
    const wanted = p.color ?? presenceColor(p.userId, COLLABORATOR_PALETTE);
    const color = this.distinctColors ? pickDistinctColor(wanted, [...this.colors.values()], COLLABORATOR_PALETTE) : wanted;
    this.colors.set(p.userId, color);
    return color;
  }

  /** Relê as políticas da organização; se a de cores mudou, refaz as cores de quem está no board. */
  async loadPolicies(): Promise<void> {
    try {
      const org = await loadOrganization(this.hub.ctx.db, this.organizationId);
      const next = (org.policies as WorkspacePolicies).distinctPresenceColors !== false;
      if (next === this.distinctColors) return;
      this.distinctColors = next;
      this.colors.clear();
      if (this.conns.size) this.broadcastPresence();
    } catch {
      /* organização indisponível: mantém o que estava */
    }
  }

  broadcastPresence(): void {
    this.broadcast({ t: 'presence', users: this.presence() });
  }

  join(conn: Conn): void {
    this.conns.set(conn.id, conn);
    const color = this.colorFor(conn.principal);
    const v = this.votingNow();
    this.send(conn, {
      t: 'hello',
      v: 1,
      epoch: this.epoch,
      userId: conn.principal.userId,
      name: conn.principal.name,
      color,
      readOnly: conn.hp.readOnly,
      serverTime: Date.now(),
      hideCursors: !!v && v.active && !v.revealed && !!v.hideCursors,
      maxPayloadMb: Math.round(this.hub.ctx.config.collab.maxPayloadBytes / (1024 * 1024)),
    });
    this.sendMeState(conn);
    this.send(conn, { t: 'activity', entries: this.activity.slice(0, 200), replace: true });
    this.broadcastPresence();
  }

  leave(connId: string): void {
    const c = this.conns.get(connId);
    if (!c) return;
    c.closed = true;
    this.conns.delete(connId);
    const uid = c.principal.userId;
    if ([...this.conns.values()].some((x) => x.principal.userId === uid)) {
      // a pessoa continua noutra aba, mas a seleção/edição era DESTA conexão: solta o objeto para os outros
      if (this.holder.get(uid) === connId) this.releaseHold(uid);
    } else {
      this.cursors.delete(uid);
      this.editing.delete(uid);
      this.selection.delete(uid);
      this.holder.delete(uid);
      this.lastSeen.delete(uid);
      // os outros precisam saber que o objeto ficou livre (a presença some da tela deles)
      this.dirtyPointers.selection.add(uid);
      this.dirtyPointers.editing.add(uid);
      this.schedulePointers();
      this.marquees.delete(uid);
      this.views.delete(uid);
      this.colors.delete(uid);
      // quem conduzia saiu do board: ninguém fica preso seguindo uma tela que não existe mais
      const fac = rootsOf(this.doc).fac;
      if (!this.disposed && fac.get('leader') === uid) {
        this.doc.transact(() => fac.set('leader', null), ORIGIN.server);
        this.dirty = true;
      }
    }
    this.broadcastPresence();
  }

  /** Conta uma mensagem no limite por janela; devolve false se estourou (e fecha após várias janelas seguidas). */
  admit(conn: Conn, kind: 'presence' | 'priv' | 'sync', now = Date.now()): boolean {
    const w = conn.win;
    if (now - w.start >= RATE.windowMs) {
      if (w.presence > RATE.presencePerWindow || w.priv > RATE.privatePerWindow || w.sync > RATE.syncPerWindow) w.strikes += 1;
      else w.strikes = Math.max(0, w.strikes - 1);
      w.start = now;
      w.presence = 0;
      w.priv = 0;
      w.sync = 0;
    }
    w[kind] += 1;
    const limit = kind === 'presence' ? RATE.presencePerWindow : kind === 'priv' ? RATE.privatePerWindow : RATE.syncPerWindow;
    return w[kind] <= limit;
  }

  /* ------------------------------ veto, Activity Log e auditoria (A-2) ------------------------------ */

  /** Quem está usando o objeto agora (selecionado ou editando), sem contar a própria pessoa. */
  inUseBy(userId: string, id: string): string | null {
    // Chat 08.2: conversa (pin de comentário) é compartilhada — abrir/responder não prende o pin para os outros.
    // O nascimento do comentário é um rascunho local e chega já pronto, numa atualização só.
    if (rootsOf(this.doc).els.get(id)?.get('type') === 'comment') return null;
    const nameOf = (uid: string) => [...this.conns.values()].find((c) => c.principal.userId === uid)?.principal.name ?? uid;
    for (const [uid, eid] of this.editing) if (uid !== userId && eid === id) return nameOf(uid);
    for (const [uid, ids] of this.selection) if (uid !== userId && ids.includes(id)) return nameOf(uid);
    return null;
  }

  /** Pode esta atualização entrar? Null = sim; senão o motivo (do `explain()` ou dos limites) e os objetos tocados. */
  validate(conn: Conn, update: Uint8Array): { reason: MessageDescriptor; ids: string[] } | null {
    const p = conn.principal;
    const verdict = this.veto.check(update, { userId: p.userId, name: p.name, role: p.role, context: p.contextFor(this.facilitatorIds()) }, (id) => this.inUseBy(p.userId, id), Date.now(), (hash) => this.linked.has(hash));
    if (!verdict.ok) return { reason: verdict.reason, ids: verdict.ids ?? [] };
    if (verdict.revealed) this.audit(p.userId, 'private_notes_revealed', SERVER_AUDIT_MESSAGES.privateNotesRevealed, { count: verdict.revealed, name: this.boardName }, verdict.revealed);
    if (verdict.votingRevealed) this.audit(p.userId, 'voting_revealed', SERVER_AUDIT_MESSAGES.votingRevealed, { title: verdict.votingRevealed.title, name: this.boardName });
    return null;
  }

  private audit(actorId: string, action: 'private_notes_revealed' | 'voting_revealed' | 'collab_write_denied', key: string, params: Record<string, string | number | MessageDescriptor>, count?: number): void {
    void recordAudit(this.hub.ctx.db, {
      organizationId: this.organizationId,
      actorId,
      action,
      message: { key, params: params as never },
      targetType: 'board',
      targetId: this.boardId,
      targetName: this.boardName,
      ...(count !== undefined ? { count } : {}),
      origin: 'web',
    }).catch((err) => this.hub.log.error({ err }, 'collab audit failed'));
  }

  /** Recusa por papel/permissão: vai ao Audit Log agrupada por pessoa (1 linha a cada 30 s, com a contagem). */
  noteDenied(conn: Conn, reason: MessageDescriptor): void {
    const uid = conn.principal.userId;
    const cur = this.denials.get(uid);
    if (cur) {
      cur.count += 1;
      cur.reason = reason;
      return;
    }
    const timer = setTimeout(() => void this.writeDenials(uid), 30_000);
    timer.unref?.();
    this.denials.set(uid, { count: 1, reason, name: conn.principal.name, timer });
  }

  private async writeDenials(uid: string): Promise<void> {
    const d = this.denials.get(uid);
    if (!d) return;
    this.denials.delete(uid);
    this.audit(uid, 'collab_write_denied', SERVER_AUDIT_MESSAGES.collabWriteDenied, { count: d.count, name: this.boardName, reason: d.reason }, d.count);
  }

  /** Activity Log: a entrada vem do cliente (mensagem rica), mas o AUTOR é sempre quem está conectado. */
  private acceptActivity(conn: Conn, entries: BoardActivityEntry[]): void {
    const p = conn.principal;
    const stamped: BoardActivityEntry[] = [];
    const now = Date.now();
    if (!conn.activity || now - conn.activity.start >= 60_000) conn.activity = { start: now, fresh: 0 };
    for (const e of entries) {
      // Chat 08.7 · R2 (S-03): só entra o que a pessoa poderia ter feito (leitor/visitante só leem) — em silêncio
      const need = activityPermission(e);
      if (!need || !allowed(p, this.facilitatorIds(), need)) continue;
      const prev = this.activity.find((x) => x.id === e.id);
      // agrupamento de 8 s: só o próprio autor atualiza a própria entrada
      if (prev && prev.actorId !== p.userId) continue;
      // teto de entradas NOVAS por conexão por minuto (atualizar a própria entrada agrupada não conta)
      if (!prev) {
        if (conn.activity.fresh >= RATE.activityNewPerMinute) continue;
        conn.activity.fresh++;
      }
      const entry = { ...e, actorId: p.userId, actorName: p.name, actorRole: p.role } as BoardActivityEntry;
      this.activity = [entry, ...this.activity.filter((x) => x.id !== e.id)].sort((a, b) => (b.lastTimestamp ?? b.timestamp) - (a.lastTimestamp ?? a.timestamp)).slice(0, 200);
      this.pendingActivity = [...this.pendingActivity.filter((x) => x.id !== e.id), entry];
      stamped.push(entry);
    }
    if (!stamped.length) return;
    this.dirty = true;
    this.broadcast({ t: 'activity', entries: stamped });
  }

  /** Entrada do Activity Log gerada pelo próprio servidor (prazo da votação). */
  private systemActivity(action: BoardActivityEntry['action'], message: BoardActivityEntry['message']): void {
    const now = Date.now();
    const entry = { id: createId(10), timestamp: now, actorId: 'system', actorName: '', actorRole: 'admin', action, targetType: 'board', message } as BoardActivityEntry;
    this.activity = [entry, ...this.activity].slice(0, 200);
    this.pendingActivity.push(entry);
    this.dirty = true;
    this.broadcast({ t: 'activity', entries: [entry] });
  }

  /**
   * Relógio da facilitação NO SERVIDOR: fim do cronômetro e prazo da votação. Os clientes não gravam isso (seria
   * escrita de `timer.manage`/`voting.manage` por quem não é facilitador) — só tocam o alarme quando o fim chega.
   */
  scheduleClock(): void {
    if (this.clockTimer) clearTimeout(this.clockTimer);
    this.clockTimer = null;
    if (this.disposed) return;
    const f = readFac(rootsOf(this.doc).fac);
    const times: number[] = [];
    if (f.timer?.running && f.timer.endsAt) times.push(f.timer.endsAt);
    if (f.voting?.active && !f.voting.revealed && f.voting.endsAt) times.push(f.voting.endsAt);
    if (!times.length) return;
    const wait = Math.max(0, Math.min(...times) - Date.now());
    this.clockTimer = setTimeout(() => this.tickClock(), Math.min(wait, 2_147_000_000));
    this.clockTimer.unref?.();
  }

  private tickClock(): void {
    this.clockTimer = null;
    if (this.disposed) return;
    const now = Date.now();
    const fac = rootsOf(this.doc).fac;
    const f = readFac(fac);
    let revealedTitle: { title: string; poll: boolean } | null = null;
    this.doc.transact(() => {
      if (f.timer?.running && f.timer.endsAt && f.timer.endsAt <= now) fac.set('timer', { ...f.timer, running: false, remainingMs: 0, endsAt: null, finishedAt: now });
      const v = f.voting;
      if (v?.active && !v.revealed && v.endsAt && v.endsAt <= now) {
        fac.set('voting', { ...v, revealed: true, revealedAt: now, endsAt: null });
        revealedTitle = { title: v.title, poll: v.kind === 'poll' };
      }
    }, ORIGIN.server);
    if (revealedTitle) {
      const r = revealedTitle as { title: string; poll: boolean };
      this.publishTally();
      this.syncCursorsHidden();
      this.systemActivity('voting', { key: r.poll ? 'board.activity.pollTimeUp' : 'board.activity.voteTimeUp', params: { title: r.title } });
    }
    this.dirty = true;
    this.scheduleClock();
  }

  /* ------------------------------ presença ao vivo ------------------------------ */

  /** Chat 08.2: qualquer mensagem da pessoa conta como atividade (seleção de quem está ocioso é solta). */
  touch(conn: Conn, now = Date.now()): void {
    this.lastSeen.set(conn.principal.userId, now);
  }

  /** Solta a seleção/edição da pessoa (os outros veem o objeto livre na próxima rodada de presença). */
  private releaseHold(uid: string): { selected: string[]; editing: string | null } {
    const selected = this.selection.get(uid) ?? [];
    const editing = this.editing.get(uid) ?? null;
    if (selected.length) {
      this.selection.set(uid, []);
      this.dirtyPointers.selection.add(uid);
    }
    if (editing) {
      this.editing.set(uid, null);
      this.dirtyPointers.editing.add(uid);
    }
    this.holder.delete(uid);
    if (selected.length || editing) this.schedulePointers();
    return { selected, editing };
  }

  /** Quem segura objetos sem nenhuma atividade há `selectionIdleMs` perde a seleção; a tela da pessoa desmarca e avisa. */
  releaseIdle(now = Date.now()): void {
    if (this.disposed) return;
    const idleMs = this.hub.ctx.config.collab.selectionIdleMs;
    const holders = new Set([...this.selection].filter(([, ids]) => ids.length).map(([u]) => u));
    for (const [u, id] of this.editing) if (id) holders.add(u);
    for (const uid of holders) {
      const seen = this.lastSeen.get(uid) ?? 0;
      if (now - seen < idleMs) continue;
      const { selected, editing } = this.releaseHold(uid);
      const ids = [...new Set([...selected, ...(editing ? [editing] : [])])];
      if (!ids.length) continue;
      for (const c of this.conns.values()) if (c.principal.userId === uid) this.send(c, { t: 'select.denied', ids, by: null, reason: 'idle' });
    }
  }

  /** Votação anônima aberta e não revelada, com cursores ocultos: nada de posição, seleção ou edição sai daqui. */
  cursorsHidden(): boolean {
    const v = this.votingNow();
    return !!v && v.active && !v.revealed && !!v.hideCursors;
  }

  private syncCursorsHidden(): void {
    const now = this.cursorsHidden();
    if (now === this.hidden) return;
    this.hidden = now;
    if (now) {
      this.cursors.clear();
      this.editing.clear();
      this.selection.clear();
      this.marquees.clear();
      for (const s of Object.values(this.dirtyPointers)) s.clear();
    }
    this.broadcast({ t: 'cursors.hidden', hidden: now });
  }

  handlePresence(conn: Conn, msg: ClientMessage): void {
    const uid = conn.principal.userId;
    switch (msg.t) {
      case 'cursor':
      case 'editing':
      case 'marquee':
      case 'select': {
        if (this.hidden) return;
        if (msg.t === 'cursor') {
          this.cursors.set(uid, { x: msg.x, y: msg.y });
          this.dirtyPointers.cursors.add(uid);
        } else if (msg.t === 'marquee') {
          this.marquees.set(uid, msg.rect);
          this.dirtyPointers.marquee.add(uid);
        } else if (msg.t === 'editing') {
          // só marca como "editando" um elemento que a pessoa pode editar
          const ok = msg.id === null || this.can(conn, 'board.edit');
          // Chat 08.2: o servidor arbitra — quem chegou antes (na ordem de processamento) fica com o objeto
          const who = ok && msg.id ? this.inUseBy(uid, msg.id) : null;
          this.editing.set(uid, ok && !who ? msg.id : null);
          this.holder.set(uid, conn.id);
          this.dirtyPointers.editing.add(uid);
          if (who && msg.id) this.send(conn, { t: 'select.denied', ids: [msg.id], by: who, reason: 'inUse' });
        } else {
          const granted: string[] = [];
          const refused: string[] = [];
          let by: string | null = null;
          for (const id of msg.ids) {
            const who = this.inUseBy(uid, id);
            if (who) {
              refused.push(id);
              by ??= who;
            } else granted.push(id);
          }
          this.selection.set(uid, granted);
          this.holder.set(uid, conn.id);
          this.dirtyPointers.selection.add(uid);
          if (refused.length) this.send(conn, { t: 'select.denied', ids: refused, by, reason: 'inUse' });
        }
        this.schedulePointers();
        return;
      }
      case 'view': {
        this.views.set(uid, { x: msg.x, y: msg.y, zoom: msg.zoom });
        const leader = readFac(rootsOf(this.doc).fac).leaderUserId;
        for (const c of this.conns.values()) {
          if (c.principal.userId === uid) continue;
          if (c.follow === uid || leader === uid) this.send(c, { t: 'view', userId: uid, x: msg.x, y: msg.y, zoom: msg.zoom });
        }
        return;
      }
      case 'follow': {
        conn.follow = msg.userId && msg.userId !== uid ? msg.userId : null;
        const v = conn.follow ? this.views.get(conn.follow) : undefined;
        if (conn.follow && v) this.send(conn, { t: 'view', userId: conn.follow, ...v });
        return;
      }
      default:
        return;
    }
  }

  private schedulePointers(): void {
    if (this.pointerTimer) return;
    this.pointerTimer = setTimeout(() => {
      this.pointerTimer = null;
      this.flushPointers();
    }, 33);
  }

  private flushPointers(): void {
    const d = this.dirtyPointers;
    if (!d.cursors.size && !d.editing.size && !d.selection.size && !d.marquee.size) return;
    const cursors: Record<string, { x: number; y: number }> = {};
    const editing: Record<string, string | null> = {};
    const selection: Record<string, string[]> = {};
    const marquee: Record<string, WireRect | null> = {};
    for (const u of d.marquee) marquee[u] = this.marquees.get(u) ?? null;
    for (const u of d.cursors) if (this.cursors.has(u)) cursors[u] = this.cursors.get(u)!;
    for (const u of d.editing) editing[u] = this.editing.get(u) ?? null;
    for (const u of d.selection) selection[u] = this.selection.get(u) ?? [];
    d.cursors.clear();
    d.editing.clear();
    d.selection.clear();
    d.marquee.clear();
    for (const c of this.conns.values()) {
      const own = c.principal.userId;
      const pick = <T,>(o: Record<string, T>): Record<string, T> => {
        if (!(own in o)) return o;
        const { [own]: _mine, ...rest } = o;
        void _mine;
        return rest;
      };
      const msg = { t: 'pointers' as const, at: Date.now(), cursors: pick(cursors), editing: pick(editing), selection: pick(selection), marquee: pick(marquee) };
      if (Object.keys(msg.cursors).length || Object.keys(msg.editing).length || Object.keys(msg.selection).length || Object.keys(msg.marquee).length) this.send(c, msg);
    }
  }

  /* ------------------------------ gravar ------------------------------ */

  /** Documento → `BoardData` completo (com os segredos e o Activity Log). */
  toBoardData(): BoardData {
    const slice = readSlice(this.doc);
    const data = sliceToBoardData(slice, { activityLog: this.activity.slice(0, 200) });
    for (const [id, secret] of this.secrets.drafts) {
      const el = data.elements[id] as StickyNoteElement | undefined;
      if (!el || el.type !== 'sticky' || !el.isPrivateDraft) continue;
      data.elements[id] = { ...el, text: secret.text, tags: secret.tags, ...(secret.authorName !== undefined ? { authorName: secret.authorName } : {}), ...(secret.createdByName !== undefined ? { createdByName: secret.createdByName } : {}) } as CanvasElement;
    }
    const v = data.facilitation?.voting;
    if (data.facilitation && v) {
      data.facilitation.voting = v.kind === 'poll' && v.poll
        ? { ...v, poll: { ...v.poll, responses: this.secrets.poll.responses, voterNames: this.secrets.poll.voterNames } }
        : { ...v, ballots: this.secrets.ballots, votesByElement: sumBallots(this.secrets.ballots) };
    }
    return data;
  }

  /** Grava o que mudou (uma por vez, em ordem). Chamado pelo debounce do Hocuspocus, ao fechar a sala e antes de versões. */
  persist(force = false): Promise<void> {
    this.persisting = this.persisting.then(() => this.persistNow(force)).catch((err) => {
      this.hub.log.error({ err, boardId: this.boardId }, 'collab persist failed');
    });
    return this.persisting;
  }

  private async persistNow(force: boolean): Promise<void> {
    if (this.disposed || (!this.dirty && !force)) return;
    const data = this.toBoardData();
    const problem = checkBoardData(data);
    if (problem) {
      this.hub.log.error({ boardId: this.boardId, problem: problem.key }, 'collab: board over limits, not saved');
      return;
    }
    this.dirty = false;
    const state = Y.encodeStateAsUpdate(this.doc);
    const pending = this.pendingActivity;
    this.pendingActivity = [];
    let conflict = false;
    try {
      await this.hub.ctx.db.transaction(async (tx) => {
        const row = await loadBoardRow(tx as never, this.boardId, { lock: true });
        if (row.revision !== this.baseRevision) {
          conflict = true;
          return;
        }
        const revision = row.revision + 1;
        const now = new Date();
        await tx.update(boards).set({ data: data as unknown as Record<string, unknown>, revision, updatedAt: now }).where(eq(boards.id, this.boardId));
        await tx
          .insert(boardYdocs)
          .values({ boardId: this.boardId, state, epoch: this.epoch, baseRevision: revision, updatedAt: now })
          .onConflictDoUpdate({ target: boardYdocs.boardId, set: { state, epoch: this.epoch, baseRevision: revision, updatedAt: now } });
        for (const e of pending) {
          const at = new Date(e.lastTimestamp ?? e.timestamp ?? Date.now());
          await tx
            .insert(boardActivity)
            .values({ boardId: this.boardId, id: e.id, actorId: e.actorId, action: e.action, timestamp: at, entry: e as unknown as Record<string, unknown> })
            .onConflictDoUpdate({ target: [boardActivity.boardId, boardActivity.id], set: { entry: e as unknown as Record<string, unknown>, timestamp: at } });
        }
        this.baseRevision = revision;
      });
    } catch (err) {
      this.dirty = true;
      this.pendingActivity = [...pending, ...this.pendingActivity];
      throw err;
    }
    if (conflict) {
      // alguém gravou o board por fora (PUT, restauração): este documento ficou velho → recomeça
      this.hub.resetBoard(this.boardId, 'replaced');
    }
  }
}

