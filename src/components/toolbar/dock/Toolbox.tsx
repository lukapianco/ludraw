/**
 * LuDraw — Caixa de ferramentas (Chat 08.2 · C-1, `STUDIO_V2_SPEC.md` §4). Substitui o "Mais ferramentas":
 * busca já focada (atalho `/`), filtro Tudo · Do LuDraw · Extensões (n), Recentes (até 3, neste navegador), grade
 * 2 × 2 por intenção (Organizar, Diagramar, Apresentar, Trazer e levar) e a seção "Das extensões ativas" (elementos,
 * comandos, painéis e importadores, com o nome da extensão e o tipo). `Enter` executa o primeiro resultado.
 * Em que difere do padrão de mercado: agrupado pelo verbo (o que você quer fazer), não por tipo de objeto, e o que
 * vem de extensão fica separado e identificado, nunca misturado com o núcleo.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { useAppStore } from '../../../store/useAppStore';
import { useExtensionRuntimeStore } from '../../../store/useExtensionRuntimeStore';
import { insertKanban } from '../../../utils/kanbanActions';
import { insertTable } from '../../../utils/tableActions';
import { insertMindMap } from '../../../utils/mindmapActions';
import { insertGalleryTemplate } from '../../../utils/templateActions';
import { insertCompositeElement, insertPreset, startPresentation } from '../../../utils/boardActions';
import { CommandRegistry, ElementTypeRegistry, ImporterRegistry, PanelRegistry, useRegistry } from '../../../extensions/registries';
import { useExtensionName } from '../../extensions/extensionUi';
import { cn } from '../../../utils/cn';
import { useT } from '../../../i18n/useT';
import {
  DocumentIcon,
  ExportIcon,
  ExtensionIcon,
  FlowchartIcon,
  FlowsIcon,
  ImportIcon,
  JourneyIcon,
  KanbanIcon,
  MindMapIcon,
  PrototypeIcon,
  SlidesIcon,
  TableIcon,
  TemplatesIcon,
  TextDiagramIcon,
  TimelineIcon,
  VideoIcon,
} from '../../icons/od';
import { ComingSoonBadge, DockTray, ExtensionBadge, TrayCaption } from './DockTray';
import { openTemplateGallery, openTextDiagram } from './trays';
import { readToolboxRecent, rememberToolboxItem, useDockUi } from './dockUi';

type Filter = 'all' | 'core' | 'ext';
type Section = 'organize' | 'diagram' | 'present' | 'bring';

interface ToolItem {
  id: string;
  section: Section | 'ext';
  label: string;
  description: string;
  icon: ReactNode;
  /** sem `run` = "Em breve" (visível, desabilitado, com dica) */
  run?: () => void;
}

const SECTIONS: Section[] = ['organize', 'diagram', 'present', 'bring'];

