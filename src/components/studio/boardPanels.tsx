/**
 * LuDraw — conteúdo reaproveitado das antigas abas do Painel (Chat 08.2 · B): Frames (base do Roteiro), Atividades
 * (base do "Ver eventos" da linha do tempo) e Tags (gaveta "Tags do board"). Mesma lógica e mesmas permissões.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Crosshair, EyeOff, Play, Plus, Tags } from 'lucide-react';
import { FrameIcon, HourglassIcon, PencilIcon, TrashIcon } from '../icons/od';

import { useBoardStore } from '../../store/useBoardStore';
import { notify } from '../../store/useAppStore';

import type { BoardActivityAction, BoardActivityEntry, StickyTag } from '../../types/canvas';
import { ACTION_LABELS, activityText, relativeTime } from '../../utils/activity';
import { colorFromString } from '../../utils/color';
import { WORKSPACE_ROLE_LABEL_KEYS } from '../../utils/permissions';
import { useCan } from '../../hooks/useCan';
import { nextTagColor, TAG_COLORS, tagTextColor } from '../../utils/stickyMeta';
import { startPresentation } from '../../utils/boardActions';
import { orderedFrames } from '../../utils/frames';
import { cn } from '../../utils/cn';
import { formatDateTime, initials } from '../../utils/format';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';
import { personLabel } from '../../utils/storedNames';

/**
 * Aba Frames (Chat 03 · Rodada B): índice dos slides na ordem de apresentação (`slideOrder`).
 * Clicar viaja até o frame; arrastar (ou ↑/↓ com o item focado, ou os botões) reordena;
 * "Apresentar" começa do primeiro slide.
 */
