#!/usr/bin/env node
/**
 * LuDraw — auditoria de internacionalização (Chat 05.6 · Rodada B).
 *
 *   npm run audit:i18n          verifica (sai com código 1 se houver erro)
 *   npm run docs:languages      regenera docs/LANGUAGES.md (completude por idioma)
 *
 * Node puro, sem dependências. Verifica:
 *  1. chaves faltando ou sobrando em cada idioma em relação ao pt-BR (fonte);
 *  2. chaves do pt-BR que nenhum código usa (com prefixos dinâmicos declarados abaixo);
 *  3. chaves usadas no código que não existem no pt-BR;
 *  4. placeholders `{nome}` divergentes e marcação (<b>, <kbd>, <link>, <code>, <em>, <br/>) sem fechamento;
 *  5. formas de plural exigidas por idioma (`Intl.PluralRules(código).resolvedOptions().pluralCategories`,
 *     só as categorias alcançadas por contagens inteiras de 0 a 1000);
 *  6. textos fixos em português em `.ts`/`.tsx` fora dos catálogos (heurística + exceções em
 *     `scripts/audit-i18n-allow.json`, cada uma com motivo);
 *  7. `_meta.json` de cada idioma e `docs/LANGUAGES.md` em dia.
 *
 * Regras completas: docs/TRANSLATING.md e ai-memory/I18N_SPEC.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'src/locales');
const SOURCE = 'pt-BR';
const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* ------------------------------- Catálogos -------------------------------- */

const PLURAL = ['zero', 'one', 'two', 'few', 'many', 'other'];
const pluralBase = (k) => {
  for (const s of PLURAL) if (k.endsWith(`_${s}`)) return [k.slice(0, -(s.length + 1)), s];
  return [k, null];
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(`${path.relative(ROOT, file)}: JSON inválido (${e.message})`);
    return null;
  }
}

/** idioma → { meta, keys: Map<chaveCompleta, mensagem> } */
const locales = new Map();
for (const code of fs.readdirSync(LOCALES).filter((d) => fs.statSync(path.join(LOCALES, d)).isDirectory()).sort()) {
  const dir = path.join(LOCALES, code);
  const metaFile = path.join(dir, '_meta.json');
  const meta = fs.existsSync(metaFile) ? readJson(metaFile) : null;
  if (!meta) err(`src/locales/${code}: falta _meta.json`);
  else {
    for (const f of ['code', 'name', 'nativeName', 'dir', 'translators', 'status']) if (meta[f] === undefined) err(`src/locales/${code}/_meta.json: falta o campo "${f}"`);
    if (meta.code && meta.code !== code) err(`src/locales/${code}/_meta.json: "code" (${meta.code}) diferente do nome da pasta`);
    if (meta.dir && !['ltr', 'rtl'].includes(meta.dir)) err(`src/locales/${code}/_meta.json: "dir" deve ser "ltr" ou "rtl"`);
    try {
      new Intl.PluralRules(code);
    } catch {
      err(`src/locales/${code}: código de idioma inválido para Intl`);
    }
  }
  const keys = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const ns = file.replace(/\.json$/, '');
    const data = readJson(path.join(dir, file));
    if (!data) continue;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== 'string') err(`src/locales/${code}/${file}: "${k}" não é texto`);
      else keys.set(`${ns}.${k}`, v);
    }
  }
  locales.set(code, { meta: meta ?? { code, name: code, nativeName: code, status: 'draft', translators: [] }, keys });
}
const source = locales.get(SOURCE);
if (!source) {
  console.error(`Catálogo-fonte ${SOURCE} não encontrado em src/locales/`);
  process.exit(1);
}

/** chave lógica → { variantes: Map<sufixo|null, msg> } */
function logical(keys) {
  const out = new Map();
  for (const [k, v] of keys) {
    const [base, suffix] = pluralBase(k);
    if (!out.has(base)) out.set(base, new Map());
    out.get(base).set(suffix, v);
  }
  return out;
}
const srcLogical = logical(source.keys);

/* ---------------------------- Placeholders e marcação ---------------------------- */

