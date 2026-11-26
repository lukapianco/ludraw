/**
 * LuDraw server — build de produção (Chat 07): esbuild empacota `src/index.ts` e `src/cli.ts` em
 * `dist/` (resolve os imports sem extensão e os JSON de `../src`). As dependências de `node_modules`
 * ficam de fora do pacote (argon2 tem binário nativo); as migrações SQL são copiadas para `dist/drizzle` e os
 * avisos de terceiros para `dist/THIRD_PARTY_NOTICES.txt` (Chat 08.6).
 */
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
rmSync(`${root}/dist`, { recursive: true, force: true });
await build({
  entryPoints: { index: `${root}/src/index.ts`, cli: `${root}/src/cli.ts` },
  outdir: `${root}/dist`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  // Chat 09 · R1: o `paths` do tsconfig aponta `yjs` para ./node_modules/yjs (uma cópia só no processo) e, por isso, o
  // esbuild deixava de tratá-lo como pacote e empacotava a versão CommonJS — o `dist/index.js` não subia
  // ("Dynamic require of lib0/observable"). Externo explícito: no runtime resolve para server/node_modules/yjs.
  external: ['yjs'],
  // Chat 09 · R3 (O-16): sem sourcemap por padrão, como o app (a imagem não leva .map); LUDRAW_SOURCEMAP=1 liga
  sourcemap: process.env.LUDRAW_SOURCEMAP === '1',
  legalComments: 'none',
  logLevel: 'info',
});
cpSync(`${root}/drizzle`, `${root}/dist/drizzle`, { recursive: true });
// Chat 08.6 · D (O-02): avisos de terceiros das dependências do servidor (gerados por `npm run notices` na raiz)
cpSync(`${root}/THIRD_PARTY_NOTICES.txt`, `${root}/dist/THIRD_PARTY_NOTICES.txt`);
