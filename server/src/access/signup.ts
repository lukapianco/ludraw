/**
 * LuDraw server — cadastro com o e-mail da organização (Chat 08.5 · C).
 *
 *  POST /signup {email, lang?}   SEMPRE 202 (com a política ATIVA; senão 404). O trabalho roda depois da resposta:
 *      · domínio (depois do ÚLTIMO "@", exato) fora da lista, e-mail de pessoa removida, conta suspensa ou o teto do
 *        dia atingido → nada é enviado;
 *      · conta ativa → "você já tem conta";
 *      · senão → link de uso único para concluir (`#/signup/<token>`, conclusão em invitations/linkRoutes.ts).
 *  GET  /admin/signup/status     estado para a administração (política, o que falta, domínios no teto do dia).
 *
 * "Ativa" = política ligada + e-mail funcionando (SMTP e LUDRAW_APP_URL) + domínio cadastrado + uma organização.
 * O teto diário conta CONTAS CRIADAS (não e-mails pedidos), para ninguém esgotá-lo pedindo links para terceiros.
 */
import { and, count, eq, gt, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AUDIT_PARAM_KEYS, MAIL_TOKEN_MINUTES, SERVER_AUDIT_MESSAGES, type DomainSignupMissing, type DomainSignupRequest, type DomainSignupStatus } from '../../../src/utils/apiContract';
import { explain, workspaceContext } from '../../../src/utils/permissions';
import { colorFromString } from '../../../src/utils/color';
import { createId } from '../../../src/utils/id';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';
import { applyDomainSignup, parseSignupEmail, rulesView, signupDomainAllowed } from '../../../src/utils/workspaceRules';
import { hashPassword } from '../auth/passwords';
import { requireAuth } from '../auth/authenticate';
import { findMembership, findUserByEmail } from '../auth/identity';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { emailTokens, orgMemberships, organizations, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { apiError, descriptorError, forbidden, tooManyAttempts } from '../lib/errors';
import { assertCookieRequest } from '../lib/http';
import type { Limiter } from '../lib/limiter';
import { issueEmailToken } from '../mail/emailTokens';
import { appLink, mailLang, renderMail } from '../mail/templates';
import { readSetup } from '../setup/provision';
import { ruleError, viewerOf } from '../workspace/service';
import { loadOrganization, loadRulesState, persistDiff } from '../workspace/state';
import { isRemovedEmail } from './removedEmails';

const DAY_MS = 24 * 60 * 60 * 1000;

async function spend(limiter: Limiter, key: string): Promise<void> {
  const r = await limiter.hit(key);
  if (!r.allowed) throw tooManyAttempts(r.retryAfterMs / 1000);
}

export interface DomainSignupState {
  orgId: string | null;
  orgName: string;
  policy: boolean;
  active: boolean;
  missing: DomainSignupMissing[];
  domains: string[];
}

/** Estado do cadastro pelo domínio na instalação (uma organização). Lê o banco: nunca no caminho anti-enumeração. */
export async function domainSignupState(ctx: AppContext, db: Db = ctx.db): Promise<DomainSignupState> {
  const setup = await readSetup(db);
  if (!setup.organizationId) return { orgId: null, orgName: '', policy: false, active: false, missing: [], domains: [] };
  const org = await loadOrganization(db, setup.organizationId);
  const policy = org.policies?.allowDomainSignup === true;
  const missing: DomainSignupMissing[] = [];
  if (!ctx.mailer?.enabled || !ctx.config.appUrl) missing.push('mail');
  if (!org.allowedEmailDomains.length) missing.push('domain');
  if (setup.mode === 'multi_org') missing.push('multiOrg');
  return { orgId: org.id, orgName: org.name, policy, active: policy && missing.length === 0, missing, domains: org.allowedEmailDomains };
}

/** Contas criadas pelo cadastro com o e-mail da organização, neste domínio, nas últimas 24 h. */
export async function signupsLastDay(db: Db, orgId: string, domain: string, now = Date.now()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .innerJoin(orgMemberships, and(eq(orgMemberships.userId, users.id), eq(orgMemberships.organizationId, orgId)))
    .where(and(eq(users.createdVia, 'signup'), gt(users.createdAt, new Date(now - DAY_MS)), like(users.email, `%@${domain}`)));
  return Number(row?.n ?? 0);
}

export function registerDomainSignupRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: DomainSignupRequest }>(
    '/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, lang: { type: 'string', enum: ['pt-BR', 'en'] } },
        },
      },
    },
    async (request, reply) => {
      assertCookieRequest(ctx.config, request);
      const state = await domainSignupState(ctx);
      if (!state.active || !state.orgId) throw apiError(404, 'notFound');
      // só análise de texto aqui (sem banco pelo e-mail): a resposta é a mesma para qualquer endereço
      const raw = request.body.email;
      const parsed = parseSignupEmail(raw);
      await spend(ctx.limiters.mailIp, request.ip);
      await spend(ctx.limiters.mailAddress, `signup|${parsed?.email ?? raw.trim().toLowerCase()}`);
      const lang = mailLang(request.body.lang);
      const orgId = state.orgId;
      const orgName = state.orgName;
      ctx.later!.run(async () => {
        if (!parsed) return;
        const now = await domainSignupState(ctx);
        if (!now.active || !signupDomainAllowed(parsed.domain, now.domains)) return;
        if (await isRemovedEmail(ctx.db, orgId, ctx.keys.removedEmailKey, parsed.email)) return;
        const appUrl = ctx.config.appUrl ?? '';
        const existing = await findUserByEmail(ctx.db, parsed.email);
        if (existing) {
          const member = await findMembership(ctx.db, existing.id, orgId);
          // conta ativa: lembrete de que já existe; suspensa/removida: nada (não reentra pelo domínio)
          if (!existing.anonymizedAt && member?.status === 'active') {
            await ctx.mailer!.send({ to: parsed.email, ...renderMail({ kind: 'joinExisting', lang, org: orgName, url: appLink(appUrl, 'login') }) });
          }
          return;
        }
        if ((await signupsLastDay(ctx.db, orgId, parsed.domain)) >= ctx.config.domainSignupMaxPerDay) {
          request.log.warn({ event: 'domain_signup_daily_limit' }, 'domain sign-up: daily limit reached (LUDRAW_DOMAIN_SIGNUP_MAX_PER_DAY); no e-mail sent');
          return;
        }
        const token = await issueEmailToken(ctx.db, { purpose: 'signup', organizationId: orgId, email: parsed.email, payload: { via: 'domain' }, ttlMinutes: MAIL_TOKEN_MINUTES.signup });
        await ctx.mailer!.send({ to: parsed.email, ...renderMail({ kind: 'domainSignup', lang, org: orgName, url: appLink(appUrl, `signup/${token}`), params: { minutes: MAIL_TOKEN_MINUTES.signup } }) });
      });
      return reply.code(202).send({ ok: true });
    },
  );

  app.get('/admin/signup/status', { preHandler: requireAuth(ctx) }, async (request) => {
    const auth = request.auth!;
    const rules = await loadRulesState(ctx.db, auth.organizationId, ctx.keys);
    const decision = explain(workspaceContext(viewerOf(rules, auth), rulesView(rules).policies), 'workspace.policies.manage');
    if (!decision.allowed) throw forbidden(decision.reason);
    const state = await domainSignupState(ctx);
    const reached: DomainSignupStatus['reached'] = [];
    if (state.orgId) {
      for (const domain of state.domains) {
        const n = await signupsLastDay(ctx.db, state.orgId, domain);
        if (n >= ctx.config.domainSignupMaxPerDay) reached.push({ domain, count: n });
      }
    }
    const status: DomainSignupStatus = { policy: state.policy, active: state.active, missing: state.missing, maxPerDay: ctx.config.domainSignupMaxPerDay, reached };
    return status;
  });
}

