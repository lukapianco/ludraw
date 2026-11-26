/**
 * LuDraw — Protocolo RPC entre o host e as extensões programáveis (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §5.3).
 *
 * PURO (sem DOM, sem store): roda no navegador e no Node (`npm run test:extensions`).
 *
 * - Uma única ponte: `postMessage` com mensagens versionadas (`v: 1`).
 * - O host valida TODA mensagem que chega da extensão: objeto simples, tipo conhecido, id inteiro,
 *   método da allowlist, tamanho ≤ 2 MB e taxa ≤ 60 mensagens/s. Mensagem inválida é descartada.
 * - Nada recebido é executado: o host só despacha para funções fixas (`api.ts`). Sem `eval`/`Function`.
 */
import type { ExtensionPermission } from '../types';

export const RPC_VERSION = 1;

export const RPC_LIMITS = {
  /** tamanho máximo de uma mensagem vinda da extensão (JSON) */
  maxMessageBytes: 2 * 1024 * 1024,
  /** mensagens por segundo (média; rajada até o mesmo número) */
  ratePerSecond: 60,
  /** tempo máximo de uma chamada host → extensão (comando, importação, exportação, colagem) */
  callTimeoutMs: 5000,
  /** intervalo do heartbeat e tempo máximo sem resposta antes do kill-switch */
  heartbeatMs: 2000,
  heartbeatTimeoutMs: 5000,
  /** mensagens descartadas por excesso de taxa antes de encerrar a extensão */
  maxRateViolations: 300,
  maxPendingCalls: 64,
} as const;

/** Métodos que a extensão pode chamar no host e a permissão exigida (null = sempre permitido). */
export const API_METHODS = {
  'runtime.ready': null,
  'board.getSelection': 'board.read',
  'board.getElements': 'board.read',
  'board.subscribe': 'board.read',
  'board.addElements': 'board.write',
  'board.updateElements': 'board.write',
  'board.deleteElements': 'board.write',
  'ui.registerCommand': 'ui.command',
  'ui.showPanel': 'ui.panel',
  'ui.notify': null,
  'clipboard.onPaste': 'clipboard.paste',
  'files.onImport': 'files.import',
  'files.onExport': 'files.export',
  'files.offerDownload': 'files.export',
  'storage.get': 'storage',
  'storage.set': 'storage',
  'network.fetch': 'network',
} as const satisfies Record<string, ExtensionPermission | null>;

export type ApiMethod = keyof typeof API_METHODS;

/** Chamadas host → extensão (a extensão responde com `res`). */
export type CallKind = 'command' | 'paste' | 'import' | 'export';

/** Extensão → host */
export type ExtensionMessage =
  | { v: 1; t: 'req'; id: number; method: ApiMethod; params?: Record<string, unknown> }
  | { v: 1; t: 'res'; id: number; ok: true; value?: unknown }
  | { v: 1; t: 'res'; id: number; ok: false; error: string }
  | { v: 1; t: 'pong'; n: number };

/** Host → extensão */
export type HostMessage =
  | { v: 1; t: 'init'; extensionId: string; locale: string; permissions: string[] }
  | { v: 1; t: 'res'; id: number; ok: true; value?: unknown }
  | { v: 1; t: 'res'; id: number; ok: false; error: string; code?: string }
  | { v: 1; t: 'call'; id: number; kind: CallKind; target: string; payload?: unknown }
  | { v: 1; t: 'event'; name: 'selection' | 'elements'; payload: unknown }
  | { v: 1; t: 'ping'; n: number };

export type ParseResult = { ok: true; msg: ExtensionMessage } | { ok: false; reason: 'shape' | 'size' | 'method' | 'version' };

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** Tamanho em bytes do JSON (null = não serializável, ex.: ciclo, função, BigInt). */
export function jsonSize(value: unknown): number | null {
  try {
    const s = JSON.stringify(value);
    return s === undefined ? null : s.length;
  } catch {
    return null;
  }
}

/** Valida uma mensagem vinda da extensão. Qualquer coisa fora do contrato é recusada. */
export function parseExtensionMessage(data: unknown): ParseResult {
  if (!isPlain(data)) return { ok: false, reason: 'shape' };
  const size = jsonSize(data);
  if (size === null) return { ok: false, reason: 'shape' };
  if (size > RPC_LIMITS.maxMessageBytes) return { ok: false, reason: 'size' };
  if (data.v !== RPC_VERSION) return { ok: false, reason: 'version' };
  const id = data.id;
  switch (data.t) {
    case 'pong':
      return Number.isInteger(data.n) ? { ok: true, msg: { v: 1, t: 'pong', n: data.n as number } } : { ok: false, reason: 'shape' };
    case 'req': {
      if (!Number.isInteger(id) || (id as number) < 1 || (id as number) > 2 ** 31) return { ok: false, reason: 'shape' };
      if (typeof data.method !== 'string' || !Object.prototype.hasOwnProperty.call(API_METHODS, data.method)) return { ok: false, reason: 'method' };
      if (data.params !== undefined && !isPlain(data.params)) return { ok: false, reason: 'shape' };
      return { ok: true, msg: { v: 1, t: 'req', id: id as number, method: data.method as ApiMethod, params: data.params as Record<string, unknown> | undefined } };
    }
    case 'res': {
      if (!Number.isInteger(id) || typeof data.ok !== 'boolean') return { ok: false, reason: 'shape' };
      if (data.ok) return { ok: true, msg: { v: 1, t: 'res', id: id as number, ok: true, value: data.value } };
      const error = typeof data.error === 'string' ? data.error.slice(0, 500) : 'error';
      return { ok: true, msg: { v: 1, t: 'res', id: id as number, ok: false, error } };
    }
    default:
      return { ok: false, reason: 'shape' };
  }
}

/** Permissão exigida por um método (null = livre). */
export function permissionFor(method: ApiMethod): ExtensionPermission | null {
  return API_METHODS[method];
}

/** Balde de fichas: até `perSecond` mensagens por segundo (com rajada do mesmo tamanho). */
export class RateLimiter {
  private tokens: number;
  private last: number;
  readonly perSecond: number;

  constructor(perSecond: number = RPC_LIMITS.ratePerSecond, now = 0) {
    this.perSecond = perSecond;
    this.tokens = perSecond;
    this.last = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.perSecond, this.tokens + elapsed * this.perSecond);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Nome de arquivo seguro para downloads oferecidos por extensões. */
export function safeFileName(name: unknown, fallback = 'arquivo.txt'): string {
  if (typeof name !== 'string') return fallback;
  // eslint-free: só letras, números, espaço, ponto, hífen e sublinhado; sem caminho
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[^\p{L}\p{N} ._-]/gu, '_').replace(/^\.+/, '').slice(0, 120).trim();
  return clean || fallback;
}
