import { useMemo, useState } from 'react';
import { CalendarDays, Copy, UserRound, X } from 'lucide-react';
import { KanbanIcon, TrashIcon } from '../icons/od';
import type { KanbanCard } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { findCard, PRIORITY_META, STORY_POINT_PRESETS, type KanbanPriority } from '../../utils/kanban';
import { kanbanApplyCardEdit, kanbanDeleteCard, kanbanDuplicateCard, kanbanEditable, knownAssignees, knownCardTags } from '../../utils/kanbanActions';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';

/**
 * Editor completo de um card de Kanban (Chat 04): título, descrição, responsável, prazo,
 * prioridade, story points, tags e coluna. Edita um rascunho e grava tudo em 1 passo de desfazer
 * ao salvar. Sem permissão de edição (ou com o Kanban bloqueado), abre só para leitura.
 */
export function KanbanCardModal({ elementId, cardId, onClose }: { elementId: string; cardId: string; onClose: () => void }) {
  const t = useT();
  const element = useBoardStore((s) => {
    const el = s.elements[elementId];
    return el && el.type === 'kanban' ? el : null;
  });
  const found = element ? findCard(element, cardId) : null;
  const [draft, setDraft] = useState<KanbanCard | null>(found ? { ...found.card, tags: [...found.card.tags] } : null);
  const [columnId, setColumnId] = useState(found?.column.id ?? '');
  const [tagInput, setTagInput] = useState('');
  const people = useMemo(() => knownAssignees(), []);
  const tagSuggestions = useMemo(() => knownCardTags(), []);
  const editable = element ? kanbanEditable(element, true) : false;

  if (!element || !found || !draft) return null;

  const set = (patch: Partial<KanbanCard>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const addTag = (raw: string) => {
    const t = raw.replace(/,/g, ' ').trim().slice(0, 32);
    if (!t || draft.tags.some((x) => x.toLocaleLowerCase('pt-BR') === t.toLocaleLowerCase('pt-BR'))) return;
    set({ tags: [...draft.tags, t] });
    setTagInput('');
  };

  const save = () => {
    if (!editable) {
      onClose();
      return;
    }
    const patch: Partial<KanbanCard> = {
      title: draft.title.trim() || t('modals.kanbanCardModal.untitledCard'),
      description: draft.description?.trim() || undefined,
      assignee: draft.assignee?.trim() || undefined,
      dueDate: draft.dueDate || undefined,
      priority: draft.priority,
      tags: draft.tags,
      storyPoints: typeof draft.storyPoints === 'number' && Number.isFinite(draft.storyPoints) ? draft.storyPoints : undefined,
    };
    const before = found.card;
    const changed = (Object.keys(patch) as (keyof KanbanCard)[]).some((k) => JSON.stringify(patch[k] ?? null) !== JSON.stringify(before[k] ?? null));
    if (changed || columnId !== found.column.id) kanbanApplyCardEdit(elementId, cardId, patch, columnId);
    onClose();
  };

  const label = 'mb-1.5 block text-xs font-semibold text-ink-muted';

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      icon={<KanbanIcon size={20} />}
      title={editable ? t('modals.kanbanCardModal.editCard') : t('modals.kanbanCardModal.card')}
      description={`${element.title} · ${found.column.title}`}
      footer={
        editable ? (
          <>
            <button
              type="button"
              className="od-btn od-btn-ghost me-auto text-danger"
              onClick={() => {
                kanbanDeleteCard(elementId, cardId);
                onClose();
              }}
            >
              <TrashIcon size={16} />{' '}{t('common.delete')}</button>
            <button
              type="button"
              className="od-btn od-btn-ghost"
              onClick={() => {
                kanbanDuplicateCard(elementId, cardId);
                onClose();
              }}
            >
              <Copy size={16} />{' '}{t('common.duplicate')}</button>
            <button type="button" className="od-btn od-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="od-btn od-btn-primary" onClick={save}>{t('modals.kanbanCardModal.save')}</button>
          </>
        ) : (
          <button type="button" className="od-btn od-btn-secondary" onClick={onClose}>{t('common.close')}</button>
        )
      }
    >
      <div
        className="grid gap-4 sm:grid-cols-2"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
      >
        <div className="sm:col-span-2">
          <label className={label} htmlFor="kc-title">{t('modals.kanbanCardModal.title')}</label>
          <input id="kc-title" className="od-input text-[15px] font-semibold" value={draft.title} autoFocus disabled={!editable} onChange={(e) => set({ title: e.target.value })} onFocus={(e) => e.target.select()} placeholder={t('modals.kanbanCardModal.whatNeedsBeDone')} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="kc-desc">{t('modals.kanbanCardModal.description')}</label>
          <textarea id="kc-desc" className="od-input min-h-[84px] resize-y py-2" value={draft.description ?? ''} disabled={!editable} onChange={(e) => set({ description: e.target.value })} placeholder={t('modals.kanbanCardModal.contextAcceptanceCriteriaLinks')} />
        </div>
        <div>
          <label className={label} htmlFor="kc-assignee">
            <UserRound size={13} className="me-1 inline" />{' '}{t('modals.kanbanCardModal.assignee')}</label>
          <input id="kc-assignee" list="kc-people" className="od-input" value={draft.assignee ?? ''} disabled={!editable} onChange={(e) => set({ assignee: e.target.value })} placeholder={t('modals.kanbanCardModal.personsName')} />
          <datalist id="kc-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={label} htmlFor="kc-due">
            <CalendarDays size={13} className="me-1 inline" />{' '}{t('modals.kanbanCardModal.dueDate')}</label>
          <div className="flex gap-1.5">
            <input id="kc-due" type="date" className="od-input" value={draft.dueDate ?? ''} disabled={!editable} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
            {draft.dueDate && editable && (
              <button type="button" className="od-tool h-9 w-9 shrink-0" onClick={() => set({ dueDate: undefined })} aria-label={t('modals.kanbanCardModal.removeDueDate')}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div>
          <span className={label}>{t('modals.kanbanCardModal.priority')}</span>
          <div className="flex gap-1 rounded-lg bg-panel-sunken p-1 ring-1 ring-line" role="radiogroup" aria-label={t('modals.kanbanCardModal.priority')}>
            {(['low', 'medium', 'high'] as KanbanPriority[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={draft.priority === p}
                disabled={!editable}
                className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-semibold transition-colors duration-fast', draft.priority === p ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
                onClick={() => set({ priority: p })}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_META[p].color }} />
                {PRIORITY_META[p].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>{t('modals.kanbanCardModal.storyPoints')}</span>
          <div className="flex flex-wrap gap-1">
            {STORY_POINT_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={!editable}
                aria-pressed={draft.storyPoints === n}
                className={cn('h-8 min-w-[32px] rounded-md px-1.5 text-[13px] font-semibold tabular-nums ring-1 transition-colors duration-fast', draft.storyPoints === n ? 'bg-accent text-accent-contrast ring-transparent' : 'bg-panel text-ink ring-line hover:bg-panel-hover')}
                onClick={() => set({ storyPoints: draft.storyPoints === n ? undefined : n })}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={999}
              className="od-input h-8 w-[64px] px-2 text-[13px]"
              value={typeof draft.storyPoints === 'number' && !STORY_POINT_PRESETS.includes(draft.storyPoints) ? draft.storyPoints : ''}
              disabled={!editable}
              placeholder={t('modals.kanbanCardModal.otherPlaceholder')}
              onChange={(e) => set({ storyPoints: e.target.value === '' ? undefined : Math.max(0, Math.min(999, Number(e.target.value))) })}
              aria-label={t('modals.kanbanCardModal.customStoryPoints')}
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="kc-tags">{t('common.tags')}</label>
          <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg bg-panel px-2 py-1.5 ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-selection">
            {draft.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 ps-2.5 pe-1 text-[12px] font-semibold text-brand-900 dark:text-brand-200">
                {tag}
                {editable && (
                  <button type="button" className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10" onClick={() => set({ tags: draft.tags.filter((x) => x !== tag) })} aria-label={t('modals.kanbanCardModal.removeTagTag', { tag })}>
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
            {editable && (
              <input
                id="kc-tags"
                list="kc-tag-list"
                className="min-w-[120px] flex-1 border-0 bg-transparent text-[13px] text-ink outline-none"
                value={tagInput}
                placeholder={draft.tags.length ? t('modals.kanbanCardModal.add') : t('modals.kanbanCardModal.typePressEnter')}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) {
                    set({ tags: draft.tags.slice(0, -1) });
                  }
                }}
                onBlur={() => tagInput.trim() && addTag(tagInput)}
              />
            )}
            <datalist id="kc-tag-list">
              {tagSuggestions.filter((t) => !draft.tags.includes(t)).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="kc-col">{t('modals.kanbanCardModal.column')}</label>
          <select id="kc-col" className="od-input" value={columnId} disabled={!editable} onChange={(e) => setColumnId(e.target.value)}>
            {element.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.cards.length}
                {c.wipLimit ? `/${c.wipLimit}` : ''})
              </option>
            ))}
          </select>
        </div>
      </div>
      {editable && <p className="mt-3 text-[11.5px] text-ink-subtle">{t('modals.kanbanCardModal.saveCancelHint')}</p>}
    </Modal>
  );
}
