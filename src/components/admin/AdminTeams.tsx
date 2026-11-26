import { useState } from 'react';
import { Archive, ArchiveRestore, Folder, FolderPlus, LayoutTemplate, Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ProjectFolder, TeamEntity } from '../../types/workspace';
import { compareText } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { AdminSection, ConfirmButton, EmptyRow, Tag, Toggle } from './adminUi';

export function AdminTeams() {
  const t = useT();
  const s = useAppStore();
  const [showArchived, setShowArchived] = useState(false);
  const teams = s.teams.filter((x) => showArchived || !x.archivedAt).sort((a, b) => compareText(a.name, b.name));
  return (
    <>
      <AdminSection
        title={t('admin.teams.title', { count: s.teams.filter((x) => !x.archivedAt).length })}
        description={t('admin.teams.description')}
        aside={
          <button type="button" className="od-btn od-btn-primary od-btn-sm" onClick={() => s.openModal({ type: 'team-edit' })}>
            <Plus size={15} /> {t('admin.teams.newTeam')}
          </button>
        }
      >
        <Toggle checked={showArchived} onChange={setShowArchived} label={t('admin.teams.showArchived')} />
        {teams.length === 0 ? <EmptyRow>{t('admin.teams.empty')}</EmptyRow> : <div className="mt-2 space-y-3">{teams.map((tm) => <TeamCard key={tm.id} team={tm} showArchived={showArchived} />)}</div>}
      </AdminSection>
    </>
  );
}

function TeamCard({ team, showArchived }: { team: TeamEntity; showArchived: boolean }) {
  const t = useT();
  const s = useAppStore();
  const report = (r: { ok: boolean; error?: string }, okText: string) => s.toast(r.ok ? okText : (r.error ?? ''), r.ok ? 'success' : 'danger');
  const projects = s.projects.filter((p) => p.teamId === team.id && (showArchived || !p.archivedAt)).sort((a, b) => compareText(a.name, b.name));
  const boardsOf = (projectId: string | null) => s.boards.filter((b) => !b.deletedAt && b.teamId === team.id && (projectId === null ? !b.projectId : b.projectId === projectId)).length;
  const members = team.memberIds.map((id) => s.directory.find((a) => a.id === id)).filter(Boolean);
  const templates = s.templates.filter((tpl) => tpl.scope === 'team' && tpl.teamId === team.id);
  return (
    <div className={`rounded-xl ring-1 ring-line ${team.archivedAt ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: team.color }}><UsersRound size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-ink">{team.name}</span>
            {team.archivedAt && <Tag tone="warning">{t('admin.teams.archived')}</Tag>}
          </div>
          <div className="truncate text-xs text-ink-subtle">{team.description || t('admin.teams.membersCount', { count: members.length })}</div>
        </div>
        <div className="flex gap-1">
          <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => s.openModal({ type: 'team-edit', teamId: team.id })}>
            <Pencil size={14} /> {t('admin.teams.edit')}
          </button>
          {!team.archivedAt && (
            <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => s.openModal({ type: 'project-edit', teamId: team.id })}>
              <FolderPlus size={14} /> {t('admin.teams.newProject')}
            </button>
          )}
          {team.archivedAt ? (
            <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => report(s.setTeamArchived(team.id, false), t('admin.teams.unarchived'))}>
              <ArchiveRestore size={14} /> {t('admin.teams.unarchive')}
            </button>
          ) : (
            <ConfirmButton danger={false} icon={<Archive size={14} />} label={t('admin.teams.archive')} onConfirm={() => report(s.setTeamArchived(team.id, true), t('admin.teams.archivedToast'))} />
          )}
        </div>
      </div>

      <div className="border-t border-line px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <span className="font-semibold text-ink">{t('admin.teams.members')}</span>
          {members.length ? members.map((a) => <Tag key={a!.id}>{a!.name}</Tag>) : <span>{t('admin.teams.noMembers')}</span>}
        </div>
      </div>

      <div className="border-t border-line">
        <ProjectRow name={t('admin.teams.teamRoot')} count={boardsOf(null)} />
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} name={p.name} count={boardsOf(p.id)} />
        ))}
      </div>

      <div className="border-t border-line px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <LayoutTemplate size={13} />
          <span className="font-semibold text-ink">{t('admin.teams.templates', { count: templates.length })}</span>
          {templates.map((tpl) => (
            <span key={tpl.id} className="inline-flex items-center gap-1 rounded-full bg-panel-sunken px-2 py-0.5 ring-1 ring-line">
              {tpl.name}
              <button type="button" className="text-ink-subtle hover:text-danger" onClick={() => s.deleteTemplate(tpl.id)} aria-label={t('modals.templatesModal.deleteTemplate')}>
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {templates.length === 0 && <span>{t('admin.teams.noTemplates')}</span>}
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ project, name, count }: { project?: ProjectFolder; name: string; count: number }) {
  const t = useT();
  const s = useAppStore();
  const report = (r: { ok: boolean; error?: string }, okText: string) => s.toast(r.ok ? okText : (r.error ?? ''), r.ok ? 'success' : 'danger');
  const otherTeams = s.teams.filter((x) => !x.archivedAt && x.id !== project?.teamId);
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 first:border-t-0 ${project?.archivedAt ? 'opacity-60' : ''}`}>
      <Folder size={15} className="text-ink-subtle" />
      <span className={`min-w-0 flex-1 truncate text-sm ${project ? 'text-ink' : 'italic text-ink-muted'}`}>{name}</span>
      <span className="text-xs tabular-nums text-ink-subtle">{t('admin.teams.boardsCount', { count })}</span>
      {project && (
        <div className="flex items-center gap-1">
          <button type="button" className="od-tool h-8 w-8" onClick={() => s.openModal({ type: 'project-edit', projectId: project.id })} aria-label={t('admin.teams.renameProject')}>
            <Pencil size={14} />
          </button>
          {otherTeams.length > 0 && !project.archivedAt && (
            <select className="od-input h-8 w-auto text-[12.5px]" value="" onChange={(e) => e.target.value && report(s.moveProject(project.id, e.target.value), t('admin.teams.projectMoved'))} aria-label={t('admin.teams.moveProject')}>
              <option value="">{t('admin.teams.moveProject')}</option>
              {otherTeams.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
          )}
          {project.archivedAt ? (
            <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => report(s.setProjectArchived(project.id, false), t('admin.teams.unarchived'))}>
              <ArchiveRestore size={14} />
            </button>
          ) : (
            <ConfirmButton danger={false} icon={<Archive size={14} />} label={t('admin.teams.archive')} onConfirm={() => report(s.setProjectArchived(project.id, true), t('admin.teams.archivedToast'))} />
          )}
        </div>
      )}
    </div>
  );
}
