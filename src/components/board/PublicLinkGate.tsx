import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Ban, Clock, KeyRound, LinkIcon, LoaderCircle, Lock, ShieldOff } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { PublicLinkStatus } from '../../utils/workspace';
import { Logo } from '../ui/Logo';
import { BoardView } from './BoardView';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';
import { isServerMode } from '../../utils/serverConfig';
import { PasswordInput } from '../ui/PasswordInput';

/**
 * Chat 06 — entrada pelo link público de Visitor (`#/board/:id?share=TOKEN`).
 * Confere o link (ativo, não revogado, dentro do prazo e da política) e pede a senha quando houver;
 * só então abre o board como visitante (`linkSession` → `accessFor`).
 * LOCAL ≠ SEGURO: no modo local o link só funciona neste navegador e a senha só protege de verdade
 * quando houver servidor (Chat 07).
 */
export function PublicLinkGate({ id, token }: { id: string; token: string }) {
  const t = useT();
  const openPublicLink = useAppStore((s) => s.openPublicLink);
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);
  const [status, setStatus] = useState<PublicLinkStatus | 'checking'>('checking');
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Modo Servidor: quem já tem o board na própria lista (dono, membro com acesso) não precisa do link nem da senha
  const ownBoard = useAppStore((s) => isServerMode() && !!s.user && s.boards.some((b) => b.id === id && !b.transient && !b.deletedAt));
  const hasLinkSession = useAppStore((s) => s.linkSession?.boardId === id);

  useEffect(() => {
    if (ownBoard) navigate({ name: 'board', id });
  }, [ownBoard, id, navigate]);

  useEffect(() => {
    if (ownBoard) return;
    let alive = true;
    void openPublicLink(id, token).then((r) => alive && setStatus(r.status));
    return () => {
      alive = false;
    };
  }, [id, token, openPublicLink, ownBoard, attempt]);

  // o acesso de visitante acabou com o board aberto (link revogado, vencido ou trocado): confere de novo e mostra o motivo
  useEffect(() => {
    if (status !== 'ok' || hasLinkSession || ownBoard) return;
    setStatus('checking');
    setPassword('');
    setAttempt((n) => n + 1);
  }, [status, hasLinkSession, ownBoard]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await openPublicLink(id, token, password);
    setBusy(false);
    setWrong(!!r.wrongPassword);
    setStatus(r.status);
  };

  if (status === 'ok' && hasLinkSession && !ownBoard) return <BoardView key={id} id={id} />;

  const copy: Record<Exclude<PublicLinkStatus, 'ok'>, { icon: ReactNode; title: TKey; text: TKey }> = {
    password: { icon: <KeyRound size={22} />, title: 'share.gate.passwordTitle', text: 'share.gate.passwordText' },
    expired: { icon: <Clock size={22} />, title: 'share.gate.expiredTitle', text: 'share.gate.expiredText' },
    revoked: { icon: <Ban size={22} />, title: 'share.gate.revokedTitle', text: 'share.gate.revokedText' },
    disabled: { icon: <LinkIcon size={22} />, title: 'share.gate.disabledTitle', text: 'share.gate.disabledText' },
    policy: { icon: <ShieldOff size={22} />, title: 'share.gate.policyTitle', text: 'share.gate.policyText' },
    invalid: { icon: <Ban size={22} />, title: 'share.gate.invalidTitle', text: 'share.gate.invalidText' },
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--od-app-bg)] px-5 py-12">
      <div className="w-full max-w-[420px] animate-slide-up rounded-2xl bg-panel p-7 shadow-modal">
        <Logo markSize={26} />
        {status === 'checking' || status === 'ok' ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-ink-muted" role="status">
            <LoaderCircle size={18} className="animate-spin" /> {t('share.gate.checking')}
          </div>
        ) : (
          <>
            <div className="mt-7 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-brand-900 dark:text-brand-200">{copy[status].icon}</span>
              <h1 className="text-xl font-bold text-ink">{t(copy[status].title)}</h1>
            </div>
            <p className="mt-1.5 text-sm text-ink-muted">{t(copy[status].text)}</p>
            {status === 'password' && (
              <form className="mt-5 space-y-3" onSubmit={submit}>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">{t('share.gate.passwordLabel')}</span>
                  <span className="relative block">
                    <Lock size={16} className="pointer-events-none absolute start-3.5 top-1/2 z-10 -translate-y-1/2 text-ink-subtle" />
                    <PasswordInput className="od-input ps-10" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} aria-invalid={wrong} autoComplete="off" />
                  </span>
                  {wrong && <span className="mt-1.5 block text-xs font-medium text-danger" role="alert">{t('share.gate.wrongPassword')}</span>}
                </label>
                <button type="submit" className="od-btn od-btn-primary w-full" disabled={busy || !password}>
                  {busy && <LoaderCircle size={16} className="animate-spin" />}
                  {t('share.gate.open')}
                </button>
              </form>
            )}
            <button type="button" className="od-btn od-btn-ghost mt-4 w-full text-ink-muted" onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'login' })}>
              <ArrowLeft size={16} /> {user ? t('share.gate.backHome') : t('share.gate.signIn')}
            </button>
          </>
        )}
        <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-ink-subtle">{isServerMode() ? t('server.client.publicLinkNote') : t('share.gate.localNote')}</p>
      </div>
    </div>
  );
}
