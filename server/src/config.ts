/**
 * LuDraw server — configuração lida do ambiente (Chat 07).
 *
 * Toda variável sensível aceita `<NOME>_FILE` (Docker secrets): o arquivo é lido e o valor da
 * variável comum é ignorado. Nenhum valor secreto é registrado em log.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type { InstallMode } from '../../src/types/workspace';
import { normalizeDomain } from '../../src/utils/workspace';
import { parseSourceList } from '../../src/utils/securityHeaders';

export type SameSite = 'lax' | 'strict' | 'none';
/** Repassado ao `trustProxy` do Fastify. */
export type TrustProxy = boolean | number | string[];

export interface BootstrapConfig {
  orgName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  allowedDomains: string[];
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  scopes: string;
  providerName: string;
  autoProvision: boolean;
  linkByEmail: boolean;
  /** Só desenvolvimento/testes: aceita um provedor em http:// (o boot avisa). */
  allowInsecureHttp: boolean;
}

export interface CollabConfig {
  /** LUDRAW_COLLAB (padrão ligado): desligado = só o Modo Servidor por PUT, como no Chat 07 */
  enabled: boolean;
  /** maior mensagem aceita no WebSocket (bytes); uma imagem maior que isto é recusada com aviso */
  maxPayloadBytes: number;
  /** espera antes de gravar o documento no banco depois de uma edição (ms) */
  storeDebounceMs: number;
  /** conexões simultâneas por pessoa (abas/aparelhos) */
  maxConnectionsPerUser: number;
  /** Chat 08.2: sem nenhuma mensagem da pessoa por este tempo, o servidor solta a seleção/edição dela (ms) */
  selectionIdleMs: number;
}

/** Chat 08.5: envio de e-mail (opcional). `null` = sem e-mail; o servidor funciona igual, só sem os fluxos que dependem dele. */
export interface MailConfig {
  /** `smtp` = servidor SMTP; `outbox` = arquivos .eml numa pasta (só fora de produção, para desenvolvimento e testes) */
  transport: 'smtp' | 'outbox';
  host: string | null;
  port: number;
  /** TLS desde a conexão (porta 465); nas outras portas o servidor usa STARTTLS */
  secure: boolean;
  user: string | null;
  password: string | null;
  /** remetente (`Nome <endereco@dominio>` ou só o endereço) */
  from: string;
  /** exige STARTTLS quando `secure` é falso (padrão ligado) */
  requireTls: boolean;
  outboxDir: string | null;
  /** endereço do app usado nos links dos e-mails (nunca vem do cabeçalho Host/Origin) */
  appUrl: string;
  /** teto de mensagens por hora para o mesmo destinatário e o mesmo tipo de e-mail */
  maxPerAddressHour: number;
  /** teto de mensagens por hora pedidas pelo mesmo IP */
  maxPerIpHour: number;
}

/**
 * Chat 08.5 · B2: o que as variáveis LUDRAW_SMTP_* definem, campo a campo (null = não definido). O painel
 * (Admin → Políticas → E-mail) completa só o que ficou null; variável sempre vence.
 */
export interface MailEnv {
  host: string | null;
  port: number | null;
  /** LUDRAW_SMTP_SECURE: true = TLS direto; false = STARTTLS; null = não definido */
  secure: boolean | null;
  user: string | null;
  password: string | null;
  from: string | null;
  /** LUDRAW_MAIL_OUTBOX_DIR definido: a pasta de saída de desenvolvimento manda em tudo */
  outbox: boolean;
  /** só por variável: SMTP sem TLS (recusado em produção) */
  allowInsecure: boolean;
  /** só por variável: exigir STARTTLS fora da porta de TLS direto (padrão ligado) */
  requireTls: boolean;
  /** só por variável: o host vindo do PAINEL pode apontar para endereço interno (homelab) */
  allowPrivateHost: boolean;
  maxPerAddressHour: number;
  maxPerIpHour: number;
  /** B2: e-mails disparados por uma pessoa logada (convites, reenvios, confirmação) por hora */
  maxPerUserHour: number;
  /** B2: teto de e-mails do servidor inteiro por hora (protege a conta SMTP e a reputação do domínio) */
  maxPerServerHour: number;
}

