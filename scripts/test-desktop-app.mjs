#!/usr/bin/env node
/**
 * LuDraw — programa desktop de verdade, ponta a ponta (Chat 09.1 · R7). `npm run test:desktop:app`
 *
 * Roda o binário de depuração (WebView2 no Windows, WebKitGTK no Linux) num perfil descartável, só com `localhost`:
 * servidor do LuDraw em PGlite servindo o `dist/`, provedor de SSO falso e servidores de mentira para os problemas de
 * conexão. Os ganchos (`src-tauri/src/testing.rs`) só existem na compilação de depuração. Sem dependências novas.
 *
 *   npm run desktop:web && npm run test:desktop:app        (LUDRAW_DESKTOP_BIN=… usa um binário pronto)
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { createServer as createTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const LOCAL = win ? 'http://tauri.localhost' : 'tauri://localhost';
const BIN = process.env.LUDRAW_DESKTOP_BIN ?? join(root, 'src-tauri/target/debug', win ? 'ludraw.exe' : 'ludraw');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'ludraw-desktop-'));
const verbose = process.env.LUDRAW_DESKTOP_VERBOSE ? console.log : () => {};

let passed = 0;
const failures = [];
const expect = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    verbose(`  ✓ ${name}`);
  } else {
    failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${failures.at(-1)}`);
  }
};

if (!process.env.LUDRAW_DESKTOP_BIN) {
  if (!existsSync(join(root, 'src-tauri/generated/headers.json'))) {
    console.log('Rode npm run desktop:web antes (falta src-tauri/generated/headers.json).');
    process.exit(1);
  }
  // dentro de src-tauri/: só assim o rustup usa a versão do rust-toolchain.toml
  execFileSync('cargo', ['build', '--locked', '--quiet'], { cwd: join(root, 'src-tauri'), stdio: 'inherit' });
}

/* ------------------------------------------------ programa ------------------------------------------------ */

const children = new Set();
function launch(dir, env = {}) {
  mkdirSync(dir, { recursive: true });
  const extra = {};
  if (!win) {
    // no Linux, a pasta Downloads vem do XDG: no teste ela é a pasta descartável
    extra.XDG_CONFIG_HOME = join(dir, 'xdg');
    mkdirSync(extra.XDG_CONFIG_HOME, { recursive: true });
    writeFileSync(join(extra.XDG_CONFIG_HOME, 'user-dirs.dirs'), `XDG_DOWNLOAD_DIR="${dir}"
`);
  }
  const child = spawn(BIN, [], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...extra, LUDRAW_DESKTOP_TEST_DIR: dir, ...env } });
  child.errors = '';
  child.stderr.on('data', (d) => (child.errors += d));
  children.add(child);
  child.gone = new Promise((r) => child.on('exit', (code) => (children.delete(child), r(code ?? -1))));
  return child;
}
let dir = '';
let seq = 0;
/** Roda um trecho na janela visível e devolve o resultado (`null` = não respondeu no prazo). */
async function ev(code, ms = 6000) {
  const result = join(dir, 'result.txt');
  rmSync(result, { force: true });
  // cada pedido tem um número: a resposta atrasada de um pedido anterior é descartada
  const id = ++seq;
  writeFileSync(join(dir, 'eval.tmp'), `const id=${id};try{return {id,v:await (async()=>{${code}})()}}catch(e){return {id,e:String(e)}}`);
  renameSync(join(dir, 'eval.tmp'), join(dir, 'eval.js'));
  for (const end = Date.now() + ms; Date.now() < end; await sleep(40)) {
    if (!existsSync(result)) continue;
    const r = JSON.parse(readFileSync(result, 'utf8'));
    rmSync(result, { force: true });
    if (r.ok?.id !== id) continue;
    if (r.ok.e) throw new Error(r.ok.e);
    return { label: r.label, value: r.ok.v ?? null };
  }
  rmSync(join(dir, 'eval.js'), { force: true });
  return null;
}
const val = async (code, ms) => (await ev(code, ms))?.value ?? null;
async function until(code, ms = 20000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    try {
      if (await val(code, 1500)) return true;
    } catch {
      /* página trocando */
    }
  }
  return false;
}
/** Conteúdo do arquivo baixado (espera até 10 s); sem ele, o que há na pasta. */
async function downloaded(name) {
  for (let i = 0; i < 50; i++) {
    if (existsSync(join(dir, name)) && readFileSync(join(dir, name)).length) return readFileSync(join(dir, name), 'utf8');
    await sleep(200);
  }
  return readdirSync(dir);
}
const menu = (id) => writeFileSync(join(dir, 'menu.txt'), id);
const waitExit = (child, ms = 8000) => Promise.race([child.gone, sleep(ms).then(() => 'ainda aberto')]);
async function quit(child) {
  menu('quit');
  if ((await waitExit(child)) === 'ainda aberto') child.kill('SIGKILL');
  await child.gone;
  await sleep(800);
}

