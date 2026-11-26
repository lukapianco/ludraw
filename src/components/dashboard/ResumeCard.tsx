import { ArrowRight, History, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { BoardMeta } from '../../types/workspace';
import { BoardPreview, timeAgo } from './BoardCard';
import { useT } from '../../i18n/useT';
import { personLabel } from '../../utils/storedNames';

/**
 * "Retomar de onde parei": cartão grande com a prévia do último board aberto
 * (miniatura gerada pelo autosave) e o botão Continuar.
 */
export function ResumeCard({ board, onCreate }: { board: BoardMeta | undefined; onCreate: () => void }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const openModal = useAppStore((s) => s.openModal);

  return (
    <section aria-labelledby="od-resume-title" className="flex flex-col rounded-3xl bg-panel p-3 ring-1 ring-line sm:flex-row sm:items-stretch sm:gap-5 sm:p-3.5">
      {board ? (
        <>
          <button
            type="button"
            onClick={() => navigate({ name: 'board', id: board.id })}
            className="group relative flex w-full shrink-0 overflow-hidden rounded-2xl ring-1 ring-line sm:w-[58%]"
            aria-label={t('dashboard.resumeCard.continueName', { name: board.name })}
          >
            <BoardPreview board={board} fit="contain" className="aspect-[16/10] w-full transition-transform duration-slow ease-out group-hover:scale-[1.015] sm:aspect-auto sm:min-h-[220px]" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col px-1.5 pb-1.5 pt-4 sm:py-2">
            <div id="od-resume-title" className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
              <History size={13} />{' '}{t('dashboard.resumeCard.pickUpWhereILeft')}</div>
            <h2 className="mt-2 line-clamp-2 text-xl font-bold text-ink">{board.name}</h2>
            <dl className="mt-2 space-y-0.5 text-sm text-ink-muted">
              <div>
                <dt className="sr-only">{t('dashboard.resumeCard.opened')}</dt>
                <dd>{t('dashboard.resumeCard.openedTimeago', { timeAgo: timeAgo(board.lastOpenedAt) })}</dd>
              </div>
              <div>
                <dt className="sr-only">{t('dashboard.resumeCard.edited')}</dt>
                <dd>{t('dashboard.resumeCard.editedTimeagoOwnername', { timeAgo: timeAgo(board.updatedAt), ownerName: personLabel(board.ownerName) })}
                </dd>
              </div>
            </dl>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
              <button type="button" className="od-btn od-btn-primary" onClick={() => navigate({ name: 'board', id: board.id })}>
                {t('dashboard.resumeCard.continue')} <ArrowRight size={16} />
              </button>
              <button type="button" className="od-btn od-btn-ghost od-btn-sm text-ink-muted" onClick={() => openModal({ type: 'details', boardId: board.id })}>{t('common.details')}</button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex w-full flex-col items-start justify-center gap-3 rounded-2xl bg-panel-sunken p-6">
          <div className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('dashboard.resumeCard.pickUpWhereILeft')}</div>
          <p className="text-sm text-ink-muted">{t('dashboard.resumeCard.noBoardOpenedYetLast')}</p>
          <button type="button" className="od-btn od-btn-primary" onClick={onCreate}>
            <Plus size={16} />{' '}{t('dashboard.resumeCard.createBoard')}</button>
        </div>
      )}
    </section>
  );
}
