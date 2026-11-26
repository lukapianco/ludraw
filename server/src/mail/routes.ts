/**
 * LuDraw server — painel de e-mail da administração (Chat 08.5 · B2).
 *
 *   GET /admin/mail/settings  → estado (sem senha)
 *   PUT /admin/mail/settings  → salva, confere o host, recria o carteiro e audita
 *
 * Regras fixas:
 *  - Permissão `workspace.policies.manage` via `explain()`.
 *  - Chat 09 · R5 (D12): no multi_org o painel NÃO existe — ler, salvar e o botão de teste respondem 409
 *    `mailSettingsServerOnly` (o SMTP é do servidor inteiro; nenhuma organização o vê). Regra única: `mailPanelVisible`.
 *  - Variável vence campo a campo: campo travado tem de vir `null` (senha: ausente), senão 409.
 *  - Host do painel: nome válido, porta da lista (25/465/587/2525) e nenhum endereço interno (a menos de
 *    LUDRAW_SMTP_ALLOW_PRIVATE_HOST); a mesma conferência roda de novo a cada envio (`MailControl`).
 *  - Senha: só com `keys.mailSealer` (LUDRAW_JWT_SECRET); cifrada; nunca na resposta, no log ou na auditoria
 *    (a auditoria registra só "tinha senha / tem senha").
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { PANEL_SMTP_PORTS, SERVER_AUDIT_MESSAGES, type MailSettingsInput, type MailSettingsView } from '../../../src/utils/apiContract';
import type { AuditChange } from '../../../src/types/workspace';
import { mailPanelVisible } from '../../../src/utils/featureGates';
import { explain, workspaceContext } from '../../../src/utils/permissions';
import { rulesView } from '../../../src/utils/workspaceRules';
import { requireAuth } from '../auth/authenticate';
import type { AppContext } from '../context';
import { mailSettings } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { apiError, forbidden } from '../lib/errors';
import { loadRulesState } from '../workspace/state';
import { viewerOf } from '../workspace/service';
import { checkSmtpHost, defaultLookup } from './hostGuard';
import { isValidFrom, loadResolvedMail, MAIL_SETTINGS_ID, readMailSettings, resolveMail, type MailSettingsRow } from './settings';
import { readSetup } from '../setup/provision';

const nullableString = (maxLength: number) => ({ type: ['string', 'null'], maxLength }) as const;

const putSchema = {
  body: {
    type: 'object',
    required: ['enabled', 'host', 'port', 'security', 'user', 'from'],
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean' },
      host: nullableString(253),
      port: { type: ['integer', 'null'], minimum: 1, maximum: 65535 },
      security: { type: ['string', 'null'], enum: ['tls', 'starttls', null] },
      user: { type: ['string', 'null'], maxLength: 320, pattern: '^[^\\r\\n]*$' },
      from: nullableString(320),
      password: { type: ['string', 'null'], minLength: 1, maxLength: 1024 },
    },
  },
} as const;

const EDITABLE = ['host', 'port', 'security', 'user', 'from'] as const;

/** Chat 09 · R5: o painel de e-mail só existe no single_org (GET, PUT e o botão de teste). */
export async function assertMailPanel(ctx: AppContext): Promise<void> {
  const setup = await readSetup(ctx.db);
  if (!mailPanelVisible(setup.mode)) throw apiError(409, 'mailSettingsServerOnly');
}

