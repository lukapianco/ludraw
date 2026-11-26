import { useId } from 'react';
import { Copy, Download, Ellipsis, ExternalLink, Folder, FolderInput, Info, Pencil, Star, Trash2, UserPlus } from 'lucide-react';
import { useBoardCan, useBoardPlaceLabel } from '../../hooks/useWorkspace';
import { useAppStore } from '../../store/useAppStore';
import type { BoardMeta } from '../../types/workspace';
import { cn } from '../../utils/cn';
import { formatRelativeDay, initials } from '../../utils/format';
import { createBackupFile, downloadBackup } from '../../utils/export';
import { loadBoardData } from '../../utils/storage';
import { Menu, type MenuItem } from '../ui/Menu';
import { formatTimeAgo } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { isSafeImageSrc, safeCssColor } from '../../utils/contentSafety';

/** "agora mesmo", "há 12 minutos", "ontem", "há 3 dias" (`Intl.RelativeTimeFormat`) ou a data curta. */
export function timeAgo(ts: number, now = Date.now()): string {
  if (now - ts >= 6.5 * 86400000) return formatRelativeDay(ts, now);
  return formatTimeAgo(ts, now);
}

/** Prévia do board: miniatura do autosave ou um marcador com a cor/iniciais do board. */
export function BoardPreview({ board, className, fit = 'cover' }: { board: BoardMeta; className?: string; fit?: 'cover' | 'contain' }) {
  return (
    <div className={cn('od-dot-bg relative overflow-hidden', className)}>
      {isSafeImageSrc(board.thumbnail) ? (
        <img src={board.thumbnail} alt="" className={cn('h-full w-full', fit === 'cover' ? 'object-cover object-top' : 'object-contain')} draggable={false} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white shadow-panel" style={{ background: safeCssColor(board.color) }} aria-hidden="true">
            {initials(board.name)}
          </span>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  board: BoardMeta;
  onOpen: () => void;
  onMenu: (el: HTMLElement) => void;
}

/**
 * Cartão da grade da Mesa: prévia 4:3 recuada (passe-partout), título, espaço, "há X",
 * ★ favoritar e menu ⋯. Toda a lógica (abrir/renomear/duplicar/excluir/favoritar) é a do Chat 01.
 */
export function BoardCard({ board, onOpen, onMenu }: CardProps) {
  const t = useT();
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const place = useBoardPlaceLabel(board);
  const project = useAppStore((s) => (board.projectId && !(s.currentPlace.kind === 'team' && s.currentPlace.projectId === board.projectId) ? s.projects.find((p) => p.id === board.projectId) : undefined));
  const projectColor = useAppStore((s) => s.teams.find((x) => x.id === board.teamId)?.color);
  // Chat 08.6 · A (D-13): nome acessível = texto visível do cartão (nome + "lugar · quando"), sem as iniciais
  const nameId = useId();
  const metaId = useId();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-labelledby={`${nameId} ${metaId}`}
      className="group flex cursor-pointer flex-col rounded-2xl bg-panel p-2 ring-1 ring-line transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300 focus-visible:ring-2 focus-visible:ring-selection"
    >
      <div className="relative">
        <BoardPreview board={board} className="aspect-[4/3] rounded-xl ring-1 ring-line" />
        {project && (
          // Chat 06: selo de pasta — deixa claro que o board é de um projeto
          <span className="absolute start-2 top-2 inline-flex max-w-[85%] items-center gap-1 truncate rounded-full bg-panel px-2 py-0.5 text-[11px] font-semibold text-ink shadow-panel ring-1 ring-line" title={place}>
            <Folder size={12} style={{ color: projectColor }} className="shrink-0" /> <span className="truncate">{project.name}</span>
          </span>
        )}
      </div>
      <div className="flex items-start gap-2 px-1.5 pb-1 pt-2.5">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: safeCssColor(board.color) }} />
        <div className="min-w-0 flex-1">
          <div id={nameId} className="truncate text-[14px] font-semibold text-ink">{board.name}</div>
          <div id={metaId} className="truncate text-xs text-ink-subtle">
            {place} · {timeAgo(board.lastOpenedAt)}
          </div>
        </div>
        <button
          type="button"
          className={cn('od-tool h-8 w-8 shrink-0', board.favorite ? 'text-favorite' : 'text-ink-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(board.id);
          }}
          aria-label={board.favorite ? t('dashboard.boardCard.removeFavorites') : t('dashboard.boardCard.addFavorites')}
          aria-pressed={board.favorite}
        >
          <Star size={16} className={board.favorite ? 'fill-current' : undefined} />
        </button>
        <button
          type="button"
          data-od-menu-trigger
          className="od-tool h-8 w-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e.currentTarget);
          }}
          aria-label={t('common.moreOptions')}
        >
          <Ellipsis size={16} />
        </button>
      </div>
    </div>
  );
}