/** Limites de envio: padrão seguro e teto que nem a variável ultrapassa. */
export const MAIL_RATE_LIMITS = {
  perUserHour: { default: 60, max: 300 },
  perServerHour: { default: 300, max: 2000 },
  /** Chat 08.5 · C: CONTAS criadas pelo cadastro com o e-mail da organização, por domínio, em 24 h */
  domainSignupPerDay: { default: 50, max: 500 },
} as const;

export interface ServerConfig {
  production: boolean;
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  /** Endereço público do cliente/servidor (origem permitida e destino do SSO). */
  publicUrl: string | null;
  corsOrigins: string[];
  trustProxy: TrustProxy;
  jwtSecret: string | null;
  cookie: { secure: boolean; sameSite: SameSite };
  setupToken: string | null;
  mode: InstallMode;
  bootstrap: BootstrapConfig | null;
  /** Variáveis de bootstrap presentes, mas incompletas (o boot avisa e não faz nada). */
  bootstrapIncomplete: string[];
  oidc: OidcConfig | null;
  auditIpRetentionDays: number;
  /** LUDRAW_ALLOW_LOCAL_MODE: padrão do "modo local permitido" (a política da organização, se definida, vale por cima) */
  allowLocalMode: boolean;
  /**
   * Chat 09 · R5 (D11): LUDRAW_ENABLE_DESIGN_SYSTEM — a tela "Sistema visual" (#/design-system) aparece no app?
   * Padrão ligado (desenvolvimento); a imagem Docker define false. Vai no `/info` (`designSystem`).
   */
  designSystem: boolean;
  /** Tempo real (Chat 08): WebSocket Yjs em `/api/v1/collab`. */
  collab: CollabConfig;
  /**
   * Chat 08.7 · R3: tempos limite do servidor HTTP (ms). Cabeçalho inteiro, requisição inteira (inclui o corpo) e
   * conexão parada. O WebSocket do tempo real não é afetado pela ociosidade (o `ws` a desliga depois do upgrade).
   */
  http: { headersTimeoutMs: number; requestTimeoutMs: number; idleTimeoutMs: number };
  /** Chat 08.2: pasta das imagens do Modo Servidor (`LUDRAW_ASSETS_DIR`; padrão `data/assets` na pasta do servidor). */
  assetsDir: string;
  /** Chat 08.5: e-mail (SMTP opcional ou pasta de saída de desenvolvimento). */
  mail: MailConfig | null;
  /** Chat 08.5 · B2: campos de e-mail vindos das variáveis (o painel completa o resto) */
  mailEnv: MailEnv;
  /** Chat 08.5 · B2: endereço do app nos links dos e-mails (LUDRAW_APP_URL ou LUDRAW_PUBLIC_URL; só por variável) */
  appUrl: string | null;
  /** Chat 08.5 · C: teto de contas criadas pelo domínio por dia (LUDRAW_DOMAIN_SIGNUP_MAX_PER_DAY) */
  domainSignupMaxPerDay: number;
  /** Chat 09 · R1 (S-37, S-20): papéis do banco, migração fora do boot e tempos limite das consultas. */
  database: DatabaseOptions;
  /**
   * Chat 09 · R2: pasta do app compilado (`dist/`) servida pelo próprio servidor na mesma origem da API
   * (LUDRAW_WEB_DIR; na imagem Docker vem preenchida). Sem ela, o servidor só atende a API (desenvolvimento usa o Vite).
   */
  webDir: string | null;
  /** Chat 09 · R2: extras da CSP do app — LUDRAW_CSP_CONNECT_SRC (D7) e LUDRAW_FRAME_ANCESTORS (D8). */
  csp: { connectSrc: string[]; frameAncestors: string[] };
  /**
   * Chat 09 · R2: SÓ desenvolvimento/testes de navegador — o "Baixar para o board" aceita servidor de imagem local
   * (endereço interno e porta qualquer). Em produção a variável derruba o boot.
   */
  devRemoteImageAllowLocal: boolean;
  /**
   * Chat 09 · R4: Redis/Valkey para os limites de tentativa e avisos entre instâncias (LUDRAW_REDIS_URL ou _FILE).
   * null = tudo em memória (uma instância). Pode conter senha: nunca vai para log.
   */
  redisUrl: string | null;
  /** Avisos de configuração mostrados no boot (sem segredos). */
  warnings: string[];
}

