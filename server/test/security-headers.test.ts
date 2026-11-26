/**
 * Chat 09 · R2 (pendência 1) — o servidor serve o app compilado na mesma origem, com CSP e cabeçalhos de segurança.
 * Lê os cabeçalhos de verdade (página, arquivos, documentos isolados das extensões, API) e confere que o hash da CSP
 * é o do script embutido que o servidor entrega. Com o `dist/` do build presente, confere também o que o Vite gravou.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isolatedDocument, PANEL_CSP, WORKER_STATION_CSP } from '../../src/extensions/host/isolationPolicy';
import { appCsp, inlineScriptHashes, parseSourceList } from '../../src/utils/securityHeaders';
import { loadConfig } from '../src/config';
import { loadWebApp } from '../src/web/static';
import { startServer, TEST_DB_URL } from './helpers';

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('base64');
const BOOT = "(function(){document.documentElement.dataset.odBoot='light'})();";

/** Pasta do app de mentira (o mesmo formato do `dist/`). */
function fakeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ludraw-web-'));
  mkdirSync(join(dir, 'assets'));
  mkdirSync(join(dir, 'ext'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head><script>${BOOT}</script><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="./assets/index-abc123.js"></script></body></html>`);
  writeFileSync(join(dir, 'csp.json'), JSON.stringify({ scriptHashes: [`sha256-${sha(BOOT)}`] }));
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log("app")');
  writeFileSync(join(dir, 'assets', 'index-abc123.js.map'), '{}');
  writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dir, 'ext', 'station.html'), isolatedDocument('station'));
  writeFileSync(join(dir, 'ext', 'panel-host.html'), isolatedDocument('panelHost'));
  return dir;
}

const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `)) ?? null;