export function Toolbox() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [recent] = useState(readToolboxRecent);
  const types = useRegistry(ElementTypeRegistry);
  const commands = useRegistry(CommandRegistry);
  const panels = useRegistry(PanelRegistry);
  const importers = useRegistry(ImporterRegistry);
  const nameOf = useExtensionName();
  const app = useAppStore.getState;

  const core: ToolItem[] = [
    { id: 'kanban', section: 'organize', label: t('board.leftToolbar.kanban'), description: t('board.leftToolbar.columnsCardsPriorityDueDate'), icon: <KanbanIcon />, run: () => void insertKanban() },
    { id: 'table', section: 'organize', label: t('board.leftToolbar.table'), description: t('board.leftToolbar.editableRowsColumnsColorBold'), icon: <TableIcon />, run: () => void insertTable() },
    { id: 'timeline', section: 'organize', label: t('board.leftToolbar.timeline'), description: t('board.leftToolbar.planYourWorkSchedule'), icon: <TimelineIcon /> },
    { id: 'flows', section: 'organize', label: t('board.leftToolbar.flows'), description: t('board.leftToolbar.automateStepSequencesBoard'), icon: <FlowsIcon /> },
    { id: 'mindmap', section: 'diagram', label: t('common.mindMap'), description: t('board.leftToolbar.branchOutIdeasTabEnter'), icon: <MindMapIcon />, run: () => void insertMindMap() },
    { id: 'diagram', section: 'diagram', label: t('board.leftToolbar.textDiagram'), description: t('board.leftToolbar.writeFlowAsTextGenerate'), icon: <TextDiagramIcon />, run: openTextDiagram },
    { id: 'flowchart', section: 'diagram', label: t('board.leftToolbar.simpleFlowchart'), description: t('board.leftToolbar.startDecisionEndReadyEdit'), icon: <FlowchartIcon />, run: () => insertPreset('flowchart') },
    { id: 'journey', section: 'diagram', label: t('board.leftToolbar.journeyMap'), description: t('board.leftToolbar.stagesLayersPersonaEmotionCurve'), icon: <JourneyIcon />, run: () => void insertGalleryTemplate('journey') },
    { id: 'slides', section: 'present', label: t('board.leftToolbar.slides'), description: t('board.leftToolbar.presentYourWorkSlides'), icon: <SlidesIcon />, run: () => startPresentation() },
    { id: 'prototype', section: 'present', label: t('board.leftToolbar.prototype'), description: t('board.leftToolbar.visualizeConceptsBuildInteractiveFlows'), icon: <PrototypeIcon /> },
    { id: 'doc', section: 'present', label: t('board.leftToolbar.document'), description: t('board.leftToolbar.organizeYourIdeasDocument'), icon: <DocumentIcon /> },
    { id: 'video', section: 'present', label: t('board.leftToolbar.videoRecording'), description: t('board.leftToolbar.recordVideoShareGetFeedback'), icon: <VideoIcon /> },
    { id: 'templates', section: 'bring', label: t('common.templates'), description: t('studio.toolbox.templatesHint'), icon: <TemplatesIcon />, run: openTemplateGallery },
    { id: 'import', section: 'bring', label: t('studio.toolbox.import'), description: t('studio.toolbox.importHint'), icon: <ImportIcon />, run: () => app().openModal({ type: 'export-import', tab: 'import' }) },
    { id: 'export', section: 'bring', label: t('studio.toolbox.export'), description: t('studio.toolbox.exportHint'), icon: <ExportIcon />, run: () => app().openModal({ type: 'export-import', tab: 'export' }) },
  ];
  const extKind = (k: 'element' | 'command' | 'panel' | 'importer') => t(`studio.toolbox.kind.${k}`);
  const ext: ToolItem[] = [
    ...types.map((x) => ({ id: `ext:el:${x.id}`, section: 'ext' as const, label: x.label, description: `${nameOf(x.extensionId)} · ${extKind('element')}`, icon: <ExtensionIcon />, run: () => insertCompositeElement(x.id) })),
    ...commands.map((x) => ({ id: `ext:cmd:${x.id}`, section: 'ext' as const, label: x.label, description: `${nameOf(x.extensionId)} · ${extKind('command')}`, icon: <ExtensionIcon />, run: () => x.run() })),
    ...panels.map((x) => ({ id: `ext:panel:${x.id}`, section: 'ext' as const, label: x.label, description: `${nameOf(x.extensionId)} · ${extKind('panel')}`, icon: <ExtensionIcon />, run: () => useExtensionRuntimeStore.getState().setOpenPanel(x.id) })),
    ...importers
      .filter((x) => x.source === 'extension')
      .map((x) => ({ id: `ext:imp:${x.id}`, section: 'ext' as const, label: x.label, description: `${nameOf(x.extensionId)} · ${extKind('importer')}`, icon: <ExtensionIcon />, run: () => app().openModal({ type: 'export-import', tab: 'import' }) })),
  ];
  // "Extensões" em Trazer e levar: mostra só o que vem das extensões ativas
  const extensionsEntry: ToolItem = { id: 'extensions', section: 'bring', label: t('studio.toolbox.extensions'), description: t('studio.toolbox.extensionsHint', { count: ext.length }), icon: <ExtensionIcon />, run: () => setFilter('ext') };

  const q = query.trim().toLowerCase();
  const match = (i: ToolItem) => !q || i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
  const coreShown = filter === 'ext' ? [] : [...core, extensionsEntry].filter(match);
  const extShown = filter === 'core' ? [] : ext.filter(match);
  const recentItems = useMemo(() => recent.map((id) => [...core, ...ext].find((i) => i.id === id && i.run)).filter((i): i is ToolItem => !!i), [recent, core.length, ext.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (i: ToolItem) => {
    if (!i.run) return;
    if (i.id !== 'extensions') {
      rememberToolboxItem(i.id);
      useDockUi.getState().close(false);
    }
    i.run();
  };
  const first = [...coreShown, ...extShown].find((i) => i.run && i.id !== 'extensions');

  const Item = ({ i }: { i: ToolItem }) => (
    <button
      type="button"
      data-toolbox-item={i.id}
      aria-disabled={!i.run || undefined}
      title={i.run ? undefined : t('studio.dock.comingSoonHint')}
      className={cn('flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-start transition-colors duration-base', i.run ? 'hover:bg-panel-hover' : 'cursor-not-allowed opacity-60')}
      onClick={() => run(i)}
    >
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-panel-sunken text-[var(--od-accent)]">{i.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{i.label}</span>
        <span className="block truncate text-[11.5px] text-ink-subtle">{i.description}</span>
      </span>
      {!i.run && <ComingSoonBadge />}
      {i.section === 'ext' && <ExtensionBadge />}
    </button>
  );

  return (
    <DockTray
      id="toolbox"
      title={t('studio.toolbox.title')}
      label={t('studio.toolbox.title')}
      shortcut="/"
      width={600}
      autoFocus="input"
      footer={t('studio.toolbox.footer')}
      footerAction={<span className="od-kbd">Esc</span>}
    >
      <div className="px-3.5 pb-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            className="od-input h-10 ps-9 focus:shadow-[0_0_0_3px_var(--od-selection-fill)]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('studio.toolbox.search')}
            aria-label={t('studio.toolbox.search')}
            data-toolbox-search
            onKeyDown={(e) => {
              if (e.key === 'Enter' && first) {
                e.preventDefault();
                run(first);
              }
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-2">
        <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-panel-sunken p-0.5" role="radiogroup" aria-label={t('studio.toolbox.filter')}>
          {(['all', 'core', 'ext'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              data-toolbox-filter={f}
              className={cn('h-7 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors duration-base', filter === f ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? t('studio.toolbox.filterAll') : f === 'core' ? t('studio.toolbox.filterCore') : t('studio.toolbox.filterExt', { count: ext.length })}
            </button>
          ))}
        </div>
        {!q && filter !== 'ext' && recentItems.length > 0 && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('studio.toolbox.recent')}</span>
            {recentItems.map((i) => (
              <button key={i.id} type="button" className="od-btn od-btn-soft od-btn-sm max-w-[140px] truncate" onClick={() => run(i)}>
                {i.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {coreShown.length > 0 && (
        <div className="grid gap-x-3 px-2.5 pb-2 min-[560px]:grid-cols-2">
          {SECTIONS.map((s) => {
            const list = coreShown.filter((i) => i.section === s);
            if (!list.length) return null;
            return (
              <div key={s} data-toolbox-section={s} className="min-w-0">
                <TrayCaption className="px-1.5">{t(`studio.toolbox.section.${s}`)}</TrayCaption>
                {list.map((i) => (
                  <Item key={i.id} i={i} />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {filter !== 'core' && (
        <div className="border-t border-line px-2.5 pb-2 pt-1" data-toolbox-section="ext">
          <div className="flex items-center justify-between">
            <TrayCaption className="px-1.5">{t('studio.toolbox.fromExtensions')}</TrayCaption>
            <button
              type="button"
              className="od-btn od-btn-ghost od-btn-sm text-ink-muted"
              onClick={() => {
                useDockUi.getState().close(false);
                app().navigate({ name: 'settings', tab: 'extensions', from: useBoardStore.getState().boardId ?? undefined });
              }}
            >
              {t('board.leftToolbar.manageExtensions')}
            </button>
          </div>
          {extShown.length ? (
            <div className="grid gap-x-3 min-[560px]:grid-cols-2">
              {extShown.map((i) => (
                <Item key={i.id} i={i} />
              ))}
            </div>
          ) : (
            <p className="px-1.5 pb-1 text-[12px] text-ink-subtle">{q ? t('board.leftToolbar.noToolsFoundQuery', { query }) : t('board.leftToolbar.extensionsEmptyBody')}</p>
          )}
        </div>
      )}
      {q && coreShown.length === 0 && filter === 'core' && <p className="px-3.5 pb-3 text-[12px] text-ink-subtle">{t('board.leftToolbar.noToolsFoundQuery', { query })}</p>}
    </DockTray>
  );
}
