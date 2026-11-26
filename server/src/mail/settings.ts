/**
 * LuDraw server — e-mail configurado pelo painel (Chat 08.5 · B2).
 *
 * A configuração efetiva junta as variáveis LUDRAW_SMTP_* e a linha `mail_settings`, CAMPO A CAMPO: a
 * variável vence e trava o campo na tela. A pasta de saída de desenvolvimento (LUDRAW_MAIL_OUTBOX_DIR)
 * manda em tudo. LUDRAW_APP_URL continua só por variável.
 *
 * A senha salva pelo painel é cifrada com `keys.mailSealer` (derivada de LUDRAW_JWT_SECRET, propósito
 * 'smtp-password'); sem essa variável o painel não aceita senha. Nada daqui devolve, registra ou audita a senha.
 */
import { eq } from 'drizzle-orm';
import type { MailSecurity, MailSettingsField, MailSettingsProblem, MailSettingsView } from '../../../src/utils/apiContract';
import type { MailConfig, MailEnv, ServerConfig } from '../config';
import type { Db } from '../db/client';
import { mailSettings } from '../db/schema';
import type { Sealer } from '../lib/crypto';
import { readSetup } from '../setup/provision';

export type MailSettingsRow = typeof mailSettings.$inferSelect;

export const MAIL_SETTINGS_ID = 'default';

export async function readMailSettings(db: Db): Promise<MailSettingsRow | null> {
  const [row] = await db.select().from(mailSettings).where(eq(mailSettings.id, MAIL_SETTINGS_ID));
  return row ?? null;
}

/** Senha do painel em texto (só na memória do carteiro) — `unreadable` quando a chave mudou ou falta. */
export function panelPassword(row: MailSettingsRow | null, sealer: Sealer | null): { value: string | null; unreadable: boolean } {
  if (!row?.passwordEnc) return { value: null, unreadable: false };
  if (!sealer || row.passwordKeyCheck !== sealer.fingerprint()) return { value: null, unreadable: true };
  const value = sealer.open(row.passwordEnc);
  return value === null ? { value: null, unreadable: true } : { value, unreadable: false };
}

export interface ResolvedMail {
  /** configuração do carteiro; null = sem e-mail */
  config: MailConfig | null;
  /** o host veio do painel: conferir e fixar o IP a cada envio (`hostGuard`) */
  panelHost: boolean;
  view: MailSettingsView;
}

export interface ResolveInput {
  env: MailEnv;
  /** configuração completa só por variáveis (calculada no boot; pasta de saída ou SMTP) */
  envConfig: MailConfig | null;
  appUrl: string | null;
  row: MailSettingsRow | null;
  sealer: Sealer | null;
  serverOnly: boolean;
}

/** Junta variáveis e painel. Puro (sem rede, sem banco): os testes chamam direto. */
export function resolveMail(input: ResolveInput): ResolvedMail {
  const { env, row, sealer, appUrl } = input;
  const locked: Record<MailSettingsField, boolean> = {
    host: env.host !== null,
    port: env.port !== null,
    security: env.secure !== null,
    user: env.user !== null,
    password: env.password !== null,
    from: env.from !== null,
  };
  const base = {
    canStorePassword: !!sealer,
    appUrlMissing: !appUrl,
    serverOnly: input.serverOnly,
    allowPrivateHost: env.allowPrivateHost,
  };

  // pasta de saída (desenvolvimento): tudo vem das variáveis
  if (env.outbox) {
    return {
      config: input.envConfig,
      panelHost: false,
      view: {
        ...base,
        active: !!input.envConfig,
        source: 'outbox',
        enabled: true,
        enabledLocked: true,
        values: { host: null, port: null, security: null, user: null, from: input.envConfig?.from ?? null },
        locked: { host: true, port: true, security: true, user: true, password: true, from: true },
        passwordSet: false,
        passwordUnreadable: false,
        problem: null,
      },
    };
  }

  const stored = panelPassword(row, sealer);
  const host = env.host ?? row?.host ?? null;
  const security: MailSecurity | null = env.secure !== null ? (env.secure ? 'tls' : 'starttls') : (row?.security ?? null);
  const port = env.port ?? row?.port ?? (security === 'tls' ? 465 : host ? 587 : null);
  const secure = security ? security === 'tls' : port === 465;
  const user = env.user ?? row?.username ?? null;
  const password = env.password ?? stored.value;
  const from = env.from ?? row?.fromAddress ?? null;
  const enabledLocked = env.host !== null;
  const enabled = enabledLocked || !!row?.enabled;

  // de onde vieram os valores presentes
  const fromEnv = [env.host, env.port, env.secure, env.user, env.password, env.from].some((v) => v !== null);
  const fromPanel =
    (!locked.host && !!row?.host) ||
    (!locked.port && row?.port != null) ||
    (!locked.security && !!row?.security) ||
    (!locked.user && !!row?.username) ||
    (!locked.password && !!row?.passwordEnc) ||
    (!locked.from && !!row?.fromAddress);
  const source: MailSettingsView['source'] = !host && !fromEnv && !fromPanel ? 'none' : fromEnv && fromPanel ? 'mixed' : fromEnv ? 'env' : 'panel';

  let problem: MailSettingsProblem | null = null;
  if (!enabled) problem = 'off';
  else if (!host) problem = 'missingHost';
  else if (!from) problem = 'missingFrom';
  else if (user && !password) problem = !locked.password && stored.unreadable ? 'passwordUnreadable' : 'missingPassword';
  else if (!appUrl) problem = 'appUrlMissing';

  const config: MailConfig | null =
    problem === null && host && from && appUrl && port !== null
      ? {
          transport: 'smtp',
          host,
          port,
          secure,
          user,
          password: user ? password : null,
          from,
          requireTls: !secure && !env.allowInsecure && env.requireTls,
          outboxDir: null,
          appUrl,
          maxPerAddressHour: env.maxPerAddressHour,
          maxPerIpHour: env.maxPerIpHour,
        }
      : null;

  return {
    config,
    panelHost: !locked.host,
    view: {
      ...base,
      active: !!config,
      source,
      enabled,
      enabledLocked,
      values: { host, port, security: security ?? (host ? (secure ? 'tls' : 'starttls') : null), user, from },
      locked,
      passwordSet: locked.password || !!row?.passwordEnc,
      passwordUnreadable: !locked.password && stored.unreadable,
      problem,
    },
  };
}

/** Lê o painel e o modo da instalação e resolve a configuração efetiva (usado pelo `MailControl`). */
export async function loadResolvedMail(db: Db, config: ServerConfig, sealer: Sealer | null): Promise<ResolvedMail> {
  const [row, setup] = await Promise.all([readMailSettings(db), readSetup(db)]);
  return resolveMail({ env: config.mailEnv, envConfig: config.mail, appUrl: config.appUrl, row, sealer, serverOnly: setup.mode === 'multi_org' });
}

/** Remetente: `endereco@dominio` ou `Nome <endereco@dominio>`, numa linha só. */
export function isValidFrom(from: string): boolean {
  if (/[\r\n]/.test(from)) return false;
  const addr = /^\s*(?:[^<>"]{1,120}\s)?<([^<>\s]+)>\s*$/.exec(from)?.[1] ?? from.trim();
  return /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(addr);
}
