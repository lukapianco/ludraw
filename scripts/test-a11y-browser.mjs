#!/usr/bin/env node
/**
 * LuDraw — acessibilidade em NAVEGADOR REAL (Chat 08.6). Sem dependências: sobe o Vite deste repositório e
 * controla um Chrome/Edge local em modo headless pelo protocolo DevTools (CDP), com um perfil temporário, no
 * MODO LOCAL (o proxy `/api` do Vite aponta para uma porta vazia, como nos outros testes de navegador).
 *
 *   npm run test:a11y:browser          (CHROME_PATH=/caminho/do/chrome se não for achado)
 *
 * Rodada A (acessibilidade funcional):
 * - D-01: clicar no rótulo "Senha" foca o campo de senha (e não abre "Esqueci minha senha"); cada campo da
 *   entrada tem o seu rótulo;
 * - D-02: no alto contraste do sistema (`forced-colors: active`) o foco aparece (contorno sólido) em campo e
 *   botão, e campos/botões têm contorno no lugar da borda feita com sombra;
 * - D-03: com "reduzir movimento" (sistema OU preferência do app) as animações infinitas rodam uma vez só e a
 *   rolagem é instantânea; sem a preferência continuam infinitas (controle);
 * - D-12: um `h1` e um `main` na entrada e no board (o `h1` do board é o nome dele);
 * - D-13: o nome acessível contém o texto visível; botão de tema e Ficha do board com `aria-label` = `title`.
 */
import { spawn } from 'node:child_process';
import { cspHeaderExpression, cspViolationOf, isAppCsp, watchCsp } from './lib/csp-watch.mjs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5240 + Math.floor(Math.random() * 50);
const DEBUG = 9480 + Math.floor(Math.random() * 50);
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
const profile = mkdtempSync(join(tmpdir(), 'ludraw-a11y-test-'));
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
async function until(expression, tries = 60, ms = 250) {
  for (let i = 0; i < tries; i++) {
    if (await ev(expression)) return true;
    await sleep(ms);
  }
  return false;
}
/** Clique de mouse de verdade (o navegador decide qual elemento recebe e o que o rótulo faz). */
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function pressTab() {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
}
const media = (features) => send('Emulation.setEmulatedMedia', { media: '', features });

/** Texto visível normalizado de um controle × nome acessível (WCAG 2.5.3 "Label in Name"). */
const LABEL_IN_NAME = String.raw`(() => {
  // compara só letras e números, sem espaços: "Espaço pessoal › Comece por aqui" ≡ "Espaço pessoal Comece por aqui",
  // "Lu"+"Draw" em dois spans ≡ "LuDraw"; "…" não conta
  const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden=true],[inert]'); };
  // texto VISÍVEL do controle: fora atalhos de teclado (kbd — vão em aria-keyshortcuts), texto só para leitor de
  // tela, partes ocultas por CSS, partes aria-hidden e o texto de controles aninhados (têm nome próprio)
  const SKIP = 'kbd, .od-kbd, .sr-only, [aria-hidden=true], button, a, [role=button], input, select, textarea';
  const visibleText = (el) => {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      if (!p || !p.checkVisibility()) continue;
      const skip = p.closest(SKIP);
      if (skip && skip !== el && el.contains(skip)) continue;
      parts.push(n.textContent);
    }
    return norm(parts.join(' '));
  };
  const nameOf = (e) => e.hasAttribute('aria-labelledby')
    ? e.getAttribute('aria-labelledby').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    : e.getAttribute('aria-label');
  const bad = [];
  for (const e of document.querySelectorAll('button[aria-label], a[aria-label], [role=button][aria-label], button[aria-labelledby], [role=button][aria-labelledby]')) {
    if (!vis(e)) continue;
    const text = visibleText(e);
    if (text && !norm(nameOf(e)).includes(text)) bad.push(nameOf(e) + ' ⟂ ' + text);
  }
  return bad;
})()`;

/**
 * Rodada B — medições na página RENDERIZADA (estilo calculado), complementando o `test:design` (que mede os tokens):
 * - FOCUS(sel): o traço sólido do anel de foco do elemento focado × o fundo em volta dele (≥ 3:1);
 * - BORDER(sel): a borda (sombra interna de 1 px) do campo parado × o fundo do próprio campo (≥ 3:1);
 * - TEXT_CONTRAST: todo texto visível com `text-ink-subtle`/`text-ink-muted` × o fundo efetivo (≥ 4,5:1);
 * - TINY: nenhum texto visível da interface abaixo de 11 px (o conteúdo do board, sob a câmera, fica de fora).
 */
