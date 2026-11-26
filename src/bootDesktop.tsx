import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopWelcome } from './components/desktop/DesktopWelcome';
import { applyLocalePreference } from './i18n';
import { I18nProvider } from './i18n/I18nProvider';
import { useAppStore } from './store/useAppStore';
import './styles/fonts.css';
import './index.css';

/**
 * LuDraw — inicialização do documento `desktop` (Chat 09.1 · R7). Só a tela "onde trabalhar": não abre bancos de
 * boards, extensões nem rotas do app (é a única página com permissão na ponte do programa).
 */
export function startDesktopChooser(): void {
  applyLocalePreference(useAppStore.getState().preferences.locale);
  const container = document.getElementById('root');
  if (!container) return;
  createRoot(container).render(
    <StrictMode>
      <I18nProvider>
        <DesktopWelcome />
      </I18nProvider>
    </StrictMode>,
  );
  document.getElementById('od-boot')?.remove();
  document.documentElement.removeAttribute('data-od-boot');
}
