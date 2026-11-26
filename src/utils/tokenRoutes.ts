/**
 * LuDraw — quem conta como "link com token recebido por e-mail" (Chat 08.5). Módulo PURO (sem DOM),
 * importado pelo cliente (`tokenLink.ts`) e pelo teste do servidor.
 */

/**
 * Telas que recebem token pelo link. Chat 08.5 · B: `join` (link de convite geral — o token vale para várias
 * pessoas, mas também sai do endereço), `signup` (concluir cadastro) e `access` (confirmar pedido de acesso).
 */
export const TOKEN_ROUTES = ['reset', 'verify', 'join', 'signup', 'access'] as const;
export type TokenRoute = (typeof TOKEN_ROUTES)[number];

/** Mesmo formato que o servidor emite (`randomUrlToken`, base64url). */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/**
 * Chat 08.7 · R4 (S-33): convite (`#/invite/<token>`) e link público do board (`#/board/<id>?share=<token>`) também
 * saem do endereço. Os tokens de convite podem ter sido escolhidos pela administração (mínimo de 8 caracteres
 * seguros); o do link público é o que o app gera (`randomToken`).
 */
const INVITE_RE = /^[A-Za-z0-9_-]{8,128}$/;
const SHARE_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** `#/invite/<token>` → token; qualquer outra coisa → null. */
export function splitInviteHash(hash: string): string | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [route, token, ...rest] = path.split('/');
  if (route !== 'invite' || !token || rest.length) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    return null;
  }
  return INVITE_RE.test(decoded) ? decoded : null;
}

/**
 * `#/board/<id>?…share=<token>…` → `{ boardId, token, hash }`, em que `hash` é o mesmo endereço com `shared=1` no lugar
 * do token (os outros parâmetros ficam). Qualquer outra coisa → null.
 */
export function splitShareHash(hash: string): { boardId: string; token: string; hash: string } | null {
  const clean = hash.replace(/^#\/?/, '');
  const q = clean.indexOf('?');
  if (q < 0) return null;
  const parts = clean.slice(0, q).split('/').filter(Boolean);
  if (parts[0] !== 'board' || parts.length !== 2) return null;
  const params = new URLSearchParams(clean.slice(q + 1));
  const token = params.get('share');
  if (!token || !SHARE_RE.test(token)) return null;
  let boardId: string;
  try {
    boardId = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  params.delete('share');
  params.set('shared', '1');
  return { boardId, token, hash: `#/board/${parts[1]}?${params.toString()}` };
}

/** `#/reset/<token>` → `{ route: 'reset', token }`; qualquer outra coisa → null. */
export function splitTokenHash(hash: string): { route: TokenRoute; token: string } | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [route, token, ...rest] = path.split('/');
  if (rest.length || !token || !(TOKEN_ROUTES as readonly string[]).includes(route)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    return null;
  }
  return TOKEN_RE.test(decoded) ? { route: route as TokenRoute, token: decoded } : null;
}