const click = (testid) => `document.querySelector('[data-testid=${testid}]').click(); return true;`;
const typeUrl = (url) => `const i=document.querySelector('[data-testid=desktop-server-url]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(url)});i.dispatchEvent(new Event('input',{bubbles:true}));return true;`;
const problemOf = `const s=document.querySelector('[data-testid=desktop-server-status]');return s&&s.dataset.step!=='testing'&&s.dataset.step!=='connecting'?(s.dataset.problem||s.dataset.step):null;`;
async function testUrl(url) {
  await val(typeUrl(url));
  await val(click('desktop-test'));
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    const p = await val(problemOf);
    if (p && p !== 'idle') return p;
  }
  return 'sem resposta';
}
/** Tenta os quatro comandos (e dois do núcleo) na página aberta. */
const BRIDGE = `const T=window.__TAURI_INTERNALS__;if(!T)return 'sem ponte';const out={};for(const [c,a] of [['desktop_state',{}],['desktop_use_local',{lang:'en'}],['desktop_use_server',{url:'http://localhost:9/',sso:null,lang:'en'}],['desktop_probe_port',{url:'http://localhost:9/'}],['plugin:window|close',{}],['plugin:event|listen',{event:'x',target:{kind:'Any'},handler:1}]]){out[c]=await Promise.race([T.invoke(c,a).then(()=>'ACEITO',()=>'recusado'),new Promise(r=>setTimeout(()=>r('sem resposta'),1200))])}return Object.values(out).every(v=>v!=='ACEITO')?'recusada':JSON.stringify(out);`;
/** A mesma tentativa de dentro de um painel de extensão (quadro isolado → painel embrulhado), com canais crus. */
const PANEL_ATTACK = `const inner=\`<script>(async()=>{const r={tem:typeof window.__TAURI_INTERNALS__};
  const T=window.__TAURI_INTERNALS__;
  if(T){for(const c of ['desktop_state','desktop_use_server','desktop_probe_port']){r[c]=await Promise.race([T.invoke(c,{url:'http://localhost:9/',sso:null,lang:null}).then(()=>'ACEITO',()=>'recusado'),new Promise(x=>setTimeout(()=>x('sem resposta'),1200))])}}for(const u of ['http://ipc.localhost/desktop_state','ipc://localhost/desktop_state']){try{await fetch(u,{method:'POST',body:'{}'});r[u]='ACEITO'}catch(e){r[u]='barrado'}}parent.postMessage({ldAttack:r},'*')})()</\`+\`script>\`;
  return await new Promise(ok=>{addEventListener('message',e=>{if(e.data&&e.data.ldAttack)ok(e.data.ldAttack)});
  const f=document.createElement('iframe');
  f.setAttribute('sandbox','allow-scripts');
  f.src='./ext/panel-host.html';
  f.onload=()=>f.contentWindow.postMessage({od:'panel-doc',html:inner},'*');document.body.append(f);setTimeout(()=>ok('sem resposta'),9000)});`;
const attackRefused = (r) => (r && typeof r === 'object' ? Object.values(r).every((v) => v !== 'ACEITO') : false);
/** Segura o banco local com uma transação de escrita por `ms` (não espera: a transação segue sozinha na página). */
const HOLD_DB = (ms) => `const q=indexedDB.open('ludraw');q.onsuccess=()=>{const db=q.result;const tx=db.transaction('boards','readwrite');const s=tx.objectStore('boards');const end=Date.now()+${ms};const spin=()=>{if(Date.now()<end)s.count().onsuccess=spin};spin();tx.oncomplete=()=>db.close()};return true;`;
const idbHas = (text) => `const db=await new Promise((ok,no)=>{const q=indexedDB.open('ludraw');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});const all=await new Promise(ok=>{const g=db.transaction('boards').objectStore('boards').getAll();g.onsuccess=()=>ok(g.result)});db.close();return JSON.stringify(all).includes(${JSON.stringify(text)});`;

