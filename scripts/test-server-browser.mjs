#!/usr/bin/env node
/**
 * LuDraw — Modo Servidor de ponta a ponta em NAVEGADOR REAL (Chat 07 · B). Sem dependências novas:
 * sobe o servidor deste repositório (PostgreSQL embutido em memória — sem Docker), o Vite com o proxy
 * `/api` e dois Chrome/Edge headless com perfis separados, controlados pelo protocolo DevTools.
 *
 *   npm run test:server:browser          (CHROME_PATH=/caminho/do/chrome se não for achado)
 *
 * Roteiro: conectar ao servidor → `#/setup` pela própria tela (token, organização, administrador) → board
 * criado e editado chega ao servidor → time criado com o MESMO id no servidor → sair (a cópia de trabalho é
 * apagada) → entrar pela tela → link público com senha aberto por outra pessoa (outro perfil): senha errada
 * recusada, certa abre o conteúdo → "Voltar ao modo local" não mostra nada do servidor.
 */
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { cspHeaderExpression, cspViolationOf, isAppCsp, watchCsp } from './lib/csp-watch.mjs';

/** Chat 09 · R2: violações da CSP do app (documento de topo, todas as abas) — precisam ser zero */
const cspViolations = [];
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rand = (base) => base + Math.floor(Math.random() * 50);
const VITE_PORT = rand(5240);
const API_PORT = rand(3340);
/** segundo app de desenvolvimento cujo proxy aponta para uma porta sem servidor (detecção → Modo Local) */
const VITE_DEAD_PORT = rand(5300);
const DEAD_API_PORT = rand(3400);
/** Chat 08.5 · B2: servidor SEM e-mail nas variáveis (com LUDRAW_JWT_SECRET) para configurar pelo painel */
const VITE_PANEL_PORT = rand(5360);
const PANEL_API_PORT = rand(3460);
const PANEL_SMTP_PASSWORD = 'Senha-SMTP-do-painel-e2e';
/** Chat 09 · R5: instalação com o Design System DESLIGADO, em multi_org, com e-mail e Modo Local permitido */
const VITE_DSOFF_PORT = rand(5480);
const DSOFF_API_PORT = rand(3520);
const DEBUG_A = rand(9500);
const DEBUG_B = rand(9560);
const SETUP_TOKEN = 'E2ETOKEN-ABCDEFGHJKLMNPQ';
const PASSWORD = 'Quadro-Verde-2026!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!chromePath) {
  console.log('Chrome/Edge não encontrado. Defina CHROME_PATH com o caminho do executável.');
  process.exit(1);
}

let passed = 0;
const failures = [];
const expect = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
};

// Chat 08.2: pasta de imagens própria do teste (apagada no fim)
const ASSETS_DIR = mkdtempSync(join(tmpdir(), 'ludraw-assets-e2e-'));
// Chat 09 · R2 (D6): servidor de imagem local — registra quem buscou (o servidor se identifica pelo User-Agent)
const IMAGE_PORT = rand(5420);
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const imageHits = [];
const imageServer = createHttpServer((req, res) => {
  imageHits.push({ url: req.url, ua: String(req.headers['user-agent'] ?? '') });
  res.writeHead(200, { 'content-type': 'image/png' }).end(PNG_1x1);
}).listen(IMAGE_PORT, '127.0.0.1');
const IMG_URL = `http://127.0.0.1:${IMAGE_PORT}/foto-e2e.png`;
// Chat 08.5: e-mails do teste viram arquivos .eml nesta pasta (pasta de saída de desenvolvimento)
const OUTBOX_DIR = mkdtempSync(join(tmpdir(), 'ludraw-outbox-e2e-'));
const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: join(root, 'server'),
  env: { ...process.env, DATABASE_URL: 'pglite://memory', PORT: String(API_PORT), HOST: '127.0.0.1', LUDRAW_ASSETS_DIR: ASSETS_DIR, LUDRAW_SETUP_TOKEN: SETUP_TOKEN, LUDRAW_CORS_ORIGINS: `http://localhost:${VITE_PORT}`, LUDRAW_MAIL_OUTBOX_DIR: OUTBOX_DIR, LUDRAW_APP_URL: `http://localhost:${VITE_PORT}`, LOG_LEVEL: 'warn',
    // Chat 09 · R5: Design System LIGADO neste servidor (o padrão; explícito para não depender do server/.env)
    LUDRAW_ENABLE_DESIGN_SYSTEM: 'true',
    // Chat 08.7 · R5: sem chave no ambiente (vazia vence o server/.env de quem roda) → link público só em hash (S-17)
    LUDRAW_JWT_SECRET: '',
    // Chat 09 · R2: SÓ teste — o proxy de imagem aceita o servidor de imagem local deste roteiro
    LUDRAW_DEV_REMOTE_IMAGE_ALLOW_LOCAL: 'true' },
  stdio: 'ignore',
});
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_PORT), '--strictPort'], {
  cwd: root,
  env: { ...process.env, LUDRAW_API_PROXY: `http://127.0.0.1:${API_PORT}` },
  stdio: 'ignore',
});
const viteDead = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_DEAD_PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, LUDRAW_API_PROXY: `http://127.0.0.1:${DEAD_API_PORT}` },
});

const panelServer = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: join(root, 'server'),
  env: { ...process.env, DATABASE_URL: 'pglite://memory', PORT: String(PANEL_API_PORT), HOST: '127.0.0.1', LUDRAW_ASSETS_DIR: mkdtempSync(join(tmpdir(), 'ludraw-assets-panel-')), LUDRAW_SETUP_TOKEN: SETUP_TOKEN, LUDRAW_CORS_ORIGINS: `http://localhost:${VITE_PANEL_PORT}`, LUDRAW_APP_URL: `http://localhost:${VITE_PANEL_PORT}`, LUDRAW_JWT_SECRET: 'e2e-jwt-secret-for-the-mail-panel-0123456789', LUDRAW_SMTP_ALLOW_PRIVATE_HOST: 'true', LOG_LEVEL: 'warn' },
  stdio: 'ignore',
});
const DSOFF_DIRS = [mkdtempSync(join(tmpdir(), 'ludraw-assets-dsoff-')), mkdtempSync(join(tmpdir(), 'ludraw-outbox-dsoff-'))];
const dsOffServer = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: join(root, 'server'),
  env: { ...process.env, DATABASE_URL: 'pglite://memory', PORT: String(DSOFF_API_PORT), HOST: '127.0.0.1', LUDRAW_ASSETS_DIR: DSOFF_DIRS[0], LUDRAW_SETUP_TOKEN: SETUP_TOKEN, LUDRAW_CORS_ORIGINS: `http://localhost:${VITE_DSOFF_PORT}`, LUDRAW_APP_URL: `http://localhost:${VITE_DSOFF_PORT}`, LUDRAW_MAIL_OUTBOX_DIR: DSOFF_DIRS[1], LUDRAW_JWT_SECRET: '', LUDRAW_ENABLE_DESIGN_SYSTEM: 'false', LUDRAW_ALLOW_LOCAL_MODE: 'true', LOG_LEVEL: 'warn' },
  stdio: 'ignore',
});
const viteDsOff = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_DSOFF_PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, LUDRAW_API_PROXY: `http://127.0.0.1:${DSOFF_API_PORT}` },
});
const vitePanel = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_PANEL_PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, LUDRAW_API_PROXY: `http://127.0.0.1:${PANEL_API_PORT}` },
});

const profiles = [mkdtempSync(join(tmpdir(), 'ludraw-srv-a-')), mkdtempSync(join(tmpdir(), 'ludraw-srv-b-'))];
const chromes = [DEBUG_A, DEBUG_B].map((port, i) =>
  spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profiles[i]}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' }),
);

async function waitFor(url) {
  for (let i = 0; i < 160; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch {
      /* ainda subindo */
    }
    await sleep(500);
  }
  throw new Error(`não respondeu: ${url}`);
}

/** Uma aba controlada pelo DevTools. */
async function openPage(debugPort, targetId = null) {
  const [target] = (await (await waitFor(`http://127.0.0.1:${debugPort}/json/list`)).json()).filter((t) => t.type === 'page' && (!targetId || t.id === targetId));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    const cspV = cspViolationOf(msg);
    if (cspV) cspViolations.push(cspV);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await watchCsp(send);
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return {
    ev,
    errors,
    close: () => ws.close(),
    goto: async (hash, port = VITE_PORT) => {
      await send('Page.navigate', { url: `http://localhost:${port}/${hash}` });
      await sleep(4500);
    },
    reload: async () => {
      await send('Page.reload');
      await sleep(5000);
    },
    /** Preenche os campos visíveis (na ordem) de um formulário controlado pelo React e envia. */
    fillAndSubmit: (values) =>
      ev(`(async () => {
        const form = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null);
        const inputs = [...form.querySelectorAll('input:not([type=radio]):not([readonly])')];
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        ${JSON.stringify(values)}.forEach((v, i) => { setter.call(inputs[i], v); inputs[i].dispatchEvent(new Event('input', { bubbles: true })); });
        await new Promise((r) => setTimeout(r, 100));
        form.querySelector('button[type=submit]').click();
        return inputs.length;
      })()`),
    text: () => ev('document.body.innerText'),
    hash: () => ev('location.hash'),
    clickText: (re) => ev(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => ${re}.test(x.textContent)); b && b.click(); return !!b; })()`),
  };
}

/** Chat 08.7 · R4: outra ABA no mesmo perfil (mesmo localStorage/IndexedDB; sessionStorage próprio). */
async function openTab(debugPort, url) {
  const r = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await r.json();
  await sleep(3500);
  const page = await openPage(debugPort, target.id);
  page.closeTab = async () => {
    page.close();
    await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`).catch(() => undefined);
    await sleep(800);
  };
  return page;
}

