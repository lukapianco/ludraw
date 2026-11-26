/**
 * LuDraw — "Trazer boards deste navegador" (Chat 08.2 · A-1). No Modo Servidor, copia para a organização boards
 * criados no Modo Local DESTE navegador: escolher boards e destino (só lugares permitidos por `can()`), conferir os
 * limites (`checkBoardData`) antes de enviar, não duplicar (o servidor guarda quem trouxe) e manter as cópias locais.
 * Um board recusado (limites, permissão, duplicata) mostra o motivo na própria linha e não interrompe os outros.
 *
 * Em que difere do padrão de mercado: em vez de um assistente de migração em várias telas, é um único diálogo com a
 * lista do que existe NESTE navegador, o motivo de cada recusa na própria linha e o destino escolhido uma vez.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, HardDriveUpload, LoaderCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useViewer, useWorkspaceCan } from '../../hooks/useWorkspace';
import type { BoardData } from '../../types/canvas';
import type { BoardMeta } from '../../types/workspace';
import { api, ApiError } from '../../utils/api';
import { localBoardRepository } from '../../utils/boardRepository';
import { cn } from '../../utils/cn';
import { importedCopyOf, localBoardsFromPersisted, localImportProblem, objectCount, prepareLocalImport, unsafeCountOf, type LocalBoardEntry } from '../../utils/localImport';
import { LOCAL_APP_KEY, appStorageKey, isServerMode } from '../../utils/serverConfig';
import { canUsePlace, samePlace, teamProjects, visibleTeams, type Place } from '../../utils/workspace';
import { placeLabel } from '../../utils/workspaceDisplay';
import { formatRelativeDay } from '../../utils/format';
import { translateMessage } from '../../i18n';
import { useT } from '../../i18n/useT';
import { Modal } from '../ui/Modal';

/** Boards do Modo Local deste navegador (só os metadados; o conteúdo é lido na tela). */
export function readLocalBoards(): LocalBoardEntry[] {
  try {
    return localBoardsFromPersisted(localStorage.getItem(LOCAL_APP_KEY));
  } catch {
    return [];
  }
}

/** Quantos boards locais esta pessoa ainda não trouxe (para a faixa da Mesa). */
export function pendingLocalBoards(serverBoards: readonly BoardMeta[], userId: string | undefined): LocalBoardEntry[] {
  if (!isServerMode() || !api || !userId) return [];
  return readLocalBoards().filter((b) => !importedCopyOf(serverBoards, userId, b.id));
}

const dismissKey = () => `${appStorageKey()}:import-local-dismissed`;

/**
 * Faixa discreta da Mesa (só no Modo Servidor, só quando há boards locais ainda não trazidos e a pessoa pode criar
 * boards). "Agora não" esconde neste navegador; a entrada em Configurações → Perfil → Sessão continua.
 */
export function LocalImportBanner() {
  const t = useT();
  const boards = useAppStore((s) => s.boards);
  const userId = useAppStore((s) => s.user?.id);
  const openModal = useAppStore((s) => s.openModal);
  const canCreate = useWorkspaceCan('workspace.boards.create');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey()) === '1';
    } catch {
      return false;
    }
  });
  const pending = useMemo(() => pendingLocalBoards(boards, userId), [boards, userId]);
  if (dismissed || !canCreate.allowed || !pending.length) return null;
  return (
    <div role="status" data-testid="import-local-banner" className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[13px] text-ink ring-1 ring-line">
      <HardDriveUpload size={16} className="shrink-0 text-brand-800 dark:text-brand-200" />
      <span className="min-w-0 flex-1">{t('server.import.banner', { count: pending.length })}</span>
      <button type="button" className="od-btn od-btn-secondary od-btn-sm h-7" onClick={() => openModal({ type: 'import-local-boards' })}>
        {t('server.import.open')}
      </button>
      <button
        type="button"
        className="od-btn od-btn-ghost od-btn-sm h-7"
        onClick={() => {
          try {
            localStorage.setItem(dismissKey(), '1');
          } catch {
            /* só nesta sessão */
          }
          setDismissed(true);
        }}
      >
        {t('server.import.bannerDismiss')}
      </button>
    </div>
  );
}