export function FramesTab() {
  const t = useT();
  const elements = useBoardStore((s) => s.elements);
  const order = useBoardStore((s) => s.elementOrder);
  const frames = useMemo(() => orderedFrames(elements, order), [elements, order]);
  const edit = useCan('board.edit');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= frames.length) return;
    const ids = frames.map((f) => f.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    useBoardStore.getState().setSlideOrder(ids);
  };

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-brand-900 dark:text-brand-200">
          <FrameIcon size={20} />
        </span>
        <div className="mt-3 text-sm font-semibold text-ink">{t('board.boardSidebar.noFramesThisBoard')}</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted"><Trans k="board.boardSidebar.pressFDragBoardUse" components={{ kbd: (c) => <span className="od-kbd">{c}</span> }} /></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-2.5 py-3">
      <div className="mb-2 flex items-center justify-between px-1.5">
        <span className="text-xs text-ink-subtle">{frames.length === 1 ? t('board.boardSidebar.n1Slide') : `${frames.length} slides`}{' '}{t('board.boardSidebar.dragReorder')}</span>
        <button type="button" className="od-btn od-btn-sm od-btn-soft" onClick={() => startPresentation(frames[0].id)}>
          <Play size={13} className="fill-current" />{' '}{t('board.boardSidebar.present')}</button>
      </div>
      <ol className="flex flex-col" aria-label={t('board.boardSidebar.slideOrder')}>
        {frames.map((f, i) => (
          <li
            key={f.id}
            draggable={edit.allowed}
            onDragStart={(e) => {
              setDragId(f.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', f.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverIndex(i);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = frames.findIndex((x) => x.id === dragId);
              if (from >= 0) move(from, i);
              setDragId(null);
              setOverIndex(null);
            }}
            className={cn(
              'group/frame relative rounded-lg',
              dragId === f.id && 'opacity-50',
              overIndex === i && dragId !== f.id && 'shadow-[inset_0_2px_0_var(--od-selection)]',
            )}
          >
            <button
              type="button"
              className="od-menu-item pe-14"
              onClick={() => {
                const s = useBoardStore.getState();
                s.setSelectedIds([f.id]);
                s.zoomToElement(f.id);
              }}
              onKeyDown={(e) => {
                if (!edit.allowed || !e.altKey) return;
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(i, i - 1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(i, i + 1);
                }
              }}
              title={edit.allowed ? t('board.boardSidebar.clickGoFrameAltReorders') : t('board.boardSidebar.clickGoFrame')}
            >
              <span className="w-5 text-end text-xs tabular-nums text-ink-subtle">{i + 1}</span>
              <span className="h-4 w-4 shrink-0 rounded-[4px] ring-1 ring-line-strong" style={{ background: f.fillColor }} />
              <span className="flex-1 truncate">{f.title || t('common.untitledFrame')}</span>
              {f.hiddenContent && <EyeOff size={14} className="text-ink-subtle" aria-label={t('board.boardSidebar.hiddenContent')} />}
            </button>
            <span className="absolute end-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
              {edit.allowed && frames.length > 1 && (
                <span className="flex gap-0.5 opacity-0 transition-opacity duration-fast group-focus-within/frame:opacity-100 group-hover/frame:opacity-100">
                  <button type="button" className="od-tool h-6 w-6" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={t('board.boardSidebar.moveTitleUp', { title: f.title })}>
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" className="od-tool h-6 w-6" disabled={i === frames.length - 1} onClick={() => move(i, i + 1)} aria-label={t('board.boardSidebar.moveTitleDown', { title: f.title })}>
                    <ChevronDown size={14} />
                  </button>
                </span>
              )}
              {/* Chat 08.2 (Roteiro): apresentar a partir deste frame */}
              <button type="button" data-present-from={f.id} className="od-tool h-6 w-6" onClick={() => startPresentation(f.id)} aria-label={t('studio.script.presentFrom', { title: f.title || t('common.untitledFrame') })}>
                <Play size={12} className="fill-current" />
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Aba Atividades (Activity Log B2B): quem criou, editou, moveu, bloqueou, excluiu ou revelou,
 * com agrupamento de 8 s, filtro por autor e ação e clique que foca os objetos na câmera.
 */
/** `range` (linha do tempo → "Ver eventos"): só os eventos daquele intervalo. */
export function ActivityTab({ range }: { range?: { from: number; to: number } } = {}) {
  const t = useT();
  const fullLog = useBoardStore((s) => s.activityLog);
  const log = useMemo(() => (range ? fullLog.filter((e) => (e.lastTimestamp ?? e.timestamp) >= range.from && e.timestamp <= range.to) : fullLog), [fullLog, range]);
  const clearPerm = useCan('board.clearActivityLog');
  const [actor, setActor] = useState<string>('all');
  const [action, setAction] = useState<BoardActivityAction | 'all'>('all');
  const [, setTick] = useState(0);
  const [confirm, setConfirm] = useState(false);

  // Atualiza os horários relativos a cada 30 s
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of log) map.set(e.actorId, e.actorName);
    return Array.from(map.entries());
  }, [log]);
  const actions = useMemo(() => Array.from(new Set(log.map((e) => e.action))), [log]);
  const entries = useMemo(
    () => [...log].reverse().filter((e) => (actor === 'all' || e.actorId === actor) && (action === 'all' || e.action === action)),
    [log, actor, action],
  );

  const focus = (e: BoardActivityEntry) => {
    const s = useBoardStore.getState();
    const ids = (e.elementIds ?? []).filter((id) => !!s.elements[id]);
    if (ids.length === 0) {
      notify(e.elementIds?.length ? t('board.boardSidebar.theseObjectsAreNoLonger') : t('board.boardSidebar.thisActivityDoesntPointAny'), 'neutral');
      return;
    }
    s.setSelectedIds(ids);
    s.zoomToFit(ids);
  };

  return (
    <div className="flex flex-col px-2.5 py-3">
      <div className="mb-2 flex gap-1.5 px-0.5">
        <select className="od-input h-8 min-w-0 flex-1 px-2 text-[12.5px]" value={actor} onChange={(e) => setActor(e.target.value)} aria-label={t('board.boardSidebar.filterAuthor')}>
          <option value="all">{t('board.boardSidebar.everyone')}</option>
          {actors.map(([id, name]) => (
            <option key={id} value={id}>
              {personLabel(name)}
            </option>
          ))}
        </select>
        <select className="od-input h-8 min-w-0 flex-1 px-2 text-[12.5px]" value={action} onChange={(e) => setAction(e.target.value as BoardActivityAction | 'all')} aria-label={t('board.boardSidebar.filterAction')}>
          <option value="all">{t('board.boardSidebar.allActions')}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-brand-900 dark:text-brand-200">
            <HourglassIcon size={20} />
          </span>
          <div className="mt-3 text-sm font-semibold text-ink">{log.length ? t('board.boardSidebar.nothingMatchesTheseFilters') : t('board.boardSidebar.noActivityYet')}</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t('board.boardSidebar.creationsEditsMovesLocksDeletions')}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {entries.map((e) => (
            <li key={e.id}>
              <button type="button" className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-2 text-start transition-colors hover:bg-panel-hover" onClick={() => focus(e)} title={e.elementIds?.length ? t('board.boardSidebar.focusTheseObjects') : undefined}>
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: colorFromString(e.actorName) }}>
                  {initials(personLabel(e.actorName).replace(/\s+como .*$/, ''))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug text-ink">{activityText(e)}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-subtle">
                    <span title={formatDateTime(e.lastTimestamp ?? e.timestamp)}>{relativeTime(e.lastTimestamp ?? e.timestamp)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{WORKSPACE_ROLE_LABEL_KEYS[e.actorRole] ? t(WORKSPACE_ROLE_LABEL_KEYS[e.actorRole]) : e.actorRole}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {log.length > 0 && (
        <div className="mt-3 border-t border-line px-1 pt-3">
          {confirm ? (
            <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-2.5 py-2 text-xs text-ink">
              <span className="flex-1">{t('board.boardSidebar.deleteCountLogEntries', { count: log.length })}</span>
              <button
                type="button"
                className="od-btn od-btn-danger od-btn-sm h-7 px-2"
                onClick={() => {
                  useBoardStore.getState().clearActivityLog();
                  setConfirm(false);
                }}
              >{t('board.boardSidebar.clear')}</button>
              <button type="button" className="od-btn od-btn-ghost od-btn-sm h-7 px-2" onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
            </div>
          ) : (
            <button
              type="button"
              className="od-btn od-btn-ghost od-btn-sm w-full text-ink-muted"
              title={clearPerm.allowed ? undefined : clearPerm.reason}
              onClick={() => (clearPerm.allowed ? setConfirm(true) : useBoardStore.getState().clearActivityLog())}
            >
              <TrashIcon size={14} />{' '}{t('board.boardSidebar.clearLog')}{' '}{clearPerm.allowed ? '' : t('board.boardSidebar.ownerAdminOnly')}
            </button>
          )}
          <p className="mt-2 text-center text-[11px] text-ink-subtle">{t('board.boardSidebar.weKeepValueMostRecent', { value: 200 })}</p>
        </div>
      )}
    </div>
  );
}

/** Aba Tags: cria, renomeia, recolore e exclui as tags do board; seleciona os post-its de cada tag. */
export function TagsTab() {
  const t = useT();
  const boardTags = useBoardStore((s) => s.boardTags);
  const elements = useBoardStore((s) => s.elements);
  const canEdit = useCan('board.edit').allowed;
  const readOnly = useBoardStore((s) => s.readOnly) || !canEdit;
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const newColor = color ?? nextTagColor(boardTags);

  const counts = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const el of Object.values(elements)) {
      if (el.type !== 'sticky') continue;
      for (const t of el.tags ?? []) map.set(t.id, [...(map.get(t.id) ?? []), el.id]);
    }
    return map;
  }, [elements]);

  const create = () => {
    const tag = useBoardStore.getState().createBoardTag(label, newColor);
    if (tag) {
      setLabel('');
      setColor(null);
    }
  };

  return (
    <div className="flex flex-col px-2.5 py-3">
      {!readOnly && (
        <form
          className="mb-2 flex items-center gap-1.5 px-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <button
            type="button"
            className="h-7 w-7 shrink-0 rounded-full ring-2 ring-[var(--od-panel)] transition-transform duration-base hover:scale-110"
            style={{ background: newColor, boxShadow: '0 0 0 1px var(--od-border-strong)' }}
            onClick={() => setColor(TAG_COLORS[(TAG_COLORS.indexOf(newColor) + 1) % TAG_COLORS.length])}
            title={t('board.boardSidebar.changeNewTagsColor')}
            aria-label={t('board.boardSidebar.changeNewTagsColor')}
          />
          <input
            className="od-input h-8 min-w-0 flex-1 text-[13px]"
            placeholder={t('board.boardSidebar.newTag')}
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={t('board.boardSidebar.newTagName')}
          />
          <button type="submit" className="od-btn od-btn-soft od-btn-sm h-8 px-2.5" disabled={!label.trim()}>
            <Plus size={15} />{' '}{t('board.boardSidebar.create')}</button>
        </form>
      )}

      {boardTags.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-brand-900 dark:text-brand-200">
            <Tags size={20} />
          </span>
          <div className="mt-3 text-sm font-semibold text-ink">{t('board.boardSidebar.noTagsYet')}</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t('board.boardSidebar.createTagsHereStickyNotes')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {boardTags.map((t) => (
            <TagRow key={t.id} tag={t} stickyIds={counts.get(t.id) ?? []} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TagRow({ tag, stickyIds, readOnly }: { tag: StickyTag; stickyIds: string[]; readOnly: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.label);
  const [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const b = useBoardStore.getState;

  const commit = () => {
    if (draft.trim() && draft.trim() !== tag.label) b().updateBoardTag(tag.id, { label: draft });
    setEditing(false);
  };

  return (
    <li className="rounded-lg">
      <div className="group flex min-h-[38px] items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-panel-hover">
        <button
          type="button"
          className="h-5 w-5 shrink-0 rounded-full transition-transform duration-base hover:scale-110 disabled:hover:scale-100"
          style={{ background: tag.color, boxShadow: '0 0 0 1px var(--od-border-strong)' }}
          onClick={() => setPalette((v) => !v)}
          disabled={readOnly}
          aria-label={t('board.boardSidebar.colorTagLabel', { label: tag.label })}
          aria-expanded={palette}
        />
        {editing ? (
          <input
            autoFocus
            className="od-input h-7 min-w-0 flex-1 px-2 text-[13px]"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(tag.label);
                setEditing(false);
              }
            }}
            aria-label={t('board.boardSidebar.tagName')}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-start"
            onClick={() => {
              if (readOnly) return;
              setDraft(tag.label);
              setEditing(true);
            }}
            title={readOnly ? tag.label : t('board.boardSidebar.clickRename')}
          >
            <span className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: tag.color, color: tagTextColor(tag.color) }}>
              <span className="truncate">{tag.label}</span>
            </span>
            {!readOnly && <PencilIcon size={12} className="shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />}
          </button>
        )}
        <span className="w-6 shrink-0 text-end text-xs tabular-nums text-ink-subtle" title={`${stickyIds.length} post-it(s)`}>
          {stickyIds.length}
        </span>
        <Tooltip label={t('board.boardSidebar.selectStickyNotesThisTag')} side="left">
          <button
            type="button"
            className="od-tool h-7 w-7 shrink-0"
            disabled={stickyIds.length === 0}
            onClick={() => {
              b().setSelectedIds(stickyIds);
              b().zoomToFit(stickyIds);
            }}
            aria-label={t('board.boardSidebar.selectStickyNotesLabel', { label: tag.label })}
          >
            <Crosshair size={14} />
          </button>
        </Tooltip>
        {!readOnly && (
          <Tooltip label={t('board.boardSidebar.deleteTag')} side="left">
            <button type="button" className="od-tool h-7 w-7 shrink-0 hover:text-danger" onClick={() => setConfirm(true)} aria-label={t('board.boardSidebar.deleteTagLabel', { label: tag.label })}>
              <TrashIcon size={14} />
            </button>
          </Tooltip>
        )}
      </div>
      {palette && !readOnly && (
        <div className="flex animate-fade-in flex-wrap gap-1.5 px-8 pb-2 pt-1">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn('flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-base hover:scale-110', c === tag.color && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]')}
              style={{ background: c }}
              onClick={() => {
                b().updateBoardTag(tag.id, { color: c });
                setPalette(false);
              }}
              aria-label={t('board.boardSidebar.useColorC', { c })}
            >
              {c === tag.color && <Check size={12} style={{ color: tagTextColor(c) }} strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div className="mx-1.5 mb-1.5 flex animate-fade-in items-center gap-2 rounded-lg bg-danger-soft px-2.5 py-2 text-xs text-ink">
          <span className="flex-1">{t('board.boardSidebar.deleteLabel', { label: tag.label })}{stickyIds.length ? ` e tirar de ${stickyIds.length} post-it(s)` : ''}?
          </span>
          <button
            type="button"
            className="od-btn od-btn-danger od-btn-sm h-7 px-2"
            onClick={() => {
              b().deleteBoardTag(tag.id);
              setConfirm(false);
            }}
          >{t('common.delete')}</button>
          <button type="button" className="od-btn od-btn-ghost od-btn-sm h-7 px-2" onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
        </div>
      )}
    </li>
  );
}

