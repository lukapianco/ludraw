#!/usr/bin/env node
/**
 * LuDraw — guarda do nome (`npm run audit:name`), renomeação de 23/11/2026.
 *
 * O projeto se chamava de outro jeito antes de ser publicado. Este script falha (código 1) se o nome antigo
 * voltar a aparecer em qualquer arquivo de texto ou nome de arquivo do repositório: código, testes, textos,
 * catálogos, configuração, Docker, CI e documentação. Confere:
 *   - conteúdo e caminho de todo arquivo versionado ou novo (não ignorado) — `git ls-files -co --exclude-standard`;
 *   - também a pasta local `ai-memory/` (fora do git, mas é a memória do projeto entregue no handoff);
 *   - o nome em qualquer grafia e separador (minúsculas, maiúsculas, `_`, `-`, espaço) e o wordmark partido em
 *     duas partes de marcação (`…<span>…`), que um grep simples não pega.
 *
 * Exceções (e só estas):
 *   1. `ai-memory/refs/` — provas de origem com SHA-256 registrado (docs/PROVENANCE.md §4.1); não mudam.
 *   2. `CHANGELOG.md` a partir do título da entrada da renomeação — o histórico mantém o nome da época.
 *   3. Notas de renomeação entre os marcadores `audit:name:nota-início` e `audit:name:nota-fim`
 *      (comentários HTML nos .md) — onde é preciso dizer qual era o nome antigo.
 *   4. A palavra `openDrawer` (abrir gaveta), que só contém as mesmas letras.
 * O prefixo técnico histórico `od` (`--od-*`, `od-*`, `OdIcon`, `icons/od/`, `data-od-*`, marcadores `od:`) não é o
 * nome antigo e é aceito (CONTRIBUTING.md, "Nome do projeto e prefixo `od`").
 *
 * Uso: node scripts/audit-name.mjs        → lista as ocorrências e sai com 1 se houver alguma
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// O padrão é montado em partes para este arquivo não conter o nome que procura.
const A = 'open';
const B = 'draw';
const NAME = new RegExp(`${A}[\\s_-]*${B}(?!er)`, 'gi');
const SPLIT = new RegExp(`${A}\\s*<(?:t?span)\\b[^>]*>\\s*${B}`, 'gi');
const NOTE_START = 'audit:name:nota-início';
const NOTE_END = 'audit:name:nota-fim';
const CHANGELOG_HISTORY = /^### Alterado — o projeto passa a se chamar LuDraw/;

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|zip|gz|tgz|pdf|wasm|mp3|wav|ogg|mp4|webm|exe|msi|dll|so|dylib|sqlite|db)$/i;

function listFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
  const files = new Set(out.split('\0').filter(Boolean));
  const mem = join(ROOT, 'ai-memory');
  if (existsSync(mem)) {
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else files.add(relative(ROOT, p).replace(/\\/g, '/'));
      }
    };
    walk(mem);
  }
  return [...files].sort();
}

const problems = [];
let scanned = 0;
for (const file of listFiles()) {
  const abs = join(ROOT, file);
  if (!existsSync(abs) || !statSync(abs).isFile()) continue; // apagado no working tree
  if (file.startsWith('ai-memory/refs/')) continue; // exceção 1
  NAME.lastIndex = 0;
  if (NAME.test(file)) problems.push(`${file}: nome antigo no caminho do arquivo`);
  if (BINARY.test(file)) continue;
  const text = readFileSync(abs, 'utf8');
  if (text.includes('\u0000')) continue;
  scanned++;
  let inNote = false;
  let inHistory = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (file === 'CHANGELOG.md' && CHANGELOG_HISTORY.test(line)) inHistory = true; // exceção 2
    if (line.includes(NOTE_START)) inNote = true; // exceção 3
    const allowed = inHistory || inNote;
    if (line.includes(NOTE_END)) inNote = false;
    if (allowed) continue;
    for (const re of [NAME, SPLIT]) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        const at = m.index ?? 0;
        problems.push(`${file}:${i + 1}: …${line.slice(Math.max(0, at - 30), at + m[0].length + 30).trim()}…`);
      }
    }
  }
  if (inNote) problems.push(`${file}: marcador ${NOTE_START} sem ${NOTE_END}`);
}

if (problems.length) {
  process.stderr.write(`audit:name — o nome antigo do projeto apareceu em ${problems.length} lugar(es):\n`);
  for (const p of problems) process.stderr.write(`  - ${p}\n`);
  process.stderr.write('Troque por LuDraw / ludraw / LUDRAW_ (ou, se for nota de renomeação, use os marcadores do cabeçalho deste script).\n');
  process.exit(1);
}
process.stdout.write(`audit:name — ${scanned} arquivos de texto conferidos: nenhum nome antigo (exceções: ai-memory/refs/, histórico do CHANGELOG, notas marcadas).\n`);
