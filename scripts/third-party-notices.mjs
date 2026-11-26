#!/usr/bin/env node
/**
 * LuDraw — gera os avisos de terceiros (Chat 08.6 · D, O-02).
 *
 *   npm run notices            grava THIRD_PARTY_NOTICES.txt (app) e server/THIRD_PARTY_NOTICES.txt (servidor)
 *   npm run notices -- --check só confere (código 1 se algum estiver faltando ou desatualizado)
 *
 * Rode depois de instalar, atualizar ou remover qualquer pacote (o `npm run audit:legal` bloqueia se os
 * arquivos não baterem com os lockfiles). O build do app (plugin no vite.config.ts) e o do servidor
 * (server/scripts/build.mjs) copiam cada arquivo para o respectivo `dist/`. Isto não é parecer jurídico.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNotices, NOTICE_TARGETS } from './lib/notices.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
let stale = 0;
for (const target of NOTICE_TARGETS) {
  const text = buildNotices(root, target);
  const file = path.join(root, target.out);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  const count = (text.match(/^Pacotes \/ Packages: (\d+)/m) || [])[1];
  if (check) {
    if (current !== text) {
      stale++;
      console.log(`✗ ${target.out} ${current === null ? 'não existe' : 'desatualizado'} — rode npm run notices`);
    } else console.log(`✓ ${target.out} (${count} pacotes)`);
  } else {
    fs.writeFileSync(file, text);
    console.log(`${current === text ? '=' : '✎'} ${target.out} (${count} pacotes, ${Math.round(text.length / 1024)} KB)`);
  }
}
process.exitCode = stale ? 1 : 0;
