import { useEffect, useMemo, useState } from 'react';
import { TemplatesIcon } from '../icons/od';
import type { CanvasElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import { currentBoardMeta } from '../../utils/boardActions';
import { cloneElements } from '../../utils/factory';
import { generateThumbnail } from '../../utils/export';
import { isPrivateDraftHidden } from '../../utils/permissions';
import { templateBoardData } from '../../utils/templates';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { formatCount } from '../../i18n/format';
import type { TemplateScope } from '../../types/workspace';
import { useViewer, useWorkspaceCan } from '../../hooks/useWorkspace';
import { visibleTeams } from '../../utils/workspace';

/** Acima disto o template provavelmente não cabe no armazenamento local (localStorage ~5 MB). */
const MAX_TEMPLATE_BYTES = 2_500_000;

/**
 * "Salvar como template" (Chat 04) — escopo `personal` (`TemplateEntity`). Fonte: a seleção ou o
 * board inteiro. Ficam de fora: conversas de comentário, notas privadas de outras pessoas e
 * autoria/votos (o template guarda só a estrutura). Chat 06: escopo Pessoal, Time (diretório de
 * templates do time) ou Workspace — cada um conforme `can()`; opções negadas mostram o motivo.
 */
export function SaveTemplateModal({ source: initialSource, scope: initialScope = 'personal', onClose }: { source: 'selection' | 'board'; scope?: Exclude<TemplateScope, 'system'>; onClose: () => void }) {
  const t = useT();
  const viewer = useViewer();
  const allTeams = useAppStore((s) => s.teams);
  const teams = visibleTeams(viewer, allTeams).filter((tm) => viewer.workspaceRole === 'admin' || viewer.teamIds.includes(tm.id));
  const canTeam = useWorkspaceCan('workspace.templates.team');
  const canWorkspace = useWorkspaceCan('workspace.templates.manage');
  const [scope, setScope] = useState<Exclude<TemplateScope, 'system'>>(initialScope);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const scopeOptions = [
    { id: 'personal' as const, label: t('workspace.templates.scopePersonalOption'), allowed: true, reason: undefined as string | undefined },
    { id: 'team' as const, label: t('workspace.templates.scopeTeamOption'), allowed: canTeam.allowed && teams.length > 0, reason: canTeam.allowed ? t('workspace.templates.noTeam') : canTeam.reason },
    { id: 'workspace' as const, label: t('workspace.templates.scopeWorkspaceOption'), allowed: canWorkspace.allowed, reason: canWorkspace.reason },
  ];
  const hasSelection = useBoardStore((s) => s.selectedIds.some((id) => s.elements[id] && s.elements[id].type !== 'comment'));
  const [source, setSource] = useState<'selection' | 'board'>(initialSource === 'selection' && hasSelection ? 'selection' : 'board');
  const [name, setName] = useState(() => (initialSource === 'board' ? currentBoardMeta()?.name ?? t('modals.saveTemplateModal.myTemplate') : t('modals.saveTemplateModal.myTemplate')));
  const [description, setDescription] = useState('');
  const [thumb, setThumb] = useState<string | undefined>();
  const theme = useAppStore((s) => s.theme);

  const elements = useMemo(() => {
    const s = useBoardStore.getState();
    const viewer = s.access.userId;
    const simulate = s.facilitation.privateMode.previewOwnNotes;
    const chosen = source === 'selection' ? new Set(s.expandGroups(s.selectedIds)) : null;
    // frames selecionados levam o conteúdo junto
    if (chosen) for (const id of Array.from(chosen)) if (s.elements[id]?.type === 'frame') for (const cid in s.elements) if (s.elements[cid].parentId === id) chosen.add(cid);
    const picked = s.elementOrder
      .map((id) => s.elements[id])
      .filter((el): el is CanvasElement => !!el && (!chosen || chosen.has(el.id)))
      .filter((el) => el.type !== 'comment' && !(el.type === 'sticky' && isPrivateDraftHidden(el, viewer, simulate)));
    return cloneElements(picked).map((el) => {
      const clean = { ...el, createdBy: undefined, createdByName: undefined } as CanvasElement & { authorName?: string; votes?: number; votedBy?: string[]; isPrivateDraft?: boolean };
      if (clean.type === 'sticky') {
        delete clean.authorName;
        delete clean.votedBy;
        clean.votes = 0;
        clean.isPrivateDraft = false;
      }
      return clean as CanvasElement;
    });
  }, [source]);

  useEffect(() => {
    let alive = true;
    setThumb(undefined);
    if (!elements.length) return;
    void generateThumbnail(elements, theme, useBoardStore.getState().backgroundColor).then((t) => alive && setThumb(t));
    return () => {
      alive = false;
    };
  }, [elements, theme]);

  const data = useMemo(() => templateBoardData(elements), [elements]);
  const bytes = useMemo(() => JSON.stringify(data).length, [data]);
  const tooBig = bytes > MAX_TEMPLATE_BYTES;

  const save = () => {
    if (!elements.length || tooBig || !name.trim()) return;
    const saved = useAppStore.getState().saveTemplate({ name, description, data, thumbnail: thumb, scope, teamId: scope === 'team' ? teamId : undefined });
    if (!saved) return;
    useAppStore.getState().toast(t('modals.saveTemplateModal.templateNameSavedMyTemplates', { name: saved.name }), 'success');
    onClose();
  };

  const label = 'mb-1.5 block text-xs font-semibold text-ink-muted';
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      icon={<TemplatesIcon size={20} />}
      title={t('modals.saveTemplateModal.saveAsTemplate')}
      description={t('modals.saveTemplateModal.itGoesMyTemplatesJust')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!elements.length || tooBig || !name.trim()} onClick={save}>{t('modals.saveTemplateModal.saveTemplate')}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="aspect-[150/92] overflow-hidden rounded-xl bg-canvas ring-1 ring-line sm:aspect-auto sm:h-[124px]">
          {thumb ? <img src={thumb} alt={t('modals.saveTemplateModal.templatePreview')} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-ink-subtle">{elements.length ? t('modals.saveTemplateModal.generatingPreview') : t('modals.saveTemplateModal.nothingSave')}</div>}
        </div>
        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="st-name">{t('common.name')}</label>
            <input id="st-name" className="od-input" value={name} autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
          <div>
            <label className={label} htmlFor="st-desc">{t('modals.saveTemplateModal.descriptionOptional')}</label>
            <input id="st-desc" className="od-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('modals.saveTemplateModal.whatThisTemplate')} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-1 rounded-lg bg-panel-sunken p-1 ring-1 ring-line" role="radiogroup" aria-label={t('modals.saveTemplateModal.whatSave')}>
        {(['selection', 'board'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            disabled={s === 'selection' && !hasSelection}
            className={cn('flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', source === s ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
            onClick={() => setSource(s)}
          >
            {s === 'selection' ? t('modals.saveTemplateModal.selectionOnly') : t('modals.saveTemplateModal.theWholeBoard')}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <span className={label}>{t('workspace.templates.whereLabel')}</span>
        <div className="flex gap-1 rounded-lg bg-panel-sunken p-1 ring-1 ring-line" role="radiogroup" aria-label={t('workspace.templates.whereLabel')}>
          {scopeOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={scope === o.id}
              disabled={!o.allowed}
              title={!o.allowed ? o.reason : undefined}
              className={cn('flex-1 rounded-md py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', scope === o.id ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
              onClick={() => setScope(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
        {scope === 'team' && (
          <select className="od-input mt-2 h-9 text-[13px]" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label={t('workspace.project.team')}>
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>{tm.name}</option>
            ))}
          </select>
        )}
        <span className="mt-1 block text-xs text-ink-subtle">{scope === 'personal' ? t('workspace.templates.personalHint') : scope === 'team' ? t('workspace.templates.teamHint') : t('workspace.templates.workspaceHint')}</span>
      </div>
      <p className={cn('mt-2 text-xs', tooBig ? 'text-danger' : 'text-ink-subtle')}>
        {formatCount('object', elements.length)}{' '}{t('modals.saveTemplateModal.fixedKb', { fixed: (bytes / 1024).toFixed(0) })}{tooBig ? t('modals.saveTemplateModal.tooLargeLocalStorageRemove') : t('modals.saveTemplateModal.commentsOtherPeoplesPrivateNotes')}
      </p>
    </Modal>
  );
}
