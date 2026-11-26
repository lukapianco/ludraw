import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRightLeft, Building2, DatabaseBackup, ClipboardList, Handshake, LayoutDashboard, Lock, ShieldCheck, Trash2, Users, UsersRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { AdminSection } from '../../types/workspace';
import { ADMIN_SECTIONS } from '../../utils/router';
import { cn } from '../../utils/cn';
import { useOrgMembers, useWorkspaceCan } from '../../hooks/useWorkspace';
import { AppHeader } from '../dashboard/AppHeader';
import { CommandPalette } from '../dashboard/CommandPalette';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';
import { AdminOverview } from './AdminOverview';
import { AdminGuests, AdminMembers } from './AdminPeople';
import { AdminTeams } from './AdminTeams';
import { AdminPolicies } from './AdminPolicies';
import { AdminAudit } from './AdminAudit';
import { AdminTrash } from './AdminTrash';
import { AdminTransfer } from './AdminTransfer';
import { AdminBackup } from './AdminBackup';

const NAV: Record<AdminSection, { icon: ReactNode; title: TKey; description: TKey }> = {
  overview: { icon: <LayoutDashboard size={17} />, title: 'admin.nav.overview', description: 'admin.nav.overviewHint' },
  members: { icon: <Users size={17} />, title: 'admin.nav.members', description: 'admin.nav.membersHint' },
  guests: { icon: <Handshake size={17} />, title: 'admin.nav.guests', description: 'admin.nav.guestsHint' },
  teams: { icon: <UsersRound size={17} />, title: 'admin.nav.teams', description: 'admin.nav.teamsHint' },
  policies: { icon: <ShieldCheck size={17} />, title: 'admin.nav.policies', description: 'admin.nav.policiesHint' },
  audit: { icon: <ClipboardList size={17} />, title: 'admin.nav.audit', description: 'admin.nav.auditHint' },
  trash: { icon: <Trash2 size={17} />, title: 'admin.nav.trash', description: 'admin.nav.trashHint' },
  transfer: { icon: <ArrowRightLeft size={17} />, title: 'admin.nav.transfer', description: 'admin.nav.transferHint' },
  backup: { icon: <DatabaseBackup size={17} />, title: 'admin.nav.backup', description: 'admin.nav.backupHint' },
};

/**
 * Administração do Workspace (`#/admin/<seção>`) — Chat 06 · WORKSPACE_ADMIN_SPEC §3.
 * Só `admin` entra (`can('workspace.admin.view')`); os demais veem o motivo de `explain()`.
 * Diferença de mercado: "caderno de seções" com contadores na navegação e alertas fixos no topo do
 * conteúdo — sem planos, upsell ou painéis de uso pagos (tudo é gratuito e auto-hospedável).
 */
export function AdminView({ section }: { section: AdminSection }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const access = useWorkspaceCan('workspace.admin.view');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const members = useOrgMembers();
  const teams = useAppStore((s) => s.teams);
  const boards = useAppStore((s) => s.boards);
  const counts = useMemo(
    () => ({
      members: members.filter((a) => a.status !== 'removed' && (a.role === 'admin' || a.role === 'member')).length,
      guests: members.filter((a) => a.status !== 'removed' && a.role === 'guest_b2b').length,
      teams: teams.filter((x) => !x.archivedAt).length,
      trash: boards.filter((b) => b.deletedAt).length,
    }),
    [members, teams, boards],
  );
  const count = (k: AdminSection): number | undefined => (k === 'members' || k === 'guests' || k === 'teams' || k === 'trash' ? counts[k] : undefined);

  return (
    <div className="flex h-full flex-col bg-[var(--od-app-bg)]">
      <AppHeader onOpenPalette={() => setPaletteOpen(true)} />
      {!access.allowed ? (
        <main className="flex flex-1 items-center justify-center px-5">
          <div className="w-full max-w-[440px] animate-slide-up rounded-2xl bg-panel p-7 text-center shadow-modal">
            <div className="flex items-center gap-3 justify-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-brand-900 dark:text-brand-200"><Lock size={22} /></span>
              <h1 className="text-xl font-bold text-ink">{t('admin.gate.title')}</h1>
            </div>
            <p className="mt-1.5 text-sm text-ink-muted">{access.reason}</p>
            <button type="button" className="od-btn od-btn-primary mt-5" onClick={() => navigate({ name: 'dashboard' })}>
              <ArrowLeft size={16} /> {t('share.gate.backHome')}
            </button>
          </div>
        </main>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 md:grid-cols-[250px_minmax(0,1fr)] md:px-8">
            <nav aria-label={t('admin.nav.title')} className="md:sticky md:top-8 md:self-start">
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-panel p-3 shadow-panel">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-brand-900 dark:text-brand-200"><Building2 size={18} /></span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink"><WorkspaceName /></div>
                  <div className="truncate text-xs text-ink-subtle">{t('admin.nav.title')}</div>
                </div>
              </div>
              <div className="flex gap-1 overflow-x-auto md:flex-col">
                {ADMIN_SECTIONS.map((k) => {
                  const n = count(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-current={section === k ? 'page' : undefined}
                      onClick={() => navigate({ name: 'admin', section: k })}
                      className={cn(
                        'flex min-w-[150px] items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors duration-base ease-out md:min-w-0',
                        section === k ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:bg-panel-hover hover:text-ink',
                      )}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', section === k ? 'bg-accent-soft text-brand-900 dark:text-brand-200' : 'bg-panel-sunken')}>{NAV[k].icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{t(NAV[k].title)}</span>
                        <span className="block truncate text-xs text-ink-subtle">{t(NAV[k].description)}</span>
                      </span>
                      {n !== undefined && <span className="rounded-full bg-panel-sunken px-1.5 text-[11px] font-semibold tabular-nums text-ink-muted ring-1 ring-line">{n}</span>}
                    </button>
                  );
                })}
              </div>
            </nav>
            <main key={section} className="min-w-0 animate-slide-up space-y-5">
              <header>
                <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{t(NAV[section].title)}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t(NAV[section].description)}</p>
              </header>
              {section === 'overview' && <AdminOverview />}
              {section === 'members' && <AdminMembers />}
              {section === 'guests' && <AdminGuests />}
              {section === 'teams' && <AdminTeams />}
              {section === 'policies' && <AdminPolicies />}
              {section === 'audit' && <AdminAudit />}
              {section === 'trash' && <AdminTrash />}
              {section === 'transfer' && <AdminTransfer />}
              {section === 'backup' && <AdminBackup />}
            </main>
          </div>
        </div>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function WorkspaceName() {
  return <>{useAppStore((s) => s.workspace.name)}</>;
}
