/**
 * LuDraw — Rede das extensões, só pelo host (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §5.2 e §5.10).
 *
 * A extensão nunca tem rede direta (preâmbulo selado). `ludraw.network.fetch` chega aqui e o host:
 * - exige a permissão `network` (conferida antes, em `api.ts`);
 * - aceita só `https:` e o domínio EXATO da `networkAllowlist` aprovada (sem curinga, sem subdomínio);
 * - só GET/POST, sem cookies (`credentials: 'omit'`), sem referrer, sem seguir redirecionamento;
 * - corta em 5 s e em 2 MB de resposta (lida em fluxo);
 * - registra o acesso para o indicador "Extensão X acessou a rede".
 */
import { ApiError } from './connection';

export const NET_LIMITS = { timeoutMs: 5000, maxResponseBytes: 2 * 1024 * 1024, maxBodyBytes: 256 * 1024, maxHeaders: 20 } as const;

/** Cabeçalhos que a extensão não pode definir. */
const FORBIDDEN_HEADERS = /^(cookie|cookie2|authorization|proxy-.*|host|origin|referer|sec-.*|connection|content-length|transfer-encoding|keep-alive|upgrade|te|trailer|via)$/i;

export interface NetRequest {
  url: unknown;
  init?: unknown;
}

export interface NetResult {
  status: number;
  text: string;
}

export interface NetDecision {
  ok: boolean;
  host?: string;
  code?: 'url' | 'protocol' | 'host' | 'method' | 'headers' | 'body';
}

/** Confere a URL e as opções contra a allowlist (puro: testável). */
export function checkNetRequest(req: NetRequest, allowlist: readonly string[]): NetDecision {
  if (typeof req.url !== 'string' || req.url.length > 2048) return { ok: false, code: 'url' };
  let u: URL;
  try {
    u = new URL(req.url);
  } catch {
    return { ok: false, code: 'url' };
  }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, code: 'protocol', host: u.hostname };
  const host = u.hostname.toLowerCase();
  if (!allowlist.includes(host) || (u.port && u.port !== '443')) return { ok: false, code: 'host', host };
  const init = (req.init && typeof req.init === 'object' ? req.init : {}) as Record<string, unknown>;
  const method = typeof init.method === 'string' ? init.method.toUpperCase() : 'GET';
  if (method !== 'GET' && method !== 'POST') return { ok: false, code: 'method', host };
  const headers = init.headers;
  if (headers !== undefined) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return { ok: false, code: 'headers', host };
    const entries = Object.entries(headers);
    if (entries.length > NET_LIMITS.maxHeaders || entries.some(([k, v]) => typeof v !== 'string' || FORBIDDEN_HEADERS.test(k) || !/^[A-Za-z0-9-]{1,64}$/.test(k) || v.length > 1024)) return { ok: false, code: 'headers', host };
  }
  if (init.body !== undefined && (typeof init.body !== 'string' || init.body.length > NET_LIMITS.maxBodyBytes || method === 'GET')) return { ok: false, code: 'body', host };
  return { ok: true, host };
}

/** Faz a requisição pelo host (depois de `checkNetRequest`). */
export async function hostFetch(req: NetRequest, allowlist: readonly string[], fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<NetResult & { host: string }> {
  const d = checkNetRequest(req, allowlist);
  if (!d.ok) throw new ApiError(`network-${d.code}`, d.code === 'host' ? `host not in networkAllowlist: ${d.host}` : `request rejected (${d.code})`);
  const init = (req.init && typeof req.init === 'object' ? req.init : {}) as Record<string, unknown>;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_LIMITS.timeoutMs);
  try {
    const res = await fetchImpl(String(req.url), {
      method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
      headers: (init.headers as Record<string, string> | undefined) ?? undefined,
      body: typeof init.body === 'string' ? init.body : undefined,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
      mode: 'cors',
      signal: ctrl.signal,
    });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > NET_LIMITS.maxResponseBytes) {
          await reader.cancel();
          throw new ApiError('network-size', 'response larger than 2 MB');
        }
        chunks.push(value);
      }
    }
    const all = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.byteLength;
    }
    return { status: res.status, text: new TextDecoder().decode(all), host: d.host! };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(ctrl.signal.aborted ? 'network-timeout' : 'network-failed', ctrl.signal.aborted ? 'request took longer than 5 s' : 'request failed');
  } finally {
    clearTimeout(timer);
  }
}
