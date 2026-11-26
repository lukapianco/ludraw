/**
 * Chat 08.5 — faixa discreta da Mesa: "confirme seu e-mail". Aparece só no Modo Servidor, com e-mail
 * configurado no servidor e e-mail ainda não confirmado. Não bloqueia nada; "Agora não" esconde até a
 * próxima abertura do app (fica na memória da aba).
 *
 * Em que difere do padrão de mercado: em vez de um aviso que bloqueia a conta até confirmar, é uma faixa
 * no mesmo lugar e no mesmo desenho dos outros avisos da Mesa, e a confirmação só destrava a recuperação
 * de senha e os convites por e-mail.
 */
import { useState } from 'react';
import { LoaderCircle, MailCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n/useT';
import { api, errorText } from '../../utils/api';
import { MAIL_TOKEN_MINUTES } from '../../utils/apiContract';
import { isServerMode } from '../../utils/serverConfig';
import { mailLangNow } from '../auth/EmailAccessViews';

let dismissedThisRun = false;

export function VerifyEmailBanner({ demo }: { demo?: 'idle' | 'sent' } = {}) {
  const t = useT();
  const email = useAppStore((s) => s.user?.email ?? '');
  const mailOn = useAppStore((s) => !!s.serverInfo?.email);
  const verified = useAppStore((s) => s.serverAuth?.emailVerified);
  const [dismissed, setDismissed] = useState(dismissedThisRun);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>(demo ?? 'idle');
  const shownEmail = demo ? 'voce@empresa.com' : email;
  if (!demo && (!isServerMode() || !mailOn || verified !== false || dismissed || !api)) return null;

  const send = async () => {
    if (demo || !api) return;
    setState('sending');
    try {
      const r = await api.sendVerifyEmail(mailLangNow());
      if (r.already) useAppStore.setState((s) => ({ serverAuth: s.serverAuth ? { ...s.serverAuth, emailVerified: true } : s.serverAuth }));
      setState('sent');
    } catch (err) {
      setState('idle');
      useAppStore.getState().toast(errorText(err), 'danger');
    }
  };

  return (
    <div role="status" data-testid="verify-email-banner" className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[13px] text-ink ring-1 ring-line">
      <MailCheck size={16} className="shrink-0 text-brand-800 dark:text-brand-200" />
      <span className="min-w-0 flex-1">
        {state === 'sent' ? t('server.verifyBanner.sent', { email: shownEmail, minutes: MAIL_TOKEN_MINUTES.verifyEmail }) : t('server.verifyBanner.text', { email: shownEmail })}
      </span>
      {state !== 'sent' && (
        <button type="button" className="od-btn od-btn-secondary od-btn-sm h-7" onClick={() => void send()} disabled={state === 'sending'}>
          {state === 'sending' && <LoaderCircle size={13} className="animate-spin" />}
          {t('server.verifyBanner.send')}
        </button>
      )}
      <button
        type="button"
        className="od-btn od-btn-ghost od-btn-sm h-7"
        onClick={() => {
          if (demo) return;
          dismissedThisRun = true;
          setDismissed(true);
        }}
      >
        {t('server.import.bannerDismiss')}
      </button>
    </div>
  );
}
