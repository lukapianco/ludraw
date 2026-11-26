#!/usr/bin/env node
/**
 * LuDraw — Chat 09.1 · R7: inventário das crates do desktop (`npm run crates`).
 *
 * Lê o `src-tauri/Cargo.lock` com o `cargo metadata`/`cargo tree` e grava `src-tauri/crates.json`: nome, versão,
 * licença, SHA-256 e onde cada crate entra (executável, só compilação ou só no lock) no Windows e no Linux. O
 * `npm run audit:legal` confere o lock contra esse arquivo em Node puro (o CI não precisa do cargo).
 *
 * Crate nova = licença aprovada pelo usuário ANTES, versão publicada há 7 dias ou mais, e só então este script.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri');
const cargo = (...args) => execFileSync('cargo', args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const TARGETS = { windows: 'x86_64-pc-windows-msvc', linux: 'x86_64-unknown-linux-gnu' };

const lock = readFileSync(join(dir, 'Cargo.lock'), 'utf8').replace(/\r\n/g, '\n');
const sums = new Map([...lock.matchAll(/name = "([^"]+)"\nversion = "([^"]+)"\nsource = "[^"]+"\nchecksum = "([0-9a-f]{64})"/g)].map((m) => [`${m[1]}@${m[2]}`, m[3]]));
const tree = (target, edges) =>
  new Set(
    cargo('tree', '--locked', '--target', target, '-e', edges, '--prefix', 'none', '--format', '{p}')
      .split(/\r?\n/)
      .map((l) => /^(\S+) v(\S+)/.exec(l))
      .filter(Boolean)
      .map((m) => `${m[1]}@${m[2]}`),
  );
const use = Object.fromEntries(Object.entries(TARGETS).map(([os, t]) => [os, { exe: tree(t, 'normal,no-proc-macro'), all: tree(t, 'normal,build') }]));
const where = (os, key) => (use[os].exe.has(key) ? 'exe' : use[os].all.has(key) ? 'build' : 'lock');

const { packages } = JSON.parse(cargo('metadata', '--locked', '--format-version', '1'));
const crates = packages
  .filter((p) => p.source)
  .map((p) => {
    const key = `${p.name}@${p.version}`;
    return { name: p.name, version: p.version, license: p.license ?? null, sha256: sums.get(key) ?? null, windows: where('windows', key), linux: where('linux', key) };
  })
  .sort((a, b) => (a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1));

const rows = crates.map((c) => `  ${JSON.stringify(c)}`).join(',\n');
writeFileSync(join(dir, 'crates.json'), `[\n${rows}\n]\n`);
const count = (f) => crates.filter(f).length;
process.stdout.write(`crates — ${crates.length} no lock: ${count((c) => c.windows === 'exe')} no executável do Windows, ${count((c) => c.linux === 'exe')} no do Linux, ${count((c) => c.windows === 'lock' && c.linux === 'lock')} só no lock.\n`);
