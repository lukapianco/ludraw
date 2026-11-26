import { useState, type FormEvent } from 'react';
import { rememberInviteToken } from '../../utils/tokenLink';
import { ArrowRight, Ban, LoaderCircle, Lock, Mail, MailOpen, Ticket, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { invitationStatus, inviteTokenFromInput, placeOf } from '../../utils/workspace';
import { displayName, placeLabel, roleLabel } from '../../utils/workspaceDisplay';
import { BOARD_ROLE_LABEL_KEYS } from '../../utils/permissions';
import { formatDateTime } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { PasswordInput } from '../ui/PasswordInput';

/**
 * Chat 06 — aceitar convite no fluxo de Login local (`#/invite/<token>`).
 * Mostra para onde o convite leva (papel, times, projeto/board), quem convidou e o prazo; a pessoa
 * cria a conta local com o e-mail convidado (ou entra com a conta que já existe com esse e-mail).
 */
export function InvitePanel({ token }: { token: string }) {
  const t = useT();
  const s = useAppStore();
  const inv = s.invitations.find((i) => i.token === token);
  const status = inv ? invitationStatus(inv) : 'missing';
  const existing = inv ? s.accounts.some((a) => a.email === inv.email) : false;
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!inv || status !== 'pending') {
    const text = status === 'expired' ? t('workspace.errors.inviteExpired') : status === 'revoked' ? t('workspace.errors.inviteRevoked') : status === 'accepted' ? t('workspace.errors.inviteAccepted') : t('workspace.errors.inviteNotFound');
    return (
      <div className="rounded-2xl bg-panel p-5 ring-1 ring-line">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger"><Ban size={18} /></span>
          <h1 className="text-lg font-bold text-ink">{t('workspace.inviteAccept.unavailable')}</h1>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{text}</p>
        <button type="button" className="od-btn od-btn-secondary mt-4" onClick={() => s.navigate({ name: 'login' })}>{t('workspace.inviteAccept.goToLogin')}</button>
      </div>
    );
  }

  const board = inv.boardId ? s.boards.find((b) => b.id === inv.boardId) : undefined;
  const project = inv.projectId ? s.projects.find((p) => p.id === inv.projectId) : undefined;
  const teamNames = (inv.teamIds ?? []).map((id) => s.teams.find((x) => x.id === id)?.name).filter(Boolean) as string[];
  const destination = board ? t('workspace.inviteAccept.toBoard', { name: board.name, place: placeLabel(placeOf(board), s) }) : project ? t('workspace.inviteAccept.toProject', { name: placeLabel({ kind: 'team', teamId: project.teamId, projectId: project.id }, s) }) : teamNames.length ? t('workspace.inviteAccept.toTeams', { teams: teamNames.join(', ') }) : t('workspace.inviteAccept.toWorkspace');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError(t('auth.loginView.thePasswordMustBeLeast'));
    setBusy(true);
    const r = await s.acceptInvitation(token, { name, email: inv.email, password });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    s.toast(t('workspace.inviteAccept.welcome', { org: s.workspace.name }), 'success');
    s.navigate({ name: 'dashboard', section: 'home' });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent-soft p-4 ring-1 ring-line">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-800 dark:text-brand-200">
          <MailOpen size={14} /> {t('workspace.inviteAccept.badge')}
        </div>
        <h1 className="mt-1.5 text-lg font-bold text-ink">{t('workspace.inviteAccept.title', { org: s.workspace.name })}</h1>
        <dl className="mt-2 grid gap-1 text-[13px] text-ink-muted">
          <div><dt className="inline font-semibold text-ink">{t('workspace.inviteAccept.role')}</dt> <dd className="inline">{roleLabel(inv.role)}{inv.role === 'guest_b2b' && inv.boardRole ? ` · ${t(BOARD_ROLE_LABEL_KEYS[inv.boardRole])}` : ''}</dd></div>
          <div><dt className="inline font-semibold text-ink">{t('workspace.inviteAccept.where')}</dt> <dd className="inline">{destination}</dd></div>
          <div><dt className="inline font-semibold text-ink">{t('workspace.inviteAccept.invitedBy')}</dt> <dd className="inline">{displayName(inv.invitedBy, s.directory)}</dd></div>
          <div><dt className="inline font-semibold text-ink">{t('workspace.inviteAccept.expires')}</dt> <dd className="inline">{formatDateTime(inv.expiresAt)}</dd></div>
        </dl>
      </div>

      {s.user ? (
        <div className="rounded-2xl bg-panel p-4 ring-1 ring-line">
          <p className="text-sm text-ink">{t('workspace.inviteAccept.signedInAs', { name: s.user.name })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="od-btn od-btn-primary" onClick={() => s.logout({ keepRoute: true })}>{t('workspace.inviteAccept.signOutAndAccept')}</button>
            <button type="button" className="od-btn od-btn-ghost" onClick={() => s.navigate({ name: 'dashboard' })}>{t('share.gate.backHome')}</button>
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit} noValidate>
          <p className="text-sm text-ink-muted">{existing ? t('workspace.inviteAccept.existingAccount') : t('workspace.inviteAccept.newAccount')}</p>
          {!existing && (
            <InputRow icon={<User size={16} />} label={t('common.name')}>
              <input className="od-input ps-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t('auth.loginView.whatShouldWeCallYou')} />
            </InputRow>
          )}
          <InputRow icon={<Mail size={16} />} label={t('common.email')}>
            <input className="od-input ps-10" value={inv.email} readOnly autoComplete="email" />
          </InputRow>
          <InputRow icon={<Lock size={16} />} label={t('auth.loginView.password')}>
            <PasswordInput className="od-input ps-10" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={existing ? 'current-password' : 'new-password'} placeholder={existing ? t('auth.loginView.yourPassword') : t('auth.loginView.atLeast6Characters')} />
          </InputRow>
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

function InputRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
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

/** "Tenho um convite": cola o link ou o código e vai para `#/invite/<token>`. */
export function InviteCodeEntry() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  if (!open) {
    return (
      <button type="button" className="od-btn od-btn-secondary w-full" onClick={() => setOpen(true)}>
        <Ticket size={16} /> {t('workspace.inviteAccept.haveInvite')}
      </button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const token = inviteTokenFromInput(code);
        if (!token) return setError(true);
        rememberInviteToken(token);
        navigate({ name: 'invite', token });
      }}
    >
      <input className="od-input h-10 min-w-0 flex-1" value={code} autoFocus onChange={(e) => { setCode(e.target.value); setError(false); }} placeholder={t('workspace.inviteAccept.codePlaceholder')} aria-invalid={error} aria-label={t('workspace.inviteAccept.haveInvite')} />
      <button type="submit" className="od-btn od-btn-secondary h-10 shrink-0">{t('workspace.inviteAccept.continue')}</button>
    </form>
  );
}
