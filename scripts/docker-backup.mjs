#!/usr/bin/env node
/**
 * LuDraw — backup e restauração da instalação com Docker Compose (Chat 09 · R3). Guia: docs/BACKUP.md.
 *
 *   node scripts/docker-backup.mjs backup  [--out <pasta>] [--online]
 *   node scripts/docker-backup.mjs restore <pasta> --yes
 *
 * Roda na pasta do docker-compose.yml (ou com COMPOSE_FILE / COMPOSE_PROJECT_NAME no ambiente, que o próprio
 * `docker compose` respeita). Usa só o que já está nos contêineres: `pg_dump`/`pg_restore` do serviço "db" e o
 * `tar` da imagem do LuDraw (serviço "app"). Nenhuma senha passa por argumento: o pg_dump entra pelo socket local
 * do contêiner do banco.
 *
 * Backup = uma pasta com:
 *   db.dump        pg_dump -Fc do banco "ludraw" (boards, contas, auditoria, metadados das imagens)
 *   assets.tar     a pasta das imagens (/data/assets)
 *   manifest.json  data, versão da imagem e SHA-256 + tamanho dos dois arquivos (conferidos na restauração)
 * Por padrão o app é PARADO durante a cópia (alguns segundos) para banco e imagens ficarem do mesmo instante;
 * `--online` copia sem parar (as imagens são imutáveis, mas uma imagem enviada durante a cópia pode faltar).
 * Os segredos (deploy/secrets/) NÃO entram: a restauração funciona com segredos novos (as contas e senhas das
 * pessoas estão no banco; trocar a chave das sessões só pede login de novo).
 *
 * Restauração (APAGA o conteúdo atual do banco): sobe o banco se preciso (num volume novo, o Postgres cria os
 * papéis), para o app, restaura banco e imagens, e sobe tudo de novo (a migração roda antes do app e atualiza um
 * backup de versão anterior).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FORMAT = 'ludraw-backup';
const FILES = { db: 'db.dump', assets: 'assets.tar' };

class UsageError extends Error {}

function compose(args, { quiet = false } = {}) {
  const r = spawnSync('docker', ['compose', ...args], { stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'], encoding: 'utf8' });
  if (r.error) throw r.error;
  return { code: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function mustCompose(args, what) {
  const r = compose(args);
  if (r.code !== 0) throw new Error(`${what} falhou (docker compose ${args.join(' ')})`);
  return r.out;
}

/** Roda `docker compose …` mandando a saída padrão para um arquivo (ou a entrada padrão a partir de um arquivo). */
function pipeCompose(args, { toFile, fromFile }) {
  return new Promise((ok, fail) => {
    const child = spawn('docker', ['compose', ...args], { stdio: [fromFile ? 'pipe' : 'ignore', toFile ? 'pipe' : 'inherit', 'inherit'] });
    let streamDone = !toFile;
    let exit = null;
    const finish = () => {
      if (!streamDone || exit === null) return;
      exit === 0 ? ok() : fail(new Error(`docker compose ${args.slice(0, 4).join(' ')}… terminou com código ${exit}`));
    };
    if (toFile) {
      const out = createWriteStream(toFile, { mode: 0o600 });
      child.stdout.pipe(out);
      out.on('finish', () => {
        streamDone = true;
        finish();
      });
      out.on('error', fail);
    }
    if (fromFile) {
      const input = createReadStream(fromFile);
      input.on('error', fail);
      input.pipe(child.stdin);
    }
    child.on('error', fail);
    child.on('close', (code) => {
      exit = code ?? 1;
      finish();
    });
  });
}

function sha256Of(file) {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => ok(h.digest('hex')))
      .on('error', fail);
  });
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function runningServices() {
  const r = compose(['ps', '--status', 'running', '--services'], { quiet: true });
  return new Set(r.code === 0 ? r.out.split(/\r?\n/).filter(Boolean) : []);
}

function imageVersion() {
  const id = compose(['ps', '-q', 'app'], { quiet: true }).out.split(/\r?\n/)[0];
  if (!id) return null;
  const r = spawnSync('docker', ['inspect', '-f', '{{index .Config.Labels "org.opencontainers.image.version"}}', id], { encoding: 'utf8' });
  const v = (r.stdout ?? '').trim();
  return r.status === 0 && v && v !== '<no value>' ? v : null;
}

const log = (msg) => process.stdout.write(`${msg}\n`);

/** Espera o healthcheck do serviço ficar "healthy" (o app confere o banco no /health). */
async function waitHealthy(service, seconds = 120) {
  for (let i = 0; i < seconds * 2; i++) {
    const health = compose(['ps', service, '--format', '{{.Health}}'], { quiet: true }).out;
    if (health === 'healthy') return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`o serviço "${service}" não ficou saudável em ${seconds} s (docker compose logs ${service})`);
}

