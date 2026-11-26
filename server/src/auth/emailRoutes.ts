/**
 * LuDraw server — rotas que dependem de e-mail (Chat 08.5): recuperar a senha, verificar o e-mail e o
 * e-mail de teste da administração.
 *
 * Regras fixas:
 *  - Sem e-mail configurado, tudo aqui responde `mailUnavailable` (o resto do servidor não muda).
 *  - "Esqueci a senha" responde SEMPRE igual (202), exista ou não a conta: a rota não consulta o banco
 *    pelo e-mail; a busca, o token e o envio rodam depois da resposta (`ctx.later`).
 *  - Token de uso único, guardado só em hash; vencido, usado ou de outro tipo dá o mesmo erro.
 *  - Limite por destinatário e por IP em tudo o que envia; limite por IP em tudo o que aceita token.
 *  - Redefinir a senha encerra todas as sessões da pessoa e derruba o tempo real dela na hora.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  MAIL_TOKEN_MINUTES,
  SERVER_AUDIT_MESSAGES,
  type ForgotPasswordRequest,
  type MailLang,
  type MailLangRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
} from '../../../src/utils/apiContract';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';
import { explain, workspaceContext } from '../../../src/utils/permissions';
import { isValidEmail } from '../../../src/utils/workspace';
import { rulesView } from '../../../src/utils/workspaceRules';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { organizations, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { apiError, descriptorError, forbidden, tooManyAttempts } from '../lib/errors';
import { assertCookieRequest } from '../lib/http';
import type { Limiter } from '../lib/limiter';
import { consumeEmailToken, EMAIL_TOKEN_PATTERN, issueEmailToken, peekEmailToken } from '../mail/emailTokens';
import { disabledMailer, mailErrorForLog, mailFailureCode, type Mailer } from '../mail/mailer';
import { assertMailPanel } from '../mail/routes';
import { appLink, mailLang, renderMail } from '../mail/templates';
import { loadRulesState } from '../workspace/state';
import { viewerOf } from '../workspace/service';
import { requireAuth } from './authenticate';
import { findUserByEmail, primaryMembership } from './identity';
import { hashPassword } from './passwords';
import { endUserSessions } from './sessions';

const langProp = { type: 'string', enum: ['pt-BR', 'en'] } as const;
const tokenProp = { type: 'string', pattern: EMAIL_TOKEN_PATTERN } as const;

const forgotSchema = {
  body: { type: 'object', required: ['email'], additionalProperties: false, properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, lang: langProp } },
} as const;
const resetSchema = {
  body: { type: 'object', required: ['token', 'password'], additionalProperties: false, properties: { token: tokenProp, password: { type: 'string', minLength: 1, maxLength: 1024 } } },
} as const;
const verifySchema = { body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: tokenProp } } } as const;
const langSchema = { body: { type: ['object', 'null'], additionalProperties: false, properties: { lang: langProp } } } as const;

/** Conta a tentativa e recusa quando o limite estourou. */
async function spend(limiter: Limiter, key: string): Promise<void> {
  const r = await limiter.hit(key);
  if (!r.allowed) throw tooManyAttempts(r.retryAfterMs / 1000);
}

async function orgName(db: Db, organizationId: string): Promise<string> {
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
  return org?.name ?? 'LuDraw';
}

