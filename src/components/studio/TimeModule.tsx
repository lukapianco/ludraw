/**
 * LuDraw — módulo Tempo e linha do tempo (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.4 e §7).
 *  Tempo (base direita): desfazer · refazer · Tempo (ampulheta → linha do tempo). Some com "Módulo Tempo" desligado.
 *  Linha do tempo (620 px, acima da Dock): barras de atividade por intervalo (Activity Log), pontos = versões salvas,
 *  controle que ENCAIXA nas versões (não reconstrói estados intermediários). Escolher um ponto abre a prévia somente
 *  leitura (`VersionPreviewLayer`, sem tocar o `useBoardStore`). Ações: "Restaurar esta versão" e "Excluir versão"
 *  (`board.restoreSnapshot`, mesmo fluxo de antes), "Ver eventos" (o antigo Activity Log, daquele intervalo),
 *  "Salvar versão agora" (`board.edit`). Local e servidor: as versões vêm do `boardRepository` (no servidor, já com a
 *  redação de notas privadas e votos).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { isCompact, useModuleFit } from './useModuleFit';
import { Bookmark, ListTree, Redo2, RotateCcw, Save, ShieldCheck, Undo2 } from 'lucide-react';
import type { BoardSnapshot } from '../../types/workspace';
import { selectCanRedo, selectCanUndo, useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { policiesOf } from '../../store/workspaceSlice';
import { boardRepository } from '../../utils/boardRepository';
import { deleteSnapshot, onSnapshotsChanged, restoreSnapshot, saveManualSnapshot, snapshotLabelMessage } from '../../utils/versionHistory';
import { useCan } from '../../hooks/useCan';
import { cn } from '../../utils/cn';
import { translateStored } from '../../i18n';
import { formatDateTime } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { Tooltip } from '../ui/Tooltip';
import { handleToolbarKeys } from '../board/rovingFocus';
import { HourglassIcon, TrashIcon } from '../icons/od';
import { StudioDrawer, useDrawerTrigger } from './StudioDrawer';
import { useStudioUi } from './studioUi';
import { ActivityTab } from './boardPanels';

const BUCKETS = 40;

export function TimeModule() {
  const t = useT();
  const canUndo = useBoardStore(selectCanUndo);
  const canRedo = useBoardStore(selectCanRedo);
  const readOnly = useBoardStore((s) => s.readOnly);
  const show = useAppStore((s) => s.preferences.showUndoRedo);
  const previewing = useStudioUi((s) => !!s.previewSnapshotId);
  const timeline = useDrawerTrigger('timeline');
  const b = useBoardStore.getState;
  const ref = useRef<HTMLDivElement>(null);
  // Chat 08.2 · C-1: medido contra a Dock (não só pela largura da janela)
  const fit = useModuleFit('time', ref);
  if (!show) return null;
  return (
    <div ref={ref} data-fit={fit} role="toolbar" aria-label={t('studio.time.title')} data-studio-region="time" data-studio-module="time" onKeyDown={handleToolbarKeys} className={cn('od-panel pointer-events-auto absolute end-4 z-[47] flex h-11 items-center gap-0.5 rounded-xl px-1 shadow-panel', fit === 'lifted' ? 'bottom-[72px]' : 'bottom-4')}>
      <Tooltip label={t('board.bottomZoomBar.undo')} shortcut="Ctrl Z" side="top">
        <button type="button" className="od-tool h-[34px] w-[34px]" disabled={!canUndo || readOnly || previewing} onClick={() => b().undo()} aria-label={t('board.bottomZoomBar.undo')}>
          <Undo2 size={17} />
        </button>
      </Tooltip>
      <Tooltip label={t('board.bottomZoomBar.redo')} shortcut="Ctrl Y" side="top">
        <button type="button" className={cn('od-tool h-[34px] w-[34px]', isCompact(fit) && 'hidden')} disabled={!canRedo || readOnly || previewing} onClick={() => b().redo()} aria-label={t('board.bottomZoomBar.redo')}>
          <Redo2 size={17} />
        </button>
      </Tooltip>
      <span className="od-divider-v mx-0.5" />
      <Tooltip label={t('studio.time.timeline')} side="top">
        <button type="button" {...timeline} data-testid="studio-time" className="od-tool h-[34px] w-auto gap-1.5 px-2" aria-label={t('studio.time.timeline')}>
          <HourglassIcon size={18} />
          <span className={cn('whitespace-nowrap text-[13px] font-semibold', fit !== 'full' && 'hidden')}>{t('studio.time.title')}</span>
        </button>
      </Tooltip>
    </div>
  );
}

/** Versões do board (mais nova primeiro), recarregadas quando mudam. */
function useSnapshots(boardId: string | null, active: boolean): BoardSnapshot[] | null {
  const [list, setList] = useState<BoardSnapshot[] | null>(null);
  useEffect(() => {
    if (!active || !boardId) return;
    let alive = true;
    const load = () => void boardRepository.listSnapshots(boardId).then((l) => alive && setList(l));
    load();
    const off = onSnapshotsChanged((id) => id === boardId && load());
    return () => {
      alive = false;
      off();
    };
  }, [boardId, active]);
  return list;
}

