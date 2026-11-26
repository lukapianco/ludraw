/**
 * LuDraw server — limite de tentativas (Chat 07), janela fixa por chave.
 * Em memória (`AttemptLimiter`, padrão): vale por instância. Chat 09 · R4: com LUDRAW_REDIS_URL, o `RedisLimiter`
 * guarda as contagens no Redis/Valkey e o limite vale para todas as instâncias juntas (mesma semântica).
 *
 * Chat 08.7 · R3 (S-04): para tentativas que fazem trabalho caro (senha com argon2, token), use `reserve()` ANTES do
 * trabalho e `release()`/`reset()` só no sucesso. `reserve` confere e conta na MESMA operação síncrona — pedidos
 * simultâneos não passam todos (com `check()` → await → `hit()`, passavam).
 */
import { createHash } from 'node:crypto';

export interface LimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface ReserveResult extends LimitResult {
  /** tentativas contadas nesta janela, incluindo esta (0 quando recusada) */
  count: number;
}

export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(
    readonly max: number,
    readonly windowMs: number,
    /** relógio (os testes passam um controlado) */
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Conta uma tentativa. `allowed: false` quando já passou do limite nesta janela. */
  hit(key: string, now = this.clock()): LimitResult {
    this.sweep(now);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    cur.count++;
    if (cur.count > this.max) return { allowed: false, retryAfterMs: cur.resetAt - now };
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Só consulta (sem contar). */
  check(key: string, now = this.clock()): LimitResult {
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now || cur.count < this.max) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: cur.resetAt - now };
  }

  /** Reserva uma tentativa: conta se ainda há vaga nesta janela; sem vaga, não conta e recusa. */
  reserve(key: string, now = this.clock()): ReserveResult {
    this.sweep(now);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0, count: 1 };
    }
    if (cur.count >= this.max) return { allowed: false, retryAfterMs: cur.resetAt - now, count: 0 };
    cur.count++;
    return { allowed: true, retryAfterMs: 0, count: cur.count };
  }

  /** Devolve uma reserva (a tentativa deu certo e não deve contar). */
  release(key: string, now = this.clock()): void {
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) return;
    cur.count = Math.max(0, cur.count - 1);
    if (cur.count === 0) this.hits.delete(key);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

type MaybePromise<T> = T | Promise<T>;

/**
 * Chat 09 · R4 — o que as rotas usam: o limitador em memória (`AttemptLimiter`, síncrono) ou o compartilhado no
 * Redis/Valkey (`RedisLimiter`, assíncrono). Quem chama sempre usa `await` (vale para os dois).
 */
export interface Limiter {
  readonly max: number;
  readonly windowMs: number;
  hit(key: string): MaybePromise<LimitResult>;
  check(key: string): MaybePromise<LimitResult>;
  reserve(key: string): MaybePromise<ReserveResult>;
  release(key: string): MaybePromise<void>;
  reset(key: string): MaybePromise<void>;
}

/** O armazenamento compartilhado dos limites (Redis/Valkey) não respondeu: a rota responde 503, nunca libera. */
export class LimiterUnavailableError extends Error {
  constructor(readonly detail: string) {
    super(`attempt limits unavailable (${detail})`);
  }
}

