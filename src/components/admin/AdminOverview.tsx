import { useEffect, useState, type ReactNode } from 'react';
import { boardRepository } from '../../utils/boardRepository';
import { AlertTriangle, ArrowRight, Clock, KeyRound, ShieldAlert, UserPlus, UserX } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { activeAdminCount } from '../../utils/permissions';
import { invitationStatus, membershipAccounts } from '../../utils/workspace';
import { useOrgMembers } from '../../hooks/useWorkspace';
import { auditText } from '../../utils/workspaceDisplay';
import { formatBytes, formatTimeAgo } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { AdminSection, ConfirmButton, StatCard } from './adminUi';
import { isServerMode } from '../../utils/serverConfig';

const DAY = 86_400_000;


export function AdminOverview() {
  const t = useT();
  const s = useAppStore();
  const now = Date.now();
  const members = useOrgMembers();
  const internal = members.filter((a) => a.status === 'active' && (a.role === 'admin' || a.role === 'member'));
  const guests = members.filter((a) => a.status === 'active' && a.role === 'guest_b2b');
  const accountsForRules = membershipAccounts(s.directory, s.workspace.id);
  const liveBoards = s.boards.filter((b) => !b.deletedAt);
  // Chat 06 · B: estimativa do navegador para o armazenamento do app (IndexedDB + localStorage)
  const [storage, setStorage] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void boardRepository.estimateUsage().then((n) => alive && setStorage(n));
    return () => {
      alive = false;
    };
  }, [s.boards.length]);
  const simulated = members.filter((a) => a.simulated).length;

  const alerts: { id: string; icon: ReactNode; text: string; action?: { label: string; run: () => void } }[] = [];
  if (activeAdminCount(accountsForRules) <= 1) alerts.push({ id: 'admin', icon: <ShieldAlert size={17} />, text: t('admin.overview.alertOneAdmin'), action: { label: t('admin.overview.goMembers'), run: () => s.navigate({ name: 'admin', section: 'members' }) } });
  const openLinks = liveBoards.filter((b) => b.publicLink?.enabled && !b.publicLink.revokedAt && !b.publicLink.passwordHash);
  if (openLinks.length) alerts.push({ id: 'links', icon: <KeyRound size={17} />, text: t('admin.overview.alertLinksNoPassword', { count: openLinks.length }), action: { label: t('admin.overview.goPolicies'), run: () => s.navigate({ name: 'admin', section: 'policies' }) } });
  const expiring = s.invitations.filter((i) => invitationStatus(i, now) === 'pending' && i.expiresAt - now < 3 * DAY);
  if (expiring.length) alerts.push({ id: 'invites', icon: <Clock size={17} />, text: t('admin.overview.alertInvitesExpiring', { count: expiring.length }), action: { label: t('admin.overview.goMembers'), run: () => s.navigate({ name: 'admin', section: 'members' }) } });
  const expiredGuests = guests.filter((g) => g.guestExpiresAt && g.guestExpiresAt <= now);
  if (expiredGuests.length) alerts.push({ id: 'guests', icon: <UserX size={17} />, text: t('admin.overview.alertGuestsExpired', { count: expiredGuests.length }), action: { label: t('admin.overview.goGuests'), run: () => s.navigate({ name: 'admin', section: 'guests' }) } });

  const report = (r: { ok: boolean; error?: string }, okText: string) => s.toast(r.ok ? okText : (r.error ?? ''), r.ok ? 'success' : 'danger');

  return (
    <>
      {alerts.length > 0 && (
        <div className="space-y-2" role="status">
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink ring-1 ring-line">
              <span className="text-ink">{a.icon}</span>
              <span className="min-w-0 flex-1">{a.text}</span>
              {a.action && (
                <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={a.action.run}>
                  {a.action.label} <ArrowRight size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t('admin.overview.members')} value={internal.length} hint={t('admin.overview.adminsCount', { count: activeAdminCount(accountsForRules) })} onClick={() => s.navigate({ name: 'admin', section: 'members' })} />
        <StatCard label={t('admin.overview.guests')} value={guests.length} onClick={() => s.navigate({ name: 'admin', section: 'guests' })} />
        <StatCard label={t('admin.overview.teams')} value={s.teams.filter((x) => !x.archivedAt).length} hint={t('admin.overview.projectsCount', { count: s.projects.filter((p) => !p.archivedAt).length })} onClick={() => s.navigate({ name: 'admin', section: 'teams' })} />
        <StatCard label={t('admin.overview.boards')} value={liveBoards.length} hint={t('admin.overview.inTrash', { count: s.boards.length - liveBoards.length })} onClick={() => s.navigate({ name: 'admin', section: 'trash' })} />
        <StatCard label={t('admin.overview.pendingInvites')} value={s.invitations.filter((i) => invitationStatus(i, now) === 'pending').length} />
        <StatCard label={t('admin.overview.storage')} value={storage === null ? '—' : formatBytes(storage)} hint={t('admin.overview.storageHint')} />
      </div>

      <AdminSection
        title={t('admin.overview.recentTitle')}
        aside={<button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={() => s.navigate({ name: 'admin', section: 'audit' })}>{t('admin.overview.seeAudit')} <ArrowRight size={14} /></button>}
      >
        {s.auditLog.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('admin.audit.empty')}</p>
        ) : (
          <ul className="divide-y divide-[var(--od-border)]">
            {s.auditLog.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-ink-subtle">{formatTimeAgo(e.timestamp)}</span>
                <span className="min-w-0 flex-1 text-ink">{auditText(e, s.directory)}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {/* Chat 07: usuários simulados só existem no Modo Local */}
      {!isServerMode() && (
      <AdminSection title={t('admin.overview.simulatedTitle')} description={t('admin.overview.simulatedText')}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="od-btn od-btn-primary od-btn-sm" onClick={() => report(s.addSimulatedUsers(), t('admin.overview.simulatedAdded'))}>
            <UserPlus size={15} /> {t('admin.overview.addSimulated')}
          </button>
          {simulated > 0 && (
            <ConfirmButton label={t('admin.overview.removeSimulated', { count: simulated })} onConfirm={() => report(s.removeSimulatedUsers(), t('admin.overview.simulatedRemoved'))} />
          )}
          <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <AlertTriangle size={13} /> {t('admin.overview.localNote')}
          </span>
        </div>
      </AdminSection>
      )}
    </>
  );
}
