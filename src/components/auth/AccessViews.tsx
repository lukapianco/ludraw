import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Hand, Link2, LoaderCircle, Lock, Mail, MessageSquareText, User, UserPlus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n/useT';
import { translateMessage } from '../../i18n';
import { api, ApiError, errorText } from '../../utils/api';
import { ACCESS_REQUEST_LIMITS, MAIL_TOKEN_MINUTES, type JoinLinkPreview, type SignupPreview } from '../../utils/apiContract';
import { checkPasswordStrength } from '../../utils/passwordPolicy';
import { applyAuth } from '../../utils/serverSync';
import { clearToken, readToken, tokenScreenActive, type TokenRoute } from '../../utils/tokenLink';
import { isValidEmail } from '../../utils/workspace';
import { roleLabel } from '../../utils/workspaceDisplay';
import { PasswordInput } from '../ui/PasswordInput';
import { AuthField, AuthShell, useAuthHeadingTag } from './AuthShell';
import { mailLangNow } from './EmailAccessViews';

/**
 * Chat 08.5 · B — telas sem conta do acesso por link e da fila de pedidos, no casco da entrada (`AuthShell`) e com a
 * guarda do primeiro acesso (`serverSync.inSetup`):
 *  - `#/join`            link de convite geral (o token já saiu do endereço);
 *  - `#/signup`          concluir o cadastro aberto pelo e-mail;
 *  - `#/request-access`  pedir acesso à administração (política `allowAccessRequests`);
 *  - `#/access`          confirmar o pedido pelo link do e-mail;
 *  - `#/register`        (Chat 08.5 · C) cadastro com o e-mail da organização — sem lista de domínios na tela.
 * As respostas não revelam se um e-mail já tem conta. `demo` (Sistema visual) mostra cada estado sem servidor.
 * Em que difere do padrão de mercado: o pedido de acesso e o link de convite terminam na mesma tela neutra de
 * "recebido" (sem dizer se a conta existe), no casco de duas colunas da entrada, em vez de um formulário de cadastro aberto.
 */

function useScreenToken(route: TokenRoute, demo?: string): string | null {
  const [token] = useState(() => (demo ? null : readToken(route)));
  useEffect(() => {
    if (demo) return;
    tokenScreenActive(true);
    return () => tokenScreenActive(false);
  }, [demo]);
  return token;
}

