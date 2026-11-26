import { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, ArrowDownUp, ChevronDown, Ellipsis, Filter, LayoutGrid, List, Plus, ScanEye, Star, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { BoardMeta, BoardTemplateId, TemplateEntity } from '../../types/workspace';
import { cn } from '../../utils/cn';
import { formatRelativeDay, initials } from '../../utils/format';
import { Menu, type MenuItem } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { AppHeader } from './AppHeader';
import { BoardActionsMenu, BoardCard, BoardChip, timeAgo } from './BoardCard';
import { CommandPalette } from './CommandPalette';
import { ProjectEyebrow, ProjectFolders } from './ProjectFolders';
import { NewBoardMenu } from './NewBoardMenu';
import { ResumeCard } from './ResumeCard';
import { StartList } from './StartList';
import { CATEGORY_LABELS, START_TEMPLATES, startFromTemplate, type TemplateCategory } from './templates';
import { TemplateThumb } from './TemplateThumb';
import { LocalImportBanner } from '../modals/ImportLocalBoardsModal';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import { LocalModeBanner } from './LocalModeBanner';
import { t } from '../../i18n';
import { useT } from '../../i18n/useT';
import { compareText, formatCount } from '../../i18n/format';
import { Trans } from '../../i18n/Trans';
import { personLabel } from '../../utils/storedNames';
import { boardInPlace, trashExpiresAt } from '../../utils/workspace';
import { placeLabel, displayName } from '../../utils/workspaceDisplay';
import { policiesOf, templateAccess } from '../../store/workspaceSlice';
import { useBoardPlaceLabel, useEffectivePlace, useViewer, useVisibleBoards, useWorkspaceCan, useWsView } from '../../hooks/useWorkspace';
import { isSafeImageSrc } from '../../utils/contentSafety';
import { useDesignSystemEnabled } from '../../hooks/useDesignSystemGate';

type Section = 'home' | 'recent' | 'favorites' | 'templates' | 'trash';
type Tab = 'all' | 'mine' | 'favorites' | 'recent' | 'templates' | 'trash';
type SortKey = 'opened' | 'edited' | 'name' | 'created';
type KindFilter = 'any' | BoardTemplateId;

const SORT_LABELS: Record<SortKey, string> = {
  get opened() { return t('dashboard.dashboardView.lastOpened'); },
  get edited() { return t('dashboard.dashboardView.lastEdited'); },
  get name() { return t('dashboard.dashboardView.nameZ'); },
  get created() { return t('dashboard.dashboardView.dateCreated'); },
};

const KIND_LABELS: Record<KindFilter, string> = {
  get any() { return t('dashboard.dashboardView.allTypes'); },
  get blank() { return t('common.blank'); },
  get demo() { return t('dashboard.dashboardView.guidedDemo'); },
  get flowchart() { return t('dashboard.templates.flowchart'); },
  get brainwriting() { return t('dashboard.templates.brainstorming'); },
  get mindmap() { return t('common.mindMap'); },
  get swot() { return t('common.swotMatrix'); },
  get retro() { return t('dashboard.templates.retrospective'); },
  get business9() { return t('dashboard.dashboardView.businessModel9Blocks'); },
  get sprint() { return t('common.sprintKanban'); },
  get journey() { return t('dashboard.dashboardView.userJourney'); },
  get architecture() { return t('dashboard.dashboardView.architectureFlow'); },
  get personal() { return t('dashboard.dashboardView.myTemplates'); },
};

const RECENT_WINDOW_MS = 30 * 86_400_000;

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preferência só desta sessão */
  }
}

/**
 * Mesa — tela inicial (Rodada 0 do Chat 02, ver ai-memory/DESIGN_REDESIGN.md §2).
 * Cabeçalho docado com espaço e busca Ctrl+K; título = espaço atual; botão dividido
 * "Novo board"; abas sublinhadas; "Retomar" + "Começar com…"; grade de cartões (lista
 * como alternativa); rodapé discreto. Toda a lógica de boards é a do Chat 01.
 */
