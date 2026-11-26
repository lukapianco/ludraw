#!/usr/bin/env node
/**
 * LuDraw — Chat 09.1 · R7: ícones do programa desktop a partir do `public/favicon.svg` (desenho do próprio projeto).
 *
 *   npm run desktop:icons
 *
 * Fotografa o SVG com o Chrome/Edge já instalado (sem dependência nova, como o `render-mail-assets.mjs`) e grava os
 * PNGs e o `.ico` em `src-tauri/icons/`. Só é rodado por quem muda o desenho; os arquivos são versionados.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src-tauri/icons');
const PNGS = { '32x32.png': 32, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 512 };
const ICO_SIZES = [16, 24, 32, 48, 64, 256];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!chromePath) {
  console.log('Chrome/Edge não encontrado. Defina CHROME_PATH com o caminho do executável.');
  process.exit(1);
}

const port = 9400 + Math.floor(Math.random() * 80);
const profile = mkdtempSync(join(tmpdir(), 'ludraw-icons-'));
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

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

/** Contêiner `.ico` (formato aberto): cabeçalho, uma entrada por tamanho e os PNGs em sequência. */
function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    head[at] = size === 256 ? 0 : size;
    head[at + 1] = head[at];
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.png)]);
}

try {
  const ws = new WebSocket(await connect());
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id) pending.get(d.id)?.(d.result ?? {});
  });
  const send = (method, params = {}) => new Promise((r) => (pending.set(++seq, r), ws.send(JSON.stringify({ id: seq, method, params }))));
  const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8').trim();
  const shot = async (size) => {
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    return Buffer.from(data, 'base64');
  };
  mkdirSync(OUT, { recursive: true });
  const files = {};
  for (const [name, size] of Object.entries(PNGS)) files[name] = await shot(size);
  const images = [];
  for (const size of ICO_SIZES) images.push({ size, png: await shot(size) });
  files['icon.ico'] = ico(images);
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(OUT, name), bytes);
    console.log(`src-tauri/icons/${name}  ${bytes.length} bytes  ${createHash('sha256').update(bytes).digest('hex')}`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* o Windows às vezes ainda segura o perfil temporário */
  }
}
