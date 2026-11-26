/**
 * LuDraw server — convites (Chat 07). Em `single_org` é o ÚNICO jeito de criar conta além do setup,
 * do bootstrap e da CLI. Criar/revogar convite é uma `WorkspaceOp` (regras compartilhadas); aqui ficam a
 * prévia pública do link e o aceite (que cria a conta ou entra com a existente e já faz o login).
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AUDIT_PARAM_KEYS, SERVER_AUDIT_MESSAGES, type AcceptInvitationRequest, type InvitationPreview } from '../../../src/utils/apiContract';
import { colorFromString } from '../../../src/utils/color';
import { createId } from '../../../src/utils/id';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';
import { invitationStatus } from '../../../src/utils/workspace';
import { applyInvitationAcceptance, rulesView, validateInvitationAcceptance } from '../../../src/utils/workspaceRules';
import { explain, workspaceContext } from '../../../src/utils/permissions';
import { requireAuth } from '../auth/authenticate';
import { mailErrorForLog } from '../mail/mailer';
import { mailLang } from '../mail/templates';
import { viewerOf } from '../workspace/service';
import { forbidden, HttpError } from '../lib/errors';
import { assertInviteMailAllowed, sendInvitationEmail } from './mail';
import { findMembership, findUserByEmail } from '../auth/identity';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { issueSession } from '../auth/routes';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { invitations, organizations, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { sha256Hex } from '../lib/crypto';
import { apiError, descriptorError, tooManyAttempts } from '../lib/errors';
import { loadRulesState, persistDiff } from '../workspace/state';
import { ruleError } from '../workspace/service';
import { clearRemovedEmail } from '../access/removedEmails';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function registerInvitationRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get<{ Params: { token: string } }>('/invitations/:token', async (request) => {
    const limit = await ctx.limiters.invitePreview.hit(request.ip);
    if (!limit.allowed) throw tooManyAttempts(limit.retryAfterMs / 1000);
    if (!TOKEN_RE.test(request.params.token)) throw apiError(404, 'notFound');
    const [inv] = await ctx.db.select().from(invitations).where(eq(invitations.tokenHash, sha256Hex(request.params.token)));
    if (!inv) throw apiError(404, 'notFound');
    const [org] = await ctx.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, inv.organizationId));
    const existing = await findUserByEmail(ctx.db, inv.email);
    const preview: InvitationPreview = {
      email: inv.email,
      role: inv.role,
      organizationName: org?.name ?? '',
      status: invitationStatus({ acceptedAt: inv.acceptedAt?.getTime(), revokedAt: inv.revokedAt?.getTime(), expiresAt: inv.expiresAt.getTime() }),
      expiresAt: inv.expiresAt.getTime(),
      accountExists: !!existing && !existing.anonymizedAt,
    };
    return preview;
  });

  app.post<{ Params: { token: string }; Body: AcceptInvitationRequest }>(
    '/invitations/:token/accept',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: { name: { type: 'string', maxLength: 200 }, email: { type: 'string', maxLength: 320 }, password: { type: 'string', minLength: 1, maxLength: 1024 } },
        },
      },
    },
    async (request, reply) => {
      const key = `${request.ip}|${request.params.token}`;
      // Chat 08.7 · R3 (S-04): reserva ANTES de conferir a senha; só a senha errada fica contada
      const limit = await ctx.limiters.inviteAccept.reserve(key);
      if (!limit.allowed) throw tooManyAttempts(limit.retryAfterMs / 1000);
      if (!TOKEN_RE.test(request.params.token)) {
        await ctx.limiters.inviteAccept.release(key);
        throw apiError(404, 'notFound');
      }
      const { email: rawEmail, password } = request.body;
      const email = rawEmail.trim().toLowerCase();
      const now = Date.now();

      let outcome: Awaited<ReturnType<typeof acceptInTransaction>>;
      const acceptInTransaction = () => ctx.db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as Db;
        const [inv] = await tx.select().from(invitations).where(eq(invitations.tokenHash, sha256Hex(request.params.token)));
        if (!inv) throw apiError(404, 'notFound');
        await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, inv.organizationId)).for('update');
        const before = await loadRulesState(tx, inv.organizationId, ctx.keys);
        const invitation = before.invitations.find((i) => i.id === inv.id);
        const invalid = validateInvitationAcceptance(before, invitation, email, now);
        if (invalid || !invitation) throw ruleError(invalid ?? { key: 'workspace.errors.inviteNotFound' });

        let user = await findUserByEmail(tx, email);
        if (user) {
          if (user.anonymizedAt || user.blockedAt) throw apiError(403, 'accountRemoved');
          if (!user.passwordHash) throw apiError(400, 'noLocalPassword');
          const verdict = await verifyPassword(user.passwordHash, password);
          if (!verdict.ok) throw apiError(401, 'invalidCredentials');
        } else {
          const name = (request.body.name ?? '').trim();
          if (name.length < 2) throw apiError(400, 'nameRequired');
          const weak = checkPasswordStrength(password, { email, name });
          if (weak) throw descriptorError(400, 'weakPassword', weak);
          const id = createId(16);
          await tx.insert(users).values({ id, email, name, avatarColor: colorFromString(name), passwordHash: await hashPassword(password), authProvider: 'local', createdVia: 'invite', createdAt: new Date(now), lastSeenAt: new Date(now) });
          [user] = await tx.select().from(users).where(eq(users.id, id));
        }
        if (!user) throw apiError(500, 'internal');
        // Chat 08.5: o convite chegou por e-mail → quem abriu o link provou que recebe mensagens nesse endereço
        if (inv.emailedAt && !user.emailVerifiedAt) await tx.update(users).set({ emailVerifiedAt: new Date(now) }).where(eq(users.id, user.id));
        const result = applyInvitationAcceptance(before, invitation, { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor }, {
          now,
          newId: () => createId(16),
          newToken: () => '',
          anonymizedName: (id) => `#${id.slice(0, 4).toUpperCase()}`,
        });
        if (!result.ok) throw ruleError(result.error);
        await persistDiff(tx, inv.organizationId, before, result.state, ctx.keys);
        // Chat 08.5 · C: a administração trouxe a pessoa de volta → a marca de removido sai
        await clearRemovedEmail(tx, inv.organizationId, ctx.keys.removedEmailKey, user.email);
        for (const a of result.audit) {
          await recordAudit(tx, { organizationId: inv.organizationId, actorId: a.meta?.actorId ?? user.id, action: a.action, message: a.message, targetType: a.meta?.targetType, targetId: a.meta?.targetId, ip: request.ip });
        }
        await recordAudit(tx, {
          organizationId: inv.organizationId,
          actorId: user.id,
          action: 'login',
          message: { key: SERVER_AUDIT_MESSAGES.login, params: { method: { key: AUDIT_PARAM_KEYS.methodInvitation } } },
          targetType: 'user',
          targetId: user.id,
          ip: request.ip,
        });
        return { userId: user.id, organizationId: inv.organizationId };
      });
      try {
        outcome = await acceptInTransaction();
      } catch (err) {
        if (!(err instanceof HttpError && err.code === 'invalidCredentials')) await ctx.limiters.inviteAccept.release(key);
        throw err;
      }

      await ctx.limiters.inviteAccept.reset(key);
      const [user] = await ctx.db.select().from(users).where(eq(users.id, outcome.userId));
      const membership = await findMembership(ctx.db, outcome.userId, outcome.organizationId);
      if (!user || !membership) throw apiError(500, 'internal');
      return issueSession(ctx, request, reply, user, membership);
    },
  );
}

/**
 * Chat 08.5 · B — "Reenviar e-mail" de um convite pendente: quem criou o convite ou quem gerencia membros. Mesmos
 * limites de todo envio (pessoa e destinatário). O link do e-mail é o MESMO do convite (o token cifrado continua).
 */
