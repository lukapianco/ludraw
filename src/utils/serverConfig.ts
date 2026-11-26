/**
 * LuDraw — Chat 07 · B: Modo Local × Modo Servidor (e a detecção automática do servidor).
 *
 * A decisão acontece UMA vez, no boot, ANTES de qualquer store ser carregado (`main.tsx` espera
 * `resolveStartupConnection()` e só então importa o app): o nome da chave do estado salvo e o banco local
 * dependem do modo. Trocar de modo = gravar a escolha e recarregar — os dados de um modo nunca se misturam
 * com os do outro.
 *
 * Ordem da decisão (`decideConnection`, pura e testada):
 *  1. Servidor configurado para este app (`config.json` em tempo de execução ou `VITE_DEFAULT_SERVER_URL`)
 *     → Modo Servidor TRAVADO nesse endereço (mesmo fora do ar: a tela avisa).
 *  2. Servidor na própria origem (`/api/v1/info` responde em até ~1,5 s) → Modo Servidor TRAVADO
 *     (`url = location.origin`), ignorando a escolha salva.
 *  3. Com servidor encontrado: o Modo Local só vale se o servidor permitir (`localMode: 'allowed'`) e a pessoa
 *     escolheu usá-lo neste navegador — ou com `?local=1` / `LUDRAW_FORCE_LOCAL` (sempre em desenvolvimento;
 *     em produção só se o servidor permitir).
 *  4. Sem servidor detectado: a escolha salva (conectado manualmente a outro endereço) ou o Modo Local.
 */
import { API_PREFIX, API_VERSION, type ServerInfo } from './apiContract';
import { decideConnection, normalizeServerUrl, type AppMode, type ServerConnection, type SavedChoice } from './connectionRules';

export { decideConnection, normalizeServerUrl } from './connectionRules';
export type { AppMode, ConnectionInputs, SavedChoice, ServerConnection } from './connectionRules';

/** `LUDRAW_FORCE_LOCAL` no ambiente do Vite (definido em vite.config.ts; ausente fora do Vite). */
declare const __LUDRAW_FORCE_LOCAL__: boolean | undefined;

const CONFIG_KEY = 'ludraw:server';
/** Estado salvo do Modo Local (o do Modo Servidor fica em `ludraw:app@<servidor>`). */
export const LOCAL_APP_KEY = 'ludraw:app';
const PROBE_TIMEOUT_MS = 1500;

/** `location` da página (ausente fora do navegador — os testes do servidor importam este arquivo). */
const page = (): { origin: string; search: string; hash: string } | null => (globalThis as { location?: { origin: string; search: string; hash: string } }).location ?? null;

function readSaved(): SavedChoice | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONFIG_KEY) : null;
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<{ mode: string; url: string; override: boolean }>;
    if (v.mode === 'server' && typeof v.url === 'string') {
      const url = normalizeServerUrl(v.url);
      return url === null ? null : { mode: 'server', url };
    }
    if (v.mode === 'local' && v.override) return { mode: 'local', override: true };
  } catch {
    /* escolha ilegível = nenhuma */
  }
  return null;
}

function writeSaved(choice: SavedChoice | null): void {
  try {
    if (!choice) localStorage.removeItem(CONFIG_KEY);
    else localStorage.setItem(CONFIG_KEY, JSON.stringify(choice));
  } catch {
    /* sem localStorage: fica no modo atual */
  }
}

/** Configuração em vigor nesta página (preenchida por `resolveStartupConnection`, antes do app carregar). */
export const connection: ServerConnection = (() => {
  const saved = readSaved();
  return saved?.mode === 'server'
    ? { mode: 'server', url: saved.url, locked: false, available: null, localMode: 'allowed', info: null, source: 'saved' }
    : { mode: 'local', url: '', locked: false, available: null, localMode: 'allowed', info: null, source: 'default' };
})();

export function isServerMode(): boolean {
  return connection.mode === 'server';
}

/** A tela pode oferecer o Modo Local (botões "Continuar sem conta" / "Voltar ao modo local")? */
export function localModeAllowed(): boolean {
  return connection.localMode === 'allowed';
}

/** Base da API do servidor (`<url>/api/v1`). */
export function apiBase(url = connection.url): string {
  return `${url}${API_PREFIX}`;
}