/**
 * Chat 09 · R1. `migrateUrl` = LUDRAW_MIGRATE_DATABASE_URL(_FILE) (papel com DDL; sem ela, migra com o DATABASE_URL).
 * `migrateOnBoot` = LUDRAW_MIGRATE_ON_BOOT (padrão: ligado fora de produção, DESLIGADO em produção — lá a migração é
 * um passo separado, `db:migrate`). Tempos em ms; 0 desliga.
 */
export interface DatabaseOptions {
  migrateUrl: string | null;
  migrateOnBoot: boolean;
  statementTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
  poolMax: number;
}

/** Padrões do Chat 09 · R1 (decisão D5): consulta 15 s, transação parada 30 s, 10 conexões. */
export const DB_DEFAULTS = { statementTimeoutMs: 15_000, idleInTransactionTimeoutMs: 30_000, poolMax: 10 } as const;

type Env = Record<string, string | undefined>;

function str(env: Env, name: string): string | null {
  const v = env[name]?.trim();
  return v ? v : null;
}

/** Lê `<NOME>_FILE` se existir; senão `<NOME>`. Remove só a quebra de linha final do arquivo. */
/** Como gerar um segredo aleatório (vai na mensagem de erro/aviso do boot). */
export const SECRET_RECIPE = `Generate a random one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;

/** Marcadores de valor de exemplo copiado de documentação (Chat 08.7 · R5 · S-34). */
const PLACEHOLDER_MARKERS = /troque|change[-_]?me|replace[-_]?me|example|exemplo|placeholder|substitua|your[-_]?secret|seu[-_]?segredo|dummy/i;

/** Motivo para recusar um segredo (valor de exemplo ou sem variedade), ou null. */
export function weakSecretReason(value: string): string | null {
  if (PLACEHOLDER_MARKERS.test(value)) return 'looks like an example value copied from documentation';
  if (new Set(value).size < 10) return 'has too little variety (fewer than 10 distinct characters)';
  return null;
}

/**
 * Chat 08.7 · R5 (S-19): o PostgreSQL embutido (`pglite://`) é só para desenvolvimento e testes — em produção os
 * dados não persistem e a imagem `--omit=dev` nem o tem. Chamado pelo `index.ts` antes de abrir o banco.
 */
export function assertDatabaseForEnv(config: Pick<ServerConfig, 'production' | 'databaseUrl'>): void {
  if (config.production && config.databaseUrl.startsWith('pglite://')) {
    throw new Error('DATABASE_URL=pglite:// is the embedded test database and is refused in production (nothing is persisted). Use PostgreSQL: postgres://user:password@host:5432/ludraw');
  }
}