/* ------------------------------- conclusão (#/signup/<token>) ------------------------------- */

type SignupToken = { email: string; organizationId: string };

/** Prévia do link de cadastro pelo domínio: só com a política ativa e o domínio ainda na lista. */
export async function domainSignupPreviewAllowed(ctx: AppContext, token: SignupToken): Promise<boolean> {
  const state = await domainSignupState(ctx);
  const parsed = parseSignupEmail(token.email);
  return state.active && state.orgId === token.organizationId && !!parsed && signupDomainAllowed(parsed.domain, state.domains);
}

/**
 * Conclui o cadastro pelo domínio DENTRO da transação de `POST /signup/:token/complete` (o token já foi
 * consumido): organização travada, política e domínio conferidos de novo, removido e teto do dia, conta nova
 * (e-mail verificado, `createdVia: 'signup'`) e participação como membro sem time.
 */
export async function completeDomainSignup(
  ctx: AppContext,
  tx: Db,
  token: SignupToken,
  input: { name: string; password: string; ip: string; now: number },
): Promise<{ userId: string; organizationId: string }> {
  const { name, password, ip, now } = input;
  await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, token.organizationId)).for('update');
  const state = await domainSignupState(ctx, tx);
  const parsed = parseSignupEmail(token.email);
  if (!state.active || state.orgId !== token.organizationId || !parsed || !signupDomainAllowed(parsed.domain, state.domains)) throw apiError(400, 'tokenInvalid');
  if (await isRemovedEmail(tx, token.organizationId, ctx.keys.removedEmailKey, parsed.email)) throw apiError(400, 'tokenInvalid');
  // a pessoa provou o e-mail: aqui dá para dizer que já existe conta
  if (await findUserByEmail(tx, parsed.email)) throw apiError(409, 'emailInUse');
  // teto do dia: CONTAS criadas (contadas com a organização travada — dois cadastros juntos não passam do teto)
  if ((await signupsLastDay(tx, token.organizationId, parsed.domain, now)) >= ctx.config.domainSignupMaxPerDay) throw apiError(429, 'domainSignupDailyLimit');
  const weak = checkPasswordStrength(password, { email: parsed.email, name });
  if (weak) throw descriptorError(400, 'weakPassword', weak);
  const id = createId(16);
  const avatarColor = colorFromString(name);
  await tx.insert(users).values({
    id,
    email: parsed.email,
    name,
    avatarColor,
    passwordHash: await hashPassword(password),
    authProvider: 'local',
    createdVia: 'signup',
    createdAt: new Date(now),
    lastSeenAt: new Date(now),
    emailVerifiedAt: new Date(now),
  });
  const before = await loadRulesState(tx, token.organizationId, ctx.keys);
  const result = applyDomainSignup(before, { id, name, email: parsed.email, avatarColor }, { now, newId: () => createId(16), newToken: () => '', anonymizedName: (u) => `#${u.slice(0, 4).toUpperCase()}` });
  if (!result.ok) throw ruleError(result.error);
  await persistDiff(tx, token.organizationId, before, result.state, ctx.keys);
  for (const a of result.audit) {
    await recordAudit(tx, { organizationId: token.organizationId, actorId: a.meta?.actorId ?? id, action: a.action, message: a.message, targetType: a.meta?.targetType, targetId: a.meta?.targetId, ip });
  }
  await recordAudit(tx, {
    organizationId: token.organizationId,
    actorId: id,
    action: 'login',
    message: { key: SERVER_AUDIT_MESSAGES.login, params: { method: { key: AUDIT_PARAM_KEYS.methodSignup } } },
    targetType: 'user',
    targetId: id,
    ip,
  });
  // outros links de cadastro pendentes para este e-mail deixam de valer
  await tx.update(emailTokens).set({ usedAt: new Date(now) }).where(and(eq(emailTokens.purpose, 'signup'), eq(emailTokens.email, parsed.email)));
  return { userId: id, organizationId: token.organizationId };
}
