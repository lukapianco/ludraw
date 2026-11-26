/**
 * Chat 09 · R2 (pendência 6, D6) — "Baixar para o board" pelo servidor, com as defesas de SSRF:
 * endereço interno (direto, por nome, misturado, IPv6, mapeado, NAT64…), porta fora de 80/443, credenciais, esquema;
 * DNS FIXADO (a conexão vai ao IP conferido; mudar o DNS depois não leva a lugar nenhum); redirecionamento
 * REVALIDADO a cada salto; tamanho; tipo pelos bytes; tempo; rota com autenticação, permissão e limite.
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { checkRemoteTarget, fetchRemoteImage, type PinnedConnect, type PinnedTarget } from '../src/assets/remoteImage';
import type { HostLookup } from '../src/mail/hostGuard';
import { REMOTE_IMAGE_LIMIT } from '../src/context';
import { api, createBoard, emptyBoard, invitePerson, json, startConfigured, type Person } from './helpers';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const PUBLIC = '93.184.216.34';

/** Resposta falsa (status, cabeçalhos, corpo). */
function fakeResponse(status: number, headers: Record<string, string> = {}, body: Buffer | string = ''): IncomingMessage {
  const s = new PassThrough();
  Object.assign(s, { statusCode: status, headers });
  s.end(body);
  return s as unknown as IncomingMessage;
}

/** Conexão falsa que registra o alvo de cada salto e responde por endereço. */
function fakeConnect(routes: Record<string, () => IncomingMessage>): { connect: PinnedConnect; calls: PinnedTarget[] } {
  const calls: PinnedTarget[] = [];
  return {
    calls,
    connect: async (target) => {
      calls.push(target);
      const r = routes[target.url.href];
      if (!r) throw new Error(`sem rota: ${target.url.href}`);
      return r();
    },
  };
}

const lookupOf = (table: Record<string, string[]>): HostLookup & { count: Record<string, number> } => {
  const count: Record<string, number> = {};
  const fn = (async (host: string) => {
    count[host] = (count[host] ?? 0) + 1;
    const v = table[host];
    if (!v) throw new Error('ENOTFOUND');
    return v;
  }) as HostLookup & { count: Record<string, number> };
  fn.count = count;
  return fn;
};

test('SSRF: endereço interno é recusado — direto, IPv6, IPv4 mapeado, NAT64, metadados, por nome e misturado', async () => {
  const lookup = lookupOf({ 'rede.test': ['192.168.1.10'], 'misto.test': [PUBLIC, '10.0.0.7'], 'meta.test': ['169.254.169.254'], 'v6.test': ['fd00:ec2::254'] });
  for (const url of [
    'http://127.0.0.1/a.png',
    'http://interno-nao-existe.test/a.png',
    'http://10.0.0.5/a.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/a.png',
    'http://[::ffff:127.0.0.1]/a.png',
    'http://[::ffff:7f00:1]/a.png',
    'http://[64:ff9b::7f00:1]/a.png',
    'http://[fd00:ec2::254]/a.png',
    'http://[fe80::1]/a.png',
    'http://0.0.0.0/a.png',
    'http://rede.test/a.png',
    'http://misto.test/a.png',
    'http://meta.test/a.png',
    'http://v6.test/a.png',
  ]) {
    const r = await checkRemoteTarget(url, { lookup });
    assert.ok('reason' in r && (r.reason === 'blocked' || r.reason === 'failed'), `${url} → ${JSON.stringify(r)}`);
  }
});

test('SSRF: esquema, credenciais, porta fora de 80/443 e endereço longo demais são recusados', async () => {
  const lookup = lookupOf({ 'img.test': [PUBLIC] });
  const reason = async (url: string) => {
    const r = await checkRemoteTarget(url, { lookup });
    return 'reason' in r ? r.reason : 'ok';
  };
  assert.equal(await reason('ftp://img.test/a.png'), 'invalid');
  assert.equal(await reason('file:///etc/passwd'), 'invalid');
  assert.equal(await reason('data:image/png;base64,AAAA'), 'invalid');
  assert.equal(await reason('javascript:alert(1)'), 'invalid');
  assert.equal(await reason('http://user:pw@img.test/a.png'), 'invalid');
  assert.equal(await reason('http://img.test:8080/a.png'), 'blocked');
  assert.equal(await reason('https://img.test:22/a.png'), 'blocked');
  assert.equal(await reason(`https://img.test/${'a'.repeat(2100)}.png`), 'invalid');
  assert.equal(await reason('https://img.test:443/a.png'), 'ok', 'porta padrão escrita continua valendo');
  assert.equal(await reason('http://img.test/a.png'), 'ok');
});

