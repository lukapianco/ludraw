/**
 * LuDraw server — em quem confiar no `X-Forwarded-For` (Chat 08.7 · R5 · achado S-14).
 *
 * Uma só regra para o REST (`trustProxy` do Fastify) e para o WebSocket (`clientIp` do hub), com a MESMA biblioteca
 * que o Fastify usa (`@fastify/proxy-addr`): número = quantos proxies à frente (saltos contados a partir do socket),
 * `true` = todos, `false` = nenhum, lista = IPs/CIDR dos proxies confiáveis.
 */
import type { IncomingMessage } from 'node:http';
import proxyAddr from '@fastify/proxy-addr';
import type { TrustProxy } from '../config';

export type TrustFn = (addr: string, hop: number) => boolean;

export function trustFunction(tp: TrustProxy): TrustFn {
  if (typeof tp === 'number') return (_addr, hop) => hop < tp;
  if (tp === true) return () => true;
  if (tp === false) return () => false;
  return proxyAddr.compile(tp);
}

/** IP do cliente pela regra configurada (o mesmo valor que o Fastify põe em `request.ip`). */
export function clientAddress(req: IncomingMessage, tp: TrustProxy): string {
  if (tp === false) return req.socket?.remoteAddress ?? 'unknown';
  return proxyAddr(req, trustFunction(tp)) ?? req.socket?.remoteAddress ?? 'unknown';
}
