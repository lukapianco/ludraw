import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, KeyRound, LoaderCircle, Lock, Mail, MailCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n/useT';
import { getLocale, translateMessage } from '../../i18n';
import { api, ApiError, errorText } from '../../utils/api';
import { MAIL_TOKEN_MINUTES, type MailLang } from '../../utils/apiContract';
import { checkPasswordStrength } from '../../utils/passwordPolicy';
import { clearToken, readToken, tokenScreenActive, type TokenRoute } from '../../utils/tokenLink';
import { isValidEmail } from '../../utils/workspace';
import { PasswordInput } from '../ui/PasswordInput';
import { AuthField, AuthShell, useAuthHeadingTag } from './AuthShell';

/**
 * Chat 08.5 — telas sem conta ligadas ao e-mail, no mesmo casco da entrada (`AuthShell`):
 *  - `#/forgot`  esqueci a senha → resposta neutra (não revela se a conta existe);
 *  - `#/reset`   criar nova senha (o token chegou no link e já saiu do endereço — `utils/tokenLink.ts`);
 *  - `#/verify`  confirmar o e-mail.
 * `demo` (Sistema visual) mostra cada estado sem falar com o servidor.
 */

export function mailLangNow(): MailLang {
  return getLocale() === 'en' ? 'en' : 'pt-BR';
}

/** Token guardado para a tela (sem apagar — ver `readToken`) e a política de referência enquanto a tela existe. */
function useScreenToken(route: TokenRoute, demo?: string): string | null {
  const [token] = useState(() => (demo ? null : readToken(route)));
  useEffect(() => {
    if (demo) return;
    tokenScreenActive(true);
    return () => tokenScreenActive(false);
  }, [demo]);
  return token;
}

