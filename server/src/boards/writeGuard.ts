/**
 * LuDraw server — quem pode mudar o quê no conteúdo de um board (Chat 07).
 *
 * O cliente grava o board inteiro (JSON; o tempo real por operações é do Chat 08). O servidor compara a
 * versão gravada com a recebida e exige, para CADA mudança, a mesma ação do `can()` que o cliente usa:
 *
 *  - objeto novo/alterado/removido → `board.edit` (comentário: `board.comment`; apagar a conversa: `comment.delete`)
 *  - reagir (só o próprio clique) → `voting.cast`
 *  - travar/destravar → `element.lock*`/`element.unlock*` (bloqueio protegido: só quem travou, facilitador ou admin)
 *  - mexer num objeto com bloqueio protegido → `element.unlockProtected`
 *  - revelar notas privadas alheias → `privateMode.reveal`; ligar/desligar o Modo Privado → `privateMode.toggle`
 *  - cronômetro → `timer.manage`; votação (abrir, revelar, encerrar) → `voting.manage`; votar → `voting.cast`
 *  - facilitadores → `board.share`; seguir-me → `followMe.lead`; grade/fundo/tags → `board.edit`
 *
 * O que estava escondido pela redação (texto de nota privada alheia, cédulas de outras pessoas) volta do
 * banco — a pessoa não consegue apagar nem forjar o que não vê. Autoria (`createdBy`) é carimbada pelo
 * servidor. Activity Log: só acrescenta, com o autor forçado para quem gravou.
 */
import type { MessageDescriptor } from '../../../src/i18n/types';
import type { BoardActivityEntry, BoardData, CanvasElement, CommentElement, FacilitationState, StickyNoteElement, VotingState } from '../../../src/types/canvas';
import type { WorkspaceRole } from '../../../src/types/workspace';
import { effectiveLockMode, explain, type PermissionAction, type PermissionContext } from '../../../src/utils/permissions';
import { activityPermission, sanitizeActivityEntry } from '../../../src/utils/activityRules';
import { unsafeContentIn } from '../../../src/utils/contentSafety';
import { hiddenDraft, sumBallots } from './redact';

const LOCK_KEYS = new Set(['locked', 'lockMode', 'lockedBy']);
const REACTION_KEYS = new Set(['reactions', 'reactedBy']);
const IMMUTABLE_KEYS = new Set(['id', 'type', 'createdBy', 'createdAt']);
export const ACTIVITY_KEEP = 200;

