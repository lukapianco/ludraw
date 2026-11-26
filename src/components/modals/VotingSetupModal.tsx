import { useState } from 'react';
import { CircleDot, EyeOff, ListChecks, Minus, Plus, Vote } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { startPollDraft, useVotingUi } from '../facilitation/votingUi';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';

const DURATIONS: { id: string; label: string; ms: number | null }[] = [
  { id: 'none', get label() { return t('modals.votingSetupModal.noTimeLimit'); }, ms: null },
  { id: '1', get label() { return t('modals.votingSetupModal.n1Min'); }, ms: 60_000 },
  { id: '3', get label() { return t('modals.votingSetupModal.n3Min'); }, ms: 180_000 },
  { id: '5', get label() { return t('modals.votingSetupModal.n5Min'); }, ms: 300_000 },
  { id: '10', get label() { return t('modals.votingSetupModal.n10Min'); }, ms: 600_000 },
];

/**
 * Configurar uma votação (Chat 04 + enquete). Dois tipos: "Pontos no board" (título, pontos por
 * pessoa, prazo, vários pontos no mesmo item, anônima) e "Enquete" — que fecha este modal e abre o
 * painel flutuante da enquete (o board precisa ficar clicável para copiar textos para as respostas).
 * Iniciar exige `voting.manage` (facilitador) — o store reaplica `ensure`.
 */
export function VotingSetupModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const manage = useCan('voting.manage');
  const [title, setTitle] = useState(t('modals.votingSetupModal.whichIdeasShouldWePrioritize'));
  const [dots, setDots] = useState(5);
  const [duration, setDuration] = useState<string>('none');
  const [custom, setCustom] = useState('');
  const [multiple, setMultiple] = useState(true);
  const [anonymous, setAnonymous] = useState(true);

  const start = () => {
    const preset = DURATIONS.find((d) => d.id === duration);
    const ms = duration === 'custom' ? Math.max(0, Number(custom) || 0) * 60_000 : preset?.ms ?? null;
    useBoardStore.getState().startVoting({ title, dotsPerUser: dots, anonymous, allowMultiplePerItem: multiple, durationMs: ms || null });
    if (useBoardStore.getState().facilitation.voting?.active) {
      useVotingUi.setState({ resultsHidden: false, focusKey: null });
      onClose();
    }
  };

  const label = 'mb-1.5 block text-xs font-semibold text-ink-muted';
  return (
    <Modal
      open
      onClose={onClose}
      width={500}
      icon={<Vote size={20} />}
      title={t('modals.votingSetupModal.newVote')}
      description={t('modals.votingSetupModal.pickTypeDotVotingEach')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!manage.allowed} title={manage.reason} onClick={start}>{t('modals.votingSetupModal.startVoting')}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('modals.votingSetupModal.votingType')}>
          <button type="button" role="radio" aria-checked className="flex items-start gap-2.5 rounded-xl bg-accent-soft p-3 text-start ring-2 ring-selection">
            <CircleDot size={18} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
            <span>
              <span className="block text-[13px] font-bold text-ink">{t('modals.votingSetupModal.dotsBoard')}</span>
              <span className="block text-[11.5px] leading-snug text-ink-muted">{t('modals.votingSetupModal.eachPersonSpreadsDotsClicking')}</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={false}
            className="flex items-start gap-2.5 rounded-xl bg-panel p-3 text-start ring-1 ring-line transition-colors hover:bg-panel-hover"
            onClick={() => {
              onClose();
              startPollDraft(title === t('modals.votingSetupModal.whichIdeasShouldWePrioritize') ? '' : title);
            }}
          >
            <ListChecks size={18} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>
              <span className="block text-[13px] font-bold text-ink">{t('modals.votingSetupModal.poll')}</span>
              <span className="block text-[11.5px] leading-snug text-ink-muted">{t('modals.votingSetupModal.questionAnswersSingleMultipleChoice')}</span>
            </span>
          </button>
        </div>
        <div>
          <label className={label} htmlFor="vt-title">{t('modals.votingSetupModal.question')}</label>
          <input id="vt-title" className="od-input" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={label}>{t('modals.votingSetupModal.dotsPerPerson')}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" className="od-tool h-9 w-9 ring-1 ring-line" onClick={() => setDots((d) => Math.max(1, d - 1))} aria-label={t('modals.votingSetupModal.fewerDots')}>
                <Minus size={15} />
              </button>
              <input className="od-input h-9 w-16 text-center text-[15px] font-bold tabular-nums" inputMode="numeric" value={dots} onChange={(e) => setDots(Math.max(1, Math.min(99, Number(e.target.value.replace(/\D/g, '')) || 1)))} aria-label={t('modals.votingSetupModal.dotsPerPerson')} />
              <button type="button" className="od-tool h-9 w-9 ring-1 ring-line" onClick={() => setDots((d) => Math.min(99, d + 1))} aria-label={t('modals.votingSetupModal.moreDots')}>
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div>
            <span className={label}>{t('modals.votingSetupModal.timeLimitOptional')}</span>
            <div className="flex flex-wrap gap-1">
              {DURATIONS.map((d) => (
                <button key={d.id} type="button" aria-pressed={duration === d.id} className={cn('rounded-md px-2 py-1 text-[12.5px] font-semibold ring-1 transition-colors', duration === d.id ? 'bg-accent text-accent-contrast ring-transparent' : 'bg-panel text-ink ring-line hover:bg-panel-hover')} onClick={() => setDuration(d.id)}>
                  {d.label}
                </button>
              ))}
              <span className="flex items-center gap-1">
                <input
                  className={cn('od-input h-7 w-14 px-2 text-center text-[12.5px]', duration === 'custom' && 'ring-2 ring-selection')}
                  inputMode="numeric"
                  placeholder={t('modals.votingSetupModal.minutesPlaceholder')}
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value.replace(/\D/g, '').slice(0, 3));
                    setDuration('custom');
                  }}
                  aria-label={t('modals.votingSetupModal.customTimeLimitMinutes')}
                />
              </span>
            </div>
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-panel-sunken p-3 ring-1 ring-line">
          <input type="checkbox" className="mt-0.5 accent-[var(--od-selection)]" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <EyeOff size={14} />{' '}{t('modals.votingSetupModal.anonymousVoting')}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{t('modals.votingSetupModal.hidesCursorsTallyUntilEnd')}</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 px-1 text-[13px] text-ink">
          <input type="checkbox" className="accent-[var(--od-selection)]" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />{t('modals.votingSetupModal.allowSeveralDotsSameItem')}</label>
        {!manage.allowed && <p className="text-xs text-warning">{manage.reason}</p>}
      </div>
    </Modal>
  );
}
