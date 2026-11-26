#!/usr/bin/env node
/**
 * LuDraw — testes da plataforma de extensões (Chat 06.5 · Rodada A), sem dependências.
 *
 * Roda os módulos do app direto do TypeScript (type stripping do Node 22.6+) com os hooks de
 * `scripts/lib/ts-hooks.mjs` (imports sem extensão e JSON). `npm run test:extensions`.
 * Sai com código ≠ 0 se algum caso falhar.
 *
 * Cobre: manifest (allowlist, licença, Nível 2/idiomas recusados, prefixo reservado), temas (tokens,
 * injeção de CSS, contraste AA — e o próprio núcleo passa nas regras), paths, elementos compostos
 * vindos de boards, sanitizador de SVG, caminhos e limites do pacote (`..`, maiúsculas, código,
 * ZIP-bomb por taxa e por tamanho mentido), pinning e varredura do código-fonte.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./lib/ts-hooks.mjs', import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => pathToFileURL(join(root, 'src', p)).href;
const schema = await import(src('extensions/schema.ts'));
const { sanitizeSvg } = await import(src('extensions/svgSanitize.ts'));
const pkgMod = await import(src('extensions/package.ts'));
const { inspectPackage } = await import(src('extensions/loader.ts'));
const { crc32 } = await import(src('utils/zip.ts'));

let passed = 0;
const failures = [];
function expect(name, actual, expected) {
  if (Object.is(actual, expected)) passed++;
  else failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}
const keys = (result) => (result.ok ? [] : result.issues.map((i) => i.message.key));
const hasKey = (result, key) => keys(result).includes(key);

/* --------------------------------- Manifest --------------------------------- */
const FILES = { 'manifest.json': 'h1', LICENSE: 'h2' };
const base = (over = {}) => ({
  apiVersion: 1,
  id: 'dev.teste.formas',
  name: 'Formas de teste',
  version: '1.0.0',
  publisher: 'Teste',
  license: 'MIT',
  kind: 'pack',
  permissions: [],
  provenance: { originalWork: true, thirdParty: [] },
  contributes: { shapes: [{ id: 'seta', name: 'Seta', viewBox: { width: 100, height: 60 }, path: 'M0 30 L70 0 L70 20 L100 30 L70 40 L70 60 Z' }] },
  ...over,
});
const check = (m, ctx = {}) => schema.validateManifest(m, { fileHashes: FILES, source: 'file', ...ctx });

{
  const r = check(base());
  expect('manifest válido', r.ok, true);
  expect('path normalizado (só M/L/C/Q/Z)', r.ok && /^[MLCQZ0-9 .-]+$/.test(r.manifest.contributes.shapes[0].path), true);
}
expect('JSON inválido', schema.parseManifestText('{ nope').ok, false);
expect('objeto obrigatório', hasKey(check([]), 'extensions.schema.notObject'), true);
expect('campo obrigatório', hasKey(check(base({ name: undefined })), 'extensions.schema.required'), true);
expect('campo desconhecido', hasKey(check(base({ mainScript: 'x.js' })), 'extensions.schema.unknownField'), true);
expect('apiVersion', hasKey(check(base({ apiVersion: 2 })), 'extensions.schema.apiVersion'), true);
expect('id mal formado', hasKey(check(base({ id: 'Minha Extensão' })), 'extensions.schema.idFormat'), true);
expect('semver', hasKey(check(base({ version: '1.0' })), 'extensions.schema.versionFormat'), true);
expect('licença GPL recusada', hasKey(check(base({ license: 'GPL-3.0-only' })), 'extensions.schema.licenseNotAllowed'), true);
expect('licença LGPL exige aprovação', hasKey(check(base({ license: 'LGPL-2.1-only' })), 'extensions.schema.licenseNeedsApproval'), true);
expect('licença de terceiros GPL recusada', hasKey(check(base({ provenance: { originalWork: false, thirdParty: [{ name: 'x', license: 'AGPL-3.0' }] } })), 'extensions.schema.licenseNotAllowed'), true);
expect('sem arquivo LICENSE', hasKey(check(base(), { fileHashes: { 'manifest.json': 'h' } }), 'extensions.schema.licenseFileMissing'), true);
expect('sem proveniência', hasKey(check(base({ provenance: undefined })), 'extensions.schema.required'), true);
expect('formato proprietário recusado', hasKey(check(base({ provenance: { originalWork: true, thirdParty: [], proprietaryFormatsRead: ['x'] } })), 'extensions.schema.proprietaryFormats'), true);
expect('pacote declarativo com main.js recusado', hasKey(check(base(), { fileHashes: { ...FILES, 'main.js': 'h3' } }), 'extensions.schema.codeInPack'), true);
expect('permissões em pacote recusadas', hasKey(check(base({ permissions: ['board.read'] })), 'extensions.schema.permissionsNotAllowed'), true);
expect('main em pacote recusado', hasKey(check(base({ main: 'main.js' })), 'extensions.schema.fieldNotAllowedInPack'), true);
expect('commands recusado', hasKey(check(base({ contributes: { commands: [{ id: 'a', title: 'b' }] } })), 'extensions.schema.contributionNotSupported'), true);
expect('locales recusado com mensagem clara', hasKey(check(base({ contributes: { locales: [] } })), 'extensions.schema.localesNotSupported'), true);
expect('contributes vazio', hasKey(check(base({ contributes: {} })), 'extensions.schema.noContributions'), true);
expect('id dev.ludraw.* vindo de arquivo', hasKey(check(base({ id: 'dev.ludraw.falsa' })), 'extensions.schema.idReserved'), true);
expect('id dev.ludraw.* vindo de pasta', hasKey(check(base({ id: 'dev.ludraw.falsa' }), { source: 'folder' }), 'extensions.schema.idReserved'), true);
expect('id dev.ludraw.* embutida', check(base({ id: 'dev.ludraw.formas' }), { source: 'builtin' }).ok, true);
expect('integrity confere', check(base({ integrity: { files: { LICENSE: 'h2' } } })).ok, true);
expect('integrity diverge', hasKey(check(base({ integrity: { files: { LICENSE: 'zz' } } })), 'extensions.schema.integrityMismatch'), true);
expect('homepage fora do github recusada', hasKey(check(base({ homepage: 'https://exemplo.test' })), 'extensions.schema.format'), true);
expect('ids repetidos', hasKey(check(base({ contributes: { shapes: [base().contributes.shapes[0], base().contributes.shapes[0]] } })), 'extensions.schema.duplicateId'), true);

/* ---------------------------------- Paths ---------------------------------- */
const shapeWith = (path, vb = { width: 100, height: 100 }) => check(base({ contributes: { shapes: [{ id: 's', name: 'S', viewBox: vb, path }] } }));
expect('path inválido', hasKey(shapeWith('M 0 0 L foo'), 'extensions.schema.pathSyntax'), true);
expect('path sem M inicial', hasKey(shapeWith('L 0 0 L 10 10'), 'extensions.schema.pathSyntax'), true);
expect('path fora da caixa', hasKey(shapeWith('M 0 0 L 300 0 L 300 50 Z'), 'extensions.schema.pathOutOfBox'), true);
{
  const r = shapeWith('M0 50 A50 50 0 0 1 100 50 Z');
  expect('arco normalizado em curvas', r.ok && !r.manifest.contributes.shapes[0].path.includes('A') && r.manifest.contributes.shapes[0].path.includes('C'), true);
}
expect('customPath normalizado válido', schema.validateCustomPath('M 0 0 L 10 10 C 1 2 3 4 5 6 Q 1 2 3 4 Z'), true);
expect('customPath com arco recusado', schema.validateCustomPath('M 0 0 A 1 1 0 0 1 2 2'), false);
expect('customPath com aridade errada', schema.validateCustomPath('M 0 0 L 10'), false);
expect('customPath com script', schema.validateCustomPath('M 0 0 L 1 1 javascript:alert(1)'), false);
expect('customPath gigante', schema.validateCustomPath('M 0 0' + ' L 1 1'.repeat(60_000)), false);
expect('customPath vazio', schema.validateCustomPath(''), false);
expect('customPath não-texto', schema.validateCustomPath({}), false);