export interface GuardInput {
  old: BoardData;
  incoming: BoardData;
  viewer: { userId: string; name: string; role: WorkspaceRole };
  /** contexto de permissão (com `lockedBy`/`authorId` quando a ação depende do objeto) */
  context: (extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => PermissionContext;
  canManageVoting: boolean;
  now: number;
}

export type GuardResult = { ok: true; data: BoardData; newActivity: BoardActivityEntry[] } | { ok: false; reason: MessageDescriptor };

class Denied extends Error {
  constructor(readonly reason: MessageDescriptor) {
    super('denied');
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changedKeys(o: Record<string, unknown>, n: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  return [...keys].filter((k) => !same(o[k], n[k]));
}

/** Diferença de `reactedBy` só envolve a própria pessoa? */
function onlyOwnReactions(o: StickyNoteElement, n: StickyNoteElement, userId: string): boolean {
  const emojis = new Set([...Object.keys(o.reactedBy ?? {}), ...Object.keys(n.reactedBy ?? {})]);
  for (const e of emojis) {
    const a = new Set((o.reactedBy?.[e] ?? []).filter((u) => u !== userId));
    const b = new Set((n.reactedBy?.[e] ?? []).filter((u) => u !== userId));
    if (a.size !== b.size || [...a].some((u) => !b.has(u))) return false;
  }
  // contadores coerentes com quem reagiu (quando a lista existe)
  for (const e of emojis) if (n.reactedBy?.[e] && (n.reactions?.[e] ?? 0) !== n.reactedBy[e].length) return false;
  return true;
}

function commentAuthor(c: CommentElement): string | null {
  return c.messages[0]?.authorId ?? c.createdBy ?? null;
}

/** Mensagens de outras pessoas foram editadas ou apagadas? */
function othersMessagesTouched(o: CommentElement, n: CommentElement, userId: string): boolean {
  const next = new Map(n.messages.map((m) => [m.id, m]));
  return o.messages.some((m) => m.authorId !== userId && (!next.has(m.id) || !same(next.get(m.id), m)));
}

export function guardBoardWrite(input: GuardInput): GuardResult {
  const { old, incoming, viewer } = input;
  const require = (action: PermissionAction, extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => {
    const d = explain(input.context(extra), action);
    if (!d.allowed) throw new Denied(d.reason ?? { key: 'permissions.denied.unknownAction' });
  };
  try {
    const elements: Record<string, CanvasElement> = {};

    // removidos
    for (const [id, o] of Object.entries(old.elements)) {
      if (incoming.elements[id]) continue;
      if (o.type === 'comment') require('comment.delete', { authorId: commentAuthor(o as CommentElement) });
      else {
        require('board.edit');
        const lock = effectiveLockMode(o);
        if (lock === 'protected') require('element.unlockProtected', { lockedBy: o.lockedBy ?? null });
        else if (lock === 'standard') require('element.unlockStandard', { lockedBy: o.lockedBy ?? null });
      }
    }

    for (const [id, n] of Object.entries(incoming.elements)) {
      const o = old.elements[id];
      if (!o) {
        // novo objeto: autoria carimbada pelo servidor
        require(n.type === 'comment' ? 'board.comment' : 'board.edit');
        // Chat 08.7 · R4 (S-30/S-31): link inseguro, imagem externa ou cor com url() num objeto novo = recusa
        const unsafe = unsafeContentIn(n);
        if (unsafe) throw new Denied(unsafe);
        const lock = effectiveLockMode(n);
        if (lock === 'protected') require('element.lockProtected');
        else if (lock === 'standard') require('element.lockStandard');
        elements[id] = { ...n, createdBy: viewer.userId, ...(lock !== 'none' ? { lockedBy: viewer.userId } : {}) } as CanvasElement;
        continue;
      }

      // nota privada de outra pessoa: o que a pessoa não vê não pode ser mudado (só revelar)
      if (hiddenDraft(o, viewer.userId)) {
        const ns = n as StickyNoteElement;
        if (ns.isPrivateDraft === false) {
          require('privateMode.reveal');
          elements[id] = { ...(o as StickyNoteElement), isPrivateDraft: false };
        } else elements[id] = o;
        continue;
      }

      const keys = changedKeys(o as unknown as Record<string, unknown>, n as unknown as Record<string, unknown>).filter((k) => !IMMUTABLE_KEYS.has(k));
      if (!keys.length) {
        elements[id] = o;
        continue;
      }
      // Chat 08.7 · R4 (S-30/S-31): só o valor inseguro NOVO/ALTERADO conta (o antigo igual continua aceito)
      const unsafe = unsafeContentIn(n, o);
      if (unsafe) throw new Denied(unsafe);
      const result: Record<string, unknown> = { ...(n as unknown as Record<string, unknown>), id: o.id, type: o.type, createdBy: o.createdBy, createdAt: o.createdAt };
      const oldLock = effectiveLockMode(o);
      const newLock = effectiveLockMode(n);

      // bloqueio
      if (keys.some((k) => LOCK_KEYS.has(k))) {
        if (oldLock === 'protected' && (newLock !== 'protected' || (n.lockedBy ?? null) !== (o.lockedBy ?? null))) require('element.unlockProtected', { lockedBy: o.lockedBy ?? null });
        if (oldLock === 'standard' && newLock !== 'standard') require('element.unlockStandard', { lockedBy: o.lockedBy ?? null });
        if (newLock === 'protected' && oldLock !== 'protected') require('element.lockProtected');
        if (newLock === 'standard' && oldLock !== 'standard') require('element.lockStandard');
        result.lockedBy = newLock === 'none' ? null : oldLock === newLock ? (o.lockedBy ?? null) : viewer.userId;
      }

      // reações
      if (keys.some((k) => REACTION_KEYS.has(k))) {
        if (o.type === 'sticky' && onlyOwnReactions(o as StickyNoteElement, n as StickyNoteElement, viewer.userId)) require('voting.cast');
        else require('board.edit');
      }

      // privado → público
      if (keys.includes('isPrivateDraft')) {
        if (o.createdBy && o.createdBy !== viewer.userId) require('privateMode.reveal');
        else require('board.edit');
      }

      const content = keys.filter((k) => !LOCK_KEYS.has(k) && !REACTION_KEYS.has(k) && k !== 'isPrivateDraft');
      if (content.length) {
        if (o.type === 'comment') {
          if (othersMessagesTouched(o as CommentElement, n as CommentElement, viewer.userId)) require('board.edit');
          else require('board.comment');
        } else {
          require('board.edit');
          // conteúdo de objeto com bloqueio protegido: só quem pode destravar
          if (oldLock === 'protected' && newLock === 'protected') require('element.unlockProtected', { lockedBy: o.lockedBy ?? null });
        }
      }
      elements[id] = result as unknown as CanvasElement;
    }

    // ordem: só mudança na ordem relativa do que já existia exige edição
    const known = new Set(Object.keys(elements));
    const order = incoming.elementOrder.filter((id, i, arr) => known.has(id) && arr.indexOf(id) === i);
    for (const id of known) if (!order.includes(id)) order.push(id);
    const commonOld = old.elementOrder.filter((id) => known.has(id) && old.elements[id]);
    const commonNew = order.filter((id) => old.elements[id]);
    if (!same(commonOld, commonNew)) require('board.edit');

    // aparência do board
    if (!same(old.gridSettings, incoming.gridSettings) || !same(old.backgroundColor, incoming.backgroundColor) || !same(old.initialView, incoming.initialView) || !same(old.boardTags, incoming.boardTags)) {
      require('board.edit');
    }
    if (!same(old.facilitatorIds ?? null, incoming.facilitatorIds ?? null)) require('board.share');

    const facilitation = mergeFacilitation(old.facilitation, incoming.facilitation, viewer.userId, require);
    // Chat 08.7 · R2 (S-03): entrada nova/atualizada só se tiver a forma certa e a pessoa puder fazer o que ela descreve
    const mayLog = (e: unknown): BoardActivityEntry | null => {
      const clean = sanitizeActivityEntry(e) as BoardActivityEntry | null;
      const need = clean && activityPermission(clean);
      return clean && need && explain(input.context(), need).allowed ? clean : null;
    };
    const { log, added } = mergeActivity(old.activityLog ?? [], incoming.activityLog ?? [], viewer, require, mayLog);

    const data: BoardData = {
      ...incoming,
      version: 1,
      elements,
      elementOrder: order,
      facilitation,
      activityLog: log,
    };
    if (facilitation === undefined) delete data.facilitation;
    return { ok: true, data, newActivity: added };
  } catch (e) {
    if (e instanceof Denied) return { ok: false, reason: e.reason };
    throw e;
  }
}

type Require = (action: PermissionAction, extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>) => void;

function stripVotes(v: VotingState | undefined): unknown {
  if (!v) return null;
  const { ballots: _b, votesByElement: _t, poll, ...rest } = v;
  void _b;
  void _t;
  if (!poll) return rest;
  const { responses: _r, voterNames: _n, ...pollRest } = poll;
  void _r;
  void _n;
  return { ...rest, poll: pollRest };
}

function mergeFacilitation(old: FacilitationState | undefined, next: FacilitationState | undefined, userId: string, require: Require): FacilitationState | undefined {
  // facilitação ausente no envio = nada mudou (o cliente sempre manda o estado que conhece)
  if (!next) return old;
  const o = old ?? { privateMode: { enabled: false, previewOwnNotes: false } };
  const pm = o.privateMode ?? { enabled: false, previewOwnNotes: false };
  const npm = next.privateMode ?? { enabled: false, previewOwnNotes: false };
  if (pm.enabled !== npm.enabled || (pm.startedBy ?? null) !== (npm.startedBy ?? null) || (pm.startedAt ?? null) !== (npm.startedAt ?? null)) require('privateMode.toggle');
  if (!same(o.timer ?? null, next.timer ?? null)) require('timer.manage');
  if ((o.leaderUserId ?? null) !== (next.leaderUserId ?? null)) require('followMe.lead');

  let voting = next.voting;
  const ov = o.voting;
  if (!same(stripVotes(ov), stripVotes(voting))) require('voting.manage');
  if (voting) {
    const sameSession = !!ov && (ov.startedAt ?? null) === (voting.startedAt ?? null);
    if (voting.kind === 'poll' && voting.poll) {
      const oldResp = sameSession ? (ov?.poll?.responses ?? {}) : {};
      const oldNames = sameSession ? (ov?.poll?.voterNames ?? {}) : {};
      const mine = voting.poll.responses[userId];
      if (!same(oldResp[userId] ?? null, mine ?? null)) require('voting.cast');
      const responses: Record<string, string[]> = { ...oldResp };
      const voterNames: Record<string, string> = { ...oldNames };
      if (mine) responses[userId] = mine;
      else delete responses[userId];
      const myName = voting.poll.voterNames?.[userId];
      if (myName) voterNames[userId] = myName;
      voting = { ...voting, poll: { ...voting.poll, responses, voterNames } };
    } else {
      const oldBallots = sameSession ? (ov?.ballots ?? {}) : {};
      const mine = voting.ballots?.[userId];
      if (!same(oldBallots[userId] ?? null, mine ?? null)) require('voting.cast');
      const ballots: Record<string, Record<string, number>> = { ...oldBallots };
      if (mine && Object.keys(mine).length) ballots[userId] = mine;
      else delete ballots[userId];
      voting = { ...voting, ballots, votesByElement: sumBallots(ballots) };
    }
  }
  return { ...next, voting };
}

function mergeActivity(
  old: BoardActivityEntry[],
  incoming: BoardActivityEntry[],
  viewer: GuardInput['viewer'],
  require: Require,
  mayLog: (e: unknown) => BoardActivityEntry | null,
): { log: BoardActivityEntry[]; added: BoardActivityEntry[] } {
  if (!incoming.length && old.length) {
    require('board.clearActivityLog');
    return { log: [], added: [] };
  }
  const byId = new Map(old.map((e) => [e.id, e]));
  const added: BoardActivityEntry[] = [];
  for (const e of incoming) {
    if (!e || typeof e.id !== 'string') continue;
    const prev = byId.get(e.id);
    if (prev) {
      // agrupamento de 8 s: só o próprio autor atualiza a própria entrada
      if (prev.actorId === viewer.userId && !same(prev, e)) {
        const clean = mayLog(e);
        if (!clean) continue;
        const updated = { ...clean, actorId: viewer.userId, actorName: viewer.name, actorRole: viewer.role };
        byId.set(e.id, updated);
        added.push(updated);
      }
      continue;
    }
    // Chat 08.7 · R2 (S-03): entrada nova sem forma válida ou sem permissão = ignorada (o resto do PUT segue)
    const clean = mayLog(e);
    if (!clean) continue;
    const entry = { ...clean, actorId: viewer.userId, actorName: viewer.name, actorRole: viewer.role };
    byId.set(e.id, entry);
    added.push(entry);
  }
  const log = [...byId.values()].sort((a, b) => (b.lastTimestamp ?? b.timestamp) - (a.lastTimestamp ?? a.timestamp)).slice(0, ACTIVITY_KEEP);
  return { log, added };
}
