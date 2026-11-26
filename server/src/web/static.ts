/**
 * LuDraw server — app compilado servido na mesma origem da API (Chat 09 · R2, pendência 1; decisões D2/D3).
 *
 * Sem dependência nova: no boot a pasta (`LUDRAW_WEB_DIR`, o `dist/` do app) é varrida e vira uma LISTA FIXA de
 * caminhos → arquivos. Só caminho exato da lista é servido (não há como sair da pasta com `../`, `%2e%2e` ou link
 * simbólico criado depois). Fora da lista: 404. Ficam de fora os `.map` (O-16: sem sourcemap na imagem) e o
 * `csp.json` (lido aqui, não servido).
 *
 * Cabeçalhos (fonte única `src/utils/securityHeaders.ts`):
 *  - `index.html`: CSP do app (hash dos scripts embutidos vindo de `csp.json`), COOP/CORP, `Permissions-Policy`,
 *    `Referrer-Policy: no-referrer`, `nosniff`, `X-DNS-Prefetch-Control: off`; HSTS só por HTTPS; `no-cache`.
 *  - `ext/station.html` / `ext/panel-host.html`: a CSP própria do documento isolado das extensões.
 *  - `assets/*` (nomes com hash do build): `immutable` por um ano. O resto: `no-cache` com ETag.
 *  - Sem `X-Frame-Options` nas páginas (a API continua com `DENY`): quem embute é o `frame-ancestors` (D8).
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { appDocumentHeaders, isolatedDocHeaders, ISOLATED_DOC_PATHS, staticAssetHeaders } from '../../../src/utils/securityHeaders';
import type { ServerConfig } from '../config';

export interface WebFile {
  path: string;
  size: number;
  etag: string;
  type: string;
}

export interface WebApp {
  dir: string;
  files: Map<string, WebFile>;
  scriptHashes: string[];
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',
};

const EXCLUDED = (rel: string) => rel.endsWith('.map') || rel === 'csp.json';

/** Varre a pasta do app e monta a lista fixa. Sem `index.html` ou `csp.json` = erro (o servidor não sobe). */
export function loadWebApp(dir: string): WebApp {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`LUDRAW_WEB_DIR=${dir} has no index.html (build the app with "npm run build")`);
  const cspFile = join(dir, 'csp.json');
  if (!existsSync(cspFile)) throw new Error(`LUDRAW_WEB_DIR=${dir} has no csp.json (it is written by the app build; rebuild with "npm run build")`);
  const parsed = JSON.parse(readFileSync(cspFile, 'utf8')) as { scriptHashes?: unknown };
  const scriptHashes = Array.isArray(parsed.scriptHashes) ? parsed.scriptHashes.filter((h): h is string => typeof h === 'string') : [];
  const files = new Map<string, WebFile>();
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue; // nunca segue link simbólico
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      const rel = relative(dir, full).split(sep).join('/');
      if (EXCLUDED(rel)) continue;
      const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
      const etag = `"${createHash('sha256').update(readFileSync(full)).digest('base64url').slice(0, 22)}"`;
      files.set(`/${rel}`, { path: full, size: st.size, etag, type: TYPES[ext] ?? 'application/octet-stream' });
    }
  };
  walk(dir);
  return { dir, files, scriptHashes };
}

/** Respostas que são do APP (não da API): o `onSend` geral não põe `X-Frame-Options` nelas. */
export const webResponses = new WeakSet<FastifyReply>();

/** Registra o app: GET/HEAD de qualquer caminho fora de `/api/` e de `/health`. */
export function registerWebRoutes(app: FastifyInstance, config: Pick<ServerConfig, 'publicUrl' | 'csp'>, web: WebApp): void {
  app.get('/*', { config: { rateLimit: false } }, async (request, reply) => {
    const rawPath = request.url.split(/[?#]/)[0];
    if (rawPath.startsWith('/api/')) return reply.callNotFound();
    let path: string;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      return reply.callNotFound();
    }
    if (path === '/') path = '/index.html';
    const file = web.files.get(path);
    if (!file) return reply.callNotFound();
    const https = request.protocol === 'https';
    const rel = path.slice(1);
    const isolated = ISOLATED_DOC_PATHS[rel];
    const headers =
      path === '/index.html'
        ? appDocumentHeaders({ scriptHashes: web.scriptHashes, connectSrc: config.csp.connectSrc, frameAncestors: config.csp.frameAncestors, publicOrigin: config.publicUrl, https })
        : isolated
          ? isolatedDocHeaders(isolated, https)
          : staticAssetHeaders(https);
    webResponses.add(reply);
    reply.headers(headers);
    reply.header('content-type', file.type);
    reply.header('etag', file.etag);
    reply.header('cache-control', rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (request.headers['if-none-match'] === file.etag) return reply.status(304).send();
    reply.header('content-length', String(file.size));
    return reply.send(createReadStream(file.path));
  });
}
