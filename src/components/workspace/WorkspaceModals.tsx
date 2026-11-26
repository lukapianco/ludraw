import { useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, FolderInput, FolderPlus, Lock, MailPlus, UsersRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TEAM_COLORS, currentViewer } from '../../store/workspaceSlice';
import type { BoardRole, WorkspaceRole } from '../../types/workspace';
import { BOARD_ROLE_LABEL_KEYS } from '../../utils/permissions';
import { INVITE_LIFETIME_DAYS, canUsePlace, placeOf, samePlace, teamProjects, visibleTeams, type Place } from '../../utils/workspace';
import { placeLabel, roleLabel } from '../../utils/workspaceDisplay';
import { absoluteHashUrl } from '../../utils/router';
import { copyText } from '../../utils/clipboardText';
import { cn } from '../../utils/cn';
import { useBoardCan, useOrgMembers, useVisibleBoards, useViewer, useWorkspaceCan } from '../../hooks/useWorkspace';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { isServerMode } from '../../utils/serverConfig';
import { SendEmailCheck } from '../admin/AccessAdmin';

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-ink-muted';

/* ------------------------------- Mover para ------------------------------- */

/** "Mover para…": Espaço Pessoal, Geral da organização ou Time › Projeto (só destinos que a pessoa pode usar). */
export function MoveBoardModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const meta = s.boards.find((b) => b.id === boardId);
  const viewer = useViewer();
  const move = useBoardCan(boardId, 'board.move');
  const [target, setTarget] = useState<Place | null>(null);
  if (!meta) return null;
  const current = placeOf(meta);
  const teams = visibleTeams(viewer, s.teams);
  const options: { place: Place; label: string; depth: number }[] = [
    { place: { kind: 'personal' }, label: placeLabel({ kind: 'personal' }, s), depth: 0 },
    { place: { kind: 'workspace' }, label: placeLabel({ kind: 'workspace' }, s), depth: 0 },
    ...teams.flatMap((tm) => [
      { place: { kind: 'team', teamId: tm.id } as Place, label: tm.name, depth: 0 },
      ...teamProjects(tm.id, s.projects).map((p) => ({ place: { kind: 'team', teamId: tm.id, projectId: p.id } as Place, label: p.name, depth: 1 })),
    ]),
  ];
  const confirm = () => {
    if (!target) return;
    const r = s.moveBoard(boardId, target);
    if (!r.ok) return s.toast(r.error, 'danger');
    s.toast(t('workspace.move.done', { name: meta.name, place: placeLabel(target, s) }), 'success');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      icon={<FolderInput size={20} />}
      title={t('workspace.move.title')}
      description={t('workspace.move.description', { name: meta.name, place: placeLabel(current, s) })}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!target || !move.allowed || samePlace(target, current)} onClick={confirm}>{t('workspace.move.confirm')}</button>
        </>
      }
    >
      {!move.allowed && <p className="mb-3 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">{move.reason}</p>}
      <div role="radiogroup" aria-label={t('workspace.move.destinations')} className="-m-1 max-h-[50vh] space-y-0.5 overflow-y-auto p-1">
        {options.map((o) => {
          const allowed = canUsePlace(viewer, o.place, s.teams, s.projects);
          const isCurrent = samePlace(o.place, current);
          const checked = !!target && samePlace(target, o.place);
          return (
            <button
              key={JSON.stringify(o.place)}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={!allowed || isCurrent || !move.allowed}
              title={!allowed ? t('workspace.errors.placeNotAllowed') : undefined}
              onClick={() => setTarget(o.place)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                o.depth ? 'ps-9' : '',
                checked ? 'bg-accent-soft text-ink ring-1 ring-selection' : 'hover:bg-panel-hover',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
              {isCurrent && <span className="text-xs text-ink-subtle">{t('workspace.move.current')}</span>}
              {!allowed && <Lock size={13} className="text-ink-subtle" />}
              {checked && <Check size={15} className="text-brand-800 dark:text-brand-200" />}
            </button>
          );
        })}
      </div>
      {teams.length === 0 && <p className="mt-3 text-xs text-ink-subtle">{t('workspace.move.noTeams')}</p>}
    </Modal>
  );
}