export function registerEmailRoutes(app: FastifyInstance, ctx: AppContext): void {
  // lidos a cada pedido: os testes trocam o carteiro com o servidor no ar
  const mailer = (): Mailer => ctx.mailer ?? disabledMailer;
  const appUrl = (): string => ctx.config.appUrl ?? '';
  const requireMail = (): Mailer => {
    const m = mailer();
    if (!m.enabled || !appUrl()) throw apiError(503, 'mailUnavailable');
    return m;
  };
  const later = (request: FastifyRequest, job: () => Promise<void>): void => {
    if (ctx.later) ctx.later.run(job);
    else void job().catch((err) => request.log.error({ mail: mailErrorForLog(err) }, 'deferred job failed'));
  };

  /** Depois da resposta: procura a conta e, se couber, envia o link (ou o aviso de que a conta entra pelo SSO). */
  async function sendResetMail(email: string, lang: MailLang): Promise<void> {
    const m = mailer();
    const user = await findUserByEmail(ctx.db, email);
    if (!user || user.anonymizedAt || user.blockedAt) return;
    const membership = await primaryMembership(ctx.db, user.id);
    if (!membership || membership.status !== 'active' || membership.anonymizedAt) return;
    const org = await orgName(ctx.db, membership.organizationId);
    if (!user.passwordHash) {
      // conta sem senha local: só o provedor da empresa abre a porta
      if (!ctx.config.oidc) return;
      await m.send({ to: user.email, ...renderMail({ kind: 'resetPasswordSso', lang, org, url: appLink(appUrl(), 'login'), params: { provider: ctx.config.oidc.providerName } }) });
      return;
    }
    const token = await issueEmailToken(ctx.db, { purpose: 'reset_password', organizationId: membership.organizationId, userId: user.id, email: user.email, ttlMinutes: MAIL_TOKEN_MINUTES.resetPassword });
    await m.send({
      to: user.email,
      ...renderMail({ kind: 'resetPassword', lang, org, url: appLink(appUrl(), `reset/${token}`), params: { minutes: MAIL_TOKEN_MINUTES.resetPassword } }),
    });
  }

  app.post<{ Body: ForgotPasswordRequest }>('/auth/password/forgot', { schema: forgotSchema }, async (request, reply) => {
    assertCookieRequest(ctx.config, request);
    requireMail();
    const email = request.body.email.trim().toLowerCase();
    if (!isValidEmail(email)) throw apiError(400, 'invalidEmail');
    // os limites valem para qualquer endereço, exista ou não a conta (a recusa também não revela nada)
    await spend(ctx.limiters.mailIp, request.ip);
    await spend(ctx.limiters.mailAddress, `reset|${email}`);
    const lang = mailLang(request.body.lang);
    later(request, () => sendResetMail(email, lang));
    return reply.code(202).send({ ok: true });
  });

  app.get<{ Params: { token: string } }>('/auth/password/reset/:token', async (request) => {
    await spend(ctx.limiters.tokenIp, request.ip);
    const row = await peekEmailToken(ctx.db, request.params.token, 'reset_password');
    return { valid: !!row };
  });

  app.post<{ Body: ResetPasswordRequest }>('/auth/password/reset', { schema: resetSchema }, async (request) => {
    assertCookieRequest(ctx.config, request);
    await spend(ctx.limiters.tokenIp, request.ip);
    const { token, password } = request.body;
    const now = new Date();
    const user = await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const row = await consumeEmailToken(tx, token, 'reset_password', now);
      if (!row || !row.userId) throw apiError(400, 'tokenInvalid');
      const [account] = await tx.select().from(users).where(eq(users.id, row.userId)).for('update');
      // o e-mail mudou ou a conta saiu depois do pedido: o link não vale mais
      if (!account || account.anonymizedAt || account.blockedAt || account.email !== row.email) throw apiError(400, 'tokenInvalid');
      // senha fraca desfaz a transação: o link continua valendo para outra tentativa
      const weak = checkPasswordStrength(password, { email: account.email, name: account.name });
      if (weak) throw descriptorError(400, 'weakPassword', weak);
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(password), mustChangePassword: false, emailVerifiedAt: account.emailVerifiedAt ?? now })
        .where(eq(users.id, account.id));
      return account;
    });
    const count = await endUserSessions(ctx, user.id, 'password_reset');
    const membership = await primaryMembership(ctx.db, user.id);
    if (membership) {
      await recordAudit(ctx.db, {
        organizationId: membership.organizationId,
        actorId: user.id,
        action: 'password_reset_email',
        message: { key: SERVER_AUDIT_MESSAGES.passwordResetEmail },
        targetType: 'user',
        targetId: user.id,
        count,
        ip: request.ip,
      });
    }
    return { ok: true };
  });

  app.post<{ Body: MailLangRequest | null }>('/auth/email/verify/send', { schema: langSchema, preHandler: requireAuth(ctx, { allowMustChangePassword: true }) }, async (request, reply) => {
    const auth = request.auth!;
    requireMail();
    if (auth.user.emailVerifiedAt) return { ok: true, already: true };
    await spend(ctx.limiters.mailUser, auth.userId);
    await spend(ctx.limiters.mailAddress, `verify|${auth.user.email}`);
    const lang = mailLang(request.body?.lang);
    later(request, async () => {
      const token = await issueEmailToken(ctx.db, { purpose: 'verify_email', organizationId: auth.organizationId, userId: auth.userId, email: auth.user.email, ttlMinutes: MAIL_TOKEN_MINUTES.verifyEmail });
      await mailer().send({
        to: auth.user.email,
        ...renderMail({ kind: 'verifyEmail', lang, org: await orgName(ctx.db, auth.organizationId), url: appLink(appUrl(), `verify/${token}`), params: { minutes: MAIL_TOKEN_MINUTES.verifyEmail } }),
      });
    });
    return reply.code(202).send({ ok: true });
  });

  // o token basta: a pessoa pode abrir o link noutro navegador, sem sessão
  app.post<{ Body: VerifyEmailRequest }>('/auth/email/verify', { schema: verifySchema }, async (request) => {
    assertCookieRequest(ctx.config, request);
    await spend(ctx.limiters.tokenIp, request.ip);
    const now = new Date();
    await ctx.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const row = await consumeEmailToken(tx, request.body.token, 'verify_email', now);
      if (!row || !row.userId) throw apiError(400, 'tokenInvalid');
      const [account] = await tx.select().from(users).where(eq(users.id, row.userId)).for('update');
      if (!account || account.anonymizedAt || account.email !== row.email) throw apiError(400, 'tokenInvalid');
      if (!account.emailVerifiedAt) await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, account.id));
    });
    return { ok: true };
  });

  // administração: confere se o envio funciona, mandando uma mensagem para o próprio e-mail de quem pediu
  app.post<{ Body: MailLangRequest | null }>('/admin/mail/test', { schema: langSchema, preHandler: requireAuth(ctx) }, async (request) => {
    const auth = request.auth!;
    const state = await loadRulesState(ctx.db, auth.organizationId, ctx.keys);
    const decision = explain(workspaceContext(viewerOf(state, auth), rulesView(state).policies), 'workspace.policies.manage');
    if (!decision.allowed) throw forbidden(decision.reason);
    // Chat 09 · R5 (D12): no multi_org o botão de teste não existe (o e-mail é do servidor inteiro)
    await assertMailPanel(ctx);
    const m = requireMail();
    // B2: limite próprio do botão (além do de e-mails por pessoa) — o teste não vira varredor de portas
    await spend(ctx.limiters.mailTest, auth.userId);
    await spend(ctx.limiters.mailUser, auth.userId);
    try {
      await m.send({ to: auth.user.email, ...renderMail({ kind: 'testMail', lang: mailLang(request.body?.lang), org: state.workspace.name }) });
    } catch (err) {
      request.log.warn({ mail: mailErrorForLog(err) }, 'test e-mail failed');
      // categoria só (conexão, TLS, autenticação, host recusado); a resposta do servidor remoto não volta
      const code = mailFailureCode(err);
      throw apiError(code === 'mailServerLimit' ? 429 : 502, code);
    }
    await recordAudit(ctx.db, {
      organizationId: auth.organizationId,
      actorId: auth.userId,
      action: 'mail_test_sent',
      message: { key: SERVER_AUDIT_MESSAGES.mailTestSent },
      targetType: 'workspace',
      ip: request.ip,
    });
    return { ok: true };
  });
}
