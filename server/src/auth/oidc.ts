/**
 * LuDraw server — login da empresa por OIDC genérico (Keycloak, Authentik, Google, Entra ID…), Chat 07.
 *
 * Authorization Code + PKCE (S256) + state + nonce, com os parâmetros guardados no banco por 10 minutos
 * (uso único). Depois do provedor, o servidor cria a sessão (cookie de renovação) e volta para o cliente
 * em `#/auth/sso` — nenhum token passa pela URL; o cliente pega o access token em `/auth/refresh`.
 *
 * Quem entra: conta já ligada (issuer + subject) → entra. E-mail verificado de conta local → só liga com
 * OIDC_LINK_BY_EMAIL=true. Conta nova → só com convite pendente para o e-mail ou com OIDC_AUTO_PROVISION=true
 * e o domínio entre os permitidos da organização (entra como membro). Participação suspensa não entra.
 */
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import * as oidc from 'openid-client';
import { AUDIT_PARAM_KEYS, SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import { colorFromString } from '../../../src/utils/color';
import { createId } from '../../../src/utils/id';
import { emailInAllowedDomains, invitationStatus } from '../../../src/utils/workspace';
import { applyInvitationAcceptance, roleMsg } from '../../../src/utils/workspaceRules';
import { allowedOrigins, originOf, type OidcConfig } from '../config';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { invitations, oidcRequests, organizations, orgMemberships, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { randomUrlToken, safeEqual, sha256Hex } from '../lib/crypto';
import { apiError, HttpError, tooManyAttempts } from '../lib/errors';
import { readSetup } from '../setup/provision';
import { loadRulesState, persistDiff } from '../workspace/state';
import { findMembership, findUserByEmail, membershipBlock, type UserRow } from './identity';
import { issueSession } from './routes';

export const OIDC_REQUEST_TTL_MS = 10 * 60_000;

/**
 * Chat 08.7 · R5 (S-08): cookie que amarra o fluxo SSO ao navegador que o começou. Sem ele, um atacante podia
 * começar o login com a PRÓPRIA conta no provedor e mandar o link do callback à vítima, que entrava na conta dele.
 * `SameSite=Lax` sempre: a volta do provedor é uma navegação GET vinda de outro site (Strict não levaria o cookie).
 */
export const SSO_BIND_COOKIE = 'ld_sso';
const SSO_BIND_PATH = '/api/v1/auth/oidc';

export class OidcClient {
  private config: Promise<oidc.Configuration> | null = null;

  constructor(readonly settings: OidcConfig) {}

  /** Descoberta do provedor (cacheada; tenta de novo se falhar). */
  configuration(): Promise<oidc.Configuration> {
    if (!this.config) {
      const s = this.settings;
      this.config = oidc
        .discovery(new URL(s.issuer), s.clientId, s.clientSecret ?? undefined, s.clientSecret ? oidc.ClientSecretPost(s.clientSecret) : oidc.None(), s.allowInsecureHttp ? { execute: [oidc.allowInsecureRequests] } : undefined)
        .catch((err) => {
          this.config = null;
          throw err;
        });
    }
    return this.config;
  }
}

interface SsoClaims {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Decide a conta de quem voltou do provedor (dentro de uma transação). */
async function resolveSsoUser(tx: Db, ctx: AppContext, settings: OidcConfig, orgId: string, claims: SsoClaims, ip: string): Promise<UserRow> {
  const [linked] = await tx
    .select()
    .from(users)
    .where(and(eq(users.oidcIssuer, claims.issuer), eq(users.oidcSubject, claims.subject)));
  if (linked) return linked;
  if (!claims.email) throw apiError(403, 'ssoEmailUnverified');
  if (!claims.emailVerified) throw apiError(403, 'ssoEmailUnverified');
  const email = claims.email.trim().toLowerCase();
  const existing = await findUserByEmail(tx, email);
  if (existing) {
    if (!settings.linkByEmail) throw apiError(409, 'emailInUse');
    // Chat 08.5: o provedor confirmou este e-mail (sem isso a função já teria recusado acima)
    const emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
    await tx.update(users).set({ oidcIssuer: claims.issuer, oidcSubject: claims.subject, emailVerifiedAt }).where(eq(users.id, existing.id));
    return { ...existing, oidcIssuer: claims.issuer, oidcSubject: claims.subject, emailVerifiedAt };
  }

  // conta nova: convite pendente para o e-mail, ou domínio permitido com auto-provisionamento
  const now = Date.now();
  const pending = (await tx.select().from(invitations).where(and(eq(invitations.organizationId, orgId), eq(invitations.email, email)))).find(
    (i) => invitationStatus({ acceptedAt: i.acceptedAt?.getTime(), revokedAt: i.revokedAt?.getTime(), expiresAt: i.expiresAt.getTime() }, now) === 'pending',
  );
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
  const autoOk = settings.autoProvision && !!org && org.allowedEmailDomains.length > 0 && emailInAllowedDomains(email, org);
  if (!pending && !autoOk) throw apiError(403, 'ssoNoAccess');

  const name = (claims.name ?? email.split('@')[0]).trim().slice(0, 120) || email;
  const id = createId(16);
  await tx.insert(users).values({ id, email, name, avatarColor: colorFromString(name), passwordHash: null, authProvider: 'oidc', oidcIssuer: claims.issuer, oidcSubject: claims.subject, createdVia: 'sso', createdAt: new Date(now), lastSeenAt: new Date(now), emailVerifiedAt: new Date(now) });
  if (pending) {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).for('update');
    const before = await loadRulesState(tx, orgId, ctx.keys);
    const inv = before.invitations.find((i) => i.id === pending.id);
    if (!inv) throw apiError(403, 'ssoNoAccess');
    const result = applyInvitationAcceptance(before, inv, { id, name, email, avatarColor: colorFromString(name) }, { now, newId: () => createId(16), newToken: () => '', anonymizedName: (u) => `#${u.slice(0, 4)}` });
    if (!result.ok) throw new HttpError(403, 'ssoNoAccess', { key: result.error.key, ...(result.error.params ? { params: result.error.params as never } : {}) });
    await persistDiff(tx, orgId, before, result.state, ctx.keys);
    for (const a of result.audit) await recordAudit(tx, { organizationId: orgId, actorId: a.meta?.actorId ?? id, action: a.action, message: a.message, targetType: a.meta?.targetType, targetId: a.meta?.targetId, ip });
  } else {
    await tx.update(users).set({ authProvider: 'oidc' }).where(eq(users.id, id));
    await tx.insert(orgMemberships).values({ organizationId: orgId, userId: id, role: 'member', status: 'active', createdAt: new Date(now) });
    await recordAudit(tx, { organizationId: orgId, actorId: id, action: 'member_joined', message: { key: 'workspace.audit.msg.memberJoined', params: { role: roleMsg('member') } }, targetType: 'user', targetId: id, ip });
  }
  const [row] = await tx.select().from(users).where(eq(users.id, id));
  return row!;
}

function backToClient(reply: FastifyReply, target: string, error?: string) {
  const url = `${target.replace(/#.*$/, '')}#/auth/sso${error ? `?error=${encodeURIComponent(error)}` : ''}`;
  return reply.redirect(url, 302);
}

export function registerOidcRoutes(app: FastifyInstance, ctx: AppContext, client: OidcClient | null): void {
  const fallbackTarget = () => ctx.config.publicUrl ?? ctx.config.corsOrigins[0] ?? null;

  app.get<{ Querystring: { redirect?: string } }>('/auth/oidc/start', async (request, reply) => {
    if (!client) throw apiError(404, 'ssoDisabled');
    const limit = await ctx.limiters.oidcStart.hit(request.ip);
    if (!limit.allowed) throw tooManyAttempts(limit.retryAfterMs / 1000);
    // destino de volta só para origens permitidas (sem redirecionamento aberto)
    const target = request.query.redirect ?? fallbackTarget();
    const origin = target ? originOf(target) : null;
    if (!target || !origin || !allowedOrigins(ctx.config).has(origin)) throw apiError(400, 'originNotAllowed');
    const config = await client.configuration().catch(() => {
      throw apiError(502, 'ssoFailed');
    });
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const browser = randomUrlToken(32);
    await ctx.db.insert(oidcRequests).values({ state, nonce, codeVerifier, redirectTo: target, browserHash: sha256Hex(browser) });
    reply.setCookie(SSO_BIND_COOKIE, browser, { httpOnly: true, secure: ctx.config.cookie.secure, sameSite: 'lax', path: SSO_BIND_PATH, maxAge: Math.floor(OIDC_REQUEST_TTL_MS / 1000) });
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: client.settings.redirectUri,
      scope: client.settings.scopes,
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    return reply.redirect(url.href, 302);
  });

  app.get('/auth/oidc/callback', async (request, reply) => {
    if (!client) throw apiError(404, 'ssoDisabled');
    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    const params = new URLSearchParams(query);
    const state = params.get('state');
    if (!state) throw apiError(400, 'ssoFailed');
    // uso único: o pedido sai do banco na hora; o cookie de vínculo sai do navegador
    const [req] = await ctx.db.delete(oidcRequests).where(eq(oidcRequests.state, state)).returning();
    const browser = request.cookies?.[SSO_BIND_COOKIE];
    reply.clearCookie(SSO_BIND_COOKIE, { httpOnly: true, secure: ctx.config.cookie.secure, sameSite: 'lax', path: SSO_BIND_PATH });
    // S-08: só o navegador que começou o fluxo termina (pedido antigo, sem vínculo, também é recusado)
    const sameBrowser = !!req?.browserHash && typeof browser === 'string' && browser.length > 0 && safeEqual(sha256Hex(browser), req.browserHash);
    if (req && !sameBrowser) return backToClient(reply, req.redirectTo, 'ssoFailed');
    if (!req || Date.now() - req.createdAt.getTime() > OIDC_REQUEST_TTL_MS) {
      const target = fallbackTarget();
      if (target) return backToClient(reply, target, 'ssoFailed');
      throw apiError(400, 'ssoFailed');
    }
    try {
      if (params.get('error')) throw apiError(401, 'ssoFailed');
      const config = await client.configuration();
      const currentUrl = new URL(client.settings.redirectUri);
      currentUrl.search = query;
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, { pkceCodeVerifier: req.codeVerifier, expectedState: req.state, expectedNonce: req.nonce, idTokenExpected: true });
      const c = tokens.claims();
      if (!c) throw apiError(401, 'ssoFailed');
      const claims: SsoClaims = {
        issuer: String(c.iss),
        subject: String(c.sub),
        email: typeof c.email === 'string' ? c.email : null,
        emailVerified: c.email_verified === true,
        name: typeof c.name === 'string' ? c.name : null,
      };
      const setup = await readSetup(ctx.db);
      if (!setup.completedAt || !setup.organizationId) throw apiError(403, 'ssoNoAccess');
      const orgId = setup.organizationId;
      const user = await ctx.db.transaction(async (tx) => resolveSsoUser(tx as unknown as Db, ctx, client.settings, orgId, claims, request.ip));
      const membership = await findMembership(ctx.db, user.id, orgId);
      const block = membershipBlock(user, membership);
      if (block || !membership) throw block ?? apiError(403, 'ssoNoAccess');
      await ctx.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
      await recordAudit(ctx.db, {
        organizationId: orgId,
        actorId: user.id,
        action: 'login',
        message: { key: SERVER_AUDIT_MESSAGES.login, params: { method: { key: AUDIT_PARAM_KEYS.methodSso } } },
        targetType: 'user',
        targetId: user.id,
        ip: request.ip,
      });
      await issueSession(ctx, request, reply, user, membership);
      return backToClient(reply, req.redirectTo);
    } catch (err) {
      const code = err instanceof HttpError ? err.code : 'ssoFailed';
      if (!(err instanceof HttpError)) request.log.warn({ err: err instanceof Error ? err.message : String(err) }, 'sso callback failed');
      return backToClient(reply, req.redirectTo, code);
    }
  });
}
