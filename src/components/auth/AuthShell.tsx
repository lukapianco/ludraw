import { Children, cloneElement, createContext, isValidElement, useContext, useId, type ReactNode } from 'react';
import { Laptop, Moon, Palette, Server, Sun, WifiOff } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import { Logo } from '../ui/Logo';
import { useT } from '../../i18n/useT';
import { useDesignSystemEnabled } from '../../hooks/useDesignSystemGate';

/**
 * Casco das telas de entrada (Chat 08.5): painel da marca à esquerda e coluna central com o botão de tema.
 * Saiu do `LoginView` sem mudar um pixel, para as telas sem conta (esqueci a senha, criar nova senha,
 * confirmar e-mail…) terem o mesmo visual da entrada.
 * `embedded` (só o Sistema visual): sem o painel da marca, que depende da largura da JANELA e ficaria
 * espremido dentro de um cartão de exemplo. No app real a prop nunca é passada.
 */
const AuthEmbeddedContext = createContext(false);

export function AuthShell({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const navigate = useAppStore((s) => s.navigate);
  const designSystem = useDesignSystemEnabled();
  // Chat 08.6 · A (D-13): nome acessível = dica visível (a ação que o clique faz)
  const themeLabel = theme === 'dark' ? t('common.lightMode') : t('common.darkMode');
  return (
    <AuthEmbeddedContext.Provider value={embedded}>
    <div className="flex min-h-full bg-[var(--od-app-bg)]">
      {/* Painel da marca */}
      <aside className={embedded ? 'hidden' : 'relative hidden w-[46%] max-w-[680px] flex-col justify-between overflow-hidden bg-brand-900 p-10 text-brand-100 lg:flex'}>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22]"
          style={{ backgroundImage: 'radial-gradient(#D0E4AE 1.1px, transparent 1.2px)', backgroundSize: '24px 24px' }}
        />
        <div className="relative">
          <Logo tone="light" markSize={30} className="[&>span:last-child]:text-[24px]" />
        </div>

        <div className="relative">
          <BrandIllustration />
          {/* Chat 08.6 · A (D-12): slogan do painel da marca não é o título da página — o `h1` é o do formulário */}
          <p className="mt-10 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-brand-50">{t('auth.loginView.theInfiniteBoard')}<br />
            <span className="italic text-brand-200">{t('auth.loginView.openYours')}</span>
          </p>
          <p className="mt-4 max-w-md text-md text-brand-200/85">{t('auth.loginView.brainstormsFlowsPlanningCanvasWithout')}</p>
          <ul className="mt-8 grid max-w-md gap-3">
            <Feature icon={<WifiOff size={17} />} title={t('auth.loginView.localFirst')} text={t('auth.loginView.worksOfflineEverythingStaysYour')} />
            <Feature icon={<Server size={17} />} title={t('auth.loginView.homelab')} text={t('auth.loginView.runYourOwnServerDocker')} />
            <Feature icon={<Laptop size={17} />} title={t('auth.loginView.desktop')} text={t('auth.loginView.nativeAppWindowsLinux')} />
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-brand-200/70">
          <span>{t('auth.loginView.openSourceMitLicense')}</span>
          {designSystem && (
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-white/10 hover:text-brand-100" onClick={() => navigate({ name: 'design-system' })}>
              <Palette size={14} />{' '}{t('common.visualSystem')}</button>
          )}
        </div>
      </aside>

      {/* Formulário */}
      <main className="relative flex flex-1 items-center justify-center px-5 py-12">
        <div className="absolute end-4 top-4 flex items-center gap-1">
          <button type="button" className="od-tool" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="w-full max-w-[400px] animate-slide-up">
          <div className={embedded ? 'mb-8' : 'mb-8 lg:hidden'}>
            <Logo markSize={28} />
          </div>
          {children}
        </div>
      </main>
    </div>
    </AuthEmbeddedContext.Provider>
  );
}

/**
 * Campo da entrada (rótulo, ícone à esquerda, erro). `raiseIcon`: o campo é um `PasswordInput`, cujo
 * contêiner cobriria o ícone — ele sobe com `z-10` (armadilha registrada no HANDOFF desde o Chat 07).
 *
 * Chat 08.6 · A (D-01): o rótulo aponta para o campo por `htmlFor` — antes era um `<label>` envolvendo tudo,
 * e o primeiro controle lá dentro (o `aside`, ex.: "Esqueci minha senha") virava o dono do rótulo: clicar em
 * "Senha" abria a recuperação e o campo ficava sem nome. O PRIMEIRO elemento filho é o campo: recebe o `id`
 * (se não tiver) e o erro por `aria-describedby`.
 */
