/**
 * LuDraw server — Redis/Valkey opcional (Chat 09 · R4, pendência 7). Só com LUDRAW_REDIS_URL(_FILE).
 *
 * Para que serve: várias instâncias do servidor atrás de um balanceador dividem
 *   - os limites de tentativa (login, e-mail, tokens, links públicos…) — `RedisLimiter`;
 *   - o teto geral por IP do @fastify/rate-limit;
 *   - o aviso "o painel de e-mail mudou, recarregue" (pub/sub, sem segredo na mensagem).
 * O tempo real (salas do Hocuspocus) continua numa instância só — ver docs/DOCKER.md.
 *
 * Regras (decisão D10):
 *   - Configurado e fora do ar no boot → o servidor NÃO sobe (mensagem clara, sem a senha da URL).
 *   - Caiu com o servidor rodando → os comandos falham na hora (sem fila) e as rotas com limite respondem 503
 *     (`limitsUnavailable`); nada é liberado sem contar. O teto geral por IP deixa passar (as rotas sensíveis já
 *     fecham sozinhas) e o resto do app (boards, tempo real) continua. O cliente reconecta sozinho.
 */
import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { LIMIT_SCRIPTS, type LimitScripts } from './limiter';

export interface RedisLog {
  info(msg: string): void;
  warn(msg: string): void;
}

/** Só o tipo e o endereço (host:porta) — a URL pode ter senha e nunca vai para log nem mensagem de erro. */
export function describeRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '(invalid URL)';
  }
}

export const REDIS_OPTIONS = {
  lazyConnect: true,
  // sem fila: com o Redis fora do ar o comando falha na hora e a rota responde 503 (não fica pendurada)
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  commandTimeout: 2000,
  // reconecta para sempre, com espera crescente até 5 s
  retryStrategy: (times: number) => Math.min(200 * times, 5000),
} as const;

export type RedisClient = Redis & LimitScripts;

/** Conecta e confere com PING; falhou → erro de boot (o servidor não sobe). */
export async function connectRedis(url: string): Promise<RedisClient> {
  const client = new Redis(url, REDIS_OPTIONS) as RedisClient;
  // sem ouvinte, o ioredis imprime cada falha de reconexão; o estado é logado por watchRedis()
  client.on('error', () => undefined);
  for (const [name, def] of Object.entries(LIMIT_SCRIPTS)) client.defineCommand(name, { lua: def.lua, ...('numberOfKeys' in def ? { numberOfKeys: def.numberOfKeys } : {}) });
  try {
    await client.connect();
    await client.ping();
  } catch (err) {
    client.disconnect();
    const code = (err as { code?: string }).code ?? (err as Error).name ?? 'error';
    throw new Error(`LUDRAW_REDIS_URL is set but Redis/Valkey at ${describeRedisUrl(url)} did not answer (${code}). The server does not start without it; fix the address or remove the variable to keep the limits in memory (one instance).`);
  }
  return client;
}

/** Loga quando a conexão cai e volta (uma linha por mudança, sem a URL). */
export function watchRedis(client: Redis, log: RedisLog): void {
  let down = false;
  client.on('close', () => {
    if (down) return;
    down = true;
    log.warn('Redis/Valkey connection lost: routes with attempt limits answer 503 until it is back (reconnecting).');
  });
  client.on('ready', () => {
    if (!down) return;
    down = false;
    log.info('Redis/Valkey connection restored.');
  });
}

/** Canal de avisos entre instâncias. A mensagem leva só o evento e quem mandou — nunca dados nem segredo. */
export const CLUSTER_CHANNEL = 'ludraw:events';
export type ClusterEvent = 'mail-settings';

export class ClusterEvents {
  readonly instanceId = randomBytes(8).toString('hex');
  private subscriber: Redis | null = null;

  constructor(private readonly client: Redis) {}

  /** Avisa as outras instâncias. Redis fora do ar: o aviso se perde (cada uma recarrega ao reconectar). */
  async announce(event: ClusterEvent): Promise<void> {
    await this.client.publish(CLUSTER_CHANNEL, JSON.stringify({ from: this.instanceId, event })).catch(() => undefined);
  }

  /**
   * Escuta os avisos das OUTRAS instâncias. Depois de uma queda, chama todos os tratadores uma vez (algum aviso pode ter
   * se perdido enquanto o Redis estava fora).
   */
  async listen(handlers: Record<ClusterEvent, () => Promise<unknown>>, log: RedisLog): Promise<void> {
    const sub = this.client.duplicate();
    sub.on('error', () => undefined);
    this.subscriber = sub;
    const runAll = () => {
      for (const h of Object.values(handlers)) void h().catch(() => log.warn('cluster event handler failed'));
    };
    let lost = false;
    sub.on('close', () => {
      lost = true;
    });
    sub.on('ready', () => {
      if (!lost) return;
      lost = false;
      runAll();
    });
    sub.on('message', (_channel: string, raw: string) => {
      let msg: { from?: unknown; event?: unknown };
      try {
        msg = JSON.parse(raw) as typeof msg;
      } catch {
        return;
      }
      if (msg.from === this.instanceId || typeof msg.event !== 'string' || !(msg.event in handlers)) return;
      void handlers[msg.event as ClusterEvent]().catch(() => log.warn(`cluster event "${String(msg.event)}" failed`));
    });
    if (sub.status === 'wait') await sub.connect();
    await sub.subscribe(CLUSTER_CHANNEL);
  }

  async close(): Promise<void> {
    this.subscriber?.disconnect();
    this.subscriber = null;
  }
}
