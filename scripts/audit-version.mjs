#!/usr/bin/env node
/**
 * LuDraw — versão única (Chat 09 · R3, O-10). A fonte é o `package.json` da raiz; tudo o mais tem de bater:
 *   server/package.json, os dois package-lock.json (campo de cima e o pacote raiz), o ARG LUDRAW_VERSION do
 *   Dockerfile (rótulo da imagem), a tag padrão da imagem no docker-compose.yml, a primeira versão do CHANGELOG
 *   e qualquer "LuDraw X.Y.Z" escrito no código do app.
 * O /api/v1/info lê o server/package.json (embutido no build), então segue junto.
 *
 *   npm run audit:version
 *
 * Nova versão: troque a da raiz, rode este script e corrija o que ele apontar. A tag do git é criada pelo
 * mantenedor (`git tag -a vX.Y.Z -m "LuDraw X.Y.Z"`), nunca por script.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const version = json('package.json').version;
const problems = [];
if (!SEMVER.test(version)) problems.push(`package.json: "${version}" não é uma versão semântica (X.Y.Z)`);

function same(where, found) {
  if (found !== version) problems.push(`${where}: ${found === undefined || found === null ? 'não encontrado' : `"${found}"`} (esperado "${version}")`);
}

same('server/package.json', json('server/package.json').version);
for (const lock of ['package-lock.json', 'server/package-lock.json']) {
  const l = json(lock);
  same(`${lock} (version)`, l.version);
  same(`${lock} (packages[""].version)`, l.packages?.['']?.version);
}
same('Dockerfile (ARG LUDRAW_VERSION)', /^ARG LUDRAW_VERSION=(\S+)$/m.exec(read('Dockerfile'))?.[1]);
same('docker-compose.yml (imagem padrão)', /\$\{LUDRAW_IMAGE:-ludraw:([^}]+)\}/.exec(read('docker-compose.yml'))?.[1]);
// Chat 09.1 · R7: desktop — o tauri.conf.json lê a versão da raiz; a crate e o lock têm a própria linha
same('src-tauri/Cargo.toml', /^version = "([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1]);
same('src-tauri/Cargo.lock (ludraw-desktop)', /name = "ludraw-desktop"\r?\nversion = "([^"]+)"/.exec(read('src-tauri/Cargo.lock'))?.[1]);
if (json('src-tauri/tauri.conf.json').version !== '../package.json') problems.push('src-tauri/tauri.conf.json: "version" deve ser "../package.json"');
same('CHANGELOG.md (primeira versão)', /^## \[(\d+\.\d+\.\d+[^\]]*)\]/m.exec(read('CHANGELOG.md'))?.[1]);

// "LuDraw 0.1.0" esquecido em texto do app (amostras do Sistema visual, telas de "sobre"…)
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(name)) out.push(p);
  }
  return out;
}
for (const file of walk(join(ROOT, 'src'))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/LuDraw (\d+\.\d+\.\d+)/g)) {
    if (m[1] !== version) problems.push(`${relative(ROOT, file).replace(/\\/g, '/')}: "LuDraw ${m[1]}" (esperado "${version}")`);
  }
}

if (problems.length) {
  process.stderr.write(`audit:version — versão ${version}, ${problems.length} divergência(s):\n${problems.map((p) => `  ✗ ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`audit:version — ${version} em todos os lugares (raiz, servidor, lockfiles, Dockerfile, compose, desktop, CHANGELOG, app).\n`);
