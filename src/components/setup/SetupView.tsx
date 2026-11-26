import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, KeyRound, LoaderCircle, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api, errorText } from '../../utils/api';
import { checkPasswordStrength } from '../../utils/passwordPolicy';
import { applyAuth } from '../../utils/serverSync';
import { isValidEmail, normalizeDomain, emailInAllowedDomains } from '../../utils/workspace';
import type { InstallMode } from '../../types/workspace';
import { translateMessage } from '../../i18n';
import { useT } from '../../i18n/useT';
import { cn } from '../../utils/cn';
import { Logo } from '../ui/Logo';
import { SetupCelebration } from './SetupCelebration';
import { PasswordInput } from '../ui/PasswordInput';

type Step = 1 | 2 | 3;

/**
 * Chat 07 · B — primeiro acesso do servidor (`#/setup`, WORKSPACE_ADMIN_SPEC §5). Só aparece quando o
 * servidor responde `setupRequired`; depois de concluído o servidor responde 404 e esta tela some.
 *  1. Organização: token dos logs, nome, domínios permitidos e o modo da instalação (definitivo);
 *  2. Administrador: nome, e-mail (dentro dos domínios) e senha (mesma regra do servidor);
 *  3. Pronto: resumo e próximos passos (criar o primeiro Time, convidar).
 * Diferença do padrão de mercado: o token vem dos logs do próprio servidor e o modo é escolhido no mesmo
 * cartão, com resumo antes de gravar — nada é criado até o último clique.
 */
