import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CommandRegistry, PanelRegistry, useRegistry } from '../../extensions/registries';
import { useExtensionRuntimeStore } from '../../store/useExtensionRuntimeStore';
import { createPortal } from 'react-dom';
import {
  Clock,
  CornerDownLeft,
  FolderInput,
  LayoutGrid,
  LayoutTemplate,
  ListOrdered,
  LogOut,
  Moon,
  Palette,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Users,
  Building2,
  FolderPlus,
  Trash2,
  UsersRound, Puzzle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { importBackup } from '../../utils/boardActions';
import { cn } from '../../utils/cn';
import { shortcutLabel } from '../../utils/format';
import { startFromTemplate, templateById } from './templates';
import { timeAgo } from './BoardCard';
import { useViewer, useVisibleBoards, useWorkspaceCan } from '../../hooks/useWorkspace';
import { useDesignSystemEnabled } from '../../hooks/useDesignSystemGate';
import { indexBoards, searchContent, type ContentHit } from '../../utils/globalSearch';
import { ELEMENT_TYPE_LABELS } from '../../utils/factory';
import { boardPlaceLabel } from '../../utils/workspaceDisplay';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Paleta de busca da Mesa (Ctrl+K): encontra boards pelo nome e pelo lugar (Time/Projeto), procura DENTRO
 * dos boards (Chat 06 · B — busca global profunda, só no que a pessoa pode ver) e executa ações.
 * Setas ↑↓ escolhem, Enter executa, Esc fecha.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return createPortal(<PaletteInner onClose={onClose} />, document.body);
}

