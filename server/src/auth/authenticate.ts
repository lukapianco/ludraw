/**
 * LuDraw server — autenticação de cada requisição (Chat 07).
 *
 * `Authorization: Bearer <JWT>` → confere assinatura e validade → sessão no banco (não revogada, não
 * vencida) → conta e participação ativas. Suspender, remover ou encerrar sessões vale na próxima
 * requisição, sem esperar o JWT vencer. Contas com troca de senha obrigatória só alcançam as rotas
 * marcadas com `allowMustChangePassword`.
 */
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { sessions, users } from '../db/schema';
import { apiError } from '../lib/errors';
import { findMembership, membershipBlock, type MembershipRow, type UserRow } from './identity';
import { sessionAlive } from './sessions';
import { verifyAccessToken } from './tokens';

export interface AuthContext {
  userId: string;
  organizationId: string;
  sessionId: string;
  user: UserRow;
  membership: MembershipRow;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthOptions {
  allowMustChangePassword?: boolean;
}

export async function authenticate(ctx: AppContext, request: FastifyRequest, opts: AuthOptions = {}): Promise<AuthContext> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw apiError(401, 'unauthorized');
  const auth = await authenticateToken(ctx, token, opts);
  request.auth = auth;
  return auth;
}

/** Mesma checagem de `authenticate`, a partir do token solto (WebSocket do tempo real: Chat 08). */
export async function authenticateToken(ctx: AppContext, token: string, opts: AuthOptions = {}): Promise<AuthContext> {
  const claims = await verifyAccessToken(ctx.keys.jwt, token);
  if (!claims) throw apiError(401, 'unauthorized');
  const now = new Date();
  const [session] = await ctx.db.select().from(sessions).where(eq(sessions.id, claims.sessionId));
  if (!session || session.userId !== claims.userId || sessionAlive(session, now) !== 'ok') throw apiError(401, 'unauthorized');
  const [user] = await ctx.db.select().from(users).where(eq(users.id, claims.userId));
  if (!user) throw apiError(401, 'unauthorized');
  const membership = await findMembership(ctx.db, user.id, claims.organizationId);
  const block = membershipBlock(user, membership);
  if (block || !membership) throw block ?? apiError(401, 'unauthorized');
  if (user.mustChangePassword && !opts.allowMustChangePassword) throw apiError(403, 'mustChangePassword');
  return { userId: user.id, organizationId: membership.organizationId, sessionId: session.id, user, membership };
}

/** preHandler do Fastify. */
export function requireAuth(ctx: AppContext, opts: AuthOptions = {}) {
  return async (request: FastifyRequest) => {
    await authenticate(ctx, request, opts);
  };
}
