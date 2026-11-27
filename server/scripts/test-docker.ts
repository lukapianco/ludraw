/**
 * LuDraw — teste ponta a ponta da imagem Docker e do docker-compose.yml (Chat 09 · R3).
 *
 *   npm run test:docker            (na raiz; precisa do Docker rodando)
 *   LUDRAW_TEST_IMAGE=ludraw:x npm run test:docker   (usa uma imagem já construída e não a apaga)
 *
 * Constrói a imagem com uma tag própria, copia o compose e deploy/postgres para uma pasta temporária FORA do
 * repositório, gera segredos novos e sobe tudo com um nome de projeto e uma porta aleatórios. No fim derruba os
 * contêineres, apaga volumes, a pasta e a imagem de teste. O banco de desenvolvimento (porta 5433) nunca é tocado.
 *
 * Confere: o sistema de arquivos da imagem (sem .env, ai-memory, server/data, .map, .playwright-mcp, .git,
 * dependências de desenvolvimento ou npm; usuário 10001; código só leitura); o boot do dist COMPILADO do servidor
 * (regressão do defeito do yjs da R1: "Dynamic require of lib0/observable") e o tempo real de verdade (dois clientes
 * Yjs pelo WebSocket, edição propagada e gravada no banco); papéis do banco (app sem DDL); primeiro acesso, login
 * (argon2 no Alpine), board com imagem; CSP e cabeçalhos; e-mail montado e gravado sem navegador; recusa do
 * outbox e da pasta de imagens só leitura em produção; backup → apagar tudo (volumes E segredos) → restaurar →
 * mesmos boards, mesma senha e a imagem com o mesmo SHA-256.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readElement, writeElement } from '../../src/collab/codec';
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '../../src/utils/apiContract';
import { connectClient, sleep, until, type TestClient } from '../test/collab-helpers';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const RUN = randomBytes(4).toString('hex');
const PROJECT = `odtest${RUN}`;
const GIVEN_IMAGE = process.env.LUDRAW_TEST_IMAGE?.trim() || null;
const IMAGE = GIVEN_IMAGE ?? `ludraw:test-${RUN}`;
const WORK = mkdtempSync(join(tmpdir(), 'ludraw-docker-test-'));
const PASSWORD = 'Quadro-Verde-Docker-2026!';
const ADMIN_EMAIL = 'ana@example.com';

let passed = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failures.push(`${name}\n      esperado: ${JSON.stringify(expected)}\n      obtido:   ${JSON.stringify(actual)}`);
  process.stdout.write(`  ${ok ? 'ok ' : 'FALHOU'} ${name}\n`);
}
const section = (t: string) => process.stdout.write(`\n# ${t}\n`);

function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): { code: number; out: string; err: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  return { code: r.status ?? 1, out: String(r.stdout ?? ''), err: String(r.stderr ?? '') };
}
const composeEnv = () => ({ ...process.env, COMPOSE_PROJECT_NAME: PROJECT, LUDRAW_IMAGE: IMAGE, LUDRAW_PORT: String(PORT) });
const compose = (args: string[], opts: SpawnSyncOptions = {}) => run('docker', ['compose', ...args], { cwd: WORK, env: composeEnv(), ...opts });
function mustCompose(args: string[]): string {
  const r = compose(args);
  if (r.code !== 0) throw new Error(`docker compose ${args.join(' ')} → ${r.code}\n${r.err.slice(-2000)}`);
  return r.out;
}
const backupScript = (args: string[]) => run(process.execPath, [join(ROOT, 'scripts', 'docker-backup.mjs'), ...args], { cwd: WORK, env: composeEnv() });

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
const PORT = await freePort();
const BASE = `http://localhost:${PORT}`;

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** PNG de verdade (1×1) com bytes extras aleatórios no fim: o servidor confere a assinatura, e o hash fica único. */
const PNG = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'), randomBytes(512)]);

/** Código e mensagem da causa de um erro de rede (o "fetch failed" do CI não dizia nada). */
function describeCause(e: unknown): string {
  const err = e as { code?: string; message?: string; cause?: unknown } | null;
  const c = (err?.cause ?? err) as { code?: string; message?: string } | null;
  return `${c?.code ?? 'sem código'}: ${c?.message ?? String(c)}`;
}

type CallResult = { status: number; headers: Headers; bytes: Uint8Array; json: any };

