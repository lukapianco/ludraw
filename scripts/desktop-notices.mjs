#!/usr/bin/env node
/**
 * LuDraw — avisos de terceiros do programa desktop (Chat 09.1 · R8). `npm run notices:desktop`
 *
 * Grava src-tauri/THIRD_PARTY_NOTICES.txt (vai nos dois instaladores). Precisa das fontes das crates no cache do
 * cargo (`cargo fetch` dentro de src-tauri/). Rode depois de `npm run crates`. O `npm run audit:legal` bloqueia se o
 * arquivo não corresponder ao inventário. Isto não é parecer jurídico.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesktopNotices, DESKTOP_NOTICES } from './lib/desktopNotices.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = buildDesktopNotices(root);
const file = path.join(root, DESKTOP_NOTICES);
const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
fs.writeFileSync(file, text);
const count = /^Componentes \/ Components: (\d+)/m.exec(text)?.[1];
console.log(`${before === text ? '=' : '✎'} ${DESKTOP_NOTICES} (${count} componentes, ${Math.round(text.length / 1024)} KB)`);