export function DashboardView({ section }: { section: Section }) {
  const t = useT();
  // Chat 06: só o que a pessoa (ou o perfil simulado) pode ver; "Todos"/"Meus" mostram o lugar atual
  const visible = useVisibleBoards();
  const viewer = useViewer();
  const ws = useWsView();
  const place = useEffectivePlace();
  const teams = useAppStore((s) => s.teams);
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const navigate = useAppStore((s) => s.navigate);
  const designSystem = useDesignSystemEnabled();
  const createBoard = useAppStore((s) => s.createBoard);
  const viewAs = useAppStore((s) => s.session.viewAs);
  const canCreate = useWorkspaceCan('workspace.boards.create');

  const [mine, setMine] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>(() => readPref('ludraw:mesa-view', ['grid', 'list'] as const, 'grid'));
  const [sort, setSort] = useState<SortKey>(() => readPref('ludraw:mesa-sort', ['opened', 'edited', 'name', 'created'] as const, 'opened'));
  const [kind, setKind] = useState<KindFilter>('any');
  const [category, setCategory] = useState<TemplateCategory>('all');
  const [menu, setMenu] = useState<{ kind: 'board' | 'sort' | 'filter' | 'category'; x: number; y: number; boardId?: string } | null>(null);

  const tab: Tab = section === 'home' ? (mine ? 'mine' : 'all') : section;
  const inPlace = tab === 'all' || tab === 'mine';
  // Chat 06: na raiz de um time, os boards de projetos ficam dentro das pastas (ProjectFolders)
  const teamRoot = place.kind === 'team' && !place.projectId;
  const boards = useMemo(
    () => (inPlace ? visible.filter((b) => boardInPlace(b, place, viewer, ws) && !(teamRoot && b.projectId)) : visible),
    [visible, inPlace, place, viewer, ws, teamRoot],
  );
  // o subtítulo conta também os boards dentro dos projetos do time
  const placeBoards = useMemo(() => (inPlace ? visible.filter((b) => boardInPlace(b, place, viewer, ws)) : visible), [visible, inPlace, place, viewer, ws]);
  const projectName = place.kind === 'team' && place.projectId ? projects.find((p) => p.id === place.projectId)?.name : undefined;

  useEffect(() => {
    if (section !== 'home') setMine(false);
  }, [section]);

  // Ctrl/⌘ + K abre a paleta de busca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        const a = useAppStore.getState();
        if (a.modal || a.dev) return;
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goTab = (t: Tab) => {
    setMenu(null);
    setMine(t === 'mine');
    navigate({ name: 'dashboard', section: t === 'all' || t === 'mine' ? 'home' : t });
  };

  const sorted = useMemo(() => {
    const list = [...boards];
    const cmp: Record<SortKey, (a: BoardMeta, b: BoardMeta) => number> = {
      opened: (a, b) => b.lastOpenedAt - a.lastOpenedAt,
      edited: (a, b) => b.updatedAt - a.updatedAt,
      name: (a, b) => compareText(a.name, b.name),
      created: (a, b) => b.createdAt - a.createdAt,
    };
    return list.sort(cmp[sort]);
  }, [boards, sort]);

  const visibleBoards = useMemo(() => {
    let list = sorted;
    if (tab === 'mine') list = list.filter((b) => b.ownerId === viewer.userId);
    if (tab === 'favorites') list = list.filter((b) => b.favorite);
    if (tab === 'recent') {
      const since = Date.now() - RECENT_WINDOW_MS;
      list = [...list].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).filter((b) => b.lastOpenedAt >= since);
    }
    if (kind !== 'any') list = list.filter((b) => b.template === kind);
    return list;
  }, [sorted, tab, kind, viewer.userId]);

  const lastOpened = useMemo(() => [...boards].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0], [boards]);
  const lastEdited = useMemo(() => placeBoards.reduce((max, b) => Math.max(max, b.updatedAt), 0), [placeBoards]);
  const pinned = useMemo(() => sorted.filter((b) => b.favorite), [sorted]);

  const openMenu = (k: 'board' | 'sort' | 'filter' | 'category', el: HTMLElement, boardId?: string) => {
    const r = el.getBoundingClientRect();
    setMenu((cur) => (cur && cur.kind === k && cur.boardId === boardId ? null : { kind: k, x: r.right, y: r.bottom + 6, boardId }));
  };

  const openBoard = (id: string) => navigate({ name: 'board', id });
  const newBlank = () => createBoard({ template: 'blank', open: true });

  const changeView = (v: 'grid' | 'list') => {
    setView(v);
    writePref('ludraw:mesa-view', v);
  };

  const subtitle =
    placeBoards.length === 0
      ? t('dashboard.dashboardView.noBoardsYet')
      : t('dashboard.dashboardView.boardsLastEdited', { count: placeBoards.length, timeAgo: timeAgo(lastEdited) });

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'all', label: t('dashboard.dashboardView.all'), count: boards.length },
    { id: 'mine', label: t('dashboard.dashboardView.mine') },
    { id: 'favorites', label: t('dashboard.dashboardView.favorites'), count: pinned.length || undefined },
    { id: 'recent', label: t('dashboard.dashboardView.recent') },
    { id: 'templates', label: t('common.templates') },
    { id: 'trash', label: t('dashboard.dashboardView.trash') },
  ];

  const sectionTitle = tab === 'mine' ? t('dashboard.dashboardView.myBoards') : tab === 'favorites' ? t('dashboard.dashboardView.favorites') : tab === 'recent' ? t('dashboard.dashboardView.openedLast30Days') : t('dashboard.dashboardView.allBoards');

  return (
    <div className="flex h-full flex-col bg-[var(--od-app-bg)]">
      <AppHeader onOpenPalette={() => setPaletteOpen(true)} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-4 md:px-8">
          {/* Título = espaço atual */}
          <div className="flex flex-wrap items-end justify-between gap-4 pt-8 md:pt-10">
            <div className="min-w-0">
              {inPlace && <ProjectEyebrow place={place} />}
              <h1 className="truncate font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[34px]">{inPlace ? (projectName ?? placeLabel(place, { teams, projects, workspace })) : tabs.find((x) => x.id === tab)?.label}</h1>
              <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
            </div>
            {canCreate.allowed && <NewBoardMenu onTemplates={() => goTab('templates')} />}
          </div>

          {/* Abas sublinhadas */}
          <div className="mt-6 flex items-end gap-1 border-b border-line">
            <div role="tablist" aria-label={t('dashboard.dashboardView.deskSections')} className="no-scrollbar -mb-px flex min-w-0 flex-1 gap-5 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => goTab(t.id)}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-0.5 text-[14px] font-semibold transition-colors duration-base ease-out',
                    tab === t.id ? 'border-brand-900 text-ink dark:border-brand-200' : 'border-transparent text-ink-subtle hover:text-ink',
                  )}
                >
                  {t.label}
                  {t.count !== undefined && <span className="text-xs font-medium tabular-nums text-ink-subtle">{t.count}</span>}
                </button>
              ))}
            </div>
          </div>
          {viewAs && (
            <div role="status" className="mt-4 flex items-center gap-2.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[13px] text-ink ring-1 ring-line">
              <ScanEye size={16} className="shrink-0 text-brand-800 dark:text-brand-200" />
              <span className="min-w-0 flex-1 truncate"><Trans k="board.boardBanners.viewingAsLabel" params={{ label: viewAs.labelKey ? t(viewAs.labelKey) : viewAs.label }} components={{ b: (c) => <strong>{c}</strong> }} /></span>
              <button type="button" className="od-btn od-btn-ghost od-btn-sm h-7" onClick={() => useAppStore.getState().setViewAs(null)}>{t('board.boardBanners.leaveSimulation')} <X size={13} /></button>
            </div>
          )}
          {/* Chat 08.5 · D: Modo Local com o servidor desta instalação disponível — fixa, sem dispensar */}
          <LocalModeBanner />
          {/* Chat 08.2: boards do Modo Local deste navegador que ainda não estão no servidor */}
          {!viewAs && <LocalImportBanner />}
          {/* Chat 08.5: e-mail ainda não confirmado (só com e-mail ligado no servidor) */}
          {!viewAs && <VerifyEmailBanner />}

          <div className="flex-1 pb-12">
            {tab === 'trash' && <TrashList />}

            {inPlace && teamRoot && place.kind === 'team' && <ProjectFolders teamId={place.teamId} />}

            {tab === 'all' && canCreate.allowed && (
              <div className="mt-6 grid animate-fade-in gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <ResumeCard board={lastOpened} onCreate={newBlank} />
                <StartList onSeeAll={() => goTab('templates')} />
              </div>
            )}

            {tab === 'all' && pinned.length > 0 && (
              <section className="mt-8" aria-labelledby="od-pinned-title">
                <h2 id="od-pinned-title" className="mb-2.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                  <Star size={13} />{' '}{t('dashboard.dashboardView.pinned')}</h2>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {pinned.slice(0, 8).map((b) => (
                    <BoardChip key={b.id} board={b} onOpen={() => openBoard(b.id)} onMenu={(el) => openMenu('board', el, b.id)} />
                  ))}
                </div>
              </section>
            )}

            {tab === 'templates' ? (
              <section className="mt-6 animate-fade-in">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-ink">{t('common.templates')}</h2>
                  <button type="button" data-od-menu-trigger className="od-btn od-btn-ghost od-btn-sm" onClick={(e) => openMenu('category', e.currentTarget)}>
                    {CATEGORY_LABELS[category]} <ChevronDown size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {START_TEMPLATES.filter((t) => t.category.includes(category)).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => startFromTemplate(tpl)}
                      className="group flex flex-col rounded-2xl bg-panel p-2 text-start ring-1 ring-line transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300"
                    >
                      <span className="relative block aspect-[150/92] overflow-hidden rounded-xl ring-1 ring-line">
                        <TemplateThumb kind={tpl.thumb} />
                        {tpl.plannedFor && (
                          <span className="absolute end-1.5 top-1.5 rounded-full bg-panel px-1.5 py-0.5 text-2xs font-semibold text-ink-muted ring-1 ring-line">{t('common.comingSoon')}</span>
                        )}
                      </span>
                      <span className="px-1.5 pb-1 pt-2.5">
                        <span className="block truncate text-[13px] font-semibold text-ink">{tpl.label}</span>
                        <span className="block truncate text-xs text-ink-subtle">{tpl.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <ScopedTemplates />
              </section>
            ) : tab === 'trash' ? null : (
              <section className="mt-8" aria-labelledby="od-boards-title">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="od-boards-title" className="text-lg font-bold text-ink">
                    {sectionTitle}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button type="button" data-od-menu-trigger className="od-btn od-btn-ghost od-btn-sm text-ink-muted" onClick={(e) => openMenu('sort', e.currentTarget)}>
                      <ArrowDownUp size={15} /> <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
                    </button>
                    <button
                      type="button"
                      data-od-menu-trigger
                      className={cn('od-btn od-btn-ghost od-btn-sm', kind === 'any' ? 'text-ink-muted' : 'text-brand-800 dark:text-brand-200')}
                      onClick={(e) => openMenu('filter', e.currentTarget)}
                    >
                      <Filter size={15} /> <span className="hidden sm:inline">{kind === 'any' ? t('common.type') : KIND_LABELS[kind]}</span>
                    </button>
                    <div className="ms-1 flex rounded-lg bg-panel-sunken p-0.5 ring-1 ring-line" role="group" aria-label={t('dashboard.dashboardView.viewMode')}>
                      <Tooltip label={t('dashboard.dashboardView.grid')}>
                        <button type="button" className="od-tool h-8 w-8" data-active={view === 'grid'} aria-pressed={view === 'grid'} onClick={() => changeView('grid')} aria-label={t('dashboard.dashboardView.gridView')}>
                          <LayoutGrid size={16} />
                        </button>
                      </Tooltip>
                      <Tooltip label={t('dashboard.dashboardView.list')}>
                        <button type="button" className="od-tool h-8 w-8" data-active={view === 'list'} aria-pressed={view === 'list'} onClick={() => changeView('list')} aria-label={t('dashboard.dashboardView.listView')}>
                          <List size={16} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                {visibleBoards.length === 0 ? (
                  <EmptyState tab={tab} filtered={kind !== 'any'} canCreate={canCreate.allowed} onCreate={newBlank} onClearFilter={() => setKind('any')} />
                ) : view === 'grid' ? (
                  <div className="grid animate-fade-in grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {visibleBoards.map((b) => (
                      <BoardCard key={b.id} board={b} onOpen={() => openBoard(b.id)} onMenu={(el) => openMenu('board', el, b.id)} />
                    ))}
                  </div>
                ) : (
                  <div className="animate-fade-in overflow-hidden rounded-2xl bg-panel ring-1 ring-line">
                    <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_130px_150px_72px] items-center gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-subtle md:grid">
                      <span>{t('common.name')}</span>
                      <span>{t('dashboard.dashboardView.usersOnline')}</span>
                      <span>{t('dashboard.dashboardView.space')}</span>
                      <span>{t('dashboard.dashboardView.lastOpened')}</span>
                      <span>{t('dashboard.dashboardView.owner')}</span>
                      <span />
                    </div>
                    {visibleBoards.map((b) => (
                      <BoardRow key={b.id} board={b} onOpen={() => openBoard(b.id)} onMenu={(el) => openMenu('board', el, b.id)} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Rodapé discreto */}
          <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line py-4 text-xs text-ink-subtle">
            <span className="font-semibold text-ink-muted">{t('dashboard.dashboardView.ludraw')}</span>
            <span aria-hidden="true">·</span>
            <span>{t('dashboard.dashboardView.openSourceMitLocalFirst')}</span>
            <span aria-hidden="true">·</span>
            {designSystem && (
              <>
                <button type="button" className="underline-offset-2 hover:text-ink hover:underline" onClick={() => navigate({ name: 'design-system' })}>{t('common.visualSystem')}</button>
                <span aria-hidden="true">·</span>
              </>
            )}
            <button type="button" className="underline-offset-2 hover:text-ink hover:underline" onClick={() => setPaletteOpen(true)}>{t('dashboard.dashboardView.quickSearchCtrlK')}</button>
          </footer>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {menu?.kind === 'board' && menu.boardId && <BoardActionsMenu boardId={menu.boardId} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {menu?.kind === 'sort' && (
        <Menu
          x={menu.x}
          y={menu.y}
          align="end"
          minWidth={220}
          onClose={() => setMenu(null)}
          items={[
            { kind: 'label', id: 'l', label: t('dashboard.dashboardView.sort') },
            ...(Object.keys(SORT_LABELS) as SortKey[]).map(
              (k): MenuItem => ({
                kind: 'radio',
                id: k,
                label: SORT_LABELS[k],
                checked: sort === k,
                onSelect: () => {
                  setSort(k);
                  writePref('ludraw:mesa-sort', k);
                  setMenu(null);
                },
              }),
            ),
          ]}
        />
      )}
      {menu?.kind === 'filter' && (
        <Menu
          x={menu.x}
          y={menu.y}
          align="end"
          minWidth={230}
          onClose={() => setMenu(null)}
          items={[
            { kind: 'label', id: 'l', label: t('dashboard.dashboardView.filterType') },
            ...(Object.keys(KIND_LABELS) as KindFilter[]).map(
              (k): MenuItem => ({
                kind: 'radio',
                id: k,
                label: KIND_LABELS[k],
                checked: kind === k,
                onSelect: () => {
                  setKind(k);
                  setMenu(null);
                },
              }),
            ),
          ]}
        />
      )}
      {menu?.kind === 'category' && (
        <Menu
          x={menu.x}
          y={menu.y}
          align="end"
          minWidth={220}
          onClose={() => setMenu(null)}
          items={(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((c) => ({
            kind: 'radio',
            id: c,
            label: CATEGORY_LABELS[c],
            checked: category === c,
            onSelect: () => {
              setCategory(c);
              setMenu(null);
            },
          }))}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function BoardIcon({ color }: { color: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1f` }}>
      <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: color }} />
    </span>
  );
}

/** Linha da visão em lista (a tabela do Chat 01). */
function BoardRow({ board, onOpen, onMenu }: { board: BoardMeta; onOpen: () => void; onMenu: (el: HTMLElement) => void }) {
  const t = useT();
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const user = useAppStore((s) => s.user);
  const place = useBoardPlaceLabel(board);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_72px] items-center gap-3 border-b border-line px-4 py-3 transition-colors duration-fast last:border-b-0 hover:bg-panel-hover md:grid-cols-[minmax(0,1fr)_120px_120px_130px_150px_72px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <BoardIcon color={board.color} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink">{board.name}</div>
          <div className="truncate text-xs text-ink-subtle">{t('dashboard.dashboardView.modifiedOwnernameRelativeday', { ownerName: personLabel(board.ownerName), relativeDay: formatRelativeDay(board.updatedAt) })}
          </div>
        </div>
      </div>
      <div className="hidden md:block">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold text-white ring-2 ring-[var(--od-panel)]"
          style={{ background: user?.color ?? '#194B32' }}
          title={t('common.you')}
        >
          {initials(user?.name ?? t('common.you'))}
        </span>
      </div>
      <span className="hidden truncate text-sm text-ink-muted md:block">{place}</span>
      <span className="hidden text-sm text-ink-muted md:block">{formatRelativeDay(board.lastOpenedAt)}</span>
      <span className="hidden truncate text-sm text-ink-muted md:block">{personLabel(board.ownerName)}</span>
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          className={cn('od-tool h-8 w-8', board.favorite ? 'text-favorite' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(board.id);
          }}
          aria-label={t('dashboard.dashboardView.addFavorites')}
        >
          <Star size={16} className={board.favorite ? 'fill-current' : undefined} />
        </button>
        <button
          type="button"
          data-od-menu-trigger
          className="od-tool h-8 w-8"
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

function EmptyState({ tab, filtered, canCreate, onCreate, onClearFilter }: { tab: Tab; filtered: boolean; canCreate: boolean; onCreate: () => void; onClearFilter: () => void }) {
  const t = useT();
  const title = filtered
    ? t('dashboard.dashboardView.noBoardsThisType')
    : tab === 'favorites'
      ? t('dashboard.dashboardView.noFavoritesYet')
      : tab === 'recent'
        ? t('dashboard.dashboardView.nothingOpenedLast30Days')
        : tab === 'mine'
          ? t('dashboard.dashboardView.youHaventCreatedAnyBoards')
          : canCreate
            ? t('dashboard.dashboardView.noBoardsHere')
            : t('workspace.dashboard.nothingShared');
  const text = filtered
    ? t('dashboard.dashboardView.changeTypeFilterClearSee')
    : tab === 'favorites'
      ? t('dashboard.dashboardView.starBoardsPinThemTop')
      : canCreate
        ? t('dashboard.dashboardView.createBoardStartSketchingYour')
        : t('workspace.dashboard.nothingSharedText');
  return (
    <div className="flex flex-col items-center rounded-2xl bg-panel px-6 py-14 text-center ring-1 ring-line">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-brand-900 dark:text-brand-200">
        {tab === 'favorites' ? <Star size={24} /> : <LayoutGrid size={24} />}
      </span>
      <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{text}</p>
      {filtered ? (
        <button type="button" className="od-btn od-btn-secondary mt-5" onClick={onClearFilter}>{t('dashboard.dashboardView.clearFilter')}</button>
      ) : (
        tab !== 'favorites' && canCreate && (
          <button type="button" className="od-btn od-btn-primary mt-5" onClick={onCreate}>
            <Plus size={16} />{' '}{t('dashboard.dashboardView.createBoard')}</button>
        )
      )}
    </div>
  );
}

/** Lixeira da pessoa (Chat 06): boards que ela excluiu ou dos quais é titular. Some sozinho após `trashRetentionDays`. */
function TrashList() {
  const t = useT();
  const boards = useAppStore((s) => s.boards);
  const directory = useAppStore((s) => s.directory);
  const policies = useAppStore((s) => policiesOf(s));
  const viewer = useViewer();
  const app = useAppStore.getState;
  const mine = useMemo(
    () => boards.filter((b) => b.deletedAt && (b.ownerId === viewer.userId || b.deletedBy === viewer.userId)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [boards, viewer.userId],
  );
  const report = (r: { ok: boolean; error?: string }, okMsg: string) => app().toast(r.ok ? okMsg : (r.error ?? ''), r.ok ? 'success' : 'danger');
  return (
    <section className="mt-6 animate-fade-in" aria-labelledby="od-trash-title">
      <h2 id="od-trash-title" className="text-lg font-bold text-ink">{t('dashboard.dashboardView.trash')}</h2>
      <p className="mt-0.5 text-sm text-ink-muted">{t('workspace.trash.intro', { count: policies.trashRetentionDays })}</p>
      {mine.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-panel px-6 py-12 text-center ring-1 ring-line">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-brand-900 dark:text-brand-200">
            <Trash2 size={22} />
          </span>
          <p className="mt-3 font-semibold text-ink">{t('workspace.trash.empty')}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl bg-panel ring-1 ring-line">
          {mine.map((b) => {
            const left = Math.max(0, Math.ceil(((trashExpiresAt(b, policies) ?? Date.now()) - Date.now()) / 86_400_000));
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <BoardIcon color={b.color} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{b.name}</div>
                  <div className="truncate text-xs text-ink-subtle">
                    {t('workspace.trash.deletedBy', { name: displayName(b.deletedBy, directory), when: formatRelativeDay(b.deletedAt ?? 0) })} · {t('workspace.trash.daysLeft', { count: left })}
                  </div>
                </div>
                <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => report(app().restoreBoard(b.id), t('workspace.trash.restored', { name: b.name }))}>
                  <ArchiveRestore size={15} /> {t('workspace.trash.restore')}
                </button>
                <button
                  type="button"
                  className="od-btn od-btn-ghost od-btn-sm text-danger"
                  onClick={() => {
                    if (window.confirm(t('workspace.trash.confirmPurge', { name: b.name }))) report(app().purgeBoard(b.id), t('workspace.trash.purged'));
                  }}
                >
                  <Trash2 size={15} /> {t('workspace.trash.purge')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Templates salvos (Chat 04: pessoais; Chat 06: também do Time e do Workspace, conforme `can()`). */
function ScopedTemplates() {
  const t = useT();
  const state = useAppStore();
  const visible = state.templates.filter((tpl) => templateAccess(state, tpl).view).sort((a, b) => b.createdAt - a.createdAt);
  const groups = [
    { id: 'personal' as const, title: t('dashboard.dashboardView.myTemplates'), list: visible.filter((x) => x.scope === 'personal') },
    { id: 'team' as const, title: t('workspace.templates.teamTitle'), list: visible.filter((x) => x.scope === 'team') },
    { id: 'workspace' as const, title: t('workspace.templates.workspaceTitle'), list: visible.filter((x) => x.scope === 'workspace') },
  ];
  return (
    <>
      {groups.map((g) =>
        g.id !== 'personal' && g.list.length === 0 ? null : (
          <div key={g.id} className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-bold text-ink">{g.title}</h3>
              {g.list.length > 0 && (
                <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={() => state.openModal({ type: 'templates', target: 'new', tab: g.id })}>
                  {t('dashboard.dashboardView.manage')}
                </button>
              )}
            </div>
            {g.list.length === 0 ? (
              <p className="rounded-2xl bg-panel px-4 py-5 text-sm text-ink-muted ring-1 ring-line">
                <Trans k="dashboard.dashboardView.insideBoardUseTemplatesSave" components={{ b: (c) => <strong className="text-ink">{c}</strong> }} />
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {g.list.map((tpl) => (
                  <SavedTemplateCard key={tpl.id} tpl={tpl} />
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </>
  );
}

function SavedTemplateCard({ tpl }: { tpl: TemplateEntity }) {
  const t = useT();
  const teams = useAppStore((s) => s.teams);
  const badge =
    tpl.scope === 'team'
      ? (teams.find((x) => x.id === tpl.teamId)?.name ?? t('workspace.templates.scopeTeam'))
      : tpl.scope === 'workspace'
        ? t('workspace.templates.scopeWorkspace')
        : t('dashboard.dashboardView.personal');
  return (
    <button
      type="button"
      onClick={() => useAppStore.getState().createBoard({ name: tpl.name, template: 'personal', data: JSON.parse(JSON.stringify(tpl.data)), open: true })}
      className="group flex flex-col rounded-2xl bg-panel p-2 text-start ring-1 ring-line transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300"
    >
      <span className="relative block aspect-[150/92] overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
        {isSafeImageSrc(tpl.thumbnail) ? <img src={tpl.thumbnail} alt="" className="h-full w-full object-cover" /> : <TemplateThumb kind="blank" />}
        <span className="absolute start-1.5 top-1.5 max-w-[80%] truncate rounded-full bg-panel px-1.5 py-0.5 text-2xs font-semibold text-ink-muted ring-1 ring-line">{badge}</span>
      </span>
      <span className="px-1.5 pb-1 pt-2.5">
        <span className="block truncate text-[13px] font-semibold text-ink">{tpl.name}</span>
        <span className="block truncate text-xs text-ink-subtle">{tpl.description || formatCount('object', tpl.data.elementOrder.length)}</span>
      </span>
    </button>
  );
}
