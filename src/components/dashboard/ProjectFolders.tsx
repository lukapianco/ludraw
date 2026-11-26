import { ArrowLeft, Folder, FolderPlus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { teamProjects, type Place } from '../../utils/workspace';
import { useVisibleBoards, useWorkspaceCan } from '../../hooks/useWorkspace';
import { useT } from '../../i18n/useT';
import { compareText } from '../../i18n/format';

/**
 * Chat 06 — projetos como PASTAS na Mesa: num time, os projetos aparecem como cartões de pasta antes
 * dos boards soltos do time; clicar entra no projeto. Diferença de mercado: a pasta mostra a cor do
 * time e a contagem de boards, e entrar nela muda a trilha do cabeçalho (sem árvore lateral).
 */
export function ProjectFolders({ teamId }: { teamId: string }) {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const team = useAppStore((s) => s.teams.find((x) => x.id === teamId));
  const setCurrentPlace = useAppStore((s) => s.setCurrentPlace);
  const openModal = useAppStore((s) => s.openModal);
  const boards = useVisibleBoards();
  const canCreate = useWorkspaceCan('workspace.projects.create');
  const list = teamProjects(teamId, projects).sort((a, b) => compareText(a.name, b.name));
  if (!team || (list.length === 0 && !canCreate.allowed)) return null;
  return (
    <section className="mt-8" aria-labelledby="od-projects-title">
      <h2 id="od-projects-title" className="mb-3 text-lg font-bold text-ink">{t('workspace.dashboard.projectsTitle', { count: list.length })}</h2>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {list.map((p) => {
          const count = boards.filter((b) => b.projectId === p.id).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCurrentPlace({ kind: 'team', teamId, projectId: p.id })}
              className="group flex items-center gap-3 rounded-2xl bg-panel p-3.5 text-start ring-1 ring-line transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-pop hover:ring-brand-300"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${team.color}22`, color: team.color }}>
                <Folder size={22} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink">{p.name}</span>
                <span className="block truncate text-xs text-ink-subtle">{t('admin.teams.boardsCount', { count })}{p.description ? ` · ${p.description}` : ''}</span>
              </span>
            </button>
          );
        })}
        {canCreate.allowed && (
          <button
            type="button"
            onClick={() => openModal({ type: 'project-edit', teamId })}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong p-3.5 text-start text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-panel-sunken">
              <FolderPlus size={20} />
            </span>
            <span className="text-[13px] font-semibold">{t('workspace.project.newTitle')}</span>
          </button>
        )}
      </div>
    </section>
  );
}

/** Cabeçalho de quem está dentro de um projeto: "Projeto · Time" e voltar ao time. */
export function ProjectEyebrow({ place }: { place: Place }) {
  const t = useT();
  const team = useAppStore((s) => (place.kind === 'team' ? s.teams.find((x) => x.id === place.teamId) : undefined));
  const setCurrentPlace = useAppStore((s) => s.setCurrentPlace);
  if (place.kind !== 'team' || !place.projectId || !team) return null;
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
      <button type="button" className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-ink-muted hover:bg-panel-hover hover:text-ink" onClick={() => setCurrentPlace({ kind: 'team', teamId: team.id })}>
        <ArrowLeft size={14} /> {team.name}
      </button>
      <span className="inline-flex items-center gap-1 rounded-full bg-panel-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-muted ring-1 ring-line">
        <Folder size={12} style={{ color: team.color }} /> {t('workspace.dashboard.projectOf', { team: team.name })}
      </span>
    </div>
  );
}
