/**
 * Chat 09 · R4 (pendência 7, D10) — limites de tentativa no Redis/Valkey.
 *
 * Parte 1 (sempre): configuração (LUDRAW_REDIS_URL e _FILE), URL nunca no log/erro, boot recusado sem resposta.
 * Parte 2 (só com TEST_REDIS_URL de um Valkey DESCARTÁVEL): a mesma semântica do limitador em memória, operação por
 * operação; reservas simultâneas não passam do limite; `reserveAll` tudo ou nada; chave com hash (sem IP/e-mail em
 * claro); Redis fora do ar = erro na hora (sem fila) e, na rota, 503 `limitsUnavailable` — o resto do app continua.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config';
import { createLimiters } from '../src/context';
import { AttemptLimiter, LIMIT_KEY_PREFIX, LimiterUnavailableError, RedisLimiter, reserveAll, type Limiter } from '../src/lib/limiter';
import { connectRedis, describeRedisUrl, type RedisClient } from '../src/lib/redis';
import { clientHeaders, createBoard, json, startConfigured, STRONG_PASSWORD } from './helpers';

const REDIS_URL = process.env.TEST_REDIS_URL?.trim() || null;
const REDIS_ONLY = { skip: !REDIS_URL && 'só com TEST_REDIS_URL (Valkey descartável)' };
const BASE = { DATABASE_URL: 'pglite://memory' };

// ───────────────────────── Parte 1 — sempre ─────────────────────────

test('R4: LUDRAW_REDIS_URL — opcional, só redis:// ou rediss://, aceita _FILE; sem ela tudo em memória', () => {
  assert.equal(loadConfig(BASE).redisUrl, null);
  assert.equal(loadConfig({ ...BASE, LUDRAW_REDIS_URL: 'redis://valkey:6379' }).redisUrl, 'redis://valkey:6379');
  for (const bad of ['http://valkey:6379', 'valkey:6379', 'redis://', 'redis://a b']) {
    assert.throws(() => loadConfig({ ...BASE, LUDRAW_REDIS_URL: bad }), /LUDRAW_REDIS_URL must be a redis:\/\/ or rediss:\/\/ URL/, bad);
  }
  const dir = mkdtempSync(join(tmpdir(), 'od-redis-'));
  try {
    writeFileSync(join(dir, 'redis_url'), 'redis://default:segredo-do-arquivo@valkey:6379\n');
    assert.equal(loadConfig({ ...BASE, LUDRAW_REDIS_URL_FILE: join(dir, 'redis_url') }).redisUrl, 'redis://default:segredo-do-arquivo@valkey:6379');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // sem Redis: os limitadores são os de memória, de sempre
  const limiters = createLimiters(null);
  assert.ok(Object.values(limiters).every((l) => l instanceof AttemptLimiter));
  assert.equal(Object.keys(limiters).length, 17);
});

test('R4: a URL do Redis nunca aparece com a senha (log e erro de boot); sem resposta, o servidor não sobe', async () => {
  assert.equal(describeRedisUrl('redis://default:segredo-xyz@valkey.interno:6390/2'), 'redis://valkey.interno:6390');
  assert.equal(describeRedisUrl('rediss://:segredo-xyz@cache.example.com'), 'rediss://cache.example.com');
  const started = Date.now();
  await assert.rejects(connectRedis('redis://default:segredo-xyz@127.0.0.1:1'), (err: Error) => {
    assert.match(err.message, /^LUDRAW_REDIS_URL is set but Redis\/Valkey at redis:\/\/127\.0\.0\.1:1 did not answer \(/);
    assert.match(err.message, /The server does not start without it/);
    assert.doesNotMatch(err.message, /segredo-xyz/);
    return true;
  });
  assert.ok(Date.now() - started < 8000, 'falha em poucos segundos (connectTimeout)');
});

// ───────────────────────── Parte 2 — Valkey descartável ─────────────────────────

async function client(): Promise<RedisClient> {
  const c = await connectRedis(REDIS_URL as string);
  await c.flushdb();
  return c;
}

/** Roda a mesma sequência no limitador de memória e no do Redis e compara resultado por resultado. */
async function sameAs(memory: Limiter, redis: Limiter, steps: [op: 'hit' | 'check' | 'reserve' | 'release' | 'reset', key: string][]) {
  for (const [i, [op, key]] of steps.entries()) {
    const a = await memory[op](key);
    const b = await redis[op](key);
    const norm = (r: unknown) => (r && typeof r === 'object' ? { ...(r as object), retryAfterMs: (r as { retryAfterMs: number }).retryAfterMs > 0 ? 'espera' : 0 } : r);
    assert.deepEqual(norm(b), norm(a), `passo ${i + 1}: ${op}(${key})`);
  }
}

