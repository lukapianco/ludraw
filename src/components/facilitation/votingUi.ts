import { create } from 'zustand';
import { useBoardStore } from '../../store/useBoardStore';
import { fitRectInViewport } from '../../utils/math';
import { voteTargetRect } from '../../utils/voting';
import type { VoteTargetKey } from '../../types/canvas';

/** Rascunho da enquete em configuração (painel flutuante — o board continua clicável). */
export interface PollDraft {
  question: string;
  questionSourceId?: string;
  options: { id: string; text: string; sourceId?: string }[];
  multiple: boolean;
  anonymous: boolean;
  liveResults: boolean;
  /** minutos; 0 = sem prazo */
  minutes: number;
}

/** Estado de interface da votação (local, fora do board): painel de resultados, item em foco e rascunho da enquete. */
export const useVotingUi = create<{ resultsHidden: boolean; focusKey: VoteTargetKey | null; pollDraft: PollDraft | null; pollMinimized: boolean }>(() => ({
  resultsHidden: false,
  focusKey: null,
  pollDraft: null,
  pollMinimized: false,
}));

let seq = 0;
export const newPollOptionId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

export function startPollDraft(question = ''): void {
  useVotingUi.setState({
    pollDraft: {
      question,
      options: [
        { id: newPollOptionId(), text: '' },
        { id: newPollOptionId(), text: '' },
      ],
      multiple: false,
      anonymous: true,
      liveResults: false,
      minutes: 0,
    },
  });
}

export function patchPollDraft(patch: Partial<PollDraft>): void {
  useVotingUi.setState((s) => (s.pollDraft ? { pollDraft: { ...s.pollDraft, ...patch } } : s));
}

/** Leva a câmera até o item votado (post-it, forma ou card de Kanban) e destaca-o por 2,4 s. */
export function focusVoteTarget(key: VoteTargetKey): void {
  const s = useBoardStore.getState();
  const rect = voteTargetRect(key, (id) => s.elements[id]);
  if (!rect) return;
  s.animateCameraTo(fitRectInViewport(rect, s.viewport, Math.min(220, s.viewport.width * 0.25), 1.6), 420);
  useVotingUi.setState({ focusKey: key });
  window.setTimeout(() => {
    if (useVotingUi.getState().focusKey === key) useVotingUi.setState({ focusKey: null });
  }, 2400);
}
