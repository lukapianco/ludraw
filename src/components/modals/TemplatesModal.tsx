import { useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { PencilIcon, TemplatesIcon, TrashIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import type { CanvasElement } from '../../types/canvas';
import type { TemplateEntity } from '../../types/workspace';
import { GALLERY_CATEGORY_LABELS, isGalleryTemplate, templateBoardData, type GalleryTemplate } from '../../utils/templates';
import { ensureCoreContributions } from '../../extensions/core';
import { TemplateRegistry, useRegistry, type TemplateDefinition } from '../../extensions/registries';
import { insertTemplateElements } from '../../utils/templateActions';
import { formatRelativeDay } from '../../utils/format';
import { cn } from '../../utils/cn';
import { TemplateThumb, type TemplateThumbKind } from '../dashboard/TemplateThumb';
import { TemplatePreview } from '../extensions/TemplatePreview';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { templateAccess } from '../../store/workspaceSlice';
import { isSafeImageSrc } from '../../utils/contentSafety';

const THUMB: Record<GalleryTemplate['id'], TemplateThumbKind> = {
  swot: 'swot',
  retro: 'retro',
  business9: 'business9',
  sprint: 'kanban',
  journey: 'journey',
  architecture: 'architecture',
};

type Category = keyof typeof GALLERY_CATEGORY_LABELS;
type TemplatesTab = 'gallery' | 'personal' | 'team' | 'workspace';

/**
 * Galeria de Templates (Chat 04). `target: 'board'` insere o template no centro da tela do board
 * aberto (estruturas de fundo protegidas só se quem insere pode aplicar o bloqueio protegido);
 * `target: 'new'` cria um board novo. Aba "Meus templates" = escopo `personal` (renomear/excluir);
 * Chat 06: abas "Do time" e "Do workspace" (visibilidade e gestão por `templateAccess`/`can()`).
 */
export function TemplatesModal({ target, tab: initialTab = 'gallery', onClose }: { target: 'board' | 'new'; tab?: TemplatesTab; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<TemplatesTab>(initialTab);
  const [category, setCategory] = useState<Category>('all');
  const state = useAppStore();
  const visible = state.templates.filter((tpl) => templateAccess(state, tpl).view);
  const byScope = (scope: Exclude<TemplatesTab, 'gallery'>) => visible.filter((tpl) => tpl.scope === scope);
  // Chat 05: a galeria lê o TemplateRegistry (o núcleo registra os 6 templates; extensões, no 06.5)
  useMemo(() => ensureCoreContributions(), []);
  const registered = useRegistry(TemplateRegistry);
  const list = registered.filter((t) => category === 'all' || t.category === category);

  const insertElements = (elements: CanvasElement[], name: string) => {
    if (insertTemplateElements(elements, name).length) onClose();
  };

  const applyGallery = (t: TemplateDefinition) => {
    if (target === 'new') {
      if (isGalleryTemplate(t.id as GalleryTemplate['id'])) useAppStore.getState().createBoard({ template: t.id as GalleryTemplate['id'], open: true });
      else useAppStore.getState().createBoard({ name: t.label, template: 'personal', data: templateBoardData(t.build()), open: true });
      onClose();
      return;
    }
    const data = templateBoardData(t.build());
    insertElements(data.elementOrder.map((id) => data.elements[id]), t.label);
  };

  const applyPersonal = (t: TemplateEntity) => {
    if (target === 'new') {
      useAppStore.getState().createBoard({ name: t.name, template: 'personal', data: JSON.parse(JSON.stringify(t.data)), open: true });
      onClose();
      return;
    }
    insertElements(t.data.elementOrder.map((id) => t.data.elements[id]).filter(Boolean), t.name);
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={980}
      icon={<TemplatesIcon size={20} />}
      title={target === 'new' ? t('modals.templatesModal.newBoardTemplate') : t('modals.templatesModal.templateGallery')}
      description={target === 'new' ? t('modals.templatesModal.pickReadyMadeStructureGet') : t('modals.templatesModal.theTemplateLandsCenterYour')}
    >
      <div className="-mt-1 mb-4 flex flex-wrap items-center gap-3 border-b border-line">
        {(['gallery', 'personal', 'team', 'workspace'] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={tab === tabId}
            onClick={() => setTab(tabId)}
            className={cn('-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[13px] font-semibold transition-colors', tab === tabId ? 'border-brand-900 text-ink dark:border-brand-200' : 'border-transparent text-ink-subtle hover:text-ink')}
          >
            {tabId === 'gallery' ? t('modals.templatesModal.gallery') : tabId === 'personal' ? t('modals.templatesModal.myTemplates') : tabId === 'team' ? t('workspace.templates.teamTitle') : t('workspace.templates.workspaceTitle')}
            {tabId !== 'gallery' && byScope(tabId).length > 0 && <span className="rounded-full bg-panel-sunken px-1.5 text-[11px] tabular-nums ring-1 ring-line">{byScope(tabId).length}</span>}
          </button>
        ))}
        {tab === 'gallery' && (
          <div className="ms-auto flex flex-wrap gap-1 pb-1.5">
            {(Object.keys(GALLERY_CATEGORY_LABELS) as Category[]).map((c) => (
              <button key={c} type="button" aria-pressed={category === c} className={cn('od-btn od-btn-sm h-7 px-2.5', category === c ? 'od-btn-soft' : 'od-btn-ghost text-ink-muted')} onClick={() => setCategory(c)}>
                {GALLERY_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'gallery' ? (
        <div className="grid max-h-[min(560px,62vh)] grid-cols-2 gap-4 overflow-y-auto pb-1 sm:grid-cols-3">
          {list.map((tpl) => (
            <TemplateCard key={tpl.id} title={tpl.label} description={tpl.description} badge={GALLERY_CATEGORY_LABELS[tpl.category]} thumb={tpl.source === 'extension' ? <TemplatePreview template={tpl} /> : <TemplateThumb kind={THUMB[tpl.id as GalleryTemplate['id']] ?? 'blank'} />} onUse={() => applyGallery(tpl)} actionLabel={target === 'new' ? t('modals.templatesModal.createBoard') : t('common.insert')} />
          ))}
        </div>
      ) : (
        <PersonalList templates={byScope(tab)} actionLabel={target === 'new' ? t('modals.templatesModal.createBoard') : t('common.insert')} onUse={applyPersonal} canSave={target === 'board'} />
      )}
    </Modal>
  );
}

function TemplateCard({ title, description, badge, thumb, onUse, actionLabel, extra }: { title: string; description: string; badge?: string; thumb: ReactNode; onUse: () => void; actionLabel: string; extra?: ReactNode }) {
  return (
    <div className="group flex flex-col rounded-2xl bg-panel p-2 ring-1 ring-line transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300">
      <button type="button" onClick={onUse} className="relative block aspect-[150/92] overflow-hidden rounded-xl text-start ring-1 ring-line" aria-label={`${actionLabel}: ${title}`}>
        {thumb}
        {badge && <span className="absolute start-1.5 top-1.5 rounded-full bg-panel px-1.5 py-0.5 text-2xs font-semibold text-ink-muted ring-1 ring-line">{badge}</span>}
      </button>
      <div className="flex items-start gap-2 px-1.5 pb-1 pt-2.5">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
          <span className="block truncate text-xs text-ink-subtle">{description}</span>
        </div>
        {extra}
        <button type="button" className="od-btn od-btn-soft od-btn-sm shrink-0" onClick={onUse}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function PersonalList({ templates, actionLabel, onUse, canSave }: { templates: TemplateEntity[]; actionLabel: string; onUse: (t: TemplateEntity) => void; canSave: boolean }) {
  const t = useT();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const sorted = useMemo(() => [...templates].sort((a, b) => b.createdAt - a.createdAt), [templates]);
  const app = useAppStore.getState;
  const state = useAppStore();
  const badge = (tpl: TemplateEntity) =>
    tpl.scope === 'team' ? (state.teams.find((x) => x.id === tpl.teamId)?.name ?? t('workspace.templates.scopeTeam')) : tpl.scope === 'workspace' ? t('workspace.templates.scopeWorkspace') : t('modals.templatesModal.personal');

  if (!sorted.length) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-brand-900 dark:text-brand-200">
          <TemplatesIcon size={22} />
        </span>
        <div className="mt-3 font-semibold text-ink">{t('modals.templatesModal.youHaventSavedAnyTemplates')}</div>
        <p className="mt-1 max-w-md text-sm text-ink-muted">{t('modals.templatesModal.onBoardSelectObjectsUse')}</p>
        {canSave && (
          <button
            type="button"
            className="od-btn od-btn-primary mt-4"
            onClick={() => {
              app().closeModal();
              app().openModal({ type: 'save-template', source: useBoardStore.getState().selectedIds.length ? 'selection' : 'board' });
            }}
          >
            <Plus size={16} />{' '}{t('modals.templatesModal.saveNow')}</button>
        )}
      </div>
    );
  }
  return (
    <div className="grid max-h-[min(560px,62vh)] grid-cols-2 gap-4 overflow-y-auto pb-1 sm:grid-cols-3">
      {sorted.map((tpl) => (
        <div key={tpl.id} className="flex flex-col rounded-2xl bg-panel p-2 ring-1 ring-line">
          <button type="button" onClick={() => onUse(tpl)} className="relative block aspect-[150/92] overflow-hidden rounded-xl bg-canvas ring-1 ring-line" aria-label={`${actionLabel}: ${tpl.name}`}>
            {isSafeImageSrc(tpl.thumbnail) ? <img src={tpl.thumbnail} alt="" className="h-full w-full object-cover" /> : <TemplateThumb kind="blank" />}
            <span className="absolute start-1.5 top-1.5 rounded-full bg-panel px-1.5 py-0.5 text-2xs font-semibold text-ink-muted ring-1 ring-line">{badge(tpl)}</span>
          </button>
          <div className="px-1.5 pb-1 pt-2.5">
            {renaming === tpl.id ? (
              <input
                className="od-input h-8 text-[13px]"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  app().renameTemplate(tpl.id, draft);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    app().renameTemplate(tpl.id, draft);
                    setRenaming(null);
                  }
                  if (e.key === 'Escape') setRenaming(null);
                }}
                aria-label={t('modals.templatesModal.templateName')}
              />
            ) : (
              <span className="block truncate text-[13px] font-semibold text-ink">{tpl.name}</span>
            )}
            <span className="block truncate text-xs text-ink-subtle">
              {t('modals.templatesModal.valueCountObjectsRelativeday', { value: tpl.description ? `${tpl.description} · ` : '', count: tpl.data.elementOrder.length, relativeDay: formatRelativeDay(tpl.createdAt) })}
            </span>
            <div className="mt-2 flex items-center gap-1">
              {templateAccess(state, tpl).manage && (<>
              <button
                type="button"
                className="od-tool h-8 w-8"
                onClick={() => {
                  setDraft(tpl.name);
                  setRenaming(tpl.id);
                }}
                aria-label={t('modals.templatesModal.renameTemplate')}
                title={t('common.rename')}
              >
                <PencilIcon size={15} />
              </button>
              <button type="button" className="od-tool h-8 w-8 hover:text-danger" onClick={() => app().deleteTemplate(tpl.id)} aria-label={t('modals.templatesModal.deleteTemplate')} title={t('common.delete')}>
                <TrashIcon size={15} />
              </button>
              </>)}
              <button type="button" className="od-btn od-btn-soft od-btn-sm ms-auto" onClick={() => onUse(tpl)}>
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