/**
 * Pedido HTTP ao app. Chat 09.1 · correção do CI: `node:http` com `agent: false` = conexão NOVA a cada pedido. Com o
 * `fetch`, uma conexão keep-alive aberta com o contêiner antigo podia ser reaproveitada depois de o app ser recriado, e
 * o POST não é repetido. Erro de rede vira mensagem com o método, o caminho e a causa.
 */
async function call(method: string, path: string, opts: { token?: string; json?: unknown; body?: Uint8Array; type?: string; headers?: Record<string, string> } = {}, base = BASE): Promise<CallResult> {
  const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE, ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | Uint8Array | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.body) {
    headers['content-type'] = opts.type ?? 'application/octet-stream';
    body = opts.body;
  }
  if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
  try {
    return await new Promise<CallResult>((ok, fail) => {
      const req = httpRequest(new URL(path, base), { method, headers, agent: false, timeout: 60_000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('error', fail);
        res.on('end', () => {
          const buf = new Uint8Array(Buffer.concat(chunks));
          let json: any = null;
          try {
            json = JSON.parse(Buffer.from(buf).toString('utf8'));
          } catch {
            /* não é JSON */
          }
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : v);
          ok({ status: res.statusCode ?? 0, headers: h, bytes: buf, json });
        });
      });
      req.on('timeout', () => req.destroy(Object.assign(new Error('sem resposta em 60 s'), { code: 'TIMEOUT' })));
      req.on('error', fail);
      if (body !== undefined) req.write(body);
      req.end();
    });
  } catch (e) {
    throw new Error(`${method} ${path} falhou na rede (${describeCause(e)})`, { cause: e });
  }
}

/** Estado do contêiner do app (para a mensagem de falha). */
function appState(): string {
  const ps = compose(['--profile', 'redis', 'ps', '-a', '--format', '{{.Service}} {{.State}} {{.Status}}']).out.trim();
  const id = compose(['ps', '-a', '-q', 'app']).out.trim().split(/\s+/)[0];
  if (!id) return `  contêiner do app não encontrado\n${ps}`;
  const s = run('docker', ['inspect', '--format', '{{.State.Status}} reinícios={{.RestartCount}} saúde={{if .State.Health}}{{.State.Health.Status}}{{end}} início={{.State.StartedAt}} código={{.State.ExitCode}}', id]).out.trim();
  return `  app: ${s}\n${ps.replace(/^/gm, '  ')}`;
}

/**
 * Depois de toda recriação ou partida: espera o /health da BASE responder 200, sempre com conexão nova (teto de
 * tempo). Se não vier, mostra a última causa e o estado do contêiner.
 */
