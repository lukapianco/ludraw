/**
 * LuDraw — Enquete (ajuste pós-Chat 04): funções puras de apoio.
 *
 * `pickBoardText` lê o texto do ponto clicado no board para preencher a pergunta ou uma resposta
 * da enquete em configuração: card de Kanban, célula de tabela e nó de mapa mental pelo atributo
 * do DOM; os demais pelo texto do elemento. Notas privadas ocultas para quem clica não são copiadas.
 */

import type { CanvasElement, PollData, VotingState } from '../types/canvas';
import { getElementText } from './factory';
import { findCard } from './kanban';
import { isPrivateDraftHidden } from './permissions';
import { t } from '../i18n';

export const POLL_MAX_TEXT = 280;

export interface PickedText {
  text: string;
  /** Elemento de origem (para "ver no quadro") */
  sourceId: string;
}

const clean = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, POLL_MAX_TEXT);

export function pickBoardText(target: HTMLElement, el: CanvasElement, viewer: { userId: string; simulate: boolean }): PickedText | null {
  if (el.type === 'sticky' && isPrivateDraftHidden(el, viewer.userId, viewer.simulate)) return null;
  if (el.type === 'kanban') {
    const cardId = (target.closest('[data-kanban-card]') as HTMLElement | null)?.dataset.kanbanCard;
    const card = cardId ? findCard(el, cardId)?.card : null;
    if (card?.title) return { text: clean(card.title), sourceId: el.id };
    const colId = (target.closest('[data-kanban-col-title]') as HTMLElement | null)?.dataset.kanbanColTitle;
    const col = colId ? el.columns.find((c) => c.id === colId) : null;
    if (col?.title) return { text: clean(col.title), sourceId: el.id };
    return el.title ? { text: clean(el.title), sourceId: el.id } : null;
  }
  if (el.type === 'table') {
    const key = (target.closest('[data-table-cell]') as HTMLElement | null)?.dataset.tableCell;
    const t = key ? el.cells[key]?.text : '';
    return t?.trim() ? { text: clean(t), sourceId: el.id } : null;
  }
  if (el.type === 'mindmap') {
    const nodeId = (target.closest('[data-mm-node]') as HTMLElement | null)?.dataset.mmNode;
    const node = nodeId ? el.nodes.find((n) => n.id === nodeId) : null;
    return node?.text?.trim() ? { text: clean(node.text), sourceId: el.id } : null;
  }
  if (el.type === 'image' || el.type === 'freehand' || el.type === 'comment') return null;
  const text = clean(getElementText(el));
  return text ? { text, sourceId: el.id } : null;
}

/** Totais, pessoas que responderam e quem escolheu cada resposta. */
export function pollStats(v: VotingState): { totals: Record<string, number>; respondents: number; votersByOption: Record<string, string[]>; max: number } {
  const poll = v.poll as PollData;
  const totals: Record<string, number> = {};
  const votersByOption: Record<string, string[]> = {};
  for (const uid in poll.responses) {
    for (const id of poll.responses[uid]) {
      totals[id] = (totals[id] ?? 0) + 1;
      (votersByOption[id] ??= []).push(poll.voterNames?.[uid] ?? t('widgets.poll.participant'));
    }
  }
  const max = Math.max(0, ...Object.values(totals));
  return { totals, respondents: Object.keys(poll.responses).length, votersByOption, max };
}

/**
 * O resultado (contagem) está visível para quem olha agora? Só depois de revelar ou com "Mostrar resultado parcial"
 * ligado — vale para TODOS, inclusive quem gerencia (Chat 08: "Desligado: só no final" é o que o interruptor diz).
 */
export function pollResultsVisible(v: VotingState, _canManage?: boolean): boolean {
  return v.revealed || !!v.poll?.liveResults;
}