export function AuthField({ label, error, icon, aside, children, raiseIcon }: { label: string; error?: string; icon: ReactNode; aside?: ReactNode; children: ReactNode; raiseIcon?: boolean }) {
  const autoId = useId();
  const errorId = `${autoId}-error`;
  let fieldId = autoId;
  let first = true;
  const fields = Children.map(children, (child) => {
    if (!first || !isValidElement<{ id?: string; 'aria-describedby'?: string }>(child)) return child;
    first = false;
    fieldId = child.props.id ?? autoId;
    const describedBy = [child.props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
    return cloneElement(child, { id: fieldId, 'aria-describedby': describedBy });
  });
  return (
    <div className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={fieldId} className="text-sm font-semibold text-ink">{label}</label>
        {aside}
      </div>
      <div className="relative block">
        <span className={cn('pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2', raiseIcon && 'z-10', error ? 'text-danger' : 'text-ink-subtle')} aria-hidden="true">{icon}</span>
        {fields}
      </div>
      {error && <span id={errorId} className="mt-1.5 block animate-fade-in text-xs font-medium text-danger">{error}</span>}
    </div>
  );
}

/**
 * Título da tela de entrada (Chat 08.6 · A, D-12): `h1` no app; `h2` quando a tela aparece como exemplo dentro
 * do Sistema visual (`AuthShell embedded`), para a página de exemplos não ter vários `h1`.
 */
export function useAuthHeadingTag(): 'h1' | 'h2' {
  return useContext(AuthEmbeddedContext) ? 'h2' : 'h1';
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200 ring-1 ring-white/10">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-brand-50">{title}</span>
        <span className="block text-sm text-brand-200/75">{text}</span>
      </span>
    </li>
  );
}

/** Ilustração vetorial: mini-board com post-its, seleção e cursor (sem imagens externas). */
function BrandIllustration() {
  const t = useT();
  return (
    <svg viewBox="0 0 460 210" className="w-full max-w-[460px]" aria-hidden="true">
      <g transform="rotate(-4 90 100)">
        <rect x="24" y="40" width="120" height="120" rx="4" fill="#FFF6A5" />
        <rect x="40" y="78" width="84" height="8" rx="4" fill="#1C1C1E" opacity="0.18" />
        <rect x="52" y="96" width="60" height="8" rx="4" fill="#1C1C1E" opacity="0.18" />
      </g>
      <rect x="168" y="28" width="120" height="120" rx="4" fill="#D0E4AE" />
      <rect x="184" y="70" width="88" height="8" rx="4" fill="#194B32" opacity="0.35" />
      <rect x="198" y="88" width="60" height="8" rx="4" fill="#194B32" opacity="0.35" />
      <rect x="164" y="24" width="128" height="128" fill="none" stroke="#B4D38A" strokeWidth="2" />
      {[
        [164, 24],
        [292, 24],
        [292, 152],
        [164, 152],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="#FFFFFF" stroke="#B4D38A" strokeWidth="2" />
      ))}
      <g transform="rotate(5 380 110)">
        <rect x="318" y="58" width="120" height="120" rx="4" fill="#FFD0EC" />
        <rect x="334" y="100" width="88" height="8" rx="4" fill="#1C1C1E" opacity="0.16" />
        <rect x="348" y="118" width="60" height="8" rx="4" fill="#1C1C1E" opacity="0.16" />
      </g>
      <path d="M144 170 C 200 205, 280 205, 330 178" fill="none" stroke="#8FBE72" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
      <path d="M300 150 l0 26 l7 -7 l6 13 l5 -2 l-6 -13 l10 0 z" fill="#F4F9EC" stroke="#0F2E1F" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="318" y="176" width="58" height="20" rx="10" fill="#E0457B" />
      <text x="347" y="190" textAnchor="middle" fontFamily="Figtree, sans-serif" fontSize="11" fontWeight="700" fill="#fff">{t('common.you')}</text>
    </svg>
  );
}
