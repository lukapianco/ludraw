import { useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, KeyRound, LoaderCircle, Lock, Mail, MessageSquarePlus, RefreshCw, Server, User, UserPlus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Trans } from '../../i18n/Trans';
import { AuthField as Field, AuthShell } from './AuthShell';
import { InviteCodeEntry, InvitePanel } from './InvitePanel';
import { membershipAccounts } from '../../utils/workspace';
import { ServerInvitePanel } from './ServerInvitePanel';
import { ContinueLocalCard } from './ContinueLocalCard';
import { connection, isServerMode, localModeAllowed, switchMode as switchAppMode } from '../../utils/serverConfig';
import { api } from '../../utils/api';

type Mode = 'login' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tela de entrada (segue o Design System). No Chat 01 as contas são LOCAIS (offline):
 * nome/e-mail ficam no navegador e a senha é guardada apenas como hash SHA-256.
 * Chat 07: no Modo Servidor a mesma tela entra no servidor (e-mail/senha ou login da empresa); conta nova só
 * por convite (sem a aba "Criar conta") e "Continuar sem conta" dá lugar à configuração do servidor.
 */
export function LoginView({ inviteToken }: { inviteToken?: string } = {}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const continueAsGuest = useAppStore((s) => s.continueAsGuest);
  const navigate = useAppStore((s) => s.navigate);
  const hasAccounts = useAppStore((s) => s.accounts.length > 0);
  // emenda v1.1 §11: com administrador ativo, o cadastro só acontece por convite
  const inviteOnly = useAppStore((s) => membershipAccounts(s.directory, s.workspace.id).some((a) => a.workspaceRole === 'admin' && a.status === 'active'));
  // Chat 07: Modo Servidor
  const server = isServerMode();
  const serverInfo = useAppStore((s) => s.serverInfo);
  const reachable = useAppStore((s) => s.serverReachable);
  const openModal = useAppStore((s) => s.openModal);
  const serverName = serverInfo?.organizationName ?? (connection.url || t('server.connect.sameOrigin'));
  const ssoHref = server && serverInfo?.sso.enabled && api && typeof window !== 'undefined' ? api.ssoStartUrl(`${window.location.origin}${window.location.pathname}`) : null;

  const validate = () => {
    const next: typeof errors = {};
    if (mode === 'register' && name.trim().length < 2) next.name = t('auth.loginView.enterYourName');
    if (!EMAIL_RE.test(email.trim())) next.email = t('common.enterValidEmailAddress');
    // no servidor a regra de senha é do servidor (contas antigas podem ter senhas de outra regra)
    if (server ? !password : password.length < 6) next.password = t('auth.loginView.thePasswordMustBeLeast');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const result = mode === 'login' ? await login(email, password) : await register(name, email, password);
    setLoading(false);
    if (!result.ok) setErrors({ form: result.error });
    else navigate({ name: 'dashboard' });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
  };

  return (
    <AuthShell>
          {inviteToken ? (
            server ? <ServerInvitePanel token={inviteToken} /> : <InvitePanel token={inviteToken} />
          ) : (
          <>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.01em] text-ink">{mode === 'login' ? t('auth.loginView.welcomeBack') : t('auth.loginView.createYourLocalProfile')}</h1>
          <p className="mt-2 text-base text-ink-muted">
            {mode === 'login' ? t('auth.loginView.signContinueYourBoards') : t('auth.loginView.itTakes10SecondsYour')}
          </p>

          {server && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-line dark:text-brand-200">
              <Building2 size={13} /> {t('server.login.serverBadge', { name: serverName })}
            </p>
          )}
          {server && !reachable && (
            <div className="mt-5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger" role="alert">
              <p>{t('server.login.unreachable')}</p>
              <button type="button" className="od-btn od-btn-secondary mt-2 h-8" onClick={() => window.location.reload()}>
                <RefreshCw size={14} /> {t('server.login.retry')}
              </button>
            </div>
          )}
          {server && (
            <div className="mt-5 rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line" role="note">
              <p>{serverInfo?.registration === 'domain' ? t('server.login.inviteOrDomain') : t('server.login.inviteOnly')}</p>
              <div className="mt-2"><InviteCodeEntry /></div>
              {/* Chat 08.5 · B: só com a política "Aceitar pedidos de acesso" ligada */}
              {serverInfo?.accessRequests && (
                <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink underline decoration-ink-subtle underline-offset-[3px] hover:decoration-current focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)]" onClick={() => navigate({ name: 'request-access' })} data-testid="login-request-access">
                  <MessageSquarePlus size={15} className="shrink-0" /> {t('server.login.requestAccess')}
                </button>
              )}
              {/* Chat 08.5 · C: só com o cadastro pelo domínio ATIVO (política + e-mail + domínio) */}
              {serverInfo?.registration === 'domain' && (
                <button type="button" className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-ink underline decoration-ink-subtle underline-offset-[3px] hover:decoration-current focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)]" onClick={() => navigate({ name: 'register' })} data-testid="login-domain-signup">
                  <UserPlus size={15} className="shrink-0" /> {t('server.login.domainSignup')}
                </button>
              )}
            </div>
          )}
          {ssoHref && (
            <>
              <a className="od-btn od-btn-secondary od-btn-lg mt-5 w-full" href={ssoHref}>
                <KeyRound size={17} /> {t('server.login.sso', { label: serverInfo?.sso.label ?? 'SSO' })}
              </a>
              <div className="mt-4 flex items-center gap-3 text-xs font-medium text-ink-subtle">
                <span className="h-px flex-1 bg-line" /> {t('server.login.or')} <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          {!server && (
          <div className="mt-7 grid grid-cols-2 rounded-xl bg-panel-sunken p-1 ring-1 ring-line" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn(
                  'h-9 rounded-lg text-sm font-semibold transition-all duration-base ease-out',
                  mode === m ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink',
                )}
              >
                {m === 'login' ? t('auth.loginView.sign') : t('auth.loginView.createAccount')}
              </button>
            ))}
          </div>
          )}

          {!server && mode === 'register' && inviteOnly && (
            <div className="mt-5 rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line" role="note">
              <p>{t('workspace.registration.inviteOnly')}</p>
              <div className="mt-2"><InviteCodeEntry /></div>
            </div>
          )}
          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            {mode === 'register' && (
              <Field label={t('common.name')} error={errors.name} icon={<User size={16} />}>
                <input
                  className="od-input ps-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.loginView.whatShouldWeCallYou')}
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                />
              </Field>
            )}
            <Field label={t('common.email')} error={errors.email} icon={<Mail size={16} />}>
              <input
                className="od-input ps-10"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.loginView.emailPlaceholder')}
                autoComplete="email"
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field
              label={t('auth.loginView.password')}
              error={errors.password}
              icon={<Lock size={16} />}
              aside={
                mode === 'login' ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                    // Chat 08.5: com e-mail no servidor, a recuperação é por link (tela própria); sem ele, o aviso de sempre
                    onClick={() => (server && serverInfo?.email ? navigate({ name: 'forgot' }) : openModal({ type: 'forgot-password' }))}
                  >{t('auth.loginView.iForgotMyPassword')}</button>
                ) : null
              }
            >
              <input
                className="od-input ps-10 pe-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'login' ? t('auth.loginView.yourPassword') : t('auth.loginView.atLeast6Characters')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-panel-hover hover:text-ink"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('auth.loginView.hidePassword') : t('auth.loginView.showPassword')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </Field>

            {errors.form && (
              <div className="animate-pop-in rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">
                {errors.form}
                {mode === 'login' && !hasAccounts && !server && (
                  <>
                    {' '}
                    <button type="button" className="font-semibold underline" onClick={() => switchMode('register')}>{t('auth.loginView.createAccount')}</button>
                  </>
                )}
              </div>
            )}

            <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={loading}>
              {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
              {mode === 'login' ? t('auth.loginView.sign') : t('auth.loginView.createAccountSign')}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          {(!server || localModeAllowed()) && (
          <>
          <div className="my-6 flex items-center gap-3 text-xs font-medium text-ink-subtle">
            <span className="h-px flex-1 bg-line" /> {t('server.login.orSeparator')} <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
            {!server && (
              <>
                {/* Chat 08.5 · D: cartão de opção (título + "só neste navegador, sem sincronizar") */}
                <ContinueLocalCard onClick={() => continueAsGuest(name || undefined)} />
                <p className="-mt-1 text-center text-xs text-ink-subtle">{t('workspace.registration.isolatedHint')}</p>
              </>
            )}
            {/* Chat 07: servidor desta instalação (detectado) ou conexão manual; Modo Local só se o servidor permitir */}
            {!server && connection.available ? (
              <button type="button" className="od-btn od-btn-secondary w-full" onClick={() => switchAppMode({ mode: 'server' })}>
                <Server size={16} /> {t('server.connect.useServer', { org: connection.available.info?.organizationName ?? t('server.connect.sameOrigin') })}
              </button>
            ) : (
              <button type="button" className="od-btn od-btn-ghost w-full text-ink-muted" onClick={() => openModal({ type: 'server-settings' })}>
                <Server size={16} />{' '}{server ? (connection.locked ? t('server.connect.useLocalOnlyHere') : t('server.connect.disconnect')) : t('auth.loginView.connectHomelabServer')}</button>
            )}
            {/* Chat 08.5 · D: deixa claro que o Modo Local não sincroniza */}
            {server && connection.locked && <p className="-mt-1 text-center text-xs text-ink-subtle">{t('server.connect.useLocalOnlyHint')}</p>}
            {!server && <InviteCodeEntry />}
          </div>
          </>
          )}
          </>
          )}

          <p className="mt-8 text-center text-xs leading-relaxed text-ink-subtle">
            {server ? t('server.login.serverNotice') : <Trans k="auth.loginView.localModeNotice" components={{ br: () => <br className="hidden sm:block" /> }} />}
          </p>
    </AuthShell>
  );
}
