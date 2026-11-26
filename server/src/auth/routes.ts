/**
 * LuDraw server — rotas de autenticação (Chat 07): login, renovação, saída, troca de senha e "quem sou".
 * Cadastro sem convite não existe em `single_org` (o aceite de convite cria a conta — rotas de convite).
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AUDIT_PARAM_KEYS, REFRESH_COOKIE, type AuthResult, type ChangePasswordRequest, type LoginRequest, SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';
import { LOGIN_EMAIL_LIMIT, type AppContext } from '../context';
import { refreshTokens, users } from '../db/schema';
import { sha256Hex } from '../lib/crypto';
import { recordAudit } from '../lib/audit';
import { accountLocked, apiError, descriptorError, tooManyAttempts } from '../lib/errors';
import { reserveAll } from '../lib/limiter';
import { assertCookieRequest, clearRefreshCookie, setRefreshCookie, userAgentOf } from '../lib/http';
import { requireAuth } from './authenticate';
import { findMembership, findUserByEmail, membershipBlock, primaryMembership, sessionUser, type MembershipRow, type UserRow } from './identity';
import { hashPassword, verifyPassword } from './passwords';
import { createSession, endUserSessions, revokeSession, rotateRefreshToken } from './sessions';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from './tokens';

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, password: { type: 'string', minLength: 1, maxLength: 1024 } },
  },
} as const;

const changePasswordSchema = {
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    additionalProperties: false,
    properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 1024 }, newPassword: { type: 'string', minLength: 1, maxLength: 1024 } },
  },
} as const;

/** Cria a sessão, grava o cookie de renovação e devolve o access token. Usado também pelo setup e pelo convite. */
export async function issueSession(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  user: UserRow,
  membership: MembershipRow,
): Promise<AuthResult> {
  const session = await createSession(ctx.db, { userId: user.id, organizationId: membership.organizationId, ip: request.ip, userAgent: userAgentOf(request) });
  setRefreshCookie(ctx.config, reply, session.refreshToken, session.expiresAt);
  const accessToken = await signAccessToken(ctx.keys.jwt, { userId: user.id, organizationId: membership.organizationId, sessionId: session.sessionId });
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user: sessionUser(user, membership) };
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: LoginRequest }>('/auth/login', { schema: loginSchema }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase();
    // Chat 08.7 · R3 (S-04): a tentativa é RESERVADA antes do argon2 (tudo ou nada, sem await no meio) e só
    // devolvida/zerada no sucesso — pedidos simultâneos não passam todos. Três limites: IP, IP+e-mail e só e-mail.
    const ipSlot = { limiter: ctx.limiters.loginIp, key: request.ip };
    const accountSlot = { limiter: ctx.limiters.loginAccount, key: `${request.ip}|${email}` };
    const emailSlot = { limiter: ctx.limiters.loginEmail, key: email };
    const reserved = await reserveAll([ipSlot, accountSlot, emailSlot]);
    if (!reserved.ok) {
      if (reserved.slot === emailSlot) throw accountLocked(reserved.result.retryAfterMs / 1000);
      throw tooManyAttempts(reserved.result.retryAfterMs / 1000);
    }
    const emailAttempt = reserved.results[2].count;

    const user = await findUserByEmail(ctx.db, email);
    const verdict = await verifyPassword(user?.passwordHash, request.body.password);
    const membership = user ? await primaryMembership(ctx.db, user.id) : null;

    if (!user || !verdict.ok) {
      // a tentativa já foi contada na reserva; a que completa o limite por e-mail fica registrada para o admin
      if (user && membership && emailAttempt >= ctx.limiters.loginEmail.max) {
        await recordAudit(ctx.db, {
          organizationId: membership.organizationId,
          actorId: user.id,
          action: 'login_locked',
          message: { key: SERVER_AUDIT_MESSAGES.loginLocked, params: { count: LOGIN_EMAIL_LIMIT.minutes } },
          targetType: 'user',
          targetId: user.id,
          ip: request.ip,
        });
      }
      if (user && membership) {
        await recordAudit(ctx.db, {
          organizationId: membership.organizationId,
          actorId: user.id,
          action: 'login_failed',
          message: { key: SERVER_AUDIT_MESSAGES.loginFailed, params: { reason: { key: AUDIT_PARAM_KEYS.reasonWrongPassword } } },
          targetType: 'user',
          targetId: user.id,
          ip: request.ip,
        });
      } else {
        request.log.warn({ event: 'login_failed_unknown_account' }, 'login refused for an unknown account');
      }
      throw apiError(401, 'invalidCredentials');
    }

    const block = membershipBlock(user, membership);
    if (block || !membership) {
      if (membership) {
        await recordAudit(ctx.db, {
          organizationId: membership.organizationId,
          actorId: user.id,
          action: 'login_failed',
          message: { key: SERVER_AUDIT_MESSAGES.loginFailed, params: { reason: { key: block?.code === 'accountRemoved' ? AUDIT_PARAM_KEYS.reasonRemoved : AUDIT_PARAM_KEYS.reasonSuspended } } },
          targetType: 'user',
          targetId: user.id,
          ip: request.ip,
        });
      }
      throw block ?? apiError(403, 'accountRemoved');
    }

    // sucesso: a vaga do IP volta; as da conta (IP+e-mail e só e-mail) zeram
    await ctx.limiters.loginIp.release(request.ip);
    await ctx.limiters.loginAccount.reset(accountSlot.key);
    await ctx.limiters.loginEmail.reset(emailSlot.key);
    const now = new Date();
    const patch: Partial<typeof users.$inferInsert> = { lastSeenAt: now };
    if (verdict.needsRehash) patch.passwordHash = await hashPassword(request.body.password);
    await ctx.db.update(users).set(patch).where(eq(users.id, user.id));
    await recordAudit(ctx.db, {
      organizationId: membership.organizationId,
      actorId: user.id,
      action: 'login',
      message: { key: SERVER_AUDIT_MESSAGES.login, params: { method: { key: AUDIT_PARAM_KEYS.methodPassword } } },
      targetType: 'user',
      targetId: user.id,
      ip: request.ip,
    });
    return issueSession(ctx, request, reply, user, membership);
  });

  app.post('/auth/refresh', async (request, reply) => {
    assertCookieRequest(ctx.config, request);
    const presented = request.cookies[REFRESH_COOKIE];
    if (!presented) throw apiError(401, 'unauthorized');
    const outcome = await rotateRefreshToken(ctx.db, ctx.keys.refreshSealer, presented);
    if (!outcome.ok) {
      clearRefreshCookie(ctx.config, reply);
      if (outcome.reason === 'reuse') request.log.warn({ event: 'refresh_reuse' }, 'refresh token reuse detected; session revoked');
      throw apiError(401, 'unauthorized');
    }
    const [user] = await ctx.db.select().from(users).where(eq(users.id, outcome.userId));
    const membership = user ? await findMembership(ctx.db, user.id, outcome.organizationId) : null;
    const block = user ? membershipBlock(user, membership) : apiError(401, 'unauthorized');
    if (block || !user || !membership) {
      await revokeSession(ctx.db, outcome.sessionId, 'membership_inactive');
      clearRefreshCookie(ctx.config, reply);
      throw block ?? apiError(401, 'unauthorized');
    }
    setRefreshCookie(ctx.config, reply, outcome.refreshToken, outcome.expiresAt);
    const accessToken = await signAccessToken(ctx.keys.jwt, { userId: user.id, organizationId: membership.organizationId, sessionId: outcome.sessionId });
    const result: AuthResult = { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user: sessionUser(user, membership) };
    return result;
  });

  app.post('/auth/logout', async (request, reply) => {
    assertCookieRequest(ctx.config, request);
    const presented = request.cookies[REFRESH_COOKIE];
    if (presented) {
      // encerra a sessão dona do cookie, mesmo que o token já tenha sido trocado (sem rotação aqui)
      const [row] = await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.hash, sha256Hex(presented)));
      if (row) await revokeSession(ctx.db, row.sessionId, 'logout');
    }
    clearRefreshCookie(ctx.config, reply);
    return reply.code(204).send();
  });

  app.post('/auth/logout-all', { preHandler: requireAuth(ctx, { allowMustChangePassword: true }) }, async (request, reply) => {
    const auth = request.auth!;
    // Chat 08.5: derruba também o tempo real da pessoa na hora
    const count = await endUserSessions(ctx, auth.userId, 'logout_all');
    await recordAudit(ctx.db, {
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'sessions_revoked',
      message: { key: SERVER_AUDIT_MESSAGES.sessionsRevoked, params: { count, reason: { key: AUDIT_PARAM_KEYS.reasonLogoutAll } } },
      targetType: 'user',
      targetId: auth.userId,
      count,
      ip: request.ip,
    });
    clearRefreshCookie(ctx.config, reply);
    return reply.code(204).send();
  });

  app.post<{ Body: ChangePasswordRequest }>(
    '/auth/change-password',
    { schema: changePasswordSchema, preHandler: requireAuth(ctx, { allowMustChangePassword: true }) },
    async (request) => {
      const auth = request.auth!;
      const limit = await ctx.limiters.changePassword.hit(auth.userId);
      if (!limit.allowed) throw tooManyAttempts(limit.retryAfterMs / 1000);
      if (!auth.user.passwordHash) throw apiError(400, 'noLocalPassword');
      const { currentPassword, newPassword } = request.body;
      const verdict = await verifyPassword(auth.user.passwordHash, currentPassword);
      if (!verdict.ok) throw apiError(400, 'currentPasswordWrong');
      if (currentPassword === newPassword) throw apiError(400, 'samePassword');
      const weak = checkPasswordStrength(newPassword, { email: auth.user.email, name: auth.user.name });
      if (weak) throw descriptorError(400, 'weakPassword', weak);
      await ctx.db
        .update(users)
        .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
        .where(eq(users.id, auth.userId));
      const count = await endUserSessions(ctx, auth.userId, 'password_changed', { exceptSessionId: auth.sessionId });
      await recordAudit(ctx.db, {
        organizationId: auth.organizationId,
        actorId: auth.userId,
        action: 'password_changed',
        message: { key: SERVER_AUDIT_MESSAGES.passwordChanged },
        targetType: 'user',
        targetId: auth.userId,
        count,
        ip: request.ip,
      });
      await ctx.limiters.changePassword.reset(auth.userId);
      const [user] = await ctx.db.select().from(users).where(eq(users.id, auth.userId));
      return { user: sessionUser(user!, auth.membership), sessionsEnded: count };
    },
  );

  app.get('/auth/me', { preHandler: requireAuth(ctx, { allowMustChangePassword: true }) }, async (request) => {
    const auth = request.auth!;
    return { user: sessionUser(auth.user, auth.membership) };
  });
}
