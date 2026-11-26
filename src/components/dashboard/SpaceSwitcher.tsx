import { useState, type ReactNode } from 'react';
import { Building2, ChevronDown, ChevronRight, Folder, FolderPlus, Inbox, Lock, Settings2, UserPlus, UsersRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import { Menu, type MenuItem } from '../ui/Menu';
import { useT } from '../../i18n/useT';
import { boardInPlace, samePlace, teamProjects, visibleTeams, type Place } from '../../utils/workspace';
import { placeLabel } from '../../utils/workspaceDisplay';
import { useEffectivePlace, useViewer, useVisibleBoards, useWorkspaceCan, useWsView } from '../../hooks/useWorkspace';

/**
 * Seletor de espaço em trilha (`Organização › Time › Projeto`) no cabeçalho da Mesa — Chat 06.
 * Uma instalação = uma organização: o primeiro nível é sempre o workspace; depois vêm o Espaço
 * Pessoal, "Compartilhados comigo", "Geral" e os times (com seus projetos). O rodapé traz
 * "Gerenciar workspace", "+ Novo time" e "+ Novo projeto" conforme `can()`.
 */
export function SpaceSwitcher({ className }: { className?: string }) {
  const t = useT();
  const s = useAppStore();
  const viewer = useViewer();
  const ws = useWsView();
  const boards = useVisibleBoards();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const admin = useWorkspaceCan('workspace.admin.view');
  const teamsManage = useWorkspaceCan('workspace.teams.manage');
  const projectsCreate = useWorkspaceCan('workspace.projects.create');
  const place = useEffectivePlace();
  const teams = visibleTeams(viewer, s.teams);
  // emenda v1.1 §11: conta isolada ("Continuar sem conta") não participa da organização
  const isolated = !!viewer.isolated;
  const internal = !isolated && (viewer.workspaceRole === 'admin' || viewer.workspaceRole === 'member');
  const orgLabel = isolated ? t('workspace.isolated.label') : s.workspace.name;
  const usableTeam = teams.find((tm) => viewer.workspaceRole === 'admin' || viewer.teamIds.includes(tm.id));
  const teamOfPlace = place.kind === 'team' ? s.teams.find((x) => x.id === place.teamId) : undefined;
  const projectOfPlace = place.kind === 'team' && place.projectId ? s.projects.find((p) => p.id === place.projectId) : undefined;

  const go = (p: Place) => {
    s.setCurrentPlace(p);
    s.navigate({ name: 'dashboard', section: 'home' });
    setMenu(null);
  };
  const radio = (id: string, p: Place, label: string, icon: ReactNode): MenuItem => ({
    kind: 'radio',
    id,
    label: t('dashboard.spaceSwitcher.spaceBoardCount', { space: label, count: boards.filter((b) => boardInPlace(b, p, viewer, ws)).length }),
    icon,
    checked: samePlace(place, p),
    onSelect: () => go(p),
  });

  const items: MenuItem[] = [
    { kind: 'label', id: 'org', label: orgLabel },
    ...(internal || isolated ? [radio('personal', { kind: 'personal' }, placeLabel({ kind: 'personal' }, s), <Lock size={15} />)] : []),
    ...(isolated ? [] : [radio('shared', { kind: 'shared' }, placeLabel({ kind: 'shared' }, s), <Inbox size={15} />)]),
    ...(internal ? [radio('general', { kind: 'workspace' }, placeLabel({ kind: 'workspace' }, s), <Building2 size={15} />)] : []),
  ];
  if (teams.length) {
    items.push({ kind: 'separator', id: 's-teams' }, { kind: 'label', id: 'l-teams', label: t('workspace.switcher.teams') });
    for (const tm of teams) {
      items.push(radio(`team-${tm.id}`, { kind: 'team', teamId: tm.id }, tm.name, <UsersRound size={15} style={{ color: tm.color }} />));
      for (const p of teamProjects(tm.id, s.projects)) {
        items.push(radio(`project-${p.id}`, { kind: 'team', teamId: tm.id, projectId: p.id }, t('workspace.switcher.projectItem', { name: p.name }), <Folder size={15} />));
      }
    }
  }
  items.push({ kind: 'separator', id: 's-actions' });
  if (admin.allowed) items.push({ kind: 'item', id: 'manage', label: t('workspace.switcher.manage'), icon: <Settings2 size={16} />, onSelect: () => s.navigate({ name: 'admin', section: 'overview' }) });
  if (teamsManage.allowed) items.push({ kind: 'item', id: 'new-team', label: t('workspace.switcher.newTeam'), icon: <UsersRound size={16} />, onSelect: () => s.openModal({ type: 'team-edit' }) });
  if (internal) {
    items.push({
      kind: 'item',
      id: 'new-project',
      label: t('workspace.switcher.newProject'),
      icon: <FolderPlus size={16} />,
      disabled: !projectsCreate.allowed || !usableTeam,
      hint: !projectsCreate.allowed ? projectsCreate.reason : !usableTeam ? t('workspace.project.noTeams') : undefined,
      onSelect: () => s.openModal({ type: 'project-edit', teamId: place.kind === 'team' ? place.teamId : usableTeam?.id }),
    });
    if (!admin.allowed) items.push({ kind: 'item', id: 'invite', label: t('dashboard.spaceSwitcher.membersInvitations'), icon: <UserPlus size={16} />, onSelect: () => s.openModal({ type: 'invite' }) });
  }

  const crumbs: string[] = place.kind === 'team' ? [teamOfPlace?.name ?? '', ...(projectOfPlace ? [projectOfPlace.name] : [])] : [placeLabel(place, s)];

  return (
    <>
      <nav aria-label={t('dashboard.spaceSwitcher.currentSpace')} className={cn('flex min-w-0 items-center', className)}>
        <button
          type="button"
          data-od-menu-trigger
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(e) => {
            if (menu) {
              setMenu(null);
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 6 });
          }}
          className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-ink transition-colors duration-base hover:bg-panel-hover"
        >
          <span className="h-3 w-3 shrink-0 rounded-[4px] bg-brand-600" style={teamOfPlace ? { background: teamOfPlace.color } : undefined} aria-hidden="true" />
          <span className="hidden max-w-[140px] truncate text-ink-subtle lg:inline">{orgLabel}</span>
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight size={13} className={cn('shrink-0 text-ink-subtle', i === 0 && 'hidden lg:block')} aria-hidden="true" />
              <span className="max-w-[180px] truncate">{c}</span>
            </span>
          ))}
          <ChevronDown size={14} className="shrink-0 text-ink-subtle" />
        </button>
      </nav>
      {menu && <Menu items={items} x={menu.x} y={menu.y} minWidth={280} onClose={() => setMenu(null)} />}
    </>
  );
}
