/**
 * LuDraw server — fila de pedidos de acesso (Chat 08.5 · B). Só existe com a política `allowAccessRequests`.
 *
 *  POST /access-requests          nome, e-mail, mensagem → SEMPRE 202 (o servidor não revela quem já tem conta)
 *      · com e-mail no servidor: o pedido nasce "não confirmado" (invisível para a administração) e segue um link
 *        para confirmar; quem já é membro recebe "você já tem acesso". Some em 24 h se não for confirmado.
 *      · sem e-mail: o pedido entra direto na fila, marcado "e-mail não confirmado".
 *  POST /access-requests/confirm  token do e-mail → o pedido entra na fila.
 * Tetos: pedidos esperando a administração, não confirmados no total e não confirmados vindos do mesmo IP (o IP fica
 * só como HMAC, e só enquanto o pedido não é confirmado). Aprovar/recusar são `WorkspaceOp` (regras compartilhadas).
 */
import { and, count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ACCESS_REQUEST_LIMITS, MAIL_TOKEN_MINUTES, type AccessRequestInput } from '../../../src/utils/apiContract';
import { createId } from '../../../src/utils/id';
import { isValidEmail } from '../../../src/utils/workspace';
import { findMembership, findUserByEmail } from '../auth/identity';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { accessRequests } from '../db/schema';
import { hmacHex } from '../lib/crypto';
import { apiError, tooManyAttempts } from '../lib/errors';
import { assertCookieRequest } from '../lib/http';
import type { Limiter } from '../lib/limiter';
import { consumeEmailToken, EMAIL_TOKEN_PATTERN, issueEmailToken } from '../mail/emailTokens';
import { appLink, mailLang, renderMail } from '../mail/templates';
import { readSetup } from '../setup/provision';
import { loadOrganization } from '../workspace/state';

async function spend(limiter: Limiter, key: string): Promise<void> {
  const r = await limiter.hit(key);
  if (!r.allowed) throw tooManyAttempts(r.retryAfterMs / 1000);
}

/** Organização da instalação com a política ligada — senão a rota "não existe" (404). */
export async function accessRequestsOrg(ctx: AppContext): Promise<{ id: string; name: string } | null> {
  const setup = await readSetup(ctx.db);
  if (!setup.organizationId) return null;
  const org = await loadOrganization(ctx.db, setup.organizationId);
  return org.policies?.allowAccessRequests === true ? { id: org.id, name: org.name } : null;
}

