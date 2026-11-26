/**
 * LuDraw server — helpers HTTP (Chat 07): origem permitida, cabeçalho anti-CSRF e cookie de sessão.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { API_PREFIX, CLIENT_HEADER, CLIENT_HEADER_VALUE, REFRESH_COOKIE } from '../../../src/utils/apiContract';
import { allowedOrigins, type ServerConfig } from '../config';
import { apiError } from './errors';

/** Origem da própria requisição (mesma origem é sempre aceita). */
function sameOrigin(request: FastifyRequest): string | null {
  const host = request.headers.host;
  if (!host) return null;
  return `${request.protocol}://${host}`;
}

export function originAllowed(config: ServerConfig, request: FastifyRequest, origin: string | undefined): boolean {
  if (!origin) return true; // clientes fora do navegador (CLI, testes) não mandam Origin
  if (origin === sameOrigin(request)) return true;
  return allowedOrigins(config).has(origin);
}

/**
 * Rotas que dependem do cookie de sessão: exigem o cabeçalho próprio (navegador só envia cabeçalho
 * personalizado de outra origem depois do preflight do CORS, que só libera origens permitidas) e
 * conferem o Origin quando ele vem.
 */
export function assertCookieRequest(config: ServerConfig, request: FastifyRequest): void {
  if (request.headers[CLIENT_HEADER] !== CLIENT_HEADER_VALUE) throw apiError(403, 'originNotAllowed');
  if (!originAllowed(config, request, request.headers.origin)) throw apiError(403, 'originNotAllowed');
}

export const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

export function setRefreshCookie(config: ServerConfig, reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(config: ServerConfig, reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, path: REFRESH_COOKIE_PATH });
}

export function userAgentOf(request: FastifyRequest): string | null {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}
