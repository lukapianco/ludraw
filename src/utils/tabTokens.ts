/**
 * LuDraw — tokens guardados por ABA (Chat 08.7 · R4 · achado S-33). Sem tipos de DOM: o roteador (`router.ts`) é
 * importado também pelos testes do servidor, então a leitura do `sessionStorage` passa por aqui, conferindo se ele
 * existe. A captura (que mexe no endereço) fica em `tokenLink.ts`.
 *
 *  - convite: memória + `sessionStorage['ludraw:invite']` (recarregar a tela do convite continua funcionando);
 *  - link público do board: `sessionStorage['ludraw:share:<board>']` (o visitante pode recarregar; aba nova não herda).
 * Nunca `localStorage`. "Sair" e entrar com conta limpam.
 */

interface TabStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SHARE_TOKEN_PREFIX = 'ludraw:share:';
const INVITE_KEY = 'ludraw:invite';
let inviteToken: string | null = null;

function tab(): TabStorage | null {
  try {
    return (globalThis as { sessionStorage?: TabStorage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    const s = tab();
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* sem sessionStorage: fica só na memória */
  }
}

function get(key: string): string | null {
  try {
    return tab()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Token do convite aberto nesta aba (ou digitado na tela de convite). */
export function readInviteToken(): string | null {
  return inviteToken ?? get(INVITE_KEY);
}

/** Guarda o token do convite nesta aba (o endereço fica `#/invite`). */
export function rememberInviteToken(token: string): void {
  inviteToken = token;
  set(INVITE_KEY, token);
}

/** Entrou com conta (convite aceito ou login): o token do convite desta aba não serve mais. */
export function clearInviteToken(): void {
  inviteToken = null;
  set(INVITE_KEY, null);
}

/** Guarda o token do link público deste board nesta aba. */
export function rememberShareToken(boardId: string, token: string): void {
  set(SHARE_TOKEN_PREFIX + boardId, token);
}

/** Token do link público deste board guardado nesta aba. */
export function readShareToken(boardId: string): string | null {
  return get(SHARE_TOKEN_PREFIX + boardId);
}

/** Sair: esquece os tokens de link público e o de convite desta aba. */
export function clearShareTokens(): void {
  try {
    const s = tab();
    if (s) {
      const names: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(SHARE_TOKEN_PREFIX)) names.push(k);
      }
      names.forEach((k) => s.removeItem(k));
    }
  } catch {
    /* sem sessionStorage */
  }
  clearInviteToken();
}
