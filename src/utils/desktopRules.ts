/**
 * LuDraw — aplicativo desktop: regras PURAS (Chat 09.1 · R7; sem DOM, o servidor e os testes também importam).
 *
 * Origens locais do programa (permanentes: definem onde ficam os boards do Modo Local no computador):
 *   Windows `http://tauri.localhost` · Linux `tauri://localhost` (src-tauri/src/nav.rs).
 */
import type { ServerInfo } from './apiContract';

/** Origens do programa desktop (o servidor responde o `GET /info` a elas, sem credenciais). */
export const DESKTOP_ORIGINS: readonly string[] = ['http://tauri.localhost', 'tauri://localhost'];

/** Caminho do documento da escolha (o único que fala com a ponte do Tauri). */
export const DESKTOP_CHOOSER_PATH = '/desktop';

export interface PageLocation {
  origin: string;
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
}

/** A página é do app embutido no programa desktop (e não a servida por um servidor dentro dele)? */
export function isDesktopApp(page: PageLocation | null | undefined): boolean {
  if (!page || page.port) return false;
  return (page.protocol === 'http:' && page.hostname === 'tauri.localhost') || (page.protocol === 'tauri:' && page.hostname === 'localhost');
}

/** A página é o documento da escolha? */
export function isDesktopChooser(page: PageLocation | null | undefined): boolean {
  return isDesktopApp(page) && page!.pathname === DESKTOP_CHOOSER_PATH;
}

/** Resultado do teste de porta da ponte (`desktop_probe_port`). */
export type PortState = 'open' | 'closed' | 'unknown-host';

/** Por que o servidor não abriu — cada um tem a própria explicação na tela (`desktop.problem.*`). */
export type ServerProblem = 'invalidUrl' | 'unknownHost' | 'offline' | 'certificate' | 'notLuDraw' | 'incompatible';

export interface ProbeFacts {
  /** endereço válido (`http(s)`)? */
  validUrl: boolean;
  https: boolean;
  /** `/info` respondeu como servidor LuDraw */
  info: Pick<ServerInfo, 'apiVersion'> | null;
  /** uma requisição simples (sem ler a resposta) chegou ao endereço — o certificado foi aceito */
  reachable: boolean;
  /** só quando `reachable` é falso */
  port: PortState | null;
  clientApiVersion: number;
}

/**
 * Explica a falha. O navegador não diz por que recusou um `https`; a diferença vem de dois fatos: se a requisição
 * simples chega (não é certificado) e se a porta responde (não é servidor fora do ar).
 */
export function diagnoseServer(f: ProbeFacts): ServerProblem | null {
  if (!f.validUrl) return 'invalidUrl';
  if (f.info) return f.info.apiVersion === f.clientApiVersion ? null : 'incompatible';
  if (f.reachable) return 'notLuDraw';
  if (f.port === 'unknown-host') return 'unknownHost';
  if (f.port === 'open') return f.https ? 'certificate' : 'notLuDraw';
  return 'offline';
}

/** Origem do emissor do SSO informada pelo servidor: só `http(s)://host[:porta]` exato; o resto é ignorado (D14). */
export function ssoOriginOf(info: { ssoOrigin?: string | null } | null): string | null {
  const raw = info?.ssoOrigin;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.hostname.includes('*') && u.origin === raw.replace(/\/$/, '') ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Mensagens usadas só pelo programa (menu nativo e título da janela, `src-tauri/src/text.rs`): ficam nos mesmos
 * catálogos da interface. O `test:desktop` confere que existem em pt-BR e en.
 */
export const DESKTOP_NATIVE_KEYS = ['desktop.menu.switch', 'desktop.menu.reload', 'desktop.menu.quit', 'desktop.title.blocked', 'desktop.title.saved', 'desktop.title.saveFailed'] as const;
