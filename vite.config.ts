import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { ISOLATED_DOCS, isolatedDocument, type IsolatedDocKind } from './src/extensions/host/isolationPolicy';
import { appDocumentHeaders, inlineScriptHashes, isolatedDocHeaders, parseSourceList, staticAssetHeaders } from './src/utils/securityHeaders';

// LuDraw — configuração do Vite.
// `base: './'` mantém os caminhos relativos para funcionar também empacotado no Tauri (Chat 08)
// e servido por qualquer subcaminho no Homelab.
/**
 * Chat 08.6 · D (O-02): copia os avisos de terceiros (THIRD_PARTY_NOTICES.txt, gerado por `npm run notices`) para
 * o dist/. Sem o arquivo, o build falha — o app não é distribuído sem os avisos de licença dos pacotes que leva.
 */
function thirdPartyNotices(): Plugin {
  return {
    name: 'ludraw-third-party-notices',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: readFileSync('THIRD_PARTY_NOTICES.txt', 'utf8') });
    },
  };
}

const sha256b64 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');
const DOC_BY_PATH = new Map<string, IsolatedDocKind>((Object.entries(ISOLATED_DOCS) as [IsolatedDocKind, string][]).map(([k, p]) => [`/${p}`, k]));
/** Extras da CSP vindos do ambiente (os mesmos nomes do servidor). */
const cspExtras = () => ({
  connectSrc: parseSourceList(process.env.LUDRAW_CSP_CONNECT_SRC, 'LUDRAW_CSP_CONNECT_SRC'),
  frameAncestors: parseSourceList(process.env.LUDRAW_FRAME_ANCESTORS, 'LUDRAW_FRAME_ANCESTORS'),
});
const pathOf = (req: IncomingMessage) => (req.url ?? '/').split(/[?#]/)[0];
const isIndex = (p: string) => p === '/' || p === '/index.html';
const setAll = (res: ServerResponse, headers: Record<string, string>) => {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
};

/**
 * Chat 09 · R2 (pendência 1): CSP e cabeçalhos do app com a fonte única `src/utils/securityHeaders.ts`.
 *  - build: grava `dist/ext/station.html` e `dist/ext/panel-host.html` (documentos isolados das extensões) e
 *    `dist/csp.json` com o hash de cada `<script>` embutido do `index.html` final (o servidor lê esse arquivo).
 *  - desenvolvimento (`npm run dev`, testes de navegador): a MESMA CSP, com o hash do script que o Vite/React
 *    acrescentam ao `index.html` (calculado do HTML transformado). `LUDRAW_DEV_CSP=0` desliga.
 *  - `vite preview`: a CSP do build (`dist/csp.json`).
 */
function securityHeaders(): Plugin {
  const devCsp = process.env.LUDRAW_DEV_CSP !== '0';
  let devHashes: string[] | null = null;
  return {
    name: 'ludraw-security-headers',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const p = pathOf(req);
        const doc = DOC_BY_PATH.get(p);
        if (doc) {
          setAll(res, isolatedDocHeaders(doc, false));
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.setHeader('cache-control', 'no-cache');
          res.end(isolatedDocument(doc));
          return;
        }
        if (devCsp && isIndex(p)) {
          if (!devHashes) {
            const html = await server.transformIndexHtml('/', readFileSync('index.html', 'utf8'));
            devHashes = inlineScriptHashes(html, sha256b64);
          }
          setAll(res, appDocumentHeaders({ scriptHashes: devHashes, ...cspExtras() }));
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = pathOf(req);
        const doc = DOC_BY_PATH.get(p);
        if (doc) setAll(res, isolatedDocHeaders(doc, false));
        else if (isIndex(p)) {
          const file = join(server.config.build.outDir, 'csp.json');
          const { scriptHashes } = JSON.parse(readFileSync(file, 'utf8')) as { scriptHashes: string[] };
          setAll(res, appDocumentHeaders({ scriptHashes, ...cspExtras() }));
        } else setAll(res, staticAssetHeaders(false));
        next();
      });
    },
    generateBundle() {
      for (const [kind, path] of Object.entries(ISOLATED_DOCS) as [IsolatedDocKind, string][]) {
        this.emitFile({ type: 'asset', fileName: path, source: isolatedDocument(kind) });
      }
    },
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      const index = join(dir, 'index.html');
      if (!existsSync(index)) throw new Error('ludraw-security-headers: dist/index.html not found');
      const scriptHashes = inlineScriptHashes(readFileSync(index, 'utf8'), sha256b64);
      writeFileSync(join(dir, 'csp.json'), `${JSON.stringify({ scriptHashes }, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), thirdPartyNotices(), securityHeaders()],
  // Chat 07: LUDRAW_FORCE_LOCAL=1 força o Modo Local (desenvolvimento). Só ESTA variável vai para o app.
  define: { __LUDRAW_FORCE_LOCAL__: JSON.stringify(/^(1|true|yes|on)$/i.test(process.env.LUDRAW_FORCE_LOCAL ?? '')) },
  base: './',
  server: {
    port: 5173,
    open: true,
    // Chat 09.1 · R7: a compilação do desktop grava e trava arquivos em src-tauri/target — o Vite não vigia essa pasta
    watch: { ignored: ['**/src-tauri/**'] },
    // Chat 07: em desenvolvimento, `/api` vai para o servidor local (`npm run server:dev`), então o Modo
    // Servidor funciona com o endereço vazio ("mesma origem") e o cookie de sessão fica na mesma origem.
    proxy: {
      '/api': { target: process.env.LUDRAW_API_PROXY ?? 'http://localhost:3001', changeOrigin: false, ws: true },
    },
  },
  build: {
    target: 'es2020',
    // Chat 09 · R2 (O-16): sem sourcemaps no build distribuído (a imagem não publica `.map`); LUDRAW_SOURCEMAP=1 liga
    sourcemap: /^(1|true|yes|on)$/i.test(process.env.LUDRAW_SOURCEMAP ?? ''),
    chunkSizeWarningLimit: 1200,
  },
});
