#!/usr/bin/env node
/**
 * LuDraw — Chat 09.1 · R7: cabeçalhos do protocolo local do desktop (`npm run desktop:web` roda depois do build).
 *
 * Lê `dist/csp.json` (hash dos scripts embutidos do build) e grava `src-tauri/generated/headers.json`, que o programa
 * embute na compilação. A política vem de `src/utils/securityHeaders.ts`, a mesma fonte do servidor e do Vite.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./lib/ts-hooks.mjs', import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { desktopHeaders } = await import(pathToFileURL(join(root, 'src/utils/securityHeaders.ts')).href);

const { scriptHashes } = JSON.parse(readFileSync(join(root, 'dist/csp.json'), 'utf8'));
if (!Array.isArray(scriptHashes) || !scriptHashes.length) throw new Error('dist/csp.json sem scriptHashes (rode npm run build)');
const out = join(root, 'src-tauri/generated/headers.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(desktopHeaders(scriptHashes), null, 2)}\n`);
process.stdout.write('desktop-headers — src-tauri/generated/headers.json gravado.\n');
