import { EyeOff, Link2, ScanEye, Vote, X } from 'lucide-react';
import { BOARD_ROLE_LABEL_KEYS } from '../../utils/permissions';
import { useAppStore } from '../../store/useAppStore';
import { useBoardStore, votesUsedBy } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { formatClock, useNow } from '../../hooks/useFacilitationClock';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';

/**
 * Faixas fixas no topo do canvas (Chat 02 · Rodada B):
 *  - "Visualizando como … — Sair da simulação" (simulador de perfil);
 *  - "Modo Privado ativo — Suas notas estão ocultas para os demais até a revelação".
 */
export function BoardBanners() {
  const t = useT();
  const viewAs = useAppStore((s) => s.session.viewAs);
  const setViewAs = useAppStore((s) => s.setViewAs);
  const privateOn = useBoardStore((s) => s.facilitation.privateMode.enabled);
  const simulate = useBoardStore((s) => s.facilitation.privateMode.previewOwnNotes);
  const reveal = useCan('privateMode.reveal');
  const voting = useBoardStore((s) => (s.facilitation.voting?.active && !s.facilitation.voting.revealed ? s.facilitation.voting : null));
  const used = useBoardStore((s) => votesUsedBy(s.facilitation.voting, s.access.userId));
  const manageVoting = useCan('voting.manage');
  const now = useNow(!!voting?.endsAt, 500);
  // Chat 04: com o cronômetro flutuante aberto (canto superior direito), as faixas centralizam no espaço que sobra
  const timerOpen = useBoardStore((s) => !!s.facilitation.timer?.visible && s.viewport.width >= 1100);
  // Chat 06: visitante que entrou pelo link público (sem simulação)
  const visitorLevel = useBoardStore((s) => (s.access.workspaceRole === 'visitor' && !s.access.viewAs ? s.access.shareAccessLevel ?? null : null));
  if (!viewAs && !privateOn && !voting && !visitorLevel) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[64px] z-40 flex flex-col items-center gap-2 px-3" style={timerOpen ? { paddingRight: 400 } : undefined} data-od-floating>
      {viewAs && (
        <div role="status" className="pointer-events-auto flex max-w-full animate-slide-up items-center gap-2.5 rounded-full bg-brand-900 py-1.5 ps-3.5 pe-1.5 text-[13px] font-semibold text-brand-100 shadow-pop dark:bg-brand-200 dark:text-brand-950">
          <ScanEye size={16} className="shrink-0" />
          <span className="truncate"><Trans k="board.boardBanners.viewingAsLabel" params={{ label: viewAs.labelKey ? t(viewAs.labelKey) : viewAs.label }} components={{ b: (c) => <strong>{c}</strong> }} />
          </span>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-bold transition-colors hover:bg-white/25 dark:bg-black/10 dark:hover:bg-black/20"
            onClick={() => setViewAs(null)}
          >{t('board.boardBanners.leaveSimulation')}{' '}<X size={13} />
          </button>
        </div>
      )}
      {visitorLevel && (
        <div role="status" className="od-panel pointer-events-auto flex max-w-full animate-slide-up items-center gap-2.5 py-1.5 ps-3.5 pe-3.5 text-[12.5px] text-ink-muted">
          <Link2 size={15} className="shrink-0 text-brand-700 dark:text-brand-300" />
          <span className="truncate">
            <Trans k="share.banner.visitor" params={{ level: t(BOARD_ROLE_LABEL_KEYS[visitorLevel]) }} components={{ b: (c) => <strong className="text-ink">{c}</strong> }} />
          </span>
        </div>
      )}
      {privateOn && (
        <div role="status" className="od-panel pointer-events-auto flex max-w-full animate-slide-up items-center gap-2.5 py-1.5 ps-3.5 pe-1.5 text-[12.5px] text-ink-muted">
          <EyeOff size={15} className="shrink-0 text-brand-700 dark:text-brand-300" />
          <span className="truncate">
            <Trans k="board.boardBanners.privateModeYourNotesAre" components={{ b: (c) => <strong className="text-ink">{c}</strong> }} />{simulate ? t('board.boardBanners.simulatingAnotherParticipantsView') : ''}
          </span>
          {reveal.allowed && (
            <button type="button" className="od-btn od-btn-soft od-btn-sm h-7 shrink-0 px-2.5" onClick={() => useBoardStore.getState().revealPrivateNotes()}>{t('board.boardBanners.revealNotes')}</button>
          )}
        </div>
      )}
      {voting && (
        // Chat 04: votação por pontos em andamento
        <div role="status" className="od-panel pointer-events-auto flex max-w-full animate-slide-up items-center gap-2.5 py-1.5 ps-3.5 pe-1.5 text-[12.5px] text-ink-muted">
          <Vote size={15} className="shrink-0 text-brand-700 dark:text-brand-300" />
          <span className="truncate">
            <strong className="text-ink">{voting.title}</strong>
            {voting.kind === 'poll' ? (
              <>{' '}{t('board.boardBanners.pollOpenAnswerPanelLeft')}</>
            ) : (
              <>
                {' '}<Trans k="board.boardBanners.youHaveMaxDotsperuserDots" params={{ max: Math.max(0, voting.dotsPerUser - used), dotsPerUser: voting.dotsPerUser }} components={{ b: (c) => <strong className="tabular-nums text-ink">{c}</strong> }} /></>
            )}
            {voting.endsAt ? ` · ${formatClock(voting.endsAt - now)}` : ''}
            {voting.anonymous ? t('board.boardBanners.anonymous') : ''}
          </span>
          {manageVoting.allowed && (
            <button type="button" className="od-btn od-btn-soft od-btn-sm h-7 shrink-0 px-2.5" onClick={() => useBoardStore.getState().revealVoting()}>{t('board.boardBanners.revealResults')}</button>
          )}
        </div>
      )}
    </div>
  );
}
