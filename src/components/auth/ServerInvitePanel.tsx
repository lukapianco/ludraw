import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Ban, LoaderCircle, Lock, Mail, MailOpen, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api, errorText } from '../../utils/api';
import type { InvitationPreview } from '../../utils/apiContract';
import { checkPasswordStrength } from '../../utils/passwordPolicy';
import { roleLabel } from '../../utils/workspaceDisplay';
import { formatDateTime } from '../../i18n/format';
import { translateMessage } from '../../i18n';
import { useT } from '../../i18n/useT';
import { PasswordInput } from '../ui/PasswordInput';

/**
 * Chat 07 · B — aceitar convite no Modo Servidor (`#/invite/<token>`). A prévia vem do servidor (quem abre o
 * link ainda não tem acesso aos convites da organização). O aceite cria a conta (ou entra com a que já existe
 * com aquele e-mail) e já faz o login; o servidor confere e-mail, domínio, validade e a força da senha.
 */
export function ServerInvitePanel({ token }: { token: string }) {
  const t = useT();
  const user = useAppStore((s) => s.user);
  const navigate = useAppStore((s) => s.navigate);
  const acceptInvitation = useAppStore((s) => s.acceptInvitation);
  const logout = useAppStore((s) => s.logout);
  const toast = useAppStore((s) => s.toast);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      ?.invitationPreview(token)
      .then((p) => alive && setPreview(p))
      .catch((e: unknown) => alive && setLoadError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [token]);

  if (loadError || (preview && preview.status !== 'pending')) {
    const text = preview?.status === 'expired' ? t('workspace.errors.inviteExpired') : preview?.status === 'revoked' ? t('workspace.errors.inviteRevoked') : preview?.status === 'accepted' ? t('workspace.errors.inviteAccepted') : (loadError ?? t('workspace.errors.inviteNotFound'));
    return (
      <div className="rounded-2xl bg-panel p-5 ring-1 ring-line">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger"><Ban size={18} /></span>
          <h1 className="text-lg font-bold text-ink">{t('workspace.inviteAccept.unavailable')}</h1>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{text}</p>
        <button type="button" className="od-btn od-btn-secondary mt-4" onClick={() => navigate({ name: 'login' })}>{t('workspace.inviteAccept.goToLogin')}</button>
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="flex justify-center py-10 text-ink-subtle" role="status" aria-label={t('server.client.loading')}>
        <LoaderCircle className="animate-spin" />
      </div>
    );
  }

  const existing = preview.accountExists;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!existing) {
      if (name.trim().length < 2) return setError(t('server.errors.nameRequired'));
      const weak = checkPasswordStrength(password, { email: preview.email, name });
      if (weak) return setError(translateMessage(weak));
    } else if (!password) return setError(t('auth.loginView.thePasswordMustBeLeast'));
    setBusy(true);
    const r = await acceptInvitation(token, { name, email: preview.email, password });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(t('workspace.inviteAccept.welcome', { org: preview.organizationName }), 'success');
    navigate({ name: 'dashboard', section: 'home' });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent-soft p-4 ring-1 ring-line">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-800 dark:text-brand-200">
          <MailOpen size={14} /> {t('workspace.inviteAccept.badge')}
        </div>
        <h1 className="mt-1.5 text-lg font-bold text-ink">{t('workspace.inviteAccept.title', { org: preview.organizationName })}</h1>
        <dl className="mt-2 grid gap-1 text-[13px] text-ink-muted">
          <div><dt className="inline font-semibold text-ink">{t('workspace.inviteAccept.role')}</dt> <dd className="inline">{roleLabel(preview.role)}</dd></div>
          <div><dt className="inline font-semibold text-ink">{t('workspace.inviteAccept.expires')}</dt> <dd className="inline">{formatDateTime(preview.expiresAt)}</dd></div>
        </dl>
      </div>

      {user ? (
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm text-ink">{t('workspace.inviteAccept.signedInAs', { name: user.name })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="od-btn od-btn-primary" onClick={() => logout({ keepRoute: true })}>{t('workspace.inviteAccept.signOutAndAccept')}</button>
            <button type="button" className="od-btn od-btn-ghost" onClick={() => navigate({ name: 'dashboard' })}>{t('share.gate.backHome')}</button>
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit} noValidate>
          <p className="text-sm text-ink-muted">{existing ? t('workspace.inviteAccept.existingAccount') : t('workspace.inviteAccept.newAccount')}</p>
          {!existing && (
            <Row icon={<User size={16} />} label={t('common.name')}>
              <input className="od-input ps-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t('auth.loginView.whatShouldWeCallYou')} />
            </Row>
          )}
          <Row icon={<Mail size={16} />} label={t('common.email')}>
            <input className="od-input ps-10" value={preview.email} readOnly autoComplete="email" />
          </Row>
          <Row icon={<Lock size={16} />} label={t('auth.loginView.password')}>
            <PasswordInput className="od-input ps-10" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={existing ? 'current-password' : 'new-password'} placeholder={existing ? t('auth.loginView.yourPassword') : ''} />
          </Row>
          {!existing && <p className="text-xs text-ink-subtle">{t('server.password.rule')}</p>}
          {error && <div className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">{error}</div>}
          <button type="submit" className="od-btn od-btn-primary od-btn-lg w-full" disabled={busy}>
            {busy && <LoaderCircle size={18} className="animate-spin" />}
            {t('workspace.inviteAccept.accept')}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
      )}
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute start-3.5 top-1/2 z-10 -translate-y-1/2 text-ink-subtle">{icon}</span>
        {children}
      </span>
    </label>
  );
}
