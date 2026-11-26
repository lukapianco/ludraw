/**
 * LuDraw — Chat 07 · B: regra PURA da escolha do modo no boot (sem DOM). Fica separada de
 * `serverConfig.ts` para os testes do servidor (`server/test/connection.test.ts`) importarem sem navegador.
 * A ordem da decisão está descrita no cabeçalho de `serverConfig.ts`.
 */
import type { ServerInfo } from './apiContract';

export type AppMode = 'local' | 'server';

export interface ServerConnection {
  mode: AppMode;
  /** Endereço do servidor (`https://draw.example.com`); vazio = mesma origem do app. */
  url: string;
  /** Detectado ou configurado para este app: a tela não oferece trocar de servidor. */
  locked: boolean;
  /** Servidor desta instalação (também quando a pessoa está no Modo Local permitido por ele). */
  available: { url: string; info: ServerInfo | null } | null;
  /** O servidor desta instalação deixa usar o Modo Local? (sem servidor = sempre) */
  localMode: 'allowed' | 'blocked';
  /** Resposta de `/info` obtida no boot (null = não respondeu ou Modo Local sem servidor). */
  info: ServerInfo | null;
  source: 'default' | 'saved' | 'config' | 'same-origin' | 'forced-local' | 'local-choice';
}

/** Escolha gravada neste navegador. */
export type SavedChoice = { mode: 'server'; url: string } | { mode: 'local'; override: true };

/** `https://draw.example.com/` → `https://draw.example.com`; vazio = mesma origem; inválido = null. */
export function normalizeServerUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export interface ConnectionInputs {
  /** `?local=1` ou `LUDRAW_FORCE_LOCAL` */
  forceLocal: boolean;
  /** build de desenvolvimento (`npm run dev`) */
  devBuild: boolean;
  /** servidor configurado para este app (config.json / VITE_DEFAULT_SERVER_URL) */
  explicitUrl: string | null;
  explicitInfo: ServerInfo | null;
  /** origem da página e a resposta de `/info` nela */
  sameOrigin: string;
  sameOriginInfo: ServerInfo | null;
  saved: SavedChoice | null;
}

/** Decisão pura do modo no boot (ver o cabeçalho). */
export function decideConnection(i: ConnectionInputs): ServerConnection {
  const found = i.explicitUrl !== null ? { url: i.explicitUrl, info: i.explicitInfo, source: 'config' as const } : i.sameOriginInfo ? { url: i.sameOrigin, info: i.sameOriginInfo, source: 'same-origin' as const } : null;
  if (found) {
    const localMode = found.info?.localMode ?? 'blocked';
    const local = (source: ServerConnection['source']): ServerConnection => ({ mode: 'local', url: '', locked: false, available: { url: found.url, info: found.info }, localMode, info: null, source });
    if (i.forceLocal && (i.devBuild || localMode === 'allowed')) return local('forced-local');
    if (i.saved?.mode === 'local' && localMode === 'allowed') return local('local-choice');
    return { mode: 'server', url: found.url, locked: true, available: { url: found.url, info: found.info }, localMode, info: found.info, source: found.source };
  }
  if (!i.forceLocal && i.saved?.mode === 'server') return { mode: 'server', url: i.saved.url, locked: false, available: null, localMode: 'allowed', info: null, source: 'saved' };
  return { mode: 'local', url: '', locked: false, available: null, localMode: 'allowed', info: null, source: i.forceLocal ? 'forced-local' : 'default' };
}
