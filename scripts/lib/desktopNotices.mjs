/**
 * LuDraw — avisos de terceiros do programa desktop (Chat 09.1 · R8).
 *
 * Junta, para cada crate que vai no EXECUTÁVEL do Windows ou do Linux (`src-tauri/crates.json`), o texto dos arquivos
 * de licença do próprio pacote baixado pelo cargo; e os componentes que não são crates (carregador do WebView2 da
 * Microsoft, NSIS e o plugin do instalador). Crate sem arquivo de licença = texto do repositório oficial, no commit
 * da publicação, guardado em `src-tauri/licenses/` (origem no docs/PROVENANCE.md §3.8). Nada é inventado: faltou
 * texto, dá erro.
 *
 * Textos iguais aparecem uma vez só (o Apache-2.0 se repete em dezenas de crates). Sem data e em ordem: o mesmo
 * inventário gera sempre o mesmo arquivo. O cabeçalho traz o SHA-256 do inventário e dos textos guardados, que o
 * `npm run audit:legal` confere sem precisar do cargo. Isto não é parecer jurídico.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DESKTOP_NOTICES = 'src-tauri/THIRD_PARTY_NOTICES.txt';
const LICENSE_FILE = /^(un)?(licen[cs]e|copying|notice|copyright)([._-][\w.-]+)?$/i;

/** Crates publicadas sem arquivo de licença: texto do repositório oficial (ver PROVENANCE). */
const STORED = {
  'alloc-stdlib@0.3.0': ['alloc-stdlib-0.3.0.txt'],
  'dlopen2@0.8.2': ['dlopen2-0.8.2.txt'],
  'webview2-com@0.39.1': ['webview2-com-0.39.1.txt'],
  'webview2-com-sys@0.39.1': ['webview2-com-0.39.1.txt'],
};

/** Componentes que não são crates. */
const EXTRAS = [
  {
    name: 'Microsoft WebView2 loader (WebView2LoaderStatic.lib, SDK 1.0.3650.58, via webview2-com-sys)',
    license: 'BSD-3-Clause',
    where: 'Windows',
    files: ['Microsoft.Web.WebView2-1.0.3650.58.txt'],
  },
  { name: 'NSIS 3.13 (instalador do Windows, compressão zlib)', license: 'Zlib', where: 'instalador do Windows', files: ['NSIS-3.13-COPYING-zlib.txt'] },
  {
    name: 'nsis_tauri_utils 0.5.3 (plugin do instalador do Windows)',
    license: 'MIT OR Apache-2.0',
    where: 'instalador do Windows',
    files: ['nsis_tauri_utils-0.5.3-MIT.txt', 'nsis_tauri_utils-0.5.3-APACHE-2.0.txt'],
  },
];

const norm = (t) => t.replace(/\r\n/g, '\n').replace(/\s+$/, '');
const sha = (t) => createHash('sha256').update(t).digest('hex');

/** SHA-256 do que define o arquivo: inventário + textos guardados (independe do cargo). */
export function desktopNoticesInputHash(root) {
  const parts = [norm(fs.readFileSync(path.join(root, 'src-tauri/crates.json'), 'utf8'))];
  const dir = path.join(root, 'src-tauri/licenses');
  for (const f of fs.readdirSync(dir).sort()) parts.push(`${f}\n${norm(fs.readFileSync(path.join(dir, f), 'utf8'))}`);
  return sha(parts.join('\n\0\n'));
}

/** Crates do executável (Windows ou Linux), em ordem. */
export function desktopCrates(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/crates.json'), 'utf8'))
    .filter((c) => c.windows === 'exe' || c.linux === 'exe')
    .map((c) => ({ ...c, where: [c.windows === 'exe' && 'Windows', c.linux === 'exe' && 'Linux'].filter(Boolean).join(', ') }));
}

function registryDirs() {
  const home = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo');
  const base = path.join(home, 'registry', 'src');
  return fs.existsSync(base) ? fs.readdirSync(base).map((d) => path.join(base, d)) : [];
}