const MARKUP = new Set(['b', 'kbd', 'link', 'code', 'em', 'br', 'span']);
/** `{nome}` (não conta `{{…}}`, sintaxe do diagrama) */
function placeholders(msg) {
  const out = new Set();
  for (const m of msg.matchAll(/(?<!\{)\{([A-Za-z0-9_]+)\}(?!\})/g)) out.add(m[1]);
  return out;
}
function checkMarkup(where, msg) {
  const stack = [];
  for (const m of msg.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\s*(\/?)>/g)) {
    const [, closing, tag, self] = m;
    if (!MARKUP.has(tag)) continue; // "<table>" num texto comum não é marcação
    if (self) continue;
    if (!closing) stack.push(tag);
    else if (stack[stack.length - 1] === tag) stack.pop();
    else return err(`${where}: marcação </${tag}> sem abertura correspondente`);
  }
  if (stack.length) err(`${where}: marcação <${stack[stack.length - 1]}> sem fechamento`);
}
const tags = (msg) =>
  [...msg.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\s*\/?>/g)]
    .map((m) => m[0].replace(/\s+/g, ''))
    .filter((t) => MARKUP.has(t.replace(/[</>]/g, '')))
    .sort()
    .join(' ');

/* ----------------------------- Plurais por idioma ----------------------------- */

const ZERO_IS_OTHER = new Set(['pt']); // mesma convenção de src/i18n/plural.ts
function requiredCategories(code) {
  const intl = code === 'qps' ? 'en' : code;
  const rules = new Intl.PluralRules(intl);
  const base = intl.toLowerCase().split('-')[0];
  const cats = new Set();
  for (let n = 0; n <= 1000; n++) cats.add(n === 0 && ZERO_IS_OTHER.has(base) ? 'other' : rules.select(n));
  return cats;
}

/* ------------------------------ Uso no código ------------------------------ */

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(ROOT, 'src'));
const namespaces = new Set([...source.keys.keys()].map((k) => k.split('.')[0]));
const keyRe = new RegExp(`['"\`](${[...namespaces].join('|')})\\.([A-Za-z0-9_.]+)(['"\`]|\\$\\{)`, 'g');
const used = new Set();
const usedPrefixes = new Set();
const usedAt = new Map();
/** Remove comentários de bloco e de linha inteira (exemplos em JSDoc não contam como uso). */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
for (const file of srcFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const m of text.matchAll(keyRe)) {
    const key = `${m[1]}.${m[2]}`;
    if (m[3] === '${') usedPrefixes.add(key);
    else {
      used.add(key);
      if (!usedAt.has(key)) usedAt.set(key, path.relative(ROOT, file));
    }
  }
}
/** chaves montadas com `${…}` no meio de outro trecho (ex.: `pollOpened${…}`): prefixo declarado aqui */
const DYNAMIC_PREFIXES = ['board.activity.pollOpened'];
for (const p of DYNAMIC_PREFIXES) usedPrefixes.add(p);
const isUsed = (k) => used.has(k) || [...usedPrefixes].some((p) => k.startsWith(p));

for (const k of srcLogical.keys()) if (!isUsed(k)) err(`chave sem uso no código: ${k}`);
// "usada e ausente" só vale em contexto de tradução (t(…), <Trans k=…>, { key: … }) — ações de
// permissão como 'board.edit' também começam por um namespace e não são chaves.
const callUsed = new Map();
const ctxRe = new RegExp(`(?:\\b(?:t|tDynamic|msg|rawMessage)\\(\\s*|\\bk=|\\bkey:\\s*)['"\`](${[...namespaces].join('|')})\\.([A-Za-z0-9_.]*[A-Za-z0-9_])['"\`]`, 'g');
for (const file of srcFiles) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const m of text.matchAll(ctxRe)) if (!callUsed.has(`${m[1]}.${m[2]}`)) callUsed.set(`${m[1]}.${m[2]}`, path.relative(ROOT, file));
}
for (const [k, at] of callUsed) {
  if (srcLogical.has(k)) continue;
  err(`chave usada no código e ausente do pt-BR: ${k} (${at})`);
}
for (const k of []) {
  if (srcLogical.has(k)) continue;
  if ([...srcLogical.keys()].some((s) => s.startsWith(`${k}.`))) continue; // prefixo de grupo (ex.: 'board.activity')
  err(`chave usada no código e ausente do pt-BR: ${k} (${usedAt.get(k)})`);
}

