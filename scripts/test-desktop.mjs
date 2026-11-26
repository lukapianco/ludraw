#!/usr/bin/env node
/**
 * LuDraw — regras do programa desktop, sem compilar Rust nem abrir janela (Chat 09.1 · R7). `npm run test:desktop`
 *
 * - regras puras (`desktopRules.ts`): onde a página está, diagnóstico da conexão, emissor do SSO (D14);
 * - configuração do Tauri: uma permissão só, local, só para a janela de escolha; sem plugins, sem DevTools, sem API global;
 * - CSP do protocolo local (a mesma fonte do servidor);
 * - `GET /info` de um servidor de verdade: CORS só para as duas origens do programa, sem credenciais, e `ssoOrigin`.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { register } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./lib/ts-hooks.mjs', import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => pathToFileURL(join(root, 'src', p)).href;
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const { DESKTOP_CHOOSER_PATH, DESKTOP_NATIVE_KEYS, DESKTOP_ORIGINS, diagnoseServer, isDesktopApp, isDesktopChooser, ssoOriginOf } = await import(src('utils/desktopRules.ts'));
const { desktopHeaders } = await import(src('utils/securityHeaders.ts'));

let passed = 0;
const failures = [];
const expect = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
};

/* ---------------------------------- onde a página está ---------------------------------- */
const page = (href) => {
  const u = new URL(href);
  return { origin: u.origin, protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname };
};
for (const href of ['http://tauri.localhost/', 'http://tauri.localhost/index.html', 'tauri://localhost/']) expect(`app embutido: ${href}`, isDesktopApp(page(href)), true);
for (const href of ['http://localhost:5173/', 'https://draw.example.com/', 'http://tauri.localhost:81/', 'https://tauri.localhost/', 'http://x.tauri.localhost/', 'tauri://other/', 'http://tauri.localhost.example.com/']) expect(`não é o app embutido: ${href}`, isDesktopApp(page(href)), false);
expect('sem página', isDesktopApp(null), false);
expect('documento da escolha', [isDesktopChooser(page('http://tauri.localhost/desktop')), isDesktopChooser(page('tauri://localhost/desktop'))], [true, true]);
expect('outras páginas não são a escolha', [isDesktopChooser(page('http://tauri.localhost/')), isDesktopChooser(page('https://draw.example.com/desktop'))], [false, false]);

/* ---------------------------------- diagnóstico ---------------------------------- */
const facts = (f) => ({ validUrl: true, https: true, info: null, reachable: false, port: null, clientApiVersion: 1, ...f });
expect('endereço inválido', diagnoseServer(facts({ validUrl: false })), 'invalidUrl');
expect('servidor certo', diagnoseServer(facts({ info: { apiVersion: 1 } })), null);
expect('versão diferente', diagnoseServer(facts({ info: { apiVersion: 2 } })), 'incompatible');
expect('respondeu, mas não é LuDraw', diagnoseServer(facts({ reachable: true })), 'notLuDraw');
expect('nome não existe', diagnoseServer(facts({ port: 'unknown-host' })), 'unknownHost');
expect('https com porta aberta e conexão recusada = certificado', diagnoseServer(facts({ port: 'open' })), 'certificate');
expect('http nunca é certificado', diagnoseServer(facts({ https: false, port: 'open' })), 'notLuDraw');
expect('porta fechada', diagnoseServer(facts({ port: 'closed' })), 'offline');
expect('teste de porta falhou', diagnoseServer(facts({ port: null })), 'offline');

/* ---------------------------------- emissor do SSO (D14) ---------------------------------- */
expect('emissor: origem exata', ssoOriginOf({ ssoOrigin: 'https://login.example.com' }), 'https://login.example.com');
for (const bad of [undefined, null, '', 'https://login.example.com/realm', 'javascript:1', 'file:///x', 'login.example.com', 'https://u:p@login.example.com', '*', 'https://*.example.com/']) expect(`emissor recusado: ${bad}`, ssoOriginOf({ ssoOrigin: bad }), null);
expect('sem informação', ssoOriginOf(null), null);

