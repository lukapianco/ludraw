/**
 * LuDraw — gaveta Conversas (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.2.1; substitui a aba Comentários do Painel).
 * Cabeçalho com as abertas e "+ Nova"; filtros Abertas · Resolvidas · Todas e "@ Menções"; cada conversa é um cartão
 * com a gota do pin na cor do autor, resolver rápido, texto em 2 linhas com @menções, onde está, respostas e
 * "Ir até" (câmera até o pin, destaque de 1,5 s e conversa aberta). Rodapé: "Seguir todas as conversas".
 * Permissões como antes: `board.comment` para criar e resolver.
 */
import { useMemo, useState } from 'react';
import { AtSign, Check, Crosshair, Plus } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCan } from '../../hooks/useCan';
import type { CommentElement } from '../../types/canvas';
import { isHiddenByFrame } from '../../utils/frames';
import { mentionSegments, mentionsUser, openComment } from '../../utils/comments';
import { relativeTime } from '../../utils/activity';
import { colorFromString } from '../../utils/color';
import { initials } from '../../utils/format';
import { elementDisplayName } from '../../utils/elementNames';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';
import { Switch } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { StudioDrawer } from './StudioDrawer';
import { useStudioUi } from './studioUi';

type Filter = 'open' | 'resolved' | 'all';

/** Leva a câmera até o pin (animado), destaca por 1,5 s e abre a conversa. */
export function goToComment(id: string): void {
  const s = useBoardStore.getState();
  const el = s.elements[id];
  if (!el || el.type !== 'comment') return;
  const vp = s.viewport;
  const zoom = s.camera.zoom;
  s.animateCameraTo({ x: vp.width / 2 - el.x * zoom, y: vp.height / 2 - el.y * zoom, zoom });
  openComment(id, false);
  useStudioUi.getState().flash(id);
}

export function ConversationsDrawer() {
  const t = useT();
  const elements = useBoardStore((s) => s.elements);
  const order = useBoardStore((s) => s.elementOrder);
  const userName = useAppStore((s) => s.user?.name);
  const showComments = useAppStore((s) => s.preferences.showComments);
  const follow = useAppStore((s) => s.preferences.followConversations);
  const comment = useCan('board.comment');
  const [filter, setFilter] = useState<Filter>('open');
  const [mine, setMine] = useState(false);
  const all = useMemo(() => {
    const lookup = (id: string) => elements[id];
    return order
      .map((id) => elements[id])
      .filter((el): el is CommentElement => !!el && el.type === 'comment' && !isHiddenByFrame(el, lookup))
      .sort((a, b) => (b.messages[b.messages.length - 1]?.createdAt ?? b.createdAt) - (a.messages[a.messages.length - 1]?.createdAt ?? a.createdAt));
  }, [elements, order]);
  const openCount = all.filter((c) => !c.resolved).length;
  const list = all.filter((c) => (filter === 'all' ? true : filter === 'open' ? !c.resolved : c.resolved)).filter((c) => !mine || mentionsUser(c, userName));

  return (
    <StudioDrawer
      id="conversations"
      title={t('studio.conversations.title')}
      width={380}
      from="top"
      headerExtra={
        <>
          <span className="shrink-0 text-xs text-ink-subtle">{t('studio.conversations.openCount', { count: openCount })}</span>
          <Tooltip label={comment.allowed ? t('board.boardSidebar.newCommentC') : comment.reason ?? ''} side="bottom">
            <button
              type="button"
              className="od-btn od-btn-secondary od-btn-sm h-7 shrink-0 px-2"
              disabled={!comment.allowed}
              onClick={() => {
                useStudioUi.getState().close();
                useBoardStore.getState().setActiveTool('comment');
              }}
            >
              <Plus size={14} /> {t('studio.conversations.new')}
            </button>
          </Tooltip>
        </>
      }
      footer={
        <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px] text-ink">
          {t('menus.boardMenu.followAllConversations')}
          <button type="button" role="switch" aria-checked={follow} onClick={() => useAppStore.getState().togglePreference('followConversations')}>
            <Switch checked={follow} />
          </button>
        </label>
      }
    >
      <div className="flex flex-col gap-2 p-3" data-testid="conversations-list">
        <div className="flex items-center gap-1">
          {(['open', 'resolved', 'all'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} className={cn('od-btn od-btn-sm h-7 px-2.5', filter === f ? 'od-btn-soft' : 'od-btn-ghost text-ink-muted')} onClick={() => setFilter(f)}>
              {f === 'open' ? t('studio.conversations.filterOpen') : f === 'resolved' ? t('studio.conversations.filterResolved') : t('studio.conversations.filterAll')}
            </button>
          ))}
          <button type="button" aria-pressed={mine} className={cn('od-btn od-btn-sm ms-auto h-7 px-2', mine ? 'od-btn-soft' : 'od-btn-ghost text-ink-muted')} onClick={() => setMine((v) => !v)}>
            <AtSign size={13} /> {t('studio.conversations.mentions')}
          </button>
        </div>
        {!showComments && (
          <button type="button" className="rounded-lg bg-panel-sunken px-3 py-2 text-start text-xs text-ink-muted ring-1 ring-line hover:bg-panel-hover" onClick={() => useAppStore.getState().setPreference('showComments', true)}>
            <Trans k="board.boardSidebar.pinsAreHiddenBoardShift" components={{ b: (c) => <strong className="text-ink">{c}</strong> }} />
          </button>
        )}
        {list.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink-subtle">
            {all.length === 0 ? t('board.boardSidebar.noConversationsYetUseComment') : mine ? t('board.boardSidebar.nobodyMentionedYouTheseConversations') : t('board.boardSidebar.nothingHereThisFilter')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((c) => (
              <ConversationCard key={c.id} c={c} canComment={comment.allowed} reason={comment.reason} target={c.targetId ? elements[c.targetId] : undefined} />
            ))}
          </ul>
        )}
      </div>
    </StudioDrawer>
  );
}

