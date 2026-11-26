/**
 * LuDraw — duas instâncias do servidor com o mesmo Postgres e o mesmo Valkey (Chat 09 · R4, pendência 7).
 *
 *   npm run test:server:multi        (na raiz; precisa do Docker rodando)
 *
 * Sobe um PostgreSQL e um Valkey DESCARTÁVEIS (imagens fixadas do docker-compose.yml, portas aleatórias, senhas
 * aleatórias que não aparecem em lugar nenhum) e dois processos do servidor (A e B) apontando para eles. No fim
 * derruba tudo. O banco de desenvolvimento (porta 5433) nunca é tocado.
 *
 * Confere: erros de login divididos entre A e B batem no MESMO limite; o painel de e-mail salvo em A aparece em B
 * sem reiniciar (aviso por pub/sub); teto geral e limites com chave em hash no Valkey; Valkey fora do ar → login,
 * e-mail e token respondem 503 (o resto continua) e voltam sozinhos quando ele volta; Valkey configurado e
 * inalcançável no boot → o servidor não sobe (sem a senha na mensagem); manutenção roda numa instância por vez.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '../../src/utils/apiContract';
import { openDatabase } from '../src/db/client';

const SERVER = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(SERVER, '..');
const RUN = randomBytes(4).toString('hex');
const WORK = mkdtempSync(join(tmpdir(), 'ludraw-multi-'));
const PG_NAME = `ludraw-multi-pg-${RUN}`;
const VK_NAME = `ludraw-multi-valkey-${RUN}`;
const PG_PASSWORD = randomBytes(24).toString('hex');
const VK_PASSWORD = randomBytes(24).toString('hex');
const SETUP_TOKEN = `MULTI${randomBytes(12).toString('hex').toUpperCase()}`;
const ADMIN = { email: 'ana@example.com', password: 'Quadro-Verde-Multi-2026!' };

/** As mesmas imagens fixadas do docker-compose.yml (uma fonte só). */
const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
const imageOf = (service: string) => new RegExp(`^  ${service}:\\n(?:    .*\\n)*?    image: (\\S+)`, 'm').exec(compose.replace(/\r\n/g, '\n'))?.[1];
const PG_IMAGE = imageOf('db');
const VK_IMAGE = imageOf('valkey');

let passed = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failures.push(`${name}\n      esperado: ${JSON.stringify(expected)}\n      obtido:   ${JSON.stringify(actual)}`);
  process.stdout.write(`  ${ok ? 'ok ' : 'FALHOU'} ${name}\n`);
}
const section = (t: string) => process.stdout.write(`\n# ${t}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function docker(args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  return { code: r.status ?? 1, out: String(r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
}
const hostPort = (name: string, port: number) => Number(docker(['port', name, String(port)]).out.split('\n')[0].split(':').pop());

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
}

async function until(check: () => Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await sleep(250);
  }
  throw new Error(`timeout: ${what}`);
}

interface Instance {
  name: string;
  base: string;
  proc: ChildProcess;
  log: string[];
}
const instances: Instance[] = [];

function startInstance(name: string, port: number, env: Record<string, string>): Instance {
  const log: string[] = [];
  const proc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: SERVER,
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), LOG_LEVEL: 'info', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (d) => log.push(String(d)));
  proc.stderr?.on('data', (d) => log.push(String(d)));
  const inst = { name, base: `http://127.0.0.1:${port}`, proc, log };
  instances.push(inst);
  return inst;
}

