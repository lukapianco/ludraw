import { ArrowLeft, Lock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n/useT';

/** Board sem acesso (Espaço Pessoal alheio, time de que não participa, lixeira, conta suspensa). */
export function BoardNoAccess({ reason }: { reason?: string }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  return (
    <div className="flex h-full items-center justify-center bg-[var(--od-app-bg)] px-5">
      <div className="w-full max-w-[420px] animate-slide-up rounded-2xl bg-panel p-7 text-center shadow-modal">
        <div className="flex items-center gap-3 justify-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-brand-900 dark:text-brand-200">
          <Lock size={22} />
        </span>
          <h1 className="text-xl font-bold text-ink">{t('share.noAccess.title')}</h1>
        </div>
        <p className="mt-1.5 text-sm text-ink-muted">{reason ?? t('permissions.denied.noAccess')}</p>
        <button type="button" className="od-btn od-btn-primary mt-5" onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'login' })}>
          <ArrowLeft size={16} /> {user ? t('share.gate.backHome') : t('share.gate.signIn')}
        </button>
      </div>
    </div>
  );
}
