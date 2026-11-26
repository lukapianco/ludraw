/**
 * LuDraw server — erros da API (Chat 07). Nunca frase pronta: sempre código + chave do catálogo
 * (`API_ERROR_KEYS` em src/utils/apiContract.ts) ou o `MessageDescriptor` vindo de `explain()`.
 */
import type { MessageDescriptor, StoredMessage } from '../../../src/i18n/types';
import { API_ERROR_KEYS, type ApiErrorBody, type ApiErrorCode } from '../../../src/utils/apiContract';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly storedMessage: StoredMessage,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }

  body(): ApiErrorBody {
    return { error: { code: this.code, message: this.storedMessage, ...(this.retryAfterSeconds !== undefined ? { retryAfterSeconds: this.retryAfterSeconds } : {}) } };
  }
}

/** Erro com código conhecido do contrato. */
export function apiError(status: number, code: ApiErrorCode, params?: StoredMessage['params']): HttpError {
  return new HttpError(status, code, { key: API_ERROR_KEYS[code], ...(params ? { params } : {}) });
}

/** Negado por `explain()` (permissões) — devolve o motivo como chave + parâmetros. */
export function forbidden(reason: MessageDescriptor | StoredMessage | undefined, code = 'forbidden'): HttpError {
  return new HttpError(403, code, reason ? toStored(reason) : { key: 'permissions.denied.unknownAction' });
}

/** Chat 09 · R4: os limites de tentativa estão no Redis/Valkey e ele não respondeu — 503, tente de novo em 5 s. */
export function limitsUnavailable(): HttpError {
  return new HttpError(503, 'limitsUnavailable', { key: API_ERROR_KEYS.limitsUnavailable }, 5);
}

export function tooManyAttempts(retryAfterSeconds: number): HttpError {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return new HttpError(429, 'tooManyAttempts', { key: API_ERROR_KEYS.tooManyAttempts, params: { count: seconds } }, seconds);
}

/**
 * Chat 08.7 · R3: muitas senhas erradas NESTA conta (limite por e-mail, todos os IPs). A mensagem aponta "Esqueci
 * minha senha"; `count` = minutos até liberar.
 */
export function accountLocked(retryAfterSeconds: number): HttpError {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return new HttpError(429, 'accountLocked', { key: API_ERROR_KEYS.accountLocked, params: { count: Math.max(1, Math.ceil(seconds / 60)) } }, seconds);
}

/** Converte o descritor do código (`explain()`, política de senha) na forma JSON gravável/transmitida. */
export function toStored(desc: MessageDescriptor | StoredMessage): StoredMessage {
  if (!desc.params) return { key: desc.key };
  const params: NonNullable<StoredMessage['params']> = {};
  for (const [k, v] of Object.entries(desc.params)) {
    if (v === undefined) continue;
    params[k] = v !== null && typeof v === 'object' ? toStored(v as MessageDescriptor) : (v as string | number | null);
  }
  return { key: desc.key, params };
}

/** Erro a partir de um descritor (ex.: senha fraca). */
export function descriptorError(status: number, code: string, desc: MessageDescriptor): HttpError {
  return new HttpError(status, code, toStored(desc));
}

/**
 * Chat 09 · R1: mensagem de erro de boot/CLI para o terminal. O Drizzle embrulha o erro do Postgres em
 * "Failed query: <sql>\nparams: <valores>" — os VALORES podem ter dados (e-mail, hash), então saem fora; fica o SQL
 * e o motivo do banco (`cause`), que é o que explica o problema ("permission denied for database …").
 */
export function describeBootError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // só o erro do Drizzle perde as linhas seguintes (params); as outras mensagens saem inteiras
  const firstLine = err.message.startsWith('Failed query:') ? err.message.split('\n')[0] : err.message;
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message && !firstLine.includes(cause.message)) {
    const code = (cause as { code?: string }).code;
    return `${firstLine} — ${cause.message}${code ? ` (${code})` : ''}`;
  }
  return firstLine;
}
