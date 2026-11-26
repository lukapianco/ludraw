#!/usr/bin/env node
/**
 * LuDraw — testes de aceite das extensões programáveis em NAVEGADOR REAL (Chat 06.5 · B ·
 * `EXTENSIONS_SPEC.md` §11). Sem dependências: sobe o Vite deste repositório e controla um Chrome/Edge
 * local em modo headless pelo protocolo DevTools (CDP), com um perfil temporário.
 *
 *   npm run test:extensions:browser          (CHROME_PATH=/caminho/do/chrome se não for achado)
 *
 * Cobre: Worker selado (fetch/XMLHttpRequest/WebSocket/RTCPeerConnection/Worker/importScripts/
 * indexedDB/localStorage indisponíveis; Function/eval bloqueados), rede só pelo host e só na allowlist,
 * escrita sem `board.write` negada, escrita com permissão = 1 passo de desfazer + `viaExtension` no
 * Activity Log, "Visualizar como… Visitante leitor" negando com o motivo do `explain()`, loop infinito
 * encerrado sem travar o app, painel em iframe sem acesso ao `localStorage`, 1 byte alterado no
 * IndexedDB desativando a extensão, Modo Seguro desligando tudo e a E04 funcionando de ponta a ponta.
 */
import { spawn } from 'node:child_process';
import { cspHeaderExpression, cspViolationOf, isAppCsp, watchCsp } from './lib/csp-watch.mjs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5190 + Math.floor(Math.random() * 50);
const DEBUG = 9400 + Math.floor(Math.random() * 50);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = candidates.find((p) => existsSync(p));
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

/**
 * Este roteiro testa as extensões no MODO LOCAL. Desde a detecção automática do servidor (Chat 07 §1.3), o app que
 * acha `/api/v1/info` na própria origem entra no Modo Servidor (e, com o Modo Local bloqueado, vai para a entrada).
 * O proxy `/api` do Vite aponta por padrão para `localhost:3001`: com o servidor de desenvolvimento ligado, a página
 * deixava de abrir o board. Por isso o Vite do teste aponta o proxy para uma porta vazia (como o `test:server:browser`).
 */
async function emptyPort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
const NO_SERVER = `http://127.0.0.1:${await emptyPort()}`;
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, LUDRAW_API_PROXY: NO_SERVER, LUDRAW_FORCE_LOCAL: '' },
});
/**
 * Chat 08.7 · R4 (S-28, S-30) — "rastreador" local: um servidor HTTP no 127.0.0.1 que só conta acessos. As extensões de
 * teste (escritas do zero aqui) e os objetos com endereço externo tentam falar com ele; o esperado é ZERO acessos.
 */
const { createServer: createHttpServer } = await import('node:http');
const trackerHits = [];
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const tracker = createHttpServer((q, s) => {
  trackerHits.push(`${q.method} ${q.url}`);
  if (q.url.includes('.png')) {
    s.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
    return s.end(PNG_1PX);
  }
  const type = q.url.includes('.css') ? 'text/css' : q.url.includes('.js') ? 'text/javascript' : 'text/plain';
  s.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' });
  s.end(type === 'text/javascript' ? 'export const x = 1;' : type === 'text/css' ? 'body{}' : 'ok');
});
tracker.on('upgrade', (q, socket) => {
  trackerHits.push(`UPGRADE ${q.url}`);
  socket.destroy();
});
await new Promise((r) => tracker.listen(0, '127.0.0.1', r));
const TRK = `http://127.0.0.1:${tracker.address().port}`;
const TRK_WS = TRK.replace('http', 'ws');
const profile = mkdtempSync(join(tmpdir(), 'ludraw-ext-test-'));
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
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

let ws;
let seq = 0;
const pending = new Map();
const pageErrors = [];
/** Chat 09 · R2: violações da CSP do app (documento de topo) — precisam ser zero */
const cspViolations = [];
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}

/** Código executado na página: importa os módulos do app pelo servidor do Vite (mesmas instâncias da tela). */
const SETUP = String.raw`
  window.__od = window.__od || {};
  const M = (p) => import(p);
  window.__od.mods = window.__od.mods || Promise.all([
    M('/src/extensions/runtime.ts'), M('/src/store/useBoardStore.ts'), M('/src/store/useAppStore.ts'),
    M('/src/store/useExtensionRuntimeStore.ts'), M('/src/utils/boardRepository.ts'), M('/src/store/useExtensionsStore.ts'),
    M('/src/extensions/registries.ts'), M('/src/utils/permissions.ts'), M('/src/utils/hash.ts'), M('/src/i18n/index.ts'),
  ]).then(([runtime, board, app, rt, repo, exts, regs, perms, hash, i18n]) => ({ runtime, board, app, rt, repo, exts, regs, perms, hash, i18n }));
  window.__od.mods;
`;

/** Liga uma extensão de teste (manifest mínimo, sem passar pelo instalador) e espera o Worker. */
const START = (id, perms, code, extra = '') => String.raw`(async () => {
  const { runtime, rt } = await window.__od.mods;
  const manifest = { apiVersion: 1, id: ${JSON.stringify(id)}, name: ${JSON.stringify(id)}, version: '1.0.0', publisher: 'Teste', license: 'MIT', kind: 'script',
    permissions: ${JSON.stringify(perms)}, provenance: { originalWork: true, thirdParty: [] }, main: 'main.js' ${extra} };
  const files = { 'main.js': new TextEncoder().encode(${JSON.stringify(code)}) };
  if (manifest.ui) files[manifest.ui] = new TextEncoder().encode(window.__od.panelHtml || '');
  window.__od.killed = window.__od.killed || {};
  runtime.startExtensionRuntime({ manifest, files, grants: new Set(manifest.permissions), onKilled: (r) => { window.__od.killed[manifest.id] = r; } });
  for (let i = 0; i < 50 && rt.useExtensionRuntimeStore.getState().states[manifest.id]?.state !== 'running'; i++) await new Promise((r) => setTimeout(r, 100));
  return rt.useExtensionRuntimeStore.getState().states[manifest.id]?.state;
})()`;

const STORED = (id, key, timeoutMs = 6000) => String.raw`(async () => {
  const { repo } = await window.__od.mods;
  for (let i = 0; i < ${Math.ceil(timeoutMs / 100)}; i++) {
    const data = await repo.boardRepository.getExtensionMeta('storage:' + ${JSON.stringify(id)});
    if (data && data[${JSON.stringify(key)}] !== undefined) return data[${JSON.stringify(key)}];
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
})()`;

/**
 * Chat 08.2 · B — matriz de papéis: cada ação que mudou de lugar no Estúdio v2 continua decidida pelo mesmo
 * can()/explain(). Para dono, editor, comentarista, leitor e visitante de link (simulados pelo "Ver como…"), o estado
 * da interface nova (habilitado, abre ou não abre) tem de bater com explain() da ação. Devolve as divergências.
 */
const ROLE_MATRIX = String.raw`(async () => {
  const [appM, perms, boardM, studioM] = await Promise.all([import('/src/store/useAppStore.ts'), import('/src/utils/permissions.ts'), import('/src/store/useBoardStore.ts'), import('/src/components/studio/studioUi.ts')]);
  const app = appM.useAppStore, board = boardM.useBoardStore, ui = studioM.useStudioUi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (fn()) return true; await wait(50); } return false; };
  const can = (a) => perms.explain(boardM.buildPermissionContext(board.getState()), a).allowed;
  const visitor = perms.VIEW_AS_PROFILES.find((x) => x.id === 'visitor-viewer').profile;
  const profiles = {
    dono: null,
    editor: { label: 'Editor', workspaceRole: 'member', boardRole: 'editor', isFacilitator: false },
    comentarista: { label: 'Comentarista', workspaceRole: 'member', boardRole: 'commenter', isFacilitator: false },
    leitor: { label: 'Leitor', workspaceRole: 'member', boardRole: 'viewer', isFacilitator: false },
    visitante: visitor,
  };
  const open = async (id) => { ui.getState().close(); await wait(80); ui.getState().openDrawer(id, document.querySelector('[data-studio-trigger="' + id + '"]')); await wait(250); };
  const bad = [];
  const seen = {};
  const check = (who, what, ui, perm) => { if (ui !== perm) bad.push(who + ': ' + what + ' (tela ' + ui + ', can ' + perm + ')'); };
  for (const [who, p] of Object.entries(profiles)) {
    app.getState().setViewAs(p);
    await wait(400);
    seen[who] = ['board.edit', 'board.delete', 'board.share', 'board.restoreSnapshot', 'voting.manage'].filter(can).join(',');
    // Ficha → Mover para a lixeira (board.delete)
    await open('card');
    document.querySelector('[data-testid=card-trash]').click();
    await wait(150);
    check(who, 'Ficha → lixeira abre a confirmação', app.getState().modal?.type === 'confirm-delete-board', can('board.delete'));
    app.getState().closeModal();
    // Ficha → Histórico (board.edit, como antes) abre a linha do tempo
    await open('card');
    document.querySelector('[data-card-tile=history]').click();
    await wait(250);
    check(who, 'Ficha → Histórico abre a linha do tempo', ui.getState().open === 'timeline', can('board.edit'));
    // Linha do tempo: Restaurar / Excluir (board.restoreSnapshot) e Salvar versão (board.edit)
    await open('timeline');
    await until(() => document.querySelectorAll('[data-version]').length > 0);
    document.querySelector('[data-version]')?.click();
    await until(() => !!document.querySelector('[data-testid=timeline-restore]'));
    const restore = document.querySelector('[data-testid=timeline-restore]');
    const del = document.querySelector('[data-testid=timeline-delete]');
    check(who, 'Restaurar habilitado', !!restore && !restore.disabled, can('board.restoreSnapshot'));
    check(who, 'Excluir versão habilitado', !!del && !del.disabled, can('board.restoreSnapshot'));
    ui.getState().setPreview(null);
    // Facilitar: Votação e Enquete (voting.manage); Conduzir a tela (followMe.lead, só ao vivo)
    await open('facilitate');
    for (const id of ['vote', 'poll']) {
      const el = document.querySelector('[data-facilitate-card=' + id + ']');
      check(who, 'Facilitar → ' + id + ' habilitado', !!el && !el.disabled, can('voting.manage'));
    }
    const lead = document.querySelector('[data-facilitate-card=lead]');
    if (lead) check(who, 'Facilitar → conduzir habilitado', !lead.disabled, can('followMe.lead'));
    ui.getState().close();
    // Compartilhar (board.share)
    document.querySelector('[data-testid=studio-share]').click();
    await wait(150);
    check(who, 'Compartilhar abre o modal', app.getState().modal?.type === 'share-board', can('board.share'));
    app.getState().closeModal();
  }
  app.getState().setViewAs(null);
  ui.getState().close();
  await wait(300);
  return { bad, seen };
})()`;

