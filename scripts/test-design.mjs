#!/usr/bin/env node
/**
 * LuDraw — regras verificáveis do Design System, sem navegador (Chat 08.6 · B). `npm run test:design`.
 *
 * - Contraste (D-04, D-05, D-06, D-09, D-15): todos os pares de `CONTRAST_PAIRS` (src/utils/designTokens.ts) nos
 *   temas claro e escuro, lidos do `src/styles/tokens.css` REAL — texto ≥ 4,5:1, não-texto ≥ 3:1;
 * - hierarquia do texto: principal > secundário > terciário em cada fundo neutro;
 * - tokens novos do Chat 08.6 definidos nos dois temas; o anel de foco usa o token de cor sólido;
 * - guardas estáticas em src/components: nenhum hex fixo em classe de cor (D-15) — cor de interface vem de token
 *   e cor de conteúdo de constante de conteúdo — e nenhum texto abaixo de 11 px (D-14).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./lib/ts-hooks.mjs', import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => pathToFileURL(join(root, 'src', p)).href;
const { parseTokenCss, tokenValue, CONTRAST_PAIRS, MIN_RATIO, measurePair, textHierarchy } = await import(src('utils/designTokens.ts'));

let passed = 0;
const failures = [];
const expect = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
};

const tokens = parseTokenCss(readFileSync(join(root, 'src/styles/tokens.css'), 'utf8'));
expect('tokens.css: bloco claro lido', Object.keys(tokens.light).length > 40, true);
expect('tokens.css: bloco escuro redefine as superfícies', tokens.dark.panel !== tokens.light.panel, true);

/* ---------- tokens novos (Chat 08.6 · B) nos dois temas ---------- */
const declared = (block) => {
  const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = css.match(new RegExp(`${block.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))[1];
  return new Set([...body.matchAll(/--od-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
};
const lightDecl = declared(':root');
const darkDecl = declared('.dark');
for (const t of ['focus-color', 'input-border', 'favorite', 'on-selection', 'danger-on-inverse']) {
  expect(`token --od-${t} definido no claro e no escuro`, [lightDecl.has(t), darkDecl.has(t)], [true, true]);
}
for (const theme of ['light', 'dark']) {
  expect(`${theme}: o anel de foco começa pelo traço sólido de 2 px do token de foco`, /^0 0 0 2px var\(--od-focus-color\)/.test(tokens[theme]['focus-ring'] ?? ''), true);
}
/** Mede sem derrubar o roteiro: token ausente vira falha listada. */
const safe = (fn) => {
  try {
    return fn();
  } catch (err) {
    return { error: err.message };
  }
};

/* ---------- pares de contraste ---------- */
for (const theme of ['light', 'dark']) {
  for (const pair of CONTRAST_PAIRS) {
    const r = safe(() => measurePair(tokens[theme], pair));
    expect(`${theme === 'light' ? 'claro' : 'escuro'} — ${pair.fg} sobre ${pair.bg} ≥ ${MIN_RATIO[pair.kind]}:1`, r.error ?? (r.ok ? 'ok' : `${r.ratio.toFixed(2)}:1`), 'ok');
  }
  const hierarchy = safe(() => textHierarchy(tokens[theme]));
  if (hierarchy.error) expect(`${theme} — hierarquia do texto`, hierarchy.error, 'ok');
  for (const h of hierarchy.error ? [] : hierarchy) {
    expect(`${theme === 'light' ? 'claro' : 'escuro'} — hierarquia do texto em ${h.bg} (principal ${h.text.toFixed(1)} › secundário ${h.muted.toFixed(1)} › terciário ${h.subtle.toFixed(1)})`, h.ok, true);
  }
}
// os pares cobrem os tokens corrigidos nesta rodada
const covered = new Set(CONTRAST_PAIRS.flatMap((p) => [p.fg, p.bg]));
for (const t of ['text-subtle', 'focus-color', 'input-border', 'success', 'warning', 'favorite', 'on-selection', 'danger-on-inverse']) expect(`par de contraste cobre --od-${t}`, covered.has(t), true);
expect('tokenValue resolve var() (anel de foco claro)', safe(() => tokenValue(tokens.light, 'focus-ring').startsWith(`0 0 0 2px ${tokens.light['focus-color']}`)), true);

/* ---------- guardas estáticas ---------- */
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
};
walk(join(root, 'src/components'));
const rel = (p) => relative(root, p).replaceAll('\\', '/');
// D-14: nenhum texto de interface abaixo de 11 px (`text-2xs` é o menor tamanho do DS)
const tiny = [];
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) if (Number(m[1]) < 11) tiny.push(`${rel(f)}:${i + 1} ${m[0]}`);
  });
}
expect('D-14: nenhum texto de interface abaixo de 11 px', tiny, []);
// D-15: nenhuma cor hex fixa em classe nos componentes de interface. O Sistema visual (design-system/) fica de
// fora: lá os hex são AMOSTRAS de cor de conteúdo (post-its, paletas) exibidas de propósito.
const hexClass = [];
for (const f of files.filter((p) => !rel(p).startsWith('src/components/design-system/'))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/(?:^|[\s"'`:])((?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|outline|from|to|via|shadow|decoration|divide|placeholder|caret|accent)-\[#[0-9a-fA-F]{3,8}\])/g)) hexClass.push(`${rel(f)}:${i + 1} ${m[1]}`);
  });
}
expect('D-15: nenhum hex fixo em classe de cor nos componentes de interface', hexClass, []);

// D-07 (Chat 08.6 · C): o Estúdio v2 (Chat 08.2) tirou a Régua e o Painel lateral do board — nenhum texto de
// interface (pt-BR e en) pode mandar a pessoa até eles
const STALE = /Painel lateral|[Aa]ba [\p{L}]+ do Painel|\b[Oo] Painel\b|\b(do|no|ao) Painel\b|\bthe Panel\b|\bside [Pp]anel\b|\bR[ée]gua\b|\b[Rr]uler\b/u;
const stale = [];
for (const lang of ['pt-BR', 'en']) {
  const dir = join(root, 'src/locales', lang);
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    for (const [key, text] of Object.entries(JSON.parse(readFileSync(join(dir, name), 'utf8')))) {
      if (typeof text === 'string' && STALE.test(text)) stale.push(`${lang}/${name} ${key}: ${text.slice(0, 60)}`);
    }
  }
}
expect('D-07: nenhum texto de interface cita o Painel lateral ou a Régua (removidos no Estúdio v2)', stale, []);
// o passo "Volte quando quiser" do board de boas-vindas mostra a tecla que existe hoje
const welcome = readFileSync(join(root, 'src/utils/welcome.ts'), 'utf8');
expect('D-07: boas-vindas — passo final sem a tecla do antigo Painel (\\)', welcome.includes("keys: ['\\\\']"), false);

console.log(`Design System: ${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