export function readSecret(env: Env, name: string): string | null {
  const file = str(env, `${name}_FILE`);
  if (file) {
    const content = readFileSync(file, 'utf8').replace(/\r?\n$/, '');
    return content.length ? content : null;
  }
  const v = env[name];
  return v && v.length ? v : null;
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const v = str(env, name)?.toLowerCase();
  if (v === null || v === undefined) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Chat 08.7 · R3: tempos limite do HTTP. Padrões: cabeçalho 30 s, requisição 120 s (um PUT de 40 MB numa conexão
 * lenta), ociosidade 60 s. O cabeçalho nunca passa da requisição (regra do Node).
 */
function httpTimeouts(env: Env): ServerConfig['http'] {
  const request = Math.max(1, int(env, 'LUDRAW_HTTP_REQUEST_TIMEOUT_SECONDS', 120));
  const headers = Math.min(request, Math.max(1, int(env, 'LUDRAW_HTTP_HEADERS_TIMEOUT_SECONDS', 30)));
  const idle = Math.max(1, int(env, 'LUDRAW_HTTP_IDLE_TIMEOUT_SECONDS', 60));
  return { headersTimeoutMs: headers * 1000, requestTimeoutMs: request * 1000, idleTimeoutMs: idle * 1000 };
}

function int(env: Env, name: string, fallback: number): number {
  const v = str(env, name);
  if (v === null) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

/** Limite de envio por hora: padrão seguro; acima do teto vale o teto (com aviso no boot). */
function boundedRate(env: Env, name: string, limits: { default: number; max: number }, warnings: string[]): number {
  const value = Math.max(1, int(env, name, limits.default));
  if (value > limits.max) {
    warnings.push(`${name}=${value} is above the safe ceiling; using ${limits.max}. Higher values are capped to protect the SMTP account and the organization.`);
    return limits.max;
  }
  return value;
}

function list(env: Env, name: string): string[] {
  return (str(env, name) ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** `LUDRAW_TRUST_PROXY`: vazio/false = desligado; true; número de saltos; ou lista de IPs/CIDR. */
export function parseTrustProxy(raw: string | null): TrustProxy {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  if (v === 'true' || v === 'on' || v === 'yes') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isLocalHost(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

export function loadConfig(env: Env = process.env): ServerConfig {
  const production = (str(env, 'NODE_ENV') ?? 'development') === 'production';
  const warnings: string[] = [];

  const databaseUrl = readSecret(env, 'DATABASE_URL');
  if (!databaseUrl) throw new Error('DATABASE_URL is required (example: postgres://ludraw:secret@localhost:5432/ludraw)');

  const publicUrl = str(env, 'LUDRAW_PUBLIC_URL');
  let publicParsed: URL | null = null;
  if (publicUrl) {
    try {
      publicParsed = new URL(publicUrl);
    } catch {
      throw new Error('LUDRAW_PUBLIC_URL must be an absolute URL (example: https://draw.example.com)');
    }
  }

  const corsOrigins = list(env, 'LUDRAW_CORS_ORIGINS').map((o) => {
    const origin = originOf(o);
    if (!origin) throw new Error(`LUDRAW_CORS_ORIGINS has an invalid origin: ${o}`);
    return origin;
  });

  // Cookie Secure: padrão ligado em produção; pode ser forçado pela variável.
  const secure = bool(env, 'LUDRAW_COOKIE_SECURE', production);
  const sameSiteRaw = (str(env, 'LUDRAW_COOKIE_SAMESITE') ?? 'lax').toLowerCase();
  if (sameSiteRaw !== 'lax' && sameSiteRaw !== 'strict' && sameSiteRaw !== 'none') throw new Error('LUDRAW_COOKIE_SAMESITE must be lax, strict or none');
  const sameSite = sameSiteRaw as SameSite;
  if (sameSite === 'none' && !secure) throw new Error('LUDRAW_COOKIE_SAMESITE=none requires LUDRAW_COOKIE_SECURE=true (browsers reject it otherwise)');
  if (publicParsed && publicParsed.protocol === 'http:' && !isLocalHost(publicParsed)) {
    warnings.push(
      `LUDRAW_PUBLIC_URL uses plain http (${publicParsed.origin}). Session cookies ${secure ? 'are marked Secure and will NOT be sent over http' : 'are sent WITHOUT the Secure flag and can be read on the network'}. Put the server behind HTTPS.`,
    );
  }
  if (!secure && production) warnings.push('LUDRAW_COOKIE_SECURE=false in production: the session cookie travels without the Secure flag.');

  const modeRaw = (str(env, 'LUDRAW_MODE') ?? 'single_org').toLowerCase();
  if (modeRaw !== 'single_org' && modeRaw !== 'multi_org') throw new Error('LUDRAW_MODE must be single_org or multi_org');

  // Bootstrap por variáveis (WORKSPACE_ADMIN_SPEC §5)
  const orgName = str(env, 'LUDRAW_ORG_NAME');
  const adminEmail = str(env, 'LUDRAW_ADMIN_EMAIL');
  const adminPassword = readSecret(env, 'LUDRAW_ADMIN_PASSWORD');
  const present = [orgName && 'LUDRAW_ORG_NAME', adminEmail && 'LUDRAW_ADMIN_EMAIL', adminPassword && 'LUDRAW_ADMIN_PASSWORD'].filter(Boolean) as string[];
  const allowedDomains = list(env, 'LUDRAW_ALLOWED_DOMAINS').map((d) => {
    const n = normalizeDomain(d);
    if (!n) throw new Error(`LUDRAW_ALLOWED_DOMAINS has an invalid domain: ${d}`);
    return n;
  });
  const bootstrap =
    orgName && adminEmail && adminPassword
      ? { orgName, adminEmail: adminEmail.toLowerCase(), adminPassword, adminName: str(env, 'LUDRAW_ADMIN_NAME') ?? adminEmail.split('@')[0], allowedDomains }
      : null;
  const bootstrapIncomplete = !bootstrap && present.length ? present : [];

  // SSO (OIDC genérico)
  const issuer = str(env, 'OIDC_ISSUER');
  let oidc: OidcConfig | null = null;
  if (issuer) {
    const clientId = str(env, 'OIDC_CLIENT_ID');
    const redirectUri = str(env, 'OIDC_REDIRECT_URI') ?? (publicUrl ? new URL('/api/v1/auth/oidc/callback', publicUrl).toString() : null);
    if (!clientId) throw new Error('OIDC_ISSUER is set but OIDC_CLIENT_ID is missing');
    if (!redirectUri) throw new Error('OIDC_ISSUER is set but neither OIDC_REDIRECT_URI nor LUDRAW_PUBLIC_URL is defined');
    oidc = {
      issuer,
      clientId,
      clientSecret: readSecret(env, 'OIDC_CLIENT_SECRET'),
      redirectUri,
      scopes: str(env, 'OIDC_SCOPES') ?? 'openid email profile',
      providerName: str(env, 'OIDC_PROVIDER_NAME') ?? 'SSO',
      autoProvision: bool(env, 'OIDC_AUTO_PROVISION', false),
      linkByEmail: bool(env, 'OIDC_LINK_BY_EMAIL', false),
      allowInsecureHttp: bool(env, 'OIDC_ALLOW_INSECURE_HTTP', false),
    };
    if (oidc.allowInsecureHttp) warnings.push('OIDC_ALLOW_INSECURE_HTTP=true: the SSO provider is reached over plain http. Use it only for local development.');
  }

  // E-mail (Chat 08.5): SMTP opcional; pasta de saída .eml só fora de produção
  const smtpHost = str(env, 'LUDRAW_SMTP_HOST');
  const outboxRaw = str(env, 'LUDRAW_MAIL_OUTBOX_DIR');
  let mail: MailConfig | null = null;
  if (smtpHost && outboxRaw) throw new Error('Set either LUDRAW_SMTP_HOST or LUDRAW_MAIL_OUTBOX_DIR, not both');
  // endereço do app nos e-mails: só por variável (nunca do cabeçalho Host/Origin, nunca pelo painel)
  const appUrlRaw = str(env, 'LUDRAW_APP_URL') ?? publicUrl;
  let appParsed: URL | null = null;
  if (appUrlRaw) {
    try {
      appParsed = new URL(appUrlRaw);
    } catch {
      throw new Error('LUDRAW_APP_URL must be an absolute URL (example: https://draw.example.com)');
    }
    if (appParsed.protocol !== 'https:' && appParsed.protocol !== 'http:') throw new Error('LUDRAW_APP_URL must start with https:// or http://');
  }
  const appUrl = appParsed ? `${appParsed.origin}${appParsed.pathname.replace(/\/+$/, '')}` : null;
  const allowPrivateHost = bool(env, 'LUDRAW_SMTP_ALLOW_PRIVATE_HOST', false);
  if (allowPrivateHost) warnings.push('LUDRAW_SMTP_ALLOW_PRIVATE_HOST=true: the e-mail panel accepts SMTP hosts on internal addresses. Use it only on a trusted home/lab network.');
  if (smtpHost || outboxRaw) {
    if (outboxRaw && production) throw new Error('LUDRAW_MAIL_OUTBOX_DIR is a development aid and is refused in production (messages would sit unencrypted on disk). Configure LUDRAW_SMTP_HOST instead');
    if (!appParsed || !appUrl) throw new Error('E-mail is configured but neither LUDRAW_APP_URL nor LUDRAW_PUBLIC_URL is defined (links in e-mails are never built from request headers)');
    if (appParsed.protocol === 'http:' && !isLocalHost(appParsed)) warnings.push(`LUDRAW_APP_URL uses plain http (${appParsed.origin}): links sent by e-mail (password reset, verification) travel unprotected. Put the app behind HTTPS.`);
    const from = str(env, 'LUDRAW_SMTP_FROM');
    if (smtpHost && !from) throw new Error('LUDRAW_SMTP_HOST is set but LUDRAW_SMTP_FROM is missing (example: LuDraw <no-reply@example.com>)');
    const port = int(env, 'LUDRAW_SMTP_PORT', 587);
    const secure = bool(env, 'LUDRAW_SMTP_SECURE', port === 465);
    const allowInsecure = bool(env, 'LUDRAW_SMTP_ALLOW_INSECURE', false);
    if (allowInsecure && production) throw new Error('LUDRAW_SMTP_ALLOW_INSECURE is refused in production (credentials and reset links would travel in clear text)');
    if (allowInsecure) warnings.push('LUDRAW_SMTP_ALLOW_INSECURE=true: e-mail is sent without TLS. Use it only for local development.');
    const user = str(env, 'LUDRAW_SMTP_USER');
    const password = readSecret(env, 'LUDRAW_SMTP_PASSWORD');
    if (smtpHost && !!user !== !!password) throw new Error('LUDRAW_SMTP_USER and LUDRAW_SMTP_PASSWORD must be set together (or both left empty for a relay without authentication)');
    mail = {
      transport: smtpHost ? 'smtp' : 'outbox',
      host: smtpHost,
      port,
      secure,
      user,
      password,
      from: from ?? 'LuDraw <no-reply@localhost>',
      requireTls: !secure && !allowInsecure && bool(env, 'LUDRAW_SMTP_REQUIRE_TLS', true),
      outboxDir: outboxRaw ? resolvePath(outboxRaw) : null,
      appUrl,
      maxPerAddressHour: Math.max(1, int(env, 'LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR', 5)),
      maxPerIpHour: Math.max(1, int(env, 'LUDRAW_MAIL_MAX_PER_IP_HOUR', 20)),
    };
  }

  const jwtSecret = readSecret(env, 'LUDRAW_JWT_SECRET');
  // Chat 08.7 · R5 (S-34): segredo de exemplo/fraco recusado; curto = erro em produção, aviso em desenvolvimento
  if (jwtSecret) {
    const weak = weakSecretReason(jwtSecret);
    if (weak) throw new Error(`LUDRAW_JWT_SECRET ${weak}. ${SECRET_RECIPE}`);
    if (jwtSecret.length < 32) {
      if (production) throw new Error(`LUDRAW_JWT_SECRET must have at least 32 characters in production. ${SECRET_RECIPE}`);
      warnings.push(`LUDRAW_JWT_SECRET has fewer than 32 characters (accepted only outside production). ${SECRET_RECIPE}`);
    }
  }
  const setupToken = readSecret(env, 'LUDRAW_SETUP_TOKEN');
  if (setupToken && setupToken.length < 16) throw new Error('LUDRAW_SETUP_TOKEN must have at least 16 characters');

  const database = databaseOptions(env, production, warnings);
  const devRemoteImageAllowLocal = bool(env, 'LUDRAW_DEV_REMOTE_IMAGE_ALLOW_LOCAL', false);
  if (devRemoteImageAllowLocal && production) throw new Error('LUDRAW_DEV_REMOTE_IMAGE_ALLOW_LOCAL is for development tests only and is refused in production (it would let the server fetch internal addresses).');
  const redisUrl = readSecret(env, 'LUDRAW_REDIS_URL');
  if (redisUrl && !/^rediss?:\/\/\S+$/i.test(redisUrl)) throw new Error('LUDRAW_REDIS_URL must be a redis:// or rediss:// URL (example: redis://valkey:6379)');
  if (devRemoteImageAllowLocal) warnings.push('LUDRAW_DEV_REMOTE_IMAGE_ALLOW_LOCAL=true: "Download to the board" may fetch internal addresses (development only).');

  return {
    production,
    host: str(env, 'HOST') ?? '0.0.0.0',
    port: int(env, 'PORT', 3001),
    logLevel: str(env, 'LOG_LEVEL') ?? 'info',
    databaseUrl,
    publicUrl: publicParsed ? publicParsed.origin : null,
    corsOrigins,
    trustProxy: parseTrustProxy(str(env, 'LUDRAW_TRUST_PROXY')),
    jwtSecret,
    cookie: { secure, sameSite },
    setupToken,
    mode: modeRaw as InstallMode,
    bootstrap,
    bootstrapIncomplete,
    oidc,
    auditIpRetentionDays: int(env, 'LUDRAW_AUDIT_IP_RETENTION_DAYS', 90),
    allowLocalMode: bool(env, 'LUDRAW_ALLOW_LOCAL_MODE', false),
    designSystem: bool(env, 'LUDRAW_ENABLE_DESIGN_SYSTEM', true),
    collab: {
      enabled: bool(env, 'LUDRAW_COLLAB', true),
      maxPayloadBytes: int(env, 'LUDRAW_COLLAB_MAX_PAYLOAD_MB', 24) * 1024 * 1024,
      storeDebounceMs: int(env, 'LUDRAW_COLLAB_STORE_DEBOUNCE_MS', 2000),
      maxConnectionsPerUser: int(env, 'LUDRAW_COLLAB_MAX_CONNECTIONS_PER_USER', 12),
      selectionIdleMs: Math.max(1, int(env, 'LUDRAW_COLLAB_SELECTION_IDLE_SECONDS', 300)) * 1000,
    },
    http: httpTimeouts(env),
    assetsDir: resolvePath(str(env, 'LUDRAW_ASSETS_DIR') ?? 'data/assets'),
    mail,
    mailEnv: {
      host: smtpHost,
      port: str(env, 'LUDRAW_SMTP_PORT') === null ? null : int(env, 'LUDRAW_SMTP_PORT', 587),
      secure: str(env, 'LUDRAW_SMTP_SECURE') === null ? null : bool(env, 'LUDRAW_SMTP_SECURE', false),
      user: str(env, 'LUDRAW_SMTP_USER'),
      password: readSecret(env, 'LUDRAW_SMTP_PASSWORD'),
      from: str(env, 'LUDRAW_SMTP_FROM'),
      outbox: !!outboxRaw,
      allowInsecure: !production && bool(env, 'LUDRAW_SMTP_ALLOW_INSECURE', false),
      requireTls: bool(env, 'LUDRAW_SMTP_REQUIRE_TLS', true),
      allowPrivateHost,
      maxPerAddressHour: Math.max(1, int(env, 'LUDRAW_MAIL_MAX_PER_ADDRESS_HOUR', 5)),
      maxPerIpHour: Math.max(1, int(env, 'LUDRAW_MAIL_MAX_PER_IP_HOUR', 20)),
      maxPerUserHour: boundedRate(env, 'LUDRAW_MAIL_MAX_PER_USER_HOUR', MAIL_RATE_LIMITS.perUserHour, warnings),
      maxPerServerHour: boundedRate(env, 'LUDRAW_MAIL_MAX_PER_HOUR', MAIL_RATE_LIMITS.perServerHour, warnings),
    },
    appUrl,
    domainSignupMaxPerDay: boundedRate(env, 'LUDRAW_DOMAIN_SIGNUP_MAX_PER_DAY', MAIL_RATE_LIMITS.domainSignupPerDay, warnings),
    database,
    webDir: str(env, 'LUDRAW_WEB_DIR') ? resolvePath(str(env, 'LUDRAW_WEB_DIR') as string) : null,
    csp: {
      connectSrc: parseSourceList(str(env, 'LUDRAW_CSP_CONNECT_SRC'), 'LUDRAW_CSP_CONNECT_SRC'),
      frameAncestors: parseSourceList(str(env, 'LUDRAW_FRAME_ANCESTORS'), 'LUDRAW_FRAME_ANCESTORS'),
    },
    devRemoteImageAllowLocal,
    redisUrl,
    warnings,
  };
}

function databaseOptions(env: Env, production: boolean, warnings: string[]): DatabaseOptions {
  const migrateUrl = readSecret(env, 'LUDRAW_MIGRATE_DATABASE_URL');
  if (migrateUrl && !/^postgres(ql)?:\/\//i.test(migrateUrl)) throw new Error('LUDRAW_MIGRATE_DATABASE_URL must be a postgres:// URL');
  const migrateOnBoot = bool(env, 'LUDRAW_MIGRATE_ON_BOOT', !production);
  if (production && migrateOnBoot && !migrateUrl) {
    warnings.push('LUDRAW_MIGRATE_ON_BOOT=true without LUDRAW_MIGRATE_DATABASE_URL: migrations run with the application database user, which then needs permission to change the schema. Prefer a separate migration role (see docs).');
  }
  const poolMax = int(env, 'LUDRAW_DB_POOL_MAX', DB_DEFAULTS.poolMax);
  if (poolMax < 1) throw new Error('LUDRAW_DB_POOL_MAX must be at least 1');
  return {
    migrateUrl,
    migrateOnBoot,
    statementTimeoutMs: int(env, 'LUDRAW_DB_STATEMENT_TIMEOUT_MS', DB_DEFAULTS.statementTimeoutMs),
    idleInTransactionTimeoutMs: int(env, 'LUDRAW_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', DB_DEFAULTS.idleInTransactionTimeoutMs),
    poolMax,
  };
}

/** Origens aceitas no cabeçalho `Origin` (CORS e proteção das rotas com cookie). */
export function allowedOrigins(config: ServerConfig): Set<string> {
  const set = new Set(config.corsOrigins);
  if (config.publicUrl) set.add(config.publicUrl);
  return set;
}