async function call(inst: Instance, method: string, path: string, opts: { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${inst.base}${path}`, { method, headers, body: opts.json === undefined ? undefined : JSON.stringify(opts.json) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* sem corpo JSON */
  }
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
}

function cleanup(): void {
  for (const i of instances) i.proc.kill();
  docker(['rm', '-f', PG_NAME, VK_NAME]);
  rmSync(WORK, { recursive: true, force: true });
}

async function main(): Promise<void> {
  if (!PG_IMAGE || !VK_IMAGE) throw new Error('imagens do db/valkey não encontradas no docker-compose.yml');
  process.stdout.write(`LuDraw — duas instâncias (Postgres ${PG_IMAGE.split('@')[0]}, Valkey ${VK_IMAGE.split('@')[0]})\n`);

  section('Contêineres descartáveis');
  // senhas por arquivo montado (nunca em argumento): Postgres por POSTGRES_PASSWORD_FILE, Valkey por arquivo de ACL
  writeFileSync(join(WORK, 'pg_password'), PG_PASSWORD, { mode: 0o644 });
  writeFileSync(join(WORK, 'valkey_acl'), `user default on >${VK_PASSWORD} ~* &* +@all\n`, { mode: 0o644 });
  const pg = docker(['run', '-d', '--rm', '--name', PG_NAME, '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/pg', '-v', `${join(WORK, 'pg_password')}:/run/secrets/pg:ro`, '-p', '127.0.0.1::5432', PG_IMAGE]);
  const vk = docker(['run', '-d', '--rm', '--name', VK_NAME, '-v', `${join(WORK, 'valkey_acl')}:/run/secrets/acl:ro`, '-p', '127.0.0.1::6379', VK_IMAGE, 'valkey-server', '--aclfile', '/run/secrets/acl', '--save', '', '--appendonly', 'no']);
  if (pg.code !== 0 || vk.code !== 0) throw new Error(`docker run falhou: ${pg.err} ${vk.err}`);
  const pgPort = hostPort(PG_NAME, 5432);
  const vkPort = hostPort(VK_NAME, 6379);
  expect('portas dos contêineres diferentes da 5433 (banco de desenvolvimento)', [pgPort !== 5433, vkPort !== 5433], [true, true]);
  await until(async () => docker(['exec', PG_NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).code === 0, 'Postgres');
  const DATABASE_URL = `postgres://postgres:${PG_PASSWORD}@127.0.0.1:${pgPort}/postgres`;
  const REDIS_URL = `redis://default:${VK_PASSWORD}@127.0.0.1:${vkPort}`;
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  probe.on('error', () => undefined);
  const noPassword = new Redis(`redis://127.0.0.1:${vkPort}`, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  // o ioredis 6 esbarra no NOAUTH já ao conectar (HELLO): o motivo chega pelo evento de erro
  let noPasswordErrors = '';
  noPassword.on('error', (e: Error) => {
    noPasswordErrors += ` ${e.message}`;
  });
  await until(async () => (await probe.connect().then(() => probe.ping())) === 'PONG', 'Valkey');
  expect('Valkey exige senha (sem ela, recusa)', await noPassword.connect().then(() => noPassword.set('x', '1')).then(() => 'aceitou', (e: Error) => (/NOAUTH|WRONGPASS/.test(`${e.message}${noPasswordErrors}`) ? 'recusou' : e.message)), 'recusou');
  noPassword.disconnect();

  section('Duas instâncias (A e B)');
  writeFileSync(join(WORK, 'database_url'), DATABASE_URL);
  writeFileSync(join(WORK, 'redis_url'), REDIS_URL);
  writeFileSync(join(WORK, 'setup_token'), SETUP_TOKEN);
  const common = {
    DATABASE_URL_FILE: join(WORK, 'database_url'),
    LUDRAW_REDIS_URL_FILE: join(WORK, 'redis_url'),
    LUDRAW_SETUP_TOKEN_FILE: join(WORK, 'setup_token'),
    LUDRAW_APP_URL: 'http://localhost:5173',
    LUDRAW_SMTP_ALLOW_PRIVATE_HOST: 'true',
    LUDRAW_COLLAB: 'false',
    // vazias vencem um server/.env de quem roda (e-mail, SSO e chave próprios mudariam o resultado)
    LUDRAW_REDIS_URL: '',
    LUDRAW_SMTP_HOST: '',
    LUDRAW_MAIL_OUTBOX_DIR: '',
    LUDRAW_JWT_SECRET: '',
    OIDC_ISSUER: '',
  };
  const a = startInstance('A', await freePort(), common);
  await until(async () => (await fetch(`${a.base}/health`)).ok, 'instância A');
  const b = startInstance('B', await freePort(), common);
  await until(async () => (await fetch(`${b.base}/health`)).ok, 'instância B');
  expect('A e B no ar com o mesmo banco e o mesmo Valkey', [(await call(a, 'GET', '/api/v1/info')).status, (await call(b, 'GET', '/api/v1/info')).status], [200, 200]);
  const setup = await call(a, 'POST', '/api/v1/setup/complete', {
    json: { token: SETUP_TOKEN, mode: 'single_org', organization: { name: 'Empresa Exemplo', allowedEmailDomains: [] }, admin: { name: 'Ana Admin', email: ADMIN.email, password: ADMIN.password } },
  });
  expect('primeiro acesso por A', setup.status, 200);
  const token = setup.json?.accessToken as string;
  expect('B enxerga a organização criada em A', (await call(b, 'GET', '/api/v1/info')).json?.setupRequired, false);

  section('Limite de login compartilhado (8 erros por IP + e-mail, A e B somados)');
  const wrong = { email: 'ninguem@example.com', password: 'senha-errada-123' };
  const statuses: string[] = [];
  for (let i = 0; i < 8; i++) statuses.push(`${i % 2 ? 'B' : 'A'}:${(await call(i % 2 ? b : a, 'POST', '/api/v1/auth/login', { json: wrong })).status}`);
  expect('8 tentativas erradas alternando A e B: todas contam', statuses, ['A:401', 'B:401', 'A:401', 'B:401', 'A:401', 'B:401', 'A:401', 'B:401']);
  const ninthA = await call(a, 'POST', '/api/v1/auth/login', { json: wrong });
  const ninthB = await call(b, 'POST', '/api/v1/auth/login', { json: wrong });
  expect('a 9ª é recusada nas DUAS instâncias (em memória, cada uma deixaria mais 4)', [ninthA.status, ninthB.status, ninthA.json?.error?.code], [429, 429, 'tooManyAttempts']);
  expect('a conta certa (outro e-mail) continua entrando por B', (await call(b, 'POST', '/api/v1/auth/login', { json: ADMIN })).status, 200);

  section('Controle: as mesmas tentativas em duas instâncias SEM Valkey (limite em memória, por instância)');
  const memoryEnv = { ...common, LUDRAW_REDIS_URL_FILE: '' };
  const d = startInstance('D', await freePort(), memoryEnv);
  const e = startInstance('E', await freePort(), memoryEnv);
  await until(async () => (await fetch(`${d.base}/health`)).ok && (await fetch(`${e.base}/health`)).ok, 'instâncias D e E');
  const other = { email: 'outra-pessoa@example.com', password: 'senha-errada-123' };
  for (let i = 0; i < 8; i++) await call(i % 2 ? e : d, 'POST', '/api/v1/auth/login', { json: other });
  const ninthD = await call(d, 'POST', '/api/v1/auth/login', { json: other });
  const ninthE = await call(e, 'POST', '/api/v1/auth/login', { json: other });
  expect('sem Valkey a 9ª e a 10ª ainda passam (4 por instância) — o teste acima mede mesmo o compartilhamento', [ninthD.status, ninthE.status], [401, 401]);
  d.proc.kill();
  e.proc.kill();

  section('Valkey: chaves com hash e teto geral compartilhado');
  const keys = await probe.keys('ludraw:*');
  expect('limites de login e teto geral no Valkey, sem e-mail nem IP em claro', [keys.some((k) => k.startsWith('ludraw:limit:loginAccount:')), keys.filter((k) => /ninguem|example|127\.0\.0\.1|::1/.test(k))], [true, []]);
  expect('teto geral por IP (@fastify/rate-limit) também no Valkey', keys.some((k) => k.startsWith('ludraw:ratelimit:')), true);
  expect('toda chave de limite expira', (await Promise.all(keys.filter((k) => k.startsWith('ludraw:limit:')).map((k) => probe.pttl(k)))).every((t) => t > 0), true);

  section('Painel de e-mail salvo em A → B recarrega sozinho');
  expect('antes: e-mail desligado em B', (await call(b, 'GET', '/api/v1/info')).json?.email, false);
  const put = await call(a, 'PUT', '/api/v1/admin/mail/settings', {
    token,
    json: { enabled: true, host: '127.0.0.1', port: 587, security: 'starttls', user: null, from: 'LuDraw <no-reply@example.com>', password: null },
  });
  expect('painel salvo em A', put.status, 200);
  let bEmail = false;
  for (let i = 0; i < 40 && !bEmail; i++) {
    await sleep(100);
    bEmail = (await call(b, 'GET', '/api/v1/info')).json?.email === true;
  }
  expect('B passa a ter e-mail sem reiniciar (aviso pelo Valkey, sem dados na mensagem)', bEmail, true);

  section('Valkey fora do ar → 503 nas rotas com limite; o resto continua');
  docker(['stop', '-t', '1', VK_NAME]);
  await sleep(500);
  const loginDown = await call(a, 'POST', '/api/v1/auth/login', { json: ADMIN });
  expect('login responde 503 limitsUnavailable com Retry-After', [loginDown.status, loginDown.json?.error?.code, loginDown.retryAfter], [503, 'limitsUnavailable', '5']);
  expect('"esqueci a senha" (e-mail) responde 503', (await call(b, 'POST', '/api/v1/auth/password/forgot', { json: { email: ADMIN.email } })).status, 503);
  expect('link com token recebido por e-mail responde 503', (await call(a, 'GET', '/api/v1/auth/password/reset/token-qualquer-1234567890')).status, 503);
  expect('sem Valkey: rotas sem limite seguem (saúde, conta, /info)', [(await fetch(`${a.base}/health`)).status, (await call(b, 'GET', '/api/v1/auth/me', { token })).status, (await call(a, 'GET', '/api/v1/info')).status], [200, 200, 200]);
  expect('as instâncias continuam no ar', [a.proc.exitCode, b.proc.exitCode], [null, null]);

  section('Valkey de volta → reconecta sozinho');
  // o contêiner foi criado com --rm: sobe um novo na mesma porta (mesma senha, dados zerados, como numa reinicialização)
  const back = docker(['run', '-d', '--rm', '--name', VK_NAME, '-v', `${join(WORK, 'valkey_acl')}:/run/secrets/acl:ro`, '-p', `127.0.0.1:${vkPort}:6379`, VK_IMAGE, 'valkey-server', '--aclfile', '/run/secrets/acl', '--save', '', '--appendonly', 'no']);
  expect('Valkey de volta', back.code, 0);
  let relogin = 0;
  for (let i = 0; i < 60 && relogin !== 200; i++) {
    await sleep(500);
    relogin = (await call(a, 'POST', '/api/v1/auth/login', { json: ADMIN })).status;
  }
  expect('login volta a funcionar em A sem reiniciar', relogin, 200);
  let reloginB = 0;
  for (let i = 0; i < 20 && reloginB !== 200; i++) {
    await sleep(250);
    reloginB = (await call(b, 'POST', '/api/v1/auth/login', { json: ADMIN })).status;
  }
  expect('e em B', reloginB, 200);
  const logs = instances.map((i) => i.log.join('')).join('\n');
  expect('o log avisa a queda e a volta, sem a URL nem a senha do Valkey', [/Redis\/Valkey connection lost/.test(logs), /Redis\/Valkey connection restored/.test(logs), logs.includes(VK_PASSWORD), logs.includes(PG_PASSWORD)], [true, true, false, false]);

  section('Boot com Valkey inalcançável → não sobe');
  writeFileSync(join(WORK, 'redis_url_morto'), `redis://default:${VK_PASSWORD}@127.0.0.1:1`);
  const c = startInstance('C', await freePort(), { ...common, LUDRAW_REDIS_URL_FILE: join(WORK, 'redis_url_morto') });
  const code = await new Promise<number | null>((ok) => c.proc.on('exit', ok));
  const cLog = c.log.join('');
  expect('instância C sai com erro, explica o motivo e não mostra a senha', [code, /LUDRAW_REDIS_URL is set but Redis\/Valkey at redis:\/\/127\.0\.0\.1:1 did not answer/.test(cLog), cLog.includes(VK_PASSWORD)], [1, true, false]);

  section('Manutenção: uma instância por vez (trava consultiva do Postgres)');
  const d1 = await openDatabase(DATABASE_URL, { poolMax: 2 });
  const d2 = await openDatabase(DATABASE_URL, { poolMax: 2 });
  try {
    let release!: () => void;
    const holding = new Promise<void>((r) => (release = r));
    const first = d1.runExclusive('maintenance-test', () => holding);
    await sleep(200);
    const second = await d2.runExclusive('maintenance-test', async () => undefined);
    release();
    const firstRan = await first;
    const third = await d2.runExclusive('maintenance-test', async () => undefined);
    expect('com uma rodando, a outra não roda; terminada a primeira, a próxima roda', [second, firstRan, third], [false, true, true]);
  } finally {
    await d1.close();
    await d2.close();
  }
  probe.disconnect();
}

try {
  await main();
} catch (err) {
  failures.push(`erro: ${(err as Error).stack ?? String(err)}`);
  for (const i of instances) process.stdout.write(`\n--- log ${i.name} ---\n${i.log.join('').slice(-3000)}\n`);
} finally {
  cleanup();
}
process.stdout.write(`\n${passed} ok, ${failures.length} falha(s)\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.map((f) => `- ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