function Heading({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  const H = useAuthHeadingTag();
  return (
    <>
      <H className="flex items-center gap-2.5 font-display text-3xl font-semibold tracking-[-0.01em] text-ink">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-brand-800 ring-1 ring-line dark:text-brand-200">{icon}</span>
        {title}
      </H>
      {subtitle && <p className="mt-2 text-base text-ink-muted">{subtitle}</p>}
    </>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'danger'; children: ReactNode }) {
  return (
    <div
      className={tone === 'ok' ? 'mt-6 flex gap-2.5 rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line' : 'mt-6 flex gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger'}
      role={tone === 'ok' ? 'status' : 'alert'}
    >
      {tone === 'ok' ? <CircleCheck size={17} className="mt-0.5 shrink-0 text-brand-800 dark:text-brand-200" /> : <CircleAlert size={17} className="mt-0.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

function BackToLogin() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  return (
    <button type="button" className="od-btn od-btn-ghost mt-6 w-full text-ink-muted" onClick={() => navigate({ name: 'login' })}>
      <ArrowLeft size={16} /> {t('server.forgotView.back')}
    </button>
  );
}

/* --------------------------------- Esqueci a senha --------------------------------- */

export function ForgotPasswordView({ demo }: { demo?: 'form' | 'sent' } = {}) {
  const t = useT();
  const [email, setEmail] = useState(demo === 'sent' ? 'voce@empresa.com' : '');
  const [sentTo, setSentTo] = useState<string | null>(demo === 'sent' ? 'voce@empresa.com' : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value)) return setError(t('common.enterValidEmailAddress'));
    if (demo || !api) return;
    setLoading(true);
    setError(null);
    try {
      await api.forgotPassword(value, mailLangNow());
      setSentTo(value);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell embedded={!!demo}>
      <Heading icon={<KeyRound size={18} />} title={t('server.forgotView.title')} subtitle={sentTo ? undefined : t('server.forgotView.subtitle')} />
      {sentTo ? (
        <>
          <Notice tone="ok">
            <p className="font-semibold">{t('server.forgotView.sentTitle')}</p>
            <p className="mt-1 text-ink-muted">{t('server.forgotView.sentBody', { email: sentTo, minutes: MAIL_TOKEN_MINUTES.resetPassword })}</p>
          </Notice>
          <button type="button" className="od-btn od-btn-secondary mt-4 w-full" onClick={() => setSentTo(null)}>
            {t('server.forgotView.again')}
          </button>
        </>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="forgot-form">
          <AuthField label={t('common.email')} error={error ?? undefined} icon={<Mail size={16} />}>
            <input
              className="od-input ps-10"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.loginView.emailPlaceholder')}
              autoComplete="email"
              autoFocus={!demo}
              aria-invalid={!!error}
            />
          </AuthField>
          <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {t('server.forgotView.submit')}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
      )}
      <BackToLogin />
    </AuthShell>
  );
}

/* --------------------------------- Criar nova senha --------------------------------- */

type ResetPhase = 'checking' | 'form' | 'invalid';

export function ResetPasswordView({ demo }: { demo?: ResetPhase } = {}) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const token = useScreenToken('reset', demo);
  const [phase, setPhase] = useState<ResetPhase>(demo ?? (token ? 'checking' : 'invalid'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (demo || !token || !api) return;
    let alive = true;
    api
      .checkResetToken(token)
      .then((r) => {
        if (!alive) return;
        setPhase(r.valid ? 'form' : 'invalid');
        if (!r.valid) clearToken('reset');
      })
      .catch((err) => {
        if (!alive) return;
        setPhase('form'); // sem rede na conferência: o envio confere de novo
        setError(errorText(err));
      });
    return () => {
      alive = false;
    };
  }, [token, demo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const weak = checkPasswordStrength(password, {});
    if (weak) return setError(translateMessage(weak));
    if (password !== confirm) return setError(t('server.resetView.mismatch'));
    if (demo || !api || !token) return;
    setLoading(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      clearToken('reset');
      useAppStore.getState().toast(t('server.resetView.done'), 'success');
      navigate({ name: 'login' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'tokenInvalid') {
        clearToken('reset');
        setPhase('invalid');
      }
      else setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell embedded={!!demo}>
      {phase === 'invalid' ? (
        <>
          <Heading icon={<CircleAlert size={18} />} title={t('server.resetView.invalidTitle')} subtitle={t('server.resetView.invalidBody', { minutes: MAIL_TOKEN_MINUTES.resetPassword })} />
          <button type="button" className="od-btn od-btn-primary od-btn-lg mt-6 w-full" onClick={() => navigate({ name: 'forgot' })}>
            {t('server.resetView.askAgain')} <ArrowRight size={17} />
          </button>
          <BackToLogin />
        </>
      ) : phase === 'checking' ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
          <LoaderCircle size={16} className="animate-spin" /> {t('server.resetView.checking')}
        </p>
      ) : (
        <>
          <Heading icon={<Lock size={18} />} title={t('server.resetView.title')} subtitle={t('server.resetView.subtitle')} />
          <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="reset-form">
            <AuthField label={t('server.resetView.newPassword')} icon={<Lock size={16} />} raiseIcon>
              <PasswordInput
                className="od-input ps-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('server.resetView.newPasswordPlaceholder')}
                autoComplete="new-password"
                autoFocus={!demo}
              />
            </AuthField>
            <AuthField label={t('server.resetView.confirm')} icon={<Lock size={16} />} raiseIcon>
              <PasswordInput className="od-input ps-10" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('server.resetView.confirmPlaceholder')} autoComplete="new-password" />
            </AuthField>
            {error && (
              <div className="animate-pop-in rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">
                {error}
              </div>
            )}
            <p className="text-xs text-ink-subtle">{t('server.resetView.sessionsNote')}</p>
            <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
              {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
              {t('server.resetView.submit')}
            </button>
          </form>
          <BackToLogin />
        </>
      )}
    </AuthShell>
  );
}

/* --------------------------------- Confirmar e-mail --------------------------------- */

type VerifyPhase = 'checking' | 'ok' | 'invalid';

export function VerifyEmailView({ demo }: { demo?: VerifyPhase } = {}) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const token = useScreenToken('verify', demo);
  const [phase, setPhase] = useState<VerifyPhase>(demo ?? (token ? 'checking' : 'invalid'));
  const started = useRef(false);

  useEffect(() => {
    if (demo || !token || !api || started.current) return;
    started.current = true; // StrictMode monta duas vezes: o token é de uso único
    api
      .verifyEmail(token)
      .then(() => {
        clearToken('verify');
        setPhase('ok');
        useAppStore.setState((s) => ({ serverAuth: s.serverAuth ? { ...s.serverAuth, emailVerified: true } : s.serverAuth }));
      })
      .catch(() => {
        clearToken('verify');
        setPhase('invalid');
      });
  }, [token, demo]);

  return (
    <AuthShell embedded={!!demo}>
      {phase === 'checking' ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
          <LoaderCircle size={16} className="animate-spin" /> {t('server.verifyView.checking')}
        </p>
      ) : phase === 'ok' ? (
        <>
          <Heading icon={<MailCheck size={18} />} title={t('server.verifyView.okTitle')} subtitle={t('server.verifyView.okBody')} />
          <button type="button" className="od-btn od-btn-primary od-btn-lg mt-6 w-full" onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'login' })} data-testid="verify-continue">
            {t('server.verifyView.continue')} <ArrowRight size={17} />
          </button>
        </>
      ) : (
        <>
          <Heading icon={<CircleAlert size={18} />} title={t('server.resetView.invalidTitle')} subtitle={t('server.verifyView.invalidBody', { minutes: MAIL_TOKEN_MINUTES.verifyEmail })} />
          <BackToLogin />
        </>
      )}
    </AuthShell>
  );
}
