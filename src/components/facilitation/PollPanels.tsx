import { useState, type CSSProperties } from 'react';
import { Check, ChevronDown, ChevronUp, Crosshair, EyeOff, Link2, ListChecks, MousePointerClick, Plus, Trophy, Users, X } from 'lucide-react';
import type { CanvasElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { formatClock, useNow } from '../../hooks/useFacilitationClock';
import { pickBoardText, pollResultsVisible, pollStats } from '../../utils/poll';
import { cn } from '../../utils/cn';
import { focusVoteTarget, newPollOptionId, patchPollDraft, useVotingUi, type PollDraft } from './votingUi';
import { MEDAL_COLORS } from '../../utils/voting';
import { useT } from '../../i18n/useT';
import { formatCount, formatList } from '../../i18n/format';
import { useStudioBarClearance } from '../studio/useStudioBarClearance';

const DURATIONS = [0, 1, 2, 3, 5, 10];

/* ------------------------------------------------------------------------ */
/*  Captura de texto do board                                               */
/* ------------------------------------------------------------------------ */

/**
 * Chamado pelo `CanvasStage` no pointerdown quando um campo da enquete está focado: copia o texto
 * do ponto clicado para o campo. Numa resposta, o foco pula para a próxima resposta vazia (ou uma
 * nova), para montar a lista clicando em vários post-its seguidos. Devolve true se usou o clique.
 */
export function pickIntoPollField(field: string, target: HTMLElement, el: CanvasElement): boolean {
  const draft = useVotingUi.getState().pollDraft;
  if (!draft) return false;
  const s = useBoardStore.getState();
  const picked = pickBoardText(target, el, { userId: s.access.userId, simulate: s.facilitation.privateMode.previewOwnNotes });
  if (!picked) return false;
  if (field === 'question') {
    patchPollDraft({ question: picked.text, questionSourceId: picked.sourceId });
    focusField('question', true);
    return true;
  }
  const idx = draft.options.findIndex((o) => o.id === field);
  if (idx < 0) return false;
  const options = draft.options.map((o, i) => (i === idx ? { ...o, text: picked.text, sourceId: picked.sourceId } : o));
  let next = options.findIndex((o, i) => i > idx && !o.text.trim());
  if (next < 0 && options.length < 12) {
    options.push({ id: newPollOptionId(), text: '' });
    next = options.length - 1;
  }
  patchPollDraft({ options });
  if (next >= 0) focusField(options[next].id);
  return true;
}

function focusField(field: string, selectAll = false) {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-poll-field="${field}"]`);
    if (!input) return;
    input.focus({ preventScroll: true });
    if (selectAll) input.select();
  });
}

/* ------------------------------------------------------------------------ */
/*  Configuração (painel flutuante)                                         */
/* ------------------------------------------------------------------------ */

/**
 * Configurar uma enquete: pergunta, respostas (digitadas ou copiadas do board), múltipla escolha,
 * anonimato (não mostrar quem votou), resultado parcial e prazo. Fica num painel flutuante — e não
 * num modal — para o board continuar clicável enquanto um campo está focado.
 */
export function PollSetupPanel() {
  const t = useT();
  const clear = useStudioBarClearance(12);
  const draft = useVotingUi((s) => s.pollDraft);
  const manage = useCan('voting.manage');
  const presenting = useBoardStore((s) => s.presenting);
  const [focused, setFocused] = useState<string | null>(null);
  if (!draft || presenting) return null;

  const filled = draft.options.filter((o) => o.text.trim());
  const ready = draft.question.trim().length > 0 && filled.length >= 2;
  const close = () => useVotingUi.setState({ pollDraft: null });
  const start = () => {
    if (!ready) return;
    useBoardStore.getState().startVoting({
      kind: 'poll',
      title: draft.question,
      dotsPerUser: 1,
      anonymous: draft.anonymous,
      allowMultiplePerItem: false,
      durationMs: draft.minutes ? draft.minutes * 60_000 : null,
      pollOptions: filled.map((o) => ({ text: o.text, sourceId: o.sourceId })),
      pollMultiple: draft.multiple,
      pollLiveResults: draft.liveResults,
    });
    if (useBoardStore.getState().facilitation.voting?.kind === 'poll') useVotingUi.setState({ pollDraft: null, resultsHidden: false, pollMinimized: false });
  };
  const setOption = (id: string, patch: Partial<PollDraft['options'][number]>) => patchPollDraft({ options: draft.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const removeOption = (id: string) => patchPollDraft({ options: draft.options.filter((o) => o.id !== id) });
  const addOption = () => {
    const id = newPollOptionId();
    patchPollDraft({ options: [...draft.options, { id, text: '' }] });
    focusField(id);
  };
  const fieldProps = (field: string) => ({
    'data-poll-field': field,
    onFocus: () => setFocused(field),
    onBlur: () => setFocused((f) => (f === field ? null : f)),
  });
  const label = 'mb-1 block text-xs font-semibold text-ink-muted';

  return (
    <div ref={clear.ref} style={{ top: clear.top, maxHeight: `calc(100% - ${clear.top + 98}px)` }} data-od-floating className="od-pop absolute left-3 z-[44] flex w-[360px] max-w-[calc(100%-24px)] animate-slide-up flex-col overflow-hidden" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('widgets.pollPanels.newPoll')}>
      <div className="flex items-start gap-2 border-b border-line px-3.5 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-brand-900 dark:text-brand-200">
          <ListChecks size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">{t('widgets.pollPanels.newPoll')}</div>
          <div className="text-xs text-ink-subtle">{t('widgets.pollPanels.aQuestionAnswersEveryonePick')}</div>
        </div>
        <button type="button" className="od-tool h-8 w-8" onClick={close} aria-label={t('widgets.pollPanels.closeWithoutStarting')}>
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3">
        <div className={cn('flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11.5px] leading-snug ring-1 transition-colors', focused ? 'bg-accent-soft text-brand-900 ring-brand-300 dark:text-brand-200' : 'bg-panel-sunken text-ink-muted ring-line')}>
          <MousePointerClick size={15} className="mt-px shrink-0" />
          <span>
            {focused ? <strong>{t('widgets.pollPanels.clickStickyNoteShapeCard')}</strong> : <strong>{t('widgets.pollPanels.tip')}</strong>} {focused ? t('widgets.pollPanels.toCopyItsTextInto') : t('widgets.pollPanels.withFieldSelectedClickAny')}
          </span>
        </div>

        <div>
          <label className={label} htmlFor="poll-question">{t('widgets.pollPanels.question')}</label>
          <div className="relative">
            <input
              id="poll-question"
              className="od-input pr-8"
              placeholder={t('widgets.pollPanels.eGWhichIdeaDo')}
              value={draft.question}
              autoFocus
              maxLength={200}
              onChange={(e) => patchPollDraft({ question: e.target.value, questionSourceId: undefined })}
              onKeyDown={(e) => e.key === 'Enter' && focusField(draft.options[0]?.id ?? '')}
              {...fieldProps('question')}
            />
            {draft.questionSourceId && <SourceChip id={draft.questionSourceId} />}
          </div>
        </div>

        <div>
          <span className={label}>{t('widgets.pollPanels.answers')}</span>
          <ol className="space-y-1.5">
            {draft.options.map((o, i) => (
              <li key={o.id} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-center text-[12px] font-bold tabular-nums text-ink-subtle">{i + 1}</span>
                <div className="relative min-w-0 flex-1">
                  <input
                    className="od-input h-9 pr-8"
                    placeholder={i < 2 ? t('widgets.pollPanels.answerValue', { value: i + 1 }) : t('widgets.pollPanels.anotherAnswer')}
                    value={o.text}
                    maxLength={280}
                    aria-label={t('widgets.pollPanels.answerValue', { value: i + 1 })}
                    onChange={(e) => setOption(o.id, { text: e.target.value, sourceId: undefined })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const next = draft.options[i + 1];
                        if (next) focusField(next.id);
                        else if (draft.options.length < 12) addOption();
                      } else if (e.key === 'Backspace' && !o.text && draft.options.length > 2) {
                        e.preventDefault();
                        removeOption(o.id);
                        const prev = draft.options[i - 1];
                        if (prev) focusField(prev.id);
                      }
                    }}
                    {...fieldProps(o.id)}
                  />
                  {o.sourceId && <SourceChip id={o.sourceId} />}
                </div>
                <button type="button" className="od-tool h-8 w-7 shrink-0" disabled={draft.options.length <= 2} onClick={() => removeOption(o.id)} aria-label={t('widgets.pollPanels.removeAnswerValue', { value: i + 1 })} title={t('widgets.pollPanels.remove')}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
          {draft.options.length < 12 && (
            <button type="button" className="od-btn od-btn-ghost od-btn-sm mt-1.5 text-brand-700 dark:text-brand-300" onClick={addOption}>
              <Plus size={14} />{' '}{t('widgets.pollPanels.addAnswer')}</button>
          )}
        </div>

        <div className="space-y-1">
          <Switch on={draft.multiple} onChange={(v) => patchPollDraft({ multiple: v })} title={t('widgets.pollPanels.multipleChoice')} desc={t('widgets.pollPanels.eachPersonCanPickMore')} />
          <Switch on={draft.anonymous} onChange={(v) => patchPollDraft({ anonymous: v })} title={t('widgets.pollPanels.anonymous')} desc={t('widgets.pollPanels.nobodySeesWhoVotedWhat')} />
          <Switch on={draft.liveResults} onChange={(v) => patchPollDraft({ liveResults: v })} title={t('widgets.pollPanels.showPartialResults')} desc={t('widgets.pollPanels.everyoneFollowsTallyWhileVoting')} />
        </div>

        <div>
          <span className={label}>{t('widgets.pollPanels.timeLimit')}</span>
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={draft.minutes === m}
                className={cn('rounded-md px-2 py-1 text-[12.5px] font-semibold ring-1 transition-colors', draft.minutes === m ? 'bg-accent text-accent-contrast ring-transparent' : 'bg-panel text-ink ring-line hover:bg-panel-hover')}
                onClick={() => patchPollDraft({ minutes: m })}
              >
                {m === 0 ? t('widgets.pollPanels.noTimeLimit') : `${m} min`}
              </button>
            ))}
          </div>
        </div>
        {!manage.allowed && <p className="text-xs text-warning">{manage.reason}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-line p-2.5">
        <span className="flex-1 text-[11.5px] text-ink-subtle">{ready ? `${filled.length} respostas` : !draft.question.trim() ? t('widgets.pollPanels.writeQuestion') : t('widgets.pollPanels.fillLeast2Answers')}</span>
        <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={close}>{t('widgets.pollPanels.cancel')}</button>
        <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={!ready || !manage.allowed} title={manage.reason} onClick={start}>{t('widgets.pollPanels.startPoll')}</button>
      </div>
    </div>
  );
}

function SourceChip({ id }: { id: string }) {
  const t = useT();
  return (
    <button
      type="button"
      className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-brand-700 hover:bg-panel-hover dark:text-brand-300"
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => focusVoteTarget(id)}
      title={t('widgets.pollPanels.copiedBoardClickSeeWhere')}
      aria-label={t('widgets.pollPanels.seeWhereBoardTextCame')}
    >
      <Link2 size={13} />
    </button>
  );
}

function Switch({ on, onChange, title, desc }: { on: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-panel-hover" onClick={() => onChange(!on)}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{title}</span>
        <span className="block text-[11.5px] leading-snug text-ink-subtle">{desc}</span>
      </span>
      <span className={cn('mt-0.5 h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors', on ? 'bg-selection' : 'bg-panel-sunken ring-1 ring-line-strong')}>
        <span className={cn('block h-3 w-3 rounded-full bg-white transition-transform', on && 'translate-x-3')} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/*  Enquete em andamento / resultado                                        */
/* ------------------------------------------------------------------------ */

/**
 * Cartão da enquete para todos: escolher e enviar (dá para mudar até o fim), acompanhar o
 * resultado (parcial, se liberado; o facilitador sempre vê a contagem) e, ao revelar, as barras
 * com a mais votada destacada e — se não for anônima — quem votou em cada resposta.
 */
export function PollCard() {
  const t = useT();
  const clear = useStudioBarClearance(12);
  const voting = useBoardStore((s) => (s.facilitation.voting?.kind === 'poll' ? s.facilitation.voting : null));
  const userId = useBoardStore((s) => s.access.userId);
  const presenting = useBoardStore((s) => s.presenting);
  const hidden = useVotingUi((s) => s.resultsHidden);
  const minimized = useVotingUi((s) => s.pollMinimized);
  const manage = useCan('voting.manage');
  const cast = useCan('voting.cast');
  const mine = voting?.poll?.responses[userId] ?? [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const now = useNow(!!voting?.active && !voting.revealed && !!voting.endsAt, 500);
  if (!voting?.poll || presenting || (voting.revealed && hidden)) return null;

  const poll = voting.poll;
  const choice = picked ?? mine;
  const stats = pollStats(voting);
  const showResults = pollResultsVisible(voting, manage.allowed);
  const showNames = !voting.anonymous && showResults;
  const answered = mine.length > 0;
  const changed = picked !== null && (picked.length !== mine.length || picked.some((id) => !mine.includes(id)));
  const open = voting.active && !voting.revealed;
  const toggle = (id: string) => {
    if (!open || !cast.allowed) return;
    setPicked(poll.multiple ? (choice.includes(id) ? choice.filter((x) => x !== id) : [...choice, id]) : [id]);
  };
  const submit = () => {
    if (useBoardStore.getState().answerPoll(choice)) setPicked(null);
  };

  if (minimized) {
    return (
      <button
        type="button"
        ref={clear.ref}
        style={{ top: clear.top }}
        data-od-floating
        className="od-panel absolute left-3 z-[44] flex animate-slide-up items-center gap-2 py-1.5 pl-2.5 pr-2 text-[12.5px] font-semibold text-ink"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => useVotingUi.setState({ pollMinimized: false })}
      >
        <ListChecks size={15} className="text-brand-700 dark:text-brand-300" />
        <span className="max-w-[200px] truncate">{voting.title}</span>
        {open && !answered && <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-bold text-accent-contrast">{t('widgets.pollPanels.answer')}</span>}
        <ChevronDown size={14} className="text-ink-subtle" />
      </button>
    );
  }

  return (
    <div ref={clear.ref} style={{ top: clear.top, maxHeight: `calc(100% - ${clear.top + 98}px)` }} data-od-floating className="od-pop absolute left-3 z-[44] flex w-[360px] max-w-[calc(100%-24px)] animate-slide-up flex-col overflow-hidden" onPointerDown={(e) => e.stopPropagation()} role="region" aria-label={t('widgets.pollPanels.pollTitle', { title: voting.title })}>
      <div className="flex items-start gap-2 border-b border-line px-3.5 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-brand-900 dark:text-brand-200">{voting.revealed ? <Trophy size={17} /> : <ListChecks size={17} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-snug text-ink">{voting.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
            <span>{voting.revealed ? t('widgets.pollPanels.closed') : poll.multiple ? t('widgets.pollPanels.pickOneMore') : t('widgets.pollPanels.pickOneAnswer')}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {formatCount('response', stats.respondents)}
            </span>
            {voting.anonymous && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <EyeOff size={12} />{' '}{t('widgets.pollPanels.anonymous2')}</span>
              </>
            )}
            {open && voting.endsAt && (
              <>
                <span>·</span>
                <span className="font-semibold tabular-nums text-ink-muted">{formatClock(voting.endsAt - now)}</span>
              </>
            )}
          </div>
        </div>
        <button type="button" className="od-tool h-8 w-8" onClick={() => useVotingUi.setState(voting.revealed ? { resultsHidden: true } : { pollMinimized: true })} aria-label={voting.revealed ? t('widgets.pollPanels.closeResults') : t('widgets.pollPanels.minimizePoll')} title={voting.revealed ? t('widgets.pollPanels.close') : t('widgets.pollPanels.minimize')}>
          {voting.revealed ? <X size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {poll.options.map((o) => {
          const count = stats.totals[o.id] ?? 0;
          const pct = stats.respondents ? Math.round((count / stats.respondents) * 100) : 0;
          const selected = choice.includes(o.id);
          const winner = voting.revealed && count > 0 && count === stats.max;
          const names = stats.votersByOption[o.id] ?? [];
          return (
            <li key={o.id}>
              <button
                type="button"
                role={poll.multiple ? 'checkbox' : 'radio'}
                aria-checked={selected}
                disabled={!open || !cast.allowed}
                onClick={() => toggle(o.id)}
                className={cn(
                  'relative w-full overflow-hidden rounded-xl px-3 py-2.5 text-left ring-1 transition-colors disabled:cursor-default',
                  selected ? 'bg-accent-soft ring-2 ring-selection' : winner ? 'ring-2 ring-[var(--od-medal-ring)]' : 'bg-panel ring-line',
                  open && cast.allowed && !selected && 'hover:bg-panel-hover',
                )}
                style={{ '--od-medal-ring': MEDAL_COLORS[0] } as CSSProperties}
              >
                {showResults && <span className="absolute inset-y-0 left-0 transition-[width] duration-slow ease-out" style={{ width: `${stats.respondents ? (count / stats.respondents) * 100 : 0}%`, background: 'var(--od-selection-fill)' }} aria-hidden="true" />}
                <span className="relative flex items-start gap-2.5">
                  <span className={cn('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center ring-[1.5px]', poll.multiple ? 'rounded-[5px]' : 'rounded-full', selected ? 'bg-selection text-white ring-selection' : 'ring-line-strong')}>
                    {selected && (poll.multiple ? <Check size={12} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-white" />)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold leading-snug text-ink">
                      {winner && <Trophy size={13} className="mr-1 inline -translate-y-px" style={{ color: MEDAL_COLORS[2] }} />}
                      {o.text}
                    </span>
                    {showNames && names.length > 0 && <span className="mt-0.5 block truncate text-[11.5px] text-ink-subtle">{formatList(names, 'unit')}</span>}
                  </span>
                  {showResults && (
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-extrabold tabular-nums text-ink">{pct}%</span>
                      <span className="block text-2xs tabular-nums text-ink-subtle">{formatCount('vote', count)}</span>
                    </span>
                  )}
                </span>
              </button>
              {o.sourceId && (
                <button type="button" className="ml-9 mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-subtle hover:text-ink hover:underline" onClick={() => focusVoteTarget(o.sourceId!)}>
                  <Crosshair size={11} />{' '}{t('widgets.pollPanels.seeBoard')}</button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-1.5 border-t border-line p-2.5">
        {open && cast.allowed && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11.5px] text-ink-subtle">
              {answered && !changed ? (
                <span className="inline-flex items-center gap-1 font-semibold text-success">
                  <Check size={13} />{' '}{t('widgets.pollPanels.answerSentYouCanChange')}</span>
              ) : showResults ? (
                ''
              ) : (
                t('widgets.pollPanels.resultsShowUpWhenPoll')
              )}
            </span>
            {answered && !changed && (
              <button type="button" className="od-btn od-btn-ghost od-btn-sm text-ink-muted" onClick={() => useBoardStore.getState().answerPoll([]) && setPicked(null)}>{t('widgets.pollPanels.withdraw')}</button>
            )}
            {(!answered || changed) && (
              <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={choice.length === 0} onClick={submit}>
                {answered ? t('widgets.pollPanels.updateAnswer') : t('widgets.pollPanels.sendAnswer')}
              </button>
            )}
          </div>
        )}
        {open && !cast.allowed && <p className="text-[11.5px] text-ink-subtle">{cast.reason ?? t('widgets.pollPanels.yourAccessDoesntAllowVoting')}</p>}
        {manage.allowed && open && (
          <div className="flex gap-1.5">
            <button
              type="button"
              className="od-btn od-btn-secondary od-btn-sm flex-1"
              onClick={() => {
                useBoardStore.getState().revealVoting();
                useVotingUi.setState({ resultsHidden: false, pollMinimized: false });
              }}
            >
              <Trophy size={14} />{' '}{t('widgets.pollPanels.endReveal')}</button>
            <button type="button" className="od-btn od-btn-ghost od-btn-sm text-ink-muted" onClick={() => useBoardStore.getState().cancelVoting()}>{t('widgets.pollPanels.cancel')}</button>
          </div>
        )}
        {manage.allowed && voting.revealed && (
          <button type="button" className="od-btn od-btn-secondary od-btn-sm w-full" onClick={() => useBoardStore.getState().closeVoting()}>{t('widgets.pollPanels.endPollSession')}</button>
        )}
      </div>
    </div>
  );
}