function Heading({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: ReactNode }) {
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

function Done({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 flex gap-2.5 rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line" role="status" data-testid="access-done">
      <CircleCheck size={17} className="mt-0.5 shrink-0 text-brand-800 dark:text-brand-200" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="animate-pop-in rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">
      {text}
    </div>
  );
}

function Checking({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
      <LoaderCircle size={16} className="animate-spin" /> {text}
    </p>
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

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <>
      <Heading icon={<CircleAlert size={18} />} title={title} subtitle={body} />
      <BackToLogin />
    </>
  );
}

/* ---------------------------------- Link de convite geral ---------------------------------- */

const DEMO_PREVIEW: JoinLinkPreview = { organizationName: 'Empresa Exemplo', role: 'member', allowedDomain: 'empresa.com', status: 'active', mode: 'email' };

export function JoinView({ demo }: { demo?: 'email' | 'approval' | 'sent-email' | 'sent-approval' } = {}) {
  const t = useT();
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const token = useScreenToken('join', demo);
  const demoMode = demo === 'approval' || demo === 'sent-approval' ? 'approval' : 'email';
  const [preview, setPreview] = useState<JoinLinkPreview | null | 'missing'>(demo ? { ...DEMO_PREVIEW, mode: demoMode } : token ? null : 'missing');
  const [name, setName] = useState(demo?.startsWith('sent') ? 'Caio Silva' : '');
  const [email, setEmail] = useState(demo?.startsWith('sent') ? 'caio@empresa.com' : '');
  const [sent, setSent] = useState<'email' | 'approval' | null>(demo === 'sent-email' ? 'email' : demo === 'sent-approval' ? 'approval' : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (demo || !token || !api) return;
    let alive = true;
    api
      .joinPreview(token)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setPreview('missing'));
    return () => {
      alive = false;
    };
  }, [token, demo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!preview || preview === 'missing') return;
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value)) return setError(t('common.enterValidEmailAddress'));
    if (preview.mode === 'approval' && name.trim().length < 2) return setError(t('auth.loginView.enterYourName'));
    if (demo || !api || !token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.joinLink(token, { email: value, ...(preview.mode === 'approval' ? { name: name.trim() } : {}), lang: mailLangNow() });
      setSent(r.mode);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const body = (() => {
    if (preview === null) return <Checking text={t('server.joinView.checking')} />;
    if (preview === 'missing') return <Unavailable title={t('server.joinView.missingTitle')} body={t('server.joinView.missingBody')} />;
    if (preview.status !== 'active') {
      const why = { revoked: t('workspace.errors.inviteLinkRevoked'), expired: t('workspace.errors.inviteLinkExpired'), exhausted: t('workspace.errors.inviteLinkExhausted') }[preview.status];
      return <Unavailable title={t('server.joinView.unavailableTitle')} body={why} />;
    }
    if (user && !demo) {
      return (
        <>
          <Heading icon={<CircleCheck size={18} />} title={t('server.joinView.signedInTitle')} subtitle={t('server.joinView.signedInBody', { org: preview.organizationName })} />
          <button type="button" className="od-btn od-btn-primary od-btn-lg mt-6 w-full" onClick={() => navigate({ name: 'dashboard' })}>
            {t('server.verifyView.continue')} <ArrowRight size={17} />
          </button>
        </>
      );
    }
    const subtitle = t('server.joinView.subtitle', { org: preview.organizationName, role: roleLabel(preview.role) });
    if (sent) {
      return (
        <>
          <Heading icon={<Link2 size={18} />} title={t('server.joinView.title')} subtitle={subtitle} />
          {sent === 'email' ? (
            <Done title={t('server.forgotView.sentTitle')} body={t('server.joinView.sentEmail', { email: email.trim().toLowerCase(), minutes: MAIL_TOKEN_MINUTES.signup })} />
          ) : (
            <Done title={t('server.joinView.sentApprovalTitle')} body={t('server.joinView.sentApproval', { email: email.trim().toLowerCase() })} />
          )}
          <BackToLogin />
        </>
      );
    }
    return (
      <>
        <Heading icon={<Link2 size={18} />} title={t('server.joinView.title')} subtitle={subtitle} />
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="join-form">
          {preview.mode === 'approval' && (
            <AuthField label={t('common.name')} icon={<User size={16} />}>
              <input className="od-input ps-10" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.loginView.whatShouldWeCallYou')} autoComplete="name" maxLength={ACCESS_REQUEST_LIMITS.nameMax} />
            </AuthField>
          )}
          <AuthField label={t('common.email')} icon={<Mail size={16} />}>
            <input className="od-input ps-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.loginView.emailPlaceholder')} autoComplete="email" />
          </AuthField>
          {preview.allowedDomain && <p className="-mt-2 text-xs text-ink-subtle">{t('server.joinView.domainHint', { domain: preview.allowedDomain })}</p>}
          <ErrorBox text={error} />
          <p className="text-xs leading-relaxed text-ink-subtle">{preview.mode === 'email' ? t('server.joinView.howEmail') : t('server.joinView.howApproval')}</p>
          <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {preview.mode === 'email' ? t('server.joinView.submitEmail') : t('server.joinView.submitApproval')}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
        <BackToLogin />
      </>
    );
  })();

  return <AuthShell embedded={!!demo}>{body}</AuthShell>;
}

/* ---------------------------------- Concluir cadastro ---------------------------------- */

