/**
 * LuDraw — gaveta Facilitar (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.2): cartões 2 × 3 — Cronômetro, Votação, Enquete,
 * Modo Privado, Conduzir a tela (só ao vivo), Ver como… Cada cartão abre o painel que já existe (`TimerPanel`,
 * `VotingSetupModal`, `PollSetupPanel`, itens do Modo Privado e do "Ver como…") ancorado no próprio cartão. As
 * permissões são as MESMAS de antes (`useCan` → `can()`/`explain()`); sem permissão = cartão desabilitado com o motivo.
 */
import { useState, type ReactNode } from 'react';
import { EyeOff, ListChecks, ScanEye, Timer, Trophy, Users, UserX, Vote, X } from 'lucide-react';
import { useBoardStore, votesUsedBy } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import { TimerPanel } from '../facilitation/TimerMenu';
import { startPollDraft, useVotingUi } from '../facilitation/votingUi';
import { usePrivateModeItems } from '../toolbar/PrivateModeMenu';
import { useViewAsItems } from '../toolbar/ViewAsMenu';
import { Menu, type MenuItem } from '../ui/Menu';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { StudioDrawer } from './StudioDrawer';

const I = 16;

/** Ações da votação/enquete conforme o estado (as mesmas do antigo menu ⋯). */
export function useVotingActionItems(): MenuItem[] {
  const t = useT();
  const manage = useCan('voting.manage');
  const voting = useBoardStore((s) => s.facilitation.voting);
  const left = useBoardStore((s) => (s.facilitation.voting ? Math.max(0, s.facilitation.voting.dotsPerUser - votesUsedBy(s.facilitation.voting, s.access.userId)) : 0));
  const b = useBoardStore.getState;
  if (!voting) return [];
  const isPoll = voting.kind === 'poll';
  return [
    { kind: 'label', id: 'vt-label', label: voting.revealed ? t(isPoll ? 'menus.facilitationMenu.pollTitleEnded' : 'menus.facilitationMenu.voteTitleEnded', { title: voting.title.slice(0, 40) }) : isPoll ? t('menus.facilitationMenu.pollTitle', { title: voting.title.slice(0, 40) }) : t('menus.facilitationMenu.voteTitleDotsLeft', { title: voting.title.slice(0, 40), count: left }) },
    ...(isPoll || voting.revealed
      ? [{ kind: 'item' as const, id: 'vt-open', label: voting.revealed ? t('menus.facilitationMenu.seeResults') : t('menus.facilitationMenu.openPoll'), icon: isPoll && !voting.revealed ? <ListChecks size={I} /> : <Trophy size={I} />, onSelect: () => useVotingUi.setState({ resultsHidden: false, pollMinimized: false }) }]
      : []),
    ...(manage.allowed && !voting.revealed
      ? [
          { kind: 'item' as const, id: 'vt-reveal', label: t('menus.facilitationMenu.endRevealResults'), icon: <Trophy size={I} />, onSelect: () => { b().revealVoting(); useVotingUi.setState({ resultsHidden: false, pollMinimized: false }); } },
          { kind: 'item' as const, id: 'vt-cancel', label: t('menus.facilitationMenu.cancelWithoutRevealing'), icon: <X size={I} />, onSelect: () => b().cancelVoting() },
        ]
      : []),
    ...(manage.allowed && voting.revealed ? [{ kind: 'item' as const, id: 'vt-close', label: t('menus.facilitationMenu.endSession'), icon: <X size={I} />, onSelect: () => b().closeVoting() }] : []),
  ];
}

type CardMenu = { id: string; x: number; y: number; items: MenuItem[] } | null;