export function registerMailSettingsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const requirePolicies = async (request: FastifyRequest) => {
    const auth = request.auth!;
    const state = await loadRulesState(ctx.db, auth.organizationId, ctx.keys);
    const decision = explain(workspaceContext(viewerOf(state, auth), rulesView(state).policies), 'workspace.policies.manage');
    if (!decision.allowed) throw forbidden(decision.reason);
    await assertMailPanel(ctx);
    return auth;
  };
  const currentView = async (): Promise<MailSettingsView> => {
    const resolved = await loadResolvedMail(ctx.db, ctx.config, ctx.keys.mailSealer);
    // "ligado" = o carteiro que está de fato no ar
    return { ...resolved.view, active: !!ctx.mailer?.enabled };
  };

  app.get('/admin/mail/settings', { preHandler: requireAuth(ctx) }, async (request) => {
    await requirePolicies(request);
    return currentView();
  });

  app.put<{ Body: MailSettingsInput }>('/admin/mail/settings', { schema: putSchema, preHandler: requireAuth(ctx) }, async (request) => {
    const auth = await requirePolicies(request);
    const body = request.body;
    const [row, setup] = await Promise.all([readMailSettings(ctx.db), readSetup(ctx.db)]);
    const env = ctx.config.mailEnv;
    const base = { env, envConfig: ctx.config.mail, appUrl: ctx.config.appUrl, sealer: ctx.keys.mailSealer, serverOnly: setup.mode === 'multi_org' };
    const before = resolveMail({ ...base, row });
    if (before.view.source === 'outbox') throw apiError(409, 'mailFieldLocked');
    if (before.view.appUrlMissing) throw apiError(409, 'mailAppUrlMissing');
    for (const field of EDITABLE) if (before.view.locked[field] && body[field] !== null) throw apiError(409, 'mailFieldLocked');
    if (before.view.locked.password && body.password !== undefined) throw apiError(409, 'mailFieldLocked');

    const host = body.host?.trim().toLowerCase() || null;
    const user = body.user?.trim() || null;
    const from = body.from?.trim() || null;
    if (body.port !== null && !(PANEL_SMTP_PORTS as readonly number[]).includes(body.port)) throw apiError(422, 'mailPortNotAllowed');
    if (from && !isValidFrom(from)) throw apiError(422, 'mailFromInvalid');
    if (host) {
      const check = await checkSmtpHost(host, { lookup: ctx.dnsLookup ?? defaultLookup, allowPrivate: env.allowPrivateHost });
      if (!check.ok) throw apiError(422, check.reason === 'private' ? 'mailHostPrivate' : check.reason === 'invalid' ? 'mailHostInvalid' : 'mailHostUnresolved');
    }

    let passwordEnc = row?.passwordEnc ?? null;
    let passwordKeyCheck = row?.passwordKeyCheck ?? null;
    let passwordReplaced = false;
    if (typeof body.password === 'string') {
      const sealer = ctx.keys.mailSealer;
      if (!sealer) throw apiError(409, 'mailKeyMissing');
      passwordEnc = sealer.seal(body.password);
      passwordKeyCheck = sealer.fingerprint();
      passwordReplaced = true;
    } else if (body.password === null) {
      passwordEnc = null;
      passwordKeyCheck = null;
    }

    const now = new Date();
    const next: MailSettingsRow = {
      id: MAIL_SETTINGS_ID,
      enabled: body.enabled,
      host,
      port: body.port,
      security: body.security,
      username: user,
      fromAddress: from,
      passwordEnc,
      passwordKeyCheck,
      updatedAt: now,
      updatedBy: auth.userId,
    };
    const after = resolveMail({ ...base, row: next });
    // 465 é TLS desde a conexão; 587 é STARTTLS. Trocadas, a conexão nunca acontece (só um "não conectou" depois).
    const eff = after.view.values;
    const mismatch = (eff.port === 465 && eff.security === 'starttls') || (eff.port === 587 && eff.security === 'tls');
    if (mismatch && !(before.view.locked.port && before.view.locked.security)) throw apiError(422, 'mailSecurityMismatch');
    if (body.enabled && after.view.problem && after.view.problem !== 'off') throw apiError(422, 'mailIncomplete');

    const { id: _id, ...values } = next;
    await ctx.db
      .insert(mailSettings)
      .values(next)
      .onConflictDoUpdate({ target: mailSettings.id, set: values });

    // auditoria: o que mudou (valores não secretos) e, da senha, só se havia e se há
    const changes: AuditChange[] = [];
    const diff = (field: string, a: string | number | boolean | null, b: string | number | boolean | null) => {
      if (a !== b) changes.push({ field, before: a, after: b });
    };
    diff('smtp.enabled', row?.enabled ?? false, next.enabled);
    diff('smtp.host', row?.host ?? null, next.host);
    diff('smtp.port', row?.port ?? null, next.port);
    diff('smtp.security', row?.security ?? null, next.security);
    diff('smtp.user', row?.username ?? null, next.username);
    diff('smtp.from', row?.fromAddress ?? null, next.fromAddress);
    const had = !!row?.passwordEnc;
    const has = !!next.passwordEnc;
    if (had !== has || passwordReplaced) changes.push({ field: 'smtp.password', before: had, after: has });

    const view = ctx.mailControl ? await ctx.mailControl.reload() : after.view;
    // Chat 09 · R4: as outras instâncias (com Redis/Valkey) recarregam o carteiro — a mensagem não leva dado nenhum
    await ctx.cluster?.announce('mail-settings');
    if (changes.length) {
      await recordAudit(ctx.db, {
        organizationId: auth.organizationId,
        actorId: auth.userId,
        action: 'mail_settings_updated',
        message: { key: SERVER_AUDIT_MESSAGES.mailSettingsUpdated, params: { count: changes.length } },
        targetType: 'workspace',
        changes,
        ip: request.ip,
      });
    }
    return { ...view, active: !!ctx.mailer?.enabled };
  });
}