export function SignupCompleteView({ demo }: { demo?: 'form' | 'invalid' } = {}) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const token = useScreenToken('signup', demo);
  const [preview, setPreview] = useState<SignupPreview | null | 'invalid'>(demo === 'form' ? { email: 'caio@empresa.com', organizationName: 'Empresa Exemplo', role: 'member' } : demo === 'invalid' ? 'invalid' : token ? null : 'invalid');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (demo || !token || !api) return;
    let alive = true;
    api
      .signupPreview(token)
      .then((p) => alive && setPreview(p))
      .catch(() => {
        if (!alive) return;
        clearToken('signup');
        setPreview('invalid');
      });
    return () => {
      alive = false;
    };
  }, [token, demo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!preview || preview === 'invalid') return;
    if (name.trim().length < 2) return setError(t('auth.loginView.enterYourName'));
    const weak = checkPasswordStrength(password, { email: preview.email, name });
    if (weak) return setError(translateMessage(weak));
    if (password !== confirm) return setError(t('server.resetView.mismatch'));
    if (demo || !api || !token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.signupComplete(token, { name: name.trim(), password });
      clearToken('signup');
      await applyAuth(r);
      navigate({ name: 'dashboard' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'tokenInvalid') {
        clearToken('signup');
        setPreview('invalid');
      } else setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  let body: ReactNode;
  if (preview === null) body = <Checking text={t('server.resetView.checking')} />;
  else if (preview === 'invalid') {
    body = (
      <>
        <Heading icon={<CircleAlert size={18} />} title={t('server.resetView.invalidTitle')} subtitle={t('server.signupView.invalidBody', { minutes: MAIL_TOKEN_MINUTES.signup })} />
        <BackToLogin />
      </>
    );
  } else {
    body = (
      <>
        <Heading icon={<UserPlus size={18} />} title={t('server.signupView.title')} subtitle={t('server.signupView.subtitle', { org: preview.organizationName, role: roleLabel(preview.role) })} />
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="signup-form">
          <AuthField label={t('common.email')} icon={<Mail size={16} />}>
            <input className="od-input ps-10" value={preview.email} readOnly aria-readonly="true" />
          </AuthField>
          <AuthField label={t('common.name')} icon={<User size={16} />}>
            <input className="od-input ps-10" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.loginView.whatShouldWeCallYou')} autoComplete="name" autoFocus={!demo} maxLength={ACCESS_REQUEST_LIMITS.nameMax} />
          </AuthField>
          <AuthField label={t('auth.loginView.password')} icon={<Lock size={16} />} raiseIcon>
            <PasswordInput className="od-input ps-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('server.resetView.newPasswordPlaceholder')} autoComplete="new-password" />
          </AuthField>
          <AuthField label={t('server.resetView.confirm')} icon={<Lock size={16} />} raiseIcon>
            <PasswordInput className="od-input ps-10" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('server.resetView.confirmPlaceholder')} autoComplete="new-password" />
          </AuthField>
          <ErrorBox text={error} />
          <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {t('server.signupView.submit')}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
      </>
    );
  }
  return <AuthShell embedded={!!demo}>{body}</AuthShell>;
}

/* ---------------------------------- Pedir acesso ---------------------------------- */

export function RequestAccessView({ demo }: { demo?: 'form' | 'sent-email' | 'sent-approval' } = {}) {
  const t = useT();
  const info = useAppStore((s) => s.serverInfo);
  const [name, setName] = useState(demo?.startsWith('sent') ? 'Caio Silva' : '');
  const [email, setEmail] = useState(demo?.startsWith('sent') ? 'caio@empresa.com' : '');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<'email' | 'approval' | null>(demo === 'sent-email' ? 'email' : demo === 'sent-approval' ? 'approval' : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const enabled = !!demo || !!info?.accessRequests;
  const org = demo ? 'Empresa Exemplo' : (info?.organizationName ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError(t('auth.loginView.enterYourName'));
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value)) return setError(t('common.enterValidEmailAddress'));
    if (demo || !api) return;
    setLoading(true);
    setError(null);
    try {
      await api.requestAccess({ name: name.trim(), email: value, ...(message.trim() ? { message: message.trim() } : {}), lang: mailLangNow() });
      setSent(info?.email ? 'email' : 'approval');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  let body: ReactNode;
  if (!enabled) body = <Unavailable title={t('server.requestView.offTitle')} body={t('server.requestView.offBody')} />;
  else if (sent) {
    body = (
      <>
        <Heading icon={<Hand size={18} />} title={t('server.requestView.title')} subtitle={t('server.requestView.subtitle', { org })} />
        {sent === 'email' ? (
          <Done title={t('server.forgotView.sentTitle')} body={t('server.requestView.sentEmail', { email: email.trim().toLowerCase(), minutes: MAIL_TOKEN_MINUTES.accessRequest })} />
        ) : (
          <Done title={t('server.joinView.sentApprovalTitle')} body={t('server.requestView.sentApproval', { email: email.trim().toLowerCase() })} />
        )}
        <BackToLogin />
      </>
    );
  } else {
    body = (
      <>
        <Heading icon={<Hand size={18} />} title={t('server.requestView.title')} subtitle={t('server.requestView.subtitle', { org })} />
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="request-form">
          <AuthField label={t('common.name')} icon={<User size={16} />}>
            <input className="od-input ps-10" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.loginView.whatShouldWeCallYou')} autoComplete="name" autoFocus={!demo} maxLength={ACCESS_REQUEST_LIMITS.nameMax} />
          </AuthField>
          <AuthField label={t('common.email')} icon={<Mail size={16} />}>
            <input className="od-input ps-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.loginView.emailPlaceholder')} autoComplete="email" />
          </AuthField>
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{t('server.requestView.message')}</span>
              <span className="text-xs text-ink-subtle">{t('server.requestView.optional')}</span>
            </span>
            <span className="relative block">
              <MessageSquareText size={16} className="pointer-events-none absolute start-3.5 top-3 text-ink-subtle" />
              <textarea className="od-input min-h-[88px] resize-y py-2.5 ps-10" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('server.requestView.messagePlaceholder')} maxLength={ACCESS_REQUEST_LIMITS.messageMax} />
            </span>
          </label>
          <ErrorBox text={error} />
          <p className="text-xs leading-relaxed text-ink-subtle">{demo || info?.email ? t('server.requestView.howEmail') : t('server.requestView.howApproval')}</p>
          <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
            {t('server.requestView.submit')}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
        <BackToLogin />
      </>
    );
  }
  return <AuthShell embedded={!!demo}>{body}</AuthShell>;
}

