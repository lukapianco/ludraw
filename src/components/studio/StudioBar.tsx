/**
 * LuDraw — barra do topo do Estúdio v2 (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §2, §3.1, §3.2): UMA peça `.od-panel`
 * (44 px, raio 14, `shadow-panel`), centralizada, 12 px do topo. Ficha │ Roda dentro dela, separadas só por um divisor.
 *  Ficha: botão Mesa (favicon) · título em duas linhas (abre a Ficha do board; duplo clique renomeia) · selo de estado.
 *  Roda:  avatares · Facilitar (com o estado vivo) · Conversas · Apresentar · Compartilhar · Você.
 * Os cantos de cima ficam livres para avisos, cronômetro flutuante e painéis de votação.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Play, Star, UserPlus } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { useCollabUi } from '../../collab/presenceStore';
import { useBoardPlaceLabel } from '../../hooks/useWorkspace';
import { persistCurrentBoard, startPresentation } from '../../utils/boardActions';
import { initials } from '../../utils/format';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Tooltip } from '../ui/Tooltip';
import { OnlineAvatars } from '../collab/OnlineAvatars';
import { SaveStatus } from '../toolbar/TopBar';
import { handleToolbarKeys } from '../board/rovingFocus';
import { BatonIcon, CommentPinIcon, MesaMark } from '../icons/od';
import { useDrawerTrigger } from './StudioDrawer';
import { LocalOnlyBadge } from '../dashboard/LocalModeBanner';

/** Abre o compartilhamento (mesma permissão de antes: `board.share`). */
export function openShare(): void {
  const boardId = useBoardStore.getState().boardId;
  if (!boardId || !useBoardStore.getState().ensure('board.share')) return;
  useAppStore.getState().openModal({ type: 'share-board', boardId });
}

export async function goToMesa(): Promise<void> {
  await persistCurrentBoard(true);
  useAppStore.getState().navigate({ name: 'dashboard' });
}

export function StudioBar() {
  return (
    <header
      role="toolbar"
      data-studio-region="top"
      onKeyDown={handleToolbarKeys}
      className="od-panel pointer-events-auto absolute start-1/2 top-3 z-50 flex h-11 max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-0.5 rounded-[14px] px-1.5 shadow-panel"
      data-testid="studio-bar"
    >
      <Ficha />
      <span className="od-divider-v mx-1" />
      <Roda />
    </header>
  );
}

function Ficha() {
  const t = useT();
  const boardId = useBoardStore((s) => s.boardId);
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const placeName = useBoardPlaceLabel(meta);
  const trigger = useDrawerTrigger('card');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(meta?.name ?? '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!renaming) setDraft(meta?.name ?? '');
  }, [meta?.name, renaming]);
  useEffect(() => {
    if (renaming) input.current?.select();
  }, [renaming]);
  const commit = () => {
    if (boardId && draft.trim()) useAppStore.getState().renameBoard(boardId, draft);
    setRenaming(false);
  };
  const name = meta?.name ?? t('board.topBar.board');
  return (
    <div className="flex min-w-0 items-center gap-1" data-studio-part="ficha">
      <Tooltip label={t('studio.mesa')} side="bottom">
        <button type="button" data-testid="studio-mesa" className="shrink-0 rounded-[10px] transition-transform duration-base ease-out hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)]" onClick={() => void goToMesa()} aria-label={t('studio.mesa')}>
          <MesaMark size={34} />
        </button>
      </Tooltip>
      {renaming ? (
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="ms-1 h-8 w-[200px] min-w-0 rounded-md bg-panel-sunken px-2 text-[14px] font-semibold text-ink outline-none ring-1 ring-selection"
          aria-label={t('board.topBar.boardName')}
        />
      ) : (
        <button
          type="button"
          {...trigger}
          data-testid="studio-title"
          onDoubleClick={() => useBoardStore.getState().ensure('board.edit') && setRenaming(true)}
          title={`${placeName} › ${name}`}
          className="flex h-[34px] min-w-0 max-w-[240px] flex-col justify-center rounded-lg px-2 text-start transition-colors duration-base hover:bg-panel-hover data-[active=true]:bg-panel-active max-[759px]:max-w-[120px]"
          // Chat 08.6 · A (D-13): nome acessível = texto visível (lugar › nome); que abre a Ficha já vem de
          // aria-haspopup="dialog" + aria-expanded do gatilho e do título da própria gaveta
          aria-label={`${placeName} › ${name}`}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-ink-subtle max-[759px]:hidden">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: meta?.color ?? '#194B32' }} aria-hidden="true" />
            <span className="truncate">{placeName}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[14px] font-semibold leading-tight text-ink">
            <span className="truncate">{name}</span>
            {meta?.favorite && <Star size={12} className="shrink-0 fill-favorite text-favorite" aria-label={t('board.topBar.favorite')} />}
            <ChevronDown size={14} className="shrink-0 text-ink-subtle" />
          </span>
        </button>
      )}
      <SaveStatus compact />
      {/* Chat 08.5 · D: Modo Local com servidor disponível → selo que abre a gaveta Você */}
      <LocalOnlyBadge />
    </div>
  );
}

