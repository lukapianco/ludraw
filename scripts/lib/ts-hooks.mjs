/**
 * LuDraw — hooks de módulo do Node para os testes (sem dependências).
 *
 * O app usa imports sem extensão (`'../utils/zip'`) e importa JSON sem atributo (Vite). Para rodar
 * esses módulos direto do TypeScript no Node (type stripping nativo), estes hooks:
 * - resolvem `./x` → `./x.ts` ou `./x/index.ts` quando o import não tem extensão;
 * - carregam `.json` como módulo ES (`export default {…}`).
 * Usado por `scripts/test-extensions.mjs` via `module.register()`.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const HAS_EXT = /\.(?:[cm]?[jt]sx?|json)$/;

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !HAS_EXT.test(specifier)) {
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return await next(specifier + suffix, context);
        } catch {
          /* tenta o próximo */
        }
      }
    }
    throw err;
  }
}

export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { format: 'module', source: `export default ${text};`, shortCircuit: true };
  }
  return next(url, context);
}
