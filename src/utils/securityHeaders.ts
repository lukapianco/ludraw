/**
 * LuDraw — cabeçalhos de segurança e CSP do app (Chat 09 · R2, pendência 1; AUDITORIA_08_7 §11.1–11.2).
 *
 * PURO (sem DOM, sem Node): o MESMO montador é usado pelo servidor (que serve o `dist/` na imagem), pelo Vite
 * (desenvolvimento e `preview`, para os testes de navegador rodarem com a CSP ligada) e pelos testes.
 *
 * Decisões (plano do Chat 09 aprovado pelo usuário):
 *  - `script-src 'self'` + hash de cada `<script>` embutido do `index.html` (calculado no build — `dist/csp.json`).
 *    Nada de `unsafe-inline`/`unsafe-eval` em script.
 *  - `style-src 'self' 'unsafe-inline'`: o React usa `style={{…}}` em toda a interface e os temas de extensão
 *    injetam `<style>` (aceito e registrado; sem hash aqui — com hash o navegador ignoraria o `unsafe-inline`).
 *  - `img-src`/`font-src` sem origem externa (fecha o caminho de imagem/fonte de fora — S-30/S-28, 2ª camada).
 *  - `connect-src 'self'` (+ `data:` para `fetch` de data URL) + `LUDRAW_CSP_CONNECT_SRC` (D7: hosts que o
 *    operador aprova para extensões com a permissão `network`). WebSocket da mesma origem: `'self'` cobre `ws:`/`wss:`
 *    (CSP 3); com endereço público configurado, a origem `ws(s)://` dele entra explícita.
 *  - `frame-src 'self'`: os documentos isolados das extensões (`ext/*.html`).
 *  - `frame-ancestors 'self'` + `LUDRAW_FRAME_ANCESTORS` (D8: "Incorporar board" em outro site).
 *  - HSTS e `upgrade-insecure-requests` só quando a página vem por HTTPS.
 */
import { ISOLATED_DOC_CSP, ISOLATED_DOCS, type IsolatedDocKind } from '../extensions/host/isolationPolicy';

export interface AppCspInput {
  /** Hashes `sha256-…` (base64) dos `<script>` embutidos do `index.html`. */
  scriptHashes: readonly string[];
  /** Origens extras para `connect-src` (validadas por `parseSourceList`). */
  connectSrc?: readonly string[];
  /** Origens extras para `frame-ancestors` (validadas por `parseSourceList`). */
  frameAncestors?: readonly string[];
  /** Origem pública do servidor (ex.: `https://draw.example.com`) — entra a versão `ws(s)://` em `connect-src`. */
  publicOrigin?: string | null;
  /** A página veio por HTTPS (liga `upgrade-insecure-requests` e HSTS). */
  https?: boolean;
}

/** Fonte aceita numa lista de origens: `https://host[:porta]`, `wss://…`, `http(s)://*.dominio`. Sem caminho, sem aspas. */
const SOURCE_RE = /^(https?|wss?):\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/i;

/**
 * Lista de origens de uma variável (separadas por vírgula ou espaço). Valor fora do formato = erro (o servidor não
 * sobe): uma CSP montada com texto livre poderia abrir tudo (`*`, `'unsafe-inline'`, `;`).
 */
export function parseSourceList(raw: string | null | undefined, name: string): string[] {
  if (!raw) return [];
  const items = raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  for (const it of items) {
    if (!SOURCE_RE.test(it)) throw new Error(`${name}: "${it}" is not an origin like https://host.example.com (no paths, wildcards only as *.domain)`);
  }
  return [...new Set(items.map((x) => x.toLowerCase()))];
}

const HASH_RE = /^sha256-[A-Za-z0-9+/]{43}=$/;

/** `ws(s)://` da origem pública (`https:` → `wss:`). */
function wsOrigin(origin: string): string | null {
  const m = /^(https?):\/\/([^/]+)$/i.exec(origin);
  if (!m) return null;
  return `${m[1].toLowerCase() === 'https' ? 'wss' : 'ws'}://${m[2]}`;
}