/* ---------------------------------- Temas ---------------------------------- */
// Os valores do próprio núcleo (tokens.css) precisam passar nas mesmas regras (senão a regra é impossível)
const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (selector) => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(/--od-([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};
const allowed = [...schema.THEME_COLOR_TOKENS, ...schema.THEME_SHADOW_TOKENS, ...schema.THEME_RADIUS_TOKENS];
const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => allowed.includes(k)));
const coreLight = pick(block(':root'));
const coreDark = pick({ ...coreLight, ...block('.dark') });
const themeManifest = (light, dark = coreDark) => base({ contributes: { themes: [{ id: 'tema', name: 'Tema', light, dark }] } });
{
  const r = check(themeManifest(coreLight));
  expect('tokens do núcleo passam nas regras do tema', r.ok, true);
  if (!r.ok) console.log('   problemas:', r.issues.map((i) => `${i.path} ${i.message.key} ${JSON.stringify(i.message.params ?? {})}`).join(' | '));
}
for (const mode of [coreLight, coreDark]) for (const c of schema.themeContrast(mode)) expect(`contraste do núcleo ${c.fg}/${c.bg}`, c.ok, true);
expect('token fora da allowlist', hasKey(check(themeManifest({ ...coreLight, 'brand-500': '#000000' })), 'extensions.schema.themeToken'), true);
expect('token focus-ring recusado', hasKey(check(themeManifest({ ...coreLight, 'focus-ring': '0 0 0 3px #000' })), 'extensions.schema.themeToken'), true);
expect('injeção de CSS (red;}body{display:none)', hasKey(check(themeManifest({ ...coreLight, panel: 'red;}body{display:none' })), 'extensions.schema.cssInjection'), true);
expect('injeção com url()', hasKey(check(themeManifest({ ...coreLight, 'shadow-panel': '0 0 4px url(https://x)' })), 'extensions.schema.cssInjection'), true);
expect('injeção com @import', hasKey(check(themeManifest({ ...coreLight, text: '@import "x"' })), 'extensions.schema.cssInjection'), true);
expect('injeção com expression', hasKey(check(themeManifest({ ...coreLight, text: 'expression(alert(1))' })), 'extensions.schema.cssInjection'), true);
expect('injeção com barra invertida', hasKey(check(themeManifest({ ...coreLight, text: '\\66 ff' })), 'extensions.schema.cssInjection'), true);
expect('cor por nome recusada', hasKey(check(themeManifest({ ...coreLight, panel: 'red' })), 'extensions.schema.color'), true);
expect('contraste baixo recusado', hasKey(check(themeManifest({ ...coreLight, text: '#cfcfcf' })), 'extensions.schema.contrast'), true);
expect('painel translúcido recusado', hasKey(check(themeManifest({ ...coreLight, panel: 'rgba(255,255,255,0.5)' })), 'extensions.schema.themeOpaque'), true);
expect('aviso transparente recusado', hasKey(check(themeManifest({ ...coreLight, 'warning-soft': 'rgba(255,200,0,0.01)' })), 'extensions.schema.themeSoftAlpha'), true);
{
  const { ['danger-soft']: _omit, ...withoutDangerSoft } = coreLight;
  expect('token obrigatório ausente', hasKey(check(themeManifest(withoutDangerSoft)), 'extensions.schema.themeRequired'), true);
}
expect('sombra none recusada', hasKey(check(themeManifest({ ...coreLight, 'shadow-panel': 'none' })), 'extensions.schema.shadow'), true);
expect('raio inválido', hasKey(check(themeManifest({ ...coreLight, 'radius-md': '8em' })), 'extensions.schema.radius'), true);
expect('modo escuro obrigatório', hasKey(check(base({ contributes: { themes: [{ id: 't', name: 'T', light: coreLight }] } })), 'extensions.schema.required'), true);
expect('parseColor rgb', JSON.stringify(schema.parseColor('rgb(1, 2, 3)')), JSON.stringify({ r: 1, g: 2, b: 3, a: 1 }));
expect('parseColor hsl', schema.parseColor('hsl(120, 100%, 25%)')?.g, 128);
expect('parseColor recusa var()', schema.parseColor('var(--x)'), null);

/* -------------------------- Modelos, paletas, stickers -------------------------- */
const tpl = (elements, extra = {}) => check(base({ contributes: { templates: [{ id: 't', name: 'T', category: 'planning', elements, ...extra }] } }));
expect('modelo válido', tpl([{ type: 'frame', ref: 'f', x: 0, y: 0, width: 400, height: 300, title: 'Quadro', lock: 'protected', background: true }, { type: 'sticky', x: 10, y: 10, width: 100, height: 100, text: '{{oi}}' }], { strings: { 'pt-BR': { oi: 'Olá' }, en: { oi: 'Hi' } } }).ok, true);
expect('modelo com chave inexistente', hasKey(tpl([{ type: 'sticky', x: 0, y: 0, width: 10, height: 10, text: '{{nada}}' }]), 'extensions.schema.stringKey'), true);
expect('conector com ref inexistente', hasKey(tpl([{ type: 'connector', x: 0, y: 0, width: 0, height: 0, from: { ref: 'a' }, to: { x: 1, y: 1 } }]), 'extensions.schema.unknownRef'), true);
expect('tipo não suportado em modelo', hasKey(tpl([{ type: 'image', x: 0, y: 0, width: 10, height: 10 }]), 'extensions.schema.elementType'), true);
expect('forma de extensão inexistente', hasKey(tpl([{ type: 'shape', shapeRef: 'nada', x: 0, y: 0, width: 10, height: 10 }]), 'extensions.schema.unknownShape'), true);
expect('composto inexistente', hasKey(tpl([{ type: 'composite', typeId: 'nada', x: 0, y: 0, width: 10, height: 10 }]), 'extensions.schema.unknownTypeId'), true);
expect('categoria inválida', hasKey(check(base({ contributes: { templates: [{ id: 't', name: 'T', category: 'x', elements: [{ type: 'sticky', x: 0, y: 0, width: 1, height: 1 }] }] } })), 'extensions.schema.choice'), true);
expect('resolveString idioma', schema.resolveString('{{oi}}', { 'pt-BR': { oi: 'Olá' }, en: { oi: 'Hi' } }, 'en-US'), 'Hi');
expect('resolveString texto puro', schema.resolveString('Olá {{oi}}', { 'pt-BR': { oi: 'x' } }, 'pt-BR'), 'Olá {{oi}}');
expect('paleta com cor inválida', hasKey(check(base({ contributes: { palettes: [{ id: 'p', name: 'P', target: 'fill', colors: [{ hex: 'red' }] }] } })), 'extensions.schema.hexColor'), true);
expect('paleta válida', check(base({ contributes: { palettes: [{ id: 'p', name: 'P', target: 'sticky', colors: [{ hex: '#AABBCC', name: 'Azul' }] }] } })).ok, true);
expect('sticker emoji válido', check(base({ contributes: { stickers: [{ id: 's', name: 'S', items: [{ id: 'a', emoji: '🚀' }] }] } })).ok, true);
expect('sticker emoji inválido', hasKey(check(base({ contributes: { stickers: [{ id: 's', name: 'S', items: [{ id: 'a', emoji: 'abc' }] }] } })), 'extensions.schema.emoji'), true);
expect('sticker sem arquivo', hasKey(check(base({ contributes: { stickers: [{ id: 's', name: 'S', items: [{ id: 'a', file: 'assets/a.svg' }] }] } })), 'extensions.schema.assetMissing'), true);
expect('sticker fora de assets/', hasKey(check(base({ contributes: { stickers: [{ id: 's', name: 'S', items: [{ id: 'a', file: 'a.svg' }] }] } })), 'extensions.schema.assetType'), true);