function ConversationCard({ c, canComment, reason, target }: { c: CommentElement; canComment: boolean; reason?: string; target?: import('../../types/canvas').CanvasElement }) {
  const t = useT();
  const first = c.messages[0];
  const last = c.messages[c.messages.length - 1];
  const author = first?.author ?? t('board.boardSidebar.someone');
  const color = c.resolved ? '#7D877F' : colorFromString(author);
  const replies = Math.max(0, c.messages.length - 1);
  return (
    <li data-conversation={c.id} className="rounded-xl bg-panel p-2.5 ring-1 ring-line transition-shadow duration-base hover:ring-[var(--od-selection)]">
      <div className="flex items-start gap-2.5">
        {/* gota do pin, mesmo desenho do pin no board */}
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-2xs font-bold text-white" style={{ background: color, borderRadius: '50% 50% 50% 4px' }}>
          {c.resolved ? <Check size={12} strokeWidth={3} /> : initials(author)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold text-ink">{author}</span>
            <span className="shrink-0 text-[11px] text-ink-subtle">{relativeTime(last?.createdAt ?? c.createdAt)}</span>
          </div>
          <p className={cn('mt-0.5 line-clamp-2 text-[12.5px] leading-snug', c.resolved ? 'text-ink-subtle line-through decoration-ink-subtle/40' : 'text-ink-muted')}>
            {mentionSegments(first?.text ?? '', first?.mentions).map((seg, i) => (seg.mention ? <span key={i} className="rounded bg-accent-soft px-0.5 text-ink">{seg.text}</span> : <span key={i}>{seg.text}</span>))}
          </p>
        </div>
        <Tooltip label={canComment ? (c.resolved ? t('board.boardSidebar.reopen') : t('board.boardSidebar.markAsResolved')) : reason ?? ''} side="left">
          <button
            type="button"
            className={cn('od-tool h-7 w-7 shrink-0', c.resolved && 'text-success')}
            disabled={!canComment}
            onClick={() => useBoardStore.getState().setCommentResolved(c.id, !c.resolved)}
            aria-label={c.resolved ? t('board.boardSidebar.reopenConversation') : t('board.boardSidebar.resolveConversation')}
          >
            <Check size={15} />
          </button>
        </Tooltip>
      </div>
      <div className="mt-2 flex items-center gap-2 ps-[34px] text-[11.5px] text-ink-subtle">
        <span className="min-w-0 flex-1 truncate">{target ? elementDisplayName(target) : t('studio.conversations.onCanvas')}</span>
        {replies > 0 && <span className="shrink-0">{t('studio.conversations.replies', { count: replies })}</span>}
        <button type="button" data-go-to={c.id} className="od-btn od-btn-sm od-btn-ghost h-6 shrink-0 px-1.5 text-ink" onClick={() => goToComment(c.id)}>
          <Crosshair size={13} /> {t('studio.conversations.goTo')}
        </button>
      </div>
    </li>
  );
}