export function FacilitateDrawer() {
  const t = useT();
  const timerManage = useCan('timer.manage');
  const manage = useCan('voting.manage');
  const lead = useCan('followMe.lead');
  const toggle = useCan('privateMode.toggle');
  const live = useBoardStore((s) => s.collab);
  const leading = useBoardStore((s) => !!s.facilitation.leaderUserId && s.facilitation.leaderUserId === s.access.userId);
  const timer = useBoardStore((s) => s.facilitation.timer);
  const voting = useBoardStore((s) => s.facilitation.voting);
  const priv = useBoardStore((s) => s.facilitation.privateMode.enabled);
  const viewAs = useAppStore((s) => s.session.viewAs);
  const [menu, setMenu] = useState<CardMenu>(null);
  const close = () => setMenu(null);
  const votingItems = useVotingActionItems();
  const privateItems = usePrivateModeItems();
  const viewAsItems = useViewAsItems('board', close);
  const b = useBoardStore.getState;

  const anchorMenu = (id: string, el: HTMLElement, items: MenuItem[]) => {
    if (menu?.id === id) return close();
    const r = el.getBoundingClientRect();
    setMenu({ id, x: r.left, y: r.bottom + 6, items });
  };
  const timerItems: MenuItem[] = [{ kind: 'custom', id: 'timer-panel', render: (done) => <div className="w-[320px]"><TimerPanel canManage={timerManage.allowed} reason={timerManage.reason} onDone={done} /></div> }];
  const isPoll = voting?.kind === 'poll';
  const activeVote = !!voting && !isPoll;
  const activePoll = !!voting && isPoll;

  return (
    <StudioDrawer id="facilitate" title={t('studio.facilitate.title')} width={380} from="top" footer={t('studio.facilitate.footer')}>
      <div className="grid grid-cols-2 gap-2 p-3" data-testid="facilitate-cards">
        <Card id="timer" icon={<Timer size={18} />} title={t('menus.facilitationMenu.timer')} state={timer?.running ? t('studio.facilitate.running') : undefined} active={!!timer?.running} onClick={(el) => anchorMenu('timer', el, timerItems)} />
        <Card
          id="vote"
          icon={<Vote size={18} />}
          title={t('studio.facilitate.vote')}
          state={activeVote ? (voting!.revealed ? t('studio.facilitate.revealed') : t('studio.facilitate.stateVoting')) : undefined}
          active={activeVote}
          disabled={!voting && !manage.allowed}
          reason={manage.reason}
          onClick={(el) => (voting ? anchorMenu('vote', el, votingItems) : useVotingUi.getState().pollDraft ? undefined : useAppStore.getState().openModal({ type: 'voting-setup' }))}
        />
        <Card
          id="poll"
          icon={<ListChecks size={18} />}
          title={t('menus.facilitationMenu.poll')}
          state={activePoll ? (voting!.revealed ? t('studio.facilitate.revealed') : t('studio.facilitate.open')) : undefined}
          active={activePoll}
          disabled={(!voting && !manage.allowed) || (!!voting && !isPoll && !manage.allowed)}
          reason={manage.reason}
          onClick={(el) => (voting ? anchorMenu('poll', el, votingItems) : startPollDraft(''))}
        />
        <Card id="private" icon={<EyeOff size={18} />} title={t('board.privateModeMenu.privateMode')} state={priv ? t('studio.facilitate.on') : undefined} active={priv} reason={toggle.allowed ? undefined : toggle.reason} onClick={(el) => anchorMenu('private', el, privateItems)} />
        {live && (
          <Card
            id="lead"
            icon={leading ? <UserX size={18} /> : <Users size={18} />}
            title={leading ? t('menus.facilitationMenu.stopLeading') : t('studio.facilitate.lead')}
            state={leading ? t('studio.facilitate.stateLeading') : undefined}
            active={leading}
            disabled={!leading && !lead.allowed}
            reason={lead.reason}
            onClick={() => (leading ? b().stopLeading() : b().bringEveryone())}
          />
        )}
        <Card id="viewas" icon={<ScanEye size={18} />} title={t('studio.facilitate.viewAs')} state={viewAs ? (viewAs.labelKey ? t(viewAs.labelKey) : viewAs.label) : undefined} active={!!viewAs} onClick={(el) => anchorMenu('viewas', el, viewAsItems)} />
      </div>
      {menu && <Menu items={menu.items} x={menu.x} y={menu.y} onClose={close} minWidth={280} />}
    </StudioDrawer>
  );
}

function Card({ id, icon, title, state, active, disabled, reason, onClick }: { id: string; icon: ReactNode; title: string; state?: string; active?: boolean; disabled?: boolean; reason?: string; onClick: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-od-menu-trigger
      data-facilitate-card={id}
      disabled={disabled}
      title={disabled ? reason : undefined}
      aria-pressed={active}
      onClick={(e) => onClick(e.currentTarget)}
      className={cn(
        'flex min-h-[74px] flex-col items-start gap-1.5 rounded-xl p-2.5 text-start ring-1 transition-colors duration-base disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'bg-accent-soft ring-[var(--od-selection)]' : 'bg-panel-sunken ring-line hover:bg-panel-hover',
      )}
    >
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', active ? 'bg-accent text-accent-contrast' : 'text-[var(--od-accent)]')}>{icon}</span>
      <span className="text-[13px] font-semibold leading-tight text-ink">{title}</span>
      {state ? <span className="text-[11.5px] font-semibold text-[var(--od-selection)]">{state}</span> : disabled && reason ? <span className="line-clamp-2 text-[11px] leading-snug text-ink-subtle">{reason}</span> : null}
    </button>
  );
}
