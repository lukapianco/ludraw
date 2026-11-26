/**
 * Chat 08.5 · B2 — gera os PNGs das faixas dos e-mails a partir dos SVGs de `src/utils/mailBanners.ts`.
 *
 *   npm run mail:assets
 *
 * Por que PNG: Gmail e Outlook não mostram SVG em e-mail. O desenho continua sendo o SVG (fonte da verdade);
 * este script só o fotografa com o Chrome/Edge já instalado (sem dependência nova), em 600×168 com
 * densidade 2 (1200×336), e grava `server/src/mail/bannerImages.ts` com os PNGs em base64 — o servidor os
 * anexa à mensagem (CID), então nada é buscado fora do e-mail. Rode de novo sempre que mudar o desenho.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIL_BANNER_ARTS, MAIL_BANNER_SIZE, mailBannerSource, mailBannerSvg } from '../src/utils/mailBanners.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'server/src/mail/bannerImages.ts');
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

const port = 9400 + Math.floor(Math.random() * 80);
const profile = mkdtempSync(join(tmpdir(), 'ludraw-mail-assets-'));
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* subindo */
    }
    await sleep(250);
  }
  throw new Error('o navegador não respondeu');
}

try {
  const ws = new WebSocket(await connect());
  await new Promise((r) => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const { width, height } = MAIL_BANNER_SIZE;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  // a mesma fonte da interface (Figtree, OFL-1.1, já no projeto) para o "ludraw" sair igual ao logo do app
  const figtree = readFileSync(join(root, 'node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')).toString('base64');
  const fontCss = `@font-face{font-family:Figtree;font-weight:100 900;src:url(data:font/woff2;base64,${figtree}) format('woff2')}`;
  const images = {};
  for (const art of MAIL_BANNER_ARTS) {
    const svg = mailBannerSvg(art).replace('width="1200" height="336"', `width="${width}" height="${height}"`);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}html,body{margin:0;padding:0;background:#194B32}svg{display:block}</style></head><body>${svg}</body></html>`;
    await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    await sleep(600);
    // Chat 08.6 · D (O-08): sem a Figtree o "ludraw" sairia na fonte de reserva — falha em vez de gravar
    const fontOk = await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => document.fonts.check("800 58px Figtree"))', awaitPromise: true, returnByValue: true });
    if (fontOk?.result?.value !== true) throw new Error(`${art}: a fonte Figtree não carregou no navegador — nada foi gravado`);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: false });
    images[art] = shot.data;
    console.log(`${art}: ${Math.round((shot.data.length * 3) / 4 / 1024)} KB`);
  }
  ws.close();
  const body = Object.entries(images)
    // linhas curtas (o base64 quebrado em pedaços): arquivo legível em diff e sem "linha longa" no audit:legal
    .map(([art, data]) => {
      const lines = data.match(/.{1,120}/g).map((c) => `    '${c}',`);
      return [`  ${art}: [`, ...lines, `  ].join(''),`].join('\n');
    })
    .join('\n');
  writeFileSync(
    OUT,
    `/**\n * GERADO por \`npm run mail:assets\` (scripts/render-mail-assets.mjs) a partir de src/utils/mailBanners.ts — não edite.\n * Faixas dos e-mails em PNG (1200×336, mostradas em 600×168), base64. Desenho próprio do LuDraw.\n */\nimport type { MailBannerArt } from '../../../src/utils/mailBanners';\n\n/** SHA-256 do desenho (mailBannerSource) usado nesta geração — o teste avisa se o desenho mudou sem regerar. */
export const MAIL_BANNER_SOURCE_SHA256 = '${createHash('sha256').update(mailBannerSource()).digest('hex')}';

/** SHA-256 dos bytes de cada PNG (Chat 08.6) — os mesmos valores ficam no docs/PROVENANCE.md §4; o teste confere os dois. */
export const MAIL_BANNER_PNG_SHA256: Record<MailBannerArt, string> = {
${Object.entries(images).map(([art, data]) => `  ${art}: '${createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex')}',`).join('\n')}
};

export const MAIL_BANNER_PNG: Record<MailBannerArt, string> = {\n${body}\n};\n`,
  );
  console.log(`gravado: ${OUT}`);
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* o navegador pode segurar arquivos por alguns instantes */
  }
}
