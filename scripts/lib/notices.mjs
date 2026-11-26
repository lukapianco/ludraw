/**
 * LuDraw — avisos de terceiros (THIRD_PARTY_NOTICES.txt) a partir dos lockfiles (Chat 08.6 · D, O-02).
 *
 * Para cada pacote da árvore de PRODUÇÃO de um lockfile (o que vai para o `dist/` do app ou roda no servidor),
 * junta nome, versão, licença declarada, repositório, o texto do arquivo de licença do próprio pacote e o
 * NOTICE, se houver. Pacote sem arquivo de licença: texto padrão da licença declarada, com o autor do
 * package.json como titular (MIT/ISC) ou o texto oficial do Apache-2.0 tirado de um pacote instalado.
 * Sem data e em ordem alfabética: o mesmo lockfile gera sempre o mesmo arquivo (o audit:legal compara).
 * Node puro, sem dependências. Isto não é parecer jurídico.
 */
import fs from 'node:fs';
import path from 'node:path';

const LICENSE_FILE = /^(licen[cs]e|copying)([.-][\w.-]+)?$/i;
const NOTICE_FILE = /^notice([.-][\w.-]+)?$/i;

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const filesIn = (dir) => {
  try {
    return fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()).sort();
  } catch {
    return [];
  }
};
const personName = (a) => {
  const raw = typeof a === 'string' ? a : a?.name ?? '';
  return raw.replace(/<[^>]*>/g, '').replace(/\([^)]*\)/g, '').trim();
};
const repoUrl = (r) => {
  const u = typeof r === 'string' ? r : r?.url ?? '';
  return u.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '');
};

const MIT_TEXT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const ISC_TEXT = (holder) => `ISC License

Copyright (c) ${holder}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

/** Texto oficial do Apache License 2.0 (termos 1–9), lido de um pacote instalado que o distribui. */
function apacheText(roots) {
  for (const base of roots) {
    for (const rel of ['node_modules/typescript/LICENSE.txt', 'node_modules/@electric-sql/pglite/LICENSE', 'node_modules/@fontsource-variable/roboto-slab/LICENSE']) {
      const p = path.join(base, rel);
      if (!fs.existsSync(p)) continue;
      const t = read(p);
      const start = t.indexOf('Apache License');
      const end = t.indexOf('END OF TERMS AND CONDITIONS');
      if (start >= 0 && end > start && t.includes('Version 2.0, January 2004')) return t.slice(start, end + 'END OF TERMS AND CONDITIONS'.length);
    }
  }
  return null;
}

/**
 * Lista de pacotes de produção de uma raiz (`''` = app, `'server'`), com o texto da licença de cada um.
 * `repoRoot` = raiz do repositório. Lança erro se faltar texto para algum pacote (nada é inventado).
 */
export function collectNotices(repoRoot, base) {
  const dir = path.join(repoRoot, base);
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  const apache = apacheText([dir, repoRoot]);
  const out = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key || entry.dev || entry.link) continue;
    const pkgDir = path.join(dir, key);
    if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
      if (entry.optional) continue; // binário opcional de outra plataforma (não instalado aqui)
      throw new Error(`${base || '.'}: ${key} não está instalado — rode npm ci antes de gerar os avisos`);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const license = typeof pkg.license === 'string' ? pkg.license : entry.license ?? 'UNKNOWN';
    const files = filesIn(pkgDir);
    const licFiles = files.filter((n) => LICENSE_FILE.test(n));
    const noticeFiles = files.filter((n) => NOTICE_FILE.test(n));
    let text;
    let source;
    if (licFiles.length) {
      text = licFiles.map((n) => (licFiles.length > 1 ? `[${n}]\n` : '') + read(path.join(pkgDir, n))).join('\n\n');
      source = licFiles.join(', ');
    } else {
      const holder = personName(pkg.author) || `the ${pkg.name} authors`;
      if (/^MIT$/.test(license)) text = MIT_TEXT(holder);
      else if (/^ISC$/.test(license)) text = ISC_TEXT(holder);
      else if (/^Apache-2\.0$/.test(license) && apache) text = `Copyright ${holder}\n\n${apache}`;
      if (!text) throw new Error(`${base || '.'}: ${pkg.name}@${pkg.version} (${license}) não traz arquivo de licença e não há texto padrão para essa licença`);
      source = `texto padrão da licença ${license} — o pacote não traz arquivo de licença; titular = autor do package.json`;
    }
    const notice = noticeFiles.map((n) => read(path.join(pkgDir, n))).join('\n\n');
    out.push({ name: pkg.name, version: pkg.version, license, repository: repoUrl(pkg.repository) || pkg.homepage || '', source, text, notice });
  }
  out.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
  return out;
}

const RULE = '='.repeat(78);
const THIN = '-'.repeat(78);

/** Texto do arquivo de avisos (determinístico). */
export function renderNotices(title, items) {
  const head = [
    `LuDraw — ${title}`,
    'Avisos de terceiros / Third-party notices',
    '',
    'Este arquivo é gerado por `npm run notices` (scripts/third-party-notices.mjs) a partir do package-lock.json.',
    'Lista os pacotes de terceiros distribuídos com este componente, com a licença de cada um e o texto do',
    'aviso de licença e de copyright que essa licença exige. O código do próprio LuDraw é MIT (LICENSE).',
    'This file is generated by `npm run notices` from package-lock.json. It lists the third-party packages',
    'distributed with this component, with the license and the copyright/license notice each one requires.',
    '',
    `Pacotes / Packages: ${items.length}`,
    '',
  ];
  const index = items.map((i) => `  - ${i.name}@${i.version} (${i.license})`);
  const body = items.flatMap((i) => [
    RULE,
    `${i.name}@${i.version}`,
    `Licença / License: ${i.license}`,
    ...(i.repository ? [`Repositório / Repository: ${i.repository}`] : []),
    `Texto / Text: ${i.source}`,
    THIN,
    i.text,
    ...(i.notice ? ['', THIN, 'NOTICE', THIN, i.notice] : []),
    '',
  ]);
  return [...head, 'Índice / Index', ...index, '', ...body].join('\n').replace(/\n+$/, '') + '\n';
}

/** Os dois arquivos: app (raiz) e servidor. */
export const NOTICE_TARGETS = [
  { base: '', out: 'THIRD_PARTY_NOTICES.txt', title: 'app web (dist/)', dist: 'dist/THIRD_PARTY_NOTICES.txt' },
  { base: 'server', out: 'server/THIRD_PARTY_NOTICES.txt', title: 'servidor (server/)', dist: 'server/dist/THIRD_PARTY_NOTICES.txt' },
];

export function buildNotices(repoRoot, target) {
  return renderNotices(target.title, collectNotices(repoRoot, target.base));
}
