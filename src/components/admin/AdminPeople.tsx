import { useMemo, useState } from 'react';
import { ArrowRightLeft, Copy, MailCheck, MailPlus, Pause, Play, Search, Send, UserMinus, XCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { policiesOf } from '../../store/workspaceSlice';
import type { Invitation, WorkspaceRole } from '../../types/workspace';
import { explainAccountChange, workspaceContext, BOARD_ROLE_LABEL_KEYS } from '../../utils/permissions';
import { boardRoleFor, invitationStatus, membershipAccounts, placeOf, type InvitationStatus, type MemberView } from '../../utils/workspace';
import { displayName, placeLabel, roleLabel } from '../../utils/workspaceDisplay';
import { absoluteHashUrl } from '../../utils/router';
import { copyText } from '../../utils/clipboardText';
import { useOrgMembers, useViewer } from '../../hooks/useWorkspace';
import { translateMessage } from '../../i18n';
import { compareText, formatDateTime, formatTimeAgo } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { AdminSection, ConfirmButton, EmptyRow, PersonCell, StatusPill, Tag, useAdminUi } from './adminUi';
import { AccessRequestsSection, InviteLinksSection } from './AccessAdmin';
import { api, errorText } from '../../utils/api';
import { isServerMode } from '../../utils/serverConfig';
import { mailLangNow } from '../auth/EmailAccessViews';

type RoleFilter = 'all' | 'admin' | 'member';
type StatusFilter = 'all' | 'active' | 'suspended' | 'removed';

function useReport() {
  const toast = useAppStore((s) => s.toast);
  return (r: { ok: boolean; error?: string }, okText?: string) => {
    if (!r.ok) toast(r.error ?? '', 'danger');
    else if (okText) toast(okText, 'success');
    return r.ok;
  };
}

/* ---------------------------------- Membros ---------------------------------- */

export function AdminMembers() {
  const t = useT();
  const s = useAppStore();
  const viewer = useViewer();
  const report = useReport();
  const setTransferFrom = useAdminUi((u) => u.setTransferFrom);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const ctx = workspaceContext(viewer, policiesOf(s));
  // emenda v1.1: status e papel vêm da participação (membershipOf), nunca direto da conta
  const members = useOrgMembers();
  const accountsForRules = membershipAccounts(s.directory, s.workspace.id);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return members
      .filter((a) => a.role === 'admin' || a.role === 'member')
      .filter((a) => role === 'all' || a.role === role)
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => !q || a.name.toLocaleLowerCase().includes(q) || a.email.toLocaleLowerCase().includes(q))
      .sort((a, b) => compareText(a.name, b.name));
  }, [members, query, role, status]);

  const ownedCount = (id: string) => s.boards.filter((b) => b.ownerId === id && !b.deletedAt).length;
  // todos os convites (membros, administradores e convidados B2B), com o papel em cada linha
  const pending = [...s.invitations].sort((a, b) => b.createdAt - a.createdAt);

  const remove = (a: MemberView) => {
    const owned = ownedCount(a.id);
    if (owned > 0) {
      s.toast(t('workspace.errors.ownsBoards', { count: owned }), 'danger', {
        action: {
          label: t('admin.members.goTransfer'),
          run: () => {
            setTransferFrom(a.id);
            s.navigate({ name: 'admin', section: 'transfer' });
          },
        },
      });
      return;
    }
    report(s.removeAccount(a.id), t('admin.members.removed'));
  };

  return (
    <>
      <AdminSection
        title={t('admin.members.title', { count: rows.length })}
        aside={
          <button type="button" className="od-btn od-btn-primary od-btn-sm" onClick={() => s.openModal({ type: 'invite', role: 'member' })}>
            <MailPlus size={15} /> {t('admin.members.invite')}
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input className="od-input h-9 ps-9 text-[13px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('admin.members.search')} aria-label={t('admin.members.search')} />
          </label>
          <select className="od-input h-9 w-auto text-[13px]" value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} aria-label={t('admin.members.filterRole')}>
            <option value="all">{t('admin.members.allRoles')}</option>
            <option value="admin">{roleLabel('admin')}</option>
            <option value="member">{roleLabel('member')}</option>
          </select>
          <select className="od-input h-9 w-auto text-[13px]" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label={t('admin.members.filterStatus')}>
            <option value="all">{t('admin.members.allStatuses')}</option>
            <option value="active">{t('admin.status.active')}</option>
            <option value="suspended">{t('admin.status.suspended')}</option>
            <option value="removed">{t('admin.status.removed')}</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <EmptyRow>{t('admin.members.empty')}</EmptyRow>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-line">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="bg-panel-sunken text-xs text-ink-subtle">
                <tr>
                  <th className="px-3.5 py-2 text-start font-semibold">{t('admin.members.colPerson')}</th>
                  <th className="px-3.5 py-2 text-start font-semibold">{t('admin.members.colRole')}</th>
                  <th className="px-3.5 py-2 text-start font-semibold">{t('admin.members.colTeams')}</th>
                  <th className="px-3.5 py-2 text-start font-semibold">{t('admin.members.colStatus')}</th>
                  <th className="whitespace-nowrap px-3.5 py-2 text-start font-semibold">{t('admin.members.colLastSeen')}</th>
                  <th className="px-3.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const removed = a.status === 'removed';
                  const roleDecision = (r: WorkspaceRole) => explainAccountChange(ctx, accountsForRules, a.id, 'role', r);
                  const suspend = explainAccountChange(ctx, accountsForRules, a.id, 'suspend');
                  const rm = explainAccountChange(ctx, accountsForRules, a.id, 'remove');
                  const demote = roleDecision(a.role === 'admin' ? 'member' : 'admin');
                  return (
                    <tr key={a.id} className="border-t border-line align-middle">
                      <td className="px-3.5 py-2.5">
                        <PersonCell
                          name={removed ? displayName(a.id, s.directory) : a.name}
                          email={removed ? undefined : a.email}
                          color={a.avatarColor}
                          extra={
                            <>
                              {a.id === s.session.userId && <Tag tone="brand">{t('admin.members.you')}</Tag>}
                              {a.simulated && <Tag>{t('admin.members.simulated')}</Tag>}
                              {/* Chat 08.5: só no Modo Servidor (o campo nem existe no Modo Local) */}
                              {!removed && a.emailVerified === false && <Tag tone="warning">{t('admin.members.emailUnverified')}</Tag>}
                              {!removed && a.createdVia === 'signup' && <Tag>{t('admin.members.viaDomain')}</Tag>}
                            </>
                          }
                        />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <select
                          className="od-input h-8 w-[136px] text-[12.5px]"
                          value={a.role}
                          disabled={removed || !demote.allowed}
                          title={!demote.allowed && demote.reason ? translateMessage(demote.reason) : undefined}
                          onChange={(e) => report(s.setAccountRole(a.id, e.target.value as 'admin' | 'member' | 'guest_b2b'), t('admin.members.roleChanged'))}
                          aria-label={t('admin.members.roleOf', { name: a.name })}
                        >
                          {(['admin', 'member', 'guest_b2b'] as const).map((r) => (
                            <option key={r} value={r} disabled={r !== a.role && !roleDecision(r).allowed}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="max-w-[200px] px-3.5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {a.teamIds.map((id) => s.teams.find((x) => x.id === id)).filter(Boolean).map((tm) => (
                            <Tag key={tm!.id}>{tm!.name}</Tag>
                          ))}
                          {a.teamIds.length === 0 && <span className="text-xs text-ink-subtle">—</span>}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5"><StatusPill status={a.status} /></td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-ink-muted">{a.lastSeenAt ? formatTimeAgo(a.lastSeenAt) : t('admin.members.never')}</td>
                      <td className="px-3.5 py-2.5">
                        {!removed && (
                          <div className="flex justify-end gap-1">
                            {a.status === 'active' ? (
                              <ConfirmButton iconOnly danger={false} icon={<Pause size={14} />} label={t('admin.members.suspend')} disabled={!suspend.allowed} reason={suspend.reason ? translateMessage(suspend.reason) : undefined} onConfirm={() => report(s.suspendAccount(a.id), t('admin.members.suspended'))} />
                            ) : (
                              <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8 w-8 px-0" title={t('admin.members.reactivate')} aria-label={t('admin.members.reactivate')} onClick={() => report(s.reactivateAccount(a.id), t('admin.members.reactivated'))}>
                                <Play size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="od-btn od-btn-ghost od-btn-sm relative h-8 w-8 px-0"
                              title={t('admin.members.transferTitle')}
                              onClick={() => {
                                setTransferFrom(a.id);
                                s.navigate({ name: 'admin', section: 'transfer' });
                              }}
                            >
                              <ArrowRightLeft size={14} />
                              <span className="sr-only">{t('admin.members.transferTitle')}</span>
                            </button>
                            <ConfirmButton iconOnly icon={<UserMinus size={14} />} label={t('admin.members.remove')} confirmLabel={t('admin.members.confirmRemove')} disabled={!rm.allowed} reason={rm.reason ? translateMessage(rm.reason) : undefined} onConfirm={() => remove(a)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-subtle">{t('admin.members.removeNote')}</p>
      </AdminSection>

      {/* Chat 08.5 · B (Modo Servidor): fila de pedidos e links de convite gerais */}
      <AccessRequestsSection />
      <InviteLinksSection />
      <InvitationsTable title={t('admin.members.pendingTitle')} invitations={pending} />
    </>
  );
}

/* --------------------------------- Convidados --------------------------------- */

export function AdminGuests() {
  const t = useT();
  const s = useAppStore();
  const report = useReport();
  const policies = policiesOf(s);
  const guests = useOrgMembers().filter((a) => a.role === 'guest_b2b' && a.status !== 'removed').sort((a, b) => compareText(a.name, b.name));
  const pending = s.invitations.filter((i) => i.role === 'guest_b2b').sort((a, b) => b.createdAt - a.createdAt);
  const now = Date.now();

  const accessOf = (g: MemberView): string[] => {
    const projectNames = s.projects.filter((p) => p.invitedGuestIds.includes(g.id)).map((p) => placeLabel({ kind: 'team', teamId: p.teamId, projectId: p.id }, s));
    const boardNames = s.boards
      .filter((b) => !b.deletedAt && (b.members?.some((m) => m.userId === g.id) || b.invitedGuestIds?.includes(g.id)))
      .map((b) => {
        const role = boardRoleFor(g.id, b, s.projects);
        return role ? t('admin.guests.boardWithRole', { name: b.name, role: t(BOARD_ROLE_LABEL_KEYS[role]) }) : b.name;
      });
    return [...projectNames, ...boardNames];
  };

  return (
    <>
      {!policies.allowGuests && <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink ring-1 ring-line">{t('permissions.denied.guestsDisabled')}</p>}
      <AdminSection
        title={t('admin.guests.title', { count: guests.length })}
        description={t('admin.guests.description')}
        aside={
          <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={!policies.allowGuests} onClick={() => s.openModal({ type: 'invite', role: 'guest_b2b' })}>
            <MailPlus size={15} /> {t('admin.guests.invite')}
          </button>
        }
      >
        {guests.length === 0 ? (
          <EmptyRow>{t('admin.guests.empty')}</EmptyRow>
        ) : (
          <div className="space-y-2">
            {guests.map((g) => {
              const access = accessOf(g);
              const expired = !!g.guestExpiresAt && g.guestExpiresAt <= now;
              return (
                <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-3 ring-1 ring-line">
                  <div className="min-w-[200px] flex-1">
                    <PersonCell name={g.name} email={g.email} color={g.avatarColor} extra={g.simulated ? <Tag>{t('admin.members.simulated')}</Tag> : undefined} />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {access.length ? access.map((x) => <Tag key={x} tone="brand">{x}</Tag>) : <span className="text-xs text-ink-subtle">{t('admin.guests.noAccess')}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-ink-muted">
                    <div><StatusPill status={g.status} /> {expired && <Tag tone="warning">{t('admin.guests.expired')}</Tag>}</div>
                    <div className="mt-1">{g.guestExpiresAt ? t('admin.guests.until', { date: formatDateTime(g.guestExpiresAt) }) : t('share.people.noExpiry')}</div>
                    <div>{t('admin.guests.invitedBy', { name: displayName(g.invitedBy, s.directory) })}</div>
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="od-input h-8 w-auto text-[12.5px]"
                      value=""
                      onChange={(e) => e.target.value && report(s.extendGuest(g.id, Number(e.target.value)), t('admin.guests.extended'))}
                      aria-label={t('admin.guests.extend')}
                    >
                      <option value="">{t('admin.guests.extend')}</option>
                      {[7, 30, 90].map((d) => (
                        <option key={d} value={d}>{t('share.people.days', { count: d })}</option>
                      ))}
                    </select>
                    {g.status === 'active' ? (
                      <ConfirmButton icon={<XCircle size={14} />} label={t('admin.guests.revoke')} onConfirm={() => report(s.revokeGuest(g.id), t('admin.guests.revoked'))} />
                    ) : (
                      <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" onClick={() => report(s.reactivateAccount(g.id), t('admin.members.reactivated'))}>
                        <Play size={14} /> {t('admin.members.reactivate')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminSection>
      <InvitationsTable title={t('admin.guests.pendingTitle')} invitations={pending} />
    </>
  );
}

/* --------------------------------- Convites --------------------------------- */

function InvitationsTable({ title, invitations }: { title: string; invitations: Invitation[] }) {
  const t = useT();
  const s = useAppStore();
  const report = useReport();
  // Chat 08.5 · B: reenviar por e-mail (servidor com e-mail; quem criou ou quem gerencia membros — o servidor confere)
  const mailOn = isServerMode() && !!s.serverInfo?.email;
  const [sending, setSending] = useState<string | null>(null);
  const resend = async (i: Invitation) => {
    if (!api) return;
    setSending(i.id);
    try {
      await api.resendInvitation(i.id, mailLangNow());
      s.toast(t('admin.invites.resent', { email: i.email }), 'success');
    } catch (err) {
      s.toast(errorText(err), 'danger');
    } finally {
      setSending(null);
    }
  };
  const statusLabel: Record<InvitationStatus, string> = {
    pending: t('admin.invites.pending'),
    accepted: t('admin.invites.accepted'),
    expired: t('admin.invites.expired'),
    revoked: t('admin.invites.revoked'),
  };
  const where = (i: Invitation) => {
    if (i.boardId) {
      const b = s.boards.find((x) => x.id === i.boardId);
      return b ? t('workspace.inviteAccept.toBoard', { name: b.name, place: placeLabel(placeOf(b), s) }) : '—';
    }
    if (i.projectId) {
      const p = s.projects.find((x) => x.id === i.projectId);
      return p ? placeLabel({ kind: 'team', teamId: p.teamId, projectId: p.id }, s) : '—';
    }
    const teams = (i.teamIds ?? []).map((id) => s.teams.find((x) => x.id === id)?.name).filter(Boolean);
    return teams.length ? teams.join(', ') : t('workspace.inviteAccept.toWorkspace');
  };
  return (
    <AdminSection title={title}>
      {invitations.length === 0 ? (
        <EmptyRow>{t('admin.invites.empty')}</EmptyRow>
      ) : (
        <div className="space-y-1.5">
          {invitations.slice(0, 50).map((i) => {
            const st = invitationStatus(i);
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5 ring-1 ring-line">
                <div className="min-w-[200px] flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{i.email}</div>
                  <div className="truncate text-xs text-ink-subtle">
                    {roleLabel(i.role)} · {where(i)} · {t('admin.invites.by', { name: displayName(i.invitedBy, s.directory) })}
                  </div>
                </div>
                <Tag tone={st === 'pending' ? 'brand' : st === 'expired' ? 'warning' : 'neutral'}>{statusLabel[st]}</Tag>
                {i.emailedAt && <Tag><MailCheck size={11} /> {t('admin.invites.emailed')}</Tag>}
                <span className="text-xs text-ink-muted">{st === 'pending' ? t('admin.invites.expires', { date: formatDateTime(i.expiresAt) }) : ''}</span>
                {st === 'pending' && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="od-btn od-btn-ghost od-btn-sm h-8"
                      onClick={() => void copyText(absoluteHashUrl(`#/invite/${i.token}`)).then((ok) => s.toast(ok ? t('workspace.invite.copied') : t('share.copyFailed'), ok ? 'success' : 'danger'))}
                    >
                      <Copy size={14} /> {t('admin.invites.copyLink')}
                    </button>
                    {mailOn && (
                      <button type="button" className="od-btn od-btn-ghost od-btn-sm h-8" disabled={sending === i.id} onClick={() => void resend(i)} data-testid="resend-invite">
                        <Send size={14} /> {t('admin.invites.resend')}
                      </button>
                    )}
                    <ConfirmButton label={t('admin.invites.revoke')} onConfirm={() => report(s.revokeInvitation(i.id), t('admin.invites.revokedToast'))} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminSection>
  );
}