/** O que o RedisLimiter precisa do cliente (o `ioredis` atende; os testes podem passar um falso). */
export interface LimitScripts {
  odLimitHit(key: string, max: number, windowMs: number): Promise<[number, number, number]>;
  odLimitCheck(key: string, max: number): Promise<[number, number]>;
  odLimitReserve(...args: (string | number)[]): Promise<number[]>;
  odLimitRelease(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

/**
 * Scripts Lua (atômicos no Redis/Valkey), com a MESMA semântica do AttemptLimiter: janela fixa que começa na primeira
 * tentativa; `hit` conta sempre; `reserve` só conta se houver vaga; `release` devolve uma; `reset` apaga.
 * O `reserve` recebe N chaves e reserva todas ou nenhuma (o `reserveAll` do login vira uma operação só).
 */
export const LIMIT_SCRIPTS = {
  odLimitHit: {
    numberOfKeys: 1,
    lua: `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[2]); ttl = tonumber(ARGV[2]) end
if c > tonumber(ARGV[1]) then return {0, ttl, c} end
return {1, 0, c}`,
  },
  odLimitCheck: {
    numberOfKeys: 1,
    lua: `local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c < tonumber(ARGV[1]) then return {1, 0} end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then return {1, 0} end
return {0, ttl}`,
  },
  // KEYS[1..n]; ARGV = max1, janela1, max2, janela2, … → {1, contagem1, …} ou {0, índice recusado, ms para tentar de novo}
  odLimitReserve: {
    lua: `for i = 1, #KEYS do
  local c = tonumber(redis.call('GET', KEYS[i]) or '0')
  if c >= tonumber(ARGV[2 * i - 1]) then
    local ttl = redis.call('PTTL', KEYS[i])
    if ttl < 0 then ttl = 0 end
    return {0, i, ttl}
  end
end
local out = {1}
for i = 1, #KEYS do
  local c = redis.call('INCR', KEYS[i])
  if c == 1 or redis.call('PTTL', KEYS[i]) < 0 then redis.call('PEXPIRE', KEYS[i], ARGV[2 * i]) end
  out[#out + 1] = c
end
return out`,
  },
  odLimitRelease: {
    numberOfKeys: 1,
    lua: `if not redis.call('GET', KEYS[1]) then return 0 end
local n = redis.call('DECR', KEYS[1])
if n <= 0 then redis.call('DEL', KEYS[1]) end
return n`,
  },
} as const;

/** Prefixo das chaves; a parte variável (IP, e-mail…) vai como hash, nunca em claro no Redis. */
export const LIMIT_KEY_PREFIX = 'ludraw:limit:';

/** Chat 09 · R4 — limitador compartilhado entre instâncias (Redis/Valkey). Falha do Redis → LimiterUnavailableError. */
export class RedisLimiter implements Limiter {
  constructor(
    readonly scripts: LimitScripts,
    readonly name: string,
    readonly max: number,
    readonly windowMs: number,
  ) {}

  keyOf(key: string): string {
    return `${LIMIT_KEY_PREFIX}${this.name}:${createHash('sha256').update(key).digest('base64url')}`;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new LimiterUnavailableError((err as { code?: string; name?: string }).code ?? (err as Error).name ?? 'error');
    }
  }

  async hit(key: string): Promise<LimitResult> {
    const [ok, ttl] = await this.run(() => this.scripts.odLimitHit(this.keyOf(key), this.max, this.windowMs));
    return ok === 1 ? { allowed: true, retryAfterMs: 0 } : { allowed: false, retryAfterMs: Number(ttl) };
  }

  async check(key: string): Promise<LimitResult> {
    const [ok, ttl] = await this.run(() => this.scripts.odLimitCheck(this.keyOf(key), this.max));
    return ok === 1 ? { allowed: true, retryAfterMs: 0 } : { allowed: false, retryAfterMs: Number(ttl) };
  }

  async reserve(key: string): Promise<ReserveResult> {
    const r = await this.run(() => this.scripts.odLimitReserve(1, this.keyOf(key), this.max, this.windowMs));
    return r[0] === 1 ? { allowed: true, retryAfterMs: 0, count: Number(r[1]) } : { allowed: false, retryAfterMs: Number(r[2]), count: 0 };
  }

  async release(key: string): Promise<void> {
    await this.run(() => this.scripts.odLimitRelease(this.keyOf(key)));
  }

  async reset(key: string): Promise<void> {
    await this.run(() => this.scripts.del(this.keyOf(key)));
  }
}

export interface Slot {
  limiter: Limiter;
  key: string;
}

/**
 * Reserva várias vagas de uma vez, tudo ou nada. Em memória: sem `await` no meio (pedidos simultâneos não se
 * intercalam). No Redis: um script só, atômico. Se alguma faltar, nada fica reservado e a resposta diz qual recusou.
 */
export async function reserveAll(slots: readonly Slot[]): Promise<{ ok: true; results: ReserveResult[] } | { ok: false; slot: Slot; result: ReserveResult }> {
  if (slots.length && slots.every((s) => s.limiter instanceof RedisLimiter)) {
    const first = slots[0].limiter as RedisLimiter;
    if (!slots.every((s) => (s.limiter as RedisLimiter).scripts === first.scripts)) throw new Error('reserveAll: slots on different Redis clients');
    const args: (string | number)[] = [slots.length];
    for (const s of slots) args.push((s.limiter as RedisLimiter).keyOf(s.key));
    for (const s of slots) args.push(s.limiter.max, s.limiter.windowMs);
    let r: number[];
    try {
      r = await first.scripts.odLimitReserve(...args);
    } catch (err) {
      throw new LimiterUnavailableError((err as { code?: string; name?: string }).code ?? (err as Error).name ?? 'error');
    }
    if (r[0] !== 1) return { ok: false, slot: slots[Number(r[1]) - 1], result: { allowed: false, retryAfterMs: Number(r[2]), count: 0 } };
    return { ok: true, results: slots.map((_, i) => ({ allowed: true, retryAfterMs: 0, count: Number(r[i + 1]) })) };
  }
  if (!slots.every((s) => s.limiter instanceof AttemptLimiter)) throw new Error('reserveAll: memory and Redis limiters cannot be mixed');
  return reserveAllInMemory(slots as readonly { limiter: AttemptLimiter; key: string }[]);
}

function reserveAllInMemory(slots: readonly { limiter: AttemptLimiter; key: string }[]): { ok: true; results: ReserveResult[] } | { ok: false; slot: Slot; result: ReserveResult } {
  const taken: { limiter: AttemptLimiter; key: string }[] = [];
  const results: ReserveResult[] = [];
  for (const slot of slots) {
    const result = slot.limiter.reserve(slot.key);
    if (!result.allowed) {
      for (const t of taken) t.limiter.release(t.key);
      return { ok: false, slot, result };
    }
    taken.push(slot);
    results.push(result);
  }
  return { ok: true, results };
}