function PaletteInner({ onClose }: { onClose: () => void }) {
  const t = useT();
  // Chat 06: só os boards que a pessoa pode ver
  const boards = useVisibleBoards();
  const placeCtx = { teams: useAppStore((s) => s.teams), projects: useAppStore((s) => s.projects), workspace: useAppStore((s) => s.workspace) };
  const admin = useWorkspaceCan('workspace.admin.view');
  // Chat 09 · R5: desligado, a entrada some da lista E da busca
  const designSystem = useDesignSystemEnabled();
  const teamsManage = useWorkspaceCan('workspace.teams.manage');
  const projectsCreate = useWorkspaceCan('workspace.projects.create');
  const invite = useWorkspaceCan('workspace.members.invite');
  const theme = useAppStore((s) => s.theme);
  const [query, setQuery] = useState('');
  // Chat 06 · B: busca no conteúdo (índice montado em segundo plano a partir do BoardRepository)
  const viewer = useViewer();
  const [hits, setHits] = useState<ContentHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void indexBoards(boards, viewer.userId).then(() => {
        if (!alive) return;
        setHits(searchContent(boards, q));
        setSearching(false);
      });
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, boards, viewer.userId]);
  const [active, setActive] = useState(0);
  const extensionCommands = useRegistry(CommandRegistry);
  const extensionPanels = useRegistry(PanelRegistry);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const entries = useMemo<Entry[]>(() => {
    const app = useAppStore.getState;
    const q = normalize(query.trim());
    // Chat 08.2 (o antigo Painel → Favoritos/Recentes): só boards que a pessoa pode abrir (visíveis, fora da lixeira)
    const openable = boards.filter((b) => !b.deletedAt && !b.transient);
    const toEntry = (group: string, prefix: string) => (b: (typeof boards)[number]): Entry => ({
      id: `${prefix}-${b.id}`,
      group,
      label: b.name,
      hint: `${boardPlaceLabel(b, placeCtx)} · ${timeAgo(b.lastOpenedAt)}`,
      icon: <span className="h-3 w-3 rounded-[4px]" style={{ background: b.color }} />,
      run: () => app().navigate({ name: 'board', id: b.id }),
    });
    const favoriteEntries: Entry[] = q ? [] : openable.filter((b) => b.favorite).slice(0, 6).map(toEntry(t('studio.palette.favorites'), 'fav'));
    const recentEntries: Entry[] = q ? [] : [...openable].filter((b) => b.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 6).map(toEntry(t('studio.palette.recent'), 'recent'));
    const boardEntries: Entry[] = !q ? [...favoriteEntries, ...recentEntries] : [...openable]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .filter((b) => !q || normalize(b.name).includes(q) || normalize(boardPlaceLabel(b, placeCtx)).includes(q))
      .slice(0, q ? 12 : 5)
      .map((b) => ({
        id: `board-${b.id}`,
        group: t('dashboard.commandPalette.boards'),
        label: b.name,
        hint: `${boardPlaceLabel(b, placeCtx)} · ${timeAgo(b.lastOpenedAt)}`,
        icon: <span className="h-3 w-3 rounded-[4px]" style={{ background: b.color }} />,
        run: () => app().navigate({ name: 'board', id: b.id }),
      }));

    const welcome = templateById('welcome');
    const actions: Entry[] = [
      { id: 'new', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.newBlankBoard'), keywords: t('dashboard.commandPalette.createNew'), icon: <Plus size={16} />, run: () => app().createBoard({ template: 'blank', open: true }) },
      {
        id: 'welcome',
        group: t('dashboard.commandPalette.actions'),
        label: t('dashboard.commandPalette.newGuidedBoardStartHere'),
        keywords: t('dashboard.commandPalette.tutorialWelcomeKeywords'),
        icon: <ListOrdered size={16} />,
        run: () => welcome && startFromTemplate(welcome),
      },
      { id: 'import', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.importBackupLudraw'), keywords: t('dashboard.commandPalette.restoreFile'), icon: <FolderInput size={16} />, run: () => void importBackup() },
      { id: 'all', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.seeAllBoards'), icon: <LayoutGrid size={16} />, run: () => app().navigate({ name: 'dashboard', section: 'home' }) },
      { id: 'fav', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.seeFavorites'), icon: <Star size={16} />, run: () => app().navigate({ name: 'dashboard', section: 'favorites' }) },
      { id: 'recent', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.seeRecent'), icon: <Clock size={16} />, run: () => app().navigate({ name: 'dashboard', section: 'recent' }) },
      { id: 'templates', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.seeTemplates'), keywords: t('dashboard.commandPalette.templatesKeywords'), icon: <LayoutTemplate size={16} />, run: () => app().navigate({ name: 'dashboard', section: 'templates' }) },
      ...(invite.allowed ? [{ id: 'members', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.inviteMembers'), keywords: t('dashboard.commandPalette.teamUsers'), icon: <Users size={16} />, run: () => app().openModal({ type: 'invite' }) }] : []),
      ...(admin.allowed ? [{ id: 'admin', group: t('dashboard.commandPalette.actions'), label: t('admin.nav.title'), keywords: t('workspace.palette.adminKeywords'), icon: <Building2 size={16} />, run: () => app().navigate({ name: 'admin', section: 'overview' }) }] : []),
      ...(teamsManage.allowed ? [{ id: 'new-team', group: t('dashboard.commandPalette.actions'), label: t('workspace.switcher.newTeam'), icon: <UsersRound size={16} />, run: () => app().openModal({ type: 'team-edit' }) }] : []),
      ...(projectsCreate.allowed ? [{ id: 'new-project', group: t('dashboard.commandPalette.actions'), label: t('workspace.switcher.newProject'), icon: <FolderPlus size={16} />, run: () => app().openModal({ type: 'project-edit' }) }] : []),
      { id: 'trash', group: t('dashboard.commandPalette.actions'), label: t('workspace.palette.openTrash'), icon: <Trash2 size={16} />, run: () => app().navigate({ name: 'dashboard', section: 'trash' }) },
      { id: 'settings', group: t('dashboard.commandPalette.actions'), label: t('common.settings'), keywords: t('dashboard.commandPalette.profilePreferences'), icon: <Settings size={16} />, run: () => app().navigate({ name: 'settings', tab: 'profile' }) },
      ...(designSystem ? [{ id: 'ds', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.visualSystemDesignSystem'), keywords: t('dashboard.commandPalette.tokensColors'), icon: <Palette size={16} />, run: () => app().navigate({ name: 'design-system' }) }] : []),
      {
        id: 'theme',
        group: t('dashboard.commandPalette.actions'),
        label: theme === 'dark' ? t('dashboard.commandPalette.switchLightMode') : t('dashboard.commandPalette.switchDarkMode'),
        keywords: t('dashboard.commandPalette.themeDarkLight'),
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        run: () => app().toggleTheme(),
      },
      { id: 'logout', group: t('dashboard.commandPalette.actions'), label: t('dashboard.commandPalette.signOut'), keywords: t('dashboard.commandPalette.logoutSignOut'), icon: <LogOut size={16} />, run: () => app().logout() },
    ];
    const filteredActions = q ? actions.filter((a) => normalize(`${a.label} ${a.keywords ?? ''}`).includes(q)) : actions.slice(0, 6);
    const byId = new Map(boards.map((b) => [b.id, b]));
    const contentEntries: Entry[] = hits.map((h, i) => {
      const b = byId.get(h.boardId);
      return {
        id: `content-${h.boardId}-${h.elementId}-${i}`,
        group: t('workspace.search.inBoards'),
        label: h.snippet,
        hint: t('workspace.search.hitHint', { board: b?.name ?? '', type: ELEMENT_TYPE_LABELS[h.type] ?? h.type }),
        icon: <span className="h-3 w-3 rounded-[4px]" style={{ background: b?.color ?? 'var(--od-brand-600)' }} />,
        run: () => app().navigate({ name: 'board', id: h.boardId, focus: h.elementId }),
      };
    });
    // Chat 06.5 · B: comandos de extensões (só dentro de um board — eles agem sobre o board aberto)
    const inBoard = app().route.name === 'board';
    const commandEntries: Entry[] = inBoard
      ? extensionCommands
          .filter((c) => !q || normalize(`${c.label} ${c.keywords.join(' ')}`).includes(q))
          .map((c) => ({ id: `ext-${c.id}`, group: t('extensions.palette.group'), label: c.label, keywords: c.keywords.join(' '), icon: <Puzzle size={16} />, run: () => c.run() }))
          .concat(
            // Chat 08.2: painéis das extensões abrem na janela flutuante
            extensionPanels
              .filter((p) => !q || normalize(p.label).includes(q))
              .map((p) => ({ id: `panel-${p.id}`, group: t('extensions.palette.group'), label: t('studio.extension.openPanel', { name: p.label }), keywords: p.label, icon: <Puzzle size={16} />, run: () => useExtensionRuntimeStore.getState().setOpenPanel(p.id) })),
          )
      : [];
    return [...commandEntries, ...boardEntries, ...contentEntries, ...filteredActions];
  }, [extensionCommands, extensionPanels, boards, hits, query, theme, t, admin.allowed, designSystem, teamsManage.allowed, projectsCreate.allowed, invite.allowed, placeCtx.teams, placeCtx.projects, placeCtx.workspace]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run();
  };

  let lastGroup: Entry['group'] | null = null;

  return (
    <div
      className="fixed inset-0 z-[960] flex animate-fade-in items-start justify-center bg-[rgba(12,22,16,0.32)] px-4 pt-[12vh] backdrop-blur-[2px] dark:bg-[rgba(0,0,0,0.5)]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-od-menu
    >
      <div role="dialog" aria-modal="true" aria-label={t('dashboard.commandPalette.searchBoardsActions')} className="w-full max-w-[580px] animate-modal-in overflow-hidden rounded-2xl bg-panel shadow-modal">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={18} className="shrink-0 text-ink-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(entries.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(entries[active]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={t('dashboard.commandPalette.searchBoardsTypeAction')}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle focus-visible:shadow-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="od-palette-list"
            aria-activedescendant={entries[active] ? `od-pal-${entries[active].id}` : undefined}
          />
          <span className="od-kbd rounded-md bg-panel-sunken px-1.5 py-0.5 ring-1 ring-line">Esc</span>
        </div>
        <div ref={listRef} id="od-palette-list" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
          {searching && <div className="px-3 py-2 text-xs text-ink-subtle" role="status">{t('workspace.search.searching')}</div>}
          {entries.length === 0 && !searching && <div className="px-3 py-8 text-center text-sm text-ink-subtle">{t('dashboard.commandPalette.nothingFoundQuery', { query })}</div>}
          {entries.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <div key={entry.id}>
                {header && <div className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{header}</div>}
                <button
                  type="button"
                  id={`od-pal-${entry.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  data-open={i === active}
                  className={cn('od-menu-item min-h-[40px] gap-3')}
                  onPointerMove={() => setActive(i)}
                  onClick={() => run(entry)}
                >
                  <span className="flex w-5 shrink-0 justify-center text-ink-muted">{entry.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.hint && <span className="shrink-0 truncate text-xs text-ink-subtle">{entry.hint}</span>}
                  {i === active && <CornerDownLeft size={14} className="shrink-0 text-ink-subtle" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-xs text-ink-subtle">
          <span>
            <Trans k="dashboard.commandPalette.choose" components={{ kbd: (c) => <span className="od-kbd">{c}</span> }} /></span>
          <span>
            <Trans k="dashboard.commandPalette.enterOpen" components={{ kbd: (c) => <span className="od-kbd">{c}</span> }} /></span>
          <span className="ms-auto">
            <span className="od-kbd">{shortcutLabel('Ctrl + K')}</span>{' '}{t('dashboard.commandPalette.opensThisSearch')}</span>
        </div>
      </div>
    </div>
  );
}
