/**
 * LuDraw — Conexão host ↔ extensão (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §5.3 e §5.6).
 *
 * Uma conexão por Worker (lógica) ou iframe (painel). Responsabilidades:
 * - validar TODA mensagem recebida (`parseExtensionMessage`) e aplicar o limite de taxa;
 * - despachar pedidos para o handler fixo da API (nunca executa texto recebido);
 * - chamadas host → extensão com timeout de 5 s (estourou = kill-switch);
 * - heartbeat (só Worker): sem `pong` em 5 s = extensão travada → `terminate()`.
 */
import { parseExtensionMessage, RateLimiter, RPC_LIMITS, type ApiMethod, type CallKind, type HostMessage } from './protocol';

export interface Port {
  post(msg: HostMessage, transfer?: Transferable[]): void;
  /** encerra de verdade (Worker: `terminate()`; painel: remove o iframe) */
  close(): void;
}

export type KillReason = 'timeout' | 'unresponsive' | 'flood' | 'stopped' | 'error';

export interface ConnectionOptions {
  port: Port;
  /** heartbeat ligado (Worker) */
  heartbeat: boolean;
  onRequest: (method: ApiMethod, params: Record<string, unknown> | undefined) => Promise<unknown>;
  onKilled: (reason: KillReason) => void;
  onReady?: () => void;
  now?: () => number;
}

export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

export class ExtensionConnection {
  private readonly opts: ConnectionOptions;
  private readonly limiter: RateLimiter;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;
  private violations = 0;
  private dead = false;
  private beat: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private pingN = 0;
  private readyFlag = false;

  constructor(opts: ConnectionOptions) {
    this.opts = opts;
    const now = opts.now ?? (() => Date.now());
    this.limiter = new RateLimiter(RPC_LIMITS.ratePerSecond, now());
    this.lastPong = now();
    if (opts.heartbeat) {
      this.beat = setInterval(() => {
        const t = now();
        if (t - this.lastPong > RPC_LIMITS.heartbeatTimeoutMs) return this.kill('unresponsive');
        this.send({ v: 1, t: 'ping', n: ++this.pingN });
      }, RPC_LIMITS.heartbeatMs);
    }
  }

  get alive(): boolean {
    return !this.dead;
  }

  get ready(): boolean {
    return this.readyFlag;
  }

  send(msg: HostMessage, transfer?: Transferable[]): void {
    if (this.dead) return;
    try {
      this.opts.port.post(msg, transfer);
    } catch {
      this.kill('error');
    }
  }

  /** Chamada host → extensão (comando, colagem, importação, exportação), com timeout e kill-switch. */
  call(kind: CallKind, target: string, payload?: unknown, transfer?: Transferable[]): Promise<unknown> {
    if (this.dead) return Promise.reject(new ApiError('stopped', 'extension stopped'));
    if (this.pending.size >= RPC_LIMITS.maxPendingCalls) return Promise.reject(new ApiError('busy', 'too many pending calls'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ApiError('timeout', 'extension did not answer in time'));
        this.kill('timeout');
      }, RPC_LIMITS.callTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ v: 1, t: 'call', id, kind, target, payload }, transfer);
    });
  }

  /** Chegou algo da extensão. Inválido → descartado (e contado). */
  receive(data: unknown): void {
    if (this.dead) return;
    const now = this.opts.now?.() ?? Date.now();
    if (!this.limiter.take(now)) {
      if (++this.violations > RPC_LIMITS.maxRateViolations) this.kill('flood');
      return;
    }
    const parsed = parseExtensionMessage(data);
    if (!parsed.ok) {
      if (++this.violations > RPC_LIMITS.maxRateViolations) this.kill('flood');
      return;
    }
    const msg = parsed.msg;
    if (msg.t === 'pong') {
      this.lastPong = now;
      return;
    }
    if (msg.t === 'res') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new ApiError('extension', msg.error));
      return;
    }
    // pedido da extensão
    if (msg.method === 'runtime.ready') {
      this.readyFlag = true;
      this.opts.onReady?.();
      this.send({ v: 1, t: 'res', id: msg.id, ok: true });
      return;
    }
    this.opts
      .onRequest(msg.method, msg.params)
      .then((value) => this.send({ v: 1, t: 'res', id: msg.id, ok: true, value }))
      .catch((err: unknown) => {
        const code = err instanceof ApiError ? err.code : 'error';
        const message = err instanceof Error ? err.message : String(err);
        this.send({ v: 1, t: 'res', id: msg.id, ok: false, error: message.slice(0, 500), code });
      });
  }

  /** Kill-switch: encerra a extensão e rejeita o que estava pendente. */
  kill(reason: KillReason): void {
    if (this.dead) return;
    this.dead = true;
    if (this.beat) clearInterval(this.beat);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new ApiError('stopped', 'extension stopped'));
    }
    this.pending.clear();
    try {
      this.opts.port.close();
    } catch {
      /* já encerrado */
    }
    if (reason !== 'stopped') this.opts.onKilled(reason);
  }
}