/* ------------------------------- Elemento composto ------------------------------- */
const goodComposite = {
  id: 'c1', type: 'composite', x: 0, y: 0, width: 240, height: 140, rotation: 0, zIndex: 0,
  typeRef: { extensionId: 'dev.ludraw.modelos-scrum', typeId: 'historia' }, typeName: 'Cartão', text: 'Como usuário…', fields: { points: '3' },
  parts: [
    { kind: 'rect', x: 0, y: 0, w: 1, h: 1, radius: 8, fill: '#ffffff', stroke: '#cccccc', strokeWidth: 1 },
    { kind: 'text', x: 0.05, y: 0.05, w: 0.7, h: 0.5, slot: 'main', fontSize: 14 },
    { kind: 'badge', x: 0.8, y: 0.05, w: 0.15, h: 0.2, slot: 'points', text: '3', fontSize: 12, fill: '#194b32', color: '#ffffff' },
    { kind: 'path', x: 0, y: 0.8, w: 1, h: 0.2, d: 'M 0 0 L 100 0', stroke: '#999999', strokeWidth: 1 },
  ],
};
const withPart = (part) => ({ ...goodComposite, parts: [goodComposite.parts[0], part] });
expect('composto válido', schema.validateCompositeElement(goodComposite), true);
const malformed = {
  'sem peças': { ...goodComposite, parts: undefined },
  'peças vazias': { ...goodComposite, parts: [] },
  'peça desconhecida': withPart({ kind: 'script', x: 0, y: 0, w: 1, h: 1 }),
  'campo extra na peça': withPart({ kind: 'rect', x: 0, y: 0, w: 1, h: 1, onclick: 'x' }),
  'cor com url()': withPart({ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 'url(#x)' }),
  'path não normalizado': withPart({ kind: 'path', x: 0, y: 0, w: 1, h: 1, d: 'M0 0 A 1 1 0 0 1 5 5' }),
  'coordenada fora de 0–1': withPart({ kind: 'rect', x: 5, y: 0, w: 1, h: 1 }),
  'NaN': { ...goodComposite, width: Number.NaN },
  'texto gigante': { ...goodComposite, text: 'x'.repeat(20_000) },
  'peças demais': { ...goodComposite, parts: Array.from({ length: 30 }, () => goodComposite.parts[0]) },
  'dois main': { ...goodComposite, parts: [goodComposite.parts[1], goodComposite.parts[1]] },
  'sem typeRef': { ...goodComposite, typeRef: undefined },
  'campos inválidos': { ...goodComposite, fields: { 'Nome Inválido': 3 } },
  'tipo errado': { ...goodComposite, type: 'sticky' },
  'não-objeto': 'composite',
};
for (const [name, el] of Object.entries(malformed)) expect(`composto malformado · ${name}`, schema.validateCompositeElement(el), false);
{
  // board com elementos misturados: só os compostos válidos passam (o resto é ignorado sem quebrar)
  const board = [goodComposite, ...Object.values(malformed), { ...goodComposite, id: 'c2' }];
  expect('board com compostos malformados', board.filter((e) => schema.validateCompositeElement(e)).length, 2);
}
expect('tipo composto no manifest', check(base({ contributes: { elementTypes: [{ id: 'cartao', name: 'Cartão', defaultSize: { width: 240, height: 140 }, parts: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#fff' }, { kind: 'text', x: 0, y: 0, w: 1, h: 1, slot: 'main', fontSize: 14, text: '{{t}}' }], strings: { 'pt-BR': { t: 'História' } } }] } })).ok, true);

/* ---------------------------------- SVG ---------------------------------- */
const svgOk = sanitizeSvg('<?xml version="1.0"?><svg viewBox="0 0 10 10" xmlns:sodipodi="x" sodipodi:docname="a"><metadata><x/></metadata><g fill="#f00"><path d="M0 0L10 10"/></g><title>Oi &amp; tchau</title></svg>');
expect('SVG válido', svgOk.ok, true);
expect('SVG reconstruído com xmlns', svgOk.ok && svgOk.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'), true);
expect('SVG sem metadados', svgOk.ok && !svgOk.svg.includes('metadata') && !svgOk.svg.includes('sodipodi'), true);
const svgIssue = (s) => {
  const r = sanitizeSvg(s);
  return r.ok ? 'ok' : r.issue;
};
expect('SVG com onload', svgIssue('<svg viewBox="0 0 1 1" onload="alert(1)"></svg>'), 'forbiddenAttribute');
expect('SVG com ONLOAD maiúsculo', svgIssue('<svg viewBox="0 0 1 1"><rect ONLOAD="x" /></svg>'), 'forbiddenAttribute');
expect('SVG com script', svgIssue('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'), 'forbiddenElement');
expect('SVG com script dentro de metadata', svgIssue('<svg viewBox="0 0 1 1"><metadata><script>x</script></metadata></svg>'), 'forbiddenElement');
expect('SVG com <style>', svgIssue('<svg viewBox="0 0 1 1"><style>*{}</style></svg>'), 'forbiddenElement');
expect('SVG com atributo style', svgIssue('<svg viewBox="0 0 1 1"><rect style="fill:red"/></svg>'), 'forbiddenAttribute');
expect('SVG com <use>', svgIssue('<svg viewBox="0 0 1 1"><use href="#a"/></svg>'), 'forbiddenElement');
expect('SVG com <image>', svgIssue('<svg viewBox="0 0 1 1"><image href="x.png"/></svg>'), 'forbiddenElement');
expect('SVG com <a>', svgIssue('<svg viewBox="0 0 1 1"><a><rect/></a></svg>'), 'forbiddenElement');
expect('SVG com foreignObject', svgIssue('<svg viewBox="0 0 1 1"><foreignObject/></svg>'), 'forbiddenElement');
expect('SVG com xlink:href', svgIssue('<svg viewBox="0 0 1 1"><rect xlink:href="#a"/></svg>'), 'forbiddenAttribute');
expect('SVG com url() em fill', svgIssue('<svg viewBox="0 0 1 1"><rect fill="url(#g)"/></svg>'), 'forbiddenValue');
expect('SVG com data: interno', svgIssue('<svg viewBox="0 0 1 1"><rect d="data:text/html,x"/></svg>'), 'forbiddenValue');
expect('SVG com DOCTYPE', svgIssue('<!DOCTYPE svg [<!ENTITY a "b">]><svg viewBox="0 0 1 1"/>'), 'forbiddenElement');
expect('SVG com CDATA', svgIssue('<svg viewBox="0 0 1 1"><![CDATA[x]]></svg>'), 'forbiddenElement');
expect('SVG com entidade desconhecida', svgIssue('<svg viewBox="0 0 1 1"><title>&xxe;</title></svg>'), 'syntax');
expect('SVG com atributo sem aspas', svgIssue('<svg viewBox=x></svg>'), 'syntax');
expect('SVG sem tamanho', svgIssue('<svg><rect/></svg>'), 'noSize');
expect('não é SVG', svgIssue('<html></html>'), 'forbiddenElement');
expect('SVG com tag aberta', svgIssue('<svg viewBox="0 0 1 1"><g>'), 'syntax');
expect('SVG grande demais', svgIssue(`<svg viewBox="0 0 1 1"><title>${'x'.repeat(70_000)}</title></svg>`), 'tooLarge');

/* ------------------------------ Caminhos do pacote ------------------------------ */
const pathKey = (names) => {
  const r = pkgMod.checkPackagePaths(names);
  return r.ok ? 'ok' : r.error.key;
};
expect('pacote válido', pathKey(['manifest.json', 'LICENSE', 'assets/a.svg']), 'ok');
expect('pasta raiz comum removida', pathKey(['minha/manifest.json', 'minha/LICENSE']), 'ok');
expect('lixo do sistema ignorado', pathKey(['manifest.json', 'LICENSE', '__MACOSX/._x', '.DS_Store']), 'ok');
expect('../ no caminho', pathKey(['manifest.json', '../evil.json']), 'extensions.package.unsafePath');
expect('../ no meio', pathKey(['manifest.json', 'assets/../../x.svg']), 'extensions.package.unsafePath');
expect('caminho absoluto', pathKey(['manifest.json', '/etc/passwd']), 'extensions.package.unsafePath');
expect('barra invertida', pathKey(['manifest.json', 'assets\\a.svg']), 'extensions.package.unsafePath');
expect('letra de unidade', pathKey(['manifest.json', 'C:/a.svg']), 'extensions.package.unsafePath');
expect('nomes repetidos por maiúscula', pathKey(['manifest.json', 'assets/Icone.svg', 'assets/icone.svg']), 'extensions.package.duplicateName');
expect('main.js aceito no caminho (o validador decide)', pathKey(['manifest.json', 'main.js']), 'ok');
expect('ui/painel.html aceito no caminho', pathKey(['manifest.json', 'ui/painel.html']), 'ok');
expect('código fora de main.js/ui', pathKey(['manifest.json', 'assets/x.js']), 'extensions.package.scriptFile');
expect('js em subpasta da ui', pathKey(['manifest.json', 'ui/x.js']), 'extensions.package.scriptFile');
expect('html no pacote', pathKey(['manifest.json', 'assets/x.html']), 'extensions.package.scriptFile');
expect('arquivo fora da lista', pathKey(['manifest.json', 'outro.txt']), 'extensions.package.fileNotAllowed');
expect('arquivo oculto em assets', pathKey(['manifest.json', 'assets/.x.svg']), 'extensions.package.fileNotAllowed');
expect('sem manifest', pathKey(['LICENSE', 'assets/a.svg']), 'extensions.package.manifestMissing');
expect('pacote vazio', pathKey([]), 'extensions.package.empty');

/* ------------------------------------ ZIP ------------------------------------ */
const enc = (s) => new TextEncoder().encode(s);
async function deflateRaw(bytes) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return new Uint8Array(out);
}
/** Escritor ZIP mínimo para os testes (métodos 0 e 8; `declaredSize` permite mentir o tamanho). */
async function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.name);
    const data = typeof e.data === 'string' ? enc(e.data) : e.data;
    const method = e.method ?? 8;
    const comp = method === 8 ? await deflateRaw(data) : data;
    const crc = crc32(data);
    const size = e.declaredSize ?? data.length;
    const local = new Uint8Array(30 + name.length + comp.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, comp.length, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true);
    local.set(name, 30); local.set(comp, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, comp.length, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}
const MANIFEST = JSON.stringify(base());
const zipResult = async (entries) => pkgMod.readZipPackage(await makeZip(entries));
{
  const r = await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'LICENSE', data: 'MIT License' }]);
  expect('ZIP válido', r.ok, true);
  expect('ZIP: hash de cada arquivo', r.ok && /^[0-9a-f]{64}$/.test(r.pkg.fileHashes['manifest.json']), true);
  expect('ZIP: hash do pacote', r.ok && /^[0-9a-f]{64}$/.test(r.pkg.packageHash), true);
  if (r.ok) {
    const insp = inspectPackage(r.pkg, 'file');
    expect('ZIP → manifest validado', insp.ok, true);
    const tampered = { ...r.pkg.files, LICENSE: enc('MIT License!') };
    expect('pinning: arquivo intacto confere', (await pkgMod.verifyFiles(r.pkg.files, r.pkg.fileHashes)).ok, true);
    expect('pinning: 1 byte alterado detectado', (await pkgMod.verifyFiles(tampered, r.pkg.fileHashes)).ok, false);
    expect('pinning: arquivo a mais detectado', (await pkgMod.verifyFiles({ ...r.pkg.files, 'assets/x.svg': enc('x') }, r.pkg.fileHashes)).ok, false);
    expect('pinning: arquivo faltando detectado', (await pkgMod.verifyFiles({ 'manifest.json': r.pkg.files['manifest.json'] }, r.pkg.fileHashes)).ok, false);
  }
}
{
  const r = await zipResult([{ name: 'manifest.json', data: JSON.stringify(base({ id: 'dev.ludraw.falsa' })) }, { name: 'LICENSE', data: 'MIT' }]);
  const insp = r.ok ? inspectPackage(r.pkg, 'file') : { ok: false, issues: [] };
  expect('ZIP com id dev.ludraw.* recusado', !insp.ok && insp.issues.some((i) => i.message.key === 'extensions.schema.idReserved'), true);
}
expect('ZIP com ../', (await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: '../evil.json', data: '{}' }])).error?.key, 'extensions.package.unsafePath');
expect('ZIP com nomes repetidos por maiúscula', (await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'LICENSE', data: 'a' }, { name: 'assets/A.svg', data: '<svg/>' }, { name: 'assets/a.svg', data: '<svg/>' }])).error?.key, 'extensions.package.duplicateName');
{
  const r = await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'LICENSE', data: 'MIT' }, { name: 'main.js', data: 'x' }]);
  const insp = r.ok ? inspectPackage(r.pkg, 'file') : { ok: false, issues: [] };
  expect('ZIP declarativo com main.js recusado', !insp.ok && (insp.issues ?? []).some((i) => i.message.key === 'extensions.schema.codeInPack'), true);
}
expect('ZIP com código fora do lugar', (await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'lib.js', data: 'x' }])).error?.key, 'extensions.package.scriptFile');
{
  // bomba: 3 MB de zeros comprimem ~1000× — barrada pela taxa durante o fluxo
  const r = await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'LICENSE', data: 'MIT' }, { name: 'assets/bomba.json', data: new Uint8Array(3 * 1024 * 1024) }]);
  expect('ZIP-bomb pela taxa de compressão', r.error?.key, 'extensions.package.zipError');
  expect('ZIP-bomb cita o arquivo', String(r.error?.params?.detail ?? '').includes('assets/bomba.json'), true);
}
{
  // tamanho declarado MENTIDO (100 bytes) — o limite vale sobre os bytes reais produzidos
  const r = await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'LICENSE', data: 'MIT' }, { name: 'assets/mentira.json', data: new Uint8Array(3 * 1024 * 1024), declaredSize: 100 }]);
  expect('ZIP com tamanho declarado mentido', r.error?.key, 'extensions.package.zipError');
}
{
  // arquivo grande e pouco compressível (2,5 MB armazenado): passa do limite por arquivo
  const noise = new Uint8Array(2.5 * 1024 * 1024);
  let x = 1;
  for (let i = 0; i < noise.length; i++) noise[i] = (x = (x * 1103515245 + 12345) >>> 0) >>> 24;
  const r = await zipResult([{ name: 'manifest.json', data: MANIFEST }, { name: 'LICENSE', data: 'MIT' }, { name: 'assets/grande.json', data: noise, method: 0 }]);
  expect('ZIP com arquivo grande demais', r.error?.key, 'extensions.package.zipError');
}
expect('não é ZIP', (await pkgMod.readZipPackage(enc('olá mundo, não sou zip'))).error?.key, 'extensions.package.notZip');
{
  const r = await pkgMod.readFolderPackage([
    { path: 'pasta/manifest.json', bytes: enc(MANIFEST) },
    { path: 'pasta/LICENSE', bytes: enc('MIT') },
  ]);
  expect('pasta válida', r.ok, true);
  expect('pasta: hash da listagem', r.ok && r.pkg.packageHash === (await pkgMod.listingHash(r.pkg.fileHashes)), true);
}

