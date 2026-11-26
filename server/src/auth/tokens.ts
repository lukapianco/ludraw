/**
 * LuDraw server — JWT de acesso (Chat 07). HS256 com a chave do servidor, vida curta (10 min).
 * O JWT sozinho NÃO basta: cada requisição confere também a sessão e a participação no banco
 * (`authenticate.ts`), então suspender ou encerrar sessões vale na hora.
 */
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 600;
const ISSUER = 'ludraw';
const AUDIENCE = 'ludraw-api';

export interface AccessClaims {
  userId: string;
  organizationId: string;
  sessionId: string;
}

export async function signAccessToken(key: Uint8Array, claims: AccessClaims, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ org: claims.organizationId, sid: claims.sessionId, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function verifyAccessToken(key: Uint8Array, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.org !== 'string' || typeof payload.sid !== 'string') return null;
    return { userId: payload.sub, organizationId: payload.org, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/* ------------------------------ Visitante (link público) ------------------------------ */

export const VISITOR_TOKEN_TTL_SECONDS = 2 * 60 * 60;

export interface VisitorClaims {
  boardId: string;
  /** visitante desta sessão (autoria dos objetos que criar) */
  visitorId: string;
  /** impressão do token do link: gerar outro link derruba as sessões antigas */
  linkPrint: string;
}

export async function signVisitorToken(key: Uint8Array, claims: VisitorClaims, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ typ: 'visitor', bid: claims.boardId, vid: claims.visitorId, lp: claims.linkPrint })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + VISITOR_TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function verifyVisitorToken(key: Uint8Array, token: string): Promise<VisitorClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (payload.typ !== 'visitor' || typeof payload.bid !== 'string' || typeof payload.vid !== 'string' || typeof payload.lp !== 'string') return null;
    return { boardId: payload.bid, visitorId: payload.vid, linkPrint: payload.lp };
  } catch {
    return null;
  }
}