export function buildDesktopNotices(root) {
  const stored = (f) => norm(fs.readFileSync(path.join(root, 'src-tauri/licenses', f), 'utf8'));
  const registries = registryDirs();
  const items = [];
  for (const c of desktopCrates(root)) {
    const key = `${c.name}@${c.version}`;
    let texts;
    if (STORED[key]) texts = STORED[key].map((f) => [f, stored(f)]);
    else {
      const dir = registries.map((r) => path.join(r, `${c.name}-${c.version}`)).find((d) => fs.existsSync(d));
      if (!dir) throw new Error(`${key}: fonte não encontrada no cache do cargo (rode cargo fetch em src-tauri/)`);
      const files = fs.readdirSync(dir).filter((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile()).sort();
      if (!files.length) throw new Error(`${key} (${c.license}) não traz arquivo de licença: guarde o texto oficial em src-tauri/licenses/ e registre a origem`);
      texts = files.map((f) => [f, norm(fs.readFileSync(path.join(dir, f), 'utf8'))]);
    }
    items.push({ name: key, license: c.license, where: c.where, texts });
  }
  for (const e of EXTRAS) items.push({ name: e.name, license: e.license, where: e.where, texts: e.files.map((f) => [f, stored(f)]) });

  // textos iguais uma vez só
  const ids = new Map();
  const unique = [];
  for (const item of items) {
    item.refs = item.texts.map(([file, text]) => {
      const h = sha(text);
      if (!ids.has(h)) {
        ids.set(h, `T${String(ids.size + 1).padStart(3, '0')}`);
        unique.push({ id: ids.get(h), text, users: [] });
      }
      const id = ids.get(h);
      unique.find((u) => u.id === id).users.push(item.name);
      return `${id} (${file})`;
    });
  }
  const RULE = '='.repeat(78);
  const lines = [
    'LuDraw — programa desktop (Windows e Linux)',
    'Avisos de terceiros / Third-party notices',
    '',
    'Gerado por `npm run notices:desktop` (scripts/desktop-notices.mjs) a partir de src-tauri/crates.json.',
    'Lista as crates Rust que vão no executável e os componentes do instalador, com a licença e o texto de',
    'licença e copyright de cada um. Textos iguais aparecem uma vez só (Tnnn). O código do LuDraw é MIT (LICENSE).',
    'O app web embutido tem os seus avisos em THIRD_PARTY_NOTICES-app.txt.',
    'Generated from src-tauri/crates.json: the Rust crates linked into the executable and the installer',
    'components, with the license and the copyright/license text each one requires. Identical texts appear once.',
    '',
    `Inventário / Inventory: ${desktopNoticesInputHash(root)}`,
    `Componentes / Components: ${items.length}`,
    '',
    'Índice / Index',
    ...items.map((i) => `  - ${i.name} [${i.license}] (${i.where}) → ${i.refs.join(', ')}`),
    '',
    ...unique.flatMap((u) => [RULE, `${u.id} — ${u.users.length === 1 ? u.users[0] : `${u.users.length} componentes: ${u.users.join(', ')}`}`, RULE, u.text, '']),
  ];
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

/** Para o audit:legal (sem cargo): o arquivo existe, foi gerado deste inventário e lista exatamente estas crates. */
export function checkDesktopNotices(root) {
  const file = path.join(root, DESKTOP_NOTICES);
  if (!fs.existsSync(file)) return 'não existe — rode npm run notices:desktop';
  const text = norm(fs.readFileSync(file, 'utf8'));
  const hash = /^Inventário \/ Inventory: ([0-9a-f]{64})$/m.exec(text)?.[1];
  if (hash !== desktopNoticesInputHash(root)) return 'gerado de outro inventário ou de outros textos guardados — rode npm run notices:desktop';
  const listed = [...text.matchAll(/^ {2}- (\S+@\S+) \[/gm)].map((m) => m[1]);
  const expected = desktopCrates(root).map((c) => `${c.name}@${c.version}`);
  if (JSON.stringify(listed) !== JSON.stringify(expected)) return 'a lista de crates não bate com o inventário — rode npm run notices:desktop';
  return null;
}
