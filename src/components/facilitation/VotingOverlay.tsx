import { useMemo } from 'react';
import { Crosshair, Medal, Trophy, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { worldRectToScreen } from '../../utils/math';
import { MEDAL_COLORS as MEDALS, myVotesOn, rankVotes, totalsVisible, voteTargetLabel, voteTargetRect } from '../../utils/voting';
import { cn } from '../../utils/cn';
import { focusVoteTarget, useVotingUi } from './votingUi';
import { useT } from '../../i18n/useT';
import { formatCount } from '../../i18n/format';
import { useStudioBarClearance } from '../studio/useStudioBarClearance';


/**
 * Selos de pontos sobre os itens votados (Chat 04) — camada em coordenadas de tela, acima do canvas.
 * Durante a votação anônima cada pessoa vê só os próprios pontos (●); sem anonimato (ou depois de
 * revelar) aparece o total. Depois de revelar, o 1º, 2º e 3º lugares ganham medalha.
 */
export function VotingOverlay() {
  const voting = useBoardStore((s) => s.facilitation.voting);
  const elements = useBoardStore((s) => s.elements);
  const camera = useBoardStore((s) => s.camera);
  const userId = useBoardStore((s) => s.access.userId);
  const presenting = useBoardStore((s) => s.presenting);
  const focusKey = useVotingUi((s) => s.focusKey);

  const items = useMemo(() => {
    if (!voting || voting.kind === 'poll') return [];
    const lookup = (id: string) => elements[id];
    const showTotals = totalsVisible(voting);
    const keys = new Set<string>(Object.keys(voting.ballots?.[userId] ?? {}));
    if (showTotals) Object.keys(voting.votesByElement).forEach((k) => keys.add(k));
    const ranks = voting.revealed ? new Map(rankVotes(voting, lookup).map((r) => [r.key, r.rank])) : new Map<string, number>();
    return Array.from(keys)
      .map((key) => {
        const rect = voteTargetRect(key, lookup);
        if (!rect) return null;
        return { key, rect, mine: myVotesOn(voting, userId, key), total: voting.votesByElement[key] ?? 0, rank: ranks.get(key) ?? 0, showTotals };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && (x.mine > 0 || (x.showTotals && x.total > 0)));
  }, [voting, elements, userId]);

  if (!voting || presenting) return null;
  const focusRect = focusKey ? voteTargetRect(focusKey, (id) => elements[id]) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden" aria-hidden="true">
      {focusRect &&
        (() => {
          const r = worldRectToScreen(focusRect, camera);
          return <div className="absolute animate-pulse rounded-lg" style={{ left: r.x - 6, top: r.y - 6, width: r.width + 12, height: r.height + 12, boxShadow: '0 0 0 3px var(--od-selection), 0 0 0 9px var(--od-selection-fill)' }} />;
        })()}
      {items.map((it) => {
        const r = worldRectToScreen(it.rect, camera);
        const medal = it.rank >= 1 && it.rank <= 3 ? MEDALS[it.rank - 1] : null;
        return (
          // selo no canto superior direito, por dentro do item (não cobre o título da coluna do Kanban)
          <div key={it.key} className="absolute flex -translate-x-full items-center gap-1" style={{ left: r.x + r.width - 6, top: r.y + 6 }}>
            {medal && (
              <span className="flex h-6 w-6 animate-pop-in items-center justify-center rounded-full text-white shadow-pop" style={{ background: medal }}>
                {it.rank === 1 ? <Trophy size={13} /> : <Medal size={13} />}
              </span>
            )}
            <span className={cn('flex h-6 animate-pop-in items-center gap-1 rounded-full px-1.5 shadow-pop ring-1', it.showTotals ? 'bg-panel ring-line' : 'bg-panel ring-selection')}>
              {it.mine > 0 && (
                <span className="flex items-center gap-[3px]">
                  {Array.from({ length: Math.min(it.mine, 5) }).map((_, i) => (
                    <span key={i} className="h-2.5 w-2.5 rounded-full bg-selection" />
                  ))}
                  {it.mine > 5 && <span className="text-2xs font-bold text-selection">+{it.mine - 5}</span>}
                </span>
              )}
              {it.showTotals && <span className="min-w-[14px] text-center text-[12px] font-extrabold tabular-nums text-ink">{it.total}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pódio e ranking após revelar (Chat 04): 1º/2º/3º em degraus, lista completa com barras e
 * "Focar" em cada item (leva a câmera até ele). Fechar só esconde o painel; "Encerrar" limpa a
 * sessão (facilitador).
 */
export function VotingResultsPanel() {
  const t = useT();
  const voting = useBoardStore((s) => s.facilitation.voting);
  const elements = useBoardStore((s) => s.elements);
  const access = useBoardStore((s) => s.access);
  const simulate = useBoardStore((s) => s.facilitation.privateMode.previewOwnNotes);
  const presenting = useBoardStore((s) => s.presenting);
  const hidden = useVotingUi((s) => s.resultsHidden);
  const manage = useCan('voting.manage');
  const clear = useStudioBarClearance(12);

  const ranking = useMemo(() => (voting?.revealed ? rankVotes(voting, (id) => elements[id]) : []), [voting, elements]);
  if (!voting?.revealed || voting.kind === 'poll' || hidden || presenting) return null;
  const lookup = (id: string) => elements[id];
  const viewer = { userId: access.userId, simulate };
  const max = ranking[0]?.count ?? 1;
  const total = ranking.reduce((n, r) => n + r.count, 0);
  const podium = [ranking[1], ranking[0], ranking[2]];
  const voters = Object.values(voting.ballots ?? {}).filter((b) => Object.keys(b).length > 0).length;

  return (
    <div ref={clear.ref} style={{ top: clear.top, maxHeight: `calc(100% - ${clear.top + 108}px)` }} data-od-floating className="od-pop absolute left-3 z-[44] flex w-[340px] animate-slide-up flex-col overflow-hidden" onPointerDown={(e) => e.stopPropagation()} role="region" aria-label={t('widgets.votingOverlay.votingResults')}>
      <div className="flex items-start gap-2 border-b border-line px-3.5 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-brand-900 dark:text-brand-200">
          <Trophy size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{voting.title}</div>
          <div className="text-xs text-ink-subtle">
            {formatCount('point', total)} · {formatCount('participant', voters)} · {formatCount('item', ranking.length)}
          </div>
        </div>
        <button type="button" className="od-tool h-8 w-8" onClick={() => useVotingUi.setState({ resultsHidden: true })} aria-label={t('widgets.votingOverlay.closeResultsPanel')}>
          <X size={16} />
        </button>
      </div>

      {ranking.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-subtle">{t('widgets.votingOverlay.nobodyVotedThisSession')}</p>
      ) : (
        <>
          <div className="flex items-end justify-center gap-2 px-4 pb-1 pt-4">
            {podium.map((r, i) => {
              if (!r) return <div key={i} className="w-[92px]" />;
              const place = r.rank;
              const h = place === 1 ? 86 : place === 2 ? 62 : 46;
              const { label } = voteTargetLabel(r.key, lookup, viewer);
              return (
                <button key={r.key} type="button" className="group flex w-[92px] flex-col items-center gap-1.5 text-center" onClick={() => focusVoteTarget(r.key)} title={t('widgets.votingOverlay.focusLabel', { label })}>
                  <span className="line-clamp-2 min-h-[30px] text-[11.5px] font-semibold leading-tight text-ink group-hover:underline">{label}</span>
                  <span className="flex w-full flex-col items-center justify-start rounded-t-lg pt-1.5 text-white shadow-panel transition-transform duration-base ease-spring group-hover:-translate-y-0.5" style={{ height: h, background: MEDALS[Math.min(place, 3) - 1] }}>
                    <span className="text-[18px] font-extrabold leading-none">{place}º</span>
                    <span className="mt-1 text-[11px] font-bold opacity-90">{t('widgets.votingOverlay.countPts', { count: r.count })}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-2.5">
            {ranking.map((r) => {
              const { label, kind, color } = voteTargetLabel(r.key, lookup, viewer);
              return (
                <li key={r.key}>
                  <button type="button" className="od-menu-item min-h-[44px] items-center gap-2.5 py-1.5" onClick={() => focusVoteTarget(r.key)}>
                    <span className="w-6 shrink-0 text-center text-[13px] font-extrabold tabular-nums text-ink-muted">{r.rank}º</span>
                    <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: color ?? 'var(--od-border-strong)' }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{label}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-sunken">
                          <span className="block h-full rounded-full bg-selection" style={{ width: `${(r.count / max) * 100}%` }} />
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-subtle">{kind}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-ink">{r.count}</span>
                    <Crosshair size={14} className="shrink-0 text-ink-subtle" />
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {manage.allowed && (
        <div className="border-t border-line p-2.5">
          <button type="button" className="od-btn od-btn-secondary od-btn-sm w-full" onClick={() => useBoardStore.getState().closeVoting()}>{t('widgets.votingOverlay.endVotingSession')}</button>
        </div>
      )}
    </div>
  );
}