/* --------------------------------- Convite --------------------------------- */

type InviteRole = Exclude<WorkspaceRole, 'visitor'>;

/** Convite por link/código copiável (sem e-mail no modo local). Convidado B2B fica restrito a um projeto ou board. */
export function InviteModal({ role: initialRole, teamIds: initialTeams, projectId: initialProject, boardId: initialBoard, onClose }: { role?: WorkspaceRole; teamIds?: string[]; projectId?: string; boardId?: string; onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const viewer = useViewer();
  const boards = useVisibleBoards();
  const canMembers = useWorkspaceCan('workspace.members.invite');
  const canAdmins = useWorkspaceCan('workspace.members.manage');
  const canGuests = useWorkspaceCan('workspace.guests.invite');
  const roles: { id: InviteRole; allowed: boolean; reason?: string }[] = [
    { id: 'member', allowed: canMembers.allowed, reason: canMembers.reason },
    { id: 'guest_b2b', allowed: canGuests.allowed, reason: canGuests.reason },
    { id: 'admin', allowed: canAdmins.allowed, reason: canAdmins.reason },
  ];
  const firstAllowed = roles.find((r) => r.allowed)?.id ?? 'member';
  const wanted = (initialRole && initialRole !== 'visitor' ? initialRole : undefined) as InviteRole | undefined;
  const [role, setRole] = useState<InviteRole>(wanted && roles.find((r) => r.id === wanted)?.allowed ? wanted : firstAllowed);
  const [email, setEmail] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>(initialTeams ?? []);
  const [scope, setScope] = useState<'project' | 'board'>(initialProject ? 'project' : 'board');
  const [projectId, setProjectId] = useState(initialProject ?? '');
  const [boardId, setBoardId] = useState(initialBoard ?? '');
  const [boardRole, setBoardRole] = useState<Exclude<BoardRole, 'owner'>>('editor');
  const [days, setDays] = useState<number>(7);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; mailed: boolean } | null>(null);
  // Chat 08.5 · B: com e-mail no servidor o convite sai por e-mail (desligável); o link continua copiável
  const mailOn = isServerMode() && !!s.serverInfo?.email;
  const [sendEmail, setSendEmail] = useState(true);
  const teams = visibleTeams(viewer, s.teams);
  const projects = s.projects.filter((p) => !p.archivedAt && teams.some((tm) => tm.id === p.teamId));
  const noneAllowed = !roles.some((r) => r.allowed);

  const submit = () => {
    setError(null);
    const r = s.createInvitation({
      email,
      role,
      teamIds: role === 'guest_b2b' ? undefined : teamIds,
      projectId: role === 'guest_b2b' && scope === 'project' ? projectId || undefined : undefined,
      boardId: role === 'guest_b2b' ? (scope === 'board' ? boardId || undefined : undefined) : initialBoard,
      boardRole: role === 'guest_b2b' || initialBoard ? boardRole : undefined,
      expiresInDays: days,
      ...(mailOn ? { sendEmail } : {}),
    });
    if (!r.ok) return setError(r.error);
    setCreated({ token: r.token, mailed: mailOn && sendEmail });
  };

  if (created) {
    const link = absoluteHashUrl(`#/invite/${created.token}`);
    const copy = (text: string) => void copyText(text).then((ok) => s.toast(ok ? t('workspace.invite.copied') : t('share.copyFailed'), ok ? 'success' : 'danger'));
    return (
      <Modal open onClose={onClose} width={520} icon={<MailPlus size={20} />} title={t('workspace.invite.readyTitle')} description={t('workspace.invite.readyText', { email: email.trim().toLowerCase(), count: days })}
        footer={
          <>
            <button type="button" className="od-btn od-btn-ghost" onClick={() => { setCreated(null); setEmail(''); }}>{t('workspace.invite.another')}</button>
            <button type="button" className="od-btn od-btn-primary" onClick={onClose}>{t('workspace.invite.done')}</button>
          </>
        }
      >
        {created.mailed && (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[13px] text-ink ring-1 ring-line" role="status" data-testid="invite-mailed">
            <MailPlus size={15} className="mt-0.5 shrink-0 text-brand-800 dark:text-brand-200" /> {t('workspace.invite.sentByEmail', { email: email.trim().toLowerCase() })}
          </p>
        )}
        <CopyRow label={t('workspace.invite.link')} value={link} onCopy={() => copy(link)} />
        <div className="mt-3"><CopyRow label={t('workspace.invite.code')} value={created.token} onCopy={() => copy(created.token)} mono /></div>
        <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{t('workspace.invite.howToAccept')}</p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={540}
      icon={<MailPlus size={20} />}
      title={t('workspace.invite.title')}
      description={isServerMode() ? t('workspace.invite.descriptionServer') : t('workspace.invite.description')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={noneAllowed || !email.trim()} onClick={submit}>{t('workspace.invite.create')}</button>
        </>
      }
    >
      <div className="-m-1 max-h-[60vh] space-y-4 overflow-y-auto p-1">
        {noneAllowed && <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">{canMembers.reason}</p>}
        <div>
          <label className={fieldLabel} htmlFor="inv-email">{t('common.email')}</label>
          <input id="inv-email" className="od-input" type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} placeholder={t('workspace.invite.emailPlaceholder')} />
          {s.workspace.requireDomainForMembers && s.workspace.allowedEmailDomains.length > 0 && role !== 'guest_b2b' && (
            <span className="mt-1 block text-xs text-ink-subtle">{t('workspace.invite.domainsHint', { domains: s.workspace.allowedEmailDomains.join(', ') })}</span>
          )}
        </div>
        {/* Chat 08.5 · B: logo abaixo do e-mail, para ser vista sem rolar */}
        {mailOn ? (
          <SendEmailCheck checked={sendEmail} onChange={setSendEmail} />
        ) : (
          isServerMode() && <p className="text-xs text-ink-subtle" data-testid="invite-no-mail">{t('workspace.invite.noMailHint')}</p>
        )}
        <div>
          <span className={fieldLabel}>{t('workspace.invite.role')}</span>
          <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label={t('workspace.invite.role')}>
            {roles.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={role === r.id} disabled={!r.allowed} title={r.reason} onClick={() => setRole(r.id)}
                className={cn('rounded-lg px-3 py-2 text-start text-[13px] font-semibold ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50', role === r.id ? 'bg-accent-soft text-ink ring-selection' : 'text-ink-muted ring-line hover:bg-panel-hover')}>
                {roleLabel(r.id)}
              </button>
            ))}
          </div>
          {roles.filter((r) => !r.allowed && r.reason).slice(0, 1).map((r) => <span key={r.id} className="mt-1 block text-xs text-ink-subtle">{r.reason}</span>)}
        </div>

        {role !== 'guest_b2b' ? (
          <div>
            <span className={fieldLabel}>{t('workspace.invite.teams')}</span>
            {teams.length === 0 ? (
              <p className="text-xs text-ink-subtle">{t('workspace.invite.noTeams')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {teams.map((tm) => {
                  const on = teamIds.includes(tm.id);
                  return (
                    <button key={tm.id} type="button" aria-pressed={on} onClick={() => setTeamIds(on ? teamIds.filter((x) => x !== tm.id) : [...teamIds, tm.id])}
                      className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ring-1', on ? 'bg-accent-soft text-ink ring-selection' : 'text-ink-muted ring-line hover:bg-panel-hover')}>
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: tm.color }} /> {tm.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line">
            <div className="text-[13px] text-ink-muted">{t('workspace.invite.guestScope')}</div>
            <div className="flex gap-1 rounded-lg bg-panel p-1 ring-1 ring-line">
              {(['board', 'project'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={cn('flex-1 rounded-md py-1.5 text-[13px] font-semibold', scope === k ? 'bg-accent-soft text-ink' : 'text-ink-muted')}>
                  {k === 'board' ? t('workspace.invite.oneBoard') : t('workspace.invite.oneProject')}
                </button>
              ))}
            </div>
            {scope === 'board' ? (
              <select className="od-input h-9 text-[13px]" value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label={t('workspace.invite.oneBoard')}>
                <option value="">{t('workspace.invite.chooseBoard')}</option>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : (
              <select className="od-input h-9 text-[13px]" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={t('workspace.invite.oneProject')}>
                <option value="">{t('workspace.invite.chooseProject')}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{placeLabel({ kind: 'team', teamId: p.teamId, projectId: p.id }, s)}</option>)}
              </select>
            )}
            <select className="od-input h-9 text-[13px]" value={boardRole} onChange={(e) => setBoardRole(e.target.value as Exclude<BoardRole, 'owner'>)} aria-label={t('workspace.invite.accessLevel')}>
              {(['editor', 'commenter', 'viewer'] as const).map((r) => <option key={r} value={r}>{t(BOARD_ROLE_LABEL_KEYS[r])}</option>)}
            </select>
          </div>
        )}

        <div>
          <span className={fieldLabel}>{t('workspace.invite.validFor')}</span>
          <div className="flex gap-1.5">
            {INVITE_LIFETIME_DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1', days === d ? 'bg-accent-soft text-ink ring-selection' : 'text-ink-muted ring-line hover:bg-panel-hover')}>
                {t('share.people.days', { count: d })}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function CopyRow({ label, value, onCopy, mono }: { label: string; value: string; onCopy: () => void; mono?: boolean }) {
  const t = useT();
  return (
    <div>
      <span className={fieldLabel}>{label}</span>
      <div className="flex gap-2">
        <input className={cn('od-input h-9 min-w-0 flex-1 text-[12.5px]', mono && 'font-mono')} value={value} readOnly onFocus={(e) => e.target.select()} aria-label={label} />
        <button type="button" className="od-btn od-btn-secondary h-9 shrink-0" onClick={onCopy}><Copy size={15} /> {t('share.link.copy')}</button>
      </div>
    </div>
  );
}

/* ---------------------------------- Time ---------------------------------- */

export function TeamEditModal({ teamId, onClose }: { teamId?: string; onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const team = teamId ? s.teams.find((x) => x.id === teamId) : undefined;
  const can = useWorkspaceCan('workspace.teams.manage');
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [color, setColor] = useState(team?.color ?? TEAM_COLORS[s.teams.length % TEAM_COLORS.length]);
  const orgMembersList = useOrgMembers();
  const internal = useMemo(() => orgMembersList.filter((a) => a.status === 'active' && (a.role === 'admin' || a.role === 'member')), [orgMembersList]);
  const [members, setMembers] = useState<string[]>(team?.memberIds ?? [s.session.userId]);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (team) {
      const r1 = s.updateTeam(team.id, { name, description, color });
      if (!r1.ok) return setError(r1.error);
      const r2 = s.setTeamMembers(team.id, members);
      if (!r2.ok) return setError(r2.error);
    } else {
      const r = s.createTeam({ name, description, color, memberIds: members });
      if (!r.ok) return setError(r.error);
    }
    s.toast(team ? t('workspace.team.saved') : t('workspace.team.created', { name: name.trim() }), 'success');
    onClose();
  };

  return (
    <Modal open onClose={onClose} width={520} icon={<UsersRound size={20} />} title={team ? t('workspace.team.editTitle') : t('workspace.team.newTitle')} description={t('workspace.team.description')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!can.allowed || !name.trim()} onClick={save}>{team ? t('common.save') : t('workspace.team.create')}</button>
        </>
      }
    >
      <div className="-m-1 max-h-[60vh] space-y-4 overflow-y-auto p-1">
        {!can.allowed && <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">{can.reason}</p>}
        <div>
          <label className={fieldLabel} htmlFor="team-name">{t('common.name')}</label>
          <input id="team-name" className="od-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('workspace.team.namePlaceholder')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="team-desc">{t('workspace.team.descriptionLabel')}</label>
          <input id="team-desc" className="od-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <span className={fieldLabel}>{t('workspace.team.color')}</span>
          <div className="flex gap-1.5">
            {TEAM_COLORS.map((c) => (
              <button key={c} type="button" aria-pressed={color === c} aria-label={c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-lg ring-offset-2 ring-offset-[var(--od-panel)]', color === c && 'ring-2 ring-selection')} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <span className={fieldLabel}>{t('workspace.team.members', { count: members.length })}</span>
          <div className="max-h-48 overflow-y-auto rounded-xl ring-1 ring-line">
            {internal.map((a) => {
              const on = members.includes(a.id);
              return (
                <label key={a.id} className="flex cursor-pointer items-center gap-3 border-t border-line px-3.5 py-2 first:border-t-0 hover:bg-panel-hover">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--od-accent)]" checked={on} onChange={() => setMembers(on ? members.filter((x) => x !== a.id) : [...members, a.id])} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
                  <span className="text-xs text-ink-subtle">{roleLabel(a.role)}</span>
                </label>
              );
            })}
          </div>
          <span className="mt-1 block text-xs text-ink-subtle">{t('workspace.team.guestsNote')}</span>
        </div>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

/* --------------------------------- Projeto --------------------------------- */

export function ProjectEditModal({ projectId, teamId: initialTeam, onClose }: { projectId?: string; teamId?: string; onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const viewer = currentViewer(s);
  const project = projectId ? s.projects.find((p) => p.id === projectId) : undefined;
  const can = useWorkspaceCan('workspace.projects.create');
  const teams = visibleTeams(viewer, s.teams).filter((tm) => canUsePlace(viewer, { kind: 'team', teamId: tm.id }, s.teams, s.projects));
  const [teamId, setTeamId] = useState(project?.teamId ?? initialTeam ?? teams[0]?.id ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    const r = project ? s.updateProject(project.id, { name, description }) : s.createProject({ teamId, name, description });
    if (!r.ok) return setError(r.error);
    if (!project && r.id) s.setCurrentPlace({ kind: 'team', teamId, projectId: r.id });
    s.toast(project ? t('workspace.project.saved') : t('workspace.project.created', { name: name.trim() }), 'success');
    onClose();
  };

  return (
    <Modal open onClose={onClose} width={480} icon={<FolderPlus size={20} />} title={project ? t('workspace.project.editTitle') : t('workspace.project.newTitle')} description={t('workspace.project.description')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={(!project && (!can.allowed || !teamId)) || !name.trim()} onClick={save}>{project ? t('common.save') : t('workspace.project.create')}</button>
        </>
      }
    >
      <div className="space-y-4">
        {!project && !can.allowed && <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">{can.reason}</p>}
        {!project && can.allowed && teams.length === 0 && <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">{t('workspace.project.noTeams')}</p>}
        {!project && (
          <div>
            <label className={fieldLabel} htmlFor="prj-team">{t('workspace.project.team')}</label>
            <select id="prj-team" className="od-input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={fieldLabel} htmlFor="prj-name">{t('common.name')}</label>
          <input id="prj-name" className="od-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('workspace.project.namePlaceholder')} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="prj-desc">{t('workspace.team.descriptionLabel')}</label>
          <input id="prj-desc" className="od-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = { neutral: 'bg-panel-sunken text-ink-muted', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-ink', danger: 'bg-danger-soft text-danger' };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-line', tones[tone])}>{children}</span>;
}
