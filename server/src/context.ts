/**
 * LuDraw server — dependências compartilhadas pelas rotas (Chat 07).
 */
import type { AssetStore } from './assets/store';
import type { CollabHub } from './collab/hub';
import type { ServerConfig } from './config';
import type { Db } from './db/client';
import { AttemptLimiter, RedisLimiter, type Limiter, type LimitScripts } from './lib/limiter';
import type { ClusterEvents, RedisClient } from './lib/redis';
import type { RemoteImageOptions } from './assets/remoteImage';
import type { ServerKeys } from './lib/secrets';
import type { Deferred } from './mail/deferred';
import type { HostLookup } from './mail/hostGuard';
import type { MailControl, Mailer, TransportFactory } from './mail/mailer';

export interface Limiters {
  /** login: por IP + e-mail */
  loginAccount: Limiter;
  /** login: por IP (qualquer e-mail) */
  loginIp: Limiter;
  /**
   * Chat 08.7 · R3: login com senha: por E-MAIL, somando todos os IPs (30 erros/15 min). Compromisso aceito: quem
   * souber o e-mail consegue travar o login com senha dessa conta por 15 min (saídas: recuperar senha, SSO, admin).
   */
  loginEmail: Limiter;
  /** assistente de primeiro acesso: por IP */
  setup: Limiter;
  /** troca de senha: por pessoa */
  changePassword: Limiter;
  /** prévia de convite: por IP */
  invitePreview: Limiter;
  /** aceite de convite com senha errada: por IP + convite */
  inviteAccept: Limiter;
  /** senha de link público errada: por IP (o link também conta as próprias tentativas no banco) */
  publicLinkIp: Limiter;
  /** início do login SSO: por IP */
  oidcStart: Limiter;
  /** conexões de tempo real (upgrade do WebSocket): por IP */
  collabConnect: Limiter;
  /** Chat 08.5 — e-mails para o mesmo destinatário e o mesmo tipo de mensagem (chave `tipo|endereço`) */
  mailAddress: Limiter;
  /** Chat 08.5 — e-mails pedidos pelo mesmo IP (rotas sem conta) */
  mailIp: Limiter;
  /** Chat 08.5 — e-mails pedidos pela mesma pessoa autenticada (verificar, teste…) */
  mailUser: Limiter;
  /** Chat 08.5 — toda rota que aceita um token recebido por e-mail: por IP */
  tokenIp: Limiter;
  /** Chat 08.5 · B2 — botão "Enviar e-mail de teste": por pessoa (além de `mailUser`) */
  mailTest: Limiter;
  /** Chat 09 · R2 — "Baixar para o board" pelo servidor: por pessoa (membro ou visitante) */
  remoteImage: Limiter;
  /** Chat 09 · R4 — teto de e-mails do servidor inteiro por hora (LUDRAW_MAIL_MAX_PER_HOUR), antes dentro do MailControl */
  mailCeiling: Limiter;
}

export interface AppContext {
  config: ServerConfig;
  db: Db;
  keys: ServerKeys;
  limiters: Limiters;
  /** versão do servidor (package.json) */
  version: string;
  /** tempo real (Chat 08); ausente com LUDRAW_COLLAB=false */
  collab?: CollabHub;
  /** Chat 08.2: arquivos das imagens (criado e conferido pelo `buildApp`) */
  assets?: AssetStore;
  /** Chat 08.5: carteiro (criado pelo `buildApp` a partir de `config.mail`; sem e-mail = `enabled: false`) */
  mailer?: Mailer;
  /** Chat 08.5: trabalho feito depois da resposta (criado pelo `buildApp`) */
  later?: Deferred;
  /** Chat 08.5 · B2: controle do carteiro (variáveis + painel; `reload()` depois de salvar o painel) */
  mailControl?: MailControl;
  /** Chat 08.5 · B2 (testes): resolução de nomes do host SMTP do painel */
  dnsLookup?: HostLookup;
  /** Chat 08.5 · B2 (testes): fábrica do transporte SMTP */
  smtpTransportFactory?: TransportFactory;
  /** Chat 09 · R2 (SÓ testes): opções do "Baixar para o board" pelo servidor (resolução, conexão, servidor local) */
  remoteImage?: Pick<RemoteImageOptions, 'lookup' | 'connect' | 'testAllowPrivate'>;
  /** Chat 09 · R4: Redis/Valkey (só com LUDRAW_REDIS_URL) — limites compartilhados entre instâncias */
  redis?: RedisClient;
  /** Chat 09 · R4: avisos entre instâncias (pub/sub no mesmo Redis) */
  cluster?: ClusterEvents;
}

/** Chat 08.7 · R3: limite do login com senha por e-mail (todos os IPs somados). */
/** Chat 09 · R2: imagens baixadas pelo servidor por pessoa (cada uma até 12 MB e 10 s). */
export const REMOTE_IMAGE_LIMIT = { max: 30, minutes: 10 } as const;
export const LOGIN_EMAIL_LIMIT = { max: 30, minutes: 15 } as const;

type LimiterMail = { maxPerAddressHour: number; maxPerIpHour: number; maxPerUserHour?: number; maxPerServerHour?: number } | null;

/**
 * Os limites de tentativa. Sem `redis`: em memória (uma instância, como sempre). Com `redis` (Chat 09 · R4): as mesmas
 * janelas e máximos, contados no Redis/Valkey e válidos para todas as instâncias juntas.
 */
export function createLimiters(mail?: LimiterMail, redis?: LimitScripts | null): Limiters {
  const minutes = (n: number) => n * 60_000;
  const make = (name: string, max: number, windowMs: number): Limiter => (redis ? new RedisLimiter(redis, name, max, windowMs) : new AttemptLimiter(max, windowMs));
  return {
    loginAccount: make('loginAccount', 8, minutes(15)),
    loginIp: make('loginIp', 40, minutes(15)),
    loginEmail: make('loginEmail', LOGIN_EMAIL_LIMIT.max, minutes(LOGIN_EMAIL_LIMIT.minutes)),
    setup: make('setup', 5, minutes(15)),
    changePassword: make('changePassword', 10, minutes(15)),
    invitePreview: make('invitePreview', 60, minutes(15)),
    inviteAccept: make('inviteAccept', 10, minutes(15)),
    publicLinkIp: make('publicLinkIp', 30, minutes(15)),
    oidcStart: make('oidcStart', 30, minutes(15)),
    collabConnect: make('collabConnect', 120, minutes(1)),
    mailAddress: make('mailAddress', mail?.maxPerAddressHour ?? 5, minutes(60)),
    mailIp: make('mailIp', mail?.maxPerIpHour ?? 20, minutes(60)),
    mailUser: make('mailUser', mail?.maxPerUserHour ?? 60, minutes(60)),
    tokenIp: make('tokenIp', 30, minutes(15)),
    mailTest: make('mailTest', 5, minutes(15)),
    remoteImage: make('remoteImage', REMOTE_IMAGE_LIMIT.max, minutes(REMOTE_IMAGE_LIMIT.minutes)),
    mailCeiling: make('mailCeiling', mail?.maxPerServerHour ?? 300, minutes(60)),
  };
}