try {
  await waitFor(`http://localhost:${PORT}/favicon.svg`);
  const [page] = (await (await waitFor(`http://127.0.0.1:${DEBUG}/json/list`)).json()).filter((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    const cspV = cspViolationOf(msg);
    if (cspV) cspViolations.push(cspV);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await watchCsp(send);
  await send('Page.navigate', { url: `http://localhost:${PORT}/#/` });
  await sleep(6000);
  const mode = await ev(`import('/src/utils/serverConfig.ts').then((c) => c.connection.mode)`);
  if (mode !== 'local') throw new Error(`a página abriu no Modo ${mode === 'server' ? 'Servidor' : mode} — este roteiro precisa do Modo Local (confira LUDRAW_API_PROXY/config.json)`);
  expect('Chat 09 · R2: a página chegou com a CSP do app', isAppCsp(await ev(cspHeaderExpression)), true);
  // espera o botão (o Vite compila a frio na primeira visita; um tempo fixo deixava o roteiro na tela de entrada)
  for (let i = 0; i < 60; i++) {
    if (await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Continuar sem conta|Continue without/.test(x.textContent)); b && b.click(); return !!b; })()`)) break;
    await sleep(500);
  }
  await sleep(2000);
  await ev(SETUP);
  // board novo, aberto (o BoardView liga as permissões reais pelo usePermissionSync)
  await ev(`(async () => { const { app } = await window.__od.mods; app.useAppStore.getState().createBoard({ template: 'blank', open: true }); })()`);
  await sleep(3500);
  expect('board aberto', await ev(`location.hash.startsWith('#/board/')`), true);

  /* 1. Worker selado + rede só pelo host (allowlist) */
  await ev(`window.__realFetch = window.__realFetch || window.fetch; window.fetch = async (url) => new Response('ok:' + url)`); // a rede "real" é simulada: nada sai do computador
  const probe = String.raw`
    var r = {};
    ['fetch','XMLHttpRequest','WebSocket','EventSource','RTCPeerConnection','importScripts','Worker','SharedWorker','indexedDB','caches','BroadcastChannel','localStorage','eval','postMessage'].forEach(function (n) { r[n] = typeof self[n]; });
    var protoHas = false; for (var o = Object.getPrototypeOf(self); o; o = Object.getPrototypeOf(o)) { if (Object.prototype.hasOwnProperty.call(o, 'fetch') && typeof o.fetch === 'function') protoHas = true; }
    r.protoFetch = protoHas;
    try { (function () {}).constructor('return 1'); r.fn = 'works'; } catch (e) { r.fn = 'blocked'; }
    try { setTimeout('1', 1); r.timer = 'works'; } catch (e) { r.timer = 'blocked'; }
    try { new Worker('data:text/javascript,1'); r.newWorker = 'works'; } catch (e) { r.newWorker = 'blocked'; }
    Promise.all([
      ludraw.network.fetch('https://api.exemplo.test/ok').then(function (x) { return x.text; }, function (e) { return 'ERR ' + e.message; }),
      ludraw.network.fetch('https://outro.test/x').then(function () { return 'passou'; }, function (e) { return 'negado'; }),
      ludraw.network.fetch('http://api.exemplo.test/ok').then(function () { return 'passou'; }, function (e) { return 'negado'; }),
    ]).then(function (n) { r.netAllowed = n[0]; r.netOther = n[1]; r.netHttp = n[2]; return ludraw.storage.set('probe', r); });
  `;
  expect('Worker iniciou', await ev(START('dev.teste.probe', ['storage', 'network'], probe, `, networkAllowlist: ['api.exemplo.test']`)), 'running');
  const r = await ev(STORED('dev.teste.probe', 'probe'));
  for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'importScripts', 'Worker', 'SharedWorker', 'indexedDB', 'caches', 'BroadcastChannel', 'localStorage', 'eval', 'postMessage']) expect(`Worker: ${n} indisponível`, r?.[n], 'undefined');
  expect('Worker: fetch nem pelo protótipo', r?.protoFetch, false);
  expect('Worker: Function bloqueado', r?.fn, 'blocked');
  expect('Worker: setTimeout com texto bloqueado', r?.timer, 'blocked');
  expect('Worker: new Worker falha', r?.newWorker, 'blocked');
  expect('rede: domínio da allowlist pelo host', r?.netAllowed, 'ok:https://api.exemplo.test/ok');
  expect('rede: domínio fora da allowlist negado', r?.netOther, 'negado');
  expect('rede: http negado', r?.netHttp, 'negado');
  expect('rede: acessos registrados (indicador)', await ev(`(async () => { const { rt } = await window.__od.mods; return rt.useExtensionRuntimeStore.getState().network.filter((n) => n.extensionId === 'dev.teste.probe').map((n) => n.ok); })()`), [true, false, false]);

  /* 2. escrita sem board.write */
  const writer = String.raw`
    ludraw.board.addElements([{ type: 'sticky', x: 0, y: 0, width: 200, height: 200, text: 'da extensão' }])
      .then(function (ids) { return ludraw.storage.set('w', 'ok:' + ids.length); }, function (e) { return ludraw.storage.set('w', 'ERR:' + e.code); });
  `;
  await ev(START('dev.teste.semescrita', ['storage'], writer));
  expect('sem board.write: escrita negada', await ev(STORED('dev.teste.semescrita', 'w')), 'ERR:permission');

  /* 3. com board.write: 1 passo de desfazer + viaExtension */
  const before = await ev(`(async () => { const { board } = await window.__od.mods; const s = board.useBoardStore.getState(); return { n: s.elementOrder.length, past: s.history.past.length }; })()`);
  await ev(START('dev.teste.escrita', ['storage', 'board.write'], writer));
  expect('com board.write: escreveu', await ev(STORED('dev.teste.escrita', 'w')), 'ok:1');
  const after = await ev(`(async () => { const { board } = await window.__od.mods; const s = board.useBoardStore.getState(); const last = s.activityLog[s.activityLog.length - 1]; return { n: s.elementOrder.length, past: s.history.past.length, via: last && last.viaExtension && last.viaExtension.id }; })()`);
  expect('com board.write: 1 objeto a mais', after.n - before.n, 1);
  expect('com board.write: 1 passo de desfazer', after.past - before.past, 1);
  expect('Activity Log com viaExtension', after.via, 'dev.teste.escrita');
  expect('Activity Log mostra "via extensão"', await ev(`(async () => { const { board } = await window.__od.mods; const u = await import('/src/utils/activity.ts'); const s = board.useBoardStore.getState(); return u.activityText(s.activityLog[s.activityLog.length - 1]).includes('dev.teste.escrita'); })()`), true);

  /* 4. "Visualizar como… Visitante leitor": escrita negada com o motivo do explain() */
  await ev(`(async () => { const { app, perms } = await window.__od.mods; app.useAppStore.getState().setViewAs(perms.VIEW_AS_PROFILES.find((p) => p.id === 'visitor-viewer').profile); })()`);
  await sleep(800);
  const visitor = String.raw`
    ludraw.board.addElements([{ type: 'sticky', x: 0, y: 0, width: 100, height: 100 }])
      .then(function () { return ludraw.storage.set('v', 'escreveu'); }, function (e) { return ludraw.storage.set('v', e.code + '|' + e.message); });
  `;
  await ev(START('dev.teste.visitante', ['storage', 'board.write'], visitor));
  const denied = await ev(STORED('dev.teste.visitante', 'v'));
  const expected = await ev(`(async () => { const { board, perms, i18n } = await window.__od.mods; const d = perms.explain(board.buildPermissionContext(board.useBoardStore.getState()), 'board.edit'); return d.allowed ? 'permitido' : i18n.translateMessage(d.reason); })()`);
  expect('Visitante leitor: escrita negada', String(denied).split('|')[0], 'permission');
  expect('Visitante leitor: motivo = explain()', String(denied).split('|').slice(1).join('|'), expected);
  await ev(`(async () => { const { app } = await window.__od.mods; app.useAppStore.getState().setViewAs(null); })()`);
  await sleep(500);

  /* 5. loop infinito encerrado sem travar o app */
  await ev(START('dev.teste.loop', [], 'while (true) {}'));
  const t0 = Date.now();
  let killed = null;
  for (let i = 0; i < 40 && !killed; i++) {
    await sleep(500);
    killed = await ev(`(window.__od.killed || {})['dev.teste.loop'] || null`);
  }
  expect('loop infinito: encerrado', killed, 'unresponsive');
  expect('loop infinito: encerrado em até 15 s', Date.now() - t0 < 15000, true);
  expect('app continua respondendo', await ev(`new Promise((r) => { const t = performance.now(); setTimeout(() => r(performance.now() - t < 500), 10); })`), true);

  /* 6. painel em iframe: sandbox sem allow-same-origin e sem localStorage do app */
  await ev(`window.__od.panelHtml = ${JSON.stringify(String.raw`<p>painel</p><script>
    var r = {};
    try { r.ls = typeof localStorage.length; } catch (e) { r.ls = 'blocked'; }
    try { r.parentDoc = typeof parent.document.body; } catch (e) { r.parentDoc = 'blocked'; }
    r.fetch = typeof fetch;
    ludraw.storage.set('panel', r);
  </script>`)}`);
  await ev(START('dev.teste.painel', ['storage', 'ui.panel'], '/* lógica vazia */', `, ui: 'ui/panel.html', contributes: { panels: [{ id: 'p', title: 'Painel de teste' }] }`));
  await ev(`(async () => { const { app, rt } = await window.__od.mods; rt.useExtensionRuntimeStore.getState().setOpenPanel('dev.teste.painel/p'); })()`);
  await sleep(1500);
  expect('painel: iframe dentro da janela flutuante (Estúdio v2)', await ev(`!!document.querySelector('[data-extension-window="dev.teste.painel/p"] iframe[data-extension-panel="dev.teste.painel/p"]')`), true);
  expect('painel: iframe só com allow-scripts', await ev(`(() => { const f = document.querySelector('iframe[data-extension-panel="dev.teste.painel/p"]'); return f ? f.getAttribute('sandbox') + '|' + f.getAttribute('allow') : 'sem iframe'; })()`), 'allow-scripts|');
  const panel = await ev(STORED('dev.teste.painel', 'panel'));
  expect('painel: localStorage do app inacessível', panel?.ls, 'blocked');
  expect('painel: documento do app inacessível', panel?.parentDoc, 'blocked');
  expect('painel: fetch removido', panel?.fetch, 'undefined');
  expect('nenhuma extensão escreveu no localStorage do app', await ev(`Object.keys(localStorage).filter((k) => /ext|probe|panel/i.test(k) && !k.startsWith('ludraw:')).length`), 0);

  /* 6b. Chat 08.2 · B — janela flutuante: dentro da tela, teclado e Esc (a API ludraw.ui.showPanel não mudou) */
  const WIN = `document.querySelector('[data-extension-window="dev.teste.painel/p"]')`;
  const inside = `(() => { const r = ${WIN}.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`;
  expect('janela: dentro da tela', await ev(inside), true);
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 620, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  expect('janela: continua dentro da tela depois de estreitar a janela do navegador', await ev(inside), true);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(500);
  const moved = await ev(`(async () => { const w = ${WIN}; const h = w.querySelector('[role=button][tabindex="0"]'); h.focus(); const x0 = w.getBoundingClientRect().left; h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })); await new Promise((r) => setTimeout(r, 150)); return Math.round(x0 - w.getBoundingClientRect().left); })()`);
  expect('janela: Shift + seta move 40 px pelo teclado', moved, 40);
  await ev(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  await sleep(300);
  expect('janela: Esc fecha (foco dentro dela)', await ev(`!${WIN}`), true);
  expect('janela: painel fechado no runtime', await ev(`(async () => { const { rt } = await window.__od.mods; return rt.useExtensionRuntimeStore.getState().openPanel; })()`), null);
  // reabre pela API da extensão (ludraw.ui.showPanel → mesma janela)
  await ev(`(async () => { const { rt } = await window.__od.mods; rt.useExtensionRuntimeStore.getState().setOpenPanel('dev.teste.painel/p'); })()`);
  await sleep(600);
  expect('janela: reabre', await ev(`!!${WIN}`), true);
  await ev(`(async () => { const { rt } = await window.__od.mods; rt.useExtensionRuntimeStore.getState().setOpenPanel(null); })()`);

  /* 6b2. ajuste pós-teste: em tela estreita o painel da enquete (e da votação/cronômetro) desce para baixo da barra do topo */
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 760, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  await ev(`import('/src/components/facilitation/votingUi.ts').then((m) => { m.startPollDraft(''); return true; })`);
  await sleep(600);
  expect('enquete em 700 px: painel abaixo da barra do topo (dá para fechar)', await ev(`(() => { const p = document.querySelector('[role=dialog][data-od-floating].od-pop'); const bar = document.querySelector('[data-testid=studio-bar]'); if (!p || !bar) return 'sem painel'; return p.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom; })()`), true);
  await ev(`import('/src/components/facilitation/votingUi.ts').then((m) => { m.useVotingUi.setState({ pollDraft: null }); return true; })`);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);

  /* 6c. Chat 08.2 · B — Ficha do board e prévia da linha do tempo no Modo Local */
  await ev(`(() => { document.querySelector('[data-studio-trigger="card"]').click(); return true; })()`);
  await sleep(500);
  expect('Ficha: o campo de nome mostra o nome do board', await ev(`(() => { const i = document.querySelector('[data-testid=board-card] input'); const title = document.querySelector('[data-testid=studio-title]'); return !!i && i.value.length > 0 && title.textContent.includes(i.value); })()`), true);
  await ev(`import('/src/components/studio/studioUi.ts').then((m) => m.useStudioUi.getState().close())`);
  expect('versão salva (Modo Local)', await ev(`import('/src/utils/versionHistory.ts').then((m) => m.saveManualSnapshot('versao-local')).then((x) => !!x)`), true);
  const LSTATE = `(async () => { const { board } = await window.__od.mods; const s = board.useBoardStore.getState(); return JSON.stringify({ data: s.serialize(), camera: s.camera, sel: s.selectedIds, order: s.elementOrder }); })()`;
  const lBefore = await ev(LSTATE);
  await ev(`(() => { document.querySelector('[data-testid=studio-time]').click(); return true; })()`);
  for (let i = 0; i < 50 && !(await ev(`document.querySelectorAll('[data-version]').length > 0`)); i++) await sleep(200);
  await ev(`(() => { document.querySelector('[data-version]').click(); return true; })()`);
  await sleep(500);
  expect('prévia local aberta', await ev(`!!document.querySelector('[data-testid=version-preview]')`), true);
  await ev(`(() => { const el = document.querySelector('[data-testid=version-preview]'); el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -200, clientX: 400, clientY: 300 })); for (const key of ['Delete', 'n', 'z']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); return true; })()`);
  await sleep(300);
  await ev(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  await sleep(300);
  expect('prévia local: Esc fecha', await ev(`!document.querySelector('[data-testid=version-preview]')`), true);
  await ev(`import('/src/components/studio/studioUi.ts').then((m) => m.useStudioUi.getState().close())`);
  await sleep(300);
  expect('prévia local: useBoardStore idêntico', (await ev(LSTATE)) === lBefore, true);


  /* 6d. Chat 08.2 · B — matriz de papéis no Modo Local (mesmo can()/explain() nas ações que mudaram de lugar) */
  const roles = await ev(ROLE_MATRIX);
  expect('papéis (Local): a interface nova segue o explain() para dono, editor, comentarista, leitor e visitante', roles.bad, []);
  expect('papéis (Local): os perfis têm permissões diferentes de verdade', roles.seen.dono !== roles.seen.leitor && roles.seen.leitor === roles.seen.visitante, true);

  /* 6e. Chat 08.2 · C-1 — Dock: ordem, bandejas presas ao botão, Caixa de ferramentas, Emojis e adesivos, pin AA */
  const DOCK = `(async () => { const m = await import('/src/components/toolbar/dock/dockUi.ts'); return m.useDockUi; })()`;
  await ev(`${DOCK}.then((d) => { d.getState().close(); return true; })`);
  await ev(`import('/src/components/studio/studioUi.ts').then((m) => { m.useStudioUi.getState().close(); return true; })`);
  expect('Dock: Mão antes de Selecionar', await ev(`(() => { const ids = [...document.querySelectorAll('[data-dock-tool]')].map((b) => b.dataset.dockTool); return ids.indexOf('hand') >= 0 && ids.indexOf('hand') < ids.indexOf('select'); })()`), true);
  expect('Dock: ordem completa', await ev(`[...document.querySelectorAll('[data-dock-tool]')].map((b) => b.dataset.dockTool).join(',')`), 'hand,select,lasso,sticky,text,shapes,connector,pen,frame,image,emoji,comment,toolbox');
  expect('Dock: ícones próprios em todos os botões', await ev(`[...document.querySelectorAll('[data-dock-tool]')].every((b) => !!b.querySelector('svg.od-icon'))`), true);
  expect('Dock: ponto de bandeja só nos botões com bandeja', await ev(`[...document.querySelectorAll('[data-dock-tool]')].filter((b) => b.querySelector('[data-tray-dot]')).map((b) => b.dataset.dockTool).join(',')`), 'sticky,shapes,pen,frame,emoji,toolbox');
  const TRAY_CHECK = (id) => `(async () => {
    const btn = document.querySelector('[data-dock-tray-trigger="${id}"]');
    btn.click();
    for (let i = 0; i < 30 && !document.querySelector('[data-dock-tray="${id}"]'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 250));
    const tray = document.querySelector('[data-dock-tray="${id}"]');
    if (!tray) return 'sem bandeja';
    const t = tray.querySelector('[data-dock-tongue]').getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const r = tray.getBoundingClientRect();
    const res = { tongue: Math.abs(t.left + t.width / 2 - (b.left + b.width / 2)) <= 2, above: r.bottom <= b.top, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0, expanded: btn.getAttribute('aria-expanded'), focusInside: tray.contains(document.activeElement) };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    res.closed = !document.querySelector('[data-dock-tray="${id}"]');
    res.focusBack = document.activeElement === btn;
    return JSON.stringify(res);
  })()`;
  const okTray = JSON.stringify({ tongue: true, above: true, inside: true, expanded: 'true', focusInside: true, closed: true, focusBack: true });
  for (const id of ['sticky', 'shapes', 'pen', 'frame', 'emoji', 'toolbox']) expect(`bandeja ${id}: presa ao botão, Esc fecha e devolve o foco`, await ev(TRAY_CHECK(id)), okTray);
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 760, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  for (const id of ['emoji', 'toolbox']) expect(`bandeja ${id} em 700 px: dentro da tela e presa ao botão`, await ev(TRAY_CHECK(id)), okTray);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  // Reduzir movimento: a bandeja entra só com opacidade (sem escala/deslocamento)
  await ev(`(async () => { const { app } = await window.__od.mods; if (!app.useAppStore.getState().preferences.reduceMotion) app.useAppStore.getState().togglePreference('reduceMotion'); return true; })()`);
  await ev(`${DOCK}.then((d) => { d.getState().openTray('frame'); return true; })`);
  await sleep(300);
  expect('Reduzir movimento: bandeja só com fade', await ev(`(() => { const c = document.querySelector('[data-dock-tray="frame"]').className; return c.includes('animate-fade-in') && !c.includes('animate-pop-in'); })()`), true);
  await ev(`${DOCK}.then((d) => { d.getState().close(); return true; })`);
  await ev(`(async () => { const { app } = await window.__od.mods; app.useAppStore.getState().togglePreference('reduceMotion'); return true; })()`);
  await sleep(200);
  // Vista e Tempo nunca cruzam a Dock (medido contra ela; em telas estreitas sobem para acima dela)
  for (const w of [1440, 1265, 1180, 900, 700]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 820, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    expect(`${w} px: Vista e Tempo sem cruzar a Dock`, await ev(`(() => { const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; const d = document.querySelector('[data-od-dock]').getBoundingClientRect(); return ['view', 'time'].every((m) => !hit(document.querySelector('[data-studio-module="' + m + '"]').getBoundingClientRect(), d)); })()`), true);
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  // Caixa de ferramentas: "/" abre com a busca focada; a busca filtra; Enter insere o primeiro resultado
  const countEls = `(async () => { const { board } = await window.__od.mods; return board.useBoardStore.getState().elementOrder.length; })()`;
  await ev(`(() => { document.body.focus(); window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', code: 'Slash', bubbles: true })); return true; })()`);
  await sleep(400);
  expect('/ abre a Caixa de ferramentas com a busca focada', await ev(`!!document.querySelector('[data-dock-tray="toolbox"]') && document.activeElement?.hasAttribute('data-toolbox-search')`), true);
  expect('Caixa: 4 seções por intenção', await ev(`[...document.querySelectorAll('[data-toolbox-section]')].map((s) => s.dataset.toolboxSection).join(',')`), 'organize,diagram,present,bring,ext');
  expect('Caixa: itens "Em breve" visíveis e desabilitados', await ev(`['timeline', 'flows', 'prototype', 'doc', 'video'].every((id) => document.querySelector('[data-toolbox-item="' + id + '"]')?.getAttribute('aria-disabled') === 'true')`), true);
  const tbBefore = await ev(countEls);
  await ev(`(() => { const i = document.querySelector('[data-toolbox-search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'kanban'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(200);
  expect('Caixa: a busca filtra', await ev(`[...document.querySelectorAll('[data-toolbox-item]')].map((b) => b.dataset.toolboxItem).join(',')`), 'kanban');
  await ev(`(() => { document.querySelector('[data-toolbox-search]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  await sleep(600);
  expect('Caixa: Enter insere o Kanban no board e fecha', [await ev(countEls) > tbBefore, await ev(`!document.querySelector('[data-dock-tray="toolbox"]')`)], [true, true]);
  // extensões ativas: painel da extensão de teste aparece na seção própria e abre na janela flutuante
  await ev(`${DOCK}.then((d) => { d.getState().openTray('toolbox'); return true; })`);
  await sleep(400);
  await ev(`(() => { document.querySelector('[data-toolbox-filter="ext"]').click(); return true; })()`);
  await sleep(200);
  expect('Caixa: filtro Extensões mostra só a seção das extensões', await ev(`[...document.querySelectorAll('[data-toolbox-section]')].map((s) => s.dataset.toolboxSection).join(',')`), 'ext');
  expect('Caixa: painel da extensão listado com o tipo', await ev(`(document.querySelector('[data-toolbox-item="ext:panel:dev.teste.painel/p"]')?.textContent ?? '').includes('painel')`), true);
  await ev(`(() => { document.querySelector('[data-toolbox-item="ext:panel:dev.teste.painel/p"]').click(); return true; })()`);
  await sleep(600);
  expect('Caixa: o painel abre na janela flutuante', await ev(`!!document.querySelector('[data-extension-window="dev.teste.painel/p"]')`), true);
  await ev(`(async () => { const { rt } = await window.__od.mods; rt.useExtensionRuntimeStore.getState().setOpenPanel(null); })()`);
  // Emojis e adesivos: Shift+E abre; clique coloca no centro (1 passo de desfazer); arrastar coloca no ponto
  await ev(`(() => { document.body.focus(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', code: 'KeyE', shiftKey: true, bubbles: true })); return true; })()`);
  await sleep(400);
  expect('Shift+E abre Emojis e adesivos', await ev(`!!document.querySelector('[data-dock-tray="emoji"]')`), true);
  const b0 = await ev(countEls);
  await ev(`(() => { document.querySelector('[data-sticker="🎉"]').click(); return true; })()`);
  await sleep(300);
  expect('adesivo: clique coloca no board', await ev(countEls), b0 + 1);
  await ev(`(async () => { const { board } = await window.__od.mods; board.useBoardStore.getState().undo(); })()`);
  await sleep(200);
  expect('adesivo: desfazer remove em 1 passo', await ev(countEls), b0);
  const dragTo = (key) => `(async () => {
    const { board } = await window.__od.mods;
    const btn = document.querySelector('[data-sticker="${key}"]');
    const r = btn.getBoundingClientRect();
    const stage = document.querySelector('[data-canvas-stage]').getBoundingClientRect();
    const x = stage.left + 260, y = stage.top + 260;
    const o = { bubbles: true, pointerId: 9, button: 0, clientX: r.left + 5, clientY: r.top + 5 };
    btn.dispatchEvent(new PointerEvent('pointerdown', o));
    btn.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: (r.left + x) / 2, clientY: (r.top + y) / 2 }));
    btn.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x, clientY: y }));
    const cam = { ...board.useBoardStore.getState().camera }; // câmera no instante da soltura
    btn.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x, clientY: y }));
    await new Promise((res) => setTimeout(res, 300));
    const s = board.useBoardStore.getState();
    const el = s.elements[s.elementOrder[s.elementOrder.length - 1]];
    const want = { x: (260) / cam.zoom - cam.x / cam.zoom, y: (260) / cam.zoom - cam.y / cam.zoom };
    // o adesivo nasce quadrado e centrado no ponto; depois o texto ajusta só a própria altura (o topo fica)
    return { text: el?.text, near: !!el && Math.abs(el.x + el.width / 2 - want.x) < 2 && Math.abs(el.y + el.width / 2 - want.y) < 2 };
  })()`;
  await sleep(900); // a câmera termina o movimento do Kanban inserido acima
  await ev(`${DOCK}.then((d) => { d.getState().openTray('emoji'); return true; })`);
  await sleep(300);
  expect('adesivo: arrastar coloca no ponto onde soltou', await ev(dragTo('🚀')), { text: '🚀', near: true });
  // sem permissão (Visitante leitor): clique e arrasto não criam nada e o motivo aparece
  const b1 = await ev(countEls);
  await ev(`(async () => { const { app, perms } = await window.__od.mods; app.useAppStore.getState().setViewAs(perms.VIEW_AS_PROFILES.find((x) => x.id === 'visitor-viewer').profile); })()`);
  await sleep(400);
  await ev(`${DOCK}.then((d) => { d.getState().openTray('emoji'); return true; })`);
  await sleep(300);
  await ev(`(() => { document.querySelector('[data-sticker="💡"]').click(); return true; })()`);
  await sleep(200);
  await ev(`${DOCK}.then((d) => { d.getState().openTray('emoji'); return true; })`);
  await sleep(300);
  await ev(dragTo('💡'));
  expect('adesivo sem board.edit: nada criado (clique e arrasto)', await ev(countEls), b1);
  expect('adesivo sem board.edit: o motivo do explain() aparece', await ev(`(async () => { const { app, perms, board } = await window.__od.mods; const reason = perms.explain(board.buildPermissionContext(board.useBoardStore.getState()), 'board.edit').reason; const { translateMessage } = await import('/src/i18n/index.ts'); const text = translateMessage(reason); return app.useAppStore.getState().toasts.some((t) => t.message === text); })()`), true);
  await ev(`(async () => { const { app } = await window.__od.mods; app.useAppStore.getState().setViewAs(null); })()`);
  await sleep(300);
  // pin de comentário: iniciais com contraste AA sobre qualquer cor de autor, no claro e no escuro
  const pinContrast = String.raw`(async () => {
    const { board, app } = await window.__od.mods;
    const s = board.useBoardStore.getState();
    const names = ['Ana', 'Bia', 'Carlos', 'Dora', 'Edu', 'Fátima', 'Gil', 'Hugo', 'Iara', 'João', 'Kai', 'Lia', 'Mário', 'Nina', 'Otto', 'Paula'];
    const els = names.map((n, i) => ({ id: 'pin' + i, type: 'comment', x: 40 + i * 30, y: 40, width: 30, height: 30, rotation: 0, zIndex: 0, createdAt: 1, updatedAt: 1, resolved: false, messages: [{ id: 'm' + i, author: n, authorId: 'u' + i, text: 'oi', createdAt: 1 }] }));
    s.addElements(els, { select: false });
    app.useAppStore.getState().setPreference && null;
    const lum = (hex) => { const v = hex.replace('#', ''); const c = [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
    const out = {};
    for (const theme of ['light', 'dark']) {
      app.useAppStore.getState().setTheme(theme);
      await new Promise((r) => setTimeout(r, 400));
      const fills = [...document.querySelectorAll('[data-pin-fill]')].map((p) => p.getAttribute('data-pin-fill'));
      const texts = [...document.querySelectorAll('[data-pin-text]')].map((p) => p.getAttribute('data-pin-text'));
      out[theme] = fills.length >= names.length && fills.every((f, i) => ratio(f, texts[i]) >= 4.5);
    }
    board.useBoardStore.getState().deleteElements(els.map((e) => e.id));
    return out;
  })()`;
  expect('pin: iniciais com contraste AA (claro e escuro)', await ev(pinContrast), { light: true, dark: true });

  /* 6f. Chat 08.2 · C-2 — Cinta do objeto, menus, bloqueio de 2 s, permissões, cursores e fontes sob demanda */
  const SB = (expr) => `(async () => { const { board, app, perms } = await window.__od.mods; const s = board.useBoardStore.getState(); ${expr} })()`;
  const fontFiles = (re) => ev(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\\.woff2/.test(n) && ${re}.test(n)).length`);
  // fontes sob demanda: abrir o board não baixou nenhuma das 20 famílias novas
  expect('fontes: abrir o board não baixa as famílias novas', await fontFiles(`/(merriweather|bebas-neue|space-mono|shadows-into-light|jetbrains-mono|kalam|righteous|source-serif|fira-code|lora)/`), 0);
  await ev(`(() => { document.body.focus(); return true; })()`);
  await ev(SB(`s.clearSelection(); s.deleteElements(s.elementOrder.slice());
    const n = (id, x, color) => ({ id, type: 'sticky', x, y: 0, width: 200, height: 200, rotation: 0, zIndex: 0, createdAt: 1, updatedAt: 1, text: id, color, tags: [], reactions: {} });
    s.addElements([n('cs1', 0, '#FBED7C'), n('cs2', 260, '#B9E4C9'), { id: 'cf1', type: 'frame', x: 0, y: 320, width: 480, height: 270, rotation: 0, zIndex: 0, createdAt: 1, updatedAt: 1, title: 'Quadro C2', fillColor: '#FFFFFF', ratioPreset: '16:9', hiddenContent: false, slideOrder: 0 }], { select: false });
    s.setCamera({ x: 200, y: 80, zoom: 0.9 }); return true;`));
  await ev(SB(`s.setSelectedIds(['cs1']); return true;`));
  await sleep(400);
  expect('Cinta: aparece com a seleção, como barra de ferramentas', await ev(`document.querySelector('[data-context-toolbar]')?.getAttribute('role')`), 'toolbar');
  expect('Cinta: identidade "Post-it ▾" com rótulo', await ev(`(document.querySelector('[data-testid=strip-identity] [data-strip-identity-label]')?.textContent ?? '').trim().length > 0`), true);
  expect('Cinta: direita = Comentar · Bloqueio avançado · Bloquear · ⋯', await ev(`(() => { const bar = document.querySelector('[data-context-toolbar]'); const ids = ['[data-testid=strip-advanced-lock]', '[data-lock-button]', '[data-strip-control=more]'].map((q) => bar.querySelector(q)); return ids.every(Boolean) && (ids[0].compareDocumentPosition(ids[1]) & 4) !== 0 && (ids[1].compareDocumentPosition(ids[2]) & 4) !== 0; })()`), true);
  expect('Cinta: lingueta aponta para o centro da seleção', await ev(`(() => { const tg = document.querySelector('[data-strip-tongue]').getBoundingClientRect(); const el = document.querySelector('[data-element-id="cs1"]').getBoundingClientRect(); return Math.abs(tg.left + tg.width / 2 - (el.left + el.width / 2)) <= 2; })()`), true);
  // gaveta Estilo do texto: seletor de fonte com 5 grupos, busca e troca de fonte
  await ev(`(() => { document.querySelector('[data-testid=strip-text-style]').click(); return true; })()`);
  await sleep(300);
  expect('Estilo do texto: gaveta com o seletor de fonte em 5 grupos', await ev(`document.querySelectorAll('[data-strip-drawer="text-style"] [data-font-group]').length`), 5);
  expect('Estilo do texto: atalhos de tamanho 12 · 16 · 24 · 32 · 56 · 72', await ev(`[...document.querySelectorAll('[data-strip-drawer="text-style"] [data-size-shortcut]')].map((b) => b.dataset.sizeShortcut).join(',')`), '12,16,24,32,56,72');
  // pós-teste C-2: lista de fontes curta e o resto da gaveta à vista sem rolar (ref. do Estúdio v2), numa tela de notebook
  expect('Estilo do texto: lista de fontes curta (até 4 linhas à vista)', await ev(`document.querySelector('[data-strip-drawer="text-style"] [role=listbox]').clientHeight <= 132`), true);
  expect('Estilo do texto: grupos Ênfase · Lista · Alinhamento · Recuo', await ev(`document.querySelectorAll('[data-strip-drawer="text-style"] [role=group]').length`), 4);
  await ev(`(() => { document.querySelector('[data-testid=strip-text-style]').click(); return true; })()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await ev(`(() => { document.querySelector('[data-testid=strip-text-style]').click(); return true; })()`);
  await sleep(350);
  // pós-teste C-2: lista de fontes curta e o resto da gaveta à vista sem rolar (ref. do Estúdio v2)
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(500);
  expect('seletor: famílias fora da tela não baixam (Mono/Manuscrita no fim da lista)', await fontFiles(`/(space-mono|shadows-into-light|jetbrains-mono|fira-code)/`), 0);
  await ev(`(() => { const i = document.querySelector('[data-font-picker] input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'lora'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(200);
  expect('seletor: a busca filtra', await ev(`[...document.querySelectorAll('[data-font-picker] [data-font-name]')].map((b) => b.dataset.fontName).join(',')`), 'Lora');
  await ev(`(() => { document.querySelector('[data-font-picker] [data-font-name="Lora"]').click(); return true; })()`);
  await sleep(300);
  expect('seletor: trocar a fonte vale para o post-it', await ev(SB(`return s.elements.cs1.fontName;`)), 'Lora');
  // a tecla nasce no elemento focado (como no navegador de verdade), não na própria janela
  await ev(`(() => { (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  await sleep(150);
  expect('Esc fecha a gaveta e devolve o foco ao chip', await ev(`!document.querySelector('[data-strip-drawer]') && document.activeElement === document.querySelector('[data-testid=strip-text-style]')`), true);
  await ev(SB(`s.setSelectedIds(['cs1', 'cs2']); return true;`));
  await sleep(300);
  expect('vários objetos com fontes diferentes: "Misto"', await ev(`(document.querySelector('[data-testid=strip-text-style] [data-strip-value]')?.textContent ?? '').trim()`), 'Misto');
  // ⋯ = o mesmo menu do botão direito: cabeçalho, linha rápida (5) e 6 linhas
  await ev(SB(`s.setSelectedIds(['cs1']); return true;`));
  await sleep(250);
  await ev(`(() => { document.querySelector('[data-strip-control=more]').click(); return true; })()`);
  await sleep(300);
  const menuShape = `(() => { const m = document.querySelector('[data-od-menu]'); if (!m) return null; const r = m.getBoundingClientRect(); return { header: !!m.querySelector('[data-menu-header]'), quick: m.querySelectorAll('[data-quick-action]').length, rows: [...m.children].filter((c) => c.matches('button[data-open]')).length, fits: r.bottom <= innerHeight && r.top >= 0 }; })()`;
  const fromMore = await ev(menuShape);
  expect('⋯: cabeçalho, linha rápida de 5 e 6 linhas, dentro da tela', fromMore, { header: true, quick: 5, rows: 6, fits: true });
  await ev(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  await sleep(200);
  await ev(SB(`s.setContextMenu({ x: 400, y: 300, world: { x: 10, y: 10 }, target: 'element' }); return true;`));
  await sleep(300);
  expect('botão direito no objeto: o mesmo menu do ⋯', await ev(menuShape), fromMore);
  await ev(SB(`s.setContextMenu({ x: 300, y: 200, world: { x: -40.4, y: 12.6 }, target: 'canvas' }); return true;`));
  await sleep(300);
  expect('botão direito no vazio: "Neste ponto" + coordenadas, 5 rápidos e 4 linhas', await ev(`(() => { const m = document.querySelector('[data-od-menu]'); return { head: [...m.querySelector('[data-menu-header]').children].map((c) => c.textContent.trim()).join(' '), quick: m.querySelectorAll('[data-quick-action]').length, rows: [...m.children].filter((c) => c.matches('button[data-open]')).length }; })()`), { head: 'Neste ponto x -40 · y 13', quick: 5, rows: 4 });
  await ev(SB(`s.setContextMenu(null); return true;`));
  // tabela: cabeçalho "Tabela · A1", linha rápida e 6 linhas (a 6ª é o menu do objeto)
  await ev(`import('/src/utils/tableActions.ts').then((m) => { m.insertTable({ x: 700, y: 0 }); return true; })`);
  await sleep(400);
  await ev(SB(`s.setContextMenu({ x: 500, y: 200, world: { x: 0, y: 0 }, target: 'element' }); return true;`));
  await sleep(300);
  expect('menu da tabela: cabeçalho, 5 rápidos e 6 linhas, dentro da tela', await ev(menuShape), { header: true, quick: 5, rows: 6, fits: true });
  await ev(SB(`s.setContextMenu(null); s.setSelectedIds(['cs1']); return true;`));
  await sleep(300);

  // bloqueio: o clique trava; destravar só segurando 2 s (mouse e teclado)
  const lockBtn = `document.querySelector('[data-context-toolbar] [data-lock-button]')`;
  const isLocked = SB(`return !!s.elements.cs1.locked;`);
  await ev(`(() => { ${lockBtn}.click(); return true; })()`);
  await sleep(250);
  expect('Bloquear: o clique trava', await ev(isLocked), true);
  expect('travado: o meio da Cinta esmaece e fica inerte; Bloquear e ⋯ continuam', await ev(`(() => { const mid = document.querySelector('[data-strip-middle]'); return mid.getAttribute('aria-disabled') === 'true' && mid.inert === true && !${lockBtn}.disabled && !document.querySelector('[data-strip-control=more]').disabled; })()`), true);
  await ev(`(() => { ${lockBtn}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3 })); return true; })()`);
  await sleep(1000);
  await ev(`(() => { ${lockBtn}.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 3 })); return true; })()`);
  await sleep(300);
  expect('mouse: soltar antes de 2 s não destrava', await ev(isLocked), true);
  await ev(`(() => { ${lockBtn}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3 })); return true; })()`);
  await sleep(2300);
  expect('mouse: segurando 2 s destrava', await ev(isLocked), false);
  // o clique que o navegador dispara ao soltar não pode travar de novo; um clique depois disso trava
  await ev(`(() => { ${lockBtn}.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 3 })); ${lockBtn}.click(); return true; })()`);
  await sleep(200);
  expect('soltar depois de destravar não trava de novo', await ev(isLocked), false);
  await sleep(600);
  await ev(`(() => { ${lockBtn}.click(); return true; })()`);
  await sleep(250);
  expect('o clique seguinte trava', await ev(isLocked), true);
  await ev(`(() => { const b = ${lockBtn}; b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  await sleep(1000);
  await ev(`(() => { ${lockBtn}.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); return true; })()`);
  await sleep(300);
  expect('teclado: soltar Enter antes de 2 s não destrava', await ev(isLocked), true);
  await ev(`(() => { const b = ${lockBtn}; b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); return true; })()`);
  await sleep(2300);
  await ev(`(() => { ${lockBtn}.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); return true; })()`);
  await sleep(300);
  expect('teclado: segurando Espaço 2 s destrava', await ev(isLocked), false);

  // permissões: cada ação da Cinta segue o can()/explain() de hoje
  await ev(SB(`s.setSelectedIds(['cf1']); return true;`));
  await sleep(300);
  expect('frame: identidade com o NOME do frame', await ev(`(document.querySelector('[data-testid=strip-identity] [data-strip-identity-label]')?.textContent ?? '').trim()`), 'Quadro C2');
  expect('frame: Apresentar é o único botão cheio, com rótulo', await ev(`!!document.querySelector('[data-context-toolbar] [data-strip-control=present].od-btn-primary')`), true);
  const stripBg = `(() => { const probe = document.createElement('div'); probe.style.background = 'var(--od-panel)'; document.body.appendChild(probe); const want = getComputedStyle(probe).backgroundColor; probe.remove(); return getComputedStyle(document.querySelector('[data-context-toolbar]')).backgroundColor === want; })()`;
  for (const theme of ['light', 'dark']) {
    await ev(SB(`app.useAppStore.getState().setTheme('${theme}'); return true;`));
    await sleep(250);
    expect(`frame: a Cinta segue o tema (${theme})`, await ev(stripBg), true);
  }
  const STRIP_PERMS = SB(`
    const ctx = board.buildPermissionContext(s);
    const can = (a, extra) => perms.explain({ ...ctx, ...(extra || {}) }, a).allowed;
    const bar = document.querySelector('[data-context-toolbar]');
    if (!bar) return { bar: false, edit: can('board.edit') };
    const ratio = bar.querySelector('[data-testid=strip-frame-ratio]');
    const exp = bar.querySelector('[data-strip-control=frame-export]');
    return {
      bar: true,
      ratio: !!ratio && !ratio.disabled, canEdit: can('board.edit'),
      hide: !!bar.querySelector('button[aria-label*="conteúdo"], button[aria-pressed][aria-label*="content"]'), canHide: can('frame.toggleHidden'),
      exp: !!exp && !exp.disabled, canExport: can('board.export'),
    };`);
  for (const [who, profile] of [['dono', 'null'], ['editor de link', `perms.VIEW_AS_PROFILES.find((x) => x.id === 'visitor-editor').profile`], ['leitor', `perms.VIEW_AS_PROFILES.find((x) => x.id === 'visitor-viewer').profile`]]) {
    await ev(SB(`app.useAppStore.getState().setViewAs(${profile}); s.setSelectedIds(['cf1']); return true;`));
    await sleep(400);
    const r = await ev(STRIP_PERMS);
    if (!r.bar) expect(`Cinta (${who}): sem edição a Cinta não aparece (como antes)`, r.edit, false);
    else expect(`Cinta (${who}): Proporção, Conteúdo visível e Exportar seguem o can()`, [r.ratio, r.hide, r.exp], [r.canEdit, r.canHide, r.canExport]);
  }
  // bloqueio protegido: quem não é facilitador vê o motivo do explain() e não destrava
  await ev(SB(`app.useAppStore.getState().setViewAs(null); s.setLockMode(['cs1'], 'protected'); return true;`));
  await ev(SB(`app.useAppStore.getState().setViewAs(perms.VIEW_AS_PROFILES.find((x) => x.id === 'visitor-editor').profile); s.setSelectedIds(['cs1']); return true;`));
  await sleep(400);
  await ev(`(() => { document.querySelector('[data-testid=strip-protected-lock]').click(); return true; })()`);
  await sleep(250);
  const deniedReason = await ev(SB(`const { translateMessage } = await import('/src/i18n/index.ts'); return translateMessage(perms.explain(board.buildPermissionContext(s, { lockedBy: s.elements.cs1.lockedBy ?? null }), 'element.unlockProtected').reason);`));
  expect('protegido (sem facilitador): a gaveta mostra o motivo do explain()', await ev(`document.querySelector('[data-strip-drawer="unlock"]')?.textContent.includes(${JSON.stringify(deniedReason)})`), true);
  await ev(`(() => { [...document.querySelectorAll('[data-strip-drawer="unlock"] button')].pop().click(); return true; })()`);
  await sleep(250);
  expect('protegido (sem facilitador): continua travado', await ev(isLocked), true);
  await ev(SB(`app.useAppStore.getState().setViewAs(null); s.setLockMode(['cs1'], 'none'); s.setSelectedIds(['cs1']); return true;`));
  await sleep(300);

  // cursores (decididos por cursorFor): selecionado = move, arrastando = grabbing, alça = direção certa, Mão = grab
  const stageCursor = `document.querySelector('[data-canvas-stage]').style.cursor`;
  const hoverOn = (id) => `(() => { const el = document.querySelector('[data-element-id="${id}"]'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 })); return true; })()`;
  await ev(hoverOn('cs1'));
  expect('cursor: objeto selecionado = move', await ev(stageCursor), 'move');
  await ev(hoverOn('cs2'));
  expect('cursor: objeto não selecionado = seta', await ev(stageCursor), 'default');
  expect('cursor: alça de redimensionar com a direção certa', await ev(`document.querySelector('[data-handle="se"]')?.style.cursor`), 'nwse-resize');
  expect('cursor: alça de rotação com o cursor próprio (SVG, fallback nativo)', await ev(`/svg.*grab$/.test(document.querySelector('[data-handle="rotate"]')?.style.cursor ?? '')`), true);
  await ev(`(() => { const el = document.querySelector('[data-element-id="cs1"]'); const r = el.getBoundingClientRect(); const o = { bubbles: true, button: 0, pointerId: 5, clientX: r.left + 30, clientY: r.top + 30 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: r.left + 80, clientY: r.top + 70 })); return true; })()`);
  await sleep(100);
  expect('cursor: durante o arrasto = grabbing', await ev(stageCursor), 'grabbing');
  await ev(`(() => { const st = document.querySelector('[data-canvas-stage]'); st.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 5 })); return true; })()`);
  await sleep(150);
  await ev(SB(`s.undo(); s.setActiveTool('hand'); return true;`));
  await sleep(150);
  expect('cursor: Mão = grab', await ev(stageCursor), 'grab');
  await ev(SB(`s.setActiveTool('text'); return true;`));
  await sleep(150);
  expect('cursor: ferramenta Texto = text', await ev(stageCursor), 'text');
  await ev(SB(`s.setActiveTool('select'); s.clearSelection(); return true;`));
  expect('fontes: só a família usada (Lora) foi baixada entre as novas', await fontFiles(`/(merriweather|bebas-neue|space-mono|shadows-into-light|jetbrains-mono|kalam|righteous|source-serif|fira-code)/`), 0);

  /* 7. pinning: 1 byte alterado no IndexedDB desativa a extensão */
  const tamper = await ev(String.raw`(async () => {
    const { repo, exts, hash } = await window.__od.mods;
    const enc = new TextEncoder();
    const manifest = JSON.stringify({ apiVersion: 1, id: 'dev.teste.pinning', name: 'Pinning', version: '1.0.0', publisher: 'Teste', license: 'MIT', kind: 'script', permissions: [], provenance: { originalWork: true, thirdParty: [] }, main: 'main.js' });
    const files = { 'manifest.json': enc.encode(manifest), LICENSE: enc.encode('MIT'), 'main.js': enc.encode('/* nada */') };
    const fileHashes = {};
    for (const [p, b] of Object.entries(files)) fileHashes[p] = await hash.sha256Bytes(b);
    const record = { id: 'dev.teste.pinning', name: 'Pinning', version: '1.0.0', publisher: 'Teste', kind: 'script', source: 'file', dev: false, packageHash: 'x', fileHashes, approvedPermissions: [], installedAt: Date.now(), updatedAt: Date.now(), installedBy: 'teste', enabled: true };
    await repo.boardRepository.saveExtension(record, files);
    await exts.useExtensionsStore.getState().hydrate();
    const ok = exts.useExtensionsStore.getState().extensions.find((e) => e.record.id === 'dev.teste.pinning');
    const stored = await repo.boardRepository.loadExtensionFiles('dev.teste.pinning');
    const changed = new Uint8Array(stored['main.js']);
    changed[0] = changed[0] ^ 1;
    await repo.boardRepository.saveExtension(record, { ...stored, 'main.js': changed });
    await exts.useExtensionsStore.getState().hydrate();
    const bad = exts.useExtensionsStore.getState().extensions.find((e) => e.record.id === 'dev.teste.pinning');
    return { before: ok && ok.status, after: bad && bad.status, enabled: bad && bad.record.enabled };
  })()`);
  expect('pinning: íntegra ao instalar', tamper.before, 'ok');
  expect('pinning: 1 byte alterado → alterada', tamper.after, 'tampered');
  expect('pinning: desativada', tamper.enabled, false);

  /* 8. E04 de ponta a ponta + Modo Seguro desliga tudo */
  const e04 = await ev(String.raw`(async () => {
    const { exts, board, regs, rt, runtime, app } = await window.__od.mods;
    const s = exts.useExtensionsStore.getState();
    const r = await s.approvePermissions('dev.ludraw.contador-palavras');
    for (let i = 0; i < 50 && rt.useExtensionRuntimeStore.getState().states['dev.ludraw.contador-palavras']?.state !== 'running'; i++) await new Promise((x) => setTimeout(x, 100));
    const st = board.useBoardStore.getState();
    const mk = (text, x) => ({ id: 'nota' + x, type: 'sticky', x, y: 400, width: 150, height: 150, rotation: 0, zIndex: 0, locked: false, text, color: '#FBED7C', tags: [] });
    st.addElements([mk('um dois três', 0), mk('quatro', 200)], { select: false });
    board.useBoardStore.getState().setSelectedIds(['nota0', 'nota200']);
    const cmd = regs.CommandRegistry.get('dev.ludraw.contador-palavras/contar');
    cmd && cmd.run();
    await new Promise((x) => setTimeout(x, 1500));
    const toasts = app.useAppStore.getState().toasts.map((t) => t.message);
    const runningBefore = runtime.runningCount();
    await exts.useExtensionsStore.getState().setSafeMode(true);
    const runningSafe = runtime.runningCount();
    const commandsSafe = regs.CommandRegistry.list().length;
    await exts.useExtensionsStore.getState().setSafeMode(false);
    return { approved: r.ok, toast: toasts.find((m) => /4 palavras|4 words/.test(m)) || toasts.join(' | '), runningBefore, runningSafe, commandsSafe };
  })()`);
  expect('E04: permissões aprovadas', e04.approved, true);
  expect('E04: conta as palavras dos post-its selecionados', /4 palavras em 2 post-its|4 words in 2 sticky notes/.test(e04.toast), true);
  expect('Modo Seguro: havia Worker rodando', e04.runningBefore >= 1, true);
  expect('Modo Seguro: nenhum Worker rodando', e04.runningSafe, 0);
  expect('Modo Seguro: nenhum comando de extensão', e04.commandsSafe, 0);

  /* 9. E05 (.drawio) de ponta a ponta, pelo caminho normal de importação de arquivos */
  const e05 = await ev(String.raw`(async () => {
    const { exts, board, rt } = await window.__od.mods;
    const imp = await import('/src/utils/importActions.ts');
    await exts.useExtensionsStore.getState().approvePermissions('dev.ludraw.formatos-drawio');
    for (let i = 0; i < 50 && rt.useExtensionRuntimeStore.getState().states['dev.ludraw.formatos-drawio']?.state !== 'running'; i++) await new Promise((x) => setTimeout(x, 100));
    await new Promise((x) => setTimeout(x, 300));
    const xml = '<mxfile><diagram name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
      + '<mxCell id="a" value="Início" style="ellipse;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>'
      + '<mxCell id="b" value="Fim" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="140" width="120" height="60" as="geometry"/></mxCell>'
      + '<mxCell id="e" edge="1" parent="1" source="a" target="b" style="endArrow=classic;"><mxGeometry relative="1" as="geometry"/></mxCell>'
      + '<mxCell id="g" style="group" vertex="1" parent="1"><mxGeometry x="300" y="0" width="120" height="130" as="geometry"/></mxCell>'
      + '<mxCell id="g1" value="Um" vertex="1" parent="g"><mxGeometry width="120" height="60" as="geometry"/></mxCell>'
      + '<mxCell id="g2" value="Dois" vertex="1" parent="g"><mxGeometry y="70" width="120" height="60" as="geometry"/></mxCell>'
      + '<mxCell id="w" edge="1" parent="1" source="a" target="g1" style="edgeStyle=orthogonalEdgeStyle;entryX=0;entryY=0.5;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="30"/></Array></mxGeometry></mxCell>'
      + '</root></mxGraphModel></diagram></mxfile>';
    const before = board.useBoardStore.getState().elementOrder.length;
    await imp.importFiles([new File([xml], 'teste.drawio', { type: '' })]);
    const s = board.useBoardStore.getState();
    const added = s.elementOrder.slice(before).map((id) => s.elements[id]);
    const last = s.activityLog[s.activityLog.length - 1];
    const um = added.find((e) => e.text === 'Um');
    const dois = added.find((e) => e.text === 'Dois');
    const wp = added.find((e) => e.type === 'connector' && e.waypoints);
    return { types: added.map((e) => e.type + (e.shapeKind ? ':' + e.shapeKind : '')).sort().join(','), via: last && last.viaExtension && last.viaExtension.id, connected: added.some((e) => e.type === 'connector' && e.start.elementId && e.end.elementId),
      grouped: !!(um && dois && um.groupId && um.groupId === dois.groupId), waypoints: wp ? wp.waypoints.length + ' ' + wp.end.anchor : null };
  })()`);
  expect('E05: .drawio vira formas e conector', e05.types, 'connector,connector,shape:circle,shape:rectangle,shape:rectangle,shape:rounded_rectangle');
  expect('E05: grupo do arquivo vira grupo (Ctrl+G)', e05.grouped, true);
  expect('E05: pontos intermediários e âncora do arquivo', e05.waypoints, '1 left');
  expect('E05: conector ligado às formas', e05.connected, true);
  expect('E05: Activity Log via extensão', e05.via, 'dev.ludraw.formatos-drawio');

  /* R4. Chat 08.7 · R4 — nada sai do computador sem a permissão de rede (S-28) nem por objetos do board (S-30/S-31) */
  trackerHits.length = 0;
  // (a) Worker SEM permissão de rede: import(), FontFace, importScripts, fetch, WebSocket, EventSource, Function(import)
  const leakWorker = String.raw`
    var r = {};
    function tryIt(k, f) { return Promise.resolve().then(f).then(function () { r[k] = 'saiu'; }, function () { r[k] = 'bloqueado'; }); }
    Promise.resolve()
      .then(function () { return tryIt('import', function () { return import('${TRK}/w-import.js?d=segredo'); }); })
      .then(function () { return tryIt('fontface', function () { var f = new FontFace('x', 'url(${TRK}/w-font?d=segredo)'); if (self.fonts) self.fonts.add(f); return f.load(); }); })
      .then(function () { return tryIt('importScripts', function () { importScripts('${TRK}/w-importscripts.js?d=segredo'); }); })
      .then(function () { return tryIt('fetch', function () { return fetch('${TRK}/w-fetch?d=segredo'); }); })
      .then(function () { return tryIt('websocket', function () { return new Promise(function (ok, no) { var w = new WebSocket('${TRK_WS}/w-ws?d=segredo'); w.onopen = ok; w.onerror = no; setTimeout(no, 1500); }); }); })
      .then(function () { return tryIt('eventsource', function () { return new Promise(function (ok, no) { var e = new EventSource('${TRK}/w-es?d=segredo'); e.onopen = ok; e.onerror = no; setTimeout(no, 1500); }); }); })
      .then(function () { return tryIt('fnImport', function () { return (function () {}).constructor('return import("${TRK}/w-fn.js?d=segredo")')(); }); })
      .then(function () { return ludraw.storage.set('vaza', r); });
  `;
  expect('R4 Worker: extensão sem rede inicia', await ev(START('dev.teste.vaza', ['storage'], leakWorker)), 'running');
  const leakW = await ev(STORED('dev.teste.vaza', 'vaza', 12000));
  expect('R4 Worker: a extensão rodou até o fim (armazenamento pela API)', leakW ? Object.keys(leakW).length : 0, 7);
  for (const k of ['import', 'fontface', 'importScripts', 'fetch', 'websocket', 'eventsource', 'fnImport']) expect(`R4 Worker: ${k} não sai`, leakW?.[k], 'bloqueado');
  await sleep(800);
  expect('R4 Worker: zero acessos ao rastreador', trackerHits.filter((h) => h.includes('/w-')), []);

  // (b) painel embrulhado: fetch, sendBeacon, WebSocket, EventSource, @import, <img>, FontFace, import(), Worker,
  //     navegação do próprio painel (location, link, meta refresh) e do intermediário (parent.location)
  await ev(`window.__od.panelHtml = ${JSON.stringify(String.raw`<style>@import url('${TRK}/p-import.css?d=segredo'); body { background: #eef; }</style>
    <p id="ok">painel embrulhado</p><img src="${TRK}/p-img?d=segredo"><script>
    var r = {};
    function t(k, f) { try { var x = f(); if (x && x.catch) x.catch(function () {}); r[k] = 'tentou'; } catch (e) { r[k] = 'throw'; } }
    t('fetch', function () { return fetch('${TRK}/p-fetch?d=segredo'); });
    t('beacon', function () { return navigator.sendBeacon('${TRK}/p-beacon?d=segredo', 'x'); });
    t('ws', function () { return new WebSocket('${TRK_WS}/p-ws?d=segredo'); });
    t('es', function () { return new EventSource('${TRK}/p-es?d=segredo'); });
    t('font', function () { var f = new FontFace('y', 'url(${TRK}/p-font?d=segredo)'); document.fonts.add(f); return f.load(); });
    t('imp', function () { return import('${TRK}/p-import.js?d=segredo'); });
    t('worker', function () { return new Worker('data:text/javascript,fetch("${TRK}/p-worker?d=segredo")'); });
    t('parentNav', function () { parent.location = '${TRK}/p-parent-nav?d=segredo'; });
    r.styled = getComputedStyle(document.body).backgroundColor;
    ludraw.board.addElements([{ type: 'sticky', x: 0, y: 0, width: 100, height: 100 }]).then(function () { return 'escreveu'; }, function (e) { return e.code; })
      .then(function (w) { r.write = w; return ludraw.storage.set('painelvaza', r); })
      .then(function () {
        setTimeout(function () { location.href = '${TRK}/p-nav?d=segredo'; }, 300);
        setTimeout(function () { var a = document.createElement('a'); a.href = '${TRK}/p-nav-link?d=segredo'; document.body.appendChild(a); a.click(); }, 600);
        setTimeout(function () { var m = document.createElement('meta'); m.httpEquiv = 'refresh'; m.content = '0;url=${TRK}/p-refresh?d=segredo'; document.head.appendChild(m); }, 900);
      });
  </script>`)}`);
  await ev(START('dev.teste.painelvaza', ['storage', 'ui.panel'], '/* lógica vazia */', `, ui: 'ui/panel.html', contributes: { panels: [{ id: 'p', title: 'Painel embrulhado' }] }`));
  await ev(`(async () => { const { rt } = await window.__od.mods; rt.useExtensionRuntimeStore.getState().setOpenPanel('dev.teste.painelvaza/p'); })()`);
  const pv = await ev(STORED('dev.teste.painelvaza', 'painelvaza', 8000));
  expect('R4 painel: renderiza e roda com o intermediário (API + armazenamento)', !!pv, true);
  expect('R4 painel: estilo embutido do painel continua valendo', pv?.styled, 'rgb(238, 238, 255)');
  expect('R4 painel: permissões continuam valendo (sem board.write → negado)', pv?.write, 'permission');
  await sleep(2500);
  expect('R4 painel: zero acessos ao rastreador (nem navegação)', trackerHits.filter((h) => h.includes('/p-')), []);
  expect('R4 painel: iframe externo continua só com allow-scripts', await ev(`(() => { const f = document.querySelector('iframe[data-extension-panel="dev.teste.painelvaza/p"]'); return f ? f.getAttribute('sandbox') : 'sem iframe'; })()`), 'allow-scripts');
  await ev(`(async () => { const { rt } = await window.__od.mods; rt.useExtensionRuntimeStore.getState().setOpenPanel(null); })()`);
  await ev(`(async () => { const { runtime } = await window.__od.mods; runtime.stopExtensionRuntime('dev.teste.vaza'); runtime.stopExtensionRuntime('dev.teste.painelvaza'); })()`);

  // (c) objetos do board vindos de fora (backup, Yjs antigo): link javascript:, imagem externa e cor com url()
  const seeded = await ev(`(async () => {
    const { board } = await window.__od.mods;
    const f = await import('/src/utils/factory.ts');
    const k = await import('/src/utils/kanban.ts');
    const s = board.useBoardStore.getState();
    const st = f.createStickyNote({ x: 40, y: 40, text: 'link ruim', link: 'javascript:fetch("${TRK}/link-js")' });
    const ok = f.createStickyNote({ x: 300, y: 40, text: 'link bom', link: 'https://example.com/' });
    const img = f.createImage({ x: 40, y: 320, dataUrl: '${TRK}/img-externa.png?d=segredo', naturalWidth: 10, naturalHeight: 10, width: 160, height: 120 });
    const fr = f.createFrame({ x: 600, y: 40, width: 300, height: 200 }, { title: 'q', fillColor: 'url(${TRK}/frame-bg?d=segredo)' });
    const kb = f.createKanban({ x: 300, y: 600 }, { columns: [k.createKanbanColumn('A', 'url(${TRK}/kanban-col?d=segredo)')] });
    s.addElements([st, ok, img, fr, kb], { select: false });
    s.setCamera({ x: 0, y: 0, zoom: 1 });
    return { st: st.id, ok: ok.id, img: img.id, fr: fr.id, kb: kb.id };
  })()`);
  await sleep(1500);
  const dom = await ev(`(() => {
    const q = (id) => document.querySelector('[data-element-id="' + id + '"]');
    return {
      present: [${JSON.stringify(seeded.st)}, ${JSON.stringify(seeded.img)}, ${JSON.stringify(seeded.fr)}].every((id) => !!q(id)),
      jsLink: !!q(${JSON.stringify(seeded.st)})?.querySelector('a'),
      goodLink: q(${JSON.stringify(seeded.ok)})?.querySelector('a')?.getAttribute('href') ?? null,
      anyJs: [...document.querySelectorAll('a[href]')].filter((a) => /^\\s*javascript:/i.test(a.getAttribute('href'))).length,
      imgPlaceholder: !!q(${JSON.stringify(seeded.img)})?.querySelector('[data-external-image]'),
      imgTag: !!q(${JSON.stringify(seeded.img)})?.querySelector('img'),
    };
  })()`);
  expect('R4: objetos semeados aparecem na tela', dom.present, true);
  expect('R4 S-31: link javascript: não vira <a>', dom.jsLink, false);
  expect('R4 S-31: nenhum <a href="javascript:"> na tela', dom.anyJs, 0);
  expect('R4 S-31: link https continua clicável', dom.goodLink, 'https://example.com/');
  expect('R4 S-30: imagem externa mostra o espaço reservado', dom.imgPlaceholder, true);
  expect('R4 S-30: imagem externa não vira <img> sozinha', dom.imgTag, false);
  expect('R4 S-30: zero acessos ao abrir (imagem e cores com url())', trackerHits.filter((h) => /img-externa|frame-bg|kanban-col|link-js/.test(h)), []);
  // Chat 09 · R2 (decisão do usuário): no Modo Local não há botão — o espaço reservado explica como trazer a imagem
  const localPlaceholder = await ev(`(async () => { const { i18n } = await window.__od.mods; const p = document.querySelector('[data-element-id="${seeded.img}"] [data-external-image]'); return { button: !!p?.querySelector('button'), explains: !!p && (p.textContent + ' ' + (p.getAttribute('title') ?? '')).includes(i18n.t('widgets.imageView.externalLocal')) }; })()`);
  expect('Chat 09 · R2: imagem externa no Modo Local — sem botão de carregar', localPlaceholder.button, false);
  expect('Chat 09 · R2: imagem externa no Modo Local — explica salvar e arrastar', localPlaceholder.explains, true);
  await sleep(800);
  expect('Chat 09 · R2: a imagem externa nunca é buscada no Modo Local', trackerHits.filter((h) => h.includes('img-externa')), []);
  await ev(`(async () => { const { board } = await window.__od.mods; board.useBoardStore.getState().deleteElements(${JSON.stringify(Object.values(seeded))}, { logActivity: false }); })()`);
  await sleep(300);

  // (d) colar o ENDEREÇO de uma imagem: nada é buscado sozinho; "Baixar para o board" baixa uma vez e guarda no board
  trackerHits.length = 0;
  const pasteUrl = await ev(`(async () => {
    const { board, app } = await window.__od.mods;
    const ia = await import('/src/utils/importActions.ts');
    const before = new Set(board.useBoardStore.getState().elementOrder);
    await ia.handlePasteSnapshot({ types: ['text/plain'], text: '${TRK}/colada.png', html: '', svg: '', files: [], source: 'paste' }, { x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 400));
    const toast = app.useAppStore.getState().toasts.slice(-1)[0];
    const insertedBefore = board.useBoardStore.getState().elementOrder.filter((id) => !before.has(id)).length;
    window.__od.pasteToast = toast;
    window.__od.pasteBefore = before;
    return { label: toast?.action?.label ?? null, insertedBefore };
  })()`);
  // Chat 09 · R2 (D6): no Modo Local o navegador não busca imagem de outro site (CSP) — o aviso orienta salvar e arrastar
  const localDetail = await ev(`(async () => { const { i18n } = await window.__od.mods; return window.__od.pasteToast?.detail === i18n.t('importexport.safety.urlImageLocal'); })()`);
  expect('Chat 09 · R2 colar URL de imagem (Modo Local): sem "Baixar para o board"', pasteUrl.label, null);
  expect('Chat 09 · R2 colar URL de imagem (Modo Local): orienta salvar e arrastar', localDetail, true);
  expect('R4 colar URL de imagem: nada entra no board', pasteUrl.insertedBefore, 0);
  await sleep(600);
  expect('R4 colar URL de imagem: nenhum acesso ao endereço', trackerHits.filter((h) => h.includes('colada')), []);

  // (e) importadores (formatos abertos, extensões, colagem estruturada): mesmo funil `insertImported` descarta o inseguro
  const imported = await ev(`(async () => {
    const { board, app } = await window.__od.mods;
    const f = await import('/src/utils/factory.ts');
    const ia = await import('/src/utils/importActions.ts');
    const els = [
      f.createStickyNote({ x: 0, y: 0, text: 'importado', link: 'javascript:alert(1)' }),
      f.createImage({ x: 0, y: 300, dataUrl: '${TRK}/importada.png', naturalWidth: 10, naturalHeight: 10 }),
      f.createFrame({ x: 400, y: 0, width: 200, height: 200 }, { title: 'f', fillColor: 'url(${TRK}/importada-bg)' }),
    ];
    const ids = ia.insertImported(els, { activity: { key: 'board.activity.source.paste' }, summary: 'teste', at: { x: 0, y: 0 } });
    const s = board.useBoardStore.getState();
    const out = ids.map((id) => s.elements[id]);
    const toast = app.useAppStore.getState().toasts.slice(-1)[0];
    s.deleteElements(ids, { logActivity: false });
    return { types: out.map((e) => e.type).sort().join(','), link: out.find((e) => e.type === 'sticky')?.link ?? null, fill: out.find((e) => e.type === 'frame')?.fillColor, warned: /3 itens inseguros/.test(toast?.message ?? '') };
  })()`);
  expect('R4 importar: imagem externa fica de fora', imported.types, 'frame,sticky');
  expect('R4 importar: link inseguro sai', imported.link, null);
  expect('R4 importar: cor com url() vira neutra', imported.fill, 'transparent');
  expect('R4 importar: aviso com a contagem', imported.warned, true);
  await sleep(500);
  expect('R4 importar: zero acessos', trackerHits.filter((h) => h.includes('importada')), []);

  // (f) S-32: chaves com nome de protótipo no armazenamento da extensão
  const protoCode = String.raw`
    var r = {};
    ludraw.storage.get('constructor').then(function (v) { r.get = v === null ? 'null' : typeof v; }, function (e) { r.get = 'ERR ' + e.code; })
      .then(function () { return ludraw.storage.set('__proto__', { polluted: 1 }).then(function () { r.set = 'aceitou'; }, function (e) { r.set = e.code; }); })
      .then(function () { return ludraw.storage.set('prototype', 1).then(function () { r.set2 = 'aceitou'; }, function (e) { r.set2 = e.code; }); })
      .then(function () { return ludraw.storage.set('proto', r); });
  `;
  await ev(START('dev.teste.proto', ['storage'], protoCode));
  const proto = await ev(STORED('dev.teste.proto', 'proto'));
  expect('R4 S-32: storage.get("constructor") devolve null (não a função herdada)', proto?.get, 'null');
  expect('R4 S-32: storage.set("__proto__") recusado', proto?.set, 'invalid');
  expect('R4 S-32: storage.set("prototype") recusado', proto?.set2, 'invalid');
  expect('R4 S-32: a extensão continua rodando', await ev(`(async () => { const { rt } = await window.__od.mods; return rt.useExtensionRuntimeStore.getState().states['dev.teste.proto']?.state; })()`), 'running');
  await ev(`(async () => { const { runtime } = await window.__od.mods; runtime.stopExtensionRuntime('dev.teste.proto'); })()`);

  // Sistema visual (#/design-system) organizado por tipo de design: grupos fixos, cada assunto uma vez, sem número de chat
  await ev(`(() => { location.hash = '#/design-system'; return true; })()`);
  for (let i = 0; i < 40 && !(await ev(`document.querySelectorAll('#ds-indice li').length > 30`)); i++) await sleep(250);
  const ds = await ev(`(() => {
    const groups = [...document.querySelectorAll('[data-ds-group]')].map((g) => g.dataset.dsGroup);
    const frames = [...document.querySelectorAll('[data-ds-frame]')].map((f) => f.dataset.dsFrame);
    return { groups: groups.join(' | '), frames: frames.length, dup: frames.filter((t, i) => frames.indexOf(t) !== i), numbered: frames.filter((t) => /^[0-9][0-9] ·|[(]Chat [0-9]/.test(t)), index: document.querySelectorAll('#ds-indice li').length };
  })()`);
  expect('Sistema visual: 9 grupos por tipo de design', ds.groups, 'Fundamentos | Componentes base | Estúdio | Canvas e objetos | Facilitação e governança | Colaboração ao vivo | Mesa | Telas e fluxos | Como contribuir');
  expect('Sistema visual: nenhum frame repetido', ds.dup, []);
  expect('Sistema visual: títulos sem número de frame nem de chat', ds.numbered, []);
  // fora do índice de propósito: “Leia primeiro” (antes do índice) e o frame de “Como contribuir”
  expect('Sistema visual: índice lista todos os frames dos grupos', ds.index, ds.frames - 2);
  await ev(`(() => { location.hash = '#/'; return true; })()`);
  await sleep(600);
  expect('sem erros não tratados na página', pageErrors.filter((e) => !/ResizeObserver/.test(e)), []);
  expect('Chat 09 · R2: nenhuma violação da CSP do app', cspViolations, []);
} catch (err) {
  failures.push(`roteiro interrompido: ${err.message}`);
} finally {
  try {
    ws?.close();
  } catch {
    /* fechado */
  }
  chrome.kill();
  vite.kill();
  tracker.close();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* o Chrome pode segurar arquivos por alguns instantes */
  }
}

console.log(`Extensões (navegador): ${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