/* --------------------------- Comparação por idioma --------------------------- */

const stats = [];
for (const [code, loc] of locales) {
  const lg = logical(loc.keys);
  const official = loc.meta.status === 'source' || loc.meta.status === 'official';
  const req = requiredCategories(code);
  let translated = 0;
  const same = [];
  for (const [base, variants] of srcLogical) {
    const isPlural = [...variants.keys()].some((s) => s !== null);
    const mine = lg.get(base);
    if (!mine) {
      (official ? err : VERBOSE ? warn : () => {})(`${code}: falta a chave ${base}`);
      continue;
    }
    translated++;
    const srcPh = new Set([...variants.values()].flatMap((v) => [...placeholders(v)]));
    const srcTags = tags(variants.get('other') ?? variants.get(null) ?? '');
    if (isPlural) {
      for (const cat of req) if (!mine.has(cat)) err(`${code}: ${base} precisa da forma de plural _${cat}`);
      for (const s of mine.keys()) if (s === null) err(`${code}: ${base} é plural no pt-BR; use sufixos (_one, _other…)`);
    }
    for (const [suffix, msg] of mine) {
      const where = `${code}: ${base}${suffix ? `_${suffix}` : ''}`;
      checkMarkup(where, msg);
      const ph = placeholders(msg);
      for (const p of ph) if (!srcPh.has(p)) err(`${where}: placeholder {${p}} não existe no pt-BR`);
      if (!isPlural || suffix === 'other') for (const p of srcPh) if (p !== 'count' && !ph.has(p)) err(`${where}: falta o placeholder {${p}}`);
      if (tags(msg) !== srcTags && (!isPlural || suffix === 'other')) err(`${where}: marcação diferente do pt-BR (${srcTags || 'nenhuma'} → ${tags(msg) || 'nenhuma'})`);
      if (!msg.trim()) err(`${where}: mensagem vazia`);
    }
    // Idêntica à fonte: aviso (nomes de formato, siglas e termos do glossário costumam ser iguais).
    if (code !== SOURCE && /\p{L}{3}/u.test(variants.get('other') ?? variants.get(null) ?? '') && [...variants].every(([sfx, v]) => mine.get(sfx) === v)) same.push(base);
  }
  for (const base of lg.keys()) if (!srcLogical.has(base)) err(`${code}: chave a mais (não existe no pt-BR): ${base}`);
  if (same.length) {
    if (VERBOSE) for (const k of same) warn(`${code}: idêntica ao pt-BR: ${k}`);
    else warn(`${code}: ${same.length} mensagem(ns) idêntica(s) ao pt-BR (normal para siglas e formatos; veja com --verbose)`);
  }
  stats.push({ code, meta: loc.meta, translated, same: same.length, total: srcLogical.size });
}

/* ------------------------- Texto fixo em português ------------------------- */

const allowFile = path.join(ROOT, 'scripts/audit-i18n-allow.json');
const allow = fs.existsSync(allowFile) ? readJson(allowFile) : { ignoreDirs: [], entries: [] };
for (const e of allow.entries ?? []) if (!e.reason) err(`scripts/audit-i18n-allow.json: exceção sem motivo (${e.file})`);
const ignoredDir = (rel) => (allow.ignoreDirs ?? []).some((d) => rel.startsWith(d.path));
const allowed = (rel, text) => (allow.entries ?? []).some((e) => (e.file === rel || (e.file.endsWith('/*') && rel.startsWith(e.file.slice(0, -1)))) && new RegExp(e.pattern).test(text));