type RowState ={ kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'failed'; reason: string };

interface Row extends LocalBoardEntry {
  data: BoardData | null;
  objects: number;
  /** motivo para não poder ir (limites ou conteúdo ilegível) */
  blocked: string | null;
}

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-ink-muted';

export function ImportLocalBoardsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const viewer = useViewer();
  const canCreate = useWorkspaceCan('workspace.boards.create');
  const me = s.user?.id ?? '';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState<Place>({ kind: 'personal' });

  // lê o conteúdo de cada board local (IndexedDB do Modo Local) e confere os limites antes de oferecer
  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = readLocalBoards();
      const out: Row[] = [];
      for (const b of list) {
        const data = await localBoardRepository.loadBoard(b.id).catch(() => null);
        const problem = localImportProblem(data, { id: me });
        out.push({ ...b, data, objects: objectCount(data), blocked: problem ? translateMessage(problem) : null });
      }
      if (!alive) return;
      setRows(out);
      setSelected(new Set(out.filter((r) => !r.blocked && !importedCopyOf(useAppStore.getState().boards, me, r.id)).map((r) => r.id)));
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  const teams = visibleTeams(viewer, s.teams);
  const places = useMemo(() => {
    const all: { place: Place; label: string }[] = [
      { place: { kind: 'personal' }, label: placeLabel({ kind: 'personal' }, s) },
      { place: { kind: 'workspace' }, label: placeLabel({ kind: 'workspace' }, s) },
      ...teams.flatMap((tm) => [
        { place: { kind: 'team', teamId: tm.id } as Place, label: tm.name },
        ...teamProjects(tm.id, s.projects).map((p) => ({ place: { kind: 'team', teamId: tm.id, projectId: p.id } as Place, label: `${tm.name} › ${p.name}` })),
      ]),
    ];
    return all.filter((o) => canUsePlace(viewer, o.place, s.teams, s.projects));
  }, [s, teams, viewer]);

  // destino sempre entre os lugares permitidos (ex.: convidado sem Espaço pessoal)
  useEffect(() => {
    if (places.length && !places.some((o) => samePlace(o.place, target))) setTarget(places[0].place);
  }, [places, target]);

  const available = (r: Row) => !r.blocked && !importedCopyOf(s.boards, me, r.id) && status[r.id]?.kind !== 'done';
  const chosen = (rows ?? []).filter((r) => selected.has(r.id) && available(r));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const done = Object.values(status).filter((x) => x.kind === 'done' || x.kind === 'failed').length;

  const run = async () => {
    if (!api || !canCreate.allowed || !chosen.length) return;
    setRunning(true);
    let ok = 0;
    let failed = 0;
    let cleaned = 0;
    for (const r of chosen) {
      setStatus((cur) => ({ ...cur, [r.id]: { kind: 'sending' } }));
      try {
        await api.createBoard({ name: r.name, place: target, data: prepareLocalImport(r.data!, { id: me }), importFrom: { kind: 'local', sourceId: r.id } });
        ok += 1;
        cleaned += unsafeCountOf(r.data);
        setStatus((cur) => ({ ...cur, [r.id]: { kind: 'done' } }));
      } catch (e) {
        // um board recusado não interrompe os outros: o motivo fica na linha dele
        failed += 1;
        const reason = e instanceof ApiError ? e.text() : t('server.errors.internal');
        setStatus((cur) => ({ ...cur, [r.id]: { kind: 'failed', reason } }));
      }
    }
    const { hydrateFromServer } = await import('../../utils/serverSync');
    await hydrateFromServer();
    setRunning(false);
    setSelected(new Set());
    if (ok) s.toast(t('server.import.summary', { count: ok }), 'success');
    if (failed) s.toast(t('server.import.summaryFailed', { count: failed }), 'danger');
    if (cleaned) s.toast(t('importexport.safety.removed', { count: cleaned }), 'neutral');
  };

  const allAvailable = (rows ?? []).filter(available);
  return (
    <Modal
      open
      onClose={() => !running && onClose()}
      width={520}
      icon={<HardDriveUpload size={20} />}
      title={t('server.import.title')}
      description={t('server.import.description')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" disabled={running} onClick={onClose}>{t('common.close')}</button>
          <button type="button" data-testid="import-local-confirm" className="od-btn od-btn-primary" disabled={running || !chosen.length || !canCreate.allowed} onClick={() => void run()}>
            {running ? <LoaderCircle size={16} className="animate-spin" /> : <HardDriveUpload size={16} />}
            {running ? t('server.import.working', { done, total: chosen.length || done }) : t('server.import.confirm', { count: chosen.length })}
          </button>
        </>
      }
    >
      {!canCreate.allowed && <p className="mb-3 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">{canCreate.reason}</p>}
      {!rows ? (
        <p className="flex items-center gap-2 py-6 text-sm text-ink-muted"><LoaderCircle size={16} className="animate-spin" /> {t('server.import.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-panel-sunken px-3.5 py-4 text-sm text-ink-muted">{t('server.import.empty')}</p>
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={fieldLabel + ' mb-0'}>{t('server.import.boards')}</span>
            {allAvailable.length > 0 && (
              <button
                type="button"
                className="od-btn od-btn-ghost od-btn-sm h-7"
                disabled={running}
                onClick={() => setSelected(chosen.length === allAvailable.length ? new Set() : new Set(allAvailable.map((r) => r.id)))}
              >
                {chosen.length === allAvailable.length ? t('server.import.clearAll') : t('server.import.selectAll')}
              </button>
            )}
          </div>
          <ul data-testid="import-local-list" className="-mx-1 max-h-[38vh] space-y-0.5 overflow-y-auto px-1">
            {rows.map((r) => {
              const copy = importedCopyOf(s.boards, me, r.id);
              const st = status[r.id] ?? { kind: 'idle' };
              const can = available(r);
              return (
                <li key={r.id} data-local-board={r.id}>
                  <label className={cn('flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors', can ? 'cursor-pointer hover:bg-panel-hover' : 'cursor-default opacity-90')}>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--od-selection)]"
                      checked={can && selected.has(r.id)}
                      disabled={!can || running}
                      onChange={() => toggle(r.id)}
                      aria-describedby={`od-import-${r.id}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink" title={r.name}>{r.name}</span>
                      <span id={`od-import-${r.id}`} className="block text-xs text-ink-subtle">
                        {t('server.import.objects', { count: r.objects })} · {t('server.import.edited', { when: formatRelativeDay(r.updatedAt) })}
                      </span>
                      {r.blocked && <span className="mt-0.5 block text-xs text-danger">{t('server.import.blocked', { reason: r.blocked })}</span>}
                      {st.kind === 'failed' && <span data-import-failed className="mt-0.5 block text-xs text-danger">{t('server.import.statusFailed', { reason: st.reason })}</span>}
                    </span>
                    {st.kind === 'sending' && <LoaderCircle size={15} className="mt-0.5 animate-spin text-ink-subtle" />}
                    {(st.kind === 'done' || (copy && st.kind === 'idle')) && (
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-ink">
                        <Check size={12} /> {st.kind === 'done' ? t('server.import.statusDone') : t('server.import.already')}
                      </span>
                    )}
                    {st.kind === 'failed' && <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" />}
                  </label>
                </li>
              );
            })}
          </ul>
          <label className="mt-4 block">
            <span className={fieldLabel}>{t('server.import.destination')}</span>
            <select
              className="od-input"
              data-testid="import-local-destination"
              value={JSON.stringify(target)}
              disabled={running}
              onChange={(e) => setTarget(JSON.parse(e.target.value) as Place)}
            >
              {places.map((o) => (
                <option key={JSON.stringify(o.place)} value={JSON.stringify(o.place)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-xs text-ink-subtle">{t('server.import.authorship')}</p>
        </>
      )}
    </Modal>
  );
}