/* ---------------------- Extensões oficiais embutidas (E01–E03) ---------------------- */
{
  const builtinDir = join(root, 'src/extensions/builtin');
  const folders = readdirSync(builtinDir).filter((f) => statSync(join(builtinDir, f)).isDirectory());
  expect('5 extensões embutidas', folders.sort().join(','), 'contador-palavras,formas-fluxograma,formatos-drawio,modelos-scrum,tema-grafite');
  for (const folder of folders) {
    const files = {};
    for (const name of readdirSync(join(builtinDir, folder))) {
      const full = join(builtinDir, folder, name);
      if (statSync(full).isDirectory()) for (const sub of readdirSync(full)) files[`${name}/${sub}`] = new Uint8Array(readFileSync(join(full, sub)));
      else files[name] = new Uint8Array(readFileSync(full));
    }
    const fileHashes = {};
    for (const [p, bytes] of Object.entries(files)) fileHashes[p] = await (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    const insp = inspectPackage({ files, fileHashes }, 'builtin');
    expect(`embutida válida · ${folder}`, insp.ok, true);
    if (!insp.ok) console.log('   problemas:', (insp.issues ?? []).map((i) => `${i.path} ${i.message.key} ${JSON.stringify(i.message.params ?? {})}`).join(' | '), insp.error);
    if (!insp.ok) continue;
    const m = insp.manifest;
    expect(`embutida · ${folder} · prefixo reservado`, m.id.startsWith('dev.ludraw.'), true);
    expect(`embutida · ${folder} · MIT e obra própria`, m.license === 'MIT' && m.provenance.originalWork === true && m.provenance.thirdParty.length === 0, true);
    expect(`embutida · ${folder} · nome em inglês`, typeof m.i18n?.en?.name === 'string', true);
    expect(`embutida · ${folder} · recusada se vier de arquivo`, inspectPackage({ files, fileHashes }, 'file').ok, false);
    for (const th of m.contributes?.themes ?? []) {
      for (const mode of ['light', 'dark']) for (const c of schema.themeContrast(th[mode])) expect(`Grafite ${mode} · contraste ${c.fg}/${c.bg} (${c.ratio}:1)`, c.ok, true);
    }
    for (const et of m.contributes?.elementTypes ?? []) {
      const composite = { id: 'x', type: 'composite', x: 0, y: 0, width: et.defaultSize.width, height: et.defaultSize.height, typeRef: { extensionId: m.id, typeId: et.id }, typeName: et.name, text: 'a', fields: {}, parts: et.parts };
      expect(`embutida · ${folder} · ${et.id} vira elemento válido`, schema.validateCompositeElement(composite), true);
    }
    for (const tpl of m.contributes?.templates ?? []) {
      const protectedFrames = tpl.elements.filter((e) => e.type === 'frame' && e.lock === 'protected' && e.background === true).length;
      expect(`embutida · ${folder} · ${tpl.id} com estrutura protegida`, protectedFrames >= 1, true);
      const keysPt = Object.keys(tpl.strings?.['pt-BR'] ?? {}).sort().join(',');
      const keysEn = Object.keys(tpl.strings?.en ?? {}).sort().join(',');
      expect(`embutida · ${folder} · ${tpl.id} com textos pt-BR e en iguais`, keysPt === keysEn && keysPt.length > 0, true);
      // textos com cor E fundo explícitos (fundo opaco = o tema escuro não adapta a cor) e contraste AA
      for (const [i, el] of tpl.elements.entries()) {
        if (el.type !== 'text') continue;
        const fg = schema.parseColor(el.color);
        const bg = schema.parseColor(el.fill);
        const ratio = fg && bg && bg.a === 1 ? schema.contrastRatio(fg, bg) : 0;
        expect(`embutida · ${folder} · ${tpl.id} · texto ${i} com cor e fundo AA (${ratio.toFixed(2)}:1)`, ratio >= 4.5, true);
      }
    }
  }
}


/* ======================= Chat 06.5 · Rodada B — Nível 2 ======================= */
const vm = await import('node:vm');
const protocol = await import(src('extensions/host/protocol.ts'));
const { sealGlobals, SEAL_SOURCE } = await import(src('extensions/host/sealGlobals.ts'));
const { RUNTIME_SOURCE, workerScript } = await import(src('extensions/host/extensionRuntime.ts'));
const { checkNetRequest } = await import(src('extensions/host/netProxy.ts'));

/* ---- manifest de script ---- */
const script = (over = {}) => base({ kind: 'script', main: 'main.js', permissions: ['board.read', 'ui.command'], contributes: { commands: [{ id: 'contar', title: 'Contar' }] }, ...over });
const SFILES = { ...FILES, 'main.js': 'h3' };
const sc = (m, files = SFILES) => check(m, { fileHashes: files });
expect('script válido', sc(script()).ok, true);
expect('script sem main.js no pacote', hasKey(sc(script(), FILES), 'extensions.schema.assetMissing'), true);
expect('script com main fora do padrão', hasKey(sc(script({ main: 'src/app.js' })), 'extensions.schema.mainPath'), true);
expect('permissão desconhecida', hasKey(sc(script({ permissions: ['board.read', 'ui.command', 'tudo'] })), 'extensions.schema.unknownPermission'), true);
expect('permissão repetida', hasKey(sc(script({ permissions: ['board.read', 'ui.command', 'ui.command'] })), 'extensions.schema.duplicateId'), true);
expect('comando sem ui.command', hasKey(sc(script({ permissions: ['board.read'] })), 'extensions.schema.contributionNeedsPermission'), true);
expect('network sem allowlist', hasKey(sc(script({ permissions: ['board.read', 'ui.command', 'network'] })), 'extensions.schema.networkAllowlistRequired'), true);
expect('allowlist sem network', hasKey(sc(script({ networkAllowlist: ['api.exemplo.test'] })), 'extensions.schema.networkWithoutPermission'), true);
expect('allowlist com curinga', hasKey(sc(script({ permissions: ['board.read', 'ui.command', 'network'], networkAllowlist: ['*.exemplo.test'] })), 'extensions.schema.hostname'), true);
expect('allowlist com IP', hasKey(sc(script({ permissions: ['board.read', 'ui.command', 'network'], networkAllowlist: ['10.0.0.1'] })), 'extensions.schema.hostname'), true);
expect('allowlist válida', sc(script({ permissions: ['board.read', 'ui.command', 'network'], networkAllowlist: ['api.exemplo.test'] })).ok, true);
expect('painel sem ui', hasKey(sc(script({ permissions: ['ui.panel'], contributes: { panels: [{ id: 'p', title: 'P' }] } })), 'extensions.schema.panelWithoutUi'), true);
expect('painel com ui', sc(script({ permissions: ['ui.panel'], ui: 'ui/panel.html', contributes: { panels: [{ id: 'p', title: 'P' }] } }), { ...SFILES, 'ui/panel.html': 'h4' }).ok, true);
expect('ui não declarada', hasKey(sc(script(), { ...SFILES, 'ui/x.html': 'h5' }), 'extensions.schema.unusedScriptFile'), true);
expect('importador de formato do núcleo', hasKey(sc(script({ permissions: ['files.import'], contributes: { importers: [{ id: 'i', label: 'I', extensions: ['svg'] }] } })), 'extensions.schema.coreExtension'), true);
expect('importador com ponto', hasKey(sc(script({ permissions: ['files.import'], contributes: { importers: [{ id: 'i', label: 'I', extensions: ['.drawio'] }] } })), 'extensions.schema.fileExtension'), true);
expect('locales continuam recusados', hasKey(sc(script({ contributes: { commands: [{ id: 'c', title: 'C' }], locales: [] } })), 'extensions.schema.localesNotSupported'), true);
expect('formato proprietário continua recusado', hasKey(sc(script({ provenance: { originalWork: true, thirdParty: [], proprietaryFormatsRead: ['x'] } })), 'extensions.schema.proprietaryFormats'), true);
expect('risco elevado: ui.panel + board.read', schema.isElevatedRisk(['ui.panel', 'board.read']), true);
expect('sem risco elevado: só board.read', schema.isElevatedRisk(['board.read', 'ui.command']), false);
expect('import() dinâmico recusado', schema.scanScriptSource('main.js', 'const x = await import ( "https://x/y.js" )').length, 1);
expect('import() com comentário recusado', schema.scanScriptSource('main.js', 'import/* x */("a")').length, 1);
expect('código comum passa', schema.scanScriptSource('main.js', 'ludraw.ui.notify("importar ok")').length, 0);

/* ---- elementos pedidos pela API ---- */
const okInputs = [{ type: 'shape', ref: 'a', shape: 'rectangle', x: 0, y: 0, width: 100, height: 60, text: '{{texto livre}}' }, { type: 'connector', x: 0, y: 0, width: 0, height: 0, from: { ref: 'a' }, to: { elementId: 'Abc_123' } }];
expect('entradas da API válidas', schema.validateElementInputs(okInputs).ok, true);
expect('entrada com tipo composto recusada', schema.validateElementInputs([{ type: 'composite', typeId: 'x', x: 0, y: 0, width: 10, height: 10 }]).ok, false);
expect('entrada com campo extra recusada', schema.validateElementInputs([{ type: 'sticky', x: 0, y: 0, width: 10, height: 10, onclick: 'x' }]).ok, false);
expect('entrada com cor injetada recusada', schema.validateElementInputs([{ type: 'sticky', x: 0, y: 0, width: 10, height: 10, color: 'red;}' }]).ok, false);
expect('entradas demais recusadas', schema.validateElementInputs(Array.from({ length: 11 }, () => ({ type: 'sticky', x: 0, y: 0, width: 1, height: 1 })), 10).ok, false);

/* ---- protocolo RPC ---- */
const P = protocol.parseExtensionMessage;
expect('RPC: pedido válido', P({ v: 1, t: 'req', id: 1, method: 'board.getSelection' }).ok, true);
expect('RPC: método desconhecido', P({ v: 1, t: 'req', id: 1, method: 'board.dropTable' }).reason, 'method');
expect('RPC: método do protótipo', P({ v: 1, t: 'req', id: 1, method: 'toString' }).reason, 'method');
expect('RPC: versão errada', P({ v: 2, t: 'req', id: 1, method: 'board.getSelection' }).reason, 'version');
expect('RPC: id inválido', P({ v: 1, t: 'req', id: 0.5, method: 'board.getSelection' }).reason, 'shape');
expect('RPC: não-objeto', P('board.getSelection').reason, 'shape');
expect('RPC: params não-objeto', P({ v: 1, t: 'req', id: 1, method: 'board.getElements', params: [1] }).reason, 'shape');
expect('RPC: mensagem > 2 MB', P({ v: 1, t: 'req', id: 1, method: 'ui.notify', params: { message: 'x'.repeat(2 * 1024 * 1024 + 10) } }).reason, 'size');
{
  const cyc = { v: 1, t: 'req', id: 1, method: 'ui.notify', params: {} };
  cyc.params.self = cyc;
  expect('RPC: estrutura cíclica', P(cyc).reason, 'shape');
}
expect('RPC: permissão de board.addElements', protocol.permissionFor('board.addElements'), 'board.write');
expect('RPC: permissão de network.fetch', protocol.permissionFor('network.fetch'), 'network');
{
  const rl = new protocol.RateLimiter(60, 0);
  let okCount = 0;
  for (let i = 0; i < 200; i++) if (rl.take(0)) okCount++;
  expect('RPC: limite de 60 mensagens/s', okCount, 60);
  expect('RPC: recupera depois de 1 s', rl.take(1000), true);
}
expect('nome de arquivo seguro', protocol.safeFileName('../../etc/passwd'), 'passwd');
expect('nome de arquivo seguro (caracteres)', protocol.safeFileName('ata<script>.md'), 'ata_script_.md');

/* ---- rede pelo host ---- */
const allow = ['api.exemplo.test'];
expect('rede: domínio da allowlist', checkNetRequest({ url: 'https://api.exemplo.test/v1' }, allow).ok, true);
expect('rede: domínio fora da allowlist', checkNetRequest({ url: 'https://outro.test/' }, allow).code, 'host');
expect('rede: subdomínio não vale', checkNetRequest({ url: 'https://x.api.exemplo.test/' }, allow).code, 'host');
expect('rede: http recusado', checkNetRequest({ url: 'http://api.exemplo.test/' }, allow).code, 'protocol');
expect('rede: porta diferente', checkNetRequest({ url: 'https://api.exemplo.test:8443/' }, allow).code, 'host');
expect('rede: usuário na URL', checkNetRequest({ url: 'https://a:b@api.exemplo.test/' }, allow).code, 'protocol');
expect('rede: método PUT', checkNetRequest({ url: 'https://api.exemplo.test/', init: { method: 'PUT' } }, allow).code, 'method');
expect('rede: cabeçalho Cookie', checkNetRequest({ url: 'https://api.exemplo.test/', init: { headers: { Cookie: 'x' } } }, allow).code, 'headers');
expect('rede: corpo em GET', checkNetRequest({ url: 'https://api.exemplo.test/', init: { body: 'x' } }, allow).code, 'body');

/* ---- preâmbulo selado (Node vm, com globais falsos na cadeia de protótipos) ---- */
{
  const ctx = vm.createContext({});
  const result = vm.runInContext(String.raw`
    const proto = {
      fetch() {}, XMLHttpRequest: class {}, WebSocket: class {}, EventSource: class {}, RTCPeerConnection: class {},
      importScripts() {}, Worker: class {}, SharedWorker: class {}, BroadcastChannel: class {}, indexedDB: {}, caches: {},
      postMessage() { globalThis.__sent = (globalThis.__sent || 0) + 1; },
      setTimeout: (fn) => typeof fn === 'function' ? 1 : 0, setInterval: (fn) => 2,
    };
    const g = Object.create(proto);
    g.navigator = { sendBeacon() {} };
    const post = (${SEAL_SOURCE})(g, 'worker');
    post({ ok: 1 });
    const out = {};
    for (const n of ['fetch','XMLHttpRequest','WebSocket','EventSource','RTCPeerConnection','importScripts','Worker','SharedWorker','BroadcastChannel','indexedDB','caches','postMessage','eval']) out[n] = typeof g[n];
    out.protoFetch = typeof Object.getPrototypeOf(g).fetch;
    out.sendBeacon = typeof g.navigator.sendBeacon;
    try { g.fetch = () => 1; out.reassign = typeof g.fetch; } catch (e) { out.reassign = 'throws'; }
    try { (function(){}).constructor('return 1'); out.fnCtor = 'works'; } catch (e) { out.fnCtor = 'blocked'; }
    try { (async function(){}).constructor('return 1'); out.asyncCtor = 'works'; } catch (e) { out.asyncCtor = 'blocked'; }
    try { g.setTimeout('alert(1)', 1); out.timerString = 'works'; } catch (e) { out.timerString = 'blocked'; }
    out.timerFn = g.setTimeout(() => 1, 1);
    try { Object.prototype.polluted = 1; out.protoFrozen = Object.prototype.polluted === 1 ? 'no' : 'yes'; } catch (e) { out.protoFrozen = 'yes'; }
    out.sent = globalThis.__sent;
    JSON.stringify(out);
  `, ctx);
  const r = JSON.parse(result);
  for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'postMessage', 'eval']) expect(`selado: ${n} indisponível`, r[n], 'undefined');
  expect('selado: removido também do protótipo', r.protoFetch, 'undefined');
  expect('selado: sendBeacon', r.sendBeacon, 'undefined');
  expect('selado: fetch não pode ser recolocado', r.reassign === 'undefined' || r.reassign === 'throws', true);
  expect('selado: construtor de Function bloqueado', r.fnCtor, 'blocked');
  expect('selado: construtor de função assíncrona bloqueado', r.asyncCtor, 'blocked');
  expect('selado: setTimeout com texto bloqueado', r.timerString, 'blocked');
  expect('selado: setTimeout com função funciona', r.timerFn, 1);
  expect('selado: Object.prototype congelado', r.protoFrozen, 'yes');
  expect('selado: canal capturado continua funcionando', r.sent, 1);
}
expect('script do Worker: preâmbulo antes do código', workerScript(SEAL_SOURCE, 'EXT_CODE').indexOf('EXT_CODE') > workerScript(SEAL_SOURCE, 'EXT_CODE').indexOf('sealed') || workerScript(SEAL_SOURCE, 'EXT_CODE').indexOf('EXT_CODE') > workerScript(SEAL_SOURCE, 'EXT_CODE').indexOf(RUNTIME_SOURCE), true);
void sealGlobals;