const PT_WORDS = /\b(não|você|para|com|uma|sem|seu|sua|já|está|são|também|então|aqui|isso|este|esta|pelo|pela|nos|nas|dos|das|ao|aos|ou|mais|como|quando|onde|depois|antes|todos|nenhum|clique|arraste|selecione|abrir|fechar|salvar|excluir|editar|criar|copiar|colar|desfazer|refazer|arquivo|quadro|coluna|linha|tabela|cartão|ideia|nota|forma|texto|imagem|página|planilha|modelo|cor|tamanho|bloqueado|desbloquear|exportar|importar)\b/i;
const ACCENT = /[áàâãéêíóôõúüç]/i;

/** Tokenizador mínimo: devolve strings, templates (partes fixas) e texto JSX, sem comentários. */
function textTokens(src, isTsx) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  let lastSignificant = '';
  const push = (text, ln, kind) => {
    if (text.trim()) out.push({ text, line: ln, kind });
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end < 0 ? n : end + 2);
      line += chunk.split('\n').length - 1;
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '/' && /[(,=:[!&|?{};]|^$|return$/.test(lastSignificant)) {
      // literal de regex
      i++;
      let inClass = false;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') i += 2;
        else if (src[i] === '[') (inClass = true), i++;
        else if (src[i] === ']') (inClass = false), i++;
        else if (src[i] === '/' && !inClass) break;
        else i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] ?? '')) i++;
      lastSignificant = 'regex';
      continue;
    }
    if (c === "'" || c === '"') {
      const start = line;
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') {
          s += src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      push(s, start, 'string');
      i = j + 1;
      lastSignificant = 'str';
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let s = '';
      const start = line;
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') {
          s += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === '\n') line++;
        if (depth === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{' && depth === 0) {
          depth = 1;
          s += ' ';
          j += 2;
          continue;
        }
        if (depth > 0) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          j++;
          continue;
        }
        s += src[j++];
      }
      push(s, start, 'template');
      i = j + 1;
      lastSignificant = 'str';
      continue;
    }
    if (isTsx && c === '>' && /[\w"'}/)\]]$/.test(lastSignificant)) {
      // possível texto JSX: até o próximo < ou { (sem avançar o cursor; strings seguem no fluxo normal)
      let j = i + 1;
      let s = '';
      while (j < n && !'<{};()='.includes(src[j]) && src[j] !== "'" && src[j] !== '"' && src[j] !== '`') s += src[j++];
      if (src[j] === '<' || src[j] === '{') push(s.replace(/\s+/g, ' '), line + ((s.match(/^\s*/)?.[0] ?? '').match(/\n/g) ?? []).length, 'jsx');
      lastSignificant = '>';
      i++;
      continue;
    }
    if (!/\s/.test(c)) lastSignificant = /[A-Za-z0-9_$]/.test(c) ? (lastSignificant.match(/[A-Za-z0-9_$]+$/) ? lastSignificant + c : c) : c;
    i++;
  }
  return out;
}

const hardcoded = [];
for (const file of srcFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('src/locales/') || ignoredDir(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const tok of textTokens(src, file.endsWith('.tsx'))) {
    const text = tok.text.trim();
    if (!/[A-Za-zÀ-ÿ]{2}/.test(text)) continue;
    if (/^[a-z]+(\.[A-Za-z0-9_]+)+$/.test(text) && namespaces.has(text.split('.')[0])) continue; // chave
    if (!(ACCENT.test(text) || (PT_WORDS.test(text) && /\s/.test(text)))) continue;
    if (allowed(rel, text)) continue;
    hardcoded.push(`${rel}:${tok.line} — ${JSON.stringify(text.length > 90 ? text.slice(0, 87) + '…' : text)}`);
  }
}
// Segunda heurística (qualquer idioma): rótulos literais em atributos de interface do JSX e em
// propriedades `label:`/`title:`/`placeholder:`/`description:`/`hint:` de objetos — mesmo sem
// acento ("E-mail", "outro"). Siglas e medidas puras (CSV, A4, ID, 16:9) passam.
const UI_ATTR = /\b(aria-label|title|placeholder|label|alt)="([^"{}]*)"|\b(label|title|placeholder|description|hint|ariaLabel)\s*:\s*'([^'\\]*)'/g;
const ACRONYM = /^[A-Z0-9][A-Z0-9 .,:;+×x%/()\-–—]*$/;
for (const file of srcFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('src/locales/') || ignoredDir(rel) || !/\.tsx?$/.test(rel)) continue;
  const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');
  for (const m of src.matchAll(UI_ATTR)) {
    const text = (m[2] ?? m[4] ?? '').trim();
    if (!/\p{L}{2}/u.test(text) || ACRONYM.test(text)) continue;
    if (/^[a-z]+(\.[A-Za-z0-9_]+)+$/.test(text) && namespaces.has(text.split('.')[0])) continue; // chave
    if (allowed(rel, text)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const entry = `${rel}:${line} — ${JSON.stringify(text)}`;
    if (!hardcoded.some((h) => h.startsWith(`${rel}:`) && h.endsWith(JSON.stringify(text)))) hardcoded.push(entry);
  }
}
for (const h of hardcoded) err(`texto fixo na interface fora dos catálogos: ${h}`);

