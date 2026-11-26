#!/usr/bin/env node
/**
 * LuDraw — auditoria do catálogo de funções (Chat 05.5 · FEATURES_SPEC.md §2–§4).
 *
 *   npm run audit:features   → confere docs/features.json contra o código (sai com 1 se houver erro)
 *   npm run docs:features    → regenera docs/FEATURES.md a partir do JSON (preserva a lista "A confirmar")
 *
 * Sem dependências: só Node (fs/path). Erros = catálogo inválido ou desatualizado; avisos = conferir à mão.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = path.join(ROOT, 'docs/features.json');
const MD_PATH = path.join(ROOT, 'docs/FEATURES.md');
const WRITE = process.argv.includes('--write');

const STATUSES = ['stable', 'beta', 'experimental', 'planned', 'deprecated', 'removed'];
const CATEGORIES = {
  canvas: 'Board e navegação',
  objetos: 'Objetos',
  conectores: 'Conectores',
  diagramas: 'Diagramas',
  facilitacao: 'Facilitação',
  colaboracao: 'Colaboração',
  governanca: 'Governança',
  importar: 'Importar',
  exportar: 'Exportar',
  dashboard: 'Mesa (dashboard)',
  sistema: 'Sistema',
  acessibilidade: 'Acessibilidade',
  extensoes: 'Extensões',
};
const PREFIX = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, c.toUpperCase()]));
const STATUS_LABEL = { stable: 'estável', beta: 'beta', experimental: 'experimental', planned: 'planejada', deprecated: 'descontinuada', removed: 'removida' };
/** Pontos de partida que não são rótulos literais da interface. */
const ANCHORS = new Set(['Clique direito no objeto', 'Clique direito no board vazio', 'Clique direito na célula']);
const PENDING_MARK = '<!-- A CONFIRMAR: mantido à mão; o gerador preserva tudo daqui para baixo -->';

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

/* ------------------------------------------------------------- código-fonte */
function listFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs, exts));
    else if (exts.includes(path.extname(entry.name))) out.push(abs);
  }
  return out;
}
const sources = listFiles(path.join(ROOT, 'src'), ['.ts', '.tsx']).map((f) => fs.readFileSync(f, 'utf8'));
/** Chat 09 · R5: `devTool.env` precisa ser uma variável que o servidor lê de verdade */
const serverConfig = fs.readFileSync(path.join(ROOT, 'server/src/config.ts'), 'utf8');
const literals = new Set();
for (const text of sources) {
  for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$\n]*)`/g)) literals.add((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));
  for (const m of text.matchAll(/>\s*([^<>{}\n]+?)\s*</g)) literals.add(m[1]);
}
// Chat 05.6: os rótulos de interface saíram do código para o catálogo pt-BR (fonte das traduções).
// Valem os textos do catálogo — inteiros e também sem a marcação de <Trans> (<b>, <kbd>…) —, além
// dos literais que ficaram no código (atalhos, nomes de formato).
const localeDir = path.join(ROOT, 'src/locales/pt-BR');
const LOCALE_CODES = new Set(fs.readdirSync(path.join(ROOT, 'src/locales'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
if (fs.existsSync(localeDir)) {
  for (const file of fs.readdirSync(localeDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    const messages = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    for (const value of Object.values(messages)) {
      if (typeof value !== 'string') continue;
      literals.add(value);
      const plain = value.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\s*\/?>/g, '');
      literals.add(plain);
      for (const part of plain.split(/\{[A-Za-z0-9_]+\}/)) if (part.trim()) literals.add(part.trim());
    }
  }
}
const norm = (s) => s.toLowerCase().replace(/\s+/g, '').replace(/⌘/g, 'ctrl');
const literalShortcuts = new Set([...literals].map(norm));
const router = fs.readFileSync(path.join(ROOT, 'src/utils/router.ts'), 'utf8');
const permissionsSrc = fs.readFileSync(path.join(ROOT, 'src/utils/permissions.ts'), 'utf8');
// Chat 06: aceita ações com mais de um ponto (ex.: workspace.admin.view)
const permissionActions = new Set([...permissionsSrc.matchAll(/\|\s*'([a-zA-Z]+(?:\.[a-zA-Z]+)+)'/g)].map((m) => m[1]));

/* ------------------------------------------------------------------ checagem */
let features;
try {
  features = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
} catch (e) {
  console.error(`docs/features.json inválido: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(features)) {
  console.error('docs/features.json deve ser uma lista de funções (FEATURES_SPEC.md §3).');
  process.exit(1);
}

