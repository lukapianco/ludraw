import { LogOut, ShieldOff } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Logo } from '../ui/Logo';
import { useT } from '../../i18n/useT';
import type { MembershipStatus } from '../../types/workspace';

/**
 * Emenda v1.1 §10 — participação suspensa/removida: a sessão aberta deixa de mostrar QUALQUER dado da
 * organização e só oferece sair. Reativar restaura o acesso exatamente como estava.
 */
export function AccessSuspended({ status }: { status: MembershipStatus }) {
  const t = useT();
  const logout = useAppStore((s) => s.logout);
  const org = useAppStore((s) => s.workspace.name);
  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--od-app-bg)] px-5 py-12">
      <div className="w-full max-w-[420px] animate-slide-up rounded-2xl bg-panel p-7 shadow-modal" role="alert">
        <Logo markSize={26} />
        <div className="mt-7 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-ink">
          <ShieldOff size={22} />
        </span>
          <h1 className="text-xl font-bold text-ink">{status === 'removed' ? t('workspace.suspended.removedTitle') : t('workspace.suspended.title')}</h1>
        </div>
        <p className="mt-1.5 text-sm text-ink-muted">{status === 'removed' ? t('workspace.suspended.removedText', { org }) : t('workspace.suspended.text', { org })}</p>
        <button type="button" className="od-btn od-btn-primary mt-5 w-full" onClick={() => logout()}>
          <LogOut size={16} /> {t('dashboard.appHeader.signOut')}
        </button>
      </div>
    </div>
  );
}