test('R4: Redis — mesma semântica do limitador em memória (hit, check, reserve, release, reset)', REDIS_ONLY, async () => {
  const c = await client();
  try {
    const memory = new AttemptLimiter(3, 60_000);
    const redis = new RedisLimiter(c, 'semantica', 3, 60_000);
    await sameAs(memory, redis, [
      ['check', 'a'], ['hit', 'a'], ['hit', 'a'], ['hit', 'a'], ['check', 'a'], ['hit', 'a'], ['hit', 'a'], ['reset', 'a'], ['check', 'a'],
      ['reserve', 'b'], ['reserve', 'b'], ['reserve', 'b'], ['reserve', 'b'], ['release', 'b'], ['reserve', 'b'], ['reserve', 'b'],
      ['release', 'c'], ['reserve', 'c'], ['release', 'c'], ['release', 'c'], ['check', 'c'], ['reserve', 'c'],
    ]);
    // a recusa informa quanto falta para a janela acabar (≤ janela)
    const refused = await redis.reserve('b');
    assert.equal(refused.allowed, false);
    assert.ok(refused.retryAfterMs > 0 && refused.retryAfterMs <= 60_000);
  } finally {
    c.disconnect();
  }
});

test('R4: Redis — janela acaba sozinha; chave com hash (sem IP nem e-mail em claro)', REDIS_ONLY, async () => {
  const c = await client();
  try {
    const l = new RedisLimiter(c, 'janela', 1, 300);
    assert.equal((await l.hit('ana@example.com|203.0.113.9')).allowed, true);
    assert.equal((await l.hit('ana@example.com|203.0.113.9')).allowed, false);
    const keys = await c.keys(`${LIMIT_KEY_PREFIX}*`);
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^ludraw:limit:janela:[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(keys[0], /ana|example|203\.0/);
    const ttl = await c.pttl(keys[0]);
    assert.ok(ttl > 0 && ttl <= 300, 'toda chave expira');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal((await l.hit('ana@example.com|203.0.113.9')).allowed, true, 'janela nova');
  } finally {
    c.disconnect();
  }
});

test('R4: Redis — 40 reservas simultâneas: passam exatamente as do limite (atômico, sem ler-e-gravar)', REDIS_ONLY, async () => {
  const c = await client();
  try {
    const l = new RedisLimiter(c, 'corrida', 7, 60_000);
    const results = await Promise.all(Array.from({ length: 40 }, () => l.reserve('mesma-chave')));
    assert.equal(results.filter((r) => r.allowed).length, 7);
    assert.deepEqual(results.filter((r) => r.allowed).map((r) => r.count).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  } finally {
    c.disconnect();
  }
});

test('R4: Redis — reserveAll é tudo ou nada (login: IP, IP+e-mail, e-mail) e informa qual recusou', REDIS_ONLY, async () => {
  const c = await client();
  try {
    const ip = new RedisLimiter(c, 'ip', 10, 60_000);
    const account = new RedisLimiter(c, 'conta', 2, 60_000);
    const email = new RedisLimiter(c, 'email', 10, 60_000);
    const slots = [{ limiter: ip, key: '203.0.113.1' }, { limiter: account, key: '203.0.113.1|ana' }, { limiter: email, key: 'ana' }];
    const first = await reserveAll(slots);
    assert.deepEqual(first, { ok: true, results: [1, 1, 1].map((count) => ({ allowed: true, retryAfterMs: 0, count })) });
    assert.equal((await reserveAll(slots)).ok, true);
    const third = await reserveAll(slots);
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.slot, slots[1], 'a recusa aponta o limite de IP+e-mail');
    // nada foi contado na recusa: IP e e-mail continuam em 2
    assert.equal((await ip.reserve('203.0.113.1')).count, 3);
    assert.equal((await email.reserve('ana')).count, 3);
    // misturar memória e Redis é erro de programação
    await assert.rejects(reserveAll([{ limiter: ip, key: 'x' }, { limiter: new AttemptLimiter(1, 1000), key: 'x' }]), /cannot be mixed/);
  } finally {
    c.disconnect();
  }
});

test('R4: Redis fora do ar — erro na hora (sem fila); login responde 503 limitsUnavailable; o resto do app continua', REDIS_ONLY, async () => {
  const c = await client();
  const { server, admin } = await startConfigured();
  try {
    server.ctx.limiters = createLimiters(server.ctx.config.mailEnv, c);
    const login = () => server.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'ana@example.com', password: STRONG_PASSWORD } });
    assert.equal((await login()).statusCode, 200, 'com o Redis no ar');
    const board = await createBoard(server.app, admin.accessToken);
    c.disconnect();
    const started = Date.now();
    await assert.rejects(Promise.resolve(server.ctx.limiters.loginIp.hit('x')), LimiterUnavailableError);
    assert.ok(Date.now() - started < 1000, 'sem esperar reconexão');
    const down = await login();
    assert.equal(down.statusCode, 503);
    assert.equal(down.headers['retry-after'], '5');
    assert.deepEqual(json(down).error.code, 'limitsUnavailable');
    assert.equal(json(down).error.message.key, 'server.errors.limitsUnavailable');
    // rotas sem limite de tentativa seguem funcionando
    assert.equal((await server.app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
    const data = await server.app.inject({ method: 'GET', url: `/api/v1/boards/${board.id}/data`, headers: { authorization: `Bearer ${admin.accessToken}` } });
    assert.equal(data.statusCode, 200);
    const forgot = await server.app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', headers: clientHeaders, payload: { email: 'ana@example.com' } });
    assert.equal(forgot.statusCode, 503, 'e-mail também fecha');
  } finally {
    c.disconnect();
    await server.close();
  }
});
