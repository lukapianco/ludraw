/**
 * LuDraw server — rotas do workspace (Chat 07): estado, operações (regras compartilhadas) e Audit Log.
 */
import { eq } from 'drizzle-orm';
import { domainSignupState } from '../access/signup';
import type { FastifyInstance } from 'fastify';
import type { WorkspaceOpResult } from '../../../src/utils/apiContract';
import { explain, workspaceContext } from '../../../src/utils/permissions';
import { isWorkspaceOp, rulesView, type WorkspaceOp } from '../../../src/utils/workspaceRules';
import { requireAuth } from '../auth/authenticate';
import { hashPassword } from '../auth/passwords';
import type { AppContext } from '../context';
import { accessRequests } from '../db/schema';
import { apiError, forbidden } from '../lib/errors';
import { assertInviteMailAllowed, sendInvitationEmail } from '../invitations/mail';
import { mailErrorForLog } from '../mail/mailer';
import { mailLang } from '../mail/templates';
import { loadRulesState } from './state';
import { auditPage, buildClientState, executeOp, viewerOf } from './service';

interface OpBody {
  op: unknown;
  /** só para `setPublicLink`: senha em texto (o servidor faz o hash argon2id); null = tirar a senha */
  password?: string | null;
  /** Chat 08.5 · B: idioma do e-mail do convite (criar convite, aprovar pedido) */
  lang?: string;
}

export function registerWorkspaceRoutes(app: FastifyInstance, ctx: AppContext): void {
  const auth = requireAuth(ctx);

  app.get('/workspace/state', { preHandler: auth }, async (request) => buildClientState(ctx, request.auth!));

  app.post<{ Body: OpBody }>(
    '/workspace/ops',
    {
      preHandler: auth,
      schema: { body: { type: 'object', required: ['op'], additionalProperties: false, properties: { op: { type: 'object' }, password: { type: ['string', 'null'], maxLength: 1024 }, lang: { type: 'string', enum: ['pt-BR', 'en'] } } } },
    },
    async (request) => {
      const raw = request.body.op;
      if (!isWorkspaceOp(raw)) throw apiError(400, 'invalidOperation');
      let op: WorkspaceOp = raw;
      if (op.type === 'setPublicLink') {
        // o hash nunca vem do cliente: a senha chega em texto (HTTPS) e vira argon2id aqui
        if (op.patch.passwordHash !== undefined) throw apiError(400, 'invalidOperation');
        const pw = request.body.password;
        if (pw !== undefined) {
          if (pw !== null) {
            if (!pw.length || pw.length > 256) throw apiError(400, 'invalidRequest');
          }
          op = { ...op, patch: { ...op.patch, passwordHash: pw === null ? null : await hashPassword(pw) } };
        }
      } else if (request.body.password !== undefined) {
        throw apiError(400, 'invalidOperation');
      }
      // Chat 08.5 · B: convite que vai sair por e-mail → limites conferidos ANTES de criar (nada fica pela metade)
      const auth = request.auth!;
      const mailOn = !!ctx.mailer?.enabled && !!ctx.config.appUrl;
      let mailTo: string | null = null;
      if (mailOn && op.type === 'createInvitation' && op.input.sendEmail !== false) mailTo = op.input.email.trim().toLowerCase();
      if (mailOn && op.type === 'approveAccessRequest' && op.grant?.sendEmail !== false) {
        const [req] = await ctx.db.select({ email: accessRequests.email }).from(accessRequests).where(eq(accessRequests.id, op.id));
        mailTo = req?.email ?? null;
      }
      if (mailTo) await assertInviteMailAllowed(ctx, auth.userId, mailTo);
      // Chat 08.5 · C: ligar o cadastro pelo domínio exige e-mail funcionando, domínio cadastrado e uma organização
      if (op.type === 'updatePolicies' && op.patch.allowDomainSignup === true) {
        const signup = await domainSignupState(ctx);
        if (!signup.policy) {
          if (signup.missing.includes('multiOrg')) throw apiError(409, 'domainSignupMultiOrg');
          if (signup.missing.includes('mail')) throw apiError(409, 'domainSignupNeedsMail');
          if (signup.missing.includes('domain')) throw apiError(409, 'domainSignupNeedsDomain');
        }
      }
      const { result, state } = await executeOp(ctx, auth, request.ip, op);
      let emailed: boolean | undefined;
      if (mailTo && result.token && result.id && (op.type === 'createInvitation' || state.invitations.some((i) => i.id === result.id))) {
        try {
          await sendInvitationEmail(ctx, { organizationId: auth.organizationId, invitationId: result.id, token: result.token, lang: mailLang(request.body.lang), actorId: auth.userId, ip: request.ip });
          emailed = true;
        } catch (err) {
          request.log.warn({ mail: mailErrorForLog(err) }, 'invitation e-mail failed');
          emailed = false;
        }
      }
      const response: WorkspaceOpResult = { ok: true, id: result.id, token: result.token, state: await buildClientState(ctx, auth, state), ...(emailed === undefined ? {} : { emailed }) };
      return response;
    },
  );

  app.get<{ Querystring: { before?: string; limit?: string } }>('/audit', { preHandler: auth }, async (request) => {
    const a = request.auth!;
    const state = await loadRulesState(ctx.db, a.organizationId, ctx.keys);
    const d = explain(workspaceContext(viewerOf(state, a), rulesView(state).policies), 'workspace.audit.view');
    if (!d.allowed) throw forbidden(d.reason);
    const before = request.query.before ? Number(request.query.before) : null;
    const limit = Math.min(500, Math.max(1, Number(request.query.limit ?? 200) || 200));
    return { entries: await auditPage(ctx.db, a.organizationId, Number.isFinite(before) ? before : null, limit) };
  });

}
