/**
 * LuDraw server — rotas do assistente de primeiro acesso (`#/setup`, Chat 07).
 *
 * Todas respondem 404 assim que o setup foi concluído (as rotas "deixam de existir"). Tentativas com
 * token errado contam no limite por IP (5 a cada 15 minutos).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SetupCompleteRequest, SetupStatus } from '../../../src/utils/apiContract';
import { findMembership } from '../auth/identity';
import { hashPassword } from '../auth/passwords';
import { issueSession } from '../auth/routes';
import type { AppContext } from '../context';
import { users } from '../db/schema';
import { sha256Hex, safeEqual } from '../lib/crypto';
import { apiError, HttpError, tooManyAttempts } from '../lib/errors';
import { normalizeSetupToken, provisionInstallation, readSetup, validateProvisionData, type SetupGate } from './provision';
import { eq } from 'drizzle-orm';

const tokenSchema = { type: 'string', minLength: 1, maxLength: 200 } as const;

const verifySchema = {
  body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: tokenSchema } },
} as const;

const completeSchema = {
  body: {
    type: 'object',
    required: ['token', 'mode', 'organization', 'admin'],
    additionalProperties: false,
    properties: {
      token: tokenSchema,
      mode: { type: 'string', enum: ['single_org', 'multi_org'] },
      organization: {
        type: 'object',
        required: ['name', 'allowedEmailDomains'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 200 },
          allowedEmailDomains: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 253 } },
        },
      },
      admin: {
        type: 'object',
        required: ['name', 'email', 'password'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 200 },
          email: { type: 'string', maxLength: 320 },
          password: { type: 'string', maxLength: 1024 },
        },
      },
    },
  },
} as const;

export function registerSetupRoutes(app: FastifyInstance, ctx: AppContext, gate: SetupGate): void {
  const closedWhenDone = async () => {
    if (await gate.refresh(ctx.db)) throw apiError(404, 'notFound');
  };

  // Chat 08.7 · R3 (S-04): a tentativa é RESERVADA antes de conferir o token (no Postgres real, `check` → await →
  // `hit` deixava passar tentativas simultâneas); token certo devolve a vaga
  const reserveOrThrow = async (request: FastifyRequest) => {
    const r = await ctx.limiters.setup.reserve(request.ip);
    if (!r.allowed) throw tooManyAttempts(r.retryAfterMs / 1000);
  };

  app.get('/setup/status', { onRequest: closedWhenDone }, async () => {
    const setup = await readSetup(ctx.db);
    const status: SetupStatus = { required: true, tokenIssued: !!setup.setupTokenHash };
    return status;
  });

  app.post<{ Body: { token: string } }>('/setup/verify-token', { onRequest: closedWhenDone, schema: verifySchema }, async (request) => {
    await reserveOrThrow(request);
    const setup = await readSetup(ctx.db);
    const ok = !!setup.setupTokenHash && safeEqual(sha256Hex(normalizeSetupToken(request.body.token)), setup.setupTokenHash);
    if (!ok) throw apiError(403, 'setupInvalidToken');
    await ctx.limiters.setup.release(request.ip);
    return { ok: true };
  });

  app.post<{ Body: SetupCompleteRequest }>('/setup/complete', { onRequest: closedWhenDone, schema: completeSchema }, async (request, reply) => {
    await reserveOrThrow(request);
    const body = request.body;
    // confere o token antes do trabalho caro (argon2); a transação confere de novo com a linha travada
    const setup = await readSetup(ctx.db);
    if (!setup.setupTokenHash || !safeEqual(sha256Hex(normalizeSetupToken(body.token)), setup.setupTokenHash)) throw apiError(403, 'setupInvalidToken');
    await ctx.limiters.setup.release(request.ip);
    const data = validateProvisionData({
      organizationName: body.organization.name,
      allowedEmailDomains: body.organization.allowedEmailDomains,
      adminName: body.admin.name,
      adminEmail: body.admin.email,
      adminPassword: body.admin.password,
    });
    let result;
    try {
      result = await provisionInstallation(ctx.db, {
        organizationName: data.organizationName,
        allowedEmailDomains: data.domains,
        mode: body.mode,
        admin: { name: data.adminName, email: data.adminEmail, passwordHash: await hashPassword(body.admin.password), mustChangePassword: false },
        source: 'wizard',
        ip: request.ip,
        token: body.token,
      });
    } catch (err) {
      if (err instanceof HttpError && err.code === 'setupInvalidToken') await ctx.limiters.setup.hit(request.ip);
      throw err;
    }
    gate.markCompleted();
    request.log.info({ event: 'setup_completed', organizationId: result.organizationId }, 'first-run setup completed via wizard');
    const [user] = await ctx.db.select().from(users).where(eq(users.id, result.userId));
    const membership = await findMembership(ctx.db, result.userId, result.organizationId);
    if (!user || !membership) throw apiError(500, 'internal');
    return issueSession(ctx, request, reply, user, membership);
  });
}
