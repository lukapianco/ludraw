import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LoaderCircle, Lock, Mail, Save, Send, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useT } from '../../i18n/useT';
import { cn } from '../../utils/cn';
import { api, errorText } from '../../utils/api';
import { isServerMode } from '../../utils/serverConfig';
import { PANEL_SMTP_PORTS, type MailSecurity, type MailSettingsInput, type MailSettingsView } from '../../utils/apiContract';
import { useWorkspaceCan } from '../../hooks/useWorkspace';
import { PasswordInput } from '../ui/PasswordInput';
import { mailLangNow } from '../auth/EmailAccessViews';
import { AdminSection, Tag, Toggle } from './adminUi';

const fieldLabel = 'mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-muted';
const notice = 'rounded-xl px-3.5 py-2.5 text-[13px] text-ink ring-1 ring-line';

interface Draft {
  enabled: boolean;
  host: string;
  port: number;
  security: MailSecurity;
  user: string;
  from: string;
}

function draftOf(v: MailSettingsView): Draft {
  return {
    enabled: v.enabled,
    host: v.values.host ?? '',
    port: v.values.port ?? 587,
    security: v.values.security ?? 'starttls',
    user: v.values.user ?? '',
    from: v.values.from ?? '',
  };
}

function Field({ label, locked, hint, children }: { label: string; locked: boolean; hint?: string; children: ReactNode }) {
  const t = useT();
  return (
    <label className="block min-w-0">
      <span className={fieldLabel}>
        {label}
        {locked && (
          <Tag>
            <Lock size={10} /> {t('admin.mail.locked')}
          </Tag>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>}
    </label>
  );
}

/**
 * Chat 08.5 · B2 — Administração → Políticas → E-mail. Lê e salva `/admin/mail/settings`; a senha nunca vem
 * do servidor (só "definida"). Campos definidos pelas variáveis aparecem travados com "definido pelo
 * servidor". Em que difere do padrão de mercado: não é uma página de integrações — é um cartão dentro de
 * Políticas, e cada campo diz de onde vem o valor.
 */
export function MailSettingsSection({ demo }: { demo?: MailSettingsView } = {}) {
  const t = useT();
  const toast = useAppStore((s) => s.toast);
  const email = useAppStore((s) => s.user?.email ?? '');
  const manage = useWorkspaceCan('workspace.policies.manage');
  const [view, setView] = useState<MailSettingsView | null>(demo ?? null);
  const [draft, setDraft] = useState<Draft | null>(demo ? draftOf(demo) : null);
  const [password, setPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (demo || !api || !manage.allowed) return;
    let alive = true;
    api
      .mailSettings()
      .then((v) => {
        if (!alive) return;
        setView(v);
        setDraft(draftOf(v));
      })
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [demo, manage.allowed]);

  const dirty = useMemo(() => {
    if (!view || !draft) return false;
    const base = draftOf(view);
    return (Object.keys(base) as (keyof Draft)[]).some((k) => base[k] !== draft[k]) || password.length > 0 || removePassword;
  }, [view, draft, password, removePassword]);

  if (!demo && (!isServerMode() || !manage.allowed)) return null;

  const readOnly = !view || view.serverOnly || view.source === 'outbox' || view.appUrlMissing;
  const locked = view?.locked;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (demo || !api || !view || !draft || !locked) return;
    const input: MailSettingsInput = {
      enabled: draft.enabled,
      host: locked.host ? null : draft.host.trim() || null,
      port: locked.port ? null : draft.port,
      security: locked.security ? null : draft.security,
      user: locked.user ? null : draft.user.trim() || null,
      from: locked.from ? null : draft.from.trim() || null,
    };
    if (!locked.password) {
      if (removePassword) input.password = null;
      else if (password) input.password = password;
    }
    setSaving(true);
    try {
      const next = await api.saveMailSettings(input);
      setView(next);
      setDraft(draftOf(next));
      setPassword('');
      setRemovePassword(false);
      // a tela de entrada, a faixa de verificação e os convites acompanham sem recarregar
      useAppStore.setState((s) => ({ serverInfo: s.serverInfo ? { ...s.serverInfo, email: next.active } : s.serverInfo }));
      toast(t('admin.mail.saved'), 'success');
    } catch (err) {
      toast(errorText(err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (demo || !api) return;
    setTesting(true);
    try {
      await api.sendTestMail(mailLangNow());
      toast(t('admin.policies.mailTestSent', { email }), 'success');
    } catch (err) {
      toast(errorText(err), 'danger');
    } finally {
      setTesting(false);
    }
  };

  const sourceLabel = view
    ? { none: t('admin.mail.sourceNone'), env: t('admin.mail.sourceEnv'), outbox: t('admin.mail.sourceOutbox'), panel: t('admin.mail.sourcePanel'), mixed: t('admin.mail.sourceMixed') }[view.source]
    : '';
  const problemText =
    view?.problem === 'missingHost'
      ? t('admin.mail.problemMissingHost')
      : view?.problem === 'missingFrom'
        ? t('admin.mail.problemMissingFrom')
        : view?.problem === 'missingPassword'
          ? t('admin.mail.problemMissingPassword')
          : null;

  return (
    <AdminSection
      title={t('admin.mail.title')}
      description={t('admin.mail.description')}
      aside={
        view && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="mail-settings-status">
            <Tag tone={view.active ? 'brand' : 'neutral'}>
              <Mail size={11} /> {view.active ? t('admin.mail.on') : t('admin.mail.off')}
            </Tag>
            <Tag>{sourceLabel}</Tag>
          </div>
        )
      }
    >
      {loadError && <p className={cn(notice, 'bg-danger-soft')} role="alert">{loadError || t('admin.mail.loadFailed')}</p>}
      {!view && !loadError && (
        <div className="flex items-center gap-2 py-3 text-sm text-ink-muted">
          <LoaderCircle size={16} className="animate-spin" />
        </div>
      )}
      {view && draft && locked && (
        <div className="space-y-4" data-testid="mail-settings">
          <p className="text-xs text-ink-muted" data-testid="mail-state">{view.active ? t('admin.mail.statusOn') : t('admin.mail.statusOff')}</p>
          {view.source === 'outbox' && <p className={cn(notice, 'bg-panel-sunken')}>{t('admin.mail.outbox')}</p>}
          {view.source !== 'outbox' && view.appUrlMissing && <p className={cn(notice, 'bg-warning-soft')} role="note">{t('admin.mail.appUrlMissing')}</p>}

          {view.source !== 'outbox' && (
            <>
              <div className="divide-y divide-[var(--od-border)]">
                <Toggle
                  checked={draft.enabled}
                  onChange={(v) => set('enabled', v)}
                  label={t('admin.mail.enabled')}
                  hint={view.enabledLocked ? t('admin.mail.enabledLockedHint') : undefined}
                  disabled={readOnly || view.enabledLocked}
                />
              </div>
              <fieldset disabled={readOnly} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                  <Field label={t('admin.mail.host')} locked={locked.host}>
                    <input className="od-input h-9 text-[13px]" value={draft.host} readOnly={locked.host} onChange={(e) => set('host', e.target.value)} placeholder={t('admin.mail.hostPlaceholder')} autoComplete="off" spellCheck={false} data-testid="mail-host" />
                  </Field>
                  <Field label={t('admin.mail.port')} locked={locked.port} hint={locked.port ? undefined : t('admin.mail.portsHint')}>
                    {locked.port ? (
                      <input className="od-input h-9 text-[13px] tabular-nums" value={String(draft.port)} readOnly />
                    ) : (
                      <select className="od-input h-9 text-[13px] tabular-nums" value={draft.port} onChange={(e) => {
                          // 465 = TLS desde a conexão; as outras portas usam STARTTLS (combinação errada nunca conecta)
                          const port = Number(e.target.value);
                          setDraft((d) => (d ? { ...d, port, security: locked.security ? d.security : port === 465 ? 'tls' : 'starttls' } : d));
                        }} data-testid="mail-port">
                        {PANEL_SMTP_PORTS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
                <div>
                  <span className={fieldLabel}>
                    {t('admin.mail.security')}
                    {locked.security && (
                      <Tag>
                        <Lock size={10} /> {t('admin.mail.locked')}
                      </Tag>
                    )}
                  </span>
                  <div className="flex gap-1 rounded-lg bg-panel-sunken p-1 ring-1 ring-line sm:max-w-sm" role="radiogroup" aria-label={t('admin.mail.security')}>
                    {(['starttls', 'tls'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={draft.security === k}
                        disabled={readOnly || locked.security}
                        onClick={() => setDraft((d) => (d ? { ...d, security: k, port: locked.port ? d.port : k === 'tls' ? 465 : d.port === 465 ? 587 : d.port } : d))}
                        className={cn('flex-1 rounded-md py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed', draft.security === k ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted')}
                      >
                        {k === 'tls' ? t('admin.mail.securityTls') : t('admin.mail.securityStarttls')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('admin.mail.user')} locked={locked.user}>
                    <input className="od-input h-9 text-[13px]" value={draft.user} readOnly={locked.user} onChange={(e) => set('user', e.target.value)} autoComplete="off" spellCheck={false} data-testid="mail-user" />
                  </Field>
                  <Field label={t('admin.mail.password')} locked={locked.password}>
                    {locked.password ? (
                      <input className="od-input h-9 text-[13px]" value="" placeholder={t('admin.mail.passwordSetPlaceholder')} readOnly />
                    ) : (
                      <PasswordInput
                        className="od-input h-9 text-[13px]"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (e.target.value) setRemovePassword(false);
                        }}
                        disabled={readOnly || !view.canStorePassword}
                        placeholder={view.passwordSet && !removePassword ? t('admin.mail.passwordSetPlaceholder') : t('admin.mail.passwordEmptyPlaceholder')}
                        autoComplete="new-password"
                        data-testid="mail-password"
                      />
                    )}
                  </Field>
                </div>
                {!locked.password && view.passwordSet && !password && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    {removePassword ? (
                      <>
                        <span>{t('admin.mail.passwordWillRemove')}</span>
                        <button type="button" className="font-semibold text-ink underline underline-offset-2" onClick={() => setRemovePassword(false)}>{t('admin.mail.passwordUndo')}</button>
                      </>
                    ) : (
                      <button type="button" className="font-semibold text-danger hover:underline" onClick={() => setRemovePassword(true)} data-testid="mail-password-remove">{t('admin.mail.passwordRemove')}</button>
                    )}
                  </div>
                )}
                <Field label={t('admin.mail.from')} locked={locked.from}>
                  <input className="od-input h-9 text-[13px]" value={draft.from} readOnly={locked.from} onChange={(e) => set('from', e.target.value)} placeholder={t('admin.mail.fromPlaceholder')} autoComplete="off" spellCheck={false} data-testid="mail-from" />
                </Field>
              </fieldset>

              {!readOnly && !locked.password && !view.canStorePassword && <p className={cn(notice, 'bg-panel-sunken')} data-testid="mail-no-key">{t('admin.mail.noKey')}</p>}
              {view.passwordUnreadable && (
                <p className={cn(notice, 'flex items-start gap-2 bg-warning-soft')} role="note">
                  <ShieldAlert size={15} className="mt-0.5 shrink-0" /> {t('admin.mail.keyChanged')}
                </p>
              )}
              {view.allowPrivateHost && <p className="text-xs text-ink-subtle">{t('admin.mail.privateAllowed')}</p>}
              {view.enabled && problemText && <p className="text-xs font-semibold text-ink-muted">{problemText}</p>}
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            {view.active && (
              <button type="button" className="od-btn od-btn-secondary od-btn-sm h-8" onClick={() => void test()} disabled={testing} data-testid="mail-test">
                {testing ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} {t('admin.policies.mailTest')}
              </button>
            )}
            {!readOnly && view.source !== 'outbox' && (
              <button type="button" className="od-btn od-btn-primary od-btn-sm h-8" onClick={() => void save()} disabled={!dirty || saving} data-testid="mail-save">
                {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />} {t('admin.mail.save')}
              </button>
            )}
          </div>
        </div>
      )}
    </AdminSection>
  );
}