/* ---------------------------------- Tauri ---------------------------------- */
const conf = json('src-tauri/tauri.conf.json');
expect('identificador permanente', conf.identifier, 'app.ludraw');
// no Windows, %LOCALAPPDATA%<identificador> é a pasta dos dados e %LOCALAPPDATA%<productName> a do instalador (sem diferenciar maiúsculas)
expect('a pasta dos dados nunca é a do programa', conf.identifier.toLowerCase() === conf.productName.toLowerCase(), false);
const reserved = /BUILTIN_ID_PREFIX = '([^']+)'/.exec(read('src/extensions/schema.ts'))?.[1];
expect('dev.ludraw. continua só das extensões', [reserved, `${conf.identifier}.`.startsWith(reserved)], ['dev.ludraw.', false]);
expect('a origem local não depende do identificador', DESKTOP_ORIGINS, ['http://tauri.localhost', 'tauri://localhost']);
expect('sem API global do Tauri', conf.app.withGlobalTauri, false);
expect('nenhuma janela automática', conf.app.windows, []);
expect('uma permissão', conf.app.security.capabilities, ['chooser']);
expect('sem plugins e sem endereço de desenvolvimento', [conf.plugins ?? null, conf.build.devUrl ?? null], [null, null]);
expect('um arquivo de permissão', readdirSync(join(root, 'src-tauri/capabilities')), ['chooser.json']);
const cap = json('src-tauri/capabilities/chooser.json');
expect('permissão só local, só da janela de escolha', [cap.local, cap.windows, cap.webviews ?? null, cap.remote ?? null], [true, ['chooser'], null, null]);
const commands = [...read('src-tauri/build.rs').matchAll(/"(desktop_[a-z_]+)"/g)].map((m) => m[1]);
expect('quatro comandos', commands, ['desktop_state', 'desktop_use_local', 'desktop_use_server', 'desktop_probe_port']);
expect('permissões = os comandos, nada do núcleo', cap.permissions, commands.map((c) => `allow-${c.replace(/_/g, '-')}`));
const main = read('src-tauri/src/main.rs');
const bodies = [...main.matchAll(/#\[tauri::command\]\r?\nasync fn (desktop_\w+)\([\s\S]*?\{\r?\n\s*(\S[^\r\n]*)/g)].map((m) => [m[1], m[2]]);
expect('todo comando confere a janela e o documento antes de tudo', bodies, commands.map((c) => [c, 'guard(&window)?;']));
expect('ganchos de teste só na depuração', /#\[cfg\(debug_assertions\)\]\r?\nmod testing;/.test(main) && !/(?<!cfg\(debug_assertions\)\]\r?\n\s*(?:\{[\s\S]{0,60})?)mod testing;/.test(main), true);
const cargo = read('src-tauri/Cargo.toml');
expect('sem plugins do Tauri nem DevTools', [/tauri-plugin/.test(cargo), /^tauri = .*devtools/m.test(cargo)], [false, false]);
expect('tauri e tauri-build com versão exata', [/^tauri = \{ version = "=\d/m.test(cargo), /^tauri-build = \{ version = "=\d/m.test(cargo)], [true, true]);
const nav = read('src-tauri/src/nav.rs');
expect('as origens locais são as mesmas no programa e no servidor', [...nav.matchAll(/LOCAL_ORIGIN: &str = "([^"]+)"/g)].map((m) => m[1]).sort(), [...DESKTOP_ORIGINS].sort());
expect('o caminho da escolha é o mesmo', /CHOOSER_PATH: &str = "([^"]+)"/.exec(nav)?.[1], DESKTOP_CHOOSER_PATH);
expect('RUSTSEC-2026-0592: Url::origin() num lugar só', readdirSync(join(root, 'src-tauri/src')).flatMap((f) => [...read(`src-tauri/src/${f}`).replace(/\/\/.*$/gm, '').matchAll(/\.origin\(\)/g)].map(() => f)), ['nav.rs']);
for (const lang of ['pt-BR', 'en']) {
  const catalog = json(`src/locales/${lang}/desktop.json`);
  expect(`textos do programa em ${lang}`, DESKTOP_NATIVE_KEYS.filter((k) => !catalog[k.replace('desktop.', '')]), []);
  expect(`certificado em ${lang}: nunca ensina a ignorar`, Object.entries(catalog).filter(([k, v]) => k.startsWith('problem.certificate') && /ignor|bypass|aceit(e|ar) o risco|accept the risk|desativ|disable/i.test(v)), []);
}

/* ---------------------------------- pacotes (R8) ---------------------------------- */
const winConf = json('src-tauri/tauri.windows.conf.json');
const linConf = json('src-tauri/tauri.linux.conf.json');
const nsis = winConf.bundle.windows.nsis;
expect('só NSIS e .deb (D15)', conf.bundle.targets, ['nsis', 'deb']);
expect('NSIS: compressão zlib (a LZMA é CPL-1.0, fora da lista permitida)', nsis.compression, 'zlib');
expect('NSIS: só para o usuário, sem administrador', nsis.installMode, 'currentUser');
expect('NSIS: inglês e pt-BR', nsis.languages, ['English', 'PortugueseBR']);
expect('WebView2 baixado da Microsoft só se faltar', winConf.bundle.windows.webviewInstallMode.type, 'downloadBootstrapper');
expect('editor e autor "LuDraw", sem nome pessoal', [conf.bundle.publisher, /^authors = \["LuDraw"\]$/m.test(cargo)], ['LuDraw', true]);
expect('Windows: licença e os dois avisos junto do programa', Object.values(winConf.bundle.resources).sort(), ['LICENSE.txt', 'THIRD_PARTY_NOTICES-app.txt', 'THIRD_PARTY_NOTICES-desktop.txt']);
expect('Linux: pacote "ludraw" (o padrão seria "lu-draw")', linConf.productName, 'ludraw');
expect('Linux: licença e avisos em /usr/share/doc/ludraw', Object.entries(linConf.bundle.linux.deb.files).sort(), [
  ['/usr/share/doc/ludraw/THIRD_PARTY_NOTICES-app.txt', '../THIRD_PARTY_NOTICES.txt'],
  ['/usr/share/doc/ludraw/THIRD_PARTY_NOTICES-desktop.txt', 'THIRD_PARTY_NOTICES.txt'],
  ['/usr/share/doc/ludraw/copyright', '../LICENSE'],
]);
const desktopEntry = read(`src-tauri/${linConf.bundle.linux.deb.desktopTemplate}`);
expect('atalho do Linux: nome LuDraw, classe da janela ludraw', [/^Name=LuDraw$/m.test(desktopEntry), /^StartupWMClass=ludraw$/m.test(desktopEntry)], [true, true]);
expect('a página expõe o contador que o programa lê ao fechar', [/__ludrawPendingSaves/.test(main), /__ludrawPendingSaves/.test(read('src/utils/pendingSaves.ts'))], [true, true]);
const flow = read('.github/workflows/desktop.yml').replace(/^\s*#.*$/gm, '');
expect('workflow: disparo manual e por tag', [/^ {2}workflow_dispatch:/m.test(flow), /tags: \['v\*'\]/.test(flow)], [true, true]);
expect('workflow: escrita só no job do rascunho', [...flow.matchAll(/contents: (\w+)/g)].map((m) => m[1]), ['read', 'write']);
expect('workflow: o rascunho só roda na tag', /rascunho:[\s\S]*?if: startsWith\(github\.ref, 'refs\/tags\/v'\)[\s\S]*?--draft/.test(flow), true);
for (const file of ['.github/workflows/desktop.yml', '.github/workflows/ci.yml']) {
  expect(`${file}: actions fixadas pelo SHA`, [...read(file).matchAll(/uses: (\S+)/g)].map((m) => m[1]).filter((u) => !/@[0-9a-f]{40}$/.test(u)), []);
}
expect('CI: test:desktop e os testes do Rust', ['npm run test:desktop', 'npm run test:desktop:rust'].map((c) => read('.github/workflows/ci.yml').includes(c)), [true, true]);

/* ---------------------------------- crates ---------------------------------- */
const crates = json('src-tauri/crates.json');
const approvals = json('scripts/audit-terms.json').licenses.crateApprovals;
const special = crates.filter((c) => /MPL|Unicode|LLVM/.test(c.license) && !/\bOR\b(?!.*AND)/.test(c.license));
expect('licença fora da lista livre = aprovação por nome e versão', special.map((c) => `${c.name}@${c.version}`).sort(), approvals.map((a) => a.crate).sort());
expect('MPL-2.0: só as 5 aprovadas', crates.filter((c) => c.license === 'MPL-2.0').map((c) => c.name), ['cssparser', 'cssparser-macros', 'dtoa-short', 'option-ext', 'selectors']);
expect('target-lexicon não vai no executável', crates.filter((c) => c.name === 'target-lexicon').map((c) => [c.windows, c.linux]), [['lock', 'build']]);
expect('toda aprovação tem data', approvals.filter((a) => !/\d{2}\/\d{2}\/\d{4}/.test(a.approvedBy)), []);

/* ---------------------------------- CSP ---------------------------------- */
const hash = `sha256-${'A'.repeat(43)}=`;
const table = desktopHeaders([hash]);
const csp = (h) => h['content-security-policy'];
const directive = (h, name) => csp(h).split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
expect('app: só a própria origem', directive(table.app, 'connect-src'), "connect-src 'self' data:");
expect('escolha: ponte e teste de endereço', directive(table.chooser, 'connect-src'), "connect-src 'self' data: ipc: http://ipc.localhost http: https:");
for (const h of [table.app, table.chooser]) {
  expect('script só da origem e com hash', directive(h, 'script-src'), `script-src 'self' '${hash}'`);
  expect('sem objeto, base e quadros de fora', [directive(h, 'object-src'), directive(h, 'base-uri'), directive(h, 'frame-src')], ["object-src 'none'", "base-uri 'self'", "frame-src 'self'"]);
}
expect('documentos isolados', Object.keys(table.isolated).sort(), ['/ext/panel-host.html', '/ext/station.html']);
for (const [path, h] of Object.entries(table.isolated)) expect(`${path}: sem rede`, directive(h, 'connect-src'), "connect-src 'none'");
expect('arquivos comuns sem CSP de documento', csp(table.asset) ?? null, null);

/* ---------------------------------- /info ---------------------------------- */
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
const work = mkdtempSync(join(tmpdir(), 'ludraw-desktop-info-'));
const running = [];
async function server(extra) {
  const port = await freePort();
  const env = { ...process.env, DATABASE_URL: 'pglite://memory', PORT: String(port), HOST: '127.0.0.1', LUDRAW_ASSETS_DIR: join(work, String(port)), LUDRAW_JWT_SECRET: '', LUDRAW_PUBLIC_URL: '', LUDRAW_CORS_ORIGINS: 'http://front.test', LUDRAW_MAIL_OUTBOX_DIR: '', LUDRAW_SMTP_HOST: '', LUDRAW_REDIS_URL: '', LUDRAW_WEB_DIR: '', OIDC_ISSUER: '', LOG_LEVEL: 'error', ...extra };
  running.push(spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: join(root, 'server'), stdio: 'ignore', env }));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/api/v1/health`)).ok) return url;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('o servidor de teste não subiu');
}
const ask = async (url, origin, init = {}) => {
  const r = await fetch(url, { ...init, headers: { ...(origin ? { origin } : {}), ...init.headers } });
  return { status: r.status, acao: r.headers.get('access-control-allow-origin'), acac: r.headers.get('access-control-allow-credentials'), vary: r.headers.get('vary'), body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
};
try {
  const [plain, sso] = await Promise.all([
    server({}),
    server({ OIDC_ISSUER: 'https://login.example.com/realms/empresa', OIDC_CLIENT_ID: 'x', OIDC_CLIENT_SECRET: 'x', OIDC_REDIRECT_URI: 'http://localhost/api/v1/auth/oidc/callback', OIDC_PROVIDER_NAME: 'Empresa' }),
  ]);
  for (const origin of DESKTOP_ORIGINS) {
    const r = await ask(`${plain}/api/v1/info`, origin);
    expect(`/info responde a ${origin}, sem credenciais`, [r.status, r.acao, r.acac, /origin/i.test(r.vary ?? '')], [200, origin, null, true]);
    for (const path of ['/api/v1/auth/me', '/api/v1/workspace/state', '/api/v1/health']) expect(`${path} não responde a ${origin}`, (await ask(`${plain}${path}`, origin)).acao, null);
    const pre = await ask(`${plain}/api/v1/info`, origin, { method: 'OPTIONS', headers: { 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization' } });
    expect(`consulta prévia de ${origin} não libera nada`, pre.acao, null);
  }
  for (const origin of ['https://evil.test', 'null', 'http://localhost:5173', 'http://tauri.localhost.evil.test', 'https://tauri.localhost']) expect(`/info não responde a ${origin}`, (await ask(`${plain}/api/v1/info`, origin)).acao, null);
  const front = await ask(`${plain}/api/v1/info`, 'http://front.test');
  expect('origem configurada continua como antes (com credenciais)', [front.acao, front.acac], ['http://front.test', 'true']);
  expect('pedido sem origem continua igual', (await ask(`${plain}/api/v1/info`)).acao, null);
  const plainInfo = (await ask(`${plain}/api/v1/info`)).body;
  expect('sem SSO: sem ssoOrigin', ['ssoOrigin' in plainInfo, plainInfo.sso], [false, { enabled: false, label: null }]);
  const ssoInfo = (await ask(`${sso}/api/v1/info`)).body;
  expect('com SSO: só a origem do emissor; sso igual a antes', [ssoInfo.ssoOrigin, ssoInfo.sso], ['https://login.example.com', { enabled: true, label: 'Empresa' }]);
} catch (e) {
  failures.push(`servidor: ${e.stack}`);
} finally {
  for (const p of running) p.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 500));
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

if (failures.length) {
  console.log(`test:desktop — ${failures.length} falha(s), ${passed} ok:\n${failures.map((f) => `  ✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`test:desktop — ${passed} verificações ok.`);
process.exit(0);
