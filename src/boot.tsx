import { StrictMode } from 'react';
import { watchLogoutFromOtherTabs } from './utils/serverSync';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ensureCoreContributions } from './extensions/core';
import { applyLocalePreference } from './i18n';
import { I18nProvider } from './i18n/I18nProvider';
import { useAppStore } from './store/useAppStore';
import { safeModeFromUrl, useExtensionsStore } from './store/useExtensionsStore';
import { installExtensionTheme } from './extensions/contributions/themeStyle';
import { boardRepository } from './utils/boardRepository';
import { installSafetySnapshots } from './utils/versionHistory';
import { t } from './i18n';
import { isServerMode } from './utils/serverConfig';
import { startServerMode } from './utils/serverSync';
// Chat 05.5: fontes autohospedadas (Fontsource, só latin + latin-ext) — antes do CSS do app
import './styles/fonts.css';
import './index.css';

/**
 * LuDraw — inicialização do app (Chat 07 · B: carregado pelo main.tsx DEPOIS de decidir o modo).
 */
export function startApp(): void {
// Chat 05.6: idioma antes do primeiro render (preferência salva → navegador → pt-BR; `?lang=` para testes)
applyLocalePreference(useAppStore.getState().preferences.locale);

// Chat 06.5: avisos do armazenamento (atualização do banco bloqueada/feita por outra aba, sem IndexedDB)
const reloadAction = () => ({ label: t('history.storage.reload'), run: () => window.location.reload() });
boardRepository.onStorageEvent((event) => {
  const toast = useAppStore.getState().toast;
  if (event === 'blocked') toast(t('history.storage.blocked'), 'neutral', { detail: t('history.storage.blockedDetail'), durationMs: 15000 });
  else if (event === 'versionchange') toast(t('history.storage.versionChanged'), 'neutral', { action: reloadAction(), durationMs: 30000 });
  else if (event === 'outdated') toast(t('history.storage.outdated'), 'danger', { action: reloadAction(), durationMs: 30000 });
  else toast(t('history.storage.fallback'), 'neutral', { detail: t('history.storage.fallbackDetail'), durationMs: 12000 });
});

// Chat 05: importadores, exportadores, formas e templates do núcleo entram pelos registries
ensureCoreContributions();

// Chat 08.7 · R4 (S-29): outra aba saiu deste servidor → esta também sai (e solta os bancos para a limpeza)
watchLogoutFromOtherTabs();

// Chat 06 · B: abre o IndexedDB e migra os boards do localStorage (uma vez, sem perder nada)
// Chat 06.5: depois, carrega as extensões (conferindo os hashes) — `#/?safe=1` liga o Modo Seguro
const safeUrl = safeModeFromUrl();
void boardRepository.init().then(() => {
  const report = boardRepository.migration;
  if (report && report.migrated > 0) useAppStore.getState().toast(t('history.storage.migrated', { count: report.migrated }), 'success', { durationMs: 8000 });
  if (report && report.failed > 0) useAppStore.getState().toast(t('history.storage.migrationFailed', { count: report.failed }), 'danger', { durationMs: 10000 });
  void useExtensionsStore
    .getState()
    .hydrate({ safeUrl })
    .then(() => {
      if (safeUrl) useAppStore.getState().toast(t('extensions.toast.safeModeUrl'), 'neutral', { durationMs: 8000 });
    });
});

// Chat 06.5: tema de extensão escolhido (só tokens da allowlist; Modo Seguro remove)
installExtensionTheme();

// Chat 06 · B: snapshot de segurança antes de exclusões em massa
installSafetySnapshots();

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado em index.html');

// Chat 07: Modo Servidor — confere o servidor, renova a sessão e traz o estado da organização
if (isServerMode()) void startServerMode();

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
}
