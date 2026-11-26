/**
 * Chat 08.5 · B — Administração → Membros: "Pedidos de acesso" e "Links de convite" (só Modo Servidor, só para quem
 * gerencia membros). Tudo passa pelas ações do store (regras compartilhadas + servidor); nada aqui decide permissão.
 *
 * Em que difere do padrão de mercado: a fila e os links ficam DENTRO da lista de membros (onde a decisão acontece),
 * sem página nem aba própria; o link geral mostra o endereço uma única vez, na criação, e a tabela mostra usos x/máx.
 */
import { useState } from 'react';
import { Check, Link2, Mail, MailCheck, MailQuestion, Plus, UserCheck, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { AccessRequest, BoardRole, InviteLink } from '../../types/workspace';
import { BOARD_ROLE_LABEL_KEYS } from '../../utils/permissions';
import { INVITE_LIFETIME_DAYS, placeOf, visibleTeams } from '../../utils/workspace';
import { displayName, placeLabel, roleLabel } from '../../utils/workspaceDisplay';
import { absoluteHashUrl } from '../../utils/router';
import { copyText } from '../../utils/clipboardText';
import { cn } from '../../utils/cn';
import { inviteLinkStatus, INVITE_LINK_LIMITS, type InviteLinkStatus } from '../../utils/workspaceRules';
import { isServerMode } from '../../utils/serverConfig';
import { useViewer, useVisibleBoards, useWorkspaceCan } from '../../hooks/useWorkspace';
import { formatDateTime, formatTimeAgo } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { Modal } from '../ui/Modal';
import { CopyRow } from '../workspace/WorkspaceModals';
import { AdminSection, ConfirmButton, EmptyRow, Tag } from './adminUi';

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-ink-muted';
type GrantRole = 'member' | 'guest_b2b';

export interface GrantValue {
  role: GrantRole;
  teamIds: string[];
  scope: 'project' | 'board';
  projectId: string;
  boardId: string;
  boardRole: Exclude<BoardRole, 'owner'>;
}

export const emptyGrant = (): GrantValue => ({ role: 'member', teamIds: [], scope: 'board', projectId: '', boardId: '', boardRole: 'editor' });

/** O que o acesso concede (papel, times ou escopo do convidado, nível no board) — nunca administrador. */
export function GrantFields({ value, onChange }: { value: GrantValue; onChange: (v: GrantValue) => void }) {
  const t = useT();
  const s = useAppStore();
  const viewer = useViewer();
  const boards = useVisibleBoards();
  const teams = visibleTeams(viewer, s.teams);
  const projects = s.projects.filter((p) => !p.archivedAt && teams.some((tm) => tm.id === p.teamId));
  const set = (patch: Partial<GrantValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div>
        <span className={fieldLabel}>{t('workspace.invite.role')}</span>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('workspace.invite.role')}>
          {(['member', 'guest_b2b'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={value.role === r} onClick={() => set({ role: r })}
              className={cn('rounded-lg px-3 py-2 text-start text-[13px] font-semibold ring-1 transition-colors', value.role === r ? 'bg-accent-soft text-ink ring-selection' : 'text-ink-muted ring-line hover:bg-panel-hover')}>
              {roleLabel(r)}
            </button>
          ))}
        </div>
        <span className="mt-1 block text-xs text-ink-subtle">{t('admin.access.noAdminHint')}</span>
      </div>
      {value.role === 'member' ? (
        <div>
          <span className={fieldLabel}>{t('workspace.invite.teams')}</span>
          {teams.length === 0 ? (
            <p className="text-xs text-ink-subtle">{t('workspace.invite.noTeams')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {teams.map((tm) => {
                const on = value.teamIds.includes(tm.id);
                return (
                  <button key={tm.id} type="button" aria-pressed={on} onClick={() => set({ teamIds: on ? value.teamIds.filter((x) => x !== tm.id) : [...value.teamIds, tm.id] })}
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
              <button key={k} type="button" aria-pressed={value.scope === k} onClick={() => set({ scope: k })} className={cn('flex-1 rounded-md py-1.5 text-[13px] font-semibold', value.scope === k ? 'bg-accent-soft text-ink' : 'text-ink-muted')}>
                {k === 'board' ? t('workspace.invite.oneBoard') : t('workspace.invite.oneProject')}
              </button>
            ))}
          </div>
          {value.scope === 'board' ? (
            <select className="od-input h-9 text-[13px]" value={value.boardId} onChange={(e) => set({ boardId: e.target.value })} aria-label={t('workspace.invite.oneBoard')}>
              <option value="">{t('workspace.invite.chooseBoard')}</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <select className="od-input h-9 text-[13px]" value={value.projectId} onChange={(e) => set({ projectId: e.target.value })} aria-label={t('workspace.invite.oneProject')}>
              <option value="">{t('workspace.invite.chooseProject')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{placeLabel({ kind: 'team', teamId: p.teamId, projectId: p.id }, s)}</option>)}
            </select>
          )}
          <select className="od-input h-9 text-[13px]" value={value.boardRole} onChange={(e) => set({ boardRole: e.target.value as GrantValue['boardRole'] })} aria-label={t('workspace.invite.accessLevel')}>
            {(['editor', 'commenter', 'viewer'] as const).map((r) => <option key={r} value={r}>{t(BOARD_ROLE_LABEL_KEYS[r])}</option>)}
          </select>
        </div>
      )}
    </>
  );
}

/** Converte o formulário na entrada das regras (só os campos do papel escolhido). */
function grantInput(v: GrantValue) {
  const guest = v.role === 'guest_b2b';
  return {
    role: v.role,
    teamIds: guest ? undefined : v.teamIds,
    projectId: guest && v.scope === 'project' ? v.projectId || undefined : undefined,
    boardId: guest && v.scope === 'board' ? v.boardId || undefined : undefined,
    boardRole: guest ? v.boardRole : undefined,
  };
}

function DaysPicker({ value, onChange, options }: { value: number; onChange: (d: number) => void; options: readonly number[] }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((d) => (
        <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)} className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1', value === d ? 'bg-accent-soft text-ink ring-selection' : 'text-ink-muted ring-line hover:bg-panel-hover')}>
          {t('share.people.days', { count: d })}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Pedidos de acesso ------------------------------ */

function ApproveRequestModal({ request, onClose }: { request: AccessRequest; onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const mailOn = !!s.serverInfo?.email;
  const [grant, setGrant] = useState<GrantValue>(emptyGrant());
  const [days, setDays] = useState(7);
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const submit = () => {
    const r = s.approveAccessRequest(request.id, { ...grantInput(grant), expiresInDays: days, ...(mailOn ? { sendEmail } : {}) });
    if (!r.ok) return setError(r.error);
    if (r.token) setCreated(r.token);
    else onClose();
  };
  if (created) {
    const link = absoluteHashUrl(`#/invite/${created}`);
    return (
      <Modal open onClose={onClose} width={520} icon={<UserCheck size={20} />} title={t('admin.access.approvedTitle')} description={mailOn && sendEmail ? t('admin.access.approvedMailed', { email: request.email }) : t('admin.access.approvedLink', { email: request.email })}
        footer={<button type="button" className="od-btn od-btn-primary" onClick={onClose}>{t('workspace.invite.done')}</button>}>
        <CopyRow label={t('workspace.invite.link')} value={link} onCopy={() => void copyText(link).then((ok) => s.toast(ok ? t('workspace.invite.copied') : t('share.copyFailed'), ok ? 'success' : 'danger'))} />
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} width={520} icon={<UserCheck size={20} />} title={t('admin.access.approveTitle', { name: request.name })} description={t('admin.access.approveText', { email: request.email })}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" onClick={submit} data-testid="approve-submit">{t('admin.access.approveCreate')}</button>
        </>
      }>
      <div className="-m-1 max-h-[60vh] space-y-4 overflow-y-auto p-1">
        <GrantFields value={grant} onChange={setGrant} />
        <div>
          <span className={fieldLabel}>{t('workspace.invite.validFor')}</span>
          <DaysPicker value={days} onChange={setDays} options={INVITE_LIFETIME_DAYS} />
        </div>
        {mailOn && <SendEmailCheck checked={sendEmail} onChange={setSendEmail} />}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function SendEmailCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-[13px] ring-1 ring-line hover:bg-panel-hover">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--od-selection)]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="send-email" />
      <span>
        <span className="block font-semibold text-ink">{t('workspace.invite.sendEmail')}</span>
        <span className="block text-xs text-ink-subtle">{t('workspace.invite.sendEmailHint')}</span>
      </span>
    </label>
  );
}

export function AccessRequestsSection({ demo }: { demo?: AccessRequest[] } = {}) {
  const t = useT();
  const s = useAppStore();
  const manage = useWorkspaceCan('workspace.members.manage');
  const policyOn = useAppStore((st) => st.workspace.policies?.allowAccessRequests === true);
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const requests = (demo ?? s.accessRequests).filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  if (!demo && (!isServerMode() || !manage.allowed || (!policyOn && !requests.length))) return null;
  const linkOf = (r: AccessRequest) => (r.inviteLinkId ? s.inviteLinks.find((l) => l.id === r.inviteLinkId) : undefined);
  const decide = (r: AccessRequest) => {
    if (demo) return;
    if (r.kind === 'link' || r.existingAccount) {
      const res = s.approveAccessRequest(r.id);
      if (!res.ok) return s.toast(res.error, 'danger');
      s.toast(r.existingAccount ? t('admin.access.closedToast') : t('admin.access.approvedToast'), 'success');
      return;
    }
    setApproving(r);
  };
  const reject = (r: AccessRequest) => {
    if (demo) return;
    const res = s.rejectAccessRequest(r.id);
    if (res.ok) s.toast(t('admin.access.rejectedToast'), 'success');
    else s.toast(res.error, 'danger');
  };
  return (
    <AdminSection title={t('admin.access.title', { count: requests.length })} description={policyOn || demo ? t('admin.access.description') : t('admin.access.policyOff')}>
      {requests.length === 0 ? (
        <EmptyRow>{t('admin.access.empty')}</EmptyRow>
      ) : (
        <div className="space-y-1.5" data-testid="access-requests">
          {requests.map((r) => {
            const link = linkOf(r);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 ring-line" data-access-request={r.email}>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
                    {r.emailConfirmed ? (
                      <Tag tone="brand"><MailCheck size={11} /> {t('admin.access.confirmed')}</Tag>
                    ) : (
                      <Tag tone="warning"><MailQuestion size={11} /> {t('admin.access.unconfirmed')}</Tag>
                    )}
                    {r.kind === 'link' && <Tag><Link2 size={11} /> {link ? t('admin.access.viaLink', { role: roleLabel(link.role) }) : t('admin.access.viaLinkGone')}</Tag>}
                    {r.existingAccount && <Tag>{t('admin.access.hasAccount')}</Tag>}
                  </div>
                  <div className="truncate text-xs text-ink-subtle">{r.email} · {formatTimeAgo(r.createdAt)}</div>
                  {r.message && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink-muted">{r.message}</p>}
                </div>
                <div className="flex gap-1">
                  <button type="button" className="od-btn od-btn-secondary od-btn-sm h-8" onClick={() => decide(r)} data-testid="approve-request">
                    <Check size={14} /> {r.existingAccount ? t('admin.access.close') : t('admin.access.approve')}
                  </button>
                  <ConfirmButton label={t('admin.access.reject')} icon={<X size={14} />} onConfirm={() => reject(r)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!demo && !s.serverInfo?.email && requests.some((r) => !r.emailConfirmed) && <p className="mt-3 text-xs text-ink-subtle">{t('admin.access.noMailNote')}</p>}
      {approving && <ApproveRequestModal request={approving} onClose={() => setApproving(null)} />}
    </AdminSection>
  );
}

/* ------------------------------ Links de convite gerais ------------------------------ */

function InviteLinkModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const s = useAppStore();
  const [grant, setGrant] = useState<GrantValue>(emptyGrant());
  const [maxUses, setMaxUses] = useState(10);
  const [days, setDays] = useState(7);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const submit = () => {
    const r = s.createInviteLink({ ...grantInput(grant), maxUses, expiresInDays: days, allowedDomain: domain.trim() || null });
    if (!r.ok) return setError(r.error);
    setCreated(r.token);
  };
  if (created) {
    const link = absoluteHashUrl(`#/join/${created}`);
    return (
      <Modal open onClose={onClose} width={520} icon={<Link2 size={20} />} title={t('admin.links.readyTitle')} description={t('admin.links.readyText')}
        footer={<button type="button" className="od-btn od-btn-primary" onClick={onClose}>{t('workspace.invite.done')}</button>}>
        <div data-testid="invite-link-created">
          <CopyRow label={t('admin.links.link')} value={link} onCopy={() => void copyText(link).then((ok) => s.toast(ok ? t('workspace.invite.copied') : t('share.copyFailed'), ok ? 'success' : 'danger'))} />
        </div>
        <p className="mt-3 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-ink ring-1 ring-line" role="note">{t('admin.links.copyNow')}</p>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} width={540} icon={<Link2 size={20} />} title={t('admin.links.newTitle')} description={t('admin.links.newText')}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="od-btn od-btn-primary" onClick={submit} data-testid="invite-link-submit">{t('admin.links.create')}</button>
        </>
      }>
      <div className="-m-1 max-h-[60vh] space-y-4 overflow-y-auto p-1">
        <GrantFields value={grant} onChange={setGrant} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={fieldLabel}>{t('admin.links.maxUses')}</span>
            <input className="od-input h-9 text-[13px]" type="number" min={1} max={INVITE_LINK_LIMITS.maxUses} value={maxUses} onChange={(e) => setMaxUses(Math.max(1, Math.min(INVITE_LINK_LIMITS.maxUses, Math.round(Number(e.target.value) || 1))))} />
          </label>
          <label className="block">
            <span className={fieldLabel}>{t('admin.links.domain')}</span>
            <input className="od-input h-9 text-[13px]" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t('admin.links.domainPlaceholder')} />
          </label>
        </div>
        <div>
          <span className={fieldLabel}>{t('workspace.invite.validFor')}</span>
          <DaysPicker value={days} onChange={setDays} options={[1, 7, 30, INVITE_LINK_LIMITS.maxDays]} />
        </div>
        <p className="text-xs leading-relaxed text-ink-subtle">{s.serverInfo?.email ? t('admin.links.howMail') : t('admin.links.howNoMail')}</p>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function InviteLinksSection({ demo }: { demo?: InviteLink[] } = {}) {
  const t = useT();
  const s = useAppStore();
  const manage = useWorkspaceCan('workspace.members.manage');
  const [creating, setCreating] = useState(false);
  if (!demo && (!isServerMode() || !manage.allowed)) return null;
  const now = Date.now();
  const links = (demo ?? s.inviteLinks).slice().sort((a, b) => b.createdAt - a.createdAt);
  const statusLabel: Record<InviteLinkStatus, string> = {
    active: t('admin.links.active'),
    revoked: t('admin.links.revoked'),
    expired: t('admin.links.expired'),
    exhausted: t('admin.links.exhausted'),
  };
  const scopeOf = (l: InviteLink) => {
    if (l.boardId) {
      const b = s.boards.find((x) => x.id === l.boardId);
      return b ? t('workspace.inviteAccept.toBoard', { name: b.name, place: placeLabel(placeOf(b), s) }) : '—';
    }
    if (l.projectId) {
      const p = s.projects.find((x) => x.id === l.projectId);
      return p ? placeLabel({ kind: 'team', teamId: p.teamId, projectId: p.id }, s) : '—';
    }
    const teams = (l.teamIds ?? []).map((id) => s.teams.find((x) => x.id === id)?.name).filter(Boolean);
    return teams.length ? teams.join(', ') : t('workspace.inviteAccept.toWorkspace');
  };
  return (
    <AdminSection
      title={t('admin.links.title')}
      description={t('admin.links.description')}
      aside={
        <button type="button" className="od-btn od-btn-secondary od-btn-sm" onClick={() => !demo && setCreating(true)} data-testid="new-invite-link">
          <Plus size={15} /> {t('admin.links.new')}
        </button>
      }
    >
      {links.length === 0 ? (
        <EmptyRow>{t('admin.links.empty')}</EmptyRow>
      ) : (
        <div className="space-y-1.5" data-testid="invite-links">
          {links.slice(0, 50).map((l) => {
            const st = inviteLinkStatus(l, now);
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 ring-line">
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                    <Link2 size={14} className="text-ink-subtle" /> {roleLabel(l.role)}
                    {l.allowedDomain && <Tag><Mail size={11} /> {l.allowedDomain}</Tag>}
                  </div>
                  <div className="truncate text-xs text-ink-subtle">
                    {scopeOf(l)} · {t('admin.invites.by', { name: displayName(l.createdBy, s.directory) })}
                  </div>
                </div>
                <span className="text-xs font-semibold tabular-nums text-ink-muted">{t('admin.links.uses', { uses: l.uses, max: l.maxUses })}</span>
                <Tag tone={st === 'active' ? 'brand' : st === 'revoked' ? 'neutral' : 'warning'}>{statusLabel[st]}</Tag>
                <span className="text-xs text-ink-muted">{st === 'active' ? t('admin.invites.expires', { date: formatDateTime(l.expiresAt) }) : ''}</span>
                {st === 'active' && <ConfirmButton label={t('admin.links.revoke')} onConfirm={() => { if (demo) return; const r = s.revokeInviteLink(l.id); s.toast(r.ok ? t('admin.links.revokedToast') : r.error, r.ok ? 'success' : 'danger'); }} />}
              </div>
            );
          })}
        </div>
      )}
      {links.length > 0 && <p className="mt-3 text-xs text-ink-subtle" data-testid="invite-links-once">{t('admin.links.onceNote')}</p>}
      {creating && <InviteLinkModal onClose={() => setCreating(false)} />}
    </AdminSection>
  );
}