/** Versão compacta (faixa "Fixados"): miniatura pequena + nome + "há X". */
export function BoardChip({ board, onOpen, onMenu }: CardProps) {
  const t = useT();
  const nameId = useId();
  const metaId = useId();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-labelledby={`${nameId} ${metaId}`}
      className="group flex cursor-pointer items-center gap-3 rounded-xl bg-panel p-1.5 pe-1 ring-1 ring-line transition-all duration-base ease-out hover:shadow-pop hover:ring-brand-300 focus-visible:ring-2 focus-visible:ring-selection"
    >
      <BoardPreview board={board} className="h-12 w-16 shrink-0 rounded-lg ring-1 ring-line" />
      <div className="min-w-0 flex-1">
        <div id={nameId} className="truncate text-[13px] font-semibold text-ink">{board.name}</div>
        <div id={metaId} className="truncate text-xs text-ink-subtle">{timeAgo(board.lastOpenedAt)}</div>
      </div>
      <Star size={14} className="shrink-0 fill-favorite text-favorite" aria-label={t('dashboard.boardCard.favorite')} />
      <button
        type="button"
        data-od-menu-trigger
        className="od-tool h-8 w-8 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onMenu(e.currentTarget);
        }}
        aria-label={t('common.moreOptions')}
      >
        <Ellipsis size={16} />
      </button>
    </div>
  );
}

/** Menu ⋯ de um board na Mesa (mesmas ações do Chat 01 + Detalhes). */
export function BoardActionsMenu({ boardId, x, y, onClose }: { boardId: string; x: number; y: number; onClose: () => void }) {
  const t = useT();
  const board = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const share = useBoardCan(boardId, 'board.share');
  const move = useBoardCan(boardId, 'board.move');
  const del = useBoardCan(boardId, 'board.delete');
  const app = useAppStore.getState;
  if (!board) return null;
  const items: MenuItem[] = [
    { kind: 'item', id: 'open', label: t('dashboard.boardCard.open'), icon: <ExternalLink size={16} />, onSelect: () => app().navigate({ name: 'board', id: boardId }) },
    { kind: 'item', id: 'rename', label: t('common.rename'), icon: <Pencil size={16} />, onSelect: () => app().openModal({ type: 'rename-board', boardId }) },
    {
      kind: 'item',
      id: 'duplicate',
      label: t('common.duplicate'),
      icon: <Copy size={16} />,
      onSelect: () => {
        void app().duplicateBoard(boardId).then((id) => id && app().toast(t('dashboard.boardCard.boardDuplicated'), 'success'));
      },
    },
    { kind: 'item', id: 'fav', label: board.favorite ? t('dashboard.boardCard.removeFavorites') : t('dashboard.boardCard.markAsFavorite'), icon: <Star size={16} />, onSelect: () => app().toggleFavorite(boardId) },
    {
      kind: 'item',
      id: 'backup',
      label: t('dashboard.boardCard.backUpLudraw'),
      icon: <Download size={16} />,
      onSelect: () =>
        void loadBoardData(boardId).then((data) => {
          if (!data) return;
          downloadBackup(board.name, createBackupFile(board.name, board.createdAt, board.ownerName, data));
          app().toast(t('dashboard.boardCard.backupSaved'), 'success');
        }),
    },
    { kind: 'item', id: 'details', label: t('common.details'), icon: <Info size={16} />, onSelect: () => app().openModal({ type: 'details', boardId }) },
    { kind: 'separator', id: 's' },
    // Chat 06: compartilhar e mover pela hierarquia — negado mostra o motivo de explain()
    { kind: 'item', id: 'share', label: t('workspace.menu.share'), icon: <UserPlus size={16} />, disabled: !share.allowed, hint: share.reason, onSelect: () => app().openModal({ type: 'share-board', boardId }) },
    { kind: 'item', id: 'move', label: t('workspace.menu.moveTo'), icon: <FolderInput size={16} />, disabled: !move.allowed, hint: move.reason, onSelect: () => app().openModal({ type: 'move-board', boardId }) },
    { kind: 'separator', id: 's2' },
    { kind: 'item', id: 'delete', label: t('modals.appModals.moveToTrash'), icon: <Trash2 size={16} />, danger: true, disabled: !del.allowed, hint: del.reason, onSelect: () => app().openModal({ type: 'confirm-delete-board', boardId, redirect: false }) },
  ];
  return <Menu items={items} x={x} y={y} align="end" onClose={onClose} minWidth={230} />;
}