test('R2: a página do app sai com CSP (hash do script embutido, sem unsafe-*/eval em script) e os cabeçalhos de segurança', async () => {
  const dir = fakeDist();
  const s = await startServer({ LUDRAW_WEB_DIR: dir });
  try {
    const res = await s.app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['content-type']), /^text\/html/);
    const csp = String(res.headers['content-security-policy']);
    // o hash da CSP é o do script que o servidor ENTREGOU
    const served = inlineScriptHashes(res.body, sha);
    assert.deepEqual(served, [`sha256-${sha(BOOT)}`]);
    assert.equal(directive(csp, 'script-src'), `script-src 'self' '${served[0]}'`);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.equal(directive(csp, 'default-src'), "default-src 'self'");
    assert.equal(directive(csp, 'object-src'), "object-src 'none'");
    assert.equal(directive(csp, 'base-uri'), "base-uri 'self'");
    assert.equal(directive(csp, 'form-action'), "form-action 'self'");
    assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'self'");
    assert.equal(directive(csp, 'frame-src'), "frame-src 'self'");
    assert.equal(directive(csp, 'img-src'), "img-src 'self' data: blob:");
    assert.equal(directive(csp, 'font-src'), "font-src 'self' data:");
    assert.equal(directive(csp, 'connect-src'), "connect-src 'self' data:");
    assert.equal(directive(csp, 'upgrade-insecure-requests'), null, 'só por HTTPS');
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-dns-prefetch-control'], 'off');
    assert.equal(res.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    assert.equal(res.headers['strict-transport-security'], undefined, 'HSTS só por HTTPS');
    assert.equal(res.headers['x-frame-options'], undefined, 'o app usa frame-ancestors (incorporar board)');
    assert.equal(res.headers['cache-control'], 'no-cache');
    assert.equal((await s.app.inject({ method: 'GET', url: '/index.html' })).headers['content-security-policy'], csp);
  } finally {
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('R2: arquivos, documentos isolados e API — cada um com os seus cabeçalhos; .map, csp.json e fuga de pasta = 404', async () => {
  const dir = fakeDist();
  const s = await startServer({ LUDRAW_WEB_DIR: dir });
  try {
    const js = await s.app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    assert.equal(js.statusCode, 200);
    assert.match(String(js.headers['content-type']), /^text\/javascript/);
    assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(js.headers['content-security-policy'], undefined);
    assert.equal(js.headers['x-content-type-options'], 'nosniff');
    assert.equal(js.headers['cross-origin-resource-policy'], 'same-origin');
    const again = await s.app.inject({ method: 'GET', url: '/assets/index-abc123.js', headers: { 'if-none-match': String(js.headers.etag) } });
    assert.equal(again.statusCode, 304);
    for (const url of ['/assets/index-abc123.js.map', '/csp.json', '/../package.json', '/%2e%2e/package.json', '/assets/../../package.json', '/nada.html', '/ext/']) {
      assert.equal((await s.app.inject({ method: 'GET', url })).statusCode, 404, url);
    }
    const station = await s.app.inject({ method: 'GET', url: '/ext/station.html' });
    assert.equal(station.statusCode, 200);
    assert.equal(station.body, isolatedDocument('station'));
    assert.equal(station.headers['content-security-policy'], `${WORKER_STATION_CSP}; frame-ancestors 'self'`);
    assert.match(station.body, /x-dns-prefetch-control/, 'pendência 5: dica no próprio documento');
    const host = await s.app.inject({ method: 'GET', url: '/ext/panel-host.html' });
    assert.equal(host.headers['content-security-policy'], `${PANEL_CSP}; frame-ancestors 'self'`);
    // API: continua com X-Frame-Options e ganhou CORP
    const info = await s.app.inject({ method: 'GET', url: '/api/v1/info' });
    assert.equal(info.headers['x-frame-options'], 'DENY');
    assert.equal(info.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(info.headers['referrer-policy'], 'no-referrer');
    assert.equal(info.headers['cache-control'], 'no-store');
    const apiMissing = await s.app.inject({ method: 'GET', url: '/api/v1/nao-existe' });
    assert.equal(apiMissing.statusCode, 404);
    assert.equal(apiMissing.json().error.code, 'notFound');
    assert.equal((await s.app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  } finally {
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('R2: HTTPS atrás do proxy liga HSTS e upgrade-insecure-requests; extras do operador entram validados', async () => {
  const dir = fakeDist();
  const s = await startServer({
    LUDRAW_WEB_DIR: dir,
    LUDRAW_TRUST_PROXY: '1',
    LUDRAW_PUBLIC_URL: 'https://draw.example.com',
    LUDRAW_FRAME_ANCESTORS: 'https://wiki.example.com',
    LUDRAW_CSP_CONNECT_SRC: 'https://api.example.com, wss://ws.example.com',
  });
  try {
    const res = await s.app.inject({ method: 'GET', url: '/', headers: { 'x-forwarded-proto': 'https' } });
    const csp = String(res.headers['content-security-policy']);
    assert.equal(res.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
    assert.ok(csp.includes('upgrade-insecure-requests'));
    assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'self' https://wiki.example.com");
    assert.equal(directive(csp, 'connect-src'), "connect-src 'self' data: wss://draw.example.com https://api.example.com wss://ws.example.com");
    const plain = await s.app.inject({ method: 'GET', url: '/' });
    assert.equal(plain.headers['strict-transport-security'], undefined);
  } finally {
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
  // texto livre numa variável da CSP não sobe (poderia abrir tudo)
  for (const bad of ["*", "'unsafe-inline'", 'https://a.example.com; script-src *', 'https://a.example.com/caminho', 'javascript:x']) {
    assert.throws(() => loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_CSP_CONNECT_SRC: bad }), /LUDRAW_CSP_CONNECT_SRC/, bad);
    assert.throws(() => parseSourceList(bad, 'LUDRAW_FRAME_ANCESTORS'), /LUDRAW_FRAME_ANCESTORS/, bad);
  }
  assert.throws(() => appCsp({ scriptHashes: ["sha256-x' 'unsafe-inline"] }), /invalid script hash/);
});

test('R2: sem index.html ou sem csp.json o servidor não sobe; sem LUDRAW_WEB_DIR só a API', async () => {
  const dir = fakeDist();
  try {
    rmSync(join(dir, 'csp.json'));
    assert.throws(() => loadWebApp(dir), /csp\.json/);
    rmSync(join(dir, 'index.html'));
    assert.throws(() => loadWebApp(dir), /index\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const s = await startServer();
  try {
    assert.equal((await s.app.inject({ method: 'GET', url: '/' })).statusCode, 404);
  } finally {
    await s.close();
  }
});

const DIST = new URL('../../dist/', import.meta.url);
test('R2: o build do app (dist/) traz os documentos isolados e o hash certo em csp.json', { skip: !existsSync(new URL('csp.json', DIST)) && 'sem dist/ (rode npm run build)' }, () => {
  const html = readFileSync(new URL('index.html', DIST), 'utf8');
  const { scriptHashes } = JSON.parse(readFileSync(new URL('csp.json', DIST), 'utf8')) as { scriptHashes: string[] };
  assert.deepEqual(scriptHashes, inlineScriptHashes(html, sha));
  assert.ok(scriptHashes.length >= 1);
  assert.equal(readFileSync(new URL('ext/station.html', DIST), 'utf8'), isolatedDocument('station'));
  assert.equal(readFileSync(new URL('ext/panel-host.html', DIST), 'utf8'), isolatedDocument('panelHost'));
  const web = loadWebApp(fileURLToPath(DIST));
  assert.ok(![...web.files.keys()].some((p) => p.endsWith('.map')), 'nenhum sourcemap servido (O-16)');
});
