#!/usr/bin/env node
/**
 * LuDraw — instaladores do programa desktop (Chat 09.1 · R8). `npm run test:desktop:package`
 *
 * Confere o pacote que `npm run desktop:package` gerou neste sistema:
 *  - Windows (NSIS): instala em silêncio numa pasta descartável, confere arquivos, registro e atalhos, e desinstala
 *    em silêncio. A opção "apagar os dados" NUNCA é marcada (em silêncio ela fica desmarcada) e a pasta de dados
 *    (%LOCALAPPDATA%\app.ludraw) tem de ficar exatamente como estava. Recusa começar se o LuDraw já estiver instalado.
 *  - Linux (.deb): confere o pacote (nome, mantenedor, dependências, arquivos, glibc exigida). Com `--install`
 *    (como root, em contêiner ou no CI) instala, valida o atalho, abre o programa e remove.
 *  - `--run` (só no CI ou em máquina descartável): abre o programa instalado. No Windows isso cria a pasta de dados
 *    de verdade, então fora do CI não é usado.
 *
 * Sem dependências novas. Nada de assinatura de código (decisão do usuário): o teste só informa que não há.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const run = args.has('--run');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const release = join(process.env.CARGO_TARGET_DIR ?? join(root, 'src-tauri/target'), 'release');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
/**
 * O Tauri grava no executável empacotado o tipo de pacote (marca de 3 letras, `UNK` no binário compilado). Compara
 * o resto byte a byte e devolve a marca encontrada (`null` = binários diferentes além dela).
 */
function sameBinary(packaged, built) {
  const MARK = '__TAURI_BUNDLE_TYPE_VAR_UNK';
  const a = readFileSync(packaged);
  const b = readFileSync(built);
  const at = b.indexOf(MARK);
  if (a.length !== b.length || at < 0) return null;
  const end = at + MARK.length;
  if (!a.subarray(0, end - 3).equals(b.subarray(0, end - 3)) || !a.subarray(end).equals(b.subarray(end))) return null;
  return a.subarray(end - 3, end).toString('latin1');
}

