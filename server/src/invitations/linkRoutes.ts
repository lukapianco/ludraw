/**
 * LuDraw server — link de convite GERAL (Chat 08.5 · B) e conclusão de cadastro pelo e-mail.
 *
 *  GET  /join/:token              prévia (organização, papel, domínio exigido, situação, modo)
 *  POST /join/:token              e-mail (+ nome) → resposta SEMPRE igual, exista ou não conta com o e-mail
 *      · com e-mail no servidor: link de cadastro (conta nova) ou aviso "você já tem conta" — depois da resposta;
 *      · sem e-mail: vira PEDIDO na fila (sem senha: ninguém provou ser dono do endereço); aprovar gera um convite.
 *  GET  /signup/:token            prévia do cadastro aberto pelo e-mail
 *  POST /signup/:token/complete   nome + senha → numa transação só: token consumido, organização e link travados
 *                                 (FOR UPDATE), conta criada (e-mail confirmado), `uses++`, Audit Log → sessão.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  ACCESS_REQUEST_LIMITS,
  AUDIT_PARAM_KEYS,
  MAIL_TOKEN_MINUTES,
  SERVER_AUDIT_MESSAGES,
  type JoinLinkPreview,
  type JoinRequest,
  type JoinResponse,
  type SignupFinishRequest,
  type SignupPreview,
} from '../../../src/utils/apiContract';
import { colorFromString } from '../../../src/utils/color';
import { createId } from '../../../src/utils/id';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';
import { isValidEmail } from '../../../src/utils/workspace';
import { applyInviteLinkJoin, inviteLinkStatus, validateInviteLinkJoin, type WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import { completeDomainSignup, domainSignupPreviewAllowed } from '../access/signup';
import { findMembership, findUserByEmail } from '../auth/identity';
import { hashPassword } from '../auth/passwords';
import { issueSession } from '../auth/routes';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { accessRequests, emailTokens, inviteLinks, organizations, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { sha256Hex } from '../lib/crypto';
import { apiError, descriptorError, tooManyAttempts } from '../lib/errors';
import { assertCookieRequest } from '../lib/http';
import type { Limiter } from '../lib/limiter';
import { consumeEmailToken, EMAIL_TOKEN_PATTERN, issueEmailToken, peekEmailToken } from '../mail/emailTokens';
import { appLink, mailLang, renderMail } from '../mail/templates';
import { loadOrganization, loadRulesState, persistDiff } from '../workspace/state';
import { ruleError } from '../workspace/service';

/** Tokens de link geral emitidos pelo cliente/servidor (`randomUrlToken(24)` = 32 caracteres). */
const LINK_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;
const langProp = { type: 'string', enum: ['pt-BR', 'en'] } as const;

async function spend(limiter: Limiter, key: string): Promise<void> {
  const r = await limiter.hit(key);
  if (!r.allowed) throw tooManyAttempts(r.retryAfterMs / 1000);
}

type LinkRow = typeof inviteLinks.$inferSelect;

function linkView(row: LinkRow) {
  return {
    id: row.id,
    role: row.role,
    teamIds: row.teamIds.length ? row.teamIds : undefined,
    projectId: row.projectId ?? undefined,
    boardId: row.boardId ?? undefined,
    boardRole: row.boardRole ?? undefined,
    allowedDomain: row.allowedDomain,
    maxUses: row.maxUses,
    uses: row.uses,
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    revokedAt: row.revokedAt ? row.revokedAt.getTime() : null,
  };
}

/** Só a organização (para as regras do link), sem carregar o estado inteiro. */
async function minimalState(db: Db, orgId: string): Promise<WorkspaceRulesState> {
  return { workspace: await loadOrganization(db, orgId), directory: [], teams: [], projects: [], invitations: [], boards: [] };
}