const MEASURE = String.raw`
  window.__a11y = window.__a11y || (() => {
    const rgb = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { c: p.slice(0, 3), a: p[3] ?? 1 }; };
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
    const over = (f, b) => f.c.map((v, i) => v * f.a + b[i] * (1 - f.a));
    // fundo efetivo: compõe as camadas translúcidas até achar uma opaca; null se houver imagem/degradê no caminho
    const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null; const b = rgb(cs.backgroundColor); if (b && b.a > 0) { layers.push(b); if (b.a >= 1) break; } } let out = [255, 255, 255]; for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out); return out; };
    const faded = (el) => { for (let e = el; e; e = e.parentElement) { if (Number(getComputedStyle(e).opacity) < 1) return true; if (e.matches('[aria-disabled=true], :disabled')) return true; } return false; };
    const inWorld = (el) => { for (let e = el; e; e = e.parentElement) if (/scale\(/.test(e.style?.transform || '')) return true; return false; };
    const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('.sr-only, [aria-hidden=true]');
    return {
      FOCUS() { const e = document.activeElement; const parts = getComputedStyle(e).boxShadow.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => !s.startsWith('inset') && !/inset$/.test(s));
        const solid = parts.map((s) => ({ s, c: rgb(s), spread: Number((s.match(/(-?[\d.]+)px\s*$/) || [])[1]) })).find((p) => p.c && p.c.a >= 1 && p.spread >= 2);
        const around = bgOf(e.parentElement); return solid && around ? Number(ratio(solid.c.c, around).toFixed(2)) : { shadow: getComputedStyle(e).boxShadow, focused: e.tagName + '.' + e.className.slice(0, 30), around: !!around }; },
      BORDER(sel) { const e = document.querySelector(sel); e.blur(); const parts = getComputedStyle(e).boxShadow.split(/,(?![^(]*\))/); const inset = parts.find((s) => /inset/.test(s)); const c = inset && rgb(inset); const bg = bgOf(e);
        return c && bg ? Number(ratio(over(c, bg), bg).toFixed(2)) : null; },
      // todo texto visível cuja cor VEM de text-ink-subtle/text-ink-muted (no próprio elemento ou herdada)
      TEXT_CONTRAST() { const bad = []; let n = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
        while ((t = w.nextNode())) {
          const el = t.parentElement; if (!el || !t.textContent.trim() || el.closest('svg')) continue;
          const owner = el.closest('.text-ink-subtle, .text-ink-muted'); if (!owner) continue;
          if (getComputedStyle(el).color !== getComputedStyle(owner).color) continue; // outra cor no caminho
          if (!shown(el) || faded(el) || inWorld(el)) continue;
          const bg = bgOf(el); const fg = rgb(getComputedStyle(el).color); if (!bg || !fg) continue; n++;
          const r = ratio(over(fg, bg), bg); if (r < 4.5) bad.push(t.textContent.trim().slice(0, 30) + ' ' + r.toFixed(2) + ':1'); }
        return { measured: n, bad: [...new Set(bad)].slice(0, 12) }; },
      TINY() { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
        while ((t = w.nextNode())) { const el = t.parentElement; if (!el || !t.textContent.trim() || el.closest('svg') || !shown(el) || inWorld(el)) continue;
          const px = parseFloat(getComputedStyle(el).fontSize); if (px < 11) bad.push(t.textContent.trim().slice(0, 24) + ' ' + px + 'px'); }
        return [...new Set(bad)].slice(0, 12); },
    };
  })();
  true;
`;
const setTheme = (theme) => ev(`import('/src/store/useAppStore.ts').then((m) => { m.useAppStore.getState().setTheme(${JSON.stringify(theme)}); return true; })`).then(() => until(`document.documentElement.classList.contains('dark') === ${theme === 'dark'}`, 20, 100));
/** Rodada B: anel de foco, borda do campo, texto secundário/terciário e tamanho mínimo, no tema pedido. */
async function roundB(where, theme, { focusSel, borderSel } = {}) {
  await ev(MEASURE);
  if (focusSel) {
    // foco "de teclado": uma tecla antes faz o navegador acender o :focus-visible também no foco por código;
    // espera a transição da sombra (180 ms) terminar antes de medir
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await ev(`(() => { document.querySelector(${JSON.stringify(focusSel)}).focus(); return true; })()`);
    await sleep(350);
    const f = await ev(`window.__a11y.FOCUS()`);
    expect(`D-05: ${where} (${theme}) — anel de foco ≥ 3:1 com o fundo em volta`, f !== null && f >= 3 ? 'ok' : f, 'ok');
  }
  if (borderSel) {
    const b = await ev(`window.__a11y.BORDER(${JSON.stringify(borderSel)})`);
    expect(`D-06: ${where} (${theme}) — borda do campo ≥ 3:1 com o fundo do campo`, b !== null && b >= 3 ? 'ok' : b, 'ok');
  }
  const tc = await ev(`window.__a11y.TEXT_CONTRAST()`);
  expect(`D-04: ${where} (${theme}) — há texto secundário/terciário medido`, tc.measured > 0, true);
  expect(`D-04: ${where} (${theme}) — texto secundário/terciário ≥ 4,5:1 sobre o fundo real`, tc.bad, []);
  expect(`D-14: ${where} (${theme}) — nenhum texto visível abaixo de 11 px`, await ev(`window.__a11y.TINY()`), []);
}