export function registerInvitationResendRoute(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Params: { id: string }; Body: { lang?: string } | null }>(
    '/invitations/:id/resend',
    { preHandler: requireAuth(ctx), schema: { body: { type: ['object', 'null'], additionalProperties: false, properties: { lang: { type: 'string', enum: ['pt-BR', 'en'] } } } } },
    async (request) => {
      const auth = request.auth!;
      if (!ctx.mailer?.enabled || !ctx.config.appUrl) throw apiError(503, 'mailUnavailable');
      const state = await loadRulesState(ctx.db, auth.organizationId, ctx.keys);
      const inv = state.invitations.find((i) => i.id === request.params.id);
      if (!inv) throw apiError(404, 'notFound');
      if (inv.invitedBy !== auth.userId) {
        const d = explain(workspaceContext(viewerOf(state, auth), rulesView(state).policies), 'workspace.members.manage');
        if (!d.allowed) throw forbidden(d.reason);
      }
      const status = invitationStatus(inv);
      if (status !== 'pending') throw ruleError({ key: status === 'accepted' ? 'workspace.errors.inviteAccepted' : status === 'revoked' ? 'workspace.errors.inviteRevoked' : 'workspace.errors.inviteExpired' });
      if (!inv.token) throw apiError(500, 'internal');
      await assertInviteMailAllowed(ctx, auth.userId, inv.email);
      try {
        await sendInvitationEmail(ctx, { organizationId: auth.organizationId, invitationId: inv.id, token: inv.token, lang: mailLang(request.body?.lang), actorId: auth.userId, ip: request.ip, resend: true });
      } catch (err) {
        request.log.warn({ mail: mailErrorForLog(err) }, 'invitation e-mail failed');
        throw apiError(502, 'mailSendFailed');
      }
      return { ok: true };
    },
  );
}