test('DNS fixado (rebinding): o nome é resolvido UMA vez por salto e a conexão vai ao IP conferido', async () => {
  // a 1ª resposta é pública; se alguém resolvesse de novo, cairia num endereço interno
  let n = 0;
  const lookup: HostLookup = async () => (n++ === 0 ? [PUBLIC] : ['127.0.0.1']);
  const { connect, calls } = fakeConnect({ 'https://troca.test/a.png': () => fakeResponse(200, { 'content-type': 'image/png' }, PNG) });
  const r = await fetchRemoteImage('https://troca.test/a.png', { lookup, connect });
  assert.equal(r.ok, true);
  assert.equal(n, 1, 'uma resolução só');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ip, PUBLIC, 'conectou no IP conferido');
  assert.equal(calls[0].url.hostname, 'troca.test', 'o nome continua no Host/TLS');
});

test('DNS fixado na conexão REAL: o Node não resolve o nome (inexistente) — usa o IP fixado e manda o nome no Host', async () => {
  let host = '';
  const srv = createServer((req, res) => {
    host = String(req.headers.host);
    res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  try {
    // "nao-resolve.test" não existe em DNS nenhum: só chega ao servidor porque a conexão usa o IP fixado
    const r = await fetchRemoteImage(`http://nao-resolve.test:${port}/a.png`, { lookup: async () => ['127.0.0.1'], testAllowPrivate: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(host, `nao-resolve.test:${port}`);
    // sem a liberação de teste, o mesmo servidor local é recusado (interno e porta fora de 80/443)
    const blocked = await fetchRemoteImage(`http://nao-resolve.test:${port}/a.png`, { lookup: async () => ['127.0.0.1'] });
    assert.deepEqual(blocked, { ok: false, reason: 'blocked' });
  } finally {
    srv.close();
  }
});

test('Redirecionamento revalidado: cada salto passa de novo por todas as regras (interno, porta, esquema, novo DNS)', async () => {
  const lookup = lookupOf({ 'a.test': [PUBLIC], 'b.test': [PUBLIC], 'vira-interno.test': ['10.1.2.3'] });
  const go = (from: string, to: string) => fakeConnect({ [from]: () => fakeResponse(302, { location: to }) });
  for (const [to, why] of [
    ['http://127.0.0.1/x.png', 'IP interno'],
    ['http://169.254.169.254/latest', 'metadados'],
    ['http://vira-interno.test/x.png', 'nome que resolve interno'],
    ['http://b.test:6379/x.png', 'porta'],
    ['file:///etc/passwd', 'esquema'],
    ['http://user:pw@b.test/x.png', 'credenciais'],
  ] as const) {
    const { connect, calls } = go('https://a.test/a.png', to);
    const r = await fetchRemoteImage('https://a.test/a.png', { lookup, connect });
    assert.equal(r.ok, false, why);
    assert.equal(calls.length, 1, `${why}: não conectou no destino do redirecionamento`);
  }
  // relativo: resolvido sobre o salto atual, com DNS novo para o mesmo nome
  const rel = fakeConnect({
    'https://a.test/dir/a.png': () => fakeResponse(301, { location: '../img/b.png' }),
    'https://a.test/img/b.png': () => fakeResponse(200, {}, PNG),
  });
  const before = lookup.count['a.test'] ?? 0;
  const ok = await fetchRemoteImage('https://a.test/dir/a.png', { lookup, connect: rel.connect });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.hops, 1);
  assert.equal((lookup.count['a.test'] ?? 0) - before, 2, 'resolveu de novo no segundo salto');
  // mais de 3 saltos
  const loop = fakeConnect(Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`https://a.test/${i}.png`, () => fakeResponse(307, { location: `/${i + 1}.png` })])));
  assert.deepEqual(await fetchRemoteImage('https://a.test/0.png', { lookup, connect: loop.connect }), { ok: false, reason: 'failed' });
  assert.equal(loop.calls.length, 4, '1 + 3 redirecionamentos');
});

test('Tamanho, tipo pelos bytes, status e tempo', async () => {
  const lookup = lookupOf({ 'img.test': [PUBLIC] });
  const one = (res: () => IncomingMessage) => fakeConnect({ 'https://img.test/a.png': res }).connect;
  assert.deepEqual(await fetchRemoteImage('https://img.test/a.png', { lookup, connect: one(() => fakeResponse(200, { 'content-length': String(13 * 1024 * 1024) }, PNG)) }), { ok: false, reason: 'tooLarge' });
  assert.deepEqual(await fetchRemoteImage('https://img.test/a.png', { lookup, maxBytes: 32, connect: one(() => fakeResponse(200, {}, PNG)) }), { ok: false, reason: 'tooLarge' }, 'sem content-length: conta os bytes');
  assert.deepEqual(await fetchRemoteImage('https://img.test/a.png', { lookup, connect: one(() => fakeResponse(200, { 'content-type': 'image/png' }, '<html>não é imagem</html>')) }), { ok: false, reason: 'notImage' }, 'Content-Type mentiroso não vale');
  assert.deepEqual(await fetchRemoteImage('https://img.test/a.png', { lookup, connect: one(() => fakeResponse(404)) }), { ok: false, reason: 'failed' });
  const svg = await fetchRemoteImage('https://img.test/a.png', { lookup, connect: one(() => fakeResponse(200, { 'content-type': 'text/plain' }, '<svg xmlns="http://www.w3.org/2000/svg"/>')) });
  assert.equal(svg.ok && svg.type, 'image/svg+xml');
  const hang: PinnedConnect = (_t, signal) => new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new Error('abort'))));
  const t0 = Date.now();
  assert.deepEqual(await fetchRemoteImage('https://img.test/a.png', { lookup, connect: hang, timeoutMs: 200 }), { ok: false, reason: 'failed' });
  assert.ok(Date.now() - t0 < 2000);
});