const MODS = `Promise.all([import('/src/store/useAppStore.ts'), import('/src/store/useBoardStore.ts'), import('/src/utils/api.ts'), import('/src/utils/factory.ts'), import('/src/utils/serverConfig.ts')]).then(([app, board, api, factory, cfg]) => ({ app, board, api, factory, cfg }))`;
/**
 * Chat 09 · R5: tudo o que leva ao "Sistema visual" na tela atual (Mesa ou entrada), no menu do usuário e na
 * paleta de comandos (lista e busca). Desligado = tudo zero; ligado = como sempre.
 */
const DS_PROBE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const leads = () => [...document.querySelectorAll('a, button, [role=menuitem], [role=option]')].filter((x) => /Sistema visual|Design System/i.test(x.textContent ?? '') || /design-system/.test(x.getAttribute('href') ?? '')).length;
  const out = { href: document.querySelectorAll('[href*="design-system"]').length, text: /Sistema visual|Design System/i.test(document.body.innerText), screen: leads(), menu: null, palette: null };
  const avatar = document.querySelector('button[aria-label="Menu do usuário"]');
  if (avatar) {
    avatar.click();
    await wait(350);
    out.menu = leads() - out.screen; // só o que o menu acrescenta (o rodapé da Mesa continua na tela)
    avatar.click();
    await wait(300);
  }
  const search = document.querySelector('button[aria-label="Buscar boards e ações"]');
  if (search) {
    search.click();
    await wait(400);
    out.palette = {};
    const input = document.querySelector('[role=dialog] input[role=combobox]');
    for (const q of ['', 'Sistema visual', 'Design System', 'tokens']) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, q);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(450);
      out.palette[q || '(vazia)'] = [...document.querySelectorAll('#od-palette-list [role=option]')].filter((o) => /Sistema visual|Design System/i.test(o.textContent)).length;
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(300);
  }
  return out;
})()`;
const DS_SCREEN = `/Componentes base/.test(document.body.innerText) && /Fundamentos/.test(document.body.innerText)`;
const until = async (page, expr, ms = 10000) => {
  for (let i = 0; i < ms / 250; i++) {
    if (await page.ev(expr)) return true;
    await sleep(250);
  }
  return false;
};

/** Chat 08.5: espera um .eml novo na pasta de saída e devolve o texto já sem a codificação quoted-printable. */
async function nextMail(seen, ms = 12000) {
  for (let i = 0; i < ms / 250; i++) {
    const fresh = readdirSync(OUTBOX_DIR).filter((f) => f.endsWith('.eml') && !seen.has(f));
    if (fresh.length) {
      seen.add(fresh[0]);
      const raw = readFileSync(join(OUTBOX_DIR, fresh[0]), 'utf8');
      return raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
    await sleep(250);
  }
  return null;
}
const seenMail = new Set();

/** Chat 08.5 · B: próxima mensagem ainda não lida para este destinatário (as outras ficam para depois). */
async function nextMailTo(address, ms = 12000) {
  for (let i = 0; i < ms / 250; i++) {
    for (const f of readdirSync(OUTBOX_DIR).filter((x) => x.endsWith('.eml') && !seenMail.has(x)).sort()) {
      const raw = readFileSync(join(OUTBOX_DIR, f), 'utf8');
      if (!new RegExp(`^To: ${address.replace(/[.]/g, '\\.')}$`, 'm').test(raw)) continue;
      seenMail.add(f);
      return raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
    await sleep(250);
  }
  return null;
}

let a;
let b;
try {
  await waitFor(`http://127.0.0.1:${API_PORT}/health`);
  await waitFor(`http://localhost:${VITE_PORT}/favicon.svg`);
  a = await openPage(DEBUG_A);

  // 1) detecção automática: o servidor responde na própria origem (proxy do Vite) → Modo Servidor travado e
  //    o primeiro acesso aparece sozinho, sem ninguém configurar nada neste navegador
  const firstLoad = Date.now();
  await a.goto('#/');
  // Chat 09.1 · R9: a PRIMEIRA abertura inclui o Vite compilando o app a frio, e o tempo varia muito com a carga da
  // máquina: 5,6 s a 26,7 s medidos (com os 4,5 s fixos do goto; 26,7 s logo depois do test:docker), contra o limite antigo de ~14,5 s. Logo depois do
  // test:docker é uma dessas cargas. Nada sobra do test:docker (contêiner, porta, rede, volume, processo — conferido),
  // então só esta espera é maior (até 60 s); as demais verificações continuam com 10 s.
  const firstSetup = await until(a, `location.hash === '#/setup'`, 60000);
  console.log(`  primeira abertura até #/setup: ${firstSetup ? `${Date.now() - firstLoad} ms` : 'não chegou'}`);
  if (!firstSetup) {
    const where = await a.ev(`fetch('/api/v1/info').then((r) => r.status + ' ' + r.headers.get('content-type'), (e) => 'erro ' + e).then((info) => JSON.stringify({ hash: location.hash, ready: document.readyState, boot: !!document.getElementById('od-boot'), info }))`);
    console.log(`  diagnóstico: ${where}`);
  }
  expect('servidor sem configuração abre #/setup', firstSetup, true);
  // Chat 09 · R3: no build de produção o /info chegava antes do App montar e a leitura do endereço levava para
  // #/login. A guarda de rotas agora leva ao assistente de qualquer rota que pediria a entrada.
  await a.goto('#/login');
  expect('primeiro acesso pendente: #/login vira o assistente (#/setup)', await until(a, `location.hash === '#/setup'`), true);
  await a.goto('#/');
  expect('primeiro acesso pendente: #/ vira o assistente (#/setup)', await until(a, `location.hash === '#/setup'`), true);
  expect('Modo Servidor detectado e travado', await a.ev(`${MODS}.then(({ cfg }) => cfg.connection.mode + ':' + cfg.connection.locked + ':' + cfg.connection.source)`), 'server:true:same-origin');
  expect('assistente na tela', /Primeiro acesso do servidor/.test(await a.text()), true);
  expect('passo 1: todos os campos com placeholder', await a.ev(`[...document.querySelectorAll('main input:not([type=radio]), form input:not([type=radio])')].every((i) => i.placeholder.trim().length > 0)`), true);
  // pós-teste C-2: trocar de aba / Alt+Tab no primeiro acesso não pode derrubar para #/login, nem com um usuário
  // antigo guardado neste navegador (a renovação de sessão é recusada porque ainda não existe conta no servidor)
  await a.ev(`${MODS}.then(({ app }) => { app.useAppStore.setState({ user: { id: 'u-antigo', name: 'Antigo', email: 'antigo@example.com' } }); window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); return true; })`);
  await sleep(2500);
  expect('voltar à aba no primeiro acesso continua em #/setup', await a.ev(`location.hash`), '#/setup');
  expect('… e sem o aviso de sessão encerrada', /sessão no servidor terminou/i.test(await a.text()), false);
  await a.ev(`${MODS}.then(({ app }) => { app.useAppStore.setState({ user: null }); return true; })`);
  await sleep(300);

  // 2) passo 1 com token errado, depois o certo
  await a.fillAndSubmit(['TOKEN-ERRADO-0000', 'Empresa E2E', '']);
  expect('token errado recusado na tela', await until(a, `/Token de configuração inválido/.test(document.body.innerText)`), true);
  await a.fillAndSubmit([SETUP_TOKEN, 'Empresa E2E', '']);
  expect('passo 2 (administrador)', await until(a, `/Seu e-mail/.test(document.body.innerText)`), true);
  expect('passo 2: todos os campos com placeholder', await a.ev(`[...document.querySelectorAll('main input:not([type=radio]), form input:not([type=radio])')].every((i) => i.placeholder.trim().length > 0)`), true);
  await a.fillAndSubmit(['Ana Admin', 'ana@example.com', PASSWORD, PASSWORD]);
  expect('passo 3 (pronto)', await until(a, `/Servidor pronto/.test(document.body.innerText)`), true);
  await a.clickText('/Entrar na Mesa/');
  await sleep(1500);
  const state1 = await a.ev(`${MODS}.then(({ app }) => { const s = app.useAppStore.getState(); return { user: s.user?.email, org: s.workspace.name, role: s.session.workspaceRole }; })`);
  expect('entrou como admin da organização criada', state1, { user: 'ana@example.com', org: 'Empresa E2E', role: 'admin' });
  const setupGone = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/setup/status`);
  expect('#/setup deixa de existir no servidor (404)', setupGone.status, 404);

  // 3) board: criar, editar e conferir que chegou ao servidor
  const boardId = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().createBoard({ name: 'Quadro E2E', template: 'blank', open: true, place: { kind: 'workspace' } }))`);
  await sleep(3500);
  await a.ev(`${MODS}.then(({ board, factory }) => board.useBoardStore.getState().addElements([factory.createStickyNote({ x: 0, y: 0, text: 'chegou ao servidor' })]))`);
  const synced = await until(
    a,
    `${MODS}.then(async ({ api }) => { const env = await api.api.boardData(${JSON.stringify(boardId)}); return Object.values(env.data.elements).some((e) => e.text === 'chegou ao servidor'); })`,
    12000,
  );
  expect('post-it salvo no servidor', synced, true);
  expect('Régua mostra "Ao vivo" (Chat 08: edição ao vivo no lugar do salvamento por PUT)', await until(a, `/Ao vivo|Salvo/.test(document.querySelector('[role=status]')?.textContent || '')`), true);

  // 3b) outra janela salva uma versão mais nova → o aviso aparece sozinho (sem editar nada aqui)
  await a.ev(`${MODS}.then(async ({ api }) => { const env = await api.api.boardData(${JSON.stringify(boardId)}); env.data.elements = { ...env.data.elements }; return api.api.saveBoardData(${JSON.stringify(boardId)}, env.data, env.revision); })`);
  // Chat 08: gravar por PUT substitui o conteúdo → quem está ao vivo é avisado e recomeça do banco sozinho
  expect('aviso de conteúdo substituído aparece na hora', await until(a, `/substituído por outra pessoa|versão mais nova deste board/.test(document.body.innerText)`, 9000), true);
  await sleep(2500);

  // 4) time: o id otimista é o mesmo do servidor
  const teamId = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().createTeam({ name: 'Engenharia' }).id)`);
  const teamOnServer = await until(a, `${MODS}.then(async ({ api }) => (await api.api.workspaceState()).teams.some((t) => t.id === ${JSON.stringify(teamId)}))`);
  expect('time criado com o mesmo id no servidor', teamOnServer, true);

  // 4b) Chat 09 · R2 (D6): colar o endereço de uma imagem → "Baixar para o board" → quem busca é o SERVIDOR
  imageHits.length = 0;
  const imgOffer = await a.ev(`Promise.all([import('/src/utils/importActions.ts'), import('/src/store/useAppStore.ts')]).then(async ([ia, app]) => { await ia.handlePasteSnapshot({ types: ['text/plain'], text: ${JSON.stringify(IMG_URL)}, html: '', svg: '', files: [], source: 'paste' }, { x: 0, y: 0 }); await new Promise((r) => setTimeout(r, 300)); const toast = app.useAppStore.getState().toasts.slice(-1)[0]; window.__odImgToast = toast; return toast?.action?.label ?? null; })`);
  expect('Chat 09 · R2: colar endereço de imagem (Modo Servidor) oferece "Baixar para o board"', imgOffer, 'Baixar para o board');
  expect('Chat 09 · R2: nada é buscado antes do clique', imageHits.length, 0);
  await a.ev(`(window.__odImgToast?.action?.run?.(), true)`);
  const imgAdded = await until(a, `${MODS}.then(({ board }) => { const s = board.useBoardStore.getState(); return s.elementOrder.map((id) => s.elements[id]).some((e) => e && e.type === 'image' && String(e.dataUrl).startsWith('asset:')); })`, 15000);
  expect('Chat 09 · R2: a imagem entrou no board como imagem do servidor (asset:)', imgAdded, true);
  expect('Chat 09 · R2: quem buscou foi o servidor, uma vez (o navegador nunca acessou o outro site)', imageHits.map((h) => h.ua), ['LuDraw-ImageFetch/1.0']);

  // 5) link público com senha
  const link = await a.ev(`${MODS}.then(async ({ app }) => { const s = app.useAppStore.getState(); const r = await s.setPublicLink(${JSON.stringify(boardId)}, { enabled: true, accessLevel: 'viewer', password: 'Senha-Do-Link-1' }); const meta = app.useAppStore.getState().boards.find((b) => b.id === ${JSON.stringify(boardId)}); return { ok: r.ok, token: meta.publicLink.token, marker: meta.publicLink.passwordHash }; })`);
  expect('link público com senha criado', link.ok, true);
  expect('o hash da senha não chega ao cliente', link.marker, 'set');

  // 6) sair: a cópia de trabalho deste navegador é apagada
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(6000);
  expect('sair leva à entrada', await a.hash(), '#/login');
  const copyGone = await a.ev(`${MODS}.then(({ cfg }) => localStorage.getItem('ludraw:app@' + cfg.serverKey()) === null || !JSON.parse(localStorage.getItem('ludraw:app@' + cfg.serverKey())).state.user)`);
  expect('cópia de trabalho apagada ao sair', copyGone, true);
  expect('tela de entrada mostra o servidor', /Servidor: Empresa E2E/.test(await a.text()), true);
  expect('Modo Local bloqueado: sem "Continuar sem conta"', /Continuar sem conta/.test(await a.text()), false);
  await a.goto('#/dashboard');
  expect('sem sessão, rotas internas voltam à entrada', await until(a, `location.hash === '#/login'`), true);

  // 7) entrar pela tela
  await a.fillAndSubmit(['ana@example.com', 'senha-errada']);
  expect('senha errada recusada', await until(a, `/E-mail ou senha incorretos/.test(document.body.innerText)`), true);
  await a.fillAndSubmit(['ana@example.com', PASSWORD]);
  expect('entrou pela tela', await until(a, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'ana@example.com' && app.useAppStore.getState().boards.some((b) => b.id === ${JSON.stringify(boardId)}))`), true);

  // 7a) Chat 09 · R5 — Design System LIGADO (padrão do servidor): rodapé da Mesa, menu do usuário e paleta como sempre
  await a.goto('#/');
  expect('DS ligado: /info.designSystem', await a.ev(`fetch('/api/v1/info').then((r) => r.json()).then((i) => i.designSystem)`), true);
  await until(a, `!!document.querySelector('button[aria-label="Menu do usuário"]')`, 8000);
  const dsOn = await a.ev(DS_PROBE);
  expect('DS ligado: rodapé, menu e paleta levam ao Sistema visual', { screen: dsOn.screen >= 1, menu: dsOn.menu, palette: dsOn.palette }, { screen: true, menu: 1, palette: { '(vazia)': 0, 'Sistema visual': 1, 'Design System': 1, tokens: 1 } });
  await a.goto('#/design-system');
  expect('DS ligado: #/design-system abre a tela', await until(a, DS_SCREEN, 8000), true);

  // 7b) quem já tem o board (o próprio dono) abre o link: entra direto, sem senha
  await a.goto(`#/board/${boardId}?share=${link.token}`);
  expect('dono abre o próprio link sem senha', await until(a, `location.hash === '#/board/${boardId}' && !document.querySelector('input[type=password]')`), true);

  // 7c) Chat 08.5 · esqueci a senha → e-mail (pasta de saída) → link → nova senha → entrar
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  expect('saiu para testar a recuperação', await until(a, `location.hash === '#/login'`, 9000), true);
  // sair recarrega a página: espera a entrada nova (store pronta e link visível) antes de seguir
  expect('/info anuncia o e-mail', await until(a, `${MODS}.then(({ app }) => app.useAppStore.getState().serverInfo?.email === true)`, 12000), true);
  expect('link "Esqueci minha senha" na entrada', await until(a, `[...document.querySelectorAll('button')].some((x) => /Esqueci minha senha/.test(x.textContent))`, 12000), true);
  await a.clickText('/Esqueci minha senha/');
  expect('"Esqueci minha senha" abre a tela própria', await until(a, `location.hash === '#/forgot'`), true);
  await a.ev(`window.dispatchEvent(new Event('focus'))`);
  await sleep(2500);
  expect('trocar de aba em #/forgot não volta à entrada', await a.hash(), '#/forgot');
  // espera o próprio formulário (sem depender de tempo: numa máquina carregada a tela pode demorar)
  expect('formulário de "esqueci a senha" na tela', await until(a, `!!document.querySelector('[data-testid=forgot-form]')`), true);
  await a.fillAndSubmit(['ana@example.com']);
  expect('resposta neutra depois de pedir', await until(a, `/Confira sua caixa de entrada/.test(document.body.innerText)`), true);
  const mail = await nextMail(seenMail);
  expect('e-mail de redefinição gravado na pasta de saída', !!mail && /^To: ana@example\.com/m.test(mail), true);
  const resetLink = mail ? (new RegExp(`http://localhost:${VITE_PORT}/#/reset/[A-Za-z0-9_-]{20,}`).exec(mail)?.[0] ?? null) : null;
  expect('link do e-mail aponta para o app configurado', !!resetLink, true);
  if (resetLink) {
    const token = resetLink.split('/').pop();
    await a.goto(resetLink.slice(`http://localhost:${VITE_PORT}/`.length));
    const after = await a.ev(`({ href: location.href, meta: document.querySelector('meta[name=referrer]')?.content ?? null, back: history.length })`);
    expect('o token saiu do endereço ao abrir', after.href.includes(token), false);
    expect('a tela fica em #/reset', new URL(after.href).hash, '#/reset');
    expect('política de referência na tela do token', after.meta, 'no-referrer');
    expect('formulário da nova senha aparece', await until(a, `!!document.querySelector('[data-testid=reset-form]')`), true);
    await a.ev(`window.dispatchEvent(new Event('focus'))`);
    await sleep(2000);
    expect('trocar de aba em #/reset não volta à entrada', await a.hash(), '#/reset');
    await a.fillAndSubmit(['Nova-Senha-E2E-2027!', 'Nova-Senha-E2E-2027!']);
    expect('nova senha salva → volta à entrada', await until(a, `location.hash === '#/login' && /Senha alterada/.test(document.body.innerText)`, 9000), true);
    expect('saiu da tela do token → sem a política de referência', await a.ev(`document.querySelector('meta[name=referrer]') === null`), true);
    await a.fillAndSubmit(['ana@example.com', PASSWORD]);
    expect('senha antiga não entra mais', await until(a, `/E-mail ou senha incorretos/.test(document.body.innerText)`), true);
    await a.fillAndSubmit(['ana@example.com', 'Nova-Senha-E2E-2027!']);
    expect('entrou com a nova senha', await until(a, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'ana@example.com' && app.useAppStore.getState().boards.some((b) => b.id === ${JSON.stringify(boardId)}))`), true);
    // reabrir o mesmo link: já foi usado
    await a.goto(resetLink.slice(`http://localhost:${VITE_PORT}/`.length));
    expect('link usado não vale de novo', await until(a, `/Este link não vale mais/.test(document.body.innerText)`, 9000), true);
    await a.goto('#/');
  }

  // 8) outra pessoa (outro perfil, navegador nunca configurado) abre o link público
  b = await openPage(DEBUG_B);
  await b.goto(`#/board/${boardId}?share=${link.token}`);
  expect('link pede a senha', await until(b, `document.querySelector('input[type=password]') !== null`), true);
  await b.fillAndSubmit(['errada']);
  expect('senha errada do link recusada', await until(b, `document.querySelector('[role=alert]') !== null || /incorreta/i.test(document.body.innerText)`), true);
  await b.fillAndSubmit(['Senha-Do-Link-1']);
  const visitorSees = await until(b, `${MODS}.then(({ board }) => Object.values(board.useBoardStore.getState().elements).some((e) => e.text === 'chegou ao servidor'))`, 15000);
  expect('visitante vê o conteúdo do board', visitorSees, true);
  expect('visitante entra como leitor', await b.ev(`${MODS}.then(({ board }) => board.useBoardStore.getState().access.workspaceRole + ':' + board.useBoardStore.getState().access.shareAccessLevel)`), 'visitor:viewer');

  // 8b) o dono revoga o link → o visitante perde o acesso sem recarregar a página
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().revokePublicLink(${JSON.stringify(boardId)}))`);
  expect('visitante perde o acesso na hora', await until(b, `/Este link foi revogado/.test(document.body.innerText)`, 12000), true);

  // 8c) Chat 08.7 · R4 (S-33): o token do link público sai do endereço; fica no sessionStorage DESTA aba
  // Chat 08.7 · R5 (S-17): o link desse board já existia e, sem chave no ambiente, o endereço só aparece ao criar — gera um
  // novo (como a Ficha faz) para conhecer o token
  const link2 = await a.ev(`${MODS}.then(async ({ app }) => { const fresh = async (s) => { const g = s.regeneratePublicLink(${JSON.stringify(boardId)}); for (let i = 0; i < 60 && !app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)}).publicLink?.token; i++) await new Promise((w) => setTimeout(w, 100)); return g.ok; }; const r = await app.useAppStore.getState().setPublicLink(${JSON.stringify(boardId)}, { enabled: true, accessLevel: 'viewer', password: null }); const ok = await fresh(app.useAppStore.getState()); return { ok: r.ok && ok, token: app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)}).publicLink.token }; })`);
  expect('S-33: link novo criado', link2.ok, true);
  await b.goto(`#/board/${boardId}?share=${link2.token}`);
  expect('S-33: visitante vê o board pelo link', await until(b, `${MODS}.then(({ board }) => Object.values(board.useBoardStore.getState().elements).some((e) => e.text === 'chegou ao servidor'))`, 15000), true);
  const s33 = await b.ev(`(() => { const all = []; for (let i = 0; i < localStorage.length; i++) all.push(localStorage.getItem(localStorage.key(i)) || ''); return { href: location.href, session: sessionStorage.getItem('ludraw:share:' + ${JSON.stringify(boardId)}), inLocal: all.some((v) => v.includes(${JSON.stringify(link2.token)})), meta: document.querySelector('meta[name=referrer]')?.content ?? null }; })()`);
  expect('S-33: o token saiu do endereço', s33.href.includes(link2.token), false);
  expect('S-33: o endereço fica com o marcador "shared=1"', /#\/board\/[^?]+\?shared=1$/.test(s33.href), true);
  expect('S-33: o token fica no sessionStorage desta aba', s33.session, link2.token);
  expect('S-33: o token nunca vai para o localStorage', s33.inLocal, false);
  expect('S-33: política de referência no link público', s33.meta, 'no-referrer');
  await b.reload();
  expect('S-33: recarregar a página mantém o acesso', await until(b, `${MODS}.then(({ board }) => Object.values(board.useBoardStore.getState().elements).some((e) => e.text === 'chegou ao servidor'))`, 15000), true);
  expect('S-33: … e o token continua fora do endereço', (await b.ev('location.href')).includes(link2.token), false);
  const otherTab = await openTab(DEBUG_B, `http://localhost:${VITE_PORT}/#/board/${boardId}?shared=1`);
  await sleep(3000);
  const other = await otherTab.ev(`${MODS}.then(({ board }) => ({ session: sessionStorage.getItem('ludraw:share:' + ${JSON.stringify(boardId)}), sees: Object.values(board.useBoardStore.getState().elements).some((e) => e.text === 'chegou ao servidor') }))`);
  expect('S-33: outra aba (= aba fechada e aberta de novo) não herda o token', other, { session: null, sees: false });
  await otherTab.closeTab();

  // 8c1) Chat 08.7 · R5 (S-17): este servidor roda SEM LUDRAW_JWT_SECRET → o banco guarda só o hash do token. O dono
  //      viu o endereço na criação; depois de recarregar, a Ficha mostra "aparece só na criação" + "Gerar link novo",
  //      e o link continua abrindo para o visitante
  await a.reload();
  await until(a, `${MODS}.then(({ app }) => !!app.useAppStore.getState().user)`, 12000);
  // o estado salvo no navegador ainda pode ter o token até o servidor responder: espera o estado do servidor
  await until(a, `${MODS}.then(({ app }) => app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)})?.publicLink?.token === '')`, 12000);
  const hiddenState = await a.ev(`${MODS}.then(({ app }) => { const l = app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)})?.publicLink; return { token: l?.token ?? null, print: (l?.tokenPrint ?? '').length }; })`);
  expect('S-17: depois de recarregar, o servidor não devolve o endereço (só a impressão)', hiddenState, { token: '', print: 12 });
  await a.ev(`${MODS}.then(({ app }) => { app.useAppStore.getState().openModal({ type: 'share-board', boardId: ${JSON.stringify(boardId)}, tab: 'link' }); return true; })`);
  expect('S-17: a Ficha mostra "aparece só na criação" e "Gerar link novo"', await until(a, `!!document.querySelector('[data-testid=public-link-once]') && !!document.querySelector('[data-testid=public-link-regenerate]')`), true);
  expect('S-17: o link antigo continua abrindo', await b.ev(`fetch('/api/v1/public/links/${link2.token}').then((r) => r.json()).then((j) => j.status)`), 'ok');
  await a.ev(`document.querySelector('[data-testid=public-link-regenerate]').click()`);
  expect('S-17: gerar de novo mostra o endereço novo (uma vez)', await until(a, `!document.querySelector('[data-testid=public-link-once]') && /[?]share=[A-Za-z0-9_-]{32,}/.test(document.querySelector('[role=dialog] input[readonly]')?.value || '')`), true);
  const link2b = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)}).publicLink.token)`);
  expect('S-17: o link antigo parou e o novo abre', [await b.ev(`fetch('/api/v1/public/links/${link2.token}').then((r) => r.json()).then((j) => j.status)`), await b.ev(`fetch('/api/v1/public/links/${link2b}').then((r) => r.json()).then((j) => j.status)`)], ['invalid', 'ok']);
  await a.ev(`${MODS}.then(({ app }) => { app.useAppStore.getState().closeModal(); return true; })`);

  // 8c2) Chat 08.7 · R4 (S-32): código de erro do SSO vindo da URL com nome de protótipo → mensagem padrão (antes: o
  //      React recebia a função `Object` herdada e a linha do motivo ficava vazia)
  for (const code of ['constructor', '__proto__', 'toString']) {
    await b.goto(`#/auth/sso?error=${code}`);
    expect(`S-32: #/auth/sso?error=${code} mostra a mensagem padrão`, await until(b, `/O login da empresa não pôde ser concluído/.test(document.body.innerText)`, 8000), true);
  }

  // 8d) Chat 08.7 · R4 (S-33): o token do convite também sai do endereço
  const inv = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().createInvitation({ email: 'convidado-r4@example.com', role: 'member', expiresInDays: 7, sendEmail: false }))`);
  expect('S-33: convite criado', inv.ok, true);
  await sleep(1500);
  const invTab = await openTab(DEBUG_B, `http://localhost:${VITE_PORT}/#/invite/${inv.token}`);
  // o e-mail do convite fica num campo só de leitura (como na seção 13)
  expect('S-33: a tela do convite abre com o token guardado na aba', await until(invTab, `[...document.querySelectorAll('input[readonly]')].some((i) => i.value === 'convidado-r4@example.com')`, 12000), true);
  const invState = await invTab.ev(`({ href: location.href, meta: document.querySelector('meta[name=referrer]')?.content ?? null })`);
  expect('S-33: o token do convite saiu do endereço', invState.href.includes(inv.token), false);
  expect('S-33: o endereço fica em #/invite', new URL(invState.href).hash, '#/invite');
  await invTab.closeTab();

  // 12) Chat 08.5 · B · link de convite geral: a administração cria → outra pessoa pede pelo link → e-mail →
  //     concluir cadastro → entra como membro; o uso é contado e o token nunca fica no endereço
  const created = await a.ev(`${MODS}.then((m) => m.app.useAppStore.getState().createInviteLink({ role: 'member', maxUses: 3, expiresInDays: 7 }))`);
  expect('link geral criado (token só na criação)', created.ok && typeof created.token === 'string', true);
  expect('link geral chegou ao servidor', await until(a, `${MODS}.then(async ({ api }) => ((await api.api.workspaceState()).inviteLinks ?? []).length === 1)`), true);
  await a.goto('#/admin/members');
  expect('Membros mostra a seção de links com 0/3 usos', await until(a, `!!document.querySelector('[data-testid=invite-links]') && /0\\/3/.test(document.querySelector('[data-testid=invite-links]').textContent)`), true);
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().clearLinkSession?.())`);
  await b.goto(`#/join/${created.token}`);
  const joinUrl = await b.ev(`({ href: location.href, meta: document.querySelector('meta[name=referrer]')?.content ?? null })`);
  expect('o token do link geral saiu do endereço', joinUrl.href.includes(created.token), false);
  expect('tela do link geral com política de referência', joinUrl.meta, 'no-referrer');
  expect('formulário do link geral', await until(b, `!!document.querySelector('[data-testid=join-form]')`), true);
  await b.fillAndSubmit(['nova@example.com']);
  expect('link geral responde de forma neutra', await until(b, `!!document.querySelector('[data-testid=access-done]')`), true);
  const signupMail = await nextMailTo('nova@example.com');
  const signupLink = signupMail ? (new RegExp(`http://localhost:${VITE_PORT}/#/signup/[A-Za-z0-9_-]{20,}`).exec(signupMail)?.[0] ?? null) : null;
  expect('e-mail com o link de cadastro', !!signupLink, true);
  if (signupLink) {
    await b.goto(signupLink.slice(`http://localhost:${VITE_PORT}/`.length));
    expect('o token do cadastro saiu do endereço', (await b.ev('location.href')).includes(signupLink.split('/').pop()), false);
    expect('formulário de cadastro', await until(b, `!!document.querySelector('[data-testid=signup-form]')`), true);
    // senha sem o nome da pessoa (a regra de força recusa senha que contém o nome)
    await b.fillAndSubmit(['Nova Pessoa', 'Quadro-Azul-Forte-2027!', 'Quadro-Azul-Forte-2027!']);
    expect('cadastro concluído → entrou como membro', await until(b, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'nova@example.com')`, 12000), true);
    expect('o uso do link foi contado', await until(a, `${MODS}.then(async ({ api }) => ((await api.api.workspaceState()).inviteLinks ?? [])[0]?.uses === 1)`), true);
  }
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(4000);

  // 13) Chat 08.5 · B · pedido de acesso: política ligada → "Pedir acesso" no Login → confirmar pelo e-mail → a
  //     administração aprova pela tela → convite por e-mail → aceitar → membro
  expect('Login sem "Pedir acesso" com a política desligada', await b.ev(`!document.querySelector('[data-testid=login-request-access]')`), true);
  const policy = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowAccessRequests: true }))`);
  expect('política "Aceitar pedidos de acesso" ligada', policy.ok, true);
  expect('política chegou ao servidor', await until(a, `fetch('/api/v1/info').then((r) => r.json()).then((i) => i.accessRequests === true)`), true);
  await b.goto('#/login');
  await b.reload();
  expect('Login mostra "Pedir acesso"', await until(b, `!!document.querySelector('[data-testid=login-request-access]')`), true);
  await b.ev(`document.querySelector('[data-testid=login-request-access]').click()`);
  expect('abre #/request-access', await until(b, `location.hash === '#/request-access' && !!document.querySelector('[data-testid=request-form]')`), true);
  await b.fillAndSubmit(['Caio Silva', 'caio@example.com']);
  expect('pedido responde de forma neutra', await until(b, `!!document.querySelector('[data-testid=access-done]')`), true);
  const confirmMail = await nextMailTo('caio@example.com');
  const confirmLink = confirmMail ? (new RegExp(`http://localhost:${VITE_PORT}/#/access/[A-Za-z0-9_-]{20,}`).exec(confirmMail)?.[0] ?? null) : null;
  expect('e-mail de confirmação do pedido', !!confirmLink, true);
  if (confirmLink) {
    await b.goto(confirmLink.slice(`http://localhost:${VITE_PORT}/`.length));
    expect('pedido confirmado', await until(b, `/Pedido confirmado/.test(document.body.innerText)`), true);
    await a.reload();
    expect('pedido aparece para a administração', await until(a, `!!document.querySelector('[data-access-request="caio@example.com"]')`, 12000), true);
    await a.ev(`document.querySelector('[data-access-request="caio@example.com"] [data-testid=approve-request]').click()`);
    expect('aprovar abre papel e validade', await until(a, `!!document.querySelector('[data-testid=approve-submit]')`), true);
    await a.ev(`document.querySelector('[data-testid=approve-submit]').click()`);
    expect('pedido aprovado', await until(a, `/Pedido aprovado/.test(document.body.innerText)`), true);
    const inviteMail = await nextMailTo('caio@example.com');
    const inviteLink = inviteMail ? (new RegExp(`http://localhost:${VITE_PORT}/#/invite/[A-Za-z0-9_-]{8,}`).exec(inviteMail)?.[0] ?? null) : null;
    expect('convite chegou por e-mail', !!inviteLink, true);
    if (inviteLink) {
      await b.goto(inviteLink.slice(`http://localhost:${VITE_PORT}/`.length));
      await b.reload();
      // o e-mail do convite fica num campo só de leitura (não no texto da página)
      expect('tela do convite com o e-mail do pedido', await until(b, `!!document.querySelector('form') && [...document.querySelectorAll('input[readonly]')].some((i) => i.value === 'caio@example.com')`), true);
      await b.fillAndSubmit(['Caio Silva', 'Quadro-Roxo-Forte-2027!']);
      expect('convite aceito → membro com e-mail confirmado', await until(b, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'caio@example.com' && app.useAppStore.getState().serverAuth?.emailVerified === true)`, 12000), true);
    }
  }
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(3000);

  // 13b) Chat 08.5 · B2 · e-mail pelo painel. (1) Neste servidor o e-mail vem da pasta de saída (variável):
  //      o cartão aparece travado, sem salvar. (2) Num servidor sem e-mail nas variáveis, a administração
  //      configura pelo painel, salva, o /info.email liga sem reiniciar e a senha nunca volta para a tela.
  await a.goto('#/admin/policies');
  expect('cartão de e-mail na administração', await until(a, `!!document.querySelector('[data-testid=mail-settings]')`, 12000), true);
  expect('pasta de saída: cartão só leitura (sem salvar)', await a.ev(`!document.querySelector('[data-testid=mail-save]') && /LUDRAW_MAIL_OUTBOX_DIR/.test(document.querySelector('[data-testid=mail-settings]').innerText)`), true);

  await waitFor(`http://127.0.0.1:${PANEL_API_PORT}/health`);
  await waitFor(`http://localhost:${VITE_PANEL_PORT}/favicon.svg`);
  const panelHeaders = { 'content-type': 'application/json', 'x-ludraw-client': '1', origin: `http://localhost:${VITE_PANEL_PORT}` };
  const panelSetup = await fetch(`http://localhost:${VITE_PANEL_PORT}/api/v1/setup/complete`, {
    method: 'POST',
    headers: panelHeaders,
    body: JSON.stringify({ token: SETUP_TOKEN, mode: 'single_org', organization: { name: 'Painel Exemplo', allowedEmailDomains: [] }, admin: { name: 'Ana Admin', email: 'ana@example.com', password: PASSWORD } }),
  });
  expect('servidor do painel configurado', panelSetup.status, 200);
  const panelInfo = () => fetch(`http://localhost:${VITE_PANEL_PORT}/api/v1/info`).then((r) => r.json());
  expect('sem e-mail antes do painel', (await panelInfo()).email, false);
  await b.goto('#/login', VITE_PANEL_PORT);
  await b.reload();
  expect('login no servidor do painel', await until(b, `!!document.querySelector('form input[type=email]')`, 12000), true);
  await b.fillAndSubmit(['ana@example.com', PASSWORD]);
  expect('entrou no servidor do painel', await until(b, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'ana@example.com')`, 15000), true);
  await sleep(2500);
  for (let i = 0; i < 4 && !(await b.ev(`!!document.querySelector('[data-testid=mail-host]')`)); i++) {
    await b.goto('#/admin/policies', VITE_PANEL_PORT);
    await until(b, `!!document.querySelector('[data-testid=mail-host]')`, 6000);
  }
  expect('cartão editável no servidor sem variáveis de e-mail', await b.ev(`!!document.querySelector('[data-testid=mail-host]') && !!document.querySelector('[data-testid=mail-save]')`), true);
  await b.ev(`(async () => {
    const set = (sel, v) => { const el = document.querySelector(sel); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); };
    const toggle = [...document.querySelectorAll('[data-testid=mail-settings] label')].find((l) => /Usar a configuração deste painel/.test(l.textContent)).querySelector('input, button');
    toggle.click();
    set('[data-testid=mail-host]', '127.0.0.1');
    set('[data-testid=mail-port]', '2525');
    set('[data-testid=mail-user]', 'robo');
    set('[data-testid=mail-password]', ${JSON.stringify(PANEL_SMTP_PASSWORD)});
    set('[data-testid=mail-from]', 'LuDraw <no-reply@example.com>');
    await new Promise((r) => setTimeout(r, 150));
    document.querySelector('[data-testid=mail-save]').click();
  })()`);
  expect('salvou pelo painel', await until(b, `/Configuração de e-mail salva/.test(document.body.innerText)`, 10000), true);
  expect('/info.email ligou sem reiniciar', await until(b, `fetch('/api/v1/info').then((r) => r.json()).then((i) => i.email === true)`), true);
  expect('o app acompanha (serverInfo.email)', await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().serverInfo?.email === true)`), true);
  await b.reload();
  expect('cartão recarregado', await until(b, `!!document.querySelector('[data-testid=mail-password]')`, 12000), true);
  const afterReload = await b.ev(`(() => { const pw = document.querySelector('[data-testid=mail-password]'); return { value: pw.value, placeholder: pw.placeholder, host: document.querySelector('[data-testid=mail-host]').value, html: document.documentElement.outerHTML.includes(${JSON.stringify(PANEL_SMTP_PASSWORD)}) }; })()`);
  expect('senha não volta para a tela (só "Definida")', { value: afterReload.value, defined: /Definida/.test(afterReload.placeholder), host: afterReload.host, inPage: afterReload.html }, { value: '', defined: true, host: '127.0.0.1', inPage: false });
  const panelState = await b.ev(`${MODS}.then(({ api }) => api.api.mailSettings()).then((v) => JSON.stringify(v))`);
  expect('API do painel sem a senha', panelState.includes(PANEL_SMTP_PASSWORD) || !/"passwordSet":true/.test(panelState), false);
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(2500);

  // 14) Chat 08.5 · C · cadastro com o e-mail da organização: a administração cadastra o domínio e liga a política →
  //     o Login oferece "Criar conta com o e-mail da organização" → e-mail → concluir → membro. Outro domínio:
  //     mesma tela neutra e nenhum e-mail.
  await b.goto('#/login');
  await b.reload();
  expect('Login sem o cadastro pelo domínio com a política desligada', await b.ev(`!document.querySelector('[data-testid=login-domain-signup]')`), true);
  const ws = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updateWorkspace({ allowedEmailDomains: ['empresa.com'] }))`);
  expect('domínio cadastrado', ws.ok, true);
  expect('domínio chegou ao servidor', await until(a, `${MODS}.then(async ({ api }) => (await api.api.workspaceState()).workspace.allowedEmailDomains.includes('empresa.com'))`), true);
  const dsPolicy = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowDomainSignup: true }))`);
  expect('política "cadastro com o e-mail da organização" ligada', dsPolicy.ok, true);
  expect('/info oferece o cadastro', await until(a, `fetch('/api/v1/info').then((r) => r.json()).then((i) => i.registration === 'domain')`), true);
  await b.reload();
  expect('Login mostra o cadastro pelo domínio', await until(b, `!!document.querySelector('[data-testid=login-domain-signup]')`), true);
  await b.ev(`document.querySelector('[data-testid=login-domain-signup]').click()`);
  expect('abre #/register', await until(b, `location.hash === '#/register' && !!document.querySelector('[data-testid=register-form]')`), true);
  expect('a tela não mostra os domínios aceitos', await b.ev(`!/empresa\\.com/.test(document.body.innerText)`), true);
  await b.fillAndSubmit(['zeca@fora.com']);
  expect('domínio fora: tela neutra', await until(b, `!!document.querySelector('[data-testid=register-done]')`), true);
  await b.goto('#/login');
  await b.reload();
  await b.ev(`document.querySelector('[data-testid=login-domain-signup]')?.click()`);
  await until(b, `!!document.querySelector('[data-testid=register-form]')`);
  await b.fillAndSubmit(['Nova.Dominio@Empresa.com']);
  expect('domínio da organização: a mesma tela neutra', await until(b, `!!document.querySelector('[data-testid=register-done]')`), true);
  const domainMail = await nextMailTo('nova.dominio@empresa.com');
  const domainLink = domainMail ? (new RegExp(`http://localhost:${VITE_PORT}/#/signup/[A-Za-z0-9_-]{20,}`).exec(domainMail)?.[0] ?? null) : null;
  expect('e-mail com o link de cadastro (domínio)', !!domainLink, true);
  expect('domínio fora não recebeu e-mail', await nextMailTo('zeca@fora.com', 1500), null);
  if (domainLink) {
    await b.goto(domainLink.slice(`http://localhost:${VITE_PORT}/`.length));
    expect('o token do cadastro (domínio) saiu do endereço', (await b.ev('location.href')).includes(domainLink.split('/').pop()), false);
    expect('formulário de cadastro (domínio)', await until(b, `!!document.querySelector('[data-testid=signup-form]')`), true);
    await b.fillAndSubmit(['Nova Dominio', 'Lousa-Verde-Pistache-2028!', 'Lousa-Verde-Pistache-2028!']);
    expect('cadastro pelo domínio → membro com e-mail confirmado', await until(b, `${MODS}.then(({ app }) => { const s = app.useAppStore.getState(); return s.user?.email === 'nova.dominio@empresa.com' && s.serverAuth?.emailVerified === true; })`, 12000), true);
    expect('entrou como membro', await until(b, `${MODS}.then(({ app }) => { const s = app.useAppStore.getState(); return s.directory.find((x) => x.email === 'nova.dominio@empresa.com')?.workspaceRole === 'member'; })`), true);
  }
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowDomainSignup: false }))`);
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(3000);

  // 15) Chat 08.5 · D: Modo Local permitido pelo servidor — textos novos, escolha salva, faixa/selo/aviso, voltar ao
  //     servidor (gravando o board; falha = desiste), política desligada apaga a escolha e os boards locais continuam
  //     oferecidos para trazer no Modo Servidor
  const localCases = await b.ev(`import('/src/utils/serverConfig.ts').then((cfg) => {
    const info = (localMode) => ({ name: 'ludraw', apiVersion: 1, version: '0', setupRequired: false, mode: 'single_org', organizationName: 'X', sso: { enabled: false, label: null }, registration: 'invite_only', localMode });
    const base = { forceLocal: false, devBuild: false, explicitUrl: null, explicitInfo: null, sameOrigin: 'https://d.example.com', sameOriginInfo: null, saved: null };
    const local = { mode: 'local', override: true };
    const manual = { mode: 'server', url: 'https://casa.example.com' };
    const run = (inputs) => cfg.forgetLocalChoice(inputs.saved, cfg.decideConnection(inputs));
    return {
      blocked: run({ ...base, sameOriginInfo: info('blocked'), saved: local }),
      offline: run({ ...base, explicitUrl: 'https://api.example.com', saved: local }),
      allowed: run({ ...base, sameOriginInfo: info('allowed'), saved: local }),
      manual: run({ ...base, sameOriginInfo: info('blocked'), saved: manual }),
      none: run({ ...base, sameOriginInfo: info('blocked') }),
    };
  })`);
  expect('forgetLocalChoice: só apaga com o servidor respondendo "bloqueado"', localCases, { blocked: true, offline: false, allowed: false, manual: false, none: false });
  const allowLocal = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowLocalMode: true }))`);
  expect('política "Permitir modo local" ligada', allowLocal.ok, true);
  expect('/info libera o Modo Local', await until(a, `fetch('/api/v1/info').then((r) => r.json()).then((i) => i.localMode === 'allowed')`), true);
  await b.goto('#/login');
  await b.reload();
  expect('Login do servidor: "Usar só neste navegador (sem sincronizar)"', await until(b, `/Usar só neste navegador \\(sem sincronizar\\)/.test(document.body.innerText)`, 12000), true);
  expect('… com a dica de que não sincroniza', /apenas neste navegador e não vão para o servidor/.test(await b.text()), true);
  expect('… sem o texto antigo', /Usar o Modo Local neste navegador/.test(await b.text()), false);
  const useLocalHere = `[...document.querySelectorAll('[role=dialog] button')].find((x) => /Usar só neste navegador/.test(x.textContent))`;
  const chooseLocal = async (label) => {
    await b.clickText('/Usar só neste navegador/');
    expect(`${label}: o modal usa o mesmo rótulo`, await until(b, `!!${useLocalHere}`), true);
    await b.ev(`${useLocalHere}.click()`);
    await sleep(6500);
    expect(`${label}: recarregou no Modo Local escolhido`, await until(b, `${MODS}.then(({ cfg }) => cfg.connection.mode + ':' + cfg.connection.source === 'local:local-choice')`, 15000), true);
    expect(`${label}: escolha gravada neste navegador`, await b.ev(`localStorage.getItem('ludraw:server')`), JSON.stringify({ mode: 'local', override: true }));
  };
  await chooseLocal('escolher o Local');
  expect('entrada local: "Continuar sem conta" + "Só neste navegador, sem sincronizar"', await until(b, `/Continuar sem conta/.test(document.querySelector('[data-testid=login-continue-local]')?.innerText || '') && /Só neste navegador, sem sincronizar/.test(document.querySelector('[data-testid=login-continue-local]')?.innerText || '')`), true);
  expect('… e "Entrar no servidor “Empresa E2E”"', /Entrar no servidor “Empresa E2E”/.test(await b.text()), true);
  await b.clickText('/Continuar sem conta/');
  expect('Mesa com a faixa do Modo Local', await until(b, `!!document.querySelector('[data-testid=local-mode-banner]')`), true);
  expect('a faixa não tem "Agora não" (um só botão)', await b.ev(`document.querySelectorAll('[data-testid=local-mode-banner] button').length`), 1);
  await b.reload();
  expect('recarregar: pula a entrada e a faixa continua', await until(b, `!!document.querySelector('[data-testid=local-mode-banner]') && location.hash !== '#/login'`), true);
  const localBoardId = await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().createBoard({ name: 'Rascunho local', template: 'blank', open: true, place: { kind: 'personal' } }))`);
  expect('board local aberto', await until(b, `!!document.querySelector('[data-testid=studio-bar]')`, 12000), true);
  await b.ev(`${MODS}.then(({ board, factory }) => board.useBoardStore.getState().addElements([factory.createStickyNote({ x: 0, y: 0, text: 'fica neste navegador' })]))`);
  expect('selo "Só neste navegador" na Ficha', await until(b, `!!document.querySelector('[data-studio-part=ficha] [data-testid=local-only-badge]')`), true);
  await b.ev(`document.querySelector('[data-testid=local-only-badge]').click()`);
  expect('o selo abre a gaveta Você com o aviso no topo', await until(b, `document.querySelector('[data-testid=you-drawer]')?.firstElementChild?.getAttribute('data-testid') === 'local-mode-notice'`), true);
  // ajuste 1: a gravação falha → não troca de modo, avisa e o board continua aberto
  await b.ev(`import('/src/utils/boardRepository.ts').then((m) => { m.localBoardRepository.trySaveBoard = async () => false; return true; })`);
  await b.ev(`document.querySelector('[data-testid=local-notice-enter]').click()`);
  expect('gravação falhou: aviso de erro', await until(b, `/Não deu para gravar o board neste navegador/.test(document.body.innerText)`), true);
  await sleep(2500);
  expect('… e continua no Modo Local, no mesmo board', await b.ev(`${MODS}.then(({ cfg, board }) => cfg.connection.mode + ':' + (board.useBoardStore.getState().boardId === ${JSON.stringify(localBoardId)}) + ':' + localStorage.getItem('ludraw:server'))`), `local:true:${JSON.stringify({ mode: 'local', override: true })}`);
  expect('… com o botão liberado para tentar de novo', await b.ev(`!document.querySelector('[data-testid=local-notice-enter]').disabled`), true);
  await b.ev(`import('/src/utils/boardRepository.ts').then((m) => { delete m.localBoardRepository.trySaveBoard; return true; })`);
  await b.ev(`document.querySelector('[data-testid=local-notice-enter]').click()`);
  await sleep(6500);
  expect('"Entrar no servidor" volta ao Modo Servidor e apaga a escolha', await until(b, `${MODS}.then(({ cfg }) => cfg.connection.mode + ':' + cfg.connection.source + ':' + localStorage.getItem('ludraw:server') === 'server:same-origin:null')`, 15000), true);
  expect('… o board local foi gravado antes de sair', await b.ev(`import('/src/utils/boardRepository.ts').then(async (m) => Object.values((await m.localBoardRepository.loadBoard(${JSON.stringify(localBoardId)}))?.elements ?? {}).some((e) => e.text === 'fica neste navegador'))`), true);
  expect('… e a tela é a entrada do servidor', await until(b, `/Servidor: Empresa E2E/.test(document.body.innerText)`), true);
  // ajuste 6: de volta ao Local (a entrada local é pulada: o perfil ficou salvo) e o admin bloqueia o Modo Local
  await chooseLocal('voltar ao Local');
  expect('… direto na Mesa (escolha salva pula a entrada)', await until(b, `!!document.querySelector('[data-testid=local-mode-banner]')`), true);
  const blockLocal = await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowLocalMode: false }))`);
  expect('política "Permitir modo local" desligada', blockLocal.ok, true);
  expect('/info bloqueia o Modo Local', await until(a, `fetch('/api/v1/info').then((r) => r.json()).then((i) => i.localMode === 'blocked')`), true);
  await b.reload();
  expect('Local bloqueado: o boot cai no Modo Servidor travado', await until(b, `${MODS}.then(({ cfg }) => cfg.connection.mode + ':' + cfg.connection.locked === 'server:true')`, 15000), true);
  expect('… e a escolha local salva foi apagada', await b.ev(`localStorage.getItem('ludraw:server')`), null);
  expect('… sem "Usar só neste navegador" na entrada', await until(b, `/Servidor: Empresa E2E/.test(document.body.innerText) && !/Usar só neste navegador/.test(document.body.innerText)`), true);
  // ajuste 2: os boards locais continuam no navegador e a Mesa do servidor oferece trazê-los
  // a §7c trocou a senha da Ana pelo link de redefinição
  await b.fillAndSubmit(['ana@example.com', 'Nova-Senha-E2E-2027!']);
  expect('entrou no servidor nesta janela', await until(b, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'ana@example.com')`, 12000), true);
  expect('com o Local bloqueado, a Mesa oferece "Trazer boards deste navegador"', await until(b, `!!document.querySelector('[data-testid=import-local-banner]')`, 12000), true);
  expect('… e a faixa do Modo Local não aparece no servidor', await b.ev(`!document.querySelector('[data-testid=local-mode-banner]')`), true);
  await b.ev(`[...document.querySelectorAll('[data-testid=import-local-banner] button')][0].click()`);
  expect('… a lista traz o board local', await until(b, `[...document.querySelectorAll('[role=dialog]')].some((d) => /Rascunho local/.test(d.textContent))`), true);
  await b.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  // religar a política não devolve ninguém ao Local sozinho
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowLocalMode: true }))`);
  expect('/info volta a liberar', await until(a, `fetch('/api/v1/info').then((r) => r.json()).then((i) => i.localMode === 'allowed')`), true);
  await b.reload();
  expect('religar a política: continua no Modo Servidor (a escolha foi apagada)', await until(b, `${MODS}.then(({ cfg }) => cfg.connection.mode + ':' + cfg.connection.source === 'server:same-origin')`, 15000), true);
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().updatePolicies({ allowLocalMode: false }))`);

  // 15b) Chat 08.7 · R4 (S-29): sair apaga só o que é do servidor; outra aba segurando o banco → limpeza adiada
  const key = await b.ev(`${MODS}.then(({ cfg }) => cfg.serverKey())`);
  const link3 = await b.ev(`${MODS}.then(async ({ app }) => { const fresh = async (s) => { const g = s.regeneratePublicLink(${JSON.stringify(boardId)}); for (let i = 0; i < 60 && !app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)}).publicLink?.token; i++) await new Promise((w) => setTimeout(w, 100)); return g.ok; }; await app.useAppStore.getState().setPublicLink(${JSON.stringify(boardId)}, { enabled: true, accessLevel: 'viewer' }); await fresh(app.useAppStore.getState()); return app.useAppStore.getState().boards.find((x) => x.id === ${JSON.stringify(boardId)}).publicLink.token; })`);
  expect('S-29: link novo conhecido nesta sessão (base da verificação do vazamento)', typeof link3 === 'string' && link3.length >= 32, true);
  await sleep(1500);
  const LOCAL_SNAPSHOT = `import('/src/utils/boardRepository.ts').then(async (m) => ({ app: localStorage.getItem('ludraw:app'), board: Object.values((await m.localBoardRepository.loadBoard(${JSON.stringify(localBoardId)}))?.elements ?? {}).some((e) => e.text === 'fica neste navegador') }))`;
  const localBefore = await b.ev(LOCAL_SNAPSHOT);
  expect('S-29: antes de sair — a cópia do servidor tem o token do link e e-mails (o teste enxerga o vazamento)', await b.ev(`(() => { const raw = localStorage.getItem('ludraw:app@' + ${JSON.stringify(key)}) || ''; return raw.includes(${JSON.stringify(link3)}) && raw.includes('ana@example.com'); })()`), true);
  expect('S-29: antes de sair — Modo Local com o board local', localBefore.board, true);
  const SRV_LIVE_DBS = `indexedDB.databases().then((l) => l.map((d) => d.name).filter((n) => n && n.startsWith('ludraw-srv-' + ${JSON.stringify(key)} + '-y-')).sort())`;
  // o que a cópia de trabalho guarda: boards, versões e extensões/armazenamento das extensões do Modo Servidor
  const SRV_COPY = `import('/src/utils/boardRepository.ts').then(async (m) => ({ ext: (await m.serverBoardRepository.getExtensionMeta('storage:dev.teste.r4')) ?? null, boards: await new Promise((ok) => { const r = indexedDB.open('ludraw-srv-' + ${JSON.stringify(key)}); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('boards')) { db.close(); return ok(0); } const q = db.transaction('boards').objectStore('boards').count(); q.onsuccess = () => { db.close(); ok(q.result); }; q.onerror = () => { db.close(); ok(-1); }; }; r.onerror = () => ok(-1); }) }))`;
  await b.ev(`import('/src/utils/boardRepository.ts').then(async (m) => { await m.serverBoardRepository.setExtensionMeta('storage:dev.teste.r4', { segredo: 'da-organizacao' }); await m.serverBoardRepository.loadBoard(${JSON.stringify(boardId)}); return true; })`);
  const copyBefore = await b.ev(SRV_COPY);
  expect('S-29: antes de sair — a cópia do servidor tem board e dado de extensão', copyBefore.boards > 0 && copyBefore.ext?.segredo === 'da-organizacao', true);
  // mudanças pendentes (na janela do admin): a janela pergunta; "Cancelar" mantém a sessão
  await a.ev(`import('/src/utils/boardRepository.ts').then((m) => { m.serverBoardRepository.hasUnsynced = () => true; return true; })`);
  await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  expect('S-29: com mudança não enviada, sair pergunta antes', await until(a, `!!document.querySelector('[data-testid=logout-download]') && !!document.querySelector('[data-testid=logout-discard]')`), true);
  await a.ev(`document.querySelector('[data-testid=logout-cancel]')?.click(); true`);
  await sleep(800);
  expect('S-29: "Cancelar" mantém a sessão', await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().user?.email ?? null)`), 'ana@example.com');
  await a.ev(`import('/src/utils/boardRepository.ts').then((m) => { delete m.serverBoardRepository.hasUnsynced; return true; })`);
  // outra aba do mesmo perfil segura o banco do servidor (não fecha a conexão: simula uma aba travada)
  const holder = await openTab(DEBUG_B, `http://localhost:${VITE_PORT}/favicon.svg`);
  expect('S-29: outra aba abriu o banco do servidor', await holder.ev(`new Promise((ok) => { const r = indexedDB.open('ludraw-srv-' + ${JSON.stringify(key)}); r.onsuccess = () => { window.__held = r.result; ok(true); }; r.onerror = () => ok(false); })`), true);
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(6500);
  expect('S-29: sair leva à entrada', await until(b, `location.hash === '#/login'`, 12000), true);
  const after = await b.ev(`(() => { const raw = localStorage.getItem('ludraw:app@' + ${JSON.stringify(key)}) || ''; let st = {}; try { st = JSON.parse(raw).state || {}; } catch {} const all = []; for (let i = 0; i < localStorage.length; i++) all.push(localStorage.getItem(localStorage.key(i)) || ''); return { token: all.some((v) => v.includes(${JSON.stringify(link3)})), email: raw.includes('ana@example.com'), org: raw.includes('Empresa E2E'), lists: [st.boards, st.directory, st.auditLog, st.invitations].map((x) => (Array.isArray(x) ? x.length : 0)), theme: typeof st.theme, pending: JSON.parse(localStorage.getItem('ludraw:wipe-pending') || '[]'), share: Object.keys(sessionStorage).filter((k) => k.startsWith('ludraw:share:')).length }; })()`);
  expect('S-29: depois de sair, nenhum token de link público no localStorage', after.token, false);
  expect('S-29: … nem e-mails do diretório', after.email, false);
  expect('S-29: … nem o nome da organização', after.org, false);
  expect('S-29: … boards, diretório, auditoria e convites vazios', after.lists, [0, 0, 0, 0]);
  expect('S-29: … as preferências de tela continuam', after.theme, 'string');
  expect('S-29: … nenhum token de link na aba', after.share, 0);
  expect('S-29: outra aba segurando o banco → limpeza adiada', after.pending, [key]);
  expect('S-29: o Modo Local continua intacto (estado e board)', await b.ev(LOCAL_SNAPSHOT), localBefore);
  await holder.closeTab();
  await b.reload();
  await sleep(1500);
  expect('S-29: no próximo carregamento a limpeza adiada termina (documentos ao vivo apagados)', await b.ev(SRV_LIVE_DBS), []);
  expect('S-29: … e a cópia de trabalho recomeça vazia (sem board nem dado de extensão do servidor)', await b.ev(SRV_COPY), { ext: null, boards: 0 });
  expect('S-29: … e a pendência some', await b.ev(`localStorage.getItem('ludraw:wipe-pending')`), null);
  expect('S-29: … sem apagar o Modo Local', await b.ev(LOCAL_SNAPSHOT), localBefore);
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(3000);

  // 9) ?local=1 em desenvolvimento: Modo Local mesmo com o servidor bloqueando; nada do servidor aparece
  await a.goto('?local=1#/');
  await a.reload();
  const local = await a.ev(`${MODS}.then(({ app, cfg }) => ({ mode: cfg.connection.mode, hasServerBoard: app.useAppStore.getState().boards.some((b) => b.id === ${JSON.stringify(boardId)}), org: app.useAppStore.getState().workspace.name }))`);
  expect('voltou ao Modo Local sem os dados do servidor', { mode: local.mode, hasServerBoard: local.hasServerBoard }, { mode: 'local', hasServerBoard: false });

  // 10) servidor fora do ar (proxy para uma porta vazia): a detecção cai no Modo Local
  await waitFor(`http://localhost:${VITE_DEAD_PORT}/favicon.svg`);
  await b.goto('#/', VITE_DEAD_PORT);
  const fallback = await b.ev(`import('/src/utils/serverConfig.ts').then((cfg) => cfg.connection.mode + ':' + cfg.connection.source)`);
  expect('sem servidor → Modo Local', fallback, 'local:default');
  expect('Modo Local oferece "Continuar sem conta"', await until(b, `/Continuar sem conta/.test(document.body.innerText)`), true);

  expect('sem servidor (Modo Local): o Sistema visual fica ligado na entrada', (await b.ev(DS_PROBE)).screen >= 1, true);
  await b.goto('#/design-system', VITE_DEAD_PORT);
  expect('sem servidor: #/design-system abre a tela', await until(b, DS_SCREEN, 8000), true);

  // 16) Chat 09 · R5 — instalação com LUDRAW_ENABLE_DESIGN_SYSTEM=false, em multi_org (e-mail ligado):
  //     nada leva ao Sistema visual (entrada, Mesa, menu, paleta e busca), a rota volta à tela inicial — inclusive no
  //     Modo Local servido por essa instalação — e a Administração não mostra o painel de e-mail
  await waitFor(`http://127.0.0.1:${DSOFF_API_PORT}/health`);
  await waitFor(`http://localhost:${VITE_DSOFF_PORT}/favicon.svg`);
  const offHeaders = { 'content-type': 'application/json', 'x-ludraw-client': '1', origin: `http://localhost:${VITE_DSOFF_PORT}` };
  const offSetup = await fetch(`http://localhost:${VITE_DSOFF_PORT}/api/v1/setup/complete`, {
    method: 'POST',
    headers: offHeaders,
    body: JSON.stringify({ token: SETUP_TOKEN, mode: 'multi_org', organization: { name: 'Sem DS Exemplo', allowedEmailDomains: [] }, admin: { name: 'Olga Admin', email: 'olga@example.com', password: PASSWORD } }),
  });
  expect('DS desligado: servidor multi_org configurado', offSetup.status, 200);
  const offInfo = await fetch(`http://localhost:${VITE_DSOFF_PORT}/api/v1/info`).then((r) => r.json());
  expect('DS desligado: /info', { designSystem: offInfo.designSystem, mode: offInfo.mode, email: offInfo.email }, { designSystem: false, mode: 'multi_org', email: true });
  await b.goto('#/login', VITE_DSOFF_PORT);
  await b.reload();
  expect('DS desligado: entrada do servidor', await until(b, `!!document.querySelector('form input[type=email]')`, 12000), true);
  const offLogin = await b.ev(DS_PROBE);
  expect('DS desligado: entrada sem link nem texto', { href: offLogin.href, text: offLogin.text, screen: offLogin.screen }, { href: 0, text: false, screen: 0 });
  await b.goto('#/design-system', VITE_DSOFF_PORT);
  expect('DS desligado: sem conta, #/design-system cai na entrada (não abre a tela)', await until(b, `location.hash === '#/login' && !(${DS_SCREEN})`, 8000), true);
  await b.fillAndSubmit(['olga@example.com', PASSWORD]);
  expect('DS desligado: entrou', await until(b, `${MODS}.then(({ app }) => app.useAppStore.getState().user?.email === 'olga@example.com')`, 15000), true);
  await until(b, `!!document.querySelector('button[aria-label="Menu do usuário"]')`, 8000);
  await sleep(800);
  const offMesa = await b.ev(DS_PROBE);
  expect('DS desligado: Mesa, menu e paleta sem o Sistema visual', offMesa, { href: 0, text: false, screen: 0, menu: 0, palette: { '(vazia)': 0, 'Sistema visual': 0, 'Design System': 0, tokens: 0 } });
  await b.ev(`(() => { location.hash = '#/design-system'; return true; })()`);
  expect('DS desligado: #/design-system redireciona para a tela inicial', await until(b, `location.hash === '#/' && !(${DS_SCREEN})`, 8000), true);
  await sleep(600);
  expect('DS desligado: a tela não chegou a aparecer depois', await b.ev(DS_SCREEN), false);
  // multi_org: a seção de e-mail não existe na Administração (as rotas também recusam — server/test/feature-gates)
  await b.goto('#/admin/policies', VITE_DSOFF_PORT);
  expect('multi_org: Políticas abre', await until(b, `!!document.querySelector('main') && /Domínios|Políticas/.test(document.querySelector('main').innerText)`, 12000), true);
  await sleep(1500);
  expect('multi_org: sem a seção de e-mail', await b.ev(`!document.querySelector('[data-testid=mail-settings]')`), true);
  expect('multi_org: a rota do painel recusa', await b.ev(`${MODS}.then(({ api }) => api.api.mailSettings().then(() => 'ok', (e) => e.code ?? String(e)))`), 'mailSettingsServerOnly');
  await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().logout())`);
  await sleep(2500);
  // Modo Local servido por esta instalação: segue o /info do servidor encontrado → continua desligado
  await b.goto('?local=1#/', VITE_DSOFF_PORT);
  await b.reload();
  expect('DS desligado no Modo Local da instalação: modo', await b.ev(`${MODS}.then(({ cfg }) => cfg.connection.mode + ':' + (cfg.connection.available?.info?.designSystem))`), 'local:false');
  await until(b, `/Continuar sem conta/.test(document.body.innerText)`, 8000);
  const offLocal = await b.ev(DS_PROBE);
  expect('DS desligado no Modo Local da instalação: entrada sem link', { href: offLocal.href, text: offLocal.text, screen: offLocal.screen }, { href: 0, text: false, screen: 0 });
  await b.ev(`(() => { location.hash = '#/design-system'; return true; })()`);
  expect('DS desligado no Modo Local da instalação: a rota não abre a tela', await until(b, `location.hash !== '#/design-system' && !(${DS_SCREEN})`, 8000), true);

  const errs = [...a.errors, ...b.errors].filter((e) => !/ResizeObserver/.test(e));
  expect('sem erros não tratados nas páginas', errs, []);
  expect('Chat 09 · R2: a página chegou com a CSP do app', isAppCsp(await b.ev(cspHeaderExpression)), true);
  expect('Chat 09 · R2: nenhuma violação da CSP do app', cspViolations, []);
} catch (err) {
  failures.push(`roteiro interrompido: ${err.message}`);
} finally {
  a?.close();
  b?.close();
  chromes.forEach((c) => c.kill());
  vite.kill();
  viteDead.kill();
  vitePanel.kill();
  panelServer.kill();
  viteDsOff.kill();
  dsOffServer.kill();
  server.kill();
  imageServer.close();
  await sleep(700);
  try {
    rmSync(ASSETS_DIR, { recursive: true, force: true });
    rmSync(OUTBOX_DIR, { recursive: true, force: true });
    for (const d of DSOFF_DIRS) rmSync(d, { recursive: true, force: true });
  } catch {
    /* pasta temporária */
  }
  for (const p of profiles) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* o Chrome pode segurar arquivos por alguns instantes */
    }
  }
}

console.log(`Modo Servidor (navegador): ${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