/* ------------------------ Chat 08.5 · C: cadastro com o e-mail da organização ------------------------ */

/**
 * `#/register`: só o e-mail. A tela NUNCA mostra os domínios aceitos e termina sempre na mesma faixa neutra —
 * a resposta do servidor é a mesma para qualquer endereço (domínio fora, conta existente, removido, teto do dia).
 */
export function SignupRequestView({ demo }: { demo?: 'form' | 'sent' } = {}) {
  const t = useT();
  const info = useAppStore((s) => s.serverInfo);
  const [email, setEmail] = useState(demo === 'sent' ? 'ana@empresa.com' : '');
  const [sent, setSent] = useState(demo === 'sent');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const enabled = !!demo || info?.registration === 'domain';
  const org = demo ? 'Empresa Exemplo' : (info?.organizationName ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value)) return setError(t('common.enterValidEmailAddress'));
    if (demo || !api) return;
    setLoading(true);
    setError(null);
    try {
      await api.requestSignup({ email: value, lang: mailLangNow() });
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  let body: ReactNode;
  if (!enabled) body = <Unavailable title={t('server.registerView.offTitle')} body={t('server.registerView.offBody')} />;
  else {
    body = (
      <>
        <Heading icon={<UserPlus size={18} />} title={t('server.registerView.title')} subtitle={t('server.registerView.subtitle', { org })} />
        {sent ? (
          <div data-testid="register-done">
            <Done title={t('server.forgotView.sentTitle')} body={t('server.registerView.sent', { email: email.trim().toLowerCase(), minutes: MAIL_TOKEN_MINUTES.signup })} />
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="register-form">
            <AuthField label={t('common.email')} icon={<Mail size={16} />}>
              <input className="od-input ps-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.loginView.emailPlaceholder')} autoComplete="email" autoFocus={!demo} />
            </AuthField>
            <ErrorBox text={error} />
            <p className="text-xs leading-relaxed text-ink-subtle">{t('server.registerView.how')}</p>
            <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
              {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
              {t('server.registerView.submit')}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>
        )}
        <BackToLogin />
      </>
    );
  }
  return <AuthShell embedded={!!demo}>{body}</AuthShell>;
}

/* ---------------------------------- Confirmar o pedido ---------------------------------- */

export function AccessConfirmView({ demo }: { demo?: 'ok' | 'invalid' } = {}) {
  const t = useT();
  const token = useScreenToken('access', demo);
  const [phase, setPhase] = useState<'checking' | 'ok' | 'invalid' | 'full'>(demo ?? (token ? 'checking' : 'invalid'));
  const started = useRef(false);

  useEffect(() => {
    if (demo || !token || !api || started.current) return;
    started.current = true; // StrictMode monta duas vezes: o token é de uso único
    api
      .confirmAccessRequest(token)
      .then(() => {
        clearToken('access');
        setPhase('ok');
      })
      .catch((err) => {
        clearToken('access');
        setPhase(err instanceof ApiError && err.code === 'accessQueueFull' ? 'full' : 'invalid');
      });
  }, [token, demo]);

  let body: ReactNode;
  if (phase === 'checking') body = <Checking text={t('server.accessView.checking')} />;
  else if (phase === 'ok') {
    body = (
      <>
        <Heading icon={<CircleCheck size={18} />} title={t('server.accessView.okTitle')} subtitle={t('server.accessView.okBody')} />
        <BackToLogin />
      </>
    );
  } else {
    body = <Unavailable title={phase === 'full' ? t('server.accessView.fullTitle') : t('server.resetView.invalidTitle')} body={phase === 'full' ? t('server.errors.accessQueueFull') : t('server.accessView.invalidBody', { minutes: MAIL_TOKEN_MINUTES.accessRequest })} />;
  }
  return <AuthShell embedded={!!demo}>{body}</AuthShell>;
}