async function waitReady(stage: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  let last = 'nenhuma tentativa';
  let ok = false;
  while (Date.now() < end) {
    try {
      const r = await call('GET', '/health');
      if (r.status === 200) {
        ok = true;
        break;
      }
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await sleep(250);
  }
  if (!ok) process.stdout.write(`  ${stage}: o /health não respondeu 200 em ${ms / 1000} s; último resultado: ${last}\n${appState()}\n`);
  expect(`app responde no /health (conexão nova) depois de ${stage}`, ok, true);
}

async function login(): Promise<string> {
  const r = await call('POST', '/api/v1/auth/login', { json: { email: ADMIN_EMAIL, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`login ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.accessToken as string;
}

function stickyText(client: TestClient, id: string): string | null {
  const y = client.doc.getMap('els').get(id) as never;
  return y ? ((readElement(y) as { text?: string }).text ?? null) : null;
}

/** Dois clientes pelo WebSocket do contêiner: A edita a nota, B recebe; depois o servidor grava no banco. */
async function realtimeRoundTrip(token: string, boardId: string, label: string, text: string): Promise<void> {
  const url = `ws://localhost:${PORT}/api/v1/collab`;
  const a = connectClient(url, boardId, { t: token } as never);
  const b = connectClient(url, boardId, { t: token } as never);
  try {
    await until(() => a.synced && b.synced, `${label}: sincronização`, 15000);
    expect(`${label}: dois clientes Yjs sincronizam pelo WebSocket do contêiner (yjs/ws/Hocuspocus no Alpine)`, [a.authFailed, b.authFailed, stickyText(b, 's1') !== null], [null, null, true]);
    const els = a.doc.getMap('els') as never;
    const prev = readElement(a.doc.getMap('els').get('s1') as never);
    a.doc.transact(() => writeElement(els, { ...prev, text, updatedAt: Date.now() } as never, prev));
    await until(() => stickyText(b, 's1') === text, `${label}: edição chega ao outro cliente`, 10000);
    expect(`${label}: edição de A chega a B`, stickyText(b, 's1'), text);
  } finally {
    a.destroy();
    b.destroy();
  }
  // gravação do documento no banco (debounce de 2 s; o tempo real vira o board salvo)
  let stored = '';
  for (let i = 0; i < 60 && stored !== text; i++) {
    await sleep(250);
    const d = await call('GET', `/api/v1/boards/${boardId}/data`, { token });
    stored = (d.json?.data?.elements?.s1?.text ?? d.json?.elements?.s1?.text ?? '') as string;
  }
  expect(`${label}: o servidor gravou a edição do tempo real no banco`, stored, text);
}

function cleanup(): void {
  compose(['--profile', 'redis', 'down', '-v', '--remove-orphans', '--timeout', '5']);
  for (const name of [`${PROJECT}-mail`, `${PROJECT}-ro`]) run('docker', ['rm', '-f', name]);
  if (!GIVEN_IMAGE) run('docker', ['rmi', '-f', IMAGE]);
  rmSync(WORK, { recursive: true, force: true });
}

async function main(): Promise<void> {
  process.stdout.write(`LuDraw ${VERSION} — teste da imagem Docker (projeto ${PROJECT}, porta ${PORT}, pasta ${WORK})\n`);

  section('Controle: erro de rede mostra a causa');
  const closed = await freePort();
  const control = await call('GET', '/health', {}, `http://127.0.0.1:${closed}`).then(() => 'respondeu', (e: Error) => e.message);
  expect('pedido a uma porta fechada falha com o método, o caminho e a causa (ECONNREFUSED)', /^GET \/health falhou na rede \(ECONNREFUSED: /.test(control), true);

  section('Imagem');
  if (!GIVEN_IMAGE) {
    const t0 = Date.now();
    const b = run('docker', ['build', '-t', IMAGE, ROOT], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (b.code !== 0) throw new Error(`docker build falhou:\n${b.err.slice(-4000)}`);
    process.stdout.write(`  (build em ${Math.round((Date.now() - t0) / 1000)} s)\n`);
  }
  const info = JSON.parse(run('docker', ['image', 'inspect', IMAGE]).out)[0] as { Size: number; Config: { User: string; Labels: Record<string, string>; Env: string[]; Healthcheck?: { Test: string[] }; Cmd: string[] } };
  expect('rótulo de versão da imagem = versão do package.json da raiz (O-10)', info.Config.Labels['org.opencontainers.image.version'], VERSION);
  expect('usuário não-root fixo', info.Config.User, '10001:10001');
  expect('NODE_ENV=production e migração fora do boot (D4)', ['NODE_ENV=production', 'LUDRAW_MIGRATE_ON_BOOT=false'].every((e) => info.Config.Env.includes(e)), true);
  expect('Chat 09 · R5 (D11): a imagem desliga o Sistema visual', info.Config.Env.includes('LUDRAW_ENABLE_DESIGN_SYSTEM=false'), true);
  expect('HEALTHCHECK sem curl (node + /health)', info.Config.Healthcheck?.Test?.join(' ').includes('/health') ?? false, true);
  expect('o contêiner roda o dist COMPILADO do servidor', info.Config.Cmd, ['node', 'dist/index.js']);
  process.stdout.write(`  (tamanho: ${(info.Size / 1024 / 1024).toFixed(1)} MB)\n`);

  const fsCheck = run('docker', ['run', '--rm', '--entrypoint', 'sh', IMAGE, '-c', [
    "find / -xdev \\( -name '.env' -o -name '.env.*' -o -name '*.map' -o -name 'ai-memory' -o -name '.playwright-mcp' -o -name '.git' -o -path '*/server/data' -o -name 'docker-compose*.yml' -o -name '*.dump' \\) -not -path '/proc/*' -print 2>/dev/null",
    'echo "--top"; ls -A /app',
    'echo "--dev"; for p in tsx typescript drizzle-kit esbuild vite @electric-sql @types; do [ -e /app/node_modules/$p ] && echo $p; done; true',
    'echo "--npm"; command -v npm npx yarn corepack; true',
    'echo "--write"; touch /app/x 2>/dev/null && echo app-gravavel; touch /app/dist/x 2>/dev/null && echo dist-gravavel; touch /data/assets/x 2>/dev/null && echo assets-ok; true',
    'echo "--id"; id -u; id -g',
    'echo "--cli"; ludraw help | head -1',
  ].join('; ')]);
  const part = (name: string) => (fsCheck.out.split(`--${name}`)[1] ?? '').split('--')[0].trim().split(/\s+/).filter(Boolean);
  expect('sem .env, ai-memory, server/data, .map, .playwright-mcp, .git, compose ou dump na imagem', fsCheck.out.split('--top')[0].trim().split('\n').filter(Boolean), []);
  expect('/app só com o necessário', part('top').sort(), ['LICENSE', 'dist', 'node_modules', 'package.json', 'web']);
  expect('sem dependências de desenvolvimento (tsx, typescript, drizzle-kit, esbuild, vite, pglite, @types)', part('dev'), []);
  expect('sem npm/npx/yarn/corepack no runtime', part('npm'), []);
  expect('código só leitura para o usuário do app; só a pasta de imagens gravável', part('write'), ['assets-ok']);
  expect('uid/gid 10001', part('id'), ['10001', '10001']);
  expect('comando de operação `ludraw` na imagem', part('cli').join(' '), 'LuDraw server CLI');

  section('Boot do dist compilado (regressão do yjs da R1)');
  // sem o `external: ['yjs']` do server/scripts/build.mjs o esbuild embutia o yjs CommonJS e o dist morria ao
  // carregar ("Dynamic require of lib0/observable"), antes de ler a configuração
  const boot = run('docker', ['run', '--rm', '-e', 'DATABASE_URL=postgres://ninguem@127.0.0.1:1/x', IMAGE]);
  expect('dist/index.js carrega todos os módulos e chega ao boot (falha só por não achar o banco)', [boot.code, /LuDraw server failed to start/.test(boot.err), /Dynamic require|Cannot find (module|package)/.test(boot.err)], [1, true, false]);
  const cliBoot = run('docker', ['run', '--rm', '--entrypoint', 'node', IMAGE, '-e', "import('/app/dist/cli.js').catch((e)=>{console.error(String(e));process.exit(3)})", 'help']);
  expect('dist/cli.js também carrega', [cliBoot.code, /Dynamic require|Cannot find/.test(cliBoot.err)], [0, false]);

  section('Recusas de produção (sem banco)');
  const outbox = run('docker', ['run', '--rm', '-e', 'DATABASE_URL=postgres://ninguem@127.0.0.1:1/x', '-e', 'LUDRAW_MAIL_OUTBOX_DIR=/tmp/out', '-e', 'LUDRAW_APP_URL=http://localhost', IMAGE]);
  expect('LUDRAW_MAIL_OUTBOX_DIR recusado em produção (não sobe)', [outbox.code, /LUDRAW_MAIL_OUTBOX_DIR is a development aid and is refused in production/.test(outbox.err)], [1, true]);
  const pglite = run('docker', ['run', '--rm', '-e', 'DATABASE_URL=pglite://memory', IMAGE]);
  expect('banco embutido de testes (pglite://) recusado em produção', [pglite.code, /pglite:\/\/ is the embedded test database and is refused in production/.test(pglite.err)], [1, true]);

  section('Compose: banco → migração → app');
  mkdirSync(join(WORK, 'deploy'), { recursive: true });
  cpSync(join(ROOT, 'docker-compose.yml'), join(WORK, 'docker-compose.yml'));
  cpSync(join(ROOT, 'deploy', 'postgres'), join(WORK, 'deploy', 'postgres'), { recursive: true });
  const secrets = run(process.execPath, [join(ROOT, 'scripts', 'docker-secrets.mjs'), '--dir', join(WORK, 'deploy', 'secrets')]);
  const secretFiles = readdirSync(join(WORK, 'deploy', 'secrets')).sort();
  expect('gerador de segredos cria os 8 arquivos (6 + Valkey opcional)', secretFiles, ['database_url', 'db_app_password', 'db_migrator_password', 'jwt_secret', 'migrate_database_url', 'postgres_password', 'redis_url', 'valkey_acl']);
  const secretValues = secretFiles.map((f) => readFileSync(join(WORK, 'deploy', 'secrets', f), 'utf8'));
  const passwordsOnly = secretValues.map((v) => v.replace(/^postgres:\/\/[a-z_]+:([0-9a-f]+)@.*$/, '$1'));
  expect('o gerador nunca imprime um valor', passwordsOnly.some((v) => secrets.out.includes(v)), false);
  writeFileSync(join(WORK, 'deploy', 'ludraw.env'), `LUDRAW_PUBLIC_URL=${BASE}\n`);
  mustCompose(['up', '-d', '--wait']);
  await waitReady('subir o compose');
  const states = mustCompose(['ps', '-a', '--format', '{{.Service}}={{.State}}:{{.ExitCode}}']).split(/\r?\n/).filter(Boolean).sort();
  expect('db e app de pé; migração terminou com 0', states.map((s) => s.replace(/:0$/, '').replace(/^(db|app)=running.*/, '$1=running')), ['app=running', 'db=running', 'migrate=exited']);
  const migrateLog = mustCompose(['logs', '--no-color', 'migrate']);
  expect('migração aplicou as migrações do repositório', /Applied \d+ migration\(s\)/.test(migrateLog), true);
  const dbLog = mustCompose(['logs', '--no-color', 'db']);
  expect('Postgres criou os papéis na primeira subida', dbLog.includes('LuDraw: database roles ready'), true);
  expect('nenhum ERROR no log do Postgres numa instalação nova', dbLog.split('\n').filter((l) => /\bERROR\b/.test(l)), []);
  const appId = mustCompose(['exec', '-T', 'app', 'id', '-u']).trim();
  expect('app roda como 10001 no compose', appId, '10001');
  const roleCheck = compose(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'ludraw', '-tAc',
    "select string_agg(rolname || ':' || rolsuper || ':' || has_database_privilege(rolname, 'ludraw', 'CREATE') || ':' || has_schema_privilege(rolname, 'public', 'CREATE'), ',' order by rolname) from pg_roles where rolname like 'ludraw_%'"]);
  // o migrador herda o dono (é assim que roda as migrações); o app, NOINHERIT e só DML, não cria nada
  expect('papéis: ninguém é superusuário; o app não tem CREATE no banco nem no esquema', roleCheck.out.trim(), 'ludraw_app:false:false:false,ludraw_migrator:false:true:true,ludraw_owner:false:true:true');

  section('App servido pela imagem (CSP e cabeçalhos)');
  const page = await call('GET', '/');
  const csp = page.headers.get('content-security-policy') ?? '';
  expect('página do app com CSP de hash, sem unsafe-eval, e COOP/CORP', [page.status, /script-src 'self' 'sha256-/.test(csp), csp.includes('unsafe-eval'), page.headers.get('cross-origin-opener-policy'), page.headers.get('cross-origin-resource-policy')], [200, true, false, 'same-origin', 'same-origin']);
  expect(`connect-src com o WebSocket da origem pública (${BASE.replace('http', 'ws')})`, csp.includes(`connect-src 'self' data: ${BASE.replace('http', 'ws')}`), true);
  const html = Buffer.from(page.bytes).toString('utf8');
  const script = /src="\.?\/?(assets\/[^"]+\.js)"/.exec(html)?.[1] ?? '';
  const js = await call('GET', `/${script}`);
  expect('script do app servido com cache imutável; o .map dele não existe', [js.status, js.headers.get('cache-control'), (await call('GET', `/${script}.map`)).status], [200, 'public, max-age=31536000, immutable', 404]);
  const station = await call('GET', '/ext/station.html');
  expect('documento isolado das extensões com a CSP própria', [station.status, (station.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'self'")], [200, true]);
  const infoRes = await call('GET', '/api/v1/info');
  expect('/info: versão 0.9.0 da raiz e primeiro acesso pendente', [infoRes.json?.version, infoRes.json?.setupRequired, infoRes.json?.realtime], [VERSION, true, true]);
  expect('/info: Sistema visual desligado na imagem (R5)', infoRes.json?.designSystem, false);

  section('Primeiro acesso, login (argon2 no Alpine), board com imagem');
  const appLog = mustCompose(['logs', '--no-color', 'app']);
  const token = /^\S*\s*\|?\s+([A-Z0-9]{5}(?:-[A-Z0-9]{5}){2,})\s*$/m.exec(appLog)?.[1] ?? null;
  expect('token do primeiro acesso aparece uma vez no log', token !== null && appLog.split(token).length === 2, true);
  const setup = await call('POST', '/api/v1/setup/complete', {
    json: { token, mode: 'single_org', organization: { name: 'Empresa Exemplo', allowedEmailDomains: [] }, admin: { name: 'Ana Admin', email: ADMIN_EMAIL, password: PASSWORD } },
  });
  expect('primeiro acesso concluído pela API', setup.status, 200);
  const access = await login();
  expect('login com senha (hash argon2 gravado e conferido no Alpine)', typeof access, 'string');
  const created = await call('POST', '/api/v1/boards', { token: access, json: { name: 'Board do Docker', place: { kind: 'workspace' }, data: { version: 1, elements: {}, elementOrder: [], gridSettings: { type: 'dots', size: 20, snap: false }, backgroundColor: null, initialView: null, activityLog: [], facilitation: { privateMode: { enabled: false, previewOwnNotes: false } } } } });
  const boardId = created.json?.board?.id as string;
  const upload = await call('POST', `/api/v1/boards/${boardId}/assets`, { token: access, body: PNG });
  const hash = upload.json?.hash as string;
  expect('imagem enviada vira arquivo no volume (sha256)', [upload.status, hash], [200, sha256(PNG)]);
  const rev = (await call('GET', `/api/v1/boards/${boardId}/revision`, { token: access })).json?.revision as number;
  const elements = {
    s1: { id: 's1', type: 'sticky', x: 0, y: 0, width: 200, height: 200, rotation: 0, zIndex: 1, createdAt: 1, updatedAt: 1, text: 'antes', color: '#FBED7C', tags: [], reactions: {} },
    i1: { id: 'i1', type: 'image', x: 300, y: 0, width: 10, height: 10, rotation: 0, zIndex: 2, createdAt: 1, updatedAt: 1, dataUrl: `asset:${hash}`, naturalWidth: 1, naturalHeight: 1 },
  };
  const put = await call('PUT', `/api/v1/boards/${boardId}/data`, { token: access, headers: { 'if-match': `"${rev}"` }, json: { version: 1, elements, elementOrder: ['s1', 'i1'], gridSettings: { type: 'dots', size: 20, snap: false }, backgroundColor: null, initialView: null, activityLog: [], facilitation: { privateMode: { enabled: false, previewOwnNotes: false } } } });
  expect('board salvo com a nota e a imagem', put.status, 200);

  section('Tempo real com o dist compilado (regressão do yjs da R1)');
  await realtimeRoundTrip(access, boardId, 'antes do backup', 'editado ao vivo no contêiner');

  section('E-mail sem navegador (mesma imagem, fora de produção, pasta de saída)');
  const net = `${PROJECT}_backend`;
  const secretMount = (name: string) => ['-v', `${join(WORK, 'deploy', 'secrets', name)}:/run/secrets/${name}:ro`];
  const mail = run('docker', ['run', '-d', '--name', `${PROJECT}-mail`, '--network', net, ...secretMount('database_url'),
    '-e', 'NODE_ENV=development', '-e', 'DATABASE_URL_FILE=/run/secrets/database_url', '-e', 'LUDRAW_MIGRATE_ON_BOOT=false',
    '-e', 'LUDRAW_MAIL_OUTBOX_DIR=/tmp/outbox', '-e', `LUDRAW_APP_URL=${BASE}`, '-e', 'LUDRAW_COLLAB=false', IMAGE]);
  expect('segunda instância (desenvolvimento) sobe no mesmo banco', mail.code, 0);
  let health = '';
  for (let i = 0; i < 60 && health !== '200'; i++) {
    await sleep(500);
    health = run('docker', ['exec', `${PROJECT}-mail`, 'node', '-e', "fetch('http://127.0.0.1:3001/health').then(r=>console.log(r.status),()=>console.log('x'))"]).out.trim();
  }
  const forgot = run('docker', ['exec', `${PROJECT}-mail`, 'node', '-e',
    `fetch('http://127.0.0.1:3001/api/v1/auth/password/forgot',{method:'POST',headers:{'content-type':'application/json','${CLIENT_HEADER}':'${CLIENT_HEADER_VALUE}'},body:JSON.stringify({email:'${ADMIN_EMAIL}'})}).then(r=>console.log(r.status))`]).out.trim();
  let eml = '';
  for (let i = 0; i < 40 && !eml; i++) {
    await sleep(250);
    eml = run('docker', ['exec', `${PROJECT}-mail`, 'sh', '-c', 'cat /tmp/outbox/*.eml 2>/dev/null']).out;
  }
  expect('"esqueci a senha" monta e grava o e-mail (nodemailer no Alpine)', [health, /^20\d$/.test(forgot), /^To: .*ana@example\.com/m.test(eml), eml.includes(`${BASE}/#/reset`) || eml.includes(`${BASE}/#/reset`.replace('#', '=23'))], ['200', true, true, true]);
  run('docker', ['rm', '-f', `${PROJECT}-mail`]);

  section('Pasta de imagens só leitura → o servidor não sobe');
  const ro = run('docker', ['run', '--name', `${PROJECT}-ro`, '--network', net, ...secretMount('database_url'), '-v', `${PROJECT}_assets:/data/assets:ro`, '-e', 'DATABASE_URL_FILE=/run/secrets/database_url', IMAGE]);
  expect('volume de imagens só leitura: boot recusado com o motivo', [ro.code, /notWritable: \/data\/assets \(EROFS\)/.test(ro.err)], [1, true]);
  run('docker', ['rm', '-f', `${PROJECT}-ro`]);

  section('Backup → apagar tudo → restaurar');
  const backupDir = join(WORK, 'backup');
  const bk = backupScript(['backup', '--out', backupDir]);
  expect('backup concluído', [bk.code, existsSync(join(backupDir, 'db.dump')), existsSync(join(backupDir, 'assets.tar'))], [0, true, true]);
  const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8'));
  expect('manifest com formato, versão, consistência e SHA-256 dos dois arquivos', [manifest.format, manifest.ludrawVersion, manifest.consistent, sha256(readFileSync(join(backupDir, 'db.dump'))) === manifest.files.db.sha256], ['ludraw-backup', VERSION, true, true]);
  await waitReady('o backup (o script para e religa o app)');
  expect('app voltou depois do backup', (await call('GET', '/health')).status, 200);
  const refused = backupScript(['restore', backupDir]);
  expect('restaurar sem --yes não mexe em nada', [refused.code, /--yes/.test(refused.err)], [2, true]);
  const tampered = join(WORK, 'backup-adulterado');
  cpSync(backupDir, tampered, { recursive: true });
  writeFileSync(join(tampered, 'assets.tar'), Buffer.concat([readFileSync(join(tampered, 'assets.tar')), Buffer.from('x')]));
  const bad = backupScript(['restore', tampered, '--yes']);
  expect('backup adulterado é recusado antes de qualquer mudança', [bad.code, /não confere/.test(bad.err)], [2, true]);

  // desastre: volumes E segredos perdidos (máquina nova); só a pasta do backup sobrou
  mustCompose(['down', '-v']);
  rmSync(join(WORK, 'deploy', 'secrets'), { recursive: true, force: true });
  run(process.execPath, [join(ROOT, 'scripts', 'docker-secrets.mjs'), '--dir', join(WORK, 'deploy', 'secrets')]);
  const volumes = run('docker', ['volume', 'ls', '-q', '--filter', `name=${PROJECT}_`]).out.trim();
  expect('volumes apagados antes da restauração', volumes, '');
  const rs = backupScript(['restore', backupDir, '--yes']);
  if (rs.code !== 0) process.stdout.write(rs.err.slice(-3000));
  expect('restauração com segredos novos concluída', rs.code, 0);
  await waitReady('a restauração (compose recriado)');
  const again = await login();
  expect('mesma senha entra depois da restauração', typeof again, 'string');
  const list = await call('GET', `/api/v1/boards/${boardId}/data`, { token: again });
  const data = list.json?.data ?? list.json;
  expect('board volta com a nota editada ao vivo e a imagem', [list.status, data?.elements?.s1?.text, data?.elements?.i1?.dataUrl], [200, 'editado ao vivo no contêiner', `asset:${hash}`]);
  const asset = await call('GET', `/api/v1/assets/${hash}`, { token: again });
  expect('imagem restaurada com o mesmo SHA-256', [asset.status, sha256(asset.bytes)], [200, sha256(PNG)]);
  expect('/info depois da restauração: configurado', (await call('GET', '/api/v1/info')).json?.setupRequired, false);
  await realtimeRoundTrip(again, boardId, 'depois da restauração', 'tempo real depois de restaurar');

  section('Valkey opcional (perfil "redis", Chat 09 · R4)');
  writeFileSync(join(WORK, 'deploy', 'ludraw.env'), `LUDRAW_PUBLIC_URL=${BASE}\nLUDRAW_REDIS_URL_FILE=/run/secrets/redis_url\n`);
  mustCompose(['--profile', 'redis', 'up', '-d', '--wait']);
  await waitReady('ligar o Valkey (app recriado)');
  const vkInfo = mustCompose(['--profile', 'redis', 'ps', '--format', '{{.Service}}={{.State}}']).split(/\r?\n/).filter(Boolean).sort();
  expect('Valkey de pé junto com o app (o app esperou o Valkey ficar saudável)', vkInfo.filter((s) => /^(app|valkey)=/.test(s)), ['app=running', 'valkey=running']);
  const vkId = mustCompose(['--profile', 'redis', 'ps', '-q', 'valkey']).trim();
  const vkInspect = JSON.parse(run('docker', ['inspect', vkId]).out)[0] as { Config: { User: string; Cmd: string[] }; HostConfig: { ReadonlyRootfs: boolean; CapDrop: string[] } };
  expect('Valkey sem root, raiz só leitura, sem capabilities, senha fora dos argumentos', [vkInspect.Config.User, vkInspect.HostConfig.ReadonlyRootfs, vkInspect.HostConfig.CapDrop, vkInspect.Config.Cmd.join(' ').includes(readFileSync(join(WORK, 'deploy', 'secrets', 'redis_url'), 'utf8').split(':')[2].split('@')[0])], ['999:1000', true, ['ALL'], false]);
  const vkLog = mustCompose(['--profile', 'redis', 'logs', '--no-color', 'app']);
  expect('o app usa o Valkey (log com o endereço, sem a senha)', [/use Redis\/Valkey at redis:\/\/valkey:6379/.test(vkLog), vkLog.includes(readFileSync(join(WORK, 'deploy', 'secrets', 'redis_url'), 'utf8'))], [true, false]);
  expect('login pelo app com Valkey (ioredis no Alpine)', typeof (await login()), 'string');
  mustCompose(['--profile', 'redis', 'stop', 'valkey']);
  await sleep(500);
  const vkDown = await call('POST', '/api/v1/auth/login', { json: { email: ADMIN_EMAIL, password: PASSWORD } });
  expect('Valkey parado: login responde 503 limitsUnavailable; o app continua de pé', [vkDown.status, vkDown.json?.error?.code, (await call('GET', '/health')).status], [503, 'limitsUnavailable', 200]);
  mustCompose(['--profile', 'redis', 'start', 'valkey']);
  await waitReady('religar o Valkey');
  let vkBack = 0;
  let vkLast = 'nenhuma tentativa';
  for (let i = 0; i < 60 && vkBack !== 200; i++) {
    await sleep(500);
    try {
      vkBack = (await call('POST', '/api/v1/auth/login', { json: { email: ADMIN_EMAIL, password: PASSWORD } })).status;
      vkLast = `HTTP ${vkBack}`;
    } catch (e) {
      vkLast = (e as Error).message;
    }
  }
  if (vkBack !== 200) process.stdout.write(`  Valkey de volta: último resultado ${vkLast}\n${appState()}\n`);
  expect('Valkey de volta: login volta sem reiniciar o app', vkBack, 200);
}

try {
  await main();
} catch (err) {
  failures.push(`erro: ${(err as Error).stack ?? String(err)}`);
  process.stdout.write(`\n--- estado do app ---\n${appState()}\n`);
  const logs = compose(['logs', '--no-color', '--tail', '60']);
  process.stdout.write(`\n--- logs do compose ---\n${logs.out.slice(-6000)}\n`);
} finally {
  cleanup();
}
process.stdout.write(`\n${passed} ok, ${failures.length} falha(s)\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.map((f) => `- ${f}`).join('\n')}\n`);
  process.exit(1);
}