/* ------------------------------ LANGUAGES.md ------------------------------ */

const STATUS = { source: 'fonte', official: 'oficial', community: 'comunidade', draft: 'rascunho' };
function languagesMd() {
  const rows = stats
    .sort((a, b) => (a.code === SOURCE ? -1 : b.code === SOURCE ? 1 : a.code.localeCompare(b.code)))
    .map(({ code, meta, translated, same, total }) => {
      const pct = total ? Math.floor((translated / total) * 1000) / 10 : 0;
      return `| \`${code}\` | ${meta.nativeName} | ${meta.name} | ${STATUS[meta.status] ?? meta.status} | ${pct.toFixed(1).replace('.', ',')} % | ${translated} / ${total} | ${code === SOURCE ? '—' : same} | ${(meta.translators ?? []).join(', ') || '—'} |`;
    });
  return `# Idiomas do LuDraw

> Arquivo gerado por \`npm run docs:languages\` (\`scripts/audit-i18n.mjs --write\`). Não edite à mão.
> Como traduzir: [TRANSLATING.md](TRANSLATING.md).

A interface tem **${srcLogical.size} mensagens** (chaves lógicas; formas de plural contam como uma). O
português do Brasil é a fonte; chaves que faltam num idioma aparecem no idioma de fallback
(\`fallback\` do \`_meta.json\`) e, por fim, em pt-BR.

| Código | Idioma | Nome em inglês | Situação | Completude | Mensagens | Iguais à fonte¹ | Tradutores |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

¹ Mensagens idênticas ao pt-BR — normal para siglas, formatos e termos do glossário (Kanban, PDF, Frame);
a lista sai com \`npm run audit:i18n -- --verbose\`.

Teste qualquer idioma com \`?lang=<código>\` na URL (ex.: \`?lang=en\`). O pseudo-idioma \`?lang=qps\`
mostra o inglês acentuado e mais longo, para achar texto fixo e estouro de layout.
`;
}
const mdPath = path.join(ROOT, 'docs/LANGUAGES.md');
const md = languagesMd();
if (WRITE) {
  fs.writeFileSync(mdPath, md);
  console.log('docs/LANGUAGES.md atualizado.');
} else if (!fs.existsSync(mdPath) || fs.readFileSync(mdPath, 'utf8') !== md) {
  err('docs/LANGUAGES.md desatualizado — rode `npm run docs:languages`');
}

/* --------------------------------- Saída --------------------------------- */

const summary = stats.map((s) => `${s.code} ${Math.floor((s.translated / s.total) * 1000) / 10}%`).join(' · ');
console.log(`Auditoria de i18n — ${srcLogical.size} mensagens, ${locales.size} idioma(s) (${summary}) · ${hardcoded.length} texto(s) fixo(s) · ${errors.length} erro(s), ${warnings.length} aviso(s).`);
if (errors.length) {
  console.log('Erros:');
  for (const e of errors.slice(0, 200)) console.log(`  - ${e}`);
  if (errors.length > 200) console.log(`  … e mais ${errors.length - 200}`);
}
if (warnings.length) {
  console.log('Avisos:');
  for (const w of warnings) console.log(`  - ${w}`);
}
process.exit(errors.length && !WRITE ? 1 : 0);