/** Pergunta `/info` a um endereço com prazo curto; null = não é (ou não respondeu como) um servidor LuDraw. */
export async function probeInfo(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ServerInfo | null> {
  if (typeof fetch === 'undefined') return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}${API_PREFIX}/info`, { credentials: 'omit', signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const v = (await res.json()) as Partial<ServerInfo>;
    if (v?.name !== 'ludraw' || typeof v.apiVersion !== 'number') return null;
    return { ...(v as ServerInfo), localMode: v.localMode === 'allowed' ? 'allowed' : 'blocked' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** `config.json` publicado junto do app (front separado do backend): `{ "serverUrl": "https://…" }`. */
async function runtimeServerUrl(): Promise<string | null> {
  const fromBuild = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_DEFAULT_SERVER_URL : undefined;
  try {
    const res = await fetch('./config.json', { cache: 'no-store', headers: { accept: 'application/json' } } as RequestInit);
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
      const cfg = (await res.json()) as { serverUrl?: unknown };
      if (typeof cfg.serverUrl === 'string') {
        const url = normalizeServerUrl(cfg.serverUrl);
        if (url) return url;
      }
    }
  } catch {
    /* sem config.json */
  }
  const url = fromBuild ? normalizeServerUrl(fromBuild) : null;
  return url || null;
}

function forceLocalRequested(): boolean {
  const location = page();
  if (!location) return false;
  const fromQuery = (q: string) => new URLSearchParams(q).get('local') === '1';
  const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '';
  const fromEnv = typeof __LUDRAW_FORCE_LOCAL__ !== 'undefined' && __LUDRAW_FORCE_LOCAL__;
  return fromQuery(location.search) || fromQuery(hashQuery) || fromEnv;
}

/**
 * Chat 08.5 · D: a escolha "usar o Modo Local neste navegador" deixa de valer quando o servidor BLOQUEIA o Local
 * (o boot caiu no Modo Servidor por isso). Assim, se o administrador voltar a permitir, ninguém volta ao Local sem
 * escolher de novo. Só com a resposta do servidor em mãos: servidor fora do ar (`info` nulo) não apaga nada.
 */
export function forgetLocalChoice(saved: SavedChoice | null, decided: ServerConnection): boolean {
  return saved?.mode === 'local' && decided.mode === 'server' && decided.info?.localMode === 'blocked';
}

/** Decide o modo desta página (chamado uma vez pelo `main.tsx`, antes de importar o app). */
export async function resolveStartupConnection(): Promise<ServerConnection> {
  const devBuild = !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  const explicitUrl = await runtimeServerUrl();
  const origin = page()?.origin;
  const sameOrigin = origin && origin !== 'null' ? origin : '';
  const [explicitInfo, sameOriginInfo] = await Promise.all([explicitUrl ? probeInfo(explicitUrl) : Promise.resolve(null), !explicitUrl && sameOrigin && /^https?:/.test(sameOrigin) ? probeInfo('') : Promise.resolve(null)]);
  const saved = readSaved();
  const decided = decideConnection({ forceLocal: forceLocalRequested(), devBuild, explicitUrl, explicitInfo, sameOrigin, sameOriginInfo, saved });
  if (forgetLocalChoice(saved, decided)) writeSaved(null);
  Object.assign(connection, decided);
  // compatibilidade: servidor desta origem é chamado pelo caminho relativo (proxy do Vite, mesmo cookie)
  if (decided.source === 'same-origin') connection.url = '';
  return connection;
}

/** Identificador curto e estável do servidor (para separar a cópia de trabalho de cada um). */
export function serverKey(url = connection.url): string {
  const base = url || (page()?.origin ?? 'same-origin');
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) h = Math.imul(h ^ base.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Chave do estado salvo do app (zustand persist) no modo atual. */
export function appStorageKey(): string {
  return isServerMode() ? `${LOCAL_APP_KEY}@${serverKey()}` : LOCAL_APP_KEY;
}

/** Banco local de boards: o de sempre no Modo Local; uma cópia de trabalho por servidor no Modo Servidor. */
export function boardDbName(): string {
  return isServerMode() ? `ludraw-srv-${serverKey()}` : 'ludraw';
}

function reloadHome(): void {
  if (typeof location === 'undefined') return;
  // tira o ?local=1 para a escolha nova valer
  const url = new URL(location.href);
  url.searchParams.delete('local');
  url.hash = '#/';
  // Chat 08.5 · D: com a mesma URL a menos do "#", `location.replace` só troca o fragmento e NÃO recarrega —
  // a escolha ficava gravada sem o modo mudar. Nesse caso: troca o "#" e recarrega de fato.
  const sameDocument = url.origin + url.pathname + url.search === location.origin + location.pathname + location.search;
  if (sameDocument) {
    history.replaceState(history.state, '', url.toString());
    location.reload();
  } else location.replace(url.toString());
}

/**
 * Grava a escolha e recarrega o app no modo novo.
 *  - local: com servidor travado (e que permite), vira "usar o Modo Local neste navegador"; sem servidor, apaga a escolha.
 *  - server: conecta a um endereço (só quando não há servidor travado); com servidor desta instalação, volta a ele.
 */
export function switchMode(next: { mode: AppMode; url?: string }, reload = true): void {
  if (next.mode === 'local') writeSaved(connection.available ? { mode: 'local', override: true } : null);
  else writeSaved(connection.available ? null : { mode: 'server', url: next.url ?? '' });
  if (reload) reloadHome();
}

/**
 * Apaga a cópia de trabalho de um servidor neste navegador (conectar a outro servidor). Chat 08.7 · R4 (S-29): mesma
 * rotina do "Sair" (`serverWipe.ts`): só o que é do servidor, Modo Local intacto, limpeza adiada se outra aba segurar.
 */
export async function clearServerCopy(url = connection.url): Promise<void> {
  const { wipeServerCopy } = await import('./serverWipe');
  await wipeServerCopy(serverKey(url));
}

/** Nome do banco local do CRDT de um board (Modo Servidor; Chat 08). */
export function collabDbName(boardId: string): string {
  return `ludraw-srv-${serverKey()}-y-${boardId}`;
}

/** Versão da API que este app fala (para o aviso de incompatível). */
export const CLIENT_API_VERSION = API_VERSION;
