import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  Globe,
  Laptop,
  LogOut,
  Mail,
  Puzzle,
  Save,
  UserRound,
} from 'lucide-react';
import { NOTIFICATION_RULES, useAppStore } from '../../store/useAppStore';
import type { NotificationChannel } from '../../types/workspace';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';
import { Logo } from '../ui/Logo';
import { Switch } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { selectableLocales, t, type TKey } from '../../i18n';
import { detectBrowserLocale } from '../../i18n/detect';
import { useLocale, useT } from '../../i18n/useT';
import { ExtensionsManager } from './ExtensionsManager';
import { HardDriveUpload, KeyRound, Server } from 'lucide-react';
import { connection, isServerMode } from '../../utils/serverConfig';
import { serverLogout } from '../../utils/serverSync';

type Tab = 'profile' | 'notifications' | 'extensions';

const TABS: { id: Tab; label: string; description: string; icon: ReactNode }[] = [
  { id: 'profile', get label() { return t('settings.settingsView.profile'); }, get description() { return t('settings.settingsView.yourPersonalDetails'); }, icon: <UserRound size={18} /> },
  { id: 'notifications', get label() { return t('settings.settingsView.notifications'); }, get description() { return t('settings.settingsView.whatNotifyYouAboutWhere'); }, icon: <Bell size={18} /> },
  // Chat 06.5: extensões instaladas NESTE navegador (pessoal; a política fica em #/admin/policies)
  { id: 'extensions', get label() { return t('settings.settingsView.extensions'); }, get description() { return t('settings.settingsView.extensionsDescription'); }, icon: <Puzzle size={18} /> },
];

const AVATAR_COLORS = ['#194B32', '#3A8156', '#5FA067', '#2C64A8', '#A66A12', '#8C4A7A', '#C2412D', '#0E8A7D'];
/** Valores gravados no perfil (pt-BR, como antes); só o rótulo exibido é traduzido. */
const DEPARTMENTS = ['Engenharia', 'Produto', 'Design', 'Operações', 'Vendas', 'Marketing', 'Financeiro', 'Educação', 'Outro'];
const DEPARTMENT_LABEL_KEYS: Record<string, TKey> = {
  Engenharia: 'settings.departments.engineering',
  Produto: 'settings.departments.product',
  Design: 'settings.departments.design',
  Operações: 'settings.departments.operations',
  Vendas: 'settings.departments.sales',
  Marketing: 'settings.departments.marketing',
  Financeiro: 'settings.departments.finance',
  Educação: 'settings.departments.education',
  Outro: 'settings.departments.other',
};
const departmentLabel = (d: string) => (DEPARTMENT_LABEL_KEYS[d] ? t(DEPARTMENT_LABEL_KEYS[d]) : d);

