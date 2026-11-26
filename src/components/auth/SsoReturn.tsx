import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, LoaderCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../utils/api';
import { API_ERROR_KEYS, type ApiErrorCode } from '../../utils/apiContract';
import { applyAuth } from '../../utils/serverSync';
import { tDynamic } from '../../i18n';
import { ownValue } from '../../utils/safeKeys';
import { useT } from '../../i18n/useT';
import { Logo } from '../ui/Logo';

/**
 * Chat 07 · B — volta do login da empresa (`#/auth/sso`). O servidor já criou a sessão (cookie httpOnly) e
 * não manda nenhum token pela URL: aqui só renovamos a sessão pelo cookie e entramos. Com `?error=<código>`
 * mostramos o motivo traduzido.
 */
export function SsoReturn({ error }: { error?: string }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const [failed, setFailed] = useState<string | null>(error ?? null);

  useEffect(() => {
    if (error || !api) return;
    let alive = true;
    void api.refresh().then(async (r) => {
      if (!alive) return;
      if (!r) return setFailed('ssoFailed');
      await applyAuth(r);
      navigate({ name: 'dashboard' });
    });
    return () => {
      alive = false;
    };
  }, [error, navigate]);

  // S-32: o código vem da URL — só chave PRÓPRIA do mapa (nada de `constructor`/`__proto__` herdados)
  const reason = failed ? tDynamic(ownValue(API_ERROR_KEYS as Record<string, (typeof API_ERROR_KEYS)[ApiErrorCode]>, failed) ?? API_ERROR_KEYS.ssoFailed) : '';

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--od-app-bg)] px-5 py-12">
      <div className="w-full max-w-[420px] animate-slide-up rounded-2xl bg-panel p-7 shadow-modal" role={failed ? 'alert' : 'status'}>
        <Logo markSize={26} />
        <div className="mt-7 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-brand-800 dark:text-brand-200">
          {failed ? <KeyRound size={22} /> : <LoaderCircle size={22} className="animate-spin" />}
        </span>
          <h1 className="text-xl font-bold text-ink">{failed ? t('server.sso.failedTitle') : t('server.sso.working')}</h1>
        </div>
        {failed && (
          <>
            <p className="mt-1.5 text-sm text-ink-muted">{reason}</p>
            <button type="button" className="od-btn od-btn-primary mt-5 w-full" onClick={() => navigate({ name: 'login' })}>
              <ArrowLeft size={16} /> {t('server.sso.back')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
