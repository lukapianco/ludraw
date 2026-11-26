/**
 * LuDraw — Votação por pontos (Chat 04): funções PURAS sobre os itens votáveis.
 *
 * Item votável = post-it, forma ou card de Kanban. A chave é o id do elemento ou
 * `"<kanbanId>::<cardId>"` para cards. Os pontos ficam em `facilitation.voting` (fora do desfazer);
 * o store aplica as regras (`castVote`/`retractVote` com `voting.cast`, limites de pontos).
 * Local ≠ seguro: o anonimato aqui é de interface; o servidor (Chat 08) esconde as cédulas alheias.
 */

import type { CanvasElement, VoteTargetKey, VotingState } from '../types/canvas';
import { cardWorldRect, findCard } from './kanban';
import { getElementBounds, type Rect } from './math';
import { isPrivateDraftHidden } from './permissions';
import { t } from '../i18n';

/** Cores das medalhas (ouro, prata, bronze) — cor de CONTEÚDO, igual nos dois temas (DS §6.2). */
export const MEDAL_COLORS = ['#E0A21B', '#A9ADA8', '#B07D0A'] as const;

const SEP = '::';

export function kanbanVoteKey(kanbanId: string, cardId: string): VoteTargetKey {
  return `${kanbanId}${SEP}${cardId}`;
}

export function parseVoteKey(key: VoteTargetKey): { elementId: string; cardId: string | null } {
  const i = key.indexOf(SEP);
  if (i < 0) return { elementId: key, cardId: null };
  return { elementId: key.slice(0, i), cardId: key.slice(i + SEP.length) };
}

/** O elemento aceita votos diretamente (clique nele)? */
export function isVotableElement(el: CanvasElement | undefined | null): boolean {
  return !!el && (el.type === 'sticky' || el.type === 'shape');
}

export type Lookup = (id: string) => CanvasElement | undefined;

/** O item ainda existe no board? */
export function voteTargetExists(key: VoteTargetKey, lookup: Lookup): boolean {
  const { elementId, cardId } = parseVoteKey(key);
  const el = lookup(elementId);
  if (!el) return false;
  if (!cardId) return isVotableElement(el);
  return el.type === 'kanban' && !!findCard(el, cardId);
}

/** Caixa (mundo) do item — para os selos de pontos e para focar a câmera no vencedor. */
export function voteTargetRect(key: VoteTargetKey, lookup: Lookup): Rect | null {
  const { elementId, cardId } = parseVoteKey(key);
  const el = lookup(elementId);
  if (!el) return null;
  if (cardId) return el.type === 'kanban' ? cardWorldRect(el, cardId) : null;
  return getElementBounds(el);
}

/** Rótulo curto do item (ranking). Notas privadas ocultas para o espectador viram "Nota privada". */
export function voteTargetLabel(key: VoteTargetKey, lookup: Lookup, viewer?: { userId: string; simulate: boolean }): { label: string; kind: string; color?: string } {
  const { elementId, cardId } = parseVoteKey(key);
  const el = lookup(elementId);
  const clip = (t: string) => {
    const one = t.replace(/\s+/g, ' ').trim();
    return one.length > 64 ? `${one.slice(0, 63)}…` : one;
  };
  if (!el) return { label: t('widgets.voting.itemRemoved'), kind: '—' };
  if (cardId && el.type === 'kanban') {
    const found = findCard(el, cardId);
    return { label: clip(found?.card.title || t('widgets.voting.untitledCard')), kind: t('widgets.voting.cardIn', { column: found?.column.title ?? el.title }), color: found?.column.color };
  }
  if (el.type === 'sticky') {
    if (viewer && isPrivateDraftHidden(el, viewer.userId, viewer.simulate)) return { label: t('widgets.voting.privateNote'), kind: t('widgets.voting.stickyKind'), color: el.color };
    return { label: clip(el.text) || t('widgets.voting.stickyNoText'), kind: t('widgets.voting.stickyKind'), color: el.color };
  }
  if (el.type === 'shape') return { label: clip(el.text) || t('widgets.voting.shapeNoText'), kind: t('widgets.voting.shapeKind'), color: el.fillColor };
  return { label: t('widgets.voting.item'), kind: el.type };
}

export interface VoteResult {
  key: VoteTargetKey;
  count: number;
  /** 1 = primeiro lugar; empates dividem a posição */
  rank: number;
}

/** Ranking (maior → menor), ignorando itens que não existem mais. Empates dividem a posição. */
export function rankVotes(v: Pick<VotingState, 'votesByElement'>, lookup: Lookup): VoteResult[] {
  const rows = Object.entries(v.votesByElement)
    .filter(([key, count]) => count > 0 && voteTargetExists(key, lookup))
    .sort((a, b) => b[1] - a[1]);
  const out: VoteResult[] = [];
  let lastCount = -1;
  let lastRank = 0;
  rows.forEach(([key, count], i) => {
    const rank = count === lastCount ? lastRank : i + 1;
    out.push({ key, count, rank });
    lastCount = count;
    lastRank = rank;
  });
  return out;
}

/** Pontos de um usuário em um item. */
export function myVotesOn(v: VotingState | undefined, userId: string, key: VoteTargetKey): number {
  return v?.ballots?.[userId]?.[key] ?? 0;
}

/** A contagem de todos pode aparecer agora? (anônima: só depois de revelar) */
export function totalsVisible(v: VotingState | undefined): boolean {
  return !!v && (v.revealed || !v.anonymous);
}

/** Cursores de outras pessoas devem ficar ocultos? (usado pela presença ao vivo do Chat 08) */
export function shouldHideCursors(v: VotingState | undefined): boolean {
  return !!v?.active && !v.revealed && !!v.hideCursors;
}
