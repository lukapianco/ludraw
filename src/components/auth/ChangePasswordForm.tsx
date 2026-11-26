import { useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, LogOut } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { checkPasswordStrength } from '../../utils/passwordPolicy';
import { changePassword, serverLogout } from '../../utils/serverSync';
import { translateMessage } from '../../i18n';
import { useT } from '../../i18n/useT';
import { Logo } from '../ui/Logo';
import { Modal } from '../ui/Modal';
import { PasswordInput } from '../ui/PasswordInput';

/** Formulário de troca de senha (Modo Servidor). Mesma regra de força do servidor (`passwordPolicy`). */
function PasswordFields({ onDone }: { onDone: () => void }) {
  const t = useT();
  const user = useAppStore((s) => s.user);
  const toast = useAppStore((s) => s.toast);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError(t('server.password.mismatch'));
    const weak = checkPasswordStrength(next, { email: user?.email, name: user?.name });
    if (weak) return setError(translateMessage(weak));
    setBusy(true);
    const r = await changePassword(current, next);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(t('server.password.saved'), 'success');
    onDone();
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <PasswordInput className="od-input" value={value} onChange={(e) => set(e.target.value)} autoComplete={autoComplete} />
    </label>
  );

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      {field(t('server.password.current'), current, setCurrent, 'current-password')}
      {field(t('server.password.new'), next, setNext, 'new-password')}
      {field(t('server.password.confirm'), confirm, setConfirm, 'new-password')}
      <p className="text-xs text-ink-subtle">{t('server.password.rule')}</p>
      {error && <div className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger" role="alert">{error}</div>}
      <button type="submit" className="od-btn od-btn-primary w-full" disabled={busy || !current || !next}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />} {t('server.password.save')}
      </button>
    </form>
  );
}

/**
 * Chat 07 · B — troca de senha OBRIGATÓRIA (conta criada pela CLI, pelas variáveis de bootstrap ou senha
 * redefinida): bloqueia o app (cartão central, sem nenhum dado da organização) até trocar.
 */
export function MustChangePassword() {
  const t = useT();
  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--od-app-bg)] px-5 py-12">
      <div className="w-full max-w-[420px] animate-slide-up rounded-2xl bg-panel p-7 shadow-modal" role="dialog" aria-labelledby="od-must-change-title">
        <Logo markSize={26} />
        <div className="mt-7 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-brand-800 dark:text-brand-200">
          <KeyRound size={22} />
        </span>
          <h1 id="od-must-change-title" className="text-xl font-bold text-ink">{t('server.password.title')}</h1>
        </div>
        <p className="mb-4 mt-1.5 text-sm text-ink-muted">{t('server.password.mustChange')}</p>
        <PasswordFields onDone={() => undefined} />
        <button type="button" className="od-btn od-btn-ghost mt-3 w-full text-ink-muted" onClick={() => void serverLogout()}>
          <LogOut size={16} /> {t('dashboard.appHeader.signOut')}
        </button>
      </div>
    </div>
  );
}

/** Troca de senha a pedido (Configurações → Perfil → Sessão). */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal open onClose={onClose} width={420} icon={<KeyRound size={18} />} title={t('server.password.title')}>
      <PasswordFields onDone={onClose} />
    </Modal>
  );
}