async function routeScenario() {
  const { server, admin } = await startConfigured({}, (_app, ctx) => {
    ctx.remoteImage = {
      lookup: async (h) => (h === 'img.test' ? [PUBLIC] : h === 'interno.test' ? ['10.0.0.9'] : Promise.reject(new Error('ENOTFOUND'))),
      connect: async (t) => {
        if (t.url.pathname === '/grande.png') return fakeResponse(200, { 'content-length': String(13 * 1024 * 1024) }, PNG);
        if (t.url.pathname === '/pagina.html') return fakeResponse(200, { 'content-type': 'text/html' }, '<html></html>');
        return fakeResponse(200, { 'content-type': 'image/png' }, PNG);
      },
    };
  });
  const ana: Person = { token: admin.accessToken, id: admin.user.id };
  const caio = await invitePerson(server.app, ana, { email: 'caio@example.com', name: 'Caio Leitor' });
  const board = await createBoard(server.app, ana, { data: emptyBoard() });
  await api(server.app, ana).op({ type: 'setBoardMember', boardId: board.id, userId: caio.id, role: 'viewer' });
  const fetchAs = (who: Person | null, url: string, boardId = board.id) =>
    server.app.inject({ method: 'POST', url: `/api/v1/boards/${boardId}/assets/fetch`, payload: Buffer.from(url), headers: { 'content-type': 'application/octet-stream', ...(who ? { authorization: `Bearer ${who.token}` } : {}) } });
  return { server, ana, caio, board, fetchAs };
}

test('Rota: quem edita recebe os bytes (tipo pelos bytes, sandbox); interno/HTML/sem resposta = o MESMO erro; grande = 413', async () => {
  const { server, ana, fetchAs } = await routeScenario();
  try {
    const ok = await fetchAs(ana, 'https://img.test/foto.png');
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers['content-type'], 'image/png');
    assert.equal(ok.headers['content-security-policy'], "sandbox; default-src 'none'");
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal(ok.rawPayload.subarray(0, 8).toString('hex'), PNG.subarray(0, 8).toString('hex'));
    const bodies = [];
    for (const url of ['http://interno.test/a.png', 'http://127.0.0.1/a.png', 'https://img.test/pagina.html', 'https://nao-existe.test/a.png', 'http://img.test:8080/a.png']) {
      const r = await fetchAs(ana, url);
      assert.equal(r.statusCode, 422, url);
      bodies.push(r.body);
    }
    assert.equal(new Set(bodies).size, 1, 'mesma resposta: não serve de sonda da rede interna');
    assert.equal(json(await fetchAs(ana, 'http://127.0.0.1/a.png')).error.message.key, 'importexport.safety.urlImageFailed');
    const big = await fetchAs(ana, 'https://img.test/grande.png');
    assert.equal(big.statusCode, 413);
    assert.equal(json(big).error.code, 'remoteImageTooLarge');
    assert.equal((await fetchAs(ana, `https://img.test/${'a'.repeat(3000)}.png`)).statusCode, 413, 'corpo > 2 KB');
  } finally {
    await server.close();
  }
});

test('Rota: sem sessão 401, leitor 403, e limite por pessoa', async () => {
  const { server, ana, caio, fetchAs } = await routeScenario();
  try {
    assert.equal((await fetchAs(null, 'https://img.test/a.png')).statusCode, 401);
    assert.equal((await fetchAs(caio, 'https://img.test/a.png')).statusCode, 403);
    for (let i = 0; i < REMOTE_IMAGE_LIMIT.max; i++) assert.equal((await fetchAs(ana, 'https://img.test/a.png')).statusCode, 200, `pedido ${i + 1}`);
    const over = await fetchAs(ana, 'https://img.test/a.png');
    assert.equal(over.statusCode, 429);
    assert.ok(Number(over.headers['retry-after']) > 0);
  } finally {
    await server.close();
  }
});

test('A liberação de servidor de imagem local é só de desenvolvimento: em produção o boot recusa', async () => {
  const { loadConfig } = await import('../src/config');
  const base = { DATABASE_URL: 'pglite://memory', LUDRAW_PUBLIC_URL: 'https://draw.example.com' };
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', LUDRAW_DEV_REMOTE_IMAGE_ALLOW_LOCAL: 'true' }), /refused in production/);
  assert.equal(loadConfig({ ...base, LUDRAW_DEV_REMOTE_IMAGE_ALLOW_LOCAL: 'true' }).devRemoteImageAllowLocal, true);
  assert.equal(loadConfig(base).devRemoteImageAllowLocal, false);
});
