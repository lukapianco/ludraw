/**
 * LuDraw server — montagem do Fastify (Chat 07).
 * Prefixo `/api/v1`; erros sempre no formato `ApiErrorBody`; nada de texto pronto para a interface.
 */
import { createServer as createHttpServer } from 'node:http';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from 'fastify';
import { API_PREFIX, API_VERSION, CLIENT_HEADER, type ServerInfo } from '../../src/utils/apiContract';
import { OidcClient, registerOidcRoutes } from './auth/oidc';
import { registerEmailRoutes } from './auth/emailRoutes';
import { registerAuthRoutes } from './auth/routes';
import { registerBoardRoutes } from './boards/routes';
import { CollabHub } from './collab/hub';
import { registerInvitationResendRoute, registerInvitationRoutes } from './invitations/routes';
import { registerInviteLinkRoutes } from './invitations/linkRoutes';
import { registerAccessRequestRoutes } from './access/routes';
import { domainSignupState, registerDomainSignupRoutes } from './access/signup';
import { registerPublicRoutes } from './public/routes';
import { registerTemplateRoutes } from './templates/routes';
import { registerWorkspaceRoutes } from './workspace/routes';
import { BOARD_LIMITS } from '../../src/utils/boardLimits';
import { allowedOrigins, originOf } from './config';
import type { AppContext } from './context';
import { organizations } from './db/schema';
import { apiError, HttpError, limitsUnavailable, tooManyAttempts } from './lib/errors';
import { LimiterUnavailableError } from './lib/limiter';
import { readSetup, SetupGate } from './setup/provision';
import { registerSetupRoutes } from './setup/routes';
import { AssetStore } from './assets/store';
import { registerAssetRoutes } from './assets/routes';
import { ASSET_MAX_BYTES } from '../../src/utils/assetRefs';
import { DESKTOP_ORIGINS } from '../../src/utils/desktopRules';
import { redactUrl } from './lib/logRedact';
import { trustFunction } from './lib/trust';
import { secureLegacyPublicLinks } from './public/linkStorage';
import { Deferred } from './mail/deferred';
import { defaultTransportFactory, MailControl, mailErrorForLog } from './mail/mailer';
import { defaultLookup } from './mail/hostGuard';
import { registerMailSettingsRoutes } from './mail/routes';
import { loadResolvedMail } from './mail/settings';
import { loadWebApp, registerWebRoutes, webResponses } from './web/static';

/** Campos que nunca podem aparecer no log (senhas, tokens, cookies). */
export const LOG_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  // Chat 08.5: credenciais do SMTP (config e opções do transporte)
  '*.pass',
  '*.smtpPassword',
  'mail.password',
  'config.mail.password',
  // Chat 08.5 · B2: painel de e-mail (corpo do PUT e coluna cifrada)
  'req.body.password',
  'body.password',
  '*.passwordEnc',
  '*.password_enc',
  'config.mailEnv.password',
];

/**
 * Chat 08.7 · R5 (S-06): como a requisição aparece no log — endereço sem tokens (`redactUrl`: segmento do token e
 * `code`/`state`/… viram `***`). Mesmos campos do serializador padrão do Fastify.
 */
export const LOG_SERIALIZERS = {
  req(request: { method?: string; url?: string; host?: string; hostname?: string; ip?: string; socket?: { remotePort?: number } }) {
    return { method: request.method, url: redactUrl(request.url), host: request.host ?? request.hostname, remoteAddress: request.ip, remotePort: request.socket?.remotePort };
  },
};

/** Opções do logger de produção (o `index.ts` e os testes usam as MESMAS). */
export function loggerOptions(level: string, stream?: { write(msg: string): void }) {
  return { level, redact: LOG_REDACT, serializers: LOG_SERIALIZERS, ...(stream ? { stream } : {}) };
}

export interface BuiltApp {
  app: FastifyInstance;
  gate: SetupGate;
}