try {
  await waitFor(`http://localhost:${PORT}/`);
  const targets = await (await waitFor(`http://127.0.0.1:${DEBUG}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    const cspV = cspViolationOf(msg);
    if (cspV) cspViolations.push(cspV);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await watchCsp(send);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const firstLoad = Date.now();
  await send('Page.navigate', { url: `http://localhost:${PORT}/?lang=pt-BR#/login` });
  // Chat 09.1 · R9: a PRIMEIRA abertura inclui o Vite compilando o app a frio e varia muito com a carga da máquina
  // (medido de ~1 s a mais de 20 s no fechamento do 09.1). Só ela espera até 60 s; o tempo fica no log.
  const loginReady = await until(`!!document.querySelector('input[autocomplete=current-password]')`, 240);
  console.log(`  primeira abertura: ${loginReady ? `${Date.now() - firstLoad} ms` : 'não carregou'}`);
  expect('entrada carregou (Modo Local)', loginReady, true);
  expect('Chat 09 · R2: a página chegou com a CSP do app', isAppCsp(await ev(cspHeaderExpression)), true);
  /* ---------- D-01: rótulo "Senha" ---------- */
  const i18n = await ev(`import('/src/i18n/index.ts').then((m) => ({ password: m.t('auth.loginView.password'), email: m.t('common.email'), forgot: m.t('auth.loginView.iForgotMyPassword') }))`);
  // Chat 08.7 · R3: espera EXPLÍCITA em vez de tempo fixo — a splash de abertura saiu (nada por cima do texto "Senha"
  // no ponto do clique) e a tela parou de se mexer (mesma posição em duas leituras seguidas; fontes e animação)
  const settled = await until(`(() => {
    const shown = [...document.querySelectorAll('label, span, div')].filter((e) => e.textContent.trim() === ${JSON.stringify(i18n.password)} && e.getBoundingClientRect().width > 0)
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!shown || document.getElementById('od-boot')) return false;
    const r = shown.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const key = [r.x, r.y, r.width, r.height].map(Math.round).join(',');
    const stable = window.__odD01Rect === key;
    window.__odD01Rect = key;
    return stable && !!top && (top === shown || shown.contains(top) || top.contains(shown));
  })()`, 80);
  expect('D-01: tela de entrada estável e sem nada por cima do rótulo', settled, true);
  const labels = await ev(`(() => {
    const pw = document.querySelector('input[autocomplete=current-password]');
    const email = document.querySelector('input[type=email]');
    const forgot = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(i18n.forgot)});
    const lbl = pw.labels[0];
    // o clique mira o TEXTO "Senha" que a pessoa vê (o menor elemento com esse texto), não o rótulo que o código
    // diz ter — assim o teste mede o que acontece de verdade mesmo quando o campo não tem rótulo
    const shown = [...document.querySelectorAll('label, span, div')].filter((e) => e.textContent.trim() === ${JSON.stringify(i18n.password)} && e.getBoundingClientRect().width > 0)
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    const r = shown.getBoundingClientRect();
    return { pwLabels: pw.labels.length, pwLabel: lbl ? lbl.textContent.trim() : null, emailLabels: email.labels.length, emailLabel: email.labels[0]?.textContent.trim(),
      controlIsPw: !!lbl && lbl.control === pw, forgotFound: !!forgot, forgotInsideLabel: !!(forgot && forgot.closest('label')), x: r.x + r.width / 2, y: r.y + r.height / 2, hash: location.hash };
  })()`);
  expect('D-01: campo de senha tem exatamente 1 rótulo', labels.pwLabels, 1);
  expect('D-01: o rótulo do campo de senha é "Senha"', labels.pwLabel, i18n.password);
  expect('D-01: o rótulo aponta para o campo (label.control)', labels.controlIsPw, true);
  expect('D-01: "Esqueci minha senha" existe na entrada', labels.forgotFound, true);
  expect('D-01: "Esqueci minha senha" fora do rótulo', labels.forgotInsideLabel, false);
  expect('D-01: campo de e-mail com o seu rótulo', [labels.emailLabels, labels.emailLabel], [1, i18n.email]);
  await ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await clickAt(labels.x, labels.y);
  // espera o efeito do clique (foco no campo, troca de tela ou janela) em vez de um tempo fixo; sem efeito em 5 s = falha
  await until(`document.activeElement === document.querySelector('input[autocomplete=current-password]') || location.hash !== ${JSON.stringify(labels.hash)} || !!document.querySelector('[role=dialog], [aria-modal=true]')`, 20);
  const afterClick = await ev(`({ focused: document.activeElement === document.querySelector('input[autocomplete=current-password]'), hash: location.hash, dialog: !!document.querySelector('[role=dialog], [aria-modal=true]') })`);
  expect('D-01: clicar em "Senha" foca o campo de senha', afterClick.focused, true);
  expect('D-01: clicar em "Senha" não abre a recuperação de senha (tela)', afterClick.hash, labels.hash);
  // Modo Local sem e-mail: "Esqueci minha senha" abre uma JANELA em vez de mudar de tela
  expect('D-01: clicar em "Senha" não abre a recuperação de senha (janela)', afterClick.dialog, false);
  if (afterClick.dialog) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(300);
  }
  if (afterClick.hash !== labels.hash) {
    // falhou acima: volta para a entrada para as próximas verificações continuarem valendo
    await ev(`(() => { location.hash = ${JSON.stringify(labels.hash)}; return true; })()`);
    await until(`!!document.querySelector('input[autocomplete=current-password]')`, 40);
    await sleep(500);
  }

  /* ---------- D-12 / D-13 na entrada ---------- */
  const loginStruct = await ev(`(() => {
    const theme = [...document.querySelectorAll('main button.od-tool')].find((b) => b.getAttribute('aria-label'));
    return { h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()), main: document.querySelectorAll('main, [role=main]').length,
      themeLabel: theme?.getAttribute('aria-label'), themeTitle: theme?.title };
  })()`);
  const welcome = await ev(`import('/src/i18n/index.ts').then((m) => m.t('auth.loginView.welcomeBack'))`);
  expect('D-12: entrada com um h1 = título do formulário', loginStruct.h1, [welcome]);
  expect('D-12: entrada com um main', loginStruct.main, 1);
  expect('D-13: botão de tema com aria-label = title', loginStruct.themeLabel && loginStruct.themeLabel === loginStruct.themeTitle, true);
  expect('D-13: entrada — nome acessível contém o texto visível', await ev(LABEL_IN_NAME), []);

  /* ---------- D-02: alto contraste (forced-colors) ---------- */
  await media([{ name: 'forced-colors', value: 'active' }]);
  await sleep(200);
  const forced = await ev(`(() => {
    const pw = document.querySelector('input[autocomplete=current-password]');
    const email = document.querySelector('input[type=email]');
    email.blur(); pw.blur();
    const idle = getComputedStyle(email);
    const res = { active: matchMedia('(forced-colors: active)').matches, idleOutline: idle.outlineStyle + ' ' + idle.outlineWidth };
    pw.focus();
    const f = getComputedStyle(pw);
    res.inputFocus = f.outlineStyle + ' ' + f.outlineWidth;
    res.inputFocusColorTransparent = /rgba\\(0, 0, 0, 0\\)|transparent/.test(f.outlineColor);
    return res;
  })()`);
  expect('D-02: alto contraste ativo na emulação', forced.active, true);
  expect('D-02: alto contraste — campo parado tem contorno (borda)', forced.idleOutline, 'solid 1px');
  expect('D-02: alto contraste — campo focado mostra contorno de 2 px', forced.inputFocus, 'solid 2px');
  expect('D-02: alto contraste — contorno do foco não é transparente', forced.inputFocusColorTransparent, false);
  // foco por teclado num botão: Tab a partir do campo de senha até o próximo botão
  let btnFocus = null;
  for (let i = 0; i < 6 && !btnFocus; i++) {
    await pressTab();
    btnFocus = await ev(`(() => { const e = document.activeElement; if (!e || e.tagName !== 'BUTTON') return null; const s = getComputedStyle(e); return { visible: e.matches(':focus-visible'), outline: s.outlineStyle + ' ' + s.outlineWidth }; })()`);
  }
  expect('D-02: alto contraste — botão focado pelo teclado mostra contorno de 2 px', btnFocus, { visible: true, outline: 'solid 2px' });
  await media([]);
  await sleep(150);
  const normalFocus = await ev(`(() => { const e = document.activeElement; const s = getComputedStyle(e); return { ring: s.boxShadow !== 'none', outlineTransparent: /rgba\\(0, 0, 0, 0\\)|transparent/.test(s.outlineColor) }; })()`);
  expect('D-02: tema normal — foco continua sendo o anel (contorno transparente)', normalFocus, { ring: true, outlineTransparent: true });

  /* ---------- D-03: reduzir movimento ---------- */
  const ANIM = `(() => { const out = {}; for (const c of ['animate-spin', 'animate-ping', 'animate-pulse']) { const e = document.createElement('div'); e.className = c; document.body.appendChild(e); out[c] = getComputedStyle(e).animationIterationCount; e.remove(); } out.scroll = getComputedStyle(document.documentElement).scrollBehavior; return out; })()`;
  expect('D-03: controle — sem a preferência, as animações infinitas continuam infinitas', await ev(ANIM), { 'animate-spin': 'infinite', 'animate-ping': 'infinite', 'animate-pulse': 'infinite', scroll: 'auto' });
  await media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await sleep(150);
  expect('D-03: reduzir movimento (sistema) — cada animação roda uma vez', await ev(ANIM), { 'animate-spin': '1', 'animate-ping': '1', 'animate-pulse': '1', scroll: 'auto' });
  await media([]);
  await ev(`import('/src/store/useAppStore.ts').then((m) => { m.useAppStore.getState().setPreference('reduceMotion', true); return true; })`);
  await until(`document.documentElement.classList.contains('od-reduce-motion')`, 20, 100);
  expect('D-03: reduzir movimento (preferência do app) — cada animação roda uma vez', await ev(ANIM), { 'animate-spin': '1', 'animate-ping': '1', 'animate-pulse': '1', scroll: 'auto' });
  await ev(`import('/src/store/useAppStore.ts').then((m) => { m.useAppStore.getState().setPreference('reduceMotion', false); return true; })`);

  /* ---------- Rodada B na entrada (claro e escuro) ---------- */
  for (const theme of ['light', 'dark']) {
    await setTheme(theme);
    await sleep(200);
    await roundB('entrada', theme, { focusSel: 'input[autocomplete=current-password]', borderSel: 'input[type=email]' });
  }
  await setTheme('light');

  /* ---------- D-12 / D-13 no board ---------- */
  await ev(`(() => { document.querySelector('[data-testid=login-continue-local]').click(); return true; })()`);
  const onDesk = await until(`location.hash === '#/' || location.hash === '#/dashboard' || !!document.querySelector('main h1')`, 60);
  expect('Mesa abriu (Continuar sem conta)', onDesk, true);
  await sleep(800);
  expect('D-13: Mesa — nome acessível contém o texto visível', await ev(LABEL_IN_NAME), []);
  const boardId = await ev(`import('/src/store/useAppStore.ts').then((m) => { const b = m.useAppStore.getState().boards.find((x) => !x.deletedAt); if (!b) return null; location.hash = '#/board/' + b.id; return b.id; })`);
  expect('há um board para abrir', typeof boardId, 'string');
  const boardReady = await until(`!!document.querySelector('[data-testid=studio-title]')`, 80);
  expect('board abriu', boardReady, true);
  await sleep(600);
  const boardStruct = await ev(`(() => {
    const name = document.querySelector('[data-testid=studio-title]');
    const visible = name.innerText.replace(/\\s+/g, ' ').trim();
    return { h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()), main: document.querySelectorAll('main, [role=main]').length,
      canvasInMain: !!document.querySelector('main')?.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)),
      label: name.getAttribute('aria-label'), title: name.title, visible };
  })()`);
  const boardName = await ev(`import('/src/store/useAppStore.ts').then((m) => m.useAppStore.getState().boards.find((b) => b.id === ${JSON.stringify(boardId)})?.name)`);
  expect('D-12: board com um h1 = nome do board', boardStruct.h1, [boardName]);
  expect('D-12: board com um main', boardStruct.main, 1);
  expect('D-12: o canvas fica dentro do main', boardStruct.canvasInMain, true);
  expect('D-13: Ficha do board com aria-label = title', boardStruct.label, boardStruct.title);
  expect('D-13: Ficha do board — o nome acessível contém o nome visível', boardStruct.label.includes(boardName), true);
  expect('D-13: barra do board — nome acessível contém o texto visível', await ev(LABEL_IN_NAME), []);

  /* ---------- Rodada B no board e na Mesa (claro e escuro) ---------- */
  for (const theme of ['light', 'dark']) {
    await setTheme(theme);
    await sleep(300);
    await roundB('board', theme, { focusSel: '[data-testid=studio-share]' });
    await ev(`(() => { location.hash = '#/'; return true; })()`);
    await until(`!!document.querySelector('main h1')`, 40);
    await sleep(500);
    await roundB('Mesa', theme, { focusSel: '[data-od-menu-trigger]' });
    await ev(`(() => { location.hash = '#/board/' + ${JSON.stringify(boardId)}; return true; })()`);
    await until(`!!document.querySelector('[data-testid=studio-title]')`, 40);
    await sleep(500);
  }

  /* ---------- D-08: tabela de contraste do Sistema visual ---------- */
  await ev(`(() => { location.hash = '#/design-system'; return true; })()`);
  await until(`!!document.querySelector('[data-contrast-table]')`, 60);
  const dsTable = await ev(`(async () => { try {
    const m = await import('/src/utils/designTokens.ts');
    const rows = [...document.querySelectorAll('[data-contrast-pair]')];
    const results = rows.flatMap((r) => [...r.querySelectorAll('[data-theme-result]')].map((x) => ({ pair: r.dataset.contrastPair, theme: x.dataset.themeResult, grade: x.dataset.grade })));
    const live = getComputedStyle(document.documentElement);
    const tokens = m.parseTokenCss((await import('/src/styles/tokens.css?raw')).default);
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    return { rows: rows.length, expected: m.CONTRAST_PAIRS.length, failing: results.filter((x) => x.grade === 'Falha'), cells: results.length,
      liveMatchesFile: ['text-subtle', 'text-muted', 'input-border', 'favorite', 'focus-color'].every((n) => live.getPropertyValue('--od-' + n).trim().toLowerCase() === m.tokenValue(tokens[theme], n).toLowerCase()) };
  } catch (err) { return { rows: document.querySelectorAll('[data-contrast-pair]').length, expected: -1, failing: [String(err.message || err)], cells: -1, liveMatchesFile: false }; } })()`);
  expect('D-08: Sistema visual — tabela de contraste lista todos os pares', dsTable.rows, dsTable.expected);
  expect('D-08: Sistema visual — cada par medido no claro e no escuro', dsTable.cells, dsTable.expected * 2);
  expect('D-08: Sistema visual — nenhum par em "Falha"', dsTable.failing, []);
  expect('D-08: a página usa os mesmos valores do tokens.css lido pela tabela', dsTable.liveMatchesFile, true);
  await setTheme('light');

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
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* o Chrome pode segurar arquivos por alguns instantes */
  }
}

console.log(`Acessibilidade (navegador): ${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