export function registerInviteLinkRoutes(app: FastifyInstance, ctx: AppContext): void {
  const mailOn = () => !!ctx.mailer?.enabled && !!ctx.config.appUrl;
  const later = (job: () => Promise<void>) => ctx.later!.run(job);

  async function findLink(token: string): Promise<LinkRow> {
    if (!LINK_TOKEN_RE.test(token)) throw apiError(404, 'notFound');
    const [row] = await ctx.db.select().from(inviteLinks).where(eq(inviteLinks.tokenHash, sha256Hex(token)));
    if (!row) throw apiError(404, 'notFound');
    return row;
  }

  app.get<{ Params: { token: string } }>('/join/:token', async (request) => {
    await spend(ctx.limiters.tokenIp, request.ip);
    const row = await findLink(request.params.token);
    const org = await loadOrganization(ctx.db, row.organizationId);
    const preview: JoinLinkPreview = {
      organizationName: org.name,
      role: row.role,
      allowedDomain: row.allowedDomain,
      status: inviteLinkStatus(linkView(row), Date.now()),
      mode: mailOn() ? 'email' : 'approval',
    };
    return preview;
  });

  app.post<{ Params: { token: string }; Body: JoinRequest }>(
    '/join/:token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, name: { type: 'string', maxLength: ACCESS_REQUEST_LIMITS.nameMax }, lang: langProp },
        },
      },
    },
    async (request, reply) => {
      assertCookieRequest(ctx.config, request);
      await spend(ctx.limiters.tokenIp, request.ip);
      const row = await findLink(request.params.token);
      const email = request.body.email.trim().toLowerCase();
      if (!isValidEmail(email)) throw apiError(400, 'invalidEmail');
      // regras do LINK (situação, domínio): nada aqui depende de existir conta com o e-mail
      const invalid = validateInviteLinkJoin(await minimalState(ctx.db, row.organizationId), linkView(row), email, Date.now());
      if (invalid) throw ruleError(invalid);
      const mode: JoinResponse['mode'] = mailOn() ? 'email' : 'approval';
      const name = (request.body.name ?? '').trim();
      if (mode === 'approval' && name.length < 2) throw apiError(400, 'nameRequired');
      await spend(ctx.limiters.mailIp, request.ip);
      await spend(ctx.limiters.mailAddress, `join|${email}`);
      const lang = mailLang(request.body.lang);
      const orgId = row.organizationId;
      const linkId = row.id;
      later(async () => {
        const existing = await findUserByEmail(ctx.db, email);
        const member = existing ? await findMembership(ctx.db, existing.id, orgId) : null;
        const hasAccount = !!existing && !existing.anonymizedAt && !!member && member.status !== 'removed';
        if (mode === 'email') {
          const org = await loadOrganization(ctx.db, orgId);
          const appUrl = ctx.config.appUrl!;
          if (existing) {
            await ctx.mailer!.send({ to: email, ...renderMail({ kind: 'joinExisting', lang, org: org.name, url: appLink(appUrl, 'login') }) });
            return;
          }
          const token = await issueEmailToken(ctx.db, { purpose: 'signup', organizationId: orgId, email, payload: { via: 'link', linkId }, ttlMinutes: MAIL_TOKEN_MINUTES.signup });
          await ctx.mailer!.send({ to: email, ...renderMail({ kind: 'joinLink', lang, org: org.name, url: appLink(appUrl, `signup/${token}`), params: { minutes: MAIL_TOKEN_MINUTES.signup } }) });
          return;
        }
        // sem e-mail: pedido na fila (um aberto por e-mail; teto de pedidos esperando a administração)
        const open = await ctx.db
          .select({ id: accessRequests.id, email: accessRequests.email })
          .from(accessRequests)
          .where(and(eq(accessRequests.organizationId, orgId), inArray(accessRequests.status, ['pending', 'unconfirmed'])));
        if (open.some((r) => r.email === email)) return;
        if (open.length >= ACCESS_REQUEST_LIMITS.maxOpen) {
          request.log.warn({ event: 'access_queue_full' }, 'access request dropped: queue is full');
          return;
        }
        // Chat 08.7 · R3: o índice único parcial decide a corrida (mesmo e-mail simultâneo = um pedido só)
        await ctx.db.insert(accessRequests).values({ id: createId(16), organizationId: orgId, kind: 'link', inviteLinkId: linkId, email, name, status: 'pending', existingAccount: hasAccount }).onConflictDoNothing();
      });
      const body: JoinResponse = { ok: true, mode };
      return reply.code(202).send(body);
    },
  );

  app.get<{ Params: { token: string } }>('/signup/:token', async (request) => {
    await spend(ctx.limiters.tokenIp, request.ip);
    const row = await peekEmailToken(ctx.db, request.params.token, 'signup');
    // Chat 08.5 · C: link do cadastro com o e-mail da organização (sempre membro)
    if (row && (row.payload as { via?: string } | null)?.via === 'domain') {
      if (!(await domainSignupPreviewAllowed(ctx, row))) throw apiError(400, 'tokenInvalid');
      const org = await loadOrganization(ctx.db, row.organizationId);
      const preview: SignupPreview = { email: row.email, organizationName: org.name, role: 'member' };
      return preview;
    }
    const linkId = (row?.payload as { linkId?: string } | null)?.linkId;
    if (!row || !linkId) throw apiError(400, 'tokenInvalid');
    const [link] = await ctx.db.select().from(inviteLinks).where(eq(inviteLinks.id, linkId));
    if (!link || inviteLinkStatus(linkView(link), Date.now()) !== 'active') throw apiError(400, 'tokenInvalid');
    const org = await loadOrganization(ctx.db, row.organizationId);
    const preview: SignupPreview = { email: row.email, organizationName: org.name, role: link.role };
    return preview;
  });

  app.post<{ Params: { token: string }; Body: SignupFinishRequest }>(
    '/signup/:token/complete',
    {
      schema: {
        params: { type: 'object', properties: { token: { type: 'string', pattern: EMAIL_TOKEN_PATTERN } } },
        body: {
          type: 'object',
          required: ['name', 'password'],
          additionalProperties: false,
          properties: { name: { type: 'string', maxLength: ACCESS_REQUEST_LIMITS.nameMax }, password: { type: 'string', minLength: 1, maxLength: 1024 } },
        },
      },
    },
    async (request, reply) => {
      assertCookieRequest(ctx.config, request);
      await spend(ctx.limiters.tokenIp, request.ip);
      const name = request.body.name.trim();
      if (name.length < 2) throw apiError(400, 'nameRequired');
      const now = Date.now();
      const outcome = await ctx.db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as Db;
        const token = await consumeEmailToken(tx, request.params.token, 'signup', new Date(now));
        if (token && (token.payload as { via?: string } | null)?.via === 'domain') {
          return completeDomainSignup(ctx, tx, token, { name, password: request.body.password, ip: request.ip, now });
        }
        const linkId = (token?.payload as { linkId?: string } | null)?.linkId;
        if (!token || !linkId) throw apiError(400, 'tokenInvalid');
        const email = token.email;
        // organização e link travados: dois cadastros ao mesmo tempo nunca passam do limite de usos
        await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, token.organizationId)).for('update');
        const [lockedLink] = await tx.select().from(inviteLinks).where(eq(inviteLinks.id, linkId)).for('update');
        if (!lockedLink) throw ruleError({ key: 'workspace.errors.inviteLinkNotFound' });
        const before = await loadRulesState(tx, token.organizationId, ctx.keys);
        const link = (before.inviteLinks ?? []).find((l) => l.id === linkId);
        const invalid = validateInviteLinkJoin(before, link, email, now);
        if (invalid || !link) throw ruleError(invalid ?? { key: 'workspace.errors.inviteLinkNotFound' });
        // a pessoa provou o e-mail: aqui dá para dizer que já existe conta
        if (await findUserByEmail(tx, email)) throw apiError(409, 'emailInUse');
        const weak = checkPasswordStrength(request.body.password, { email, name });
        if (weak) throw descriptorError(400, 'weakPassword', weak);
        const id = createId(16);
        await tx.insert(users).values({
          id,
          email,
          name,
          avatarColor: colorFromString(name),
          passwordHash: await hashPassword(request.body.password),
          authProvider: 'local',
          createdVia: 'invite_link',
          createdAt: new Date(now),
          lastSeenAt: new Date(now),
          emailVerifiedAt: new Date(now),
        });
        const result = applyInviteLinkJoin(before, link, { id, name, email, avatarColor: colorFromString(name) }, { now, newId: () => createId(16), newToken: () => '', anonymizedName: (u) => `#${u.slice(0, 4).toUpperCase()}` });
        if (!result.ok) throw ruleError(result.error);
        await persistDiff(tx, token.organizationId, before, result.state, ctx.keys);
        for (const a of result.audit) {
          await recordAudit(tx, { organizationId: token.organizationId, actorId: a.meta?.actorId ?? id, action: a.action, message: a.message, targetType: a.meta?.targetType, targetId: a.meta?.targetId, ip: request.ip });
        }
        await recordAudit(tx, {
          organizationId: token.organizationId,
          actorId: id,
          action: 'login',
          message: { key: SERVER_AUDIT_MESSAGES.login, params: { method: { key: AUDIT_PARAM_KEYS.methodInviteLink } } },
          targetType: 'user',
          targetId: id,
          ip: request.ip,
        });
        // outros links de cadastro pendentes para este e-mail deixam de valer
        await tx.update(emailTokens).set({ usedAt: new Date(now) }).where(and(eq(emailTokens.purpose, 'signup'), eq(emailTokens.email, email)));
        return { userId: id, organizationId: token.organizationId };
      });
      const [user] = await ctx.db.select().from(users).where(eq(users.id, outcome.userId));
      const membership = await findMembership(ctx.db, outcome.userId, outcome.organizationId);
      if (!user || !membership) throw apiError(500, 'internal');
      return issueSession(ctx, request, reply, user, membership);
    },
  );
}