export async function buildApp(ctx: AppContext, logger: FastifyServerOptions['logger'] = true): Promise<BuiltApp> {
  // Chat 08.2: pasta das imagens precisa existir e aceitar gravação — senão o servidor não sobe (mensagem clara)
  if (!ctx.assets) {
    const store = new AssetStore(ctx.config.assetsDir);
    try {
      await store.ensureReady();
    } catch (err) {
      throw new Error(`LUDRAW_ASSETS_DIR sem permissão de gravação ou inválida: ${(err as Error).message}`);
    }
    ctx.assets = store;
  }
  const trust = ctx.config.trustProxy;
  const http = ctx.config.http;
  const app = Fastify({
    logger,
    // Chat 08.7 · R3: tempos limite explícitos (cabeçalho lento, corpo lento, conexão parada). O Node confere cabeçalho
    // e requisição num intervalo — aqui proporcional ao menor limite, para cortar perto do prazo.
    serverFactory: (handler) => {
      const server = createHttpServer(
        {
          headersTimeout: http.headersTimeoutMs,
          requestTimeout: http.requestTimeoutMs,
          connectionsCheckingInterval: Math.min(30_000, Math.max(250, Math.floor(Math.min(http.headersTimeoutMs, http.requestTimeoutMs) / 4))),
        },
        handler,
      );
      server.setTimeout(http.idleTimeoutMs);
      return server;
    },
    // número = quantos proxies confiáveis à frente (proxy-addr conta os saltos a partir do socket)
    // Chat 08.7 · R5 (S-14): a mesma regra do WebSocket (`lib/trust.ts`)
    trustProxy: trust === false ? false : trustFunction(trust),
    bodyLimit: 1024 * 1024,
    // sem eco do corpo em erros de validação (pode conter senha)
    ajv: { customOptions: { removeAdditional: false, allErrors: false } },
  }) as unknown as FastifyInstance;
  // Chat 08.7 · R5 (S-17): fase 2 da migração 0009 — confere os hashes e só então tira o token em texto (para o boot
  // com erro claro, sem apagar nada, se algo não conferir). Idempotente.
  await secureLegacyPublicLinks(ctx.db, ctx.keys);
  const gate = new SetupGate();
  await gate.refresh(ctx.db);

  // Chat 08.5: carteiro (desligado sem configuração) e fila do que roda depois da resposta
  // B2: variáveis + painel; `reload()` recria o carteiro quando a administração salva (sem reiniciar)
  if (!ctx.mailControl) {
    ctx.mailControl = new MailControl(
      () => loadResolvedMail(ctx.db, ctx.config, ctx.keys.mailSealer),
      // lidos a cada envio: os testes trocam a resolução de nomes e o transporte com o servidor no ar
      () => ({ lookup: ctx.dnsLookup ?? defaultLookup, factory: ctx.smtpTransportFactory ?? defaultTransportFactory, allowPrivate: ctx.config.mailEnv.allowPrivateHost }),
      {
        maxPerHour: ctx.config.mailEnv.maxPerServerHour,
        ceiling: ctx.limiters.mailCeiling,
        onCeiling: (ms) => app.log.warn(`Hourly e-mail ceiling reached (LUDRAW_MAIL_MAX_PER_HOUR=${ctx.config.mailEnv.maxPerServerHour}); further e-mails are refused for about ${Math.ceil(ms / 60_000)} min.`),
      },
    );
    await ctx.mailControl.reload();
  }
  if (!ctx.mailer) ctx.mailer = ctx.mailControl;
  if (!ctx.later) ctx.later = new Deferred((err) => app.log.warn({ mail: mailErrorForLog(err) }, 'background job failed'));
  app.addHook('onClose', async () => {
    await ctx.later?.flush();
  });

  await app.register(cookie);
  const origins = allowedOrigins(ctx.config);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', CLIENT_HEADER, 'if-match'],
    exposedHeaders: ['etag', 'retry-after'],
    maxAge: 600,
  });
  // teto geral por IP (proteção básica); limites finos de login/setup/link ficam nas próprias rotas
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: 60_000,
    // Chat 09 · R4: com Redis/Valkey o teto vale para todas as instâncias. Se o Redis cair, este teto geral deixa
    // passar (as rotas sensíveis têm os próprios limites, que fecham com 503) — o app não para por causa dele.
    // No Redis o IP vai como hash (nunca em claro fora do processo), como nos limites de tentativa.
    ...(ctx.redis ? { redis: ctx.redis, nameSpace: 'ludraw:ratelimit:', skipOnError: true, keyGenerator: (req: FastifyRequest) => createHash('sha256').update(req.ip).digest('base64url') } : {}),
    errorResponseBuilder: (_req, context) => tooManyAttempts(context.ttl / 1000),
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    // Chat 09 · R2: o app servido aqui (web/static.ts) tem os próprios cabeçalhos e usa `frame-ancestors` (incorporar board)
    if (!webResponses.has(reply)) {
      reply.header('x-frame-options', 'DENY');
      // Chat 09 · R2: respostas da API (JSON e imagens) só para a própria origem em pedidos sem CORS
      reply.header('cross-origin-resource-policy', 'same-origin');
    }
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    // Chat 09 · R4: limites guardados no Redis/Valkey fora do ar → 503, nunca deixar passar sem contar
    if (error instanceof LimiterUnavailableError) {
      request.log.warn({ route: request.routeOptions?.url, redis: error.detail }, 'attempt limits unavailable (Redis/Valkey): answered 503');
      const err = limitsUnavailable();
      reply.header('retry-after', String(err.retryAfterSeconds));
      return reply.status(503).send(err.body());
    }
    if (error instanceof HttpError) {
      if (error.retryAfterSeconds !== undefined) reply.header('retry-after', String(error.retryAfterSeconds));
      return reply.status(error.status).send(error.body());
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if ((error as { validation?: unknown }).validation || (status >= 400 && status < 500 && status !== 404 && status !== 413 && status !== 415 && status !== 429)) {
      return reply.status(400).send(apiError(400, 'invalidRequest').body());
    }
    if (status === 404) return reply.status(404).send(apiError(404, 'notFound').body());
    // Chat 08.2: envio de imagem tem limite e tipos próprios
    const assetUpload = /\/assets(\/link)?(\?|$)/.test(request.url.split('#')[0]);
    if (status === 413 && assetUpload) return reply.status(413).send(apiError(413, 'imageTooLarge', { mb: Math.round(ASSET_MAX_BYTES / (1024 * 1024)) }).body());
    if (status === 415 && assetUpload) return reply.status(415).send(apiError(415, 'unsupportedImage').body());
    // Chat 08.7 · R5 (S-13): corpo com Content-Type não suportado numa rota JSON — erro do cliente, não do servidor
    if (status === 415) return reply.status(415).send(apiError(415, 'unsupportedMediaType').body());
    if (status === 413) return reply.status(413).send(apiError(413, 'payloadTooLarge', { mb: Math.round(BOARD_LIMITS.bodyBytes / (1024 * 1024)) }).body());
    if (status === 429) return reply.status(429).send(tooManyAttempts(60).body());
    // Chat 09 · R1 (S-20): consulta que passou do statement_timeout — resposta genérica (sem SQL), log próprio
    // o Drizzle embrulha o erro do driver (DrizzleQueryError.cause)
    const pgCode = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (pgCode === '57014') {
      request.log.warn({ route: request.routeOptions?.url }, 'database statement timed out (LUDRAW_DB_STATEMENT_TIMEOUT_MS)');
      return reply.status(500).send(apiError(500, 'internal').body());
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(apiError(500, 'internal').body());
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send(apiError(404, 'notFound').body()));

  const health = async () => {
    const ok = await ctx.db
      .execute('select 1')
      .then(() => true)
      .catch(() => false);
    if (!ok) throw apiError(503, 'internal');
    return { status: 'ok' };
  };
  app.get('/health', { config: { rateLimit: false } }, health);

  await app.register(
    async (api) => {
      api.get('/health', { config: { rateLimit: false } }, health);
      api.get('/info', async (request, reply) => {
        // Chat 09.1 · R7: o programa desktop testa o endereço antes de abrir. Só este GET público, só as duas origens
        // locais do programa e sem credenciais (o resto da API segue as origens de sempre).
        const origin = request.headers.origin;
        if (origin && DESKTOP_ORIGINS.includes(origin) && !allowedOrigins(ctx.config).has(origin)) {
          reply.header('access-control-allow-origin', origin);
          reply.header('vary', 'Origin');
        }
        const setup = await readSetup(ctx.db);
        let organizationName: string | null = null;
        let allowLocal = ctx.config.allowLocalMode;
        let accessRequests = false;
        if (setup.organizationId) {
          const [org] = await ctx.db.select({ name: organizations.name, policies: organizations.policies }).from(organizations).where(eq(organizations.id, setup.organizationId));
          organizationName = org?.name ?? null;
          if (typeof org?.policies?.allowLocalMode === 'boolean') allowLocal = org.policies.allowLocalMode;
          accessRequests = org?.policies?.allowAccessRequests === true;
        }
        const info: ServerInfo = {
          name: 'ludraw',
          version: ctx.version,
          apiVersion: API_VERSION,
          setupRequired: !setup.completedAt,
          mode: setup.completedAt ? setup.mode : null,
          organizationName,
          sso: { enabled: !!ctx.config.oidc, label: ctx.config.oidc?.providerName ?? null },
          registration: setup.completedAt && (await domainSignupState(ctx)).active ? 'domain' : 'invite_only',
          // público e sem dado sensível: só o necessário para a tela de entrada decidir o que mostrar
          localMode: allowLocal ? 'allowed' : 'blocked',
          realtime: ctx.config.collab.enabled,
          email: !!ctx.mailer?.enabled,
          accessRequests,
          // Chat 09 · R5: a tela "Sistema visual" só aparece se a instalação deixar (a imagem Docker desliga)
          designSystem: ctx.config.designSystem,
          ...(ctx.config.oidc ? { ssoOrigin: originOf(ctx.config.oidc.issuer) } : {}),
        };
        return info;
      });
      registerAuthRoutes(api, ctx);
      registerEmailRoutes(api, ctx);
      registerMailSettingsRoutes(api, ctx);
      registerSetupRoutes(api, ctx, gate);
      registerOidcRoutes(api, ctx, ctx.config.oidc ? new OidcClient(ctx.config.oidc) : null);
      registerWorkspaceRoutes(api, ctx);
      registerBoardRoutes(api, ctx);
      registerInvitationRoutes(api, ctx);
      registerInvitationResendRoute(api, ctx);
      registerInviteLinkRoutes(api, ctx);
      registerAccessRequestRoutes(api, ctx);
      registerDomainSignupRoutes(api, ctx);
      registerTemplateRoutes(api, ctx);
      registerPublicRoutes(api, ctx);
      registerAssetRoutes(api, ctx);
    },
    { prefix: API_PREFIX },
  );

  // Chat 09 · R2: o app compilado na mesma origem (imagem Docker); sem LUDRAW_WEB_DIR, só a API
  if (ctx.config.webDir) registerWebRoutes(app, ctx.config, loadWebApp(ctx.config.webDir));

  // Chat 08: tempo real (Yjs) no mesmo servidor HTTP, caminho /api/v1/collab
  if (ctx.config.collab.enabled) {
    const hub = new CollabHub(ctx, app);
    ctx.collab = hub;
    hub.attach(app.server);
    app.addHook('onClose', async () => {
      await hub.close();
    });
  }

  return { app, gate };
}