/** CSP do app (documento `index.html`). */
export function appCsp(input: AppCspInput): string {
  for (const h of input.scriptHashes) if (!HASH_RE.test(h)) throw new Error(`invalid script hash: ${h}`);
  const connect = ["'self'", 'data:'];
  const ws = input.publicOrigin ? wsOrigin(input.publicOrigin) : null;
  if (ws) connect.push(ws);
  connect.push(...(input.connectSrc ?? []));
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...input.scriptHashes.map((h) => `'${h}'`)]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', [...new Set(connect)]],
    ['worker-src', ["'self'"]],
    ['frame-src', ["'self'"]],
    ['media-src', ["'self'", 'data:', 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'", ...(input.frameAncestors ?? [])]],
  ];
  const parts = directives.map(([k, v]) => `${k} ${v.join(' ')}`);
  if (input.https) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** Permissões do navegador que o app não usa (área de transferência e tela cheia continuam permitidas). */
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

/** HSTS (só por HTTPS; sem `preload` até a decisão do operador). */
export const HSTS = 'max-age=31536000; includeSubDomains';

/** Cabeçalhos comuns a toda resposta do app (página, arquivos estáticos e documentos isolados). */
function baseHeaders(https: boolean): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': PERMISSIONS_POLICY,
    'x-dns-prefetch-control': 'off',
    ...(https ? { 'strict-transport-security': HSTS } : {}),
  };
}

/** Cabeçalhos da página do app (`index.html`). */
export function appDocumentHeaders(input: AppCspInput): Record<string, string> {
  return { ...baseHeaders(!!input.https), 'content-security-policy': appCsp(input) };
}

/** Cabeçalhos dos arquivos estáticos (JS, CSS, fontes, imagens): sem CSP de documento. */
export function staticAssetHeaders(https: boolean): Record<string, string> {
  return baseHeaders(https);
}

/** Cabeçalhos de um documento isolado das extensões (CSP própria + só a mesma origem pode embutir). */
export function isolatedDocHeaders(kind: IsolatedDocKind, https: boolean): Record<string, string> {
  return { ...baseHeaders(https), 'content-security-policy': `${ISOLATED_DOC_CSP[kind]}; frame-ancestors 'self'` };
}

/** Caminho (relativo à raiz do app) → tipo de documento isolado. */
export const ISOLATED_DOC_PATHS: Record<string, IsolatedDocKind> = Object.fromEntries(
  (Object.entries(ISOLATED_DOCS) as [IsolatedDocKind, string][]).map(([k, p]) => [p, k]),
);

/** Hashes `sha256-…` dos `<script>` embutidos (sem `src`) de um HTML. `sha256b64` é injetado (Node ou WebCrypto). */
export function inlineScriptHashes(html: string, sha256b64: (text: string) => string): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out.push(`sha256-${sha256b64(m[2])}`);
  }
  return [...new Set(out)];
}

/* ---------------------------- Desktop (Chat 09.1 · R7) ---------------------------- */

/**
 * `connect-src` do documento `desktop` (a escolha de onde trabalhar): a ponte do Tauri e o teste de qualquer endereço
 * de servidor. Só esse documento recebe isto — ele não abre boards nem extensões. A página do app continua em
 * `'self' data:` e as janelas de board não têm permissão na ponte (src-tauri/capabilities/chooser.json).
 */
const DESKTOP_CHOOSER_CONNECT = ['ipc:', 'http://ipc.localhost', 'http:', 'https:'] as const;

export interface DesktopHeaderTable {
  app: Record<string, string>;
  chooser: Record<string, string>;
  asset: Record<string, string>;
  isolated: Record<string, Record<string, string>>;
}

/** Cabeçalhos do protocolo local do desktop (gravados em `src-tauri/generated/headers.json` na compilação). */
export function desktopHeaders(scriptHashes: readonly string[]): DesktopHeaderTable {
  return {
    app: appDocumentHeaders({ scriptHashes }),
    chooser: appDocumentHeaders({ scriptHashes, connectSrc: DESKTOP_CHOOSER_CONNECT }),
    asset: staticAssetHeaders(false),
    isolated: Object.fromEntries(Object.entries(ISOLATED_DOC_PATHS).map(([path, kind]) => [`/${path}`, isolatedDocHeaders(kind, false)])),
  };
}