/** Tela de Configurações PESSOAIS: Perfil, Notificações e Extensões (Chat 06: membros e convites ficam em #/admin). */
export function SettingsView({ tab, from }: { tab: Tab; from?: string }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const user = useAppStore((s) => s.user);

  return (
    <div className="flex h-full flex-col bg-[var(--od-app-bg)]">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-panel px-4 md:px-6">
        {/* Chat 08.2: aberto de dentro de um board (Você → Configurações de perfil), o Voltar leva de volta ao board */}
        <Tooltip label={from ? t('settings.settingsView.backBoard') : t('settings.settingsView.backHome')}>
          <button type="button" className="od-tool" onClick={() => navigate(from ? { name: 'board', id: from } : { name: 'dashboard' })} aria-label={from ? t('settings.settingsView.backBoard') : t('settings.settingsView.back')}>
            <ArrowLeft size={18} />
          </button>
        </Tooltip>
        <Logo markSize={24} />
        <span className="mx-1 h-5 w-px bg-line" />
        <h1 className="text-[15px] font-bold text-ink">{t('common.settings')}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1080px] gap-6 px-4 py-8 md:grid-cols-[240px_minmax(0,1fr)] md:px-8">
          <nav className="md:sticky md:top-8 md:self-start">
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-panel p-3 shadow-panel">
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: user?.color }}>
                {initials(user?.name ?? '?')}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">{user?.name}</div>
                <div className="truncate text-xs text-ink-subtle">{user?.guest ? t('settings.settingsView.offlineMode') : user?.email}</div>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto md:flex-col">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate({ name: 'settings', tab: t.id, from })}
                  className={cn(
                    'flex min-w-[150px] items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors duration-base ease-out md:min-w-0',
                    tab === t.id ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:bg-panel-hover hover:text-ink',
                  )}
                >
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tab === t.id ? 'bg-accent-soft text-brand-900 dark:text-brand-200' : 'bg-panel-sunken')}>{t.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold">{t.label}</span>
                    <span className="block text-xs text-ink-subtle">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <main key={tab} className="min-w-0 animate-slide-up">
            {tab === 'profile' && <ProfileTab />}
            {tab === 'notifications' && <NotificationsTab />}
            {tab === 'extensions' && <ExtensionsManager />}
          </main>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Perfil --------------------------------- */

function ProfileTab() {
  const t = useT();
  const user = useAppStore((s) => s.user);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const logout = useAppStore((s) => s.logout);
  // Chat 07: conexão com o servidor
  const openModal = useAppStore((s) => s.openModal);
  const serverAuth = useAppStore((s) => s.serverAuth);
  const server = isServerMode();
  const toast = useAppStore((s) => s.toast);
  const initial = useMemo(
    () => ({
      name: user?.name ?? '',
      email: user?.email ?? '',
      organization: user?.organization ?? '',
      department: user?.department ?? '',
      jobTitle: user?.jobTitle ?? '',
      language: user?.language ?? 'pt-BR',
      color: user?.color ?? '#194B32',
    }),
    [user],
  );
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (form.name.trim().length < 2) return setError(t('settings.settingsView.enterYourName'));
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError(t('common.enterValidEmailAddress'));
    setError(null);
    updateProfile({ ...form, name: form.name.trim(), email: form.email.trim() });
    toast(t('settings.settingsView.profileUpdated'), 'success');
  };

  return (
    <div className="space-y-6">
      <Section title={t('settings.settingsView.profile')} description={t('settings.settingsView.howCollaboratorsSeeYouBoards')}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white shadow-panel transition-colors duration-slow" style={{ background: form.color }}>
            {initials(form.name || '?')}
          </span>
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">{t('settings.settingsView.avatarColor')}</div>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={cn('h-7 w-7 rounded-full transition-transform duration-base ease-spring hover:scale-110', form.color === c && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]')}
                  style={{ background: c }}
                  aria-label={t('settings.settingsView.colorC', { c })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label={t('common.name')}>
            <input className="od-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('settings.settingsView.yourFullName')} />
          </Field>
          <Field label={t('common.email')} hint={user?.guest ? t('settings.settingsView.optionalOfflineMode') : undefined}>
            <input className="od-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={t('auth.loginView.emailPlaceholder')} />
          </Field>
          <Field label={t('settings.settingsView.organization')}>
            <input className="od-input" value={form.organization} onChange={(e) => set('organization', e.target.value)} placeholder={t('settings.settingsView.eGLargus')} />
          </Field>
          <Field label={t('settings.settingsView.department')}>
            <select className="od-input" value={form.department} onChange={(e) => set('department', e.target.value)}>
              <option value="">{t('settings.settingsView.select')}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {departmentLabel(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('settings.settingsView.role')}>
            <input className="od-input" value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder={t('settings.settingsView.eGProductManager')} />
          </Field>
        </div>
        {error && <div className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</div>}
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-5">
          <button type="button" className="od-btn od-btn-ghost" disabled={!dirty} onClick={() => setForm(initial)}>{t('settings.settingsView.discard')}</button>
          <button type="button" className="od-btn od-btn-primary" disabled={!dirty} onClick={save}>
            <Save size={16} />{' '}{t('settings.settingsView.saveChanges')}</button>
        </div>
      </Section>

      <LanguageSection />

      <Section title={t('settings.settingsView.session')} description={server ? t('server.login.serverNotice') : t('settings.settingsView.yourProfileSavedThisDevice')}>
        {/* Chat 07: modo atual e conexão com o servidor */}
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Server size={15} /> {server ? t('server.connect.modeServer', { url: connection.url || t('server.connect.sameOrigin') }) : t('server.connect.modeLocal')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="od-btn od-btn-secondary" onClick={() => logout()}>
            <LogOut size={16} />{' '}{t('settings.settingsView.signOutAccount')}</button>
          <button type="button" className="od-btn od-btn-ghost" onClick={() => openModal({ type: 'server-settings' })}>
            <Server size={16} /> {t('server.connect.open')}
          </button>
          {server && serverAuth?.authProvider !== 'oidc' && (
            <button type="button" className="od-btn od-btn-ghost" onClick={() => openModal({ type: 'change-password' })}>
              <KeyRound size={16} /> {t('server.password.open')}
            </button>
          )}
          {/* Chat 08.2: boards do Modo Local deste navegador → servidor */}
          {server && (
            <button type="button" data-testid="open-import-local" className="od-btn od-btn-ghost" onClick={() => openModal({ type: 'import-local-boards' })}>
              <HardDriveUpload size={16} /> {t('server.import.open')}
            </button>
          )}
          {server && (
            <button type="button" className="od-btn od-btn-ghost" onClick={() => void serverLogout({ everywhere: true })}>
              <LogOut size={16} /> {t('server.password.logoutAll')}
            </button>
          )}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------ Notificações ------------------------------ */

const CHANNELS: { id: NotificationChannel; label: string; icon: ReactNode }[] = [
  { id: 'email', get label() { return t('common.email'); }, icon: <Mail size={14} /> },
  { id: 'browser', get label() { return t('settings.settingsView.browser'); }, icon: <Globe size={14} /> },
  { id: 'desktop', get label() { return t('settings.settingsView.desktopApp'); }, icon: <Laptop size={14} /> },
];

function NotificationsTab() {
  const t = useT();
  const settings = useAppStore((s) => s.notifications);
  const setRule = useAppStore((s) => s.setNotificationRule);
  const setSettings = useAppStore((s) => s.setNotificationSettings);
  const toast = useAppStore((s) => s.toast);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const askPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      new Notification('LuDraw', { body: t('settings.settingsView.browserNotificationsEnabled') });
      toast(t('settings.settingsView.browserNotificationsEnabled2'), 'success');
    }
  };

  return (
    <div className="space-y-6">
      {permission !== 'granted' && permission !== 'unsupported' && (
        <div className="flex flex-col gap-3 rounded-2xl bg-brand-900 p-5 text-brand-100 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-200">
            <BellRing size={20} />
          </span>
          <div className="flex-1">
            <div className="font-semibold text-brand-50">{t('settings.settingsView.getNotifiedRealTime')}</div>
            <div className="text-sm text-brand-200/80">{t('settings.settingsView.turnBrowserNotificationsHearAbout')}</div>
          </div>
          <button type="button" className="od-btn bg-brand-200 text-brand-900 hover:bg-brand-100" onClick={() => void askPermission()} disabled={permission === 'denied'}>
            {permission === 'denied' ? t('settings.settingsView.blockedBrowser') : t('settings.settingsView.turn')}
          </button>
        </div>
      )}

      <Section
        title={t('settings.settingsView.notificationPreferences')}
        description={t('settings.settingsView.chooseEachSituationWhichChannels')}
        aside={
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink">{t('settings.settingsView.muteEverything')}<button type="button" onClick={() => setSettings({ muteAll: !settings.muteAll })} aria-pressed={settings.muteAll}>
              <Switch checked={settings.muteAll} />
            </button>
          </label>
        }
      >
        <div className="mb-2 flex flex-wrap gap-2 text-xs text-ink-muted">
          {CHANNELS.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-panel-sunken px-2.5 py-1 font-semibold">
              {c.icon} {c.label}
            </span>
          ))}
          <span className="self-center text-ink-subtle">{t('settings.settingsView.theDesktopAppArrivesChat')}</span>
        </div>

        <div className={cn('space-y-6 transition-opacity duration-base', settings.muteAll && 'pointer-events-none opacity-40')}>
          {NOTIFICATION_RULES.map((group) => (
            <div key={group.group}>
              <div className="mb-2 mt-5">
                <div className="text-sm font-bold text-ink">{group.group}</div>
                <div className="text-xs text-ink-subtle">{group.description}</div>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
                {group.items.map((item) => (
                  <div key={item.id}>
                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <span className="flex-1 text-sm text-ink">{item.label}</span>
                      <div className="flex gap-1.5">
                        {CHANNELS.map((c) => {
                          const available = item.channels.includes(c.id);
                          const on = !!settings.rules[item.id]?.[c.id];
                          return (
                            <Tooltip key={c.id} label={available ? `${c.label}: ${on ? 'ligado' : 'desligado'}` : t('settings.settingsView.labelUnavailable', { label: c.label })} side="top">
                              <button
                                type="button"
                                disabled={!available}
                                onClick={() => setRule(item.id, c.id, !on)}
                                aria-pressed={on}
                                aria-label={`${c.label} — ${item.label}`}
                                className={cn(
                                  'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-base ease-out',
                                  !available && 'cursor-not-allowed text-ink-subtle opacity-40 ring-1 ring-line',
                                  available && on && 'bg-brand-900 text-brand-200 dark:bg-brand-200 dark:text-brand-900',
                                  available && !on && 'bg-panel-sunken text-ink-muted ring-1 ring-line hover:text-ink',
                                )}
                              >
                                {available && on ? <Check size={13} strokeWidth={2.6} /> : c.icon}
                                <span className="hidden lg:inline">{c.label}</span>
                              </button>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                    {item.id === 'digest' && settings.rules.digest?.email && (
                      <div className="flex flex-wrap items-end gap-3 bg-panel-sunken px-4 pb-4 pt-1">
                        <label className="text-xs font-semibold text-ink-muted">{t('settings.settingsView.start')}<select className="od-input mt-1 h-9 w-28" value={settings.digestStart} onChange={(e) => setSettings({ digestStart: e.target.value })}>
                            {Array.from({ length: 24 }).map((_, h) => {
                              const v = `${String(h).padStart(2, '0')}:00`;
                              return (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-ink-muted">{t('settings.settingsView.onceEvery')}<select className="od-input mt-1 h-9 w-32" value={settings.digestEvery} onChange={(e) => setSettings({ digestEvery: e.target.value as typeof settings.digestEvery })}>
                            <option value="6h">{t('settings.settingsView.n6Hours')}</option>
                            <option value="12h">{t('settings.settingsView.n12Hours')}</option>
                            <option value="24h">{t('settings.settingsView.n24Hours')}</option>
                          </select>
                        </label>
                        <label className="min-w-[200px] flex-1 text-xs font-semibold text-ink-muted">{t('settings.settingsView.timeZoneDetected')}<input className="od-input mt-1 h-9" value={timezone} disabled />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* --------------------------- Idioma e região (05.6) --------------------------- */

/**
 * Seletor de idioma: aplica na hora (sem recarregar) e guarda em `preferences.locale`.
 * "Seguir o navegador" = preferência ausente. Textos escritos nos boards nunca são traduzidos.
 */
function LanguageSection() {
  const t = useT();
  const locale = useLocale();
  const preference = useAppStore((s) => s.preferences.locale);
  const setPreference = useAppStore((s) => s.setPreference);
  const options = selectableLocales();
  const browser = options.find((o) => o.code === detectBrowserLocale(options.map((o) => o.code)));
  const current = options.find((o) => o.code === locale);
  return (
    <Section title={t('settings.language.title')} description={t('settings.language.description')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.language.label')} hint={current ? t('settings.language.current', { name: current.nativeName }) : undefined}>
          <select
            className="od-input"
            value={preference ?? ''}
            onChange={(e) => setPreference('locale', e.target.value || undefined)}
            data-locale-select
          >
            <option value="">{t('settings.language.followBrowser', { name: browser?.nativeName ?? t('settings.language.defaultName') })}</option>
            {options.map((o) => (
              <option key={o.code} value={o.code} lang={o.code}>
                {o.nativeName}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{t('settings.language.note')}</p>
    </Section>
  );
}

function Section({ title, description, aside, children }: { title: string; description?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-panel p-5 shadow-panel md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="text-xs text-ink-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
