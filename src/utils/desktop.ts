/**
 * LuDraw — ponte com o programa desktop (Chat 09.1 · R7). Único arquivo que chama o Tauri, e só a partir do documento
 * `desktop`: em qualquer outra página o programa recusa (permissão por janela em `src-tauri/capabilities/chooser.json`
 * e conferência de novo no comando). Sem `@tauri-apps/api`: são quatro chamadas, com a versão do Tauri fixada.
 */
import { isDesktopApp, type PortState } from './desktopRules';

export type DesktopPlace = { mode: 'local' } | { mode: 'server'; url: string };

export interface DesktopState {
  version: string;
  place: DesktopPlace | null;
  /** abertura do programa: com servidor lembrado, segue sozinho depois de testar */
  auto: boolean;
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = (window as unknown as { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__;
  if (!bridge) return Promise.reject(new Error('no desktop bridge'));
  return bridge.invoke<T>(command, args);
}

export const desktopBridge = {
  state: () => invoke<DesktopState>('desktop_state'),
  useLocal: (lang: string) => invoke<void>('desktop_use_local', { lang }),
  useServer: (url: string, sso: string | null, lang: string) => invoke<void>('desktop_use_server', { url, sso, lang }),
  probePort: (url: string) => invoke<PortState>('desktop_probe_port', { url }),
};

/** Esta página é o app embutido no programa desktop? */
export function inDesktopApp(): boolean {
  return typeof window !== 'undefined' && isDesktopApp(window.location);
}

/**
 * Pede a tela de escolha. A página não usa a ponte: só tenta navegar para o documento `desktop`; o programa
 * intercepta, abre a janela de escolha e fecha esta depois de o board gravar.
 */
export function openDesktopChooser(): void {
  window.location.href = './desktop';
}