/* ---- extensões oficiais programáveis rodando com uma API falsa (sem DOM) ---- */
async function runExtension(folder, fake) {
  const code = readFileSync(join(root, 'src/extensions/builtin', folder, 'main.js'), 'utf8');
  const ctx = vm.createContext({ ludraw: fake, TextDecoder, TextEncoder, Blob, DecompressionStream, atob, btoa, Uint8Array, console });
  vm.runInContext(code, ctx);
  return ctx;
}
{
  let run = null;
  const notes = [];
  await runExtension('contador-palavras', {
    locale: 'pt-BR',
    ui: { registerCommand: (c) => { run = c.run; }, notify: async (m, k) => notes.push([m, k]) },
    board: { getSelection: async () => [{ type: 'sticky', text: 'Olá, mundo bonito' }, { type: 'sticky', text: 'guarda-chuva d’água' }, { type: 'sticky', text: '', hidden: true }, { type: 'shape', text: 'não conta' }] },
  });
  await run();
  expect('E04: soma as palavras dos post-its', notes[0]?.[0], '5 palavras em 2 post-its. 1 nota privada de outra pessoa não foi contada.');
}
{
  let handler = null;
  await runExtension('formatos-drawio', { locale: 'pt-BR', files: { onImport: (id, h) => { handler = h; } } });
  const enc = new TextEncoder();
  const plain = '<mxfile><diagram name="P1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
    + '<mxCell id="a" value="Início" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
    + '<mxCell id="b" value="&lt;b&gt;Decide&lt;/b&gt;&lt;br&gt;agora?" style="rhombus;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="160" width="120" height="80" as="geometry"/></mxCell>'
    + '<mxCell id="e" value="sim" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>'
    + '<mxCell id="g" value="" style="group" vertex="1" parent="1"><mxGeometry x="300" y="0" width="200" height="200" as="geometry"/></mxCell>'
    + '<mxCell id="c" value="Dentro" style="rounded=1;" vertex="1" parent="g"><mxGeometry x="10" y="20" width="80" height="40" as="geometry"/></mxCell>'
    + '<mxCell id="t" value="Nota solta" style="text;html=1;" vertex="1" parent="1"><mxGeometry x="0" y="300" width="100" height="20" as="geometry"/></mxCell>'
    + '<mxCell id="i" value="" style="shape=image;image=data:image/png,abc;" vertex="1" parent="1"><mxGeometry x="0" y="400" width="50" height="50" as="geometry"/></mxCell>'
    + '</root></mxGraphModel></diagram><diagram name="P2"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>';
  const r = await handler({ name: 'teste.drawio', bytes: enc.encode(plain) });
  const types = r.elements.map((e) => e.type + (e.shape ? ':' + e.shape : '')).join(',');
  expect('E05: formas, texto e conector (o grupo não vira forma)', types, 'shape:circle,shape:diamond,shape:rounded_rectangle,text,connector');
  const inner = r.elements.find((e) => e.text === 'Dentro');
  expect('E05: posição absoluta dentro do grupo', inner && inner.x === 310 && inner.y === 20, true);
  expect('E05: rótulo HTML vira texto', r.elements.find((e) => e.shape === 'diamond')?.text, 'Decide\nagora?');
  const conn = r.elements.find((e) => e.type === 'connector');
  expect('E05: conector ligado às formas', conn && conn.from.ref && conn.to.ref && conn.route === 'orthogonal' && conn.label === 'sim', true);
  expect('E05: cor do preenchimento', r.elements[0].fillColor, '#DAE8FC');
  expect('E05: avisos (página extra e imagem)', r.warnings.length, 2);
  expect('E05: saída passa no validador do host', schema.validateElementInputs(r.elements).ok, true);
  // página compactada: deflate "cru" + base64 + codificação de URL
  const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="x" value="Comprimido" style="" vertex="1" parent="1"><mxGeometry x="5" y="5" width="90" height="40" as="geometry"/></mxCell></root></mxGraphModel>';
  const deflated = new Uint8Array(await new Response(new Blob([enc.encode(encodeURIComponent(model))]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const b64 = Buffer.from(deflated).toString('base64');
  const rc = await handler({ name: 'c.drawio', bytes: enc.encode('<mxfile><diagram id="d">' + b64 + '</diagram></mxfile>') });
  expect('E05: página compactada', rc.elements[0]?.text, 'Comprimido');
  let doctype = 'ok';
  try {
    await handler({ name: 'x.drawio', bytes: enc.encode('<!DOCTYPE x [<!ENTITY a "b">]><mxfile/>') });
  } catch (e) {
    doctype = e.message;
  }
  expect('E05: DOCTYPE/ENTITY recusado', doctype, 'Este arquivo não parece um diagrama .drawio válido.');
  let notXml = 'ok';
  try {
    await handler({ name: 'x.drawio', bytes: enc.encode('isto não é xml <') });
  } catch (e) {
    notXml = e.message;
  }
  expect('E05: arquivo inválido recusado com mensagem', notXml, 'Este arquivo não parece um diagrama .drawio válido.');
  // estrutura parecida com a de um diagrama real: grupo, boneco com rótulo embaixo, laço, âncoras, pontos, raia
  const cell = (id, attrs, geo) => `<mxCell id="${id}" ${attrs}>${geo}</mxCell>`;
  const g = (x, y, w, h) => `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
  const real = '<mxfile><diagram name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
    + cell('grp', 'style="group" vertex="1" connectable="0" parent="1"', g(170, 50, 120, 130))
    + cell('a1', 'value="Agrupados" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="grp"', '<mxGeometry width="120" height="60" as="geometry"/>')
    + cell('a2', 'value="Estamos" style="rounded=0;html=1;" vertex="1" parent="grp"', '<mxGeometry y="70" width="120" height="60" as="geometry"/>')
    + cell('act', 'value="Ator" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;" vertex="1" parent="1"', g(420, 150, 30, 60))
    + cell('cal', 'value="" style="shape=callout;html=1;" vertex="1" parent="1"', g(370, 150, 120, 80))
    + cell('box', 'value="caixa" style="rounded=0;html=1;" vertex="1" parent="1"', g(220, 240, 200, 60))
    + cell('ell', 'value="oval" style="ellipse;html=1;" vertex="1" parent="1"', g(510, 340, 120, 80))
    + cell('e1', 'style="edgeStyle=orthogonalEdgeStyle;html=1;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="box" target="ell"', '<mxGeometry relative="1" as="geometry"/>')
    + cell('e2', 'style="edgeStyle=orthogonalEdgeStyle;html=1;exitX=0;exitY=0.5;entryX=0;entryY=0.5;" edge="1" parent="1" source="box" target="ell"', '<mxGeometry relative="1" as="geometry"/>')
    + cell('e3', 'style="edgeStyle=orthogonalEdgeStyle;html=1;exitX=0.75;exitY=1;" edge="1" parent="1" source="box" target="box"', '<mxGeometry relative="1" as="geometry"/>')
    + cell('lane', 'value="" style="swimlane;startSize=0;" vertex="1" parent="1"', g(1330, 90, 200, 300))
    + cell('pool', 'value="Raia" style="swimlane;" vertex="1" parent="1"', g(1600, 90, 200, 300))
    + cell('in', 'value="dentro" style="rounded=0;" vertex="1" parent="pool"', g(20, 40, 80, 40))
    + cell('e4', 'style="edgeStyle=orthogonalEdgeStyle;html=1;entryX=-0.01;entryY=0.625;" edge="1" parent="1" source="ell" target="lane"', '<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="1000" y="180"/><mxPoint x="1000" y="295"/></Array></mxGeometry>')
    + '</root></mxGraphModel></diagram></mxfile>';
  const rr = await handler({ name: 'real.drawio', bytes: enc.encode(real) });
  const by = (text) => rr.elements.find((e) => e.text === text);
  expect('E05: grupo vira agrupamento (sem retângulo extra)', by('Agrupados')?.group !== undefined && by('Agrupados').group === by('Estamos')?.group, true);
  expect('E05: nenhuma forma para a célula de grupo', rr.elements.some((e) => e.type === 'shape' && e.height === 130), false);
  const actorLabel = by('Ator');
  const actorShape = rr.elements.find((e) => e.type === 'shape' && e.x === 420);
  expect('E05: rótulo embaixo vira texto separado abaixo da forma', actorLabel?.type === 'text' && actorLabel.y >= 210 && actorShape?.text === '' && actorLabel.group === actorShape.group, true);
  expect('E05: balão vira speech_bubble', rr.elements.find((e) => e.x === 370)?.shape, 'speech_bubble');
  const conns = rr.elements.filter((e) => e.type === 'connector');
  expect('E05: âncora de entrada do arquivo (topo)', conns[0]?.to.anchor, 'top');
  expect('E05: âncora de saída automática voltada ao destino', conns[0]?.from.anchor, 'right');
  expect('E05: âncoras esquerda→esquerda', conns[1]?.from.anchor + '/' + conns[1]?.to.anchor, 'left/left');
  expect('E05: laço ganha volta por fora', conns[2]?.points?.length === 3 && conns[2].from.anchor === 'bottom' && conns[2].to.anchor !== 'bottom', true);
  const pts = conns[3]?.points ?? [];
  expect('E05: pontos intermediários preservados', [[1000, 180]].every(([x, y]) => pts.some((q) => q.x === x && q.y === y)), true);
  const ortho = (a, b) => a.x === b.x || a.y === b.y;
  expect('E05: cotovelo sem trecho inclinado', pts.every((q, i) => i === 0 || ortho(pts[i - 1], q)), true);
  expect('E05: saída voltada ao primeiro ponto, entrada do arquivo', conns[3]?.from.anchor + '/' + conns[3]?.to.anchor, 'right/left');
  expect('E05: raia vazia vira retângulo sem preenchimento', rr.elements.find((e) => e.x === 1330)?.type + ':' + rr.elements.find((e) => e.x === 1330)?.fillColor, 'shape:none');
  expect('E05: raia com filhos vira quadro', rr.elements.find((e) => e.x === 1600)?.type, 'frame');
  expect('E05: aviso cita a forma aproximada', rr.warnings.some((w) => w.includes('umlActor')), true);
  expect('E05: saída realista passa no validador do host', schema.validateElementInputs(rr.elements).ok, true);
}
expect('API: points demais recusado', schema.validateElementInputs([{ type: 'connector', x: 0, y: 0, width: 0, height: 0, from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, points: Array.from({ length: 51 }, () => ({ x: 0, y: 0 })) }]).ok, false);
expect('API: ponto com chave extra recusado', schema.validateElementInputs([{ type: 'connector', x: 0, y: 0, width: 0, height: 0, from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, points: [{ x: 0, y: 0, z: 1 }] }]).ok, false);
expect('API: chave de grupo inválida recusada', schema.validateElementInputs([{ type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10, group: 'Grupo Mau!' }]).ok, false);

/* ------------------------------ Chat 08.7 · R4 (S-35/S-36): varreduras lineares ------------------------------ */
{
  // tempo de uma chamada (ms)
  const timed = (fn) => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };
  const sniff = await import(src('utils/textSniff.ts')).catch(() => null);
  expect('S-35: utils/textSniff.ts existe (detecção de SVG linear)', !!sniff, true);
  // S-36: scanScriptSource (instalação de extensão) — entrada adversária curta primeiro (no código antigo leva segundos)
  const shortScan = 'import ' + '/**/ '.repeat(27) + 'x';
  const tScan = timed(() => schema.scanScriptSource('main.js', shortScan));
  expect('S-36: scanScriptSource com 27 comentários seguidos < 50 ms', tScan < 50, true);
  if (tScan < 50) {
    const longScan = 'import ' + '/**/ '.repeat(20_000) + 'x';
    expect('S-36: scanScriptSource com 100 kB adversários < 50 ms', timed(() => schema.scanScriptSource('main.js', longScan)) < 50, true);
  }
  const hasDyn = (code) => schema.scanScriptSource('main.js', code).some((i) => i.message.key === 'extensions.schema.dynamicImport');
  expect('S-36: import( detectado', hasDyn('const m = import("x")'), true);
  expect('S-36: import /* c */ ( detectado', hasDyn('import /* a */ /* b */ ("x")'), true);
  expect('S-36: import\\n( detectado', hasDyn('import\n  ("x")'), true);
  expect('S-36: import estático não é dinâmico', hasDyn('import x from "y"'), false);
  expect('S-36: "reimport(" não conta', hasDyn('reimport("x")'), false);
  if (sniff) {
    const shortSvg = '<!---->'.repeat(27) + 'x';
    const tSvg = timed(() => sniff.looksLikeSvg(shortSvg));
    expect('S-35: looksLikeSvg com 27 comentários < 50 ms', tSvg < 50, true);
    if (tSvg < 50) expect('S-35: looksLikeSvg com 100 kB adversários < 50 ms', timed(() => sniff.looksLikeSvg('<!---->'.repeat(15_000) + 'x')) < 50, true);
    expect('S-35: SVG simples', sniff.looksLikeSvg('<svg viewBox="0 0 1 1"></svg>'), true);
    expect('S-35: SVG com declaração XML e comentários', sniff.looksLikeSvg('<?xml version="1.0"?>\n<!-- a -->\n<!-- b --><svg>'), true);
    expect('S-35: espaço antes', sniff.looksLikeSvg('   \n<SVG >'), true);
    expect('S-35: texto comum', sniff.looksLikeSvg('olá <svg>'), false);
    expect('S-35: comentário sem fim', sniff.looksLikeSvg('<!-- <svg>'), false);
    expect('S-35: "<svgx" não é SVG', sniff.looksLikeSvg('<svgx>'), false);
  }
  // o colar usa a função linear (nada de regex com comentários aninhados em core.ts)
  expect('S-35: core.ts usa looksLikeSvg de utils/textSniff', /from '\.\.\/utils\/textSniff'/.test(readFileSync(join(root, 'src/extensions/core.ts'), 'utf8')), true);
}

/* ------------------------------ Varredura do código ------------------------------ */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const offenders = (files, re) => files.filter((f) => re.test(stripComments(readFileSync(f, 'utf8')))).map((f) => relative(root, f));
const allSrc = walk(join(root, 'src'));
const extSrc = walk(join(root, 'src/extensions'));
expect('nenhum eval( em src/', offenders(allSrc, /\beval\s*\(/).join(', '), '');
expect('nenhum new Function em src/', offenders(allSrc, /\bnew\s+Function\s*\(/).join(', '), '');
expect('nenhum innerHTML em src/extensions/', offenders(extSrc, /\binnerHTML\b/).join(', '), '');
expect('nenhum dangerouslySetInnerHTML em src/extensions/', offenders(extSrc, /dangerouslySetInnerHTML/).join(', '), '');
expect('src/extensions/ não acessa localStorage (só o preâmbulo, para REMOVER)', offenders(extSrc.filter((f) => !f.endsWith('sealGlobals.ts')), /\blocalStorage\b/).join(', '), '');
{
  const builtinJs = readdirSync(join(root, 'src/extensions/builtin')).map((d) => join(root, 'src/extensions/builtin', d, 'main.js')).filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });
  expect('extensões oficiais sem eval/Function/localStorage/fetch direto', builtinJs.filter((f) => /\beval\s*\(|\bnew\s+Function\b|\blocalStorage\b|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(stripComments(readFileSync(f, 'utf8')))).map((f) => relative(root, f)).join(', '), '');
}

console.log(`Extensões: ${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