/* ------------------------------------------------ servidores de teste ------------------------------------------------ */

const listeners = [];
const listen = (server) => new Promise((r) => (listeners.push(server), server.listen(0, '127.0.0.1', () => r(server.address().port))));
const freePort = async () => {
  const s = createTcp();
  const port = await new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
  await new Promise((r) => s.close(r));
  return port;
};
const hits = [];
const strangePort = await listen(createServer((q, s) => (hits.push(q.url), s.end('estranho'))));
const plainPort = await listen(createServer((q, s) => s.end('um site qualquer')));
const oldPort = await listen(
  createServer((q, s) => {
    s.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': q.headers.origin ?? '*' });
    s.end(JSON.stringify({ name: 'ludraw', version: '0', apiVersion: 99, sso: { enabled: false, label: null } }));
  }),
);
/** Certificado próprio, gerado na hora com o openssl do sistema (nunca versionado). Sem openssl: porta que falha no TLS. */
function ownCertificate() {
  for (const exe of ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe']) {
    try {
      const key = join(work, 'k.pem');
      const cert = join(work, 'c.pem');
      execFileSync(exe, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' });
      return { key: readFileSync(key), cert: readFileSync(cert) };
    } catch {
      /* tenta o próximo */
    }
  }
  return {};
}
const tlsPort = await listen(createHttps(ownCertificate(), (q, s) => s.end('{}')));

// provedor de SSO falso (OIDC), com uma página que tenta usar a ponte antes de voltar
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const codes = new Map();
const issuerServer = createServer((q, s) => {
  const u = new URL(q.url, issuer);
  const json = (v) => (s.writeHead(200, { 'content-type': 'application/json' }), s.end(JSON.stringify(v)));
  if (u.pathname === '/.well-known/openid-configuration') return json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post'] });
  if (u.pathname === '/jwks') return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] });
  if (u.pathname === '/authorize') {
    const code = randomBytes(12).toString('hex');
    codes.set(code, { nonce: u.searchParams.get('nonce') });
    s.writeHead(200, { 'content-type': 'text/html' });
    const back = new URL(u.searchParams.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', u.searchParams.get('state'));
    return s.end(`<!doctype html><h1 id="issuer">Login da empresa</h1><a id="back" href="${back.href.replace(/&/g, '&amp;')}">Entrar</a>`);
  }
  if (u.pathname === '/token') {
    let raw = '';
    q.on('data', (c) => (raw += c));
    return q.on('end', () => {
      const pending = codes.get(new URLSearchParams(raw).get('code'));
      const now = Math.floor(Date.now() / 1000);
      const body = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ iss: issuer, aud: 'ludraw', sub: 'p1', nonce: pending?.nonce, email: 'pessoa@example.com', email_verified: true, name: 'Pessoa SSO', iat: now, exp: now + 300 })}`;
      json({ access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey, 'base64url')}` });
    });
  }
  s.writeHead(404).end();
});
let issuer = '';
issuer = `http://localhost:${await listen(issuerServer)}`;