let passed = 0;
const failures = [];
const expect = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${failures.at(-1)}`);
  }
};
const notices = readFileSync(join(root, 'src-tauri/THIRD_PARTY_NOTICES.txt'));
const appNotices = readFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'));
const license = readFileSync(join(root, 'LICENSE'));
const same = (file, buf) => existsSync(file) && readFileSync(file).equals(buf);

/** Fotografia de uma pasta (nomes, tamanhos e datas), para provar que nada mudou. */
function snapshot(dir) {
  if (!existsSync(dir)) return null;
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else out.push(`${p.slice(dir.length)} ${s.size} ${s.mtimeMs}`);
    }
  };
  walk(dir);
  return out;
}

async function windows() {
  const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8' }).trim();
  const dir = join(release, 'bundle/nsis');
  const setup = join(dir, `LuDraw_${version}_x64-setup.exe`);
  expect('instalador com o nome da versão', existsSync(setup), true);
  if (!existsSync(setup)) return;
  console.log(`  ${setup} — ${(statSync(setup).size / 1048576).toFixed(1)} MB, SHA-256 ${sha(setup)}`);
  const signature = ps(`(Get-AuthenticodeSignature '${setup}').Status`);
  console.log(`  assinatura de código: ${signature} (sem assinatura nesta etapa, decisão do usuário)`);

  const UNINST = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LuDraw';
  const MANU = 'HKCU:\\Software\\LuDraw';
  if (ps(`Test-Path '${UNINST}'`) === 'True') {
    console.log('  O LuDraw já está instalado neste usuário: o teste não continua (não mexe numa instalação de verdade).');
    process.exit(1);
  }
  const hadManu = ps(`Test-Path '${MANU}'`) === 'True';
  const data = join(process.env.LOCALAPPDATA ?? '', 'app.ludraw');
  const dataBefore = snapshot(data);
  const startMenu = join(process.env.APPDATA ?? '', 'Microsoft/Windows/Start Menu/Programs/LuDraw.lnk');
  const desktop = join(ps('[Environment]::GetFolderPath("Desktop")'), 'LuDraw.lnk');
  const shortcutsBefore = [existsSync(startMenu), existsSync(desktop)];

  const target = mkdtempSync(join(tmpdir(), 'ludraw-install-'));
  try {
    // /D tem de ser o último parâmetro, sem aspas
    execFileSync(setup, ['/S', `/D=${target}`], { stdio: 'ignore' });
    expect('programa instalado', existsSync(join(target, 'ludraw.exe')), true);
    expect('o programa instalado é o que foi compilado (marca do pacote: NSS)', existsSync(join(target, 'ludraw.exe')) && sameBinary(join(target, 'ludraw.exe'), join(release, 'ludraw.exe')), 'NSS');
    expect('LICENSE junto do programa', same(join(target, 'LICENSE.txt'), license), true);
    expect('avisos do desktop junto do programa', same(join(target, 'THIRD_PARTY_NOTICES-desktop.txt'), notices), true);
    expect('avisos do app junto do programa', same(join(target, 'THIRD_PARTY_NOTICES-app.txt'), appNotices), true);
    const reg = JSON.parse(ps(`Get-ItemProperty '${UNINST}' | Select-Object DisplayName,DisplayVersion,Publisher,InstallLocation | ConvertTo-Json`));
    expect('registro: nome, versão e editor', [reg.DisplayName, reg.DisplayVersion, reg.Publisher], ['LuDraw', version, 'LuDraw']);
    expect('registro: pasta escolhida', reg.InstallLocation.replace(/"/g, '').toLowerCase(), target.toLowerCase());
    expect('atalho no menu Iniciar', existsSync(startMenu), true);
    expect('instalar não cria a pasta de dados', JSON.stringify(snapshot(data)) === JSON.stringify(dataBefore), true);

    if (run) {
      const child = spawn(join(target, 'ludraw.exe'), [], { stdio: 'ignore' });
      const gone = new Promise((r) => child.on('exit', (code) => r(code)));
      const early = await Promise.race([gone, sleep(15000).then(() => 'aberto')]);
      expect('o programa instalado abre e fica aberto', early, 'aberto');
      expect('a pasta de dados é a do identificador', existsSync(join(data, 'ludraw.lock')), true);
      child.kill();
      await gone;
      await sleep(2000);
    }

    // a opção "apagar os dados" fica desmarcada em silêncio; _?= roda o desinstalador no lugar e espera
    execFileSync(join(target, 'uninstall.exe'), ['/S', `_?=${target}`], { stdio: 'ignore' });
    expect('desinstalado: programa removido', existsSync(join(target, 'ludraw.exe')), false);
    expect('desinstalado: registro removido', ps(`Test-Path '${UNINST}'`), 'False');
    expect('desinstalado: atalhos removidos (ou como estavam)', [existsSync(startMenu), existsSync(desktop)], shortcutsBefore);
    if (!run) expect('desinstalar não mexe na pasta de dados', JSON.stringify(snapshot(data)) === JSON.stringify(dataBefore), true);
    else expect('desinstalar sem marcar "apagar os dados" preserva os dados', existsSync(join(data, 'ludraw.lock')), true);
  } finally {
    rmSync(target, { recursive: true, force: true });
    // o instalador guarda o idioma em HKCU\Software\LuDraw; só some ao apagar os dados. Limpa o que o teste criou.
    if (!hadManu) ps(`if (Test-Path '${MANU}') { Remove-Item -Recurse -Force '${MANU}' }`);
  }
}

async function linux() {
  const sh = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8' });
  const deb = join(release, `bundle/deb/ludraw_${version}_amd64.deb`);
  expect('pacote com o nome ludraw e a versão', existsSync(deb), true);
  if (!existsSync(deb)) return;
  console.log(`  ${deb} — ${(statSync(deb).size / 1048576).toFixed(1)} MB, SHA-256 ${sha(deb)}`);
  const field = (name) => sh('dpkg-deb', ['-f', deb, name]).trim();
  expect('Package', field('Package'), 'ludraw');
  expect('Version', field('Version'), version);
  expect('Maintainer sem nome pessoal', field('Maintainer'), 'LuDraw');
  expect('Section', field('Section'), 'graphics');
  expect('Depends: só WebKitGTK 4.1 e GTK 3', field('Depends'), 'libwebkit2gtk-4.1-0, libgtk-3-0');
  const files = sh('dpkg-deb', ['-c', deb]).split('\n').map((l) => l.split(/\s+/).at(-1)).filter(Boolean);
  for (const f of ['usr/bin/ludraw', 'usr/share/applications/ludraw.desktop', 'usr/share/doc/ludraw/copyright', 'usr/share/doc/ludraw/THIRD_PARTY_NOTICES-app.txt', 'usr/share/doc/ludraw/THIRD_PARTY_NOTICES-desktop.txt', 'usr/share/icons/hicolor/128x128/apps/ludraw.png']) expect(`no pacote: ${f}`, files.includes(f), true);
  const x = mkdtempSync(join(tmpdir(), 'ludraw-deb-'));
  try {
    sh('dpkg-deb', ['-x', deb, x]);
    expect('copyright = LICENSE', same(join(x, 'usr/share/doc/ludraw/copyright'), license), true);
    expect('avisos do desktop', same(join(x, 'usr/share/doc/ludraw/THIRD_PARTY_NOTICES-desktop.txt'), notices), true);
    expect('o programa do pacote é o que foi compilado (marca do pacote: DEB)', sameBinary(join(x, 'usr/bin/ludraw'), join(release, 'ludraw')), 'DEB');
    const desktopFile = readFileSync(join(x, 'usr/share/applications/ludraw.desktop'), 'utf8');
    expect('atalho: nome LuDraw e programa ludraw', [/^Name=LuDraw$/m.test(desktopFile), /^Exec=ludraw$/m.test(desktopFile), /^Icon=ludraw$/m.test(desktopFile)], [true, true, true]);
    // a glibc mais nova que o programa pede define em que sistemas ele abre (Debian 12 = 2.36, Ubuntu 22.04 = 2.35)
    const glibc = [...sh('objdump', ['-T', join(x, 'usr/bin/ludraw')]).matchAll(/GLIBC_(\d+)\.(\d+)/g)].map((m) => [+m[1], +m[2]]);
    const max = glibc.reduce((a, b) => (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a), [0, 0]);
    console.log(`  glibc exigida: ${max.join('.')}`);
    expect('glibc exigida até 2.35 (abre no Ubuntu 22.04)', max[0] === 2 && max[1] <= 35, true);
  } finally {
    rmSync(x, { recursive: true, force: true });
  }

  if (!args.has('--install')) return;
  const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
  execFileSync('apt-get', ['install', '-y', '-qq', '--no-install-recommends', deb], { stdio: 'ignore', env });
  expect('instalado', existsSync('/usr/bin/ludraw'), true);
  try {
    execFileSync('desktop-file-validate', ['/usr/share/applications/ludraw.desktop'], { stdio: 'pipe' });
    passed++;
  } catch (e) {
    expect('atalho válido (desktop-file-validate)', String(e.stdout ?? e), '');
  }
  expect('todas as bibliotecas encontradas', sh('ldd', ['/usr/bin/ludraw']).includes('not found'), false);
  if (run) {
    const home = mkdtempSync(join(tmpdir(), 'ludraw-home-'));
    const child = spawn('xvfb-run', ['-a', 'dbus-run-session', '/usr/bin/ludraw'], { stdio: 'ignore', env: { ...env, HOME: home, XDG_DATA_HOME: join(home, 'data'), WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: process.getuid?.() === 0 ? '1' : '' } });
    const gone = new Promise((r) => child.on('exit', (code) => r(code)));
    expect('o programa instalado abre e fica aberto', await Promise.race([gone, sleep(15000).then(() => 'aberto')]), 'aberto');
    expect('a pasta de dados é a do identificador', existsSync(join(home, 'data/app.ludraw/ludraw.lock')), true);
    try {
      execFileSync('pkill', ['-f', '/usr/bin/ludraw']);
    } catch {
      /* já saiu */
    }
    child.kill();
    await gone;
    execFileSync('apt-get', ['remove', '-y', '-qq', 'ludraw'], { stdio: 'ignore', env });
    expect('removido', existsSync('/usr/bin/ludraw'), false);
    expect('remover o pacote preserva os dados', existsSync(join(home, 'data/app.ludraw/ludraw.lock')), true);
    rmSync(home, { recursive: true, force: true });
  } else {
    execFileSync('apt-get', ['remove', '-y', '-qq', 'ludraw'], { stdio: 'ignore', env });
    expect('removido', existsSync('/usr/bin/ludraw'), false);
  }
}

console.log(`test:desktop:package — ${process.platform === 'win32' ? 'NSIS' : '.deb'}${run ? ' (abrindo o programa instalado)' : ''}`);
if (process.platform === 'win32') await windows();
else if (process.platform === 'linux') await linux();
else {
  console.log('Só Windows e Linux nesta etapa (D15).');
  process.exit(1);
}

if (failures.length) {
  console.log(`\n${failures.length} falha(s), ${passed} ok.`);
  process.exit(1);
}
console.log(`test:desktop:package — ${passed} verificações ok.`);
