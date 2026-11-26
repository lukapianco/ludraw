/**
 * LuDraw server — "Baixar para o board" pelo servidor (Chat 09 · R2, pendência 6, decisão D6).
 *
 * Com a CSP do app (`connect-src 'self'`) o navegador não busca mais imagens de outros sites. No Modo Servidor quem
 * busca é o servidor, com as defesas de SSRF:
 *
 *  - Só `http:`/`https:`, sem usuário/senha no endereço, só as portas padrão (80/443).
 *  - O nome é resolvido AQUI e QUALQUER endereço interno recusa (a mesma lista do SMTP — `isInternalAddress`:
 *    loopback, privadas, CGNAT, link-local/metadados, IPv6 ULA/link-local, NAT64, IPv4 mapeado).
 *  - **DNS fixado (contra DNS rebinding):** a conexão vai ao IP que acabou de ser conferido — a função `lookup` da
 *    requisição devolve esse IP; o Node não resolve o nome de novo. O nome continua no `Host` e no TLS (SNI e
 *    validação do certificado pelo nome).
 *  - **Redirecionamento revalidado:** nada de seguir sozinho; cada `Location` passa de novo por TODAS as regras acima
 *    (esquema, credenciais, porta, nova resolução, endereço interno, novo IP fixado). No máximo 3.
 *  - Sem cookies, sem `Referer`; `Accept: image/*`; tempo total de 10 s; até 12 MB (cabeçalho e contagem real dos bytes);
 *    tipo conferido pelos primeiros bytes (PNG, JPEG, GIF, WebP, AVIF, BMP, SVG), nunca pelo `Content-Type`.
 *
 * Só `node:http`, `node:https`, `node:net` e a guarda já existente (nada de dependência nova).
 */
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { sniffImageType } from '../../../src/utils/imageSniff';
import { defaultLookup, isInternalAddress, type HostLookup } from '../mail/hostGuard';

export const REMOTE_IMAGE = { maxBytes: 12 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 3, maxUrlLength: 2048 } as const;

export type RemoteImageFailure = 'invalid' | 'blocked' | 'failed' | 'tooLarge' | 'notImage';
export type RemoteImageResult = { ok: true; bytes: Buffer; type: string; hops: number } | { ok: false; reason: RemoteImageFailure };

/** Um salto já conferido: o endereço e o IP onde conectar. */
export interface PinnedTarget {
  url: URL;
  ip: string;
}

/** Faz a requisição GET a um alvo conferido (injetável nos testes). Deve conectar a `target.ip`, nunca resolver o nome. */
export type PinnedConnect = (target: PinnedTarget, signal: AbortSignal) => Promise<IncomingMessage>;

export interface RemoteImageOptions {
  lookup?: HostLookup;
  connect?: PinnedConnect;
  /** SÓ testes: aceita endereço interno e porta qualquer (servidor de teste em 127.0.0.1). */
  testAllowPrivate?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Requisição real: `lookup` devolve o IP fixado (as duas assinaturas do Node: com e sem `all`). */
export const defaultPinnedConnect: PinnedConnect = (target, signal) =>
  new Promise((resolve, reject) => {
    const family = isIP(target.ip) === 6 ? 6 : 4;
    const lookup = (_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
      if (options?.all) cb(null, [{ address: target.ip, family }]);
      else cb(null, target.ip, family);
    };
    const fn = target.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = fn(
      target.url,
      {
        method: 'GET',
        agent: false,
        lookup: lookup as never,
        signal,
        headers: { accept: 'image/*', 'user-agent': 'LuDraw-ImageFetch/1.0', 'accept-encoding': 'identity' },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });

/** Confere um endereço (regras de cada salto) e devolve o alvo com o IP fixado, ou o motivo. */
export async function checkRemoteTarget(raw: string, opts: Pick<RemoteImageOptions, 'lookup' | 'testAllowPrivate'> = {}): Promise<PinnedTarget | { reason: RemoteImageFailure }> {
  if (raw.length > REMOTE_IMAGE.maxUrlLength) return { reason: 'invalid' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { reason: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { reason: 'invalid' };
  if (url.username || url.password) return { reason: 'invalid' };
  if (url.port && !opts.testAllowPrivate) return { reason: 'blocked' }; // só 80/443 (a URL omite a porta padrão)
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = await (opts.lookup ?? defaultLookup)(host);
    } catch {
      return { reason: 'failed' };
    }
  }
  if (!addresses.length) return { reason: 'failed' };
  if (!opts.testAllowPrivate && addresses.some(isInternalAddress)) return { reason: 'blocked' };
  return { url, ip: addresses[0] };
}

/** Baixa a imagem seguindo as regras acima. Nunca lança: devolve o motivo. */
export async function fetchRemoteImage(rawUrl: string, opts: RemoteImageOptions = {}): Promise<RemoteImageResult> {
  const maxBytes = opts.maxBytes ?? REMOTE_IMAGE.maxBytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? REMOTE_IMAGE.timeoutMs);
  const connect = opts.connect ?? defaultPinnedConnect;
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= REMOTE_IMAGE.maxRedirects; hop++) {
      const target = await checkRemoteTarget(current, opts);
      if ('reason' in target) return { ok: false, reason: target.reason };
      let res: IncomingMessage;
      try {
        res = await connect(target, controller.signal);
      } catch {
        return { ok: false, reason: 'failed' };
      }
      const status = res.statusCode ?? 0;
      if (REDIRECTS.has(status)) {
        const location = res.headers.location;
        res.resume();
        if (!location) return { ok: false, reason: 'failed' };
        try {
          current = new URL(location, target.url).href; // relativo ao salto atual; volta ao início do laço (tudo de novo)
        } catch {
          return { ok: false, reason: 'invalid' };
        }
        continue;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return { ok: false, reason: 'failed' };
      }
      const declared = Number(res.headers['content-length'] ?? '0');
      if (declared > maxBytes) {
        res.destroy();
        return { ok: false, reason: 'tooLarge' };
      }
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const chunk of res) {
          total += (chunk as Buffer).length;
          if (total > maxBytes) {
            res.destroy();
            return { ok: false, reason: 'tooLarge' };
          }
          chunks.push(chunk as Buffer);
        }
      } catch {
        return { ok: false, reason: 'failed' };
      }
      const bytes = Buffer.concat(chunks);
      const type = sniffImageType(new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 4096)));
      if (!type) return { ok: false, reason: 'notImage' };
      return { ok: true, bytes, type, hops: hop };
    }
    return { ok: false, reason: 'failed' }; // redirecionamentos demais
  } finally {
    clearTimeout(timer);
  }
}