export function SetupView() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const openModal = useAppStore((s) => s.openModal);
  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState('');
  const [orgName, setOrgName] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [mode, setMode] = useState<InstallMode>('single_org');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdOrg, setCreatedOrg] = useState('');

  /** Sai do passo 3: só agora o app deixa de tratar o servidor como "sem configuração" (senão pularia o resumo). */
  const leave = (then: () => void) => {
    useAppStore.setState((s) => ({ serverInfo: s.serverInfo ? { ...s.serverInfo, setupRequired: false, mode, organizationName: createdOrg } : s.serverInfo }));
    then();
  };

  const rawDomains = domainsText.split(',').map((d) => d.trim()).filter(Boolean);
  const domains = rawDomains.map(normalizeDomain);

  const nextFromOrg = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (orgName.trim().length < 2) return setError(t('server.errors.orgNameRequired'));
    const bad = rawDomains.find((_, i) => !domains[i]);
    if (bad) return setError(t('server.errors.invalidDomain', { domain: bad }));
    if (!token.trim() || !api) return setError(t('server.errors.setupInvalidToken'));
    setBusy(true);
    try {
      await api.setupVerify(token.trim());
      setStep(2);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t('server.errors.nameRequired'));
    if (!isValidEmail(email)) return setError(t('server.errors.invalidEmail'));
    if (domains.length && !emailInAllowedDomains(email, { allowedEmailDomains: domains })) return setError(t('server.errors.emailOutsideDomain', { domains: domains.join(', ') }));
    const weak = checkPasswordStrength(password, { email, name });
    if (weak) return setError(translateMessage(weak));
    if (password !== confirm) return setError(t('server.password.mismatch'));
    if (!api) return;
    setBusy(true);
    try {
      const r = await api.setupComplete({
        token: token.trim(),
        mode,
        organization: { name: orgName.trim(), allowedEmailDomains: domains },
        admin: { name: name.trim(), email: email.trim().toLowerCase(), password },
      });
      setCreatedOrg(orgName.trim());
      await applyAuth(r);
      setStep(3);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--od-app-bg)] px-5 py-12">
      <div className="w-full max-w-[520px] animate-slide-up rounded-2xl bg-panel p-7 shadow-modal">
        <Logo markSize={26} />
        <h1 className="mt-6 text-xl font-bold text-ink">{t('server.setup.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('server.setup.subtitle')}</p>

        <ol className="mt-5 grid grid-cols-3 gap-2" aria-label={t('server.setup.title')}>
          {([1, 2, 3] as const).map((n) => (
            <li
              key={n}
              aria-current={step === n ? 'step' : undefined}
              className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold ring-1', step === n ? 'bg-accent-soft text-ink ring-[var(--od-selection)]' : 'text-ink-muted ring-line')}
            >
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]', step > n ? 'bg-accent text-white' : 'bg-panel-sunken text-ink')}>{step > n ? <Check size={12} /> : n}</span>
              {n === 1 ? t('server.setup.step1') : n === 2 ? t('server.setup.step2') : t('server.setup.step3')}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <form className="mt-6 space-y-4" onSubmit={nextFromOrg} noValidate>
            <Field label={t('server.setup.token')} hint={t('server.setup.tokenHint')} icon={<KeyRound size={16} />}>
              <input className="od-input ps-10 font-mono uppercase placeholder:font-sans placeholder:normal-case" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} placeholder={t('server.setup.tokenPlaceholder')} />
            </Field>
            <Field label={t('server.setup.orgName')} icon={<Building2 size={16} />}>
              <input className="od-input ps-10" value={orgName} onChange={(e) => setOrgName(e.target.value)} autoComplete="organization" placeholder={t('server.setup.orgNamePlaceholder')} />
            </Field>
            <Field label={t('server.setup.domains')} hint={t('server.setup.domainsHint')} icon={<ShieldCheck size={16} />}>
              <input className="od-input ps-10" value={domainsText} onChange={(e) => setDomainsText(e.target.value)} placeholder={t('server.setup.domainsPlaceholder')} />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-ink">{t('server.setup.mode')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['single_org', 'multi_org'] as const).map((m) => (
                  <label key={m} className={cn('cursor-pointer rounded-xl p-3 ring-1 transition-colors', mode === m ? 'bg-accent-soft ring-[var(--od-selection)]' : 'ring-line hover:bg-panel-hover')}>
                    <input type="radio" name="od-setup-mode" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {m === 'single_org' ? <Building2 size={15} /> : <UsersRound size={15} />} {m === 'single_org' ? t('server.setup.modeSingle') : t('server.setup.modeMulti')}
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">{m === 'single_org' ? t('server.setup.modeSingleHint') : t('server.setup.modeMultiHint')}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs font-medium text-ink-muted">{t('server.setup.modeFinal')}</p>
            </fieldset>
            {error && <ErrorBox text={error} />}
            <button type="submit" className="od-btn od-btn-primary w-full" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : null} {t('server.setup.next')} {!busy && <ArrowRight size={16} />}
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="mt-6 space-y-4" onSubmit={finish} noValidate>
            <Field label={t('server.setup.adminName')} icon={<UserRound size={16} />}>
              <input className="od-input ps-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t('server.setup.adminNamePlaceholder')} />
            </Field>
            <Field label={t('server.setup.adminEmail')} icon={<Mail size={16} />}>
              <input className="od-input ps-10" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder={t('server.setup.adminEmailPlaceholder')} />
            </Field>
            <Field label={t('server.setup.adminPassword')} hint={t('server.password.rule')} icon={<KeyRound size={16} />}>
              <PasswordInput className="od-input ps-10" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={t('server.setup.adminPasswordPlaceholder')} />
            </Field>
            <Field label={t('server.setup.adminPasswordConfirm')} icon={<KeyRound size={16} />}>
              <PasswordInput className="od-input ps-10" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder={t('server.setup.adminPasswordConfirmPlaceholder')} />
            </Field>
            <div className="rounded-xl bg-panel-sunken px-3.5 py-3 text-xs text-ink-muted ring-1 ring-line">
              <p className="font-semibold text-ink">{t('server.setup.summary')}</p>
              <p className="mt-1">{t('server.setup.summaryOrg', { name: orgName.trim() })}</p>
              <p>{domains.length ? t('server.setup.summaryDomains', { domains: domains.join(', ') }) : t('server.setup.summaryAnyDomain')}</p>
              <p>{mode === 'single_org' ? t('server.setup.modeSingle') : t('server.setup.modeMulti')}</p>
              {email && <p>{t('server.setup.summaryAdmin', { email: email.trim().toLowerCase() })}</p>}
            </div>
            {error && <ErrorBox text={error} />}
            <div className="flex gap-2">
              <button type="button" className="od-btn od-btn-ghost" onClick={() => setStep(1)} disabled={busy}>
                <ArrowLeft size={16} /> {t('server.setup.back')}
              </button>
              <button type="submit" className="od-btn od-btn-primary flex-1" disabled={busy}>
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} {busy ? t('server.setup.working') : t('server.setup.finish')}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="mt-6">
            <SetupCelebration orgName={createdOrg} adminEmail={email.trim().toLowerCase()} modeLabel={mode === 'single_org' ? t('server.setup.modeSingle') : t('server.setup.modeMulti')} />
            <h2 className="sr-only">{t('server.setup.doneTitle')}</h2>
            <p className="mt-4 text-sm text-ink-muted">{t('server.setup.doneText', { name: createdOrg })}</p>
            <div className="mt-4 grid gap-2">
              <button type="button" className="od-btn od-btn-secondary justify-start" onClick={() => leave(() => navigate({ name: 'admin', section: 'teams' }))}>
                <UsersRound size={16} /> {t('server.setup.doneTeam')}
              </button>
              <button type="button" className="od-btn od-btn-secondary justify-start" onClick={() => leave(() => { navigate({ name: 'dashboard' }); openModal({ type: 'invite' }); })}>
                <ArrowRight size={16} /> {t('server.setup.doneInvite')}
              </button>
              <button type="button" className="od-btn od-btn-primary" onClick={() => leave(() => navigate({ name: 'dashboard' }))}>
                {t('server.setup.enter')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, icon, children }: { label: string; hint?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute start-3.5 top-1/2 z-10 -translate-y-1/2 text-ink-subtle">{icon}</span>
        {children}
      </span>
      {hint && <span className="mt-1.5 block text-xs text-ink-subtle">{hint}</span>}
    </label>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">
      {text}
    </div>
  );
}
