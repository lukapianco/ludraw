/**
 * LuDraw — ponto de entrada (Chat 07 · B).
 *
 * Antes de carregar qualquer store, decide o modo desta página (servidor detectado na própria origem,
 * config.json, escolha salva ou Modo Local — ver utils/serverConfig.ts). Só então importa o app: o nome do
 * estado salvo e o banco local dependem do modo. Enquanto isso, o splash estático do index.html continua.
 */
import { resolveStartupConnection } from './utils/serverConfig';
import { isDesktopChooser } from './utils/desktopRules';
import { captureTokenFromHash } from './utils/tokenLink';

// Chat 08.5: token de link recebido por e-mail sai do endereço ANTES de qualquer requisição
captureTokenFromHash();

if (isDesktopChooser(window.location)) {
  // Chat 09.1 · R7: programa desktop, documento da escolha (Modo Local ou servidor da organização)
  void import('./bootDesktop').then((m) => m.startDesktopChooser());
} else {
  void resolveStartupConnection()
    .catch(() => undefined)
    // Chat 08.7 · R4 (S-29): limpeza de saída que outra aba segurava — ANTES de qualquer banco ou estado abrir
    .then(() => import('./utils/serverWipe').then((m) => m.processPendingWipes()).catch(() => undefined))
    .then(() => import('./boot'))
    .then((m) => m.startApp());
}