export function TimelineDrawer() {
  const t = useT();
  const boardId = useBoardStore((s) => s.boardId);
  const log = useBoardStore((s) => s.activityLog);
  const policies = useAppStore((s) => policiesOf(s));
  const canRestore = useCan('board.restoreSnapshot');
  const canEdit = useCan('board.edit');
  const previewId = useStudioUi((s) => s.previewSnapshotId);
  const setPreview = useStudioUi((s) => s.setPreview);
  const snapshots = useSnapshots(boardId, true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState(false);
  const [armed, setArmed] = useState<'restore' | 'delete' | null>(null);
  const [now] = useState(() => Date.now());

  // ao fechar a gaveta a prévia termina (o board volta ao agora)
  useEffect(() => () => useStudioUi.getState().setPreview(null), []);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  const sorted = useMemo(() => [...(snapshots ?? [])].sort((a, b) => a.createdAt - b.createdAt), [snapshots]);
  const start = Math.min(now - 60 * 60_000, sorted[0]?.createdAt ?? now, ...log.map((e) => e.timestamp));
  const span = Math.max(1, now - start);
  const pos = (ts: number) => Math.min(100, Math.max(0, ((ts - start) / span) * 100));
  const bars = useMemo(() => {
    const out = new Array<number>(BUCKETS).fill(0);
    for (const e of log) out[Math.min(BUCKETS - 1, Math.floor(((e.timestamp - start) / span) * BUCKETS))] += Math.max(1, e.targetCount ?? 1);
    return out;
  }, [log, start, span]);
  const maxBar = Math.max(1, ...bars);
  const index = previewId ? sorted.findIndex((s) => s.id === previewId) : sorted.length;
  const current = index >= 0 && index < sorted.length ? sorted[index] : null;
  const range = current ? { from: current.createdAt, to: sorted[index + 1]?.createdAt ?? now } : undefined;

  const choose = (i: number) => {
    setArmed(null);
    const v = i >= sorted.length ? null : sorted[i];
    setPreview(v ? { id: v.id, createdAt: v.createdAt, data: v.data } : null);
  };
  const saveNow = async () => {
    setBusy(true);
    const snap = await saveManualSnapshot(name || t('history.defaultName'));
    setBusy(false);
    if (snap) {
      setName('');
      useAppStore.getState().toast(t('history.saved'), 'success');
    }
  };
  const restore = async () => {
    if (!current) return;
    if (armed !== 'restore') return setArmed('restore');
    setArmed(null);
    const ok = await restoreSnapshot(current);
    if (ok) {
      setPreview(null);
      useAppStore.getState().toast(t('history.restored'), 'success', { detail: t('history.restoredDetail') });
    }
  };
  const remove = async () => {
    if (!current) return;
    if (armed !== 'delete') return setArmed('delete');
    setArmed(null);
    setPreview(null);
    await deleteSnapshot(current);
  };

  return (
    <StudioDrawer
      id="timeline"
      title={t('studio.time.timeline')}
      width={620}
      from="bottom"
      align="end"
      headerExtra={<span className="shrink-0 text-xs text-ink-subtle">{t('studio.time.counts', { versions: sorted.length, events: log.length })}</span>}
      footer={t('history.policyNote', { minutes: policies.autoSnapshotIntervalMin, count: policies.snapshotRetentionDays })}
    >
      <div className="p-4" data-testid="timeline">
        {/* faixa: barras de atividade + pontos das versões + "agora" */}
        <div className="relative h-16 rounded-lg bg-panel-sunken ring-1 ring-line" aria-hidden="true">
          <div className="absolute inset-x-2 bottom-2 top-5 flex items-end gap-[2px]">
            {bars.map((n, i) => (
              <span key={i} className="flex-1 rounded-t-[2px] bg-[var(--od-selection)] opacity-40" style={{ height: `${n ? Math.max(8, (n / maxBar) * 100) : 0}%` }} />
            ))}
          </div>
          {sorted.map((s, i) => (
            <span
              key={s.id}
              className={cn('absolute top-1.5 h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-[var(--od-panel)]', s.kind === 'safety' ? 'bg-warning' : 'bg-accent', i === index && 'scale-125 ring-[var(--od-selection)]')}
              style={{ left: `calc(8px + (100% - 16px) * ${pos(s.createdAt) / 100})` }}
            />
          ))}
          <span className="absolute end-1.5 top-1 text-2xs font-semibold text-ink-subtle">{t('studio.time.now')}</span>
        </div>
        {/* controle: encaixa nas versões existentes; o último passo é "agora" */}
        <input
          type="range"
          min={0}
          max={sorted.length}
          step={1}
          value={index < 0 ? sorted.length : index}
          onChange={(e) => choose(Number(e.target.value))}
          disabled={!sorted.length}
          aria-label={t('studio.time.scrub')}
          aria-valuetext={current ? formatDateTime(current.createdAt) : t('studio.time.now')}
          data-testid="timeline-scrub"
          className="mt-2 w-full accent-[var(--od-selection)]"
        />
        {/* lista curta das versões (teclado e leitores de tela) */}
        <div className="mt-2 flex max-h-[120px] flex-wrap gap-1.5 overflow-y-auto">
          {sorted.length === 0 && <p className="text-xs text-ink-muted">{snapshots === null ? t('history.loading') : t('history.empty')}</p>}
          {sorted.map((s, i) => (
            <button
              key={s.id}
              type="button"
              data-version={s.id}
              aria-pressed={i === index}
              onClick={() => choose(i === index ? sorted.length : i)}
              className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ring-1', i === index ? 'bg-accent-soft font-semibold text-ink ring-[var(--od-selection)]' : 'text-ink-muted ring-line hover:bg-panel-hover')}
              title={`${translateStored(snapshotLabelMessage(s))} · ${s.elementCount}`}
            >
              {s.kind === 'safety' ? <ShieldCheck size={12} className="text-warning" /> : s.kind === 'manual' ? <Bookmark size={12} /> : null}
              {formatDateTime(s.createdAt)}
            </button>
          ))}
        </div>

        {/* ações */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {current ? (
            <>
              <button type="button" data-testid="timeline-restore" className={cn('od-btn od-btn-sm h-8', armed === 'restore' ? 'od-btn-danger' : 'od-btn-primary')} disabled={!canRestore.allowed} title={canRestore.allowed ? undefined : canRestore.reason} onClick={() => void restore()}>
                <RotateCcw size={14} /> {armed === 'restore' ? t('history.confirmRestore') : t('studio.time.restore')}
              </button>
              <button type="button" data-testid="timeline-delete" className={cn('od-btn od-btn-sm h-8', armed === 'delete' ? 'od-btn-danger' : 'od-btn-ghost text-danger')} disabled={!canRestore.allowed} title={canRestore.allowed ? undefined : canRestore.reason} onClick={() => void remove()}>
                <TrashIcon size={14} /> {armed === 'delete' ? t('admin.common.confirm') : t('studio.time.deleteVersion')}
              </button>
            </>
          ) : (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveNow()} placeholder={t('history.namePlaceholder')} aria-label={t('history.namePlaceholder')} className="od-input h-8 min-w-0 flex-1 text-[13px]" disabled={!canEdit.allowed} />
              <button type="button" className="od-btn od-btn-secondary od-btn-sm h-8" disabled={busy || !canEdit.allowed} title={canEdit.allowed ? undefined : canEdit.reason} onClick={() => void saveNow()}>
                <Save size={14} /> {t('history.saveNow')}
              </button>
            </>
          )}
          <button type="button" aria-pressed={events} className={cn('od-btn od-btn-sm ms-auto h-8', events ? 'od-btn-soft' : 'od-btn-ghost')} onClick={() => setEvents((v) => !v)}>
            <ListTree size={14} /> {t('studio.time.events')}
          </button>
        </div>
        {events && (
          <div className="mt-3 max-h-[260px] overflow-y-auto rounded-lg ring-1 ring-line" data-testid="timeline-events">
            <ActivityTab range={range} />
          </div>
        )}
      </div>
    </StudioDrawer>
  );
}
