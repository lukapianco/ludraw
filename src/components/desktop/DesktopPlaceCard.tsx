/**
 * LuDraw — Chat 09.1 · R7: cartão "Onde você quer trabalhar?" do programa desktop (só apresentação; a lógica fica em
 * `DesktopWelcome`). Usado também no `#/design-system` (frame "Aplicativo desktop").
 *
 * Em que difere do padrão de mercado: nenhuma conta nem nuvem obrigatória — as duas opções ficam lado a lado, e o
 * servidor mostra o que oferece (organização, login da empresa, primeiro acesso) ANTES de a pessoa mudar.
 */
import { ArrowRight, CheckCircle2, CircleAlert, HardDrive, LoaderCircle, PlugZap, Server, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n/useT';
import type { ServerInfo } from '../../utils/apiContract';
import { ssoOriginOf, type ServerProblem } from '../../utils/desktopRules';

export type ServerStep =
  | { step: 'idle' }
  | { step: 'testing' }
  | { step: 'connecting'; host: string }
  | { step: 'ok'; info: ServerInfo }
  | { step: 'problem'; problem: ServerProblem }
  | { step: 'failed'; reason: 'openFailed' | 'saveFailed' };

export interface DesktopPlaceCardProps {
  url: string;
  step: ServerStep;
  onUrl: (url: string) => void;
  onLocal: () => void;
  onTest: () => void;
  onConnect: () => void;
  onCancel: () => void;
  /** Falha ao guardar a escolha do Modo Local. */
  localFailed?: boolean;
  /** O título é `h1` no programa e `h3` nos exemplos do Sistema visual. */
  heading?: 'h1' | 'h3';
}

export function DesktopPlaceCard({ url, step, onUrl, onLocal, onTest, onConnect, onCancel, localFailed, heading: Heading = 'h1' }: DesktopPlaceCardProps) {
  const t = useT();
  const busy = step.step === 'testing' || step.step === 'connecting';
  const plainHttp = /^http:\/\//i.test(url.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(url.trim());
  return (
    <div className="w-full max-w-[920px]">
      <Heading className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{t('desktop.welcome.title')}</Heading>
      <p className="mt-2 text-md text-ink-muted">{t('desktop.welcome.subtitle')}</p>
      <div className="mt-7 grid overflow-hidden rounded-3xl bg-panel shadow-panel ring-1 ring-line md:grid-cols-2">
        {/* Neste computador */}
        <section className="flex min-w-0 flex-col gap-4 break-words p-6 sm:p-7" aria-labelledby="desktop-local-title">
          <ColumnTitle id="desktop-local-title" icon={<HardDrive size={20} />} title={t('desktop.local.title')} />
          <p className="text-sm text-ink-muted">{t('desktop.local.text')}</p>
          <ul className="space-y-2 text-sm text-ink-muted">
            <li>{t('desktop.local.backup')}</li>
            <li>{t('desktop.local.separate')}</li>
          </ul>
          {localFailed && <Problem title={t('desktop.server.saveFailed')} />}
          <button type="button" data-testid="desktop-use-local" className="od-btn od-btn-secondary mt-auto h-auto min-h-10 w-full whitespace-normal py-2" onClick={onLocal} disabled={busy}>
            {t('desktop.local.action')} <ArrowRight size={16} className="rtl:rotate-180" />
          </button>
        </section>

        {/* Servidor da organização */}
        <section className="flex min-w-0 flex-col gap-4 break-words border-t border-line p-6 sm:p-7 md:border-s md:border-t-0" aria-labelledby="desktop-server-title">
          <ColumnTitle id="desktop-server-title" icon={<Server size={20} />} title={t('desktop.server.title')} />
          <p className="text-sm text-ink-muted">{t('desktop.server.text')}</p>
          <form
            className="flex flex-1 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) onConnect();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">{t('desktop.server.urlLabel')}</span>
              <input
                className="od-input"
                data-testid="desktop-server-url"
                value={url}
                onChange={(e) => onUrl(e.target.value)}
                placeholder={t('server.connect.urlPlaceholder')}
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                disabled={busy}
                aria-invalid={step.step === 'problem' && step.problem === 'invalidUrl'}
                aria-describedby="desktop-server-hint"
              />
              <span id="desktop-server-hint" className="mt-1.5 block text-xs text-ink-subtle">{t('desktop.server.urlHint')}</span>
            </label>
            {plainHttp && !busy && (
              <p className="flex items-start gap-2 text-xs text-ink-muted">
                <ShieldAlert size={15} className="mt-0.5 shrink-0" /> {t('desktop.server.plainHttp')}
              </p>
            )}
            <div aria-live="polite" className="space-y-3 empty:hidden" data-testid="desktop-server-status" data-step={step.step} data-problem={step.step === 'problem' ? step.problem : undefined}>
              <StepPanel step={step} />
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              {step.step === 'connecting' ? (
                <button type="button" data-testid="desktop-cancel" className="od-btn od-btn-secondary h-auto min-h-10 flex-1 whitespace-normal py-2" onClick={onCancel}>
                  {t('desktop.server.cancel')}
                </button>
              ) : (
                <>
                  <button type="button" data-testid="desktop-test" className="od-btn od-btn-ghost h-auto min-h-10 whitespace-normal py-2" onClick={onTest} disabled={busy}>
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : <PlugZap size={16} />} {busy ? t('server.connect.testing') : t('server.connect.test')}
                  </button>
                  <button type="submit" data-testid="desktop-connect" className="od-btn od-btn-primary h-auto min-h-10 flex-1 whitespace-normal py-2" disabled={busy}>
                    {step.step === 'problem' || step.step === 'failed' ? t('desktop.server.retry') : t('server.connect.connect')}
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function ColumnTitle({ id, icon, title }: { id: string; icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-brand-800 dark:text-brand-200">{icon}</span>
      <h2 id={id} className="text-lg font-semibold text-ink">{title}</h2>
    </div>
  );
}

function StepPanel({ step }: { step: ServerStep }) {
  const t = useT();
  if (step.step === 'connecting') {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <LoaderCircle size={16} className="shrink-0 animate-spin" /> <span className="min-w-0 break-words">{t('desktop.server.connecting', { host: step.host })}</span>
      </p>
    );
  }
  if (step.step === 'failed') return <Problem title={t(step.reason === 'saveFailed' ? 'desktop.server.saveFailed' : 'desktop.server.openFailed')} />;
  if (step.step === 'problem') {
    switch (step.problem) {
      case 'certificate':
        return (
          <Problem title={t('desktop.problem.certificate.title')}>
            <p>{t('desktop.problem.certificate.text')}</p>
            <p className="font-semibold">{t('desktop.problem.certificate.user')}</p>
            <p>{t('desktop.problem.certificate.admin')}</p>
          </Problem>
        );
      case 'invalidUrl':
        return <Problem title={t('desktop.problem.invalidUrl.title')}><p>{t('desktop.problem.invalidUrl.text')}</p></Problem>;
      case 'unknownHost':
        return <Problem title={t('desktop.problem.unknownHost.title')}><p>{t('desktop.problem.unknownHost.text')}</p></Problem>;
      case 'offline':
        return <Problem title={t('desktop.problem.offline.title')}><p>{t('desktop.problem.offline.text')}</p></Problem>;
      case 'notLuDraw':
        return <Problem title={t('desktop.problem.notLuDraw.title')}><p>{t('desktop.problem.notLuDraw.text')}</p></Problem>;
      case 'incompatible':
        return <Problem title={t('desktop.problem.incompatible.title')}><p>{t('desktop.problem.incompatible.text')}</p></Problem>;
    }
  }
  if (step.step !== 'ok') return null;
  const { info } = step;
  const sso = info.sso.enabled ? ssoOriginOf(info) : null;
  return (
    <div className="space-y-1 rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line">
      <p className="flex items-start gap-2 font-semibold">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300" />
        {info.organizationName ? t('server.connect.ok', { org: info.organizationName, version: info.version }) : t('server.connect.okNoOrg', { version: info.version })}
      </p>
      {info.sso.enabled && <p className="text-ink-muted">{t('server.connect.ssoAvailable', { label: info.sso.label ?? 'SSO' })}</p>}
      {sso && <p className="break-words text-ink-muted">{t('desktop.server.ssoPlace', { host: new URL(sso).host })}</p>}
      {info.setupRequired && <p className="text-ink-muted">{t('server.connect.setupPending')}</p>}
    </div>
  );
}

function Problem({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2 break-words rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line" role="alert">
      <p className="flex items-start gap-2 font-semibold text-danger">
        <CircleAlert size={16} className="mt-0.5 shrink-0" /> <span className="min-w-0 break-words">{title}</span>
      </p>
      {children}
    </div>
  );
}
