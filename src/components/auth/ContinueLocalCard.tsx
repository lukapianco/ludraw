/**
 * LuDraw — Chat 08.5 · D: cartão de opção "Continuar sem conta" da entrada do Modo Local. Título + linha
 * "Só neste navegador, sem sincronizar" (o texto não cabe numa linha de botão comum e deixava a coluna mais larga).
 * Usado no `LoginView` e no `#/design-system` (frame "E-mail e acesso").
 *
 * Em que difere do padrão de mercado: em vez de um link discreto "pular", a opção sem conta é um cartão que diz,
 * no próprio botão, onde os dados ficam.
 */
import { ArrowRight, HardDrive } from 'lucide-react';
import { useT } from '../../i18n/useT';

export function ContinueLocalCard({ onClick, demo }: { onClick?: () => void; demo?: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      data-testid={demo ? undefined : 'login-continue-local'}
      className="od-btn od-btn-secondary group h-auto w-full justify-start gap-3 whitespace-normal px-3.5 py-2.5 text-start"
      onClick={demo ? undefined : onClick}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-brand-800 dark:text-brand-200">
        <HardDrive size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight text-ink">{t('auth.loginView.continueWithoutAccount')}</span>
        <span className="mt-1 block text-xs font-medium leading-snug text-ink-muted">{t('auth.loginView.continueThisBrowserOnly')}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-ink-subtle transition-transform duration-base ease-out group-hover:translate-x-0.5 rtl:rotate-180" />
    </button>
  );
}
