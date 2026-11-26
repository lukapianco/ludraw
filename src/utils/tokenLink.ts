/**
 * LuDraw — links com token recebidos por e-mail (Chat 08.5).
 *
 * `#/reset/<token>` e `#/verify/<token>` chegam por e-mail. O token é segredo de uso único, então ao abrir:
 *   1. ele sai do endereço ANTES de qualquer requisição (`history.replaceState` troca por `#/reset`),
 *      e não fica no histórico, nos favoritos nem numa captura de tela;
 *   2. fica só na memória desta aba (`readToken`; sai dela com `clearToken` depois de usado);
 *   3. a página passa a usar `Referrer-Policy: no-referrer` (`<meta name="referrer">`) enquanto estiver
 *      numa dessas telas — nada do endereço vai para outro site.
 * Recarregar a página perde o token de propósito: a tela pede um link novo.
 *
 * A parte pura (`splitTokenHash`) mora em `tokenRoutes.ts` (testada no servidor); esta mexe no `window`.
 */

import { readShareToken, rememberInviteToken, rememberShareToken } from './tabTokens';
import { splitInviteHash, splitShareHash, splitTokenHash, type TokenRoute } from './tokenRoutes';

export { splitInviteHash, splitShareHash, splitTokenHash, TOKEN_ROUTES, type TokenRoute } from './tokenRoutes';
export { clearInviteToken, clearShareTokens, readInviteToken, readShareToken, rememberInviteToken, rememberShareToken, SHARE_TOKEN_PREFIX } from './tabTokens';

const tokens = new Map<TokenRoute, string>();
const REFERRER_META_ID = 'od-token-referrer';

function setNoReferrer(on: boolean): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(REFERRER_META_ID);
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const meta = document.createElement('meta');
  meta.id = REFERRER_META_ID;
  meta.name = 'referrer';
  meta.content = 'no-referrer';
  document.head.appendChild(meta);
}

/**
 * Se o endereço atual traz um token, guarda-o na memória e o tira da URL. Chamado na 1ª linha do
 * `main.tsx` (antes de qualquer requisição) e a cada troca de hash (link colado na mesma aba).
 */
export function captureTokenFromHash(): TokenRoute | null {
  if (typeof window === 'undefined') return null;
  captureInviteAndShare();
  const found = splitTokenHash(window.location.hash);
  if (!found) return null;
  tokens.set(found.route, found.token);
  setNoReferrer(true);
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}#/${found.route}`);
  return found.route;
}

/**
 * Token guardado para a tela. Leitura sem apagar: no desenvolvimento o React (StrictMode) monta a tela duas
 * vezes, e a segunda montagem precisa achar o mesmo token. Quem usa o token chama `clearToken` depois.
 */
export function readToken(route: TokenRoute): string | null {
  return tokens.get(route) ?? null;
}

/** O token foi usado (ou recusado de vez pelo servidor): sai da memória. */
export function clearToken(route: TokenRoute): void {
  tokens.delete(route);
}

/* ------------------- Chat 08.7 · R4 (S-33): convite e link público do board ------------------- */

function replaceHash(hash: string): void {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`);
}

/**
 * Convite: o token vai para a memória e o `sessionStorage` DESTA aba e o endereço vira `#/invite`.
 * Link público do board: o token vai para o `sessionStorage` desta aba e o endereço vira `#/board/<id>?shared=1`.
 * Nunca no `localStorage`, nunca no histórico (`tabTokens.ts`).
 */
function captureInviteAndShare(): void {
  const invite = splitInviteHash(window.location.hash);
  if (invite) {
    rememberInviteToken(invite);
    setNoReferrer(true);
    replaceHash('#/invite');
    return;
  }
  const share = splitShareHash(window.location.hash);
  if (share) {
    rememberShareToken(share.boardId, share.token);
    if (readShareToken(share.boardId) !== share.token) return; // sem sessionStorage: fica no endereço (como antes)
    setNoReferrer(true);
    replaceHash(share.hash);
  }
}

/** A tela de token montou/desmontou: liga ou desliga a política de referência. */
export function tokenScreenActive(active: boolean): void {
  setNoReferrer(active);
}
