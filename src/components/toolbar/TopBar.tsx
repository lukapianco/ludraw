import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useCollabSession } from '../../collab/useCollab';
import type { CollabStatus } from '../../collab/session';
import { serverBoardRepository } from '../../utils/boardRepository';
import type { SyncStatus } from '../../utils/apiBoardRepository';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { formatDateTime } from '../../utils/format';
import { cn } from '../../utils/cn';
import { Logo } from '../ui/Logo';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

/**
 * Chat 08.2: a Régua (barra de ponta a ponta do Chat 02) deu lugar ao Estúdio v2 (`studio/StudioBar.tsx`). Aqui ficam
 * só a barrinha do modo INCORPORADO (embed) e os selos de estado (`SaveStatus`, `LiveBadge`, `SyncBadge`), usados
 * pela Ficha e pelo Design System (Estúdio › Selos de estado).
 */
export function TopBar({ embed = false }: { embed?: boolean }) {
  const t = useT();
  const boardId = useBoardStore((s) => s.boardId);
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  if (embed) {
    return (
      <div className="pointer-events-none absolute start-2 end-2 top-2 z-40 flex items-start justify-between">
        <div className="od-panel pointer-events-auto flex h-11 items-center gap-2 px-3">
          <Logo markSize={20} />
          <span className="mx-1 h-5 w-px bg-line" />
          <span className="max-w-[240px] truncate text-sm font-semibold text-ink">{meta?.name ?? t('board.topBar.board')}</span>
        </div>
        <a href={`${window.location.pathname}#/board/${boardId}`} target="_blank" rel="noreferrer" className="od-btn od-btn-primary pointer-events-auto h-11 rounded-xl">{t('board.topBar.openLudraw')}{' '}<ArrowUpRight size={16} />
        </a>
      </div>
    );
  }
  return null;
}

/** Estado de salvamento (local-first): "Salvando…" entre a alteração e o autosave; depois "Salvo". */
/** Chat 07 · B: no Modo Servidor o selo mostra o envio ao servidor (salvo, enviando, sem conexão, conflito, recusado). */
function ServerSaveStatus({ boardId, dirty, compact }: { boardId: string; dirty: boolean; compact?: boolean }) {
  const live = useCollabSession();
  const [status, setStatus] = useState<SyncStatus>(() => serverBoardRepository?.statusOf(boardId) ?? 'saved');
  useEffect(() => {
    setStatus(serverBoardRepository?.statusOf(boardId) ?? 'saved');
    return serverBoardRepository?.onSyncStatus((id, s) => id === boardId && setStatus(s));
  }, [boardId]);
  // Chat 08: com a edição ao vivo o selo mostra o WebSocket (ao vivo, sincronizando, sem conexão, somente leitura)
  if (live && live.boardId === boardId) return <LiveBadge status={live.status} compact={compact} />;
  return <SyncBadge status={status === 'saved' && dirty ? 'saving' : status} compact={compact} />;
}

/** Selo da edição ao vivo (Chat 08). */
/** `compact` (Estúdio v2): o rótulo some abaixo de 1180 px (fica o ponto). */
export function LiveBadge({ status, compact }: { status: CollabStatus; compact?: boolean }) {
  const t = useT();
  const label = { connecting: t('collab.status.connecting'), live: t('collab.status.live'), offline: t('collab.status.offline'), syncing: t('collab.status.syncing'), readOnly: t('collab.status.readOnly') }[status];
  const dot = { connecting: 'animate-pulse bg-warning', live: 'bg-success', offline: 'bg-warning', syncing: 'animate-pulse bg-warning', readOnly: 'bg-ink-subtle' }[status];
  return (
    <Tooltip label={label} side="bottom">
      <span role="status" aria-live="polite" className="ms-1.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-semibold text-ink-subtle">
        <span className={cn('h-2 w-2 rounded-full transition-colors duration-base', dot)} />
        <span className={compact ? 'hidden max-w-[110px] truncate whitespace-nowrap min-[1180px]:inline' : 'hidden min-[1100px]:inline'}>{compact && status === 'offline' ? t('studio.statusOfflineShort') : label}</span>
      </span>
    </Tooltip>
  );
}

/** Selo do envio ao servidor (também usado no Design System › Estúdio › Selos de estado). */
export function SyncBadge({ status: shown, compact }: { status: SyncStatus; compact?: boolean }) {
  const t = useT();
  const label = { saved: t('server.client.syncSaved'), saving: t('server.client.syncSaving'), offline: t('server.client.syncOffline'), conflict: t('server.client.syncConflict'), denied: t('server.client.syncDenied') }[shown];
  const dot = { saved: 'bg-success', saving: 'animate-pulse bg-warning', offline: 'bg-warning', conflict: 'bg-danger', denied: 'bg-danger' }[shown];
  return (
    <Tooltip label={label} side="bottom">
      <span role="status" aria-live="polite" className="ms-1.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-semibold text-ink-subtle">
        <span className={cn('h-2 w-2 rounded-full transition-colors duration-base', dot)} />
        <span className={compact ? 'hidden max-w-[110px] truncate whitespace-nowrap min-[1180px]:inline' : 'hidden min-[1100px]:inline'}>{shown === 'saved' ? t('board.topBar.saved') : shown === 'saving' ? t('board.topBar.saving') : compact && shown === 'offline' ? t('studio.statusOfflineShort') : label}</span>
      </span>
    </Tooltip>
  );
}

/** Selo de estado (Ficha do Estúdio v2 usa `compact`). */
export function SaveStatus({ compact = false }: { compact?: boolean } = {}) {
  const t = useT();
  const boardId = useBoardStore((s) => s.boardId);
  const readOnly = useBoardStore((s) => s.readOnly);
  const savedAt = useAppStore((s) => s.boards.find((b) => b.id === boardId)?.updatedAt ?? 0);
  const [dirtyAt, setDirtyAt] = useState(0);

  useEffect(
    () =>
      useBoardStore.subscribe((s, prev) => {
        if (
          s.boardId &&
          s.boardId === prev.boardId &&
          (s.elements !== prev.elements ||
            s.elementOrder !== prev.elementOrder ||
            s.gridSettings !== prev.gridSettings ||
            s.backgroundColor !== prev.backgroundColor ||
            s.initialView !== prev.initialView ||
            s.boardTags !== prev.boardTags ||
            s.activityLog !== prev.activityLog ||
            s.facilitation !== prev.facilitation)
        ) {
          setDirtyAt(Date.now());
        }
      }),
    [],
  );

  if (readOnly) return null;
  if (serverBoardRepository && boardId) return <ServerSaveStatus boardId={boardId} dirty={dirtyAt > savedAt} compact={compact} />;
  const saving = dirtyAt > savedAt;
  return (
    <Tooltip label={saving ? t('board.topBar.savingThisDevice') : t('board.topBar.savedThisDeviceValue', { value: savedAt ? ` · ${formatDateTime(savedAt)}` : '' })} side="bottom">
      <span
        role="status"
        aria-live="polite"
        className="ms-1.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-semibold text-ink-subtle"
      >
        <span className={cn('h-2 w-2 rounded-full transition-colors duration-base', saving ? 'animate-pulse bg-warning' : 'bg-success')} />
        <span className={compact ? 'hidden max-w-[110px] truncate whitespace-nowrap min-[1180px]:inline' : 'hidden min-[1100px]:inline'}>{saving ? t('board.topBar.saving') : t('board.topBar.saved')}</span>
      </span>
    </Tooltip>
  );
}
