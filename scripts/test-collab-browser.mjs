#!/usr/bin/env node
/**
 * LuDraw — edição ao vivo em DOIS NAVEGADORES reais (Chat 08). Sem dependências novas: sobe o servidor
 * (PostgreSQL embutido), o Vite com o proxy `/api` (inclui WebSocket) e dois Chrome/Edge headless com perfis
 * separados, controlados pelo protocolo DevTools. Cada pessoa entra pela tela de login.
 *
 *   npm run test:collab:browser          (CHROME_PATH=/caminho/do/chrome se não for achado)
 *
 * Roteiro: conexão ao vivo nos dois → o que um cria/edita aparece no outro → desfazer é por pessoa (não apaga
 * o que o outro fez) → Modo Privado: o texto da nota do outro NUNCA chega, a própria pessoa o vê → o facilitador
 * revela e o texto aparece → o que foi feito fica salvo no servidor → recarregar a página mantém tudo.
 */
import { spawn } from 'node:child_process';
import { cspHeaderExpression, cspViolationOf, isAppCsp, watchCsp } from './lib/csp-watch.mjs';

/** Chat 09 · R2: violações da CSP do app (documento de topo, todas as abas) — precisam ser zero */
const cspViolations = [];
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rand = (base) => base + Math.floor(Math.random() * 50);
const VITE_PORT = rand(5440);
const API_PORT = rand(3540);
const DEBUG_A = rand(9700);
const DEBUG_B = rand(9760);
const SETUP_TOKEN = 'E2ECOLLAB-ABCDEFGHJKLMNPQ';
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
const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: join(root, 'server'),
  env: { ...process.env, DATABASE_URL: 'pglite://memory', PORT: String(API_PORT), HOST: '127.0.0.1', LUDRAW_ASSETS_DIR: ASSETS_DIR, LUDRAW_SETUP_TOKEN: SETUP_TOKEN, LUDRAW_CORS_ORIGINS: `http://localhost:${VITE_PORT}`, LOG_LEVEL: 'warn' },
  stdio: 'ignore',
});
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(VITE_PORT), '--strictPort'], {
  cwd: root,
  env: { ...process.env, LUDRAW_API_PROXY: `http://127.0.0.1:${API_PORT}` },
  stdio: 'ignore',
});
const profiles = [mkdtempSync(join(tmpdir(), 'ludraw-col-a-')), mkdtempSync(join(tmpdir(), 'ludraw-col-b-'))];
const chromes = [DEBUG_A, DEBUG_B].map((port, i) =>
  spawn(chromePath, ['--headless=new', '--window-size=1400,900', `--remote-debugging-port=${port}`, `--user-data-dir=${profiles[i]}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' }),
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

const api = (token, method, path, body, extra = {}) =>
  fetch(`http://127.0.0.1:${API_PORT}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-ludraw-client': 'web', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

const NET_SWITCH = String.raw`(() => {
  const Native = window.WebSocket;
  const socks = new Set();
  const net = { offline: sessionStorage.getItem('__odOffline') === '1' };
  class Switched extends Native {
    constructor(url, protocols) {
      const live = String(url).includes('/api/v1/collab');
      super(live && net.offline ? 'ws://127.0.0.1:9/' : url, protocols);
      if (live) {
        socks.add(this);
        this.addEventListener('close', () => socks.delete(this));
      }
    }
  }
  // Chat 08.2: conta as atualizações Yjs enviadas (mensagem de sincronização do Hocuspocus: nome do documento,
  // tipo 0 = Sync, subtipo 1 = SyncStep2 ou 2 = Update) — a prévia da linha do tempo não pode enviar nenhuma
  net.yjsUpdates = 0;
  const readVarUint = (b, pos) => { let n = 0, shift = 0, x; do { x = b[pos.i++]; n += (x & 127) * Math.pow(2, shift); shift += 7; } while (x >= 128 && pos.i < b.length); return n; };
  const origSend = Native.prototype.send;
  Switched.prototype.send = function (data) {
    try {
      if (String(this.url).includes('/api/v1/collab') && (data instanceof Uint8Array || data instanceof ArrayBuffer)) {
        const b = data instanceof Uint8Array ? data : new Uint8Array(data);
        const pos = { i: 0 };
        const len = readVarUint(b, pos);
        pos.i += len;
        const type = readVarUint(b, pos);
        if (type === 0) {
          const sub = readVarUint(b, pos);
          if (sub === 1 || sub === 2) net.yjsUpdates++;
        }
      }
    } catch {}
    return origSend.call(this, data);
  };
  window.WebSocket = Switched;
  net.goOffline = () => { net.offline = true; sessionStorage.setItem('__odOffline', '1'); for (const s of socks) s.close(); };
  net.goOnline = () => { net.offline = false; sessionStorage.removeItem('__odOffline'); window.dispatchEvent(new Event('online')); };
  window.__odNet = net;
})();`;

async function openPage(debugPort) {
  const [target] = (await (await waitFor(`http://127.0.0.1:${debugPort}/json/list`)).json()).filter((t) => t.type === 'page');
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
  // Chat 08.2: "sem rede" SÓ para o WebSocket do tempo real (o resto do app continua carregando). Instalado antes de
  // cada página; o estado fica no sessionStorage, então sobrevive a recarregar a página ainda "sem rede".
  await send('Page.addScriptToEvaluateOnNewDocument', { source: NET_SWITCH });
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
    goto: async (hash) => {
      await send('Page.navigate', { url: `http://localhost:${VITE_PORT}/${hash}` });
      await sleep(4500);
    },
    reload: async () => {
      await send('Page.reload');
      await sleep(5000);
    },
    fillAndSubmit: (values) =>
      ev(`(async () => {
        // Chat 09 · R4: espera o formulário aparecer (com a máquina ocupada, os 4,5 s fixos do goto não bastavam)
        let form = null;
        for (let i = 0; i < 60 && !form; i++) {
          form = [...document.querySelectorAll('form')].find((f) => f.offsetParent !== null) ?? null;
          if (!form) await new Promise((r) => setTimeout(r, 250));
        }
        const inputs = [...form.querySelectorAll('input:not([type=radio]):not([readonly])')];
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        ${JSON.stringify(values)}.forEach((v, i) => { setter.call(inputs[i], v); inputs[i].dispatchEvent(new Event('input', { bubbles: true })); });
        await new Promise((r) => setTimeout(r, 100));
        form.querySelector('button[type=submit]').click();
        return inputs.length;
      })()`),
  };
}

const MODS = `Promise.all([import('/src/store/useAppStore.ts'), import('/src/store/useBoardStore.ts'), import('/src/utils/factory.ts'), import('/src/collab/session.ts'), import('/src/collab/presenceStore.ts'), import('/src/utils/collaboration.ts')]).then(([app, board, factory, collab, uiMod, collabUtil]) => ({ app, board, factory, collab, ui: uiMod.useCollabUi, collabUtil }))`;
const until = async (page, expr, ms = 10000) => {
  for (let i = 0; i < ms / 250; i++) {
    if (await page.ev(expr)) return true;
    await sleep(250);
  }
  return false;
};
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

const B = (expr) => `${MODS}.then(({ board, factory, app, collab, ui, collabUtil }) => { const s = board.useBoardStore.getState(); ${expr} })`;
const elText = (id) => B(`return s.elements[${JSON.stringify(id)}]?.text ?? null;`);
const has = (id) => B(`return !!s.elements[${JSON.stringify(id)}];`);

let a;
let b;
try {
  await waitFor(`http://127.0.0.1:${API_PORT}/health`);
  await waitFor(`http://localhost:${VITE_PORT}/favicon.svg`);

  // 0) organização, duas pessoas e um board — por HTTP (a tela já é coberta pelo teste do Modo Servidor)
  const setup = await api(null, 'POST', '/setup/complete', { token: SETUP_TOKEN, mode: 'single_org', organization: { name: 'Empresa Ao Vivo', allowedEmailDomains: [] }, admin: { name: 'Ana Admin', email: 'ana@example.com', password: PASSWORD } });
  const adminToken = setup.json.accessToken;
  const inv = await api(adminToken, 'POST', '/workspace/ops', { op: { type: 'createInvitation', input: { email: 'bia@example.com', role: 'member', expiresInDays: 7 } } });
  await api(null, 'POST', `/invitations/${inv.json.token}/accept`, { name: 'Bia Membro', email: 'bia@example.com', password: PASSWORD });
  const board = await api(adminToken, 'POST', '/boards', {
    name: 'Quadro ao vivo',
    place: { kind: 'workspace' },
    data: {
      version: 1,
      elements: { s1: { id: 's1', type: 'sticky', x: 0, y: 0, width: 200, height: 200, rotation: 0, zIndex: 0, createdAt: 1, updatedAt: 1, text: 'inicial', color: '#FBED7C', tags: [], reactions: {} } },
      elementOrder: ['s1'],
      gridSettings: { type: 'dots', size: 20, snap: false },
      backgroundColor: null,
      initialView: null,
      activityLog: [],
      facilitation: { privateMode: { enabled: false, previewOwnNotes: false } },
    },
  });
  const boardId = board.json.board.id;
  expect('board criado no servidor', board.status, 200);

  a = await openPage(DEBUG_A);
  b = await openPage(DEBUG_B);
  await a.goto('#/');
  await a.fillAndSubmit(['ana@example.com', PASSWORD]);
  await b.goto('#/');
  await b.fillAndSubmit(['bia@example.com', PASSWORD]);
  await sleep(3000);
  expect('Ana entrou', await a.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().user?.email)`), 'ana@example.com');
  expect('Bia entrou', await b.ev(`${MODS}.then(({ app }) => app.useAppStore.getState().user?.email)`), 'bia@example.com');

  // 1) os dois abrem o board e a edição ao vivo liga
  await a.ev(`location.hash = '#/board/${boardId}'`);
  await b.ev(`location.hash = '#/board/${boardId}'`);
  const liveA = await until(a, B(`return s.boardId === ${JSON.stringify(boardId)} && s.collab === true && collab.currentCollab()?.status === 'live';`), 20000);
  const liveB = await until(b, B(`return s.boardId === ${JSON.stringify(boardId)} && s.collab === true && collab.currentCollab()?.status === 'live';`), 20000);
  expect('Ana: edição ao vivo ligada', liveA, true);
  expect('Bia: edição ao vivo ligada', liveB, true);
  expect('os dois enxergam o post-it inicial', [await a.ev(elText('s1')), await b.ev(elText('s1'))], ['inicial', 'inicial']);


  // 1b) presença: quem está online, cursor, seleção, edição, avatares e seguir
  const biaId = await b.ev(B(`return s.access.userId;`));
  expect('Ana vê 2 pessoas online', await until(a, B(`return ui.getState().users.length === 2;`)), true);
  expect('Bia vê 2 pessoas online', await until(b, B(`return ui.getState().users.length === 2;`)), true);
  await b.ev(B(`s.setLastPointerWorld({ x: 123, y: 456 }); return true;`));
  expect('cursor da Bia chega à Ana (coordenadas do board)', await until(a, B(`const c = ui.getState().cursors[${JSON.stringify(biaId)}]; return !!c && c.x === 123 && c.y === 456;`)), true);
  expect('cursor desenhado com o nome da Bia', await until(a, `/Bia Membro/.test(document.querySelector('[data-testid=remote-presence]')?.innerText || '')`), true);
  expect('a própria pessoa não vê o seu cursor', await b.ev(B(`return Object.keys(ui.getState().cursors).includes(${JSON.stringify(biaId)});`)), false);
  await b.ev(B(`s.setSelectedIds(['s1']); return true;`));
  expect('seleção da Bia chega à Ana', await until(a, B(`return JSON.stringify(ui.getState().selection[${JSON.stringify(biaId)}]) === '["s1"]';`)), true);
  expect('contorno do objeto com o nome da Bia', await until(a, `/Bia/.test(document.querySelector('[data-testid=remote-presence]')?.innerText || '')`), true);
  // objeto em uso por outra pessoa fica bloqueado (sempre): selecionado pela Bia não entra na seleção da Ana
  await a.ev(B(`s.setSelectedIds(['s1']); return true;`));
  expect('o objeto selecionado pela Bia não entra na seleção da Ana', await a.ev(B(`return s.selectedIds;`)), []);
  await b.ev(B(`s.setEditingId('s1'); return true;`));
  expect('Ana vê que a Bia está editando', await until(a, B(`return ui.getState().editing[${JSON.stringify(biaId)}] === 's1';`)), true);
  await a.ev(B(`s.setEditingId('s1'); return true;`));
  expect('o objeto fica bloqueado para a Ana enquanto a Bia edita', await a.ev(B(`return s.editingId;`)), null);
  await b.ev(B(`s.setEditingId(null); s.clearSelection(); return true;`));
  expect('quando a Bia termina, a Ana consegue editar', await until(a, B(`s.setEditingId('s1'); return s.editingId === 's1';`)), true);
  await a.ev(B(`s.setEditingId(null); s.clearSelection(); return true;`));

  // caixa de seleção por arrasto da Bia aparece na tela da Ana, na cor dela, e some ao soltar
  await b.ev(B(`s.setMarquee({ x: 0, y: 0, width: 220, height: 140 }); return true;`));
  expect('marquee da Bia visível na Ana', await until(a, `!!document.querySelector('[data-remote-marquee]')`), true);
  await b.ev(B(`s.setMarquee(null); return true;`));
  expect('e some quando ela solta', await until(a, `!document.querySelector('[data-remote-marquee]')`), true);

  // inércia do cursor: desligada = salto direto; ligada = chega ao ponto com movimento suave
  const cursorAt = `(() => { const el = document.querySelector('[data-remote-cursor]'); const m = /translate\\(([-\\d.]+)px, ([-\\d.]+)px\\)/.exec(el?.style.transform || ''); return m ? [Math.round(+m[1]), Math.round(+m[2])] : null; })()`;
  const screenOf = (x, y) => a.ev(B(`const c = s.camera; return [Math.round(${x} * c.zoom + c.x), Math.round(${y} * c.zoom + c.y)];`));
  // ligada (padrão) PRIMEIRO, com o cursor já montado — é o caso em que ele travava
  expect('inércia ligada por padrão', await a.ev(B(`return app.useAppStore.getState().preferences.cursorInertia;`)), true);
  await b.ev(B(`s.setLastPointerWorld({ x: 100, y: 120 }); return true;`));
  const target2 = await screenOf(100, 120);
  expect('com inércia o cursor se move até o ponto', await until(a, `JSON.stringify(${cursorAt}) === ${JSON.stringify(JSON.stringify(target2))}`), true);
  expect('com inércia há transição suave', await a.ev(`document.querySelector('[data-remote-cursor]').style.transition.includes('transform')`), true);
  await b.ev(B(`s.setLastPointerWorld({ x: 640, y: 380 }); return true;`));
  expect('e continua se movendo a cada envio', await until(a, `JSON.stringify(${cursorAt}) === ${JSON.stringify(JSON.stringify(await screenOf(640, 380)))}`), true);
  await a.ev(B(`app.useAppStore.getState().setPreference('cursorInertia', false); return true;`));
  await b.ev(B(`s.setLastPointerWorld({ x: 600, y: 300 }); return true;`));
  const target1 = await screenOf(600, 300);
  expect('sem inércia o cursor vai direto ao ponto', await until(a, `JSON.stringify(${cursorAt}) === ${JSON.stringify(JSON.stringify(target1))}`), true);
  expect('sem inércia não há transição', await a.ev(`document.querySelector('[data-remote-cursor]').style.transition`), 'none');
  await a.ev(B(`app.useAppStore.getState().setPreference('cursorInertia', true); return true;`));
  expect('avatar da Bia na barra do topo da Ana', await until(a, `document.querySelectorAll('[data-testid=online-avatars] button').length === 1`), true);
  // Chat 08.2 (Estúdio v2): a pilha mostra os OUTROS; a própria pessoa é o botão Você, logo depois (mesmo círculo)
  expect('pilha do Estúdio: os outros na pilha e o próprio avatar no botão Você, depois dela', await a.ev(`(() => { const g = document.querySelector('[data-testid=online-avatars]'); const you = document.querySelector('[data-testid=studio-you]'); const other = g?.querySelector('button'); if (!g || !you || !other || g.querySelector('[data-self-avatar]')) return false; return (g.compareDocumentPosition(you) & 4) !== 0 && you.getBoundingClientRect().left > other.getBoundingClientRect().right; })()`), true);
  await a.ev(`document.querySelector('[data-testid=online-avatars] button').click(); true`);
  expect('clicar no avatar segue a Bia', await a.ev(B(`return ui.getState().following === ${JSON.stringify(biaId)};`)), true);
  await b.ev(B(`s.setCamera({ x: -900, y: -700, zoom: 1.5 }); return true;`));
  expect('a câmera da Ana acompanha o zoom da Bia', await until(a, B(`return Math.abs(s.camera.zoom - 1.5) < 0.01;`), 8000), true);
  const centers = [
    await a.ev(B(`const v = collabUtil.cameraToView(s.camera, s.viewport); return [Math.round(v.x), Math.round(v.y)];`)),
    await b.ev(B(`const v = collabUtil.cameraToView(s.camera, s.viewport); return [Math.round(v.x), Math.round(v.y)];`)),
  ];
  expect('e o centro da tela', Math.abs(centers[0][0] - centers[1][0]) < 4 && Math.abs(centers[0][1] - centers[1][1]) < 4, true);
  await a.ev(B(`ui.getState().follow(${JSON.stringify(biaId)}); return true;`));
  expect('parar de seguir', await a.ev(B(`return ui.getState().following;`)), null);

  // 1c) "Trazer todos até mim": a facilitadora conduz; quem é conduzido pode sair; quem não é facilitador não conduz
  const anaLeader = await a.ev(B(`return s.access.userId;`));
  await b.ev(B(`s.bringEveryone(); return true;`));
  await sleep(500);
  expect('quem não é facilitador não conduz', await a.ev(B(`return s.facilitation.leaderUserId ?? null;`)), null);
  await a.ev(B(`s.bringEveryone(); return true;`));
  expect('a Bia passa a seguir a Ana (conduzida)', await until(b, B(`const u = ui.getState(); return u.following === ${JSON.stringify(anaLeader)} && u.forced === true;`)), true);
  expect('faixa de condução na Bia', await until(b, `/está conduzindo/.test(document.body.innerText)`), true);
  expect('faixa de quem conduz na Ana', await until(a, `/Você está conduzindo/.test(document.body.innerText)`), true);
  await a.ev(B(`s.setCamera({ x: -300, y: -200, zoom: 0.8 }); return true;`));
  expect('a tela da Bia acompanha a da Ana', await until(b, B(`return Math.abs(s.camera.zoom - 0.8) < 0.01;`), 8000), true);
  await b.ev(`[...document.querySelectorAll('button')].find((x) => /Sair do modo seguir/.test(x.textContent)).click(); true`);
  expect('a Bia saiu do modo seguir', await b.ev(B(`return ui.getState().following;`)), null);
  await a.ev(B(`s.setCamera({ x: 100, y: 50, zoom: 1.3 }); return true;`));
  await sleep(1200);
  expect('depois de sair, a tela da Bia não muda mais', Math.abs((await b.ev(B(`return s.camera.zoom;`))) - 0.8) < 0.01, true);
  await a.ev(B(`s.stopLeading(); return true;`));
  expect('parar de conduzir chega à Bia', await until(b, B(`return (s.facilitation.leaderUserId ?? null) === null;`)), true);

  // 1d) cronômetro e música compartilhados; o FIM é gravado pelo servidor (não por cada navegador)
  await a.ev(B(`s.setTimerMusic('lofi'); s.startTimer(2500); return true;`));
  expect('cronômetro rodando na Bia', await until(b, B(`return !!s.facilitation.timer?.running;`)), true);
  expect('música escolhida chega à Bia', await b.ev(B(`return s.facilitation.timer?.musicTrack;`)), 'lofi');
  expect('o servidor encerra o tempo para os dois', await until(b, B(`const t = s.facilitation.timer; return !!t && !t.running && !!t.finishedAt;`), 9000), true);
  expect('e na Ana também', await until(a, B(`const t = s.facilitation.timer; return !!t && !t.running && !!t.finishedAt;`)), true);
  await a.ev(B(`s.resetTimer(); s.setTimerMusic('none'); s.setTimerVisible(false); return true;`));

  // 2) criar e editar chega ao outro
  await a.ev(B(`s.addElements([factory.createStickyNote({ x: 300, y: 0, text: 'da Ana' })]); return true;`));
  const anaId = await a.ev(B(`return Object.values(s.elements).find((e) => e.text === 'da Ana')?.id ?? null;`));
  expect('post-it da Ana aparece na Bia', await until(b, has(anaId)), true);
  expect('com o texto certo', await b.ev(elText(anaId)), 'da Ana');
  const anaUser = await a.ev(B(`return s.access.userId;`));
  expect('Activity Log: a Bia recebe a entrada da Ana carimbada pelo servidor', await until(b, B(`return s.activityLog.some((e) => e.actorId === ${JSON.stringify(anaUser)} && (e.elementIds ?? []).includes(${JSON.stringify(anaId)}));`)), true);
  await b.ev(B(`s.updateElement('s1', { text: 'editado pela Bia' }); return true;`));
  expect('edição da Bia aparece na Ana', await until(a, `${elText('s1')}.then((t) => t === 'editado pela Bia')`), true);

  // 3) desfazer é por pessoa
  await a.ev(B(`s.addElements([factory.createStickyNote({ x: 0, y: 400, text: 'a2' })]); return true;`));
  await sleep(300);
  await b.ev(B(`s.addElements([factory.createStickyNote({ x: 400, y: 400, text: 'b2' })]); return true;`));
  const ids = async (p, text) => p.ev(B(`return Object.values(s.elements).find((e) => e.text === ${JSON.stringify(text)})?.id ?? null;`));
  const a2 = await ids(a, 'a2');
  const b2 = await until(a, B(`return Object.values(s.elements).some((e) => e.text === 'b2');`)).then(() => ids(a, 'b2'));
  expect('Ana vê o b2 da Bia', !!b2, true);
  await a.ev(B(`s.undo(); return true;`));
  expect('desfazer da Ana tira o a2 dela', await until(a, `${has(a2)}.then((v) => !v)`), true);
  expect('mas não apaga o b2 da Bia (na Ana)', await a.ev(has(b2)), true);
  expect('nem na Bia', await b.ev(has(b2)), true);
  expect('o a2 some também na Bia', await until(b, `${has(a2)}.then((v) => !v)`), true);


  // 3b) votação por pontos: aberta (todos veem tudo) e anônima (só o próprio até revelar)
  await a.ev(B(`s.startVoting({ title: 'Aberta', dotsPerUser: 5, anonymous: false, allowMultiplePerItem: true, durationMs: null }); return true;`));
  expect('votação chega à Bia', await until(b, B(`return !!s.facilitation.voting?.active;`)), true);
  await b.ev(B(`s.castVote('s1'); s.castVote('s1'); return true;`));
  expect('votação aberta: a Ana vê os 2 votos da Bia', await until(a, B(`return s.facilitation.voting?.votesByElement?.s1 === 2;`)), true);
  expect('e quem votou', await a.ev(B(`return Object.keys(s.facilitation.voting?.ballots ?? {}).includes(${JSON.stringify(biaId)});`)), true);
  await a.ev(B(`s.cancelVoting(); return true;`));
  await until(b, B(`return !s.facilitation.voting;`));
  await a.ev(B(`s.startVoting({ title: 'Anônima', dotsPerUser: 5, anonymous: true, allowMultiplePerItem: true, durationMs: null }); return true;`));
  expect('votação anônima chega à Bia', await until(b, B(`return !!s.facilitation.voting?.active && s.facilitation.voting.anonymous === true;`)), true);
  await b.ev(B(`s.castVote('s1'); s.castVote('s1'); return true;`));
  await a.ev(B(`s.castVote('s1'); return true;`));
  await sleep(1500);
  expect('anônima: a Ana só vê o próprio voto', await a.ev(B(`return s.facilitation.voting?.votesByElement?.s1 ?? 0;`)), 1);
  expect('anônima: a Bia só vê os próprios votos', await b.ev(B(`return s.facilitation.voting?.votesByElement?.s1 ?? 0;`)), 2);
  expect('anônima: nenhuma cédula alheia na Ana', await a.ev(B(`return Object.keys(s.facilitation.voting?.ballots ?? {}).filter((u) => u !== s.access.userId).length;`)), 0);
  expect('anônima: cursores ocultos nos dois', [await a.ev(B(`return ui.getState().hidden;`)), await b.ev(B(`return ui.getState().hidden;`))], [true, true]);
  await b.ev(B(`s.setLastPointerWorld({ x: 7, y: 8 }); return true;`));
  await sleep(700);
  expect('anônima: nenhum cursor chega à Ana', await a.ev(B(`return Object.keys(ui.getState().cursors).length;`)), 0);
  await a.ev(B(`s.revealVoting(); return true;`));
  expect('revelada: a Ana vê o total (3)', await until(a, B(`return s.facilitation.voting?.votesByElement?.s1 === 3;`)), true);
  expect('revelada: a Bia vê o total (3)', await until(b, B(`return s.facilitation.voting?.votesByElement?.s1 === 3;`)), true);
  await a.ev(B(`s.closeVoting(); return true;`));
  await until(b, B(`return !s.facilitation.voting;`));

  // 3c) enquete com "Mostrar resultado parcial" DESLIGADO: nem a facilitadora acompanha até revelar
  await a.ev(B(`s.startVoting({ title: 'Enquete', dotsPerUser: 1, anonymous: false, allowMultiplePerItem: true, durationMs: null, kind: 'poll', pollOptions: [{ text: 'Sim' }, { text: 'Não' }], pollLiveResults: false }); return true;`));
  expect('enquete chega à Bia', await until(b, B(`return s.facilitation.voting?.kind === 'poll' && !!s.facilitation.voting.active;`)), true);
  await b.ev(B(`const o = s.facilitation.voting.poll.options[0].id; s.answerPoll([o]); return true;`));
  await sleep(1500);
  expect('resultado parcial desligado: a Ana não vê a resposta da Bia', await a.ev(B(`return Object.keys(s.facilitation.voting?.poll?.responses ?? {}).includes(${JSON.stringify(biaId)});`)), false);
  expect('e a contagem não aparece para ela (mesmo sendo facilitadora)', await a.ev(`Promise.all([import('/src/utils/poll.ts'), import('/src/store/useBoardStore.ts')]).then(([p, m]) => p.pollResultsVisible(m.useBoardStore.getState().facilitation.voting, true))`), false);
  await a.ev(B(`s.revealVoting(); return true;`));
  expect('revelada: a Ana vê a resposta da Bia', await until(a, B(`return Object.keys(s.facilitation.voting?.poll?.responses ?? {}).includes(${JSON.stringify(biaId)});`)), true);
  await a.ev(B(`s.closeVoting(); return true;`));
  await until(b, B(`return !s.facilitation.voting;`));

  // 4) Modo Privado: o texto da nota do outro não chega, a própria pessoa vê
  await a.ev(B(`s.setPrivateMode(true); return true;`));
  expect('Modo Privado chega à Bia', await until(b, B(`return s.facilitation.privateMode.enabled === true;`)), true);
  await b.ev(B(`s.addElements([factory.createStickyNote({ x: 800, y: 0, text: 'segredo da Bia' })]); return true;`));
  await sleep(300);
  const secretId = await b.ev(B(`return Object.values(s.elements).find((e) => e.isPrivateDraft && e.createdBy === s.access.userId)?.id ?? null;`));
  expect('a nota da Bia nasce privada', !!secretId, true);
  expect('a Bia vê o próprio texto', await b.ev(elText(secretId)), 'segredo da Bia');
  expect('a nota chega à Ana (o objeto)', await until(a, has(secretId)), true);
  expect('mas SEM o texto', await a.ev(elText(secretId)), '');
  const leak = await a.ev(B(`return JSON.stringify({ e: s.elements, f: s.facilitation }).includes('segredo da Bia');`));
  expect('o texto não está em lugar nenhum do estado da Ana', leak, false);

  // 5) a facilitadora revela
  await a.ev(B(`s.revealPrivateNotes(); return true;`));
  expect('depois de revelar a Ana lê o texto', await until(a, `${elText(secretId)}.then((t) => t === 'segredo da Bia')`, 12000), true);
  expect('e a Bia continua vendo o dela', await b.ev(elText(secretId)), 'segredo da Bia');

  // 6) o servidor guardou
  const stored = await (async () => {
    for (let i = 0; i < 24; i++) {
      const r = await api(adminToken, 'GET', `/boards/${boardId}/data`);
      const texts = Object.values(r.json.data.elements).map((e) => e.text);
      if (texts.includes('segredo da Bia') && texts.includes('editado pela Bia') && texts.includes('b2')) return texts.sort();
      await sleep(500);
    }
    return null;
  })();
  expect('o servidor gravou o que os dois fizeram', !!stored, true);


  // 6b) sair do board NÃO pode derrubar a sessão de quem fica (regressão: gravação final por PUT ao sair)
  await b.ev(`location.hash = '#/'`);
  await sleep(4000);
  const anaText = await a.ev('document.body.innerText');
  expect('quando a Bia sai, a Ana não recebe aviso de "substituído/restaurado"', /substituído por outra pessoa|restaurado ou substituído/.test(anaText), false);
  expect('a Ana continua ao vivo', await a.ev(B(`return s.collab === true && collab.currentCollab()?.status === 'live';`)), true);
  expect('a Ana vê só ela online', await until(a, B(`return ui.getState().users.length === 1;`)), true);
  await b.ev(`location.hash = '#/board/${boardId}'`);
  await until(b, B(`return s.boardId === ${JSON.stringify(boardId)} && s.collab === true;`), 20000);
  await sleep(2500);
  expect('a Bia volta sem aviso de descarte', /restaurado ou substituído|substituído por outra pessoa/.test(await b.ev('document.body.innerText')), false);
  expect('e a Ana também não', /substituído por outra pessoa|restaurado ou substituído/.test(await a.ev('document.body.innerText')), false);

  // 7) recarregar a página da Bia mantém tudo (cópia local + sincronização)
  await b.reload();
  expect('depois de recarregar a Bia está ao vivo de novo', await until(b, B(`return s.boardId === ${JSON.stringify(boardId)} && s.collab === true;`), 20000), true);
  expect('e vê o conteúdo', [await b.ev(elText('s1')), await b.ev(elText(secretId))], ['editado pela Bia', 'segredo da Bia']);

  // 7b) Chat 08.2 · B — presença: UMA caixa e UMA etiqueta por pessoa (frame com filhos e 60 objetos)
  const fx = 3000;
  const pnote = (id, x, y, w = 160, h = 160) => ({ id, type: 'sticky', x, y, width: w, height: h, rotation: 0, zIndex: 0, createdAt: 3, updatedAt: 3, text: id, color: '#FBED7C', tags: [], reactions: {} });
  const frameEl = { id: 'pf', type: 'frame', x: fx, y: 0, width: 600, height: 400, rotation: 0, zIndex: 0, createdAt: 3, updatedAt: 3, title: 'Frame P', fillColor: '#FFFFFF', ratioPreset: 'free', hiddenContent: false, slideOrder: 9 };
  const kids = ['pk1', 'pk2', 'pk3'].map((id, i) => ({ ...pnote(id, fx + 40 + i * 180, 120), parentId: 'pf' }));
  const many = Array.from({ length: 60 }, (_, i) => pnote(`m${i}`, fx + (i % 10) * 60, 600 + Math.floor(i / 10) * 60, 50, 50));
  await a.ev(B(`s.addElements(${JSON.stringify([frameEl, ...kids, ...many])}, { select: false }); return true;`));
  await a.ev(B(`s.zoomToFit(${JSON.stringify(['pf', ...many.map((m) => m.id)])}, false); return true;`));
  expect('Bia recebe o frame e os 60 objetos', await until(b, B(`return !!s.elements.pf && !!s.elements.m59;`)), true);
  await b.ev(B(`s.setSelectedIds(['pf', 'pk1', 'pk2', 'pk3']); return true;`));
  expect('frame com filhos selecionado: 1 caixa na tela da Ana', await until(a, `document.querySelectorAll('[data-remote-selection]').length === 1`), true);
  expect('e 1 etiqueta só', await a.ev(`document.querySelectorAll('[data-remote-label]').length`), 1);
  expect('etiqueta no canto DIREITO (o esquerdo é do título do frame)', await a.ev(`(() => { const box = document.querySelector('[data-remote-selection]').getBoundingClientRect(); const l = document.querySelector('[data-remote-label]').getBoundingClientRect(); return Math.abs(l.right - box.right) < 2 && l.left > box.left + 40 && (l.bottom <= box.top + 1 || l.top >= box.bottom - 1); })()`), true);
  expect('borda de 2 px na tela', await a.ev(`/0px 0px 0px 2px/.test(document.querySelector('[data-remote-selection]').style.boxShadow)`), true);
  await b.ev(B(`s.setSelectedIds(${JSON.stringify(many.map((m) => m.id))}); return true;`));
  expect('60 objetos selecionados: continua 1 caixa e 1 etiqueta', await until(a, `document.querySelectorAll('[data-remote-selection]').length === 1 && document.querySelectorAll('[data-remote-label]').length === 1`), true);
  await b.ev(B(`s.clearSelection(); return true;`));
  expect('ao soltar, a caixa some', await until(a, `document.querySelectorAll('[data-remote-selection]').length === 0`), true);

  // 7c) Chat 08.2 · B — linha do tempo: prévia SOMENTE LEITURA sem tocar o useBoardStore e sem enviar Yjs
  expect('versão salva para a prévia', await b.ev(`import('/src/utils/versionHistory.ts').then((m) => m.saveManualSnapshot('versao-teste')).then((x) => !!x)`), true);
  const stateOf = B(`return JSON.stringify({ data: s.serialize(), camera: s.camera, sel: s.selectedIds, edit: s.editingId, order: s.elementOrder });`);
  await sleep(800);
  const before = await b.ev(stateOf);
  const sentBefore = await b.ev(`window.__odNet.yjsUpdates`);
  await b.ev(`document.querySelector('[data-testid=studio-time]').click(); true`);
  expect('linha do tempo abre com a versão salva', await until(b, `document.querySelectorAll('[data-version]').length > 0`, 15000), true);
  await b.ev(`document.querySelector('[data-version]').click(); true`);
  expect('prévia aberta', await until(b, `!!document.querySelector('[data-testid=version-preview]')`), true);
  // navegar na prévia (arrastar e rodar o mouse) e tentar editar pelo teclado
  await b.ev(`(() => { const el = document.querySelector('[data-testid=version-preview]'); const r = el.getBoundingClientRect(); const o = { bubbles: true, pointerId: 7, clientX: r.left + 300, clientY: r.top + 300 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: r.left + 420, clientY: r.top + 360 })); el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120, clientX: r.left + 300, clientY: r.top + 300 })); return true; })()`);
  await b.ev(`(() => { for (const key of ['Delete', 'Backspace', 'n', 'z']) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); return true; })()`);
  expect('com a prévia aberta o canvas não recebe o ponteiro', await b.ev(`(() => { const p = document.querySelector('[data-testid=version-preview]').getBoundingClientRect(); const el = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2); return !!el?.closest('[data-testid=version-preview]'); })()`), true);
  await sleep(800);
  await b.ev(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  expect('Esc fecha a prévia', await until(b, `!document.querySelector('[data-testid=version-preview]')`), true);
  await b.ev(`import('/src/components/studio/studioUi.ts').then((m) => m.useStudioUi.getState().close())`);
  await sleep(600);
  expect('abrir, navegar e fechar a prévia deixa o useBoardStore idêntico', (await b.ev(stateOf)) === before, true);
  expect('e nenhuma atualização Yjs foi enviada', await b.ev(`window.__odNet.yjsUpdates`), sentBefore);
  // Restaurar/Excluir só com permissão: Visitante leitor simulado vê os botões desabilitados
  await a.ev(`Promise.all([import('/src/store/useAppStore.ts'), import('/src/utils/permissions.ts')]).then(([m, p]) => m.useAppStore.getState().setViewAs(p.VIEW_AS_PROFILES.find((x) => x.id === 'visitor-viewer').profile))`);
  await sleep(500);
  await a.ev(`document.querySelector('[data-testid=studio-time]').click(); true`);
  await until(a, `document.querySelectorAll('[data-version]').length > 0`, 15000);
  await a.ev(`document.querySelector('[data-version]').click(); true`);
  expect('sem board.restoreSnapshot: Restaurar e Excluir desabilitados', await until(a, `!!document.querySelector('[data-testid=timeline-restore]') && document.querySelector('[data-testid=timeline-restore]').disabled && document.querySelector('[data-testid=timeline-delete]').disabled`), true);
  await a.ev(`import('/src/store/useAppStore.ts').then((m) => m.useAppStore.getState().setViewAs(null))`);
  expect('com a permissão: Restaurar habilitado', await until(a, `!!document.querySelector('[data-testid=timeline-restore]') && !document.querySelector('[data-testid=timeline-restore]').disabled`), true);
  await a.ev(`import('/src/components/studio/studioUi.ts').then((m) => m.useStudioUi.getState().close())`);
  await sleep(400);

  // 7d) Chat 08.2 · B — matriz de papéis no Modo Servidor (Ana é a dona do board)
  const rolesSrv = await a.ev(ROLE_MATRIX);
  expect('papéis (Servidor): a interface nova segue o explain() para dono, editor, comentarista, leitor e visitante', rolesSrv.bad, []);
  expect('papéis (Servidor): os perfis têm permissões diferentes de verdade', rolesSrv.seen.dono !== rolesSrv.seen.leitor && rolesSrv.seen.leitor === rolesSrv.seen.visitante, true);

  // 7e) Chat 08.2 · C-1 — Emojis e adesivos no Modo Servidor: a Bia coloca, a Ana recebe; PNG sobe como arquivo
  // (`asset:`), SVG fica embutido (regra da A-2); o arrasto segue o mesmo caminho do store
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const SVG1 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect width='16' height='16' fill='#3FA56F'/></svg>");
  await b.ev(`import('/src/extensions/registries.ts').then((r) => { r.StickerRegistry.register({ id: 'dev.teste.adesivos/pack', extensionId: 'dev.teste.adesivos', source: 'extension', label: 'Pacote de teste', items: [{ id: 'png', label: 'quadrado png', dataUrl: ${JSON.stringify(PNG1)} }, { id: 'svg', label: 'quadrado svg', dataUrl: ${JSON.stringify(SVG1)} }] }); return true; })`);
  const openEmoji = `import('/src/components/toolbar/dock/dockUi.ts').then((m) => { m.useDockUi.getState().openTray('emoji'); return true; })`;
  const lastOf = (page) => page.ev(B(`const el = s.elements[s.elementOrder[s.elementOrder.length - 1]]; return el ? { type: el.type, text: el.text ?? null, src: (el.dataUrl ?? '').slice(0, 20) } : null;`));
  const nA = await a.ev(B(`return s.elementOrder.length;`));
  await b.ev(openEmoji);
  await sleep(400);
  await b.ev(`(() => { document.querySelector('[data-sticker="🎯"]').click(); return true; })()`);
  expect('emoji da Bia chega à Ana', await until(a, B(`return s.elementOrder.length === ${nA + 1} && Object.values(s.elements).some((e) => e.text === '🎯');`)), true);
  await b.ev(openEmoji);
  await sleep(300);
  await b.ev(`(() => { document.querySelector('[data-emoji-tab="extensions"]').click(); return true; })()`);
  await sleep(200);
  await b.ev(`(() => { document.querySelector('[data-sticker="dev.teste.adesivos/pack/png"]').click(); return true; })()`);
  expect('adesivo PNG da Bia chega à Ana como arquivo do servidor (asset:)', await until(a, B(`return Object.values(s.elements).some((e) => e.type === 'image' && String(e.dataUrl).startsWith('asset:'));`), 15000), true);
  await b.ev(openEmoji);
  await sleep(300);
  await b.ev(`(() => { document.querySelector('[data-emoji-tab="extensions"]').click(); return true; })()`);
  await sleep(200);
  await b.ev(`(() => { document.querySelector('[data-sticker="dev.teste.adesivos/pack/svg"]').click(); return true; })()`);
  expect('adesivo SVG da Bia chega à Ana embutido (data:image/svg+xml, sem upload)', await until(a, B(`return Object.values(s.elements).some((e) => e.type === 'image' && String(e.dataUrl).startsWith('data:image/svg+xml'));`), 15000), true);
  // arrastar um emoji para o board também chega
  await b.ev(openEmoji);
  await sleep(300);
  await b.ev(`(async () => {
    const btn = document.querySelector('[data-sticker="🌱"]');
    const r = btn.getBoundingClientRect();
    const st = document.querySelector('[data-canvas-stage]').getBoundingClientRect();
    const o = { bubbles: true, pointerId: 11, button: 0, clientX: r.left + 4, clientY: r.top + 4 };
    btn.dispatchEvent(new PointerEvent('pointerdown', o));
    btn.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: st.left + 200, clientY: st.top + 200 }));
    btn.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: st.left + 200, clientY: st.top + 200 }));
    return true;
  })()`);
  expect('emoji arrastado pela Bia chega à Ana', await until(a, B(`return Object.values(s.elements).some((e) => e.text === '🌱');`)), true);
  expect('último objeto na Ana é o emoji arrastado', (await lastOf(a))?.text, '🌱');
  await b.ev(`import('/src/extensions/registries.ts').then((r) => { r.StickerRegistry.unregisterExtension('dev.teste.adesivos'); return true; })`);
  // limpa o que esta seção criou (o adesivo SVG fica embutido de propósito; as seções seguintes contam só as imagens delas)
  await b.ev(B(`s.deleteElements(Object.values(s.elements).filter((e) => (e.type === 'image' && !String(e.id).startsWith('img')) || e.text === '🎯' || e.text === '🌱').map((e) => e.id)); return true;`));
  expect('adesivos de teste removidos para a Ana também', await until(a, B(`return !Object.values(s.elements).some((e) => e.type === 'image' || e.text === '🎯' || e.text === '🌱');`)), true);

  // 7f) Chat 08.2 · C-2 — Cinta no Modo Servidor: bloqueio protegido da Ana; a Bia (editora, não facilitadora) vê o
  // motivo do explain() na Cinta e não destrava (nem localmente, nem no servidor)
  await a.ev(B(`s.addElements([{ id: 'lk1', type: 'sticky', x: 5200, y: 0, width: 200, height: 200, rotation: 0, zIndex: 0, createdAt: 9, updatedAt: 9, text: 'trava', color: '#FBED7C', tags: [], reactions: {} }], { select: false }); return true;`));
  expect('Bia recebe o post-it', await until(b, B(`return !!s.elements.lk1;`)), true);
  await a.ev(B(`s.setSelectedIds(['lk1']); s.setLockMode(['lk1'], 'protected'); s.clearSelection(); return true;`));
  expect('Bia recebe o bloqueio protegido', await until(b, B(`return s.elements.lk1?.lockMode === 'protected';`)), true);
  await b.ev(B(`s.zoomToFit(['lk1'], false); s.setSelectedIds(['lk1']); return true;`));
  expect('Cinta da Bia: botão de bloqueio protegido', await until(b, `!!document.querySelector('[data-testid=strip-protected-lock]')`), true);
  await b.ev(`(() => { document.querySelector('[data-testid=strip-protected-lock]').click(); return true; })()`);
  await sleep(300);
  const reasonB = await b.ev(`Promise.all([import('/src/utils/permissions.ts'), import('/src/i18n/index.ts'), import('/src/store/useBoardStore.ts')]).then(([perms, i18n, bs]) => { const s = bs.useBoardStore.getState(); return i18n.translateMessage(perms.explain(bs.buildPermissionContext(s, { lockedBy: s.elements.lk1.lockedBy ?? null }), 'element.unlockProtected').reason); })`);
  expect('Cinta da Bia: a gaveta mostra o motivo do explain()', await b.ev(`document.querySelector('[data-strip-drawer="unlock"]')?.textContent.includes(${JSON.stringify(reasonB)})`), true);
  await b.ev(`(() => { [...document.querySelectorAll('[data-strip-drawer="unlock"] button')].pop().click(); return true; })()`);
  await sleep(1200);
  expect('Bia: continua travado na tela dela', await b.ev(B(`return s.elements.lk1.lockMode;`)), 'protected');
  expect('Ana: continua travado (o servidor não recebeu destrave)', await a.ev(B(`return s.elements.lk1.lockMode;`)), 'protected');
  await b.ev(B(`s.clearSelection(); return true;`));
  await a.ev(B(`s.setSelectedIds(['lk1']); s.setLockMode(['lk1'], 'none'); s.deleteElements(['lk1']); return true;`));

  // 8) Chat 08.2 — o servidor arbitra a seleção: as duas no MESMO instante, só uma fica com o objeto
  await Promise.all([a.ev(B(`s.setSelectedIds(['s1']); return true;`)), b.ev(B(`s.setSelectedIds(['s1']); return true;`))]);
  await sleep(1500);
  const holders = [await a.ev(B(`return s.selectedIds.includes('s1');`)), await b.ev(B(`return s.selectedIds.includes('s1');`))];
  expect('seleção simultânea: exatamente uma pessoa fica com o objeto', holders.filter(Boolean).length, 1);
  const loser = holders[0] ? b : a;
  expect('quem perdeu vê o aviso de objeto em uso', await loser.ev(B(`return app.useAppStore.getState().toasts.some((t) => /está usando este objeto/.test(t.message));`)), true);
  await a.ev(B(`s.clearSelection(); return true;`));
  await b.ev(B(`s.clearSelection(); return true;`));
  await sleep(500);

  // 9) Chat 08.2 — edição sem rede reenviada OBJETO POR OBJETO (com a página recarregada ainda sem rede)
  const note = (id, text) => ({ id, type: 'sticky', x: 300 + id.length * 10, y: 600, width: 160, height: 160, rotation: 0, zIndex: 0, createdAt: 2, updatedAt: 2, text, color: '#FBED7C', tags: [], reactions: {} });
  await a.ev(B(`s.addElements(${JSON.stringify(['o1', 'o2', 'o3', 'g1'].map((id) => note(id, `texto ${id}`)))}, { select: false }); return true;`));
  expect('Bia recebe os 4 objetos', await until(b, B(`return ['o1', 'o2', 'o3', 'g1'].every((id) => !!s.elements[id]);`)), true);
  await sleep(800);
  await b.ev(`window.__odNet.goOffline(); true`);
  expect('Bia fica sem conexão', await until(b, B(`return collab.currentCollab()?.status === 'offline';`), 15000), true);
  await b.ev(B(`for (const id of ['o1', 'o2', 'o3', 'g1']) s.updateElement(id, { text: id + ' offline' }); return true;`));
  await sleep(800);
  await b.reload();
  expect('recarregada sem rede: a Bia continua com as edições offline', await until(b, B(`return ['o1', 'o2', 'o3', 'g1'].every((id) => s.elements[id]?.text === id + ' offline');`), 15000), true);
  expect('e continua sem conexão (nada foi enviado)', await b.ev(B(`return collab.currentCollab()?.status;`)), 'offline');
  expect('nada chegou à Ana enquanto a Bia estava sem rede', await a.ev(B(`return ['o1', 'o2', 'o3'].map((id) => s.elements[id]?.text);`)), ['texto o1', 'texto o2', 'texto o3']);
  // enquanto isso a Ana segura o2 e apaga g1
  await a.ev(B(`s.setSelectedIds(['o2']); s.deleteElements(['g1']); window.__seenO2 = new Set(); board.useBoardStore.subscribe((st) => { const t = st.elements.o2?.text; if (t) window.__seenO2.add(t); }); return true;`));
  await sleep(800);
  await b.ev(`window.__odNet.goOnline(); true`);
  expect('a Bia volta ao vivo', await until(b, B(`return collab.currentCollab()?.status === 'live';`), 30000), true);
  expect('o1 e o3 chegam à Ana', await until(a, B(`return s.elements.o1?.text === 'o1 offline' && s.elements.o3?.text === 'o3 offline';`), 15000), true);
  await sleep(1000);
  expect('o2 (em uso pela Ana) não entrou', await a.ev(B(`return s.elements.o2?.text;`)), 'texto o2');
  expect('o texto recusado nunca passou pela tela da Ana', await a.ev(`[...(window.__seenO2 || [])].includes('o2 offline')`), false);
  expect('g1 (apagado pela Ana) não ressuscitou', await a.ev(B(`return !!s.elements.g1;`)), false);
  expect('a Bia termina igual ao servidor', await until(b, B(`return s.elements.o2?.text === 'texto o2' && !s.elements.g1 && s.elements.o1?.text === 'o1 offline';`), 15000), true);
  const notice = await b.ev(B(`const t = app.useAppStore.getState().toasts.find((x) => /não entrou|não entraram/.test(x.message)); return t ? { message: t.message, action: !!t.action } : null;`));
  expect('o aviso fala só do que ficou de fora', !!notice && /1 objeto alterado sem conexão não entrou/.test(notice.message) && /apagado por outra pessoa/.test(notice.message), true);
  expect('e oferece baixar o descartado', notice?.action, true);
  // o download embute as imagens antes (assíncrono): espera o arquivo ser gerado
  const lost = await b.ev(B(`const t = app.useAppStore.getState().toasts.find((x) => /não entrou|não entraram/.test(x.message)); let blob = null; const orig = URL.createObjectURL; URL.createObjectURL = (x) => { blob = x; return 'blob:od-test'; }; t.action.run(); return (async () => { for (let i = 0; i < 40 && !blob; i++) await new Promise((r) => setTimeout(r, 100)); URL.createObjectURL = orig; return blob ? Object.keys(JSON.parse(await blob.text()).elements).sort() : null; })();`));
  expect('o arquivo baixado tem SÓ os objetos que ficaram de fora', lost, ['g1', 'o2']);
  await a.ev(B(`s.clearSelection(); return true;`));

  // 10) Chat 08.2 — imagens fora do documento ao vivo: ao vivo e inserida SEM rede (sobe antes do reenvio)
  // PNGs 1×1 de cores diferentes, gerados pelo próprio navegador (hashes diferentes)
  const pngOf = (color) => `(() => { const c = document.createElement('canvas'); c.width = 1; c.height = 1; const x = c.getContext('2d'); x.fillStyle = '${color}'; x.fillRect(0, 0, 1, 1); return c.toDataURL('image/png'); })()`;
  const PNG_A = await a.ev(pngOf('#e5484d'));
  const PNG_B = await b.ev(pngOf('#2c64a8'));
  // decodifica a imagem pelo MESMO caminho da tela (fetch autenticado → blob URL); independe da câmera
  const canSee = (id) => B(`const ref = s.elements[${JSON.stringify('ID')}]?.dataUrl; if (!ref) return false; return import('/src/collab/assets.ts').then((m) => m.assetBlobUrl(ref, s.boardId)).then((u) => new Promise((r) => { const im = new Image(); im.onload = () => r(im.naturalWidth === 1); im.onerror = () => r(false); im.src = u; })).catch(() => false);`.replace('ID', id));
  const img = (id, dataUrl, x) => `factory.createImage({ x: ${x}, y: 900, width: 80, height: 80, dataUrl: ${JSON.stringify(dataUrl)}, naturalWidth: 1, naturalHeight: 1 })`;
  await a.ev(B(`const el = { ...${img('img1', PNG_A, 0)}, id: 'img1' }; s.addElements([el], { select: false }); return true;`));
  expect('ao vivo: a imagem da Ana vira referência', await until(a, B(`return /^asset:[a-f0-9]{64}$/.test(s.elements.img1?.dataUrl ?? '');`), 15000), true);
  expect('ao vivo: a Bia recebe só a referência', await until(b, B(`return /^asset:[a-f0-9]{64}$/.test(s.elements.img1?.dataUrl ?? '');`), 15000), true);
  expect('ao vivo: a Bia vê a imagem (blob autenticado)', await until(b, canSee('img1'), 15000), true);
  await b.ev(`window.__odNet.goOffline(); true`);
  expect('imagem offline: Bia sem conexão', await until(b, B(`return collab.currentCollab()?.status === 'offline';`), 15000), true);
  await b.ev(B(`const el = { ...${img('img2', PNG_B, 200)}, id: 'img2' }; s.addElements([el], { select: false }); return true;`));
  await sleep(800);
  expect('imagem offline: aparece na tela da Bia', await b.ev(B(`return s.elements.img2?.dataUrl?.startsWith('data:image/png') ?? false;`)), true);
  expect('imagem offline: nada chega à Ana', await a.ev(B(`return !!s.elements.img2;`)), false);
  await b.ev(`window.__odNet.goOnline(); true`);
  expect('imagem offline: Bia volta ao vivo', await until(b, B(`return collab.currentCollab()?.status === 'live';`), 30000), true);
  expect('imagem offline: a Ana recebe a imagem como referência', await until(a, B(`return /^asset:[a-f0-9]{64}$/.test(s.elements.img2?.dataUrl ?? '');`), 15000), true);
  expect('imagem offline: e consegue ver', await until(a, canSee('img2'), 15000), true);
  await a.ev(B(`s.zoomToFit(undefined, false); return true;`));
  expect('na tela da Ana as duas imagens aparecem (ImageView com blob URL)', await until(a, `[...document.querySelectorAll('img')].filter((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 1).length >= 2`, 15000), true);
  expect('nenhum data URL raster chegou ao servidor', await (async () => {
    for (let i = 0; i < 20; i++) {
      const r = await api(adminToken, 'GET', `/boards/${boardId}/data`);
      const imgs = Object.values(r.json.data.elements).filter((e) => e.type === 'image');
      if (imgs.length >= 2) return imgs.every((e) => e.dataUrl.startsWith('asset:'));
      await sleep(500);
    }
    return false;
  })(), true);

  const errs = [...a.errors, ...b.errors].filter((e) => !/ResizeObserver/.test(e));
  expect('sem erros não tratados nas páginas', errs, []);
  expect('Chat 09 · R2: a página chegou com a CSP do app', isAppCsp(await a.ev(cspHeaderExpression)), true);
  // o interruptor "sem rede" deste roteiro (NET_SWITCH) troca o endereço do WebSocket pela porta morta 127.0.0.1:9 —
  // com a CSP o navegador barra antes de tentar (o efeito "sem rede" é o mesmo); só esse endereço fica de fora
  expect('Chat 09 · R2: nenhuma violação da CSP do app', cspViolations.filter((v) => v.blocked !== 'ws://127.0.0.1:9/'), []);
} catch (err) {
  failures.push(`roteiro interrompido: ${err.message}`);
} finally {
  a?.close();
  b?.close();
  chromes.forEach((c) => c.kill());
  vite.kill();
  server.kill();
  await sleep(700);
  try {
    rmSync(ASSETS_DIR, { recursive: true, force: true });
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

console.log(`Edição ao vivo (navegador): ${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