export function registerAccessRequestRoutes(app: FastifyInstance, ctx: AppContext): void {
  const mailOn = () => !!ctx.mailer?.enabled && !!ctx.config.appUrl;

  async function countWhere(orgId: string, statuses: ('unconfirmed' | 'pending')[], ipHash?: string): Promise<number> {
    const conds = [eq(accessRequests.organizationId, orgId), inArray(accessRequests.status, statuses)];
    if (ipHash) conds.push(eq(accessRequests.requesterIpHash, ipHash));
    const [row] = await ctx.db.select({ n: count() }).from(accessRequests).where(and(...conds));
    return Number(row?.n ?? 0);
  }

  app.post<{ Body: AccessRequestInput }>(
    '/access-requests',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: ACCESS_REQUEST_LIMITS.nameMax },
            email: { type: 'string', minLength: 3, maxLength: 320 },
            message: { type: 'string', maxLength: ACCESS_REQUEST_LIMITS.messageMax },
            lang: { type: 'string', enum: ['pt-BR', 'en'] },
          },
        },
      },
    },
    async (request, reply) => {
      assertCookieRequest(ctx.config, request);
      const org = await accessRequestsOrg(ctx);
      if (!org) throw apiError(404, 'notFound');
      const email = request.body.email.trim().toLowerCase();
      if (!isValidEmail(email)) throw apiError(400, 'invalidEmail');
      const name = request.body.name.trim();
      if (name.length < 2) throw apiError(400, 'nameRequired');
      const message = (request.body.message ?? '').trim() || null;
      await spend(ctx.limiters.mailIp, request.ip);
      await spend(ctx.limiters.mailAddress, `access|${email}`);
      const lang = mailLang(request.body.lang);
      // Chat 08.7 · R5 (S-16): chave por propósito (não a do JWT)
      const ipHash = hmacHex(ctx.keys.accessIpKey, `access-request|${request.ip}`);
      const withMail = mailOn();
      ctx.later!.run(async () => {
        const appUrl = ctx.config.appUrl ?? '';
        const existing = await findUserByEmail(ctx.db, email);
        const member = existing ? await findMembership(ctx.db, existing.id, org.id) : null;
        if (existing && !existing.anonymizedAt && member && member.status !== 'removed') {
          if (withMail) await ctx.mailer!.send({ to: email, ...renderMail({ kind: 'accessExisting', lang, org: org.name, url: appLink(appUrl, 'login') }) });
          return;
        }
        const [open] = await ctx.db
          .select()
          .from(accessRequests)
          .where(and(eq(accessRequests.organizationId, org.id), eq(accessRequests.email, email), inArray(accessRequests.status, ['unconfirmed', 'pending'])));
        if (open) {
          // ainda não confirmado: um link novo (o anterior deixa de valer); já na fila: nada a fazer
          if (withMail && open.status === 'unconfirmed') {
            const token = await issueEmailToken(ctx.db, { purpose: 'access_request', organizationId: org.id, email, payload: { requestId: open.id }, ttlMinutes: MAIL_TOKEN_MINUTES.accessRequest });
            await ctx.mailer!.send({ to: email, ...renderMail({ kind: 'accessConfirm', lang, org: org.name, url: appLink(appUrl, `access/${token}`), params: { minutes: MAIL_TOKEN_MINUTES.accessRequest } }) });
          }
          return;
        }
        if (withMail) {
          // tetos dos não confirmados: no total e por IP (quem pede muitos endereços diferentes)
          if ((await countWhere(org.id, ['unconfirmed'])) >= ACCESS_REQUEST_LIMITS.maxUnconfirmed || (await countWhere(org.id, ['unconfirmed'], ipHash)) >= ACCESS_REQUEST_LIMITS.maxUnconfirmedPerIp) {
            request.log.warn({ event: 'access_unconfirmed_cap' }, 'access request dropped: too many unconfirmed requests');
            return;
          }
          const id = createId(16);
          // Chat 08.7 · R3: o índice único parcial decide a corrida (pedido simultâneo do mesmo e-mail = nada novo)
          const created = await ctx.db.insert(accessRequests).values({ id, organizationId: org.id, kind: 'email', email, name, message, status: 'unconfirmed', requesterIpHash: ipHash }).onConflictDoNothing().returning({ id: accessRequests.id });
          if (!created.length) return;
          const token = await issueEmailToken(ctx.db, { purpose: 'access_request', organizationId: org.id, email, payload: { requestId: id }, ttlMinutes: MAIL_TOKEN_MINUTES.accessRequest });
          await ctx.mailer!.send({ to: email, ...renderMail({ kind: 'accessConfirm', lang, org: org.name, url: appLink(appUrl, `access/${token}`), params: { minutes: MAIL_TOKEN_MINUTES.accessRequest } }) });
          return;
        }
        if ((await countWhere(org.id, ['pending'])) >= ACCESS_REQUEST_LIMITS.maxOpen) {
          request.log.warn({ event: 'access_queue_full' }, 'access request dropped: queue is full');
          return;
        }
        await ctx.db.insert(accessRequests).values({ id: createId(16), organizationId: org.id, kind: 'email', email, name, message, status: 'pending' }).onConflictDoNothing();
      });
      return reply.code(202).send({ ok: true });
    },
  );

  app.post<{ Body: { token: string } }>(
    '/access-requests/confirm',
    { schema: { body: { type: 'object', required: ['token'], additionalProperties: false, properties: { token: { type: 'string', pattern: EMAIL_TOKEN_PATTERN } } } } },
    async (request) => {
      assertCookieRequest(ctx.config, request);
      await spend(ctx.limiters.tokenIp, request.ip);
      const org = await accessRequestsOrg(ctx);
      if (!org) throw apiError(404, 'notFound');
      const now = new Date();
      await ctx.db.transaction(async (txRaw) => {
        const tx = txRaw as unknown as Db;
        const token = await consumeEmailToken(tx, request.body.token, 'access_request', now);
        const requestId = (token?.payload as { requestId?: string } | null)?.requestId;
        if (!token || !requestId) throw apiError(400, 'tokenInvalid');
        const [row] = await tx.select().from(accessRequests).where(eq(accessRequests.id, requestId)).for('update');
        if (!row || row.organizationId !== org.id || row.email !== token.email || row.status !== 'unconfirmed') throw apiError(400, 'tokenInvalid');
        const [open] = await tx
          .select({ n: count() })
          .from(accessRequests)
          .where(and(eq(accessRequests.organizationId, org.id), eq(accessRequests.status, 'pending')));
        if (Number(open?.n ?? 0) >= ACCESS_REQUEST_LIMITS.maxOpen) throw apiError(503, 'accessQueueFull');
        await tx.update(accessRequests).set({ status: 'pending', emailConfirmedAt: now, requesterIpHash: null }).where(eq(accessRequests.id, row.id));
      });
      return { ok: true };
    },
  );
}
