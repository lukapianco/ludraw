/**
 * LuDraw server — o que sai do conteúdo de um board para cada pessoa (Chat 07; ARCHITECTURE_MAP §6,
 * contratos de servidor 1 e 3).
 *
 * - Nota privada (Modo Privado) de outra pessoa: o texto, as tags e o nome do autor não saem.
 * - Votação anônima ainda não revelada: só as cédulas da própria pessoa (os totais são só os dela).
 * - Enquete com resultado fechado: só a própria resposta (e o próprio nome).
 * O `writeGuard` repõe do banco tudo o que foi escondido aqui quando a pessoa grava.
 */
import type { BoardData, CanvasElement, StickyNoteElement, VotingState } from '../../../src/types/canvas';
import { isPrivateDraftHidden } from '../../../src/utils/permissions';

export interface RedactViewer {
  userId: string;
  /** pode gerenciar a votação (vê o resultado parcial da enquete) */
  canManageVoting: boolean;
}

export function hiddenDraft(el: CanvasElement, viewerId: string): boolean {
  return el.type === 'sticky' && isPrivateDraftHidden(el as StickyNoteElement, viewerId, false);
}

/** Totais por item a partir das cédulas. */
export function sumBallots(ballots: Record<string, Record<string, number>> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const byItem of Object.values(ballots ?? {})) for (const [k, n] of Object.entries(byItem)) out[k] = (out[k] ?? 0) + n;
  return out;
}

export function ballotsHidden(v: VotingState | undefined): boolean {
  return !!v && v.kind !== 'poll' && v.anonymous && !v.revealed;
}

export function pollHidden(v: VotingState | undefined, _canManage?: boolean): boolean {
  return !!v && v.kind === 'poll' && !v.revealed && !v.poll?.liveResults;
}

function redactVoting(v: VotingState, viewer: RedactViewer): VotingState {
  if (ballotsHidden(v)) {
    const mine = v.ballots?.[viewer.userId];
    const ballots = mine ? { [viewer.userId]: mine } : {};
    return { ...v, ballots, votesByElement: sumBallots(ballots) };
  }
  if (v.poll && (pollHidden(v, viewer.canManageVoting) || (v.anonymous && !v.revealed && !viewer.canManageVoting))) {
    const mine = v.poll.responses[viewer.userId];
    const name = v.poll.voterNames?.[viewer.userId];
    return {
      ...v,
      poll: { ...v.poll, responses: mine ? { [viewer.userId]: mine } : {}, voterNames: name ? { [viewer.userId]: name } : {} },
    };
  }
  return v;
}

export function redactBoard(data: BoardData, viewer: RedactViewer): BoardData {
  let elements = data.elements;
  for (const [id, el] of Object.entries(data.elements)) {
    if (!hiddenDraft(el, viewer.userId)) continue;
    if (elements === data.elements) elements = { ...data.elements };
    const sticky = el as StickyNoteElement;
    elements[id] = { ...sticky, text: '', tags: [], authorName: undefined, createdByName: undefined };
  }
  const voting = data.facilitation?.voting;
  const facilitation = voting && data.facilitation ? { ...data.facilitation, voting: redactVoting(voting, viewer) } : data.facilitation;
  return { ...data, elements, facilitation };
}