const API = await freePort();
const SERVER = `http://localhost:${API}`;
const SETUP_TOKEN = randomBytes(16).toString('hex');
const PASSWORD = `Senha-${randomBytes(8).toString('hex')}`;
const dbDir = join(work, 'assets');
let server;
function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: join(root, 'server'),
    stdio: 'ignore',
    env: {
      ...process.env,
      DATABASE_URL: `pglite://${join(work, 'pg').replace(/\\/g, '/')}`,
      PORT: String(API),
      HOST: '127.0.0.1',
      LUDRAW_ASSETS_DIR: dbDir,
      LUDRAW_WEB_DIR: join(root, 'dist'),
      LUDRAW_PUBLIC_URL: SERVER,
      LUDRAW_SETUP_TOKEN: SETUP_TOKEN,
      LUDRAW_JWT_SECRET: createHash('sha512').update(work).digest('base64url'),
      LUDRAW_MAIL_OUTBOX_DIR: '',
      LUDRAW_SMTP_HOST: '',
      LUDRAW_REDIS_URL: '',
      LUDRAW_COOKIE_SECURE: 'false',
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: 'ludraw',
      OIDC_CLIENT_SECRET: 'teste',
      OIDC_PROVIDER_NAME: 'Login da Empresa',
      OIDC_AUTO_PROVISION: 'true',
      OIDC_ALLOW_INSECURE_HTTP: 'true',
      LOG_LEVEL: 'error',
    },
  });
}
async function serverUp() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${SERVER}/api/v1/info`)).ok) return true;
    } catch {
      /* subindo */
    }
    await sleep(500);
  }
  return false;
}

/** Planilha `.xlsx` mínima com as partes em `deflate` cru (pendência D: o leitor de verdade, no motor de verdade). */
function xlsx(cell) {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plan1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${cell}</t></is></c><c r="B1" t="inlineStr"><is><t>Coluna B</t></is></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>2</v></c></row></sheetData></worksheet>`,
  };
  return zip(files);
}
function ods(cell) {
  return zip({
    mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
    'content.xml': `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Plan1"><table:table-row><table:table-cell office:value-type="string"><text:p>${cell}</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>B</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
  });
}
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const packed = deflateRawSync(data);
    const n = Buffer.from(name);
    const h = Buffer.alloc(26);
    h.writeUInt16LE(20, 0);
    h.writeUInt16LE(8, 4);
    h.writeUInt32LE(crc32(data) >>> 0, 10);
    h.writeUInt32LE(packed.length, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt16LE(n.length, 22);
    parts.push(Buffer.from([0x50, 0x4b, 3, 4]), h, n, packed);
    const c = Buffer.alloc(14); // comentário, disco, atributos (zeros) e o deslocamento
    c.writeUInt32LE(offset, 10);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2, 20, 0]), h, c, n]));
    offset += 30 + n.length + packed.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dirBytes, end]);
}
const drop = (name, type, bytes) => `const b=Uint8Array.from(atob('${bytes.toString('base64')}'),c=>c.charCodeAt(0));const f=new File([b],${JSON.stringify(name)},{type:${JSON.stringify(type)}});const d=new DataTransfer();d.items.add(f);const el=document.querySelector('[data-canvas-stage]');const r=el.getBoundingClientRect();for(const t of ['dragenter','dragover','drop'])el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:d,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));return true;`;

/* ------------------------------------------------ roteiro ------------------------------------------------ */

let app;
try {
  startServer();

  console.log('1. primeiro uso');
  dir = join(work, 'p1');
  app = launch(dir);
  expect('abre a tela de escolha', await until(`return location.pathname==='/desktop'&&!!document.querySelector('[data-testid=desktop-use-local]')`, 30000), true);
  const first = await ev(`return {origin:location.origin,h1:document.querySelectorAll('h1').length,main:document.querySelectorAll('main').length,create:/criar (uma )?organiza|create (an )?organi/i.test(document.body.innerText),secure:isSecureContext,step:document.querySelector('[data-testid=desktop-server-status]').dataset.step}`);
  expect('janela "chooser"', first?.label, 'chooser');
  expect('origem local permanente', first?.value.origin, LOCAL);
  expect('contexto seguro', first?.value.secure, true);
  expect('um h1 e um main', [first?.value.h1, first?.value.main], [1, 1]);
  expect('sem "criar organização"', first?.value.create, false);
  expect('sem escolha guardada, nada é testado sozinho', first?.value.step, 'idle');
  expect('nada guardado antes da escolha', existsSync(join(dir, 'desktop.json')), false);
  const chooserCsp = await val(`return (await fetch(location.href)).headers.get('content-security-policy')`);
  expect('CSP da escolha: ponte e teste de endereço', /connect-src 'self' data: ipc: http:\/\/ipc\.localhost http: https:/.test(chooserCsp ?? ''), true);
  expect('CSP da escolha: script sem unsafe', /script-src [^;]*unsafe/.test(chooserCsp ?? 'unsafe'), false);
  const badUrls = await val(`const T=window.__TAURI_INTERNALS__;const out=[];for(const url of ['file:///etc/passwd','javascript:1','https://u:p@x.example.com','tauri://localhost/','http://tauri.localhost/','']){try{await T.invoke('desktop_use_server',{url,sso:null,lang:null});out.push('ACEITO '+url)}catch{}}for(const sso of ['file:///x','https://a.example.com/b','x']){try{await T.invoke('desktop_use_server',{url:'http://localhost:9/',sso,lang:null});out.push('ACEITO '+sso)}catch{}}return out`);
  expect('endereço ou emissor inválido é recusado pelo programa', badUrls, []);

  console.log('2. problemas de conexão explicados');
  expect('endereço inválido', await testUrl('draw.example.com'), 'invalidUrl');
  expect('nome que não existe', await testUrl('https://ludraw.invalid'), 'unknownHost');
  expect('servidor fora do ar', await testUrl(`http://localhost:${await freePort()}`), 'offline');
  expect('certificado próprio', await testUrl(`https://localhost:${tlsPort}`), 'certificate');
  const certText = await val(`return document.querySelector('[data-testid=desktop-server-status]').innerText`);
  expect('certificado: explica sem ensinar a ignorar', /certific/i.test(certText ?? '') && !/ignor|aceitar o risco|bypass/i.test(certText ?? ''), true);
  expect('site que não é LuDraw', await testUrl(`http://localhost:${plainPort}`), 'notLuDraw');
  expect('versão incompatível', await testUrl(`http://localhost:${oldPort}`), 'incompatible');
  expect('servidor de teste no ar', await serverUp(), true);
  expect('servidor de verdade: conexão ok', await testUrl(SERVER), 'ok');
  expect('avisa que o primeiro acesso está pendente', await val(`return /primeiro acesso|first access|first-time|setup/i.test(document.querySelector('[data-testid=desktop-server-status]').innerText)`), true);
  expect('mostra onde o login da empresa abre', await val(`return document.querySelector('[data-testid=desktop-server-status]').innerText.includes(${JSON.stringify(new URL(issuer).host)})`), true);
  expect('nenhuma violação de CSP na escolha', await val(`return window.__ldViolations`), []);

  console.log('3. Modo Local');
  await val(click('desktop-use-local'));
  expect('abre o app embutido', await until(`return location.pathname==='/'&&!!document.querySelector('[data-testid=login-continue-local]')`, 30000), true);
  const local = await ev(`return {origin:location.origin}`);
  expect('janela de board', local?.label, 'board');
  expect('mesma origem local', local?.value.origin, LOCAL);
  expect('escolha guardada, sem segredos', JSON.parse(readFileSync(join(dir, 'desktop.json'), 'utf8')).place, { mode: 'local' });
  const appCsp = await val(`return (await fetch('/')).headers.get('content-security-policy')`);
  expect("CSP do app: connect-src 'self' data:", /connect-src 'self' data:;/.test(appCsp ?? ''), true);
  expect('ponte recusada na página do app', await val(BRIDGE, 15000), 'recusada');
  const attack = await val(PANEL_ATTACK, 15000);
  expect(`ponte recusada no painel isolado (${JSON.stringify(attack)})`, attackRefused(attack), true);
  expect('app embutido não alcança servidor nenhum', await val(`try{await fetch(${JSON.stringify(`${SERVER}/api/v1/info`)});return 'ALCANÇOU'}catch{return 'barrado'}`), 'barrado');
  await val(click('login-continue-local'));
  expect('entra sem conta', await until(`return location.hash==='#/'&&[...document.querySelectorAll('button')].some(b=>/Novo board|New board/.test(b.textContent))`), true);
  await val(`[...document.querySelectorAll('button')].find(b=>/Novo board|New board/.test(b.textContent)).click();return true`);
  expect('cria e abre um board', await until(`return location.hash.startsWith('#/board/')&&!!document.querySelector('[data-canvas-stage]')`), true);
  await sleep(1200);
  await val(drop('teste.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx('Célula do XLSX')));
  expect('planilha .xlsx lida (deflate-raw)', await until(`return document.body.innerText.includes('Célula do XLSX')`), true);
  await val(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true`);
  await sleep(600);
  await val(drop('teste.ods', 'application/vnd.oasis.opendocument.spreadsheet', ods('Célula do ODS')));
  expect('planilha .ods lida (deflate-raw)', await until(`return document.body.innerText.includes('Célula do ODS')`), true);
  await val(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true`);
  await sleep(600);
  await val(`const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['conteudo do teste']));a.download='baixado.txt';document.body.append(a);a.click();a.remove();return true`);
  expect('download do app salva o arquivo', await downloaded('baixado.txt'), 'conteudo do teste');
  await val(`const a=document.createElement('a');a.href='https://www.example.com/pagina';a.target='_blank';document.body.append(a);a.click();a.remove();return true`);
  await sleep(1200);
  // o WebKit só abre janela nova com gesto de verdade; a regra em si é coberta pelo cargo test
  const externals = existsSync(join(dir, 'external.txt')) ? readFileSync(join(dir, 'external.txt'), 'utf8') : '';
  if (win) expect('link para outro site abre no navegador do sistema', externals.includes('https://www.example.com/pagina'), true);
  await val(`location.href='https://www.example.com/fora';return true`);
  await val(`location.href='file:///etc/passwd';return true`);
  await sleep(1200);
  expect('navegar para fora não sai do app', await val(`return location.origin`), LOCAL);
  expect('nenhuma violação de CSP além das provocadas no teste', await val(`return window.__ldViolations.filter(v=>!/ipc\\.localhost|ipc:|${API}/.test(v))`), []);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#ABCDEF"/></svg>');
  const boardHash = await val(`return location.hash`);
  // disco lento: outra transação segura o banco local por 2 s, e a gravação do app fica na fila atrás dela
  await val(HOLD_DB(2000));
  await val(drop('marca.svg', 'image/svg+xml', svg));
  await sleep(350); // menos que o salvamento automático (0,5 s): quem grava é o fechamento
  menu('quit');
  expect('sair pelo menu fecha o programa', await waitExit(app), 0);
  await sleep(1000);

  console.log('4. lembra a escolha e os dados');
  app = launch(dir);
  expect('reabre direto no Modo Local', await until(`return location.pathname==='/'&&location.origin===${JSON.stringify(LOCAL)}`, 30000), true);
  expect('continua com o mesmo perfil', await until(`return [...document.querySelectorAll('button')].some(b=>/Novo board|New board/.test(b.textContent))`), true);
  expect('a última mudança antes de fechar foi gravada', (await val(idbHas('ABCDEF'))) || (await val(idbHas('abcdef'))), true);
  await val(`location.hash=${JSON.stringify(boardHash)};return true`);
  expect('o board reabre', await until(`return !!document.querySelector('[data-canvas-stage]')`), true);
  const second = launch(dir);
  expect('segunda abertura do programa é recusada', await waitExit(second), 0);
  expect('a primeira continua aberta', await val(`return location.origin`), LOCAL);
  await val(`location.href='./desktop';return true`);
  expect('"Trocar onde trabalhar" abre a escolha', await until(`return location.pathname==='/desktop'&&!!document.querySelector('[data-testid=desktop-use-local]')`), true);
  expect('a janela do board fechou', (await ev(`return 1`))?.label, 'chooser');

  console.log('5. Modo Servidor');
  const setup = await fetch(`${SERVER}/api/v1/setup/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ludraw-client': '1', origin: SERVER },
    body: JSON.stringify({ token: SETUP_TOKEN, mode: 'single_org', organization: { name: 'Empresa Exemplo', allowedEmailDomains: ['example.com'] }, admin: { name: 'Ana Admin', email: 'ana@example.com', password: PASSWORD } }),
  });
  expect('servidor configurado', setup.status, 200);
  await val(typeUrl(SERVER));
  await val(click('desktop-connect'));
  expect('a janela abre o app do servidor', await until(`return location.origin===${JSON.stringify(SERVER)}&&location.hash==='#/login'`, 30000), true);
  const remote = await ev(`return document.body.innerText.includes('Login da Empresa')`);
  expect('janela de board (sem permissão)', remote?.label, 'board');
  expect('entrada do servidor com o login da empresa', remote?.value, true);
  expect('escolha guardada: só o endereço', JSON.parse(readFileSync(join(dir, 'desktop.json'), 'utf8')).place, { mode: 'server', url: `${SERVER}/` });
  expect('nada de token na escolha', /token|senha|password|secret/i.test(readFileSync(join(dir, 'desktop.json'), 'utf8')), false);
  expect('ponte recusada na página do servidor', await val(BRIDGE, 15000), 'recusada');
  const remoteAttack = await val(PANEL_ATTACK, 15000);
  expect(`ponte recusada no painel isolado do servidor (${JSON.stringify(remoteAttack)})`, attackRefused(remoteAttack), true);
  await val(`document.querySelector('a[href*="/auth/oidc/start"]').click();return true`);
  expect('SSO: a janela vai ao emissor', await until(`return location.origin===${JSON.stringify(issuer)}&&!!document.getElementById('issuer')`), true);
  expect('ponte recusada na página do emissor', await val(BRIDGE, 15000), 'recusada');
  await val(`document.getElementById('back').click();return true`);
  expect('SSO: volta ao servidor e entra', await until(`return location.origin===${JSON.stringify(SERVER)}&&[...document.querySelectorAll('button')].some(b=>/Novo board|New board/.test(b.textContent))`, 30000), true);
  for (const [name, target] of [
    ['outra origem', `http://localhost:${strangePort}/pagina`],
    ['arquivos embutidos do programa', `${LOCAL}/`],
    ['tela de escolha', `${LOCAL}/desktop`],
    ['arquivo do computador', 'file:///C:/Windows/win.ini'],
  ]) {
    await val(`location.href=${JSON.stringify(target)};return true`).catch(() => null);
    await sleep(900);
    expect(`não sai do servidor: ${name}`, await val(`return location.origin`), SERVER);
  }
  console.log(`   (limite registrado) pedidos que chegaram à origem bloqueada: ${hits.length}`);
  expect('nenhuma violação de CSP do app no servidor além das provocadas', await val(`return (window.__ldViolations||[]).filter(v=>!/ipc\\.localhost|ipc:/.test(v))`), []);
  await val(`const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['segundo']));a.download='segundo.txt';document.body.append(a);a.click();a.remove();return true`);
  expect('download depois de trocar de lugar', await downloaded('segundo.txt'), 'segundo');
  menu('switch');
  expect('menu: trocar onde trabalhar', await until(`return location.pathname==='/desktop'`), true);
  expect('o endereço lembrado aparece, sem seguir sozinho', await until(`return document.querySelector('[data-testid=desktop-server-url]').value===${JSON.stringify(SERVER)}&&document.querySelector('[data-testid=desktop-server-status]').dataset.step==='idle'`), true);
  await quit(app);

  console.log('6. servidor lembrado');
  app = launch(dir);
  expect('abre sozinho o servidor lembrado', await until(`return location.origin===${JSON.stringify(SERVER)}`, 40000), true);
  expect('a sessão continua', await until(`return [...document.querySelectorAll('button')].some(b=>/Novo board|New board/.test(b.textContent))`, 30000), true);
  await quit(app);
  server.kill('SIGKILL');
  await sleep(1000);
  app = launch(dir);
  expect('servidor fora do ar: volta à escolha e explica', await until(`const s=document.querySelector('[data-testid=desktop-server-status]');return !!s&&s.dataset.problem==='offline'`, 40000), true);
  expect('o Modo Local continua disponível', await val(`return document.querySelector('[data-testid=desktop-use-local]').disabled`), false);
  await val(click('desktop-use-local'));
  expect('e abre com os dados de antes', await until(`return location.pathname==='/'&&[...document.querySelectorAll('button')].some(b=>/Novo board|New board/.test(b.textContent))`, 30000), true);
  await quit(app);

  console.log('7. escolha estragada');
  writeFileSync(join(dir, 'desktop.json'), '{"place":{"mode":"server","url":"file:///etc/passwd"}}');
  app = launch(dir);
  expect('arquivo de escolha inválido = primeiro uso', await until(`return location.pathname==='/desktop'&&document.querySelector('[data-testid=desktop-server-url]').value===''`, 30000), true);
  await quit(app);
} catch (e) {
  failures.push(`erro no roteiro: ${e.stack}`);
} finally {
  if (failures.length && app?.errors) console.log(`stderr do programa:\n${app.errors.slice(0, 3000)}`);
  for (const c of children) c.kill('SIGKILL');
  server?.kill('SIGKILL');
  for (const l of listeners) l.close();
  await sleep(1500);
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  } catch {
    /* o motor às vezes ainda segura o perfil descartável */
  }
}

if (failures.length) {
  console.log(`\n${failures.length} falha(s), ${passed} ok:\n${failures.map((f) => `  ✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`test:desktop:app — ${passed} verificações ok (${win ? 'WebView2' : 'WebKitGTK'}).`);
process.exit(0);
