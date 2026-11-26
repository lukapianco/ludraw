import { Eye, EyeOff, Users } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useCollabUi } from '../../collab/presenceStore';
import { useT } from '../../i18n/useT';

/** Faixa do "seguir" (Chat 08): quem estou seguindo; pausa ao mexer na tela, com voltar ou parar. */
export function FollowBanner() {
  const t = useT();
  const following = useCollabUi((s) => s.following);
  const paused = useCollabUi((s) => s.paused);
  const name = useCollabUi((s) => s.users.find((u) => u.id === s.following)?.name);
  const follow = useCollabUi((s) => s.follow);
  const setPaused = useCollabUi((s) => s.setPaused);
  const forced = useCollabUi((s) => s.forced);
  const leaveLeader = useCollabUi((s) => s.leaveLeader);
  const leadingMe = useBoardStore((s) => !!s.facilitation.leaderUserId && s.facilitation.leaderUserId === s.access.userId);
  const others = useCollabUi((s) => s.users.length - 1);
  if (leadingMe) {
    return (
      <div data-od-floating data-od-follow-ui role="status" className="absolute start-1/2 top-[64px] z-[44] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--od-panel-border)] bg-[var(--od-panel)] py-1 ps-3 pe-1 text-[12.5px] font-semibold text-ink shadow-md">
        <Users size={14} className="text-[var(--od-selection)]" />
        <span>{t('collab.follow.leading', { count: Math.max(0, others) })}</span>
        <button type="button" onClick={() => useBoardStore.getState().stopLeading()} className="rounded-full px-2.5 py-1 hover:bg-[var(--od-hover)]">
          {t('collab.follow.stopLeading')}
        </button>
      </div>
    );
  }
  if (!following || !name) return null;
  return (
    <div data-od-floating data-od-follow-ui role="status" className="absolute start-1/2 top-[64px] z-[44] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--od-panel-border)] bg-[var(--od-panel)] py-1 ps-3 pe-1 text-[12.5px] font-semibold text-ink shadow-md">
      {paused ? <EyeOff size={14} className="text-ink-subtle" /> : <Eye size={14} className="text-[var(--od-selection)]" />}
      <span>{paused ? t('collab.follow.paused') : forced ? t('collab.follow.ledBy', { name }) : t('collab.follow.following', { name })}</span>
      {paused && (
        <button type="button" onClick={() => setPaused(false)} className="rounded-full bg-[var(--od-selection)] px-2.5 py-1 text-white">
          {t('collab.follow.resume')}
        </button>
      )}
      <button type="button" onClick={() => (forced ? leaveLeader() : follow(following))} className="rounded-full px-2.5 py-1 hover:bg-[var(--od-hover)]">
        {forced ? t('collab.follow.leaveLeader') : t('collab.follow.stop')}
      </button>
    </div>
  );
}