const ids = new Set();
for (const f of features) {
  const id = f?.id ?? '(sem id)';
  for (const key of ['id', 'title', 'summary', 'category', 'status', 'since', 'availability', 'where', 'how', 'readme']) {
    if (f[key] === undefined) err(id, `campo obrigatório ausente: ${key}`);
  }
  if (typeof f.id === 'string') {
    if (!/^FT-[A-Z]+-\d{3}$/.test(f.id)) err(id, 'id fora do padrão FT-CATEGORIA-000');
    if (ids.has(f.id)) err(id, 'id repetido');
    ids.add(f.id);
    if (PREFIX[f.category] && !f.id.startsWith(`FT-${PREFIX[f.category]}-`)) err(id, `prefixo do id não bate com a categoria ${f.category}`);
  }
  if (!CATEGORIES[f.category]) err(id, `categoria inválida: ${f.category}`);
  if (!STATUSES.includes(f.status)) err(id, `status inválido: ${f.status}`);
  if (!['local', 'server', 'both'].includes(f.availability)) err(id, `availability inválida: ${f.availability}`);
  if (typeof f.since?.chat !== 'string' || !f.since.chat) err(id, 'since.chat ausente');
  if (typeof f.summary === 'string' && f.summary.length > 220) warn(id, 'summary longo (> 220 caracteres): deve ser 1 frase');
  const minHow = f.status === 'planned' ? 1 : 2;
  if (!Array.isArray(f.how) || f.how.length < minHow || f.how.length > 6) err(id, `how deve ter de ${minHow} a 6 passos`);
  if (typeof f.readme?.highlight !== 'boolean') err(id, 'readme.highlight deve ser true/false');
  if (f.readme?.highlight && ['planned', 'deprecated', 'removed'].includes(f.status)) err(id, `função ${f.status} não pode entrar na vitrine do README`);
  if (f.readme?.highlight && !f.demo) warn(id, 'função da vitrine sem roteiro de captura (demo)');
  if (['deprecated', 'removed'].includes(f.status)) {
    if (!f.deprecation?.reason || !f.deprecation?.since) err(id, 'deprecated/removed exige deprecation.since e deprecation.reason');
    if (f.status === 'removed' && !f.deprecation?.removedIn) err(id, 'removed exige deprecation.removedIn');
  }

  // onde encontrar: rótulos literais no código
  const w = f.where ?? {};
  const labels = [...(w.menu ?? []), ...['dock', 'ruler', 'panelTab'].map((k) => w[k]).filter(Boolean)];
  for (const label of labels) {
    if (ANCHORS.has(label)) continue;
    if (!literals.has(label)) err(id, `rótulo "${label}" não encontrado no código (src/) nem no catálogo pt-BR (src/locales/pt-BR)`);
  }
  if (w.route) {
    const seg = w.route.replace(/^#\/?/, '').split(/[/?]/)[0];
    if (seg && !router.includes(`'${seg}'`)) err(id, `rota ${w.route} não existe em src/utils/router.ts`);
  }
  if (w.shortcut) {
    const options = [w.shortcut, ...w.shortcut.split(/\s+ou\s+/)];
    if (!options.some((s) => literalShortcuts.has(norm(s)))) warn(id, `atalho "${w.shortcut}" não aparece em nenhum rótulo da interface (conferir em useKeyboardShortcuts.ts)`);
  }
  for (const p of f.permissions ?? []) if (!permissionActions.has(p)) err(id, `permissão desconhecida: ${p} (src/utils/permissions.ts)`);
  // traduções do catálogo (I18N_SPEC §9): i18n.<código> = { title, summary, how[] } no idioma do código
  if (f.i18n !== undefined) {
    if (typeof f.i18n !== 'object' || Array.isArray(f.i18n)) err(id, 'i18n deve ser um objeto { "<código>": { title, summary, how } }');
    else for (const [code, tr] of Object.entries(f.i18n)) {
      if (code === 'pt-BR') err(id, 'i18n.pt-BR não existe: o pt-BR é o próprio title/summary/how');
      else if (!LOCALE_CODES.has(code)) err(id, `i18n.${code}: idioma sem catálogo em src/locales/`);
      if (typeof tr?.title !== 'string' || !tr.title.trim()) err(id, `i18n.${code}.title ausente`);
      if (typeof tr?.summary !== 'string' || !tr.summary.trim()) err(id, `i18n.${code}.summary ausente`);
      else if (tr.summary.length > 220) warn(id, `i18n.${code}.summary longo (> 220 caracteres)`);
      if (!Array.isArray(tr?.how) || tr.how.length !== (f.how?.length ?? 0)) err(id, `i18n.${code}.how deve ter os mesmos ${f.how?.length ?? 0} passos de how`);
    }
  }
  if (f.readme?.highlight && !f.i18n?.en) err(id, 'função da vitrine sem tradução i18n.en (README.en.md)');
  // Chat 09 · R5: ferramenta de quem desenvolve (some do app com a variável desligada) — nunca na vitrine nem na Ajuda
  if (f.devTool !== undefined) {
    if (typeof f.devTool?.env !== 'string' || !/^LUDRAW_[A-Z0-9_]+$/.test(f.devTool.env)) err(id, 'devTool.env deve ser o nome de uma variável LUDRAW_*');
    else if (!serverConfig.includes(`'${f.devTool.env}'`)) err(id, `devTool.env ${f.devTool.env} não é lida por server/src/config.ts`);
    if (f.readme?.highlight) err(id, 'ferramenta de desenvolvimento (devTool) não entra na vitrine do README');
  }
  if (f.demo?.screenshot && !fs.existsSync(path.join(ROOT, f.demo.screenshot))) err(id, `captura não encontrada: ${f.demo.screenshot}`);
}
for (const f of features) {
  for (const r of f.related ?? []) if (!ids.has(r)) err(f.id, `related aponta para id inexistente: ${r}`);
  if (f.deprecation?.replacedBy && !ids.has(f.deprecation.replacedBy)) err(f.id, `replacedBy inexistente: ${f.deprecation.replacedBy}`);
}

/* --------------------------------------------------------------- FEATURES.md */
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
function whereText(w = {}) {
  const parts = [];
  if (w.menu?.length) parts.push(w.menu.join(' → '));
  if (w.dock) parts.push(`Dock: ${w.dock}`);
  if (w.ruler) parts.push(`Barra do topo: ${w.ruler}`); // Chat 08.2: o campo `ruler` passou a indicar a barra do topo do Estúdio v2
  if (w.panelTab) parts.push(`Painel: aba ${w.panelTab}`);
  if (w.route) parts.push(`\`${w.route}\``);
  return parts.join(' · ') || '—';
}
function renderMarkdown(list, pendingTail) {
  const byCat = new Map(Object.keys(CATEGORIES).map((c) => [c, []]));
  for (const f of list) byCat.get(f.category)?.push(f);
  const count = (st) => list.filter((f) => f.status === st).length;
  const out = [];
  out.push('# FEATURES.md — Catálogo de Funções do LuDraw');
  out.push('');
  out.push('> **Gerado a partir de `docs/features.json`** (fonte da verdade) por `npm run docs:features`. Não edite as tabelas à mão: altere o JSON e regenere. `npm run audit:features` confere o catálogo contra o código. Esquema e regras: `ai-memory/FEATURES_SPEC.md`.');
  out.push('');
  out.push(`**${list.length} funções** — ${count('stable')} estáveis, ${count('beta') + count('experimental')} beta/experimentais, ${count('planned')} planejadas, ${count('deprecated')} descontinuadas, ${count('removed')} removidas. Todas funcionam **localmente** (sem servidor) nesta versão.`);
  out.push('');
  out.push('Convenções (Estúdio v2, Chat 08.2): **barra do topo** = Ficha (Mesa, nome do board → Ficha do board) e Roda (pessoas, Facilitar, Conversas, Apresentar, Compartilhar, Você); **Vista** = módulo no canto inferior esquerdo (Bússola, zoom, Encontrar, Exibir, Roteiro); **Tempo** = módulo no canto inferior direito (desfazer, refazer, Linha do tempo); **Dock** = barra de ferramentas na base; `\\` ou `Ctrl + /` reabre a última gaveta; **Cinta do objeto** = barra presa à seleção (identidade, chips de valor, Comentar · Bloqueio avançado · Bloquear · ⋯); "Clique direito…" = menu de contexto. No macOS, `Ctrl` = `⌘`.');
  out.push('');
  out.push('## Vitrine (README)');
  out.push('');
  out.push('| Prioridade | Função | Onde encontrar |');
  out.push('|---|---|---|');
  for (const f of list.filter((x) => x.readme?.highlight).sort((a, b) => (a.readme.priority ?? 99) - (b.readme.priority ?? 99))) {
    out.push(`| ${f.readme.priority ?? '—'} | [${esc(f.title)}](#${f.id.toLowerCase()}) | ${esc(whereText(f.where))} |`);
  }
  out.push('');
  for (const [cat, items] of byCat) {
    if (!items.length) continue;
    out.push(`## ${CATEGORIES[cat]}`);
    out.push('');
    out.push('| ID | Função | Status | Desde | Onde encontrar | Atalho |');
    out.push('|---|---|---|---|---|---|');
    for (const f of items) {
      out.push(`| \`${f.id}\` | ${esc(f.title)} | ${STATUS_LABEL[f.status] ?? f.status} | Chat ${esc(f.since.chat)} | ${esc(whereText(f.where))} | ${f.where?.shortcut ? `\`${esc(f.where.shortcut)}\`` : '—'} |`);
    }
    out.push('');
    for (const f of items) {
      out.push(`### ${f.id}`);
      out.push('');
      out.push(`**${f.title}** — ${f.summary}`);
      if (f.devTool) out.push('', `> Ferramenta de desenvolvimento: aparece só sem servidor ou com \`${f.devTool.env}\` ligada no servidor (a imagem Docker desliga).`);
      out.push('');
      out.push(f.status === 'planned' ? '**Situação:**' : '**Como usar:**');
      out.push('');
      f.how.forEach((step, i) => out.push(`${i + 1}. ${step}`));
      if (f.permissions?.length) out.push('', `**Permissões envolvidas:** ${f.permissions.map((p) => `\`${p}\``).join(', ')}`);
      if (f.demo) {
        out.push('', '<details><summary>Roteiro de captura</summary>', '');
        out.push(`- **Preparar:** ${f.demo.setup.join('; ')}`);
        out.push(`- **Passos:** ${f.demo.steps.join('; ')}`);
        out.push(`- **Texto alternativo:** ${f.demo.alt ?? '—'}${f.demo.theme ? ` · tema ${f.demo.theme === 'dark' ? 'escuro' : 'claro'}` : ''}`);
        if (f.demo.screenshot) out.push(`- **Captura:** \`${f.demo.screenshot}\``);
        out.push('', '</details>');
      }
      if (f.related?.length) out.push('', `Relacionadas: ${f.related.map((r) => `[${r}](#${r.toLowerCase()})`).join(', ')}`);
      if (f.docs) out.push('', `Mais detalhes: \`${f.docs}\``);
      out.push('');
    }
  }
  out.push(PENDING_MARK);
  out.push(pendingTail.trimEnd());
  return out.join('\n') + '\n';
}

const current = fs.existsSync(MD_PATH) ? fs.readFileSync(MD_PATH, 'utf8') : '';
const tail = current.includes(PENDING_MARK) ? current.slice(current.indexOf(PENDING_MARK) + PENDING_MARK.length).replace(/^\n/, '') : '## A confirmar\n\n_(nada pendente)_\n';
const expected = renderMarkdown(features, tail);

if (WRITE) {
  fs.writeFileSync(MD_PATH, expected);
  console.log(`docs/FEATURES.md regenerado (${features.length} funções).`);
} else if (current !== expected) {
  err('docs/FEATURES.md', 'desatualizado em relação ao docs/features.json — rode `npm run docs:features`');
}

/* ------------------------------------------------------------------ relatório */
const planned = features.filter((f) => f.status === 'planned').length;
console.log(`Catálogo de funções — ${features.length} funções (${planned} planejadas), ${errors.length} erro(s), ${warnings.length} aviso(s).`);
if (errors.length) console.log(`\nErros:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
if (warnings.length) console.log(`\nAvisos:\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
process.exit(errors.length ? 1 : 0);