async function backup(flags) {
  const out = resolve(flags.out ?? join('backups', `ludraw-${stamp()}`));
  if (existsSync(join(out, 'manifest.json'))) throw new UsageError(`${out} já tem um backup; escolha outra pasta.`);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const running = runningServices();
  if (!running.has('db')) throw new UsageError('O serviço "db" não está rodando (docker compose up -d db).');
  const version = imageVersion();
  const stopApp = !flags.online && running.has('app');
  if (stopApp) {
    log('Parando o app durante a cópia…');
    mustCompose(['stop', 'app'], 'parar o app');
  }
  try {
    log(`Banco → ${FILES.db}`);
    await pipeCompose(['exec', '-T', 'db', 'pg_dump', '--username=postgres', '--dbname=ludraw', '--format=custom', '--no-password'], { toFile: join(out, FILES.db) });
    log(`Imagens → ${FILES.assets}`);
    await pipeCompose(['run', '--rm', '--no-deps', '-T', '--entrypoint', 'tar', 'app', '-C', '/data/assets', '-cf', '-', '.'], { toFile: join(out, FILES.assets) });
  } finally {
    if (stopApp) {
      log('Ligando o app de novo…');
      mustCompose(['start', 'app'], 'ligar o app');
      await waitHealthy('app');
    }
  }
  const files = {};
  for (const [key, name] of Object.entries(FILES)) {
    const path = join(out, name);
    files[key] = { name, bytes: statSync(path).size, sha256: await sha256Of(path) };
  }
  const manifest = { format: FORMAT, formatVersion: 1, createdAt: new Date().toISOString(), ludrawVersion: version, consistent: !flags.online, files };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  log(`Backup pronto em ${out} (banco ${files.db.bytes} bytes, imagens ${files.assets.bytes} bytes).`);
  log('Guarde esta pasta num lugar seguro: ela contém todos os boards e as contas (senhas só como hash).');
}

async function restore(dir, flags) {
  if (!dir) throw new UsageError('Informe a pasta do backup: restore <pasta> --yes');
  const src = resolve(dir);
  const manifestPath = join(src, 'manifest.json');
  if (!existsSync(manifestPath)) throw new UsageError(`${src} não tem manifest.json.`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== FORMAT || manifest.formatVersion !== 1) throw new UsageError('manifest.json não é de um backup do LuDraw (formato 1).');
  for (const key of Object.keys(FILES)) {
    const f = manifest.files?.[key];
    const path = join(src, FILES[key]);
    if (!f || !existsSync(path)) throw new UsageError(`Falta ${FILES[key]} no backup.`);
    const sha = await sha256Of(path);
    if (sha !== f.sha256 || statSync(path).size !== f.bytes) throw new UsageError(`${FILES[key]} não confere com o manifest.json (arquivo corrompido ou trocado). Nada foi alterado.`);
  }
  log(`Backup de ${manifest.createdAt}${manifest.ludrawVersion ? ` (LuDraw ${manifest.ludrawVersion})` : ''}: arquivos conferidos.`);
  if (flags.yes !== true) throw new UsageError('A restauração APAGA o conteúdo atual do banco. Rode de novo com --yes para confirmar.');
  log('Subindo o banco…');
  mustCompose(['up', '-d', '--wait', 'db'], 'subir o banco');
  if (runningServices().has('app')) mustCompose(['stop', 'app'], 'parar o app');
  log('Restaurando o banco…');
  await pipeCompose(['exec', '-T', 'db', 'pg_restore', '--username=postgres', '--dbname=ludraw', '--clean', '--if-exists', '--exit-on-error', '--no-password'], { fromFile: join(src, FILES.db) });
  log('Restaurando as imagens…');
  await pipeCompose(['run', '--rm', '--no-deps', '-T', '--entrypoint', 'tar', 'app', '-C', '/data/assets', '-xf', '-'], { fromFile: join(src, FILES.assets) });
  log('Subindo a migração e o app…');
  mustCompose(['up', '-d', '--wait'], 'subir o LuDraw');
  log('Restauração concluída.');
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') flags.out = argv[++i];
    else if (a === '--online') flags.online = true;
    else if (a === '--yes') flags.yes = true;
    else if (a.startsWith('--')) throw new UsageError(`Opção desconhecida: ${a}`);
    else rest.push(a);
  }
  return { flags, rest };
}

const USAGE = 'Uso:\n  node scripts/docker-backup.mjs backup  [--out <pasta>] [--online]\n  node scripts/docker-backup.mjs restore <pasta> --yes';

try {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseFlags(argv);
  if (command === 'backup') await backup(flags);
  else if (command === 'restore') await restore(rest[0], flags);
  else throw new UsageError(USAGE);
} catch (err) {
  process.stderr.write(`${err instanceof UsageError ? err.message : `Erro: ${err.message}`}\n`);
  process.exit(err instanceof UsageError ? 2 : 1);
}
