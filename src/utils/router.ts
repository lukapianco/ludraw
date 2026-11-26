/** LuDraw — roteamento por hash (funciona em file://, Tauri e qualquer subcaminho). */

import type { AdminSection, Route } from '../types/workspace';
import { readInviteToken, readShareToken, rememberInviteToken, rememberShareToken } from './tabTokens';

/** Chat 06: seções de `#/admin/<seção>` (a primeira é a padrão). */
export const ADMIN_SECTIONS: readonly AdminSection[] = ['overview', 'members', 'guests', 'teams', 'policies', 'audit', 'trash', 'transfer', 'backup'];

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query = ''] = clean.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'design-system') return { name: 'design-system' };
  if (parts[0] === 'settings') {
    const tab = parts[1] === 'notifications' || parts[1] === 'users' || parts[1] === 'extensions' ? parts[1] : 'profile';
    const from = params.get('from') ?? undefined;
    return from ? { name: 'settings', tab, from } : { name: 'settings', tab };
  }
  // Chat 06: Administração do Workspace e convites
  if (parts[0] === 'admin') {
    const section = ADMIN_SECTIONS.includes(parts[1] as AdminSection) ? (parts[1] as AdminSection) : 'overview';
    return { name: 'admin', section };
  }
  if (parts[0] === 'invite' && parts[1]) {
    // endereço que não passou pela captura (formato fora do padrão): o token fica na memória, não na URL
    const token = decodeURIComponent(parts[1]);
    rememberInviteToken(token);
    return { name: 'invite', token };
  }
  // Chat 08.7 · R4 (S-33): o token já saiu do endereço (`tokenLink.ts`) e está na memória desta aba
  if (parts[0] === 'invite') return { name: 'invite', token: readInviteToken() ?? '' };
  // Chat 07: primeiro acesso do servidor e volta do SSO
  if (parts[0] === 'setup') return { name: 'setup' };
  if (parts[0] === 'auth' && parts[1] === 'sso') return { name: 'sso', error: params.get('error') ?? undefined };
  // Chat 08.5: telas sem conta ligadas ao e-mail (o token já saiu do endereço — utils/tokenLink.ts)
  if (parts[0] === 'forgot') return { name: 'forgot' };
  if (parts[0] === 'reset') return { name: 'reset' };
  if (parts[0] === 'verify') return { name: 'verify' };
  // Chat 08.5 · B
  if (parts[0] === 'join') return { name: 'join' };
  if (parts[0] === 'signup') return { name: 'signup' };
  if (parts[0] === 'access') return { name: 'access' };
  if (parts[0] === 'request-access') return { name: 'request-access' };
  if (parts[0] === 'register') return { name: 'register' };
  if (parts[0] === 'board' && parts[1]) {
    const direct = params.get('share');
    if (direct) rememberShareToken(decodeURIComponent(parts[1]), direct);
    return {
      name: 'board',
      id: decodeURIComponent(parts[1]),
      focus: params.get('focus') ?? undefined,
      embed: params.get('embed') === '1',
      view: (params.get('view') as 'fit' | 'initial' | 'current' | null) ?? undefined,
      cam: params.get('cam') ?? undefined,
      // Chat 08.7 · R4 (S-33): `?shared=1` = o token do link público está no sessionStorage desta aba
      share: params.get('share') ?? (params.has('shared') ? (readShareToken(decodeURIComponent(parts[1])) ?? undefined) : undefined),
    };
  }
  if (parts[0] === 'trash') return { name: 'dashboard', section: 'trash' };
  if (parts[0] === 'favorites') return { name: 'dashboard', section: 'favorites' };
  if (parts[0] === 'recent') return { name: 'dashboard', section: 'recent' };
  if (parts[0] === 'templates') return { name: 'dashboard', section: 'templates' };
  return { name: 'dashboard', section: 'home' };
}

/** Link absoluto para um hash do app (convites e link público copiáveis). */
export function absoluteHashUrl(hash: string): string {
  // sem tipos de DOM (Chat 08.7 · R4): o roteador também é lido pelos testes do servidor
  const loc = (globalThis as { location?: { origin: string; pathname: string; search: string; href: string } }).location;
  if (!loc) return hash;
  const { origin, pathname, search } = loc;
  const base = origin && origin !== 'null' ? `${origin}${pathname}${search}` : loc.href.split('#')[0];
  return `${base}${hash}`;
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'login':
      return '#/login';
    case 'design-system':
      return '#/design-system';
    case 'settings':
      return `#/settings/${route.tab ?? 'profile'}${route.from ? `?from=${encodeURIComponent(route.from)}` : ''}`;
    case 'board': {
      const params = new URLSearchParams();
      if (route.focus) params.set('focus', route.focus);
      if (route.embed) params.set('embed', '1');
      if (route.view) params.set('view', route.view);
      if (route.cam) params.set('cam', route.cam);
      // o token nunca volta para o endereço (S-33): só o marcador; o token fica no sessionStorage desta aba
      if (route.share) params.set('shared', '1');
      const q = params.toString();
      return `#/board/${encodeURIComponent(route.id)}${q ? `?${q}` : ''}`;
    }
    case 'admin':
      return `#/admin/${route.section ?? 'overview'}`;
    case 'setup':
      return '#/setup';
    case 'sso':
      return route.error ? '#/auth/sso?error=' + encodeURIComponent(route.error) : '#/auth/sso';
    case 'invite':
      return '#/invite';
    case 'forgot':
      return '#/forgot';
    case 'reset':
      return '#/reset';
    case 'verify':
      return '#/verify';
    case 'join':
      return '#/join';
    case 'signup':
      return '#/signup';
    case 'access':
      return '#/access';
    case 'request-access':
      return '#/request-access';
    case 'register':
      return '#/register';
    case 'dashboard':
      if (route.section === 'trash') return '#/trash';
      if (route.section === 'favorites') return '#/favorites';
      if (route.section === 'recent') return '#/recent';
      if (route.section === 'templates') return '#/templates';
      return '#/';
    default:
      return '#/';
  }
}