/** Estado vivo da facilitação ao lado do botão: cronômetro (mm:ss), votando, privado, conduzindo. */
function useFacilitationState(): { text: string; mono: boolean } | null {
  const t = useT();
  const timer = useBoardStore((s) => s.facilitation.timer);
  const voting = useBoardStore((s) => !!s.facilitation.voting?.active && !s.facilitation.voting.revealed);
  const priv = useBoardStore((s) => s.facilitation.privateMode.enabled);
  const leading = useBoardStore((s) => !!s.facilitation.leaderUserId && s.facilitation.leaderUserId === s.access.userId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timer?.running]);
  if (timer && (timer.running || (timer.visible && timer.remainingMs > 0 && timer.remainingMs < timer.durationMs))) {
    const ms = timer.running && timer.endsAt ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
    const s = Math.ceil(ms / 1000);
    return { text: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, mono: true };
  }
  if (voting) return { text: t('studio.facilitate.stateVoting'), mono: false };
  if (leading) return { text: t('studio.facilitate.stateLeading'), mono: false };
  if (priv) return { text: t('studio.facilitate.statePrivate'), mono: false };
  return null;
}

function Roda() {
  const t = useT();
  const user = useAppStore((s) => s.user);
  const myId = useBoardStore((s) => s.access.userId);
  const selfColor = useCollabUi((s) => s.users.find((u) => u.id === myId)?.color);
  const openComments = useBoardStore((s) => s.elementOrder.reduce((n, id) => (s.elements[id]?.type === 'comment' && !(s.elements[id] as { resolved?: boolean }).resolved ? n + 1 : n), 0));
  const facilitate = useDrawerTrigger('facilitate');
  const conversations = useDrawerTrigger('conversations');
  const you = useDrawerTrigger('you');
  const state = useFacilitationState();
  return (
    <div className="flex min-w-0 items-center gap-0.5" data-studio-part="roda">
      <OnlineAvatars
        selfName={user?.name ?? t('common.you')}
        selfColor={selfColor ?? user?.color ?? '#194B32'}
        selfLabel={user ? (user.guest ? t('board.topBar.guestYou', { name: user.name }) : t('board.topBar.nameYou', { name: user.name })) : t('common.you')}
        hideSelf
      />
      <Tooltip label={t('studio.facilitate.title')} side="bottom">
        <button type="button" {...facilitate} data-testid="studio-facilitate" className="od-tool h-[34px] w-auto gap-1.5 px-2" aria-label={t('studio.facilitate.title')}>
          <BatonIcon size={18} />
          <span className="max-w-[140px] truncate whitespace-nowrap text-[13px] font-semibold max-[1179px]:hidden" title={t('studio.facilitate.title')}>{t('studio.facilitate.title')}</span>
          {state && (
            <span data-testid="studio-facilitate-state" className={cn('whitespace-nowrap text-[12px] font-semibold text-[var(--od-selection)]', state.mono && 'font-mono tabular-nums', !state.mono && 'max-[1179px]:hidden')}>
              {state.text}
            </span>
          )}
        </button>
      </Tooltip>
      <Tooltip label={openComments ? t('board.topBar.commentsOpenCount', { count: openComments }) : t('studio.conversations.title')} side="bottom">
        <button type="button" {...conversations} data-testid="studio-conversations" className="od-tool relative h-[34px] w-[34px]" aria-label={t('studio.conversations.title')}>
          <CommentPinIcon size={18} />
          {openComments > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-2xs font-bold tabular-nums text-accent-contrast ring-2 ring-[var(--od-panel)]">
              {openComments > 99 ? '99+' : openComments}
            </span>
          )}
        </button>
      </Tooltip>
      <Tooltip label={t('board.topBar.present')} shortcut="Ctrl Alt P" side="bottom">
        <button type="button" data-testid="studio-present" className="od-tool h-[34px] w-auto gap-1.5 px-2" onClick={() => startPresentation()} aria-label={t('board.topBar.present')}>
          <Play size={15} className="fill-current" />
          <span className="max-w-[140px] truncate whitespace-nowrap text-[13px] font-semibold max-[1179px]:hidden" title={t('board.topBar.present')}>{t('board.topBar.present')}</span>
        </button>
      </Tooltip>
      <button type="button" data-testid="studio-share" className="od-btn od-btn-primary ms-1 h-[34px] shrink-0 px-2.5 text-[13px] min-[1180px]:px-3" onClick={openShare} aria-label={t('board.topBar.share')}>
        <UserPlus size={15} />
        <span className="max-w-[140px] truncate whitespace-nowrap max-[1179px]:hidden">{t('board.topBar.share')}</span>
      </button>
      <Tooltip label={t('studio.you.title')} side="bottom">
        <button type="button" {...you} data-testid="studio-you" className="ms-1 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ring-2 ring-transparent transition-shadow data-[active=true]:ring-[var(--od-selection)]" aria-label={t('studio.you.title')}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: selfColor ?? user?.color ?? '#194B32' }} aria-hidden="true">
            {initials(user?.name ?? '?')}
          </span>
        </button>
      </Tooltip>
    </div>
  );
}
