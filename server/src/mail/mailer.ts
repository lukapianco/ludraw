/**
 * LuDraw server — carteiro (Chat 08.5).
 *
 * O servidor funciona sem e-mail: `disabledMailer` só diz que não há envio e as rotas que dependem dele
 * respondem "indisponível". Com SMTP (variáveis LUDRAW_SMTP_* e/ou o painel — B2) as mensagens saem pelo
 * nodemailer; com `LUDRAW_MAIL_OUTBOX_DIR` (só fora de produção) viram arquivos `.eml` numa pasta, para
 * desenvolvimento e para os testes de navegador. Os testes do servidor usam `MemoryMailer` (./memory.ts).
 *
 * B2: `MailControl` é o carteiro do `ctx`: um objeto estável cujo conteúdo é trocado por `reload()` quando a
 * administração salva o painel — sem reiniciar o servidor. Host vindo do painel passa pela `hostGuard` a cada
 * envio, e a conexão vai ao IP conferido (nunca ao nome de novo).
 *
 * Nada aqui escreve destinatário, assunto, corpo ou senha no log.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { createTransport } from 'nodemailer';
import type { MailSettingsView } from '../../../src/utils/apiContract';
import type { MailConfig } from '../config';
import { AttemptLimiter, type Limiter } from '../lib/limiter';
import { checkSmtpHost, defaultLookup, type HostLookup } from './hostGuard';
import type { ResolvedMail } from './settings';

/** Imagem embutida na mensagem (só conteúdo em memória — nunca caminho de arquivo nem URL). */
export interface MailAttachment {
  filename: string;
  /** referenciada no HTML como `cid:<cid>` */
  cid: string;
  contentType: string;
  content: Buffer;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** B2: faixa da marca (inline) */
  attachments?: MailAttachment[];
}

export interface Mailer {
  /** falso = este servidor não envia e-mail */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export const disabledMailer: Mailer = {
  enabled: false,
  async send() {
    throw new Error('mail is not configured');
  },
};

/** Cabeçalhos em uma linha só (quebra de linha num assunto ou endereço viraria cabeçalho novo). */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function envelope(config: MailConfig, message: MailMessage) {
  return {
    from: config.from,
    to: oneLine(message.to),
    subject: oneLine(message.subject),
    text: message.text,
    html: message.html,
    attachments: (message.attachments ?? []).map((a) => ({ filename: a.filename, cid: a.cid, contentType: a.contentType, content: a.content, contentDisposition: 'inline' as const })),
    // o conteúdo é sempre gerado aqui (anexos só da memória): nada de anexar arquivo local nem buscar URL
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export type MailEnvelope = ReturnType<typeof envelope>;

/** Opções do transporte SMTP que o LuDraw usa (subconjunto das do nodemailer). */
export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
  /** nome para o SNI e a validação do certificado quando `host` é o IP já conferido */
  servername?: string;
  tls?: { servername?: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/** Cria o transporte (injetável nos testes para conferir as opções sem rede). */
export type TransportFactory = (options: SmtpOptions) => { sendMail(message: MailEnvelope): Promise<unknown> };

export const defaultTransportFactory: TransportFactory = (options) => createTransport(options);

export interface SmtpDeps {
  lookup: HostLookup;
  factory: TransportFactory;
  /** LUDRAW_SMTP_ALLOW_PRIVATE_HOST */
  allowPrivate: boolean;
}

/** O host do painel resolveu para endereço interno (ou não resolveu) na hora do envio. */
export class MailHostBlockedError extends Error {
  readonly code = 'EHOSTBLOCKED';
  constructor(readonly reason: 'invalid' | 'private' | 'unresolved') {
    super('SMTP host refused by the host guard');
    this.name = 'MailHostBlockedError';
  }
}

/** O servidor atingiu o teto de e-mails por hora (LUDRAW_MAIL_MAX_PER_HOUR). */
export class MailRateLimitedError extends Error {
  readonly code = 'ERATELIMIT';
  constructor(readonly retryAfterMs: number) {
    super('hourly e-mail ceiling reached');
    this.name = 'MailRateLimitedError';
  }
}

function smtpOptions(config: MailConfig): SmtpOptions {
  return {
    host: config.host ?? 'localhost',
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTls,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/**
 * SMTP. `pinHost` = o host veio do painel: a cada envio o nome é resolvido e conferido pela `hostGuard`, e o
 * transporte recebe o IP conferido como `host` + o nome original como `servername`/`tls.servername`. O
 * nodemailer não resolve um host que já é IP, então não há segunda consulta de DNS depois da conferência.
 */
function smtpMailer(config: MailConfig, deps: () => SmtpDeps, pinHost: boolean): Mailer {
  return {
    enabled: true,
    async send(message) {
      const d = deps();
      const options = smtpOptions(config);
      if (pinHost) {
        const name = options.host.replace(/^\[|\]$/g, '');
        const check = await checkSmtpHost(name, { lookup: d.lookup, allowPrivate: d.allowPrivate });
        if (!check.ok) throw new MailHostBlockedError(check.reason);
        options.host = check.addresses[0];
        if (!isIP(name)) {
          options.servername = name;
          options.tls = { servername: name };
        }
      }
      await d.factory(options).sendMail(envelope(config, message));
    },
  };
}

function outboxMailer(config: MailConfig): Mailer {
  const dir = config.outboxDir!;
  mkdirSync(dir, { recursive: true });
  const transport = createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  return {
    enabled: true,
    async send(message) {
      const info = await transport.sendMail(envelope(config, message));
      const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
      writeFileSync(join(dir, `${base}.eml`), info.message as Buffer);
      // Cópia legível só do texto: no .eml (quoted-printable) linhas longas quebram com "=" no meio
      // dos links, e copiar de lá entrega um token cortado. Este arquivo tem os links inteiros.
      const env = envelope(config, message);
      writeFileSync(join(dir, `${base}.txt`), `To: ${env.to}\nSubject: ${env.subject}\n\n${message.text}\n`, 'utf8');
    },
  };
}

const defaultDeps = (): SmtpDeps => ({ lookup: defaultLookup, factory: defaultTransportFactory, allowPrivate: false });

/** Carteiro de uma configuração fixa (host das variáveis: sem fixação de IP). */
export function createMailer(config: MailConfig | null, deps: () => SmtpDeps = defaultDeps, pinHost = false): Mailer {
  if (!config) return disabledMailer;
  return config.transport === 'smtp' ? smtpMailer(config, deps, pinHost) : outboxMailer(config);
}

/**
 * Chat 08.5 · B2 — o carteiro do servidor. `reload()` relê variáveis + painel e troca o carteiro de dentro;
 * quem guardou `ctx.mailer` continua com o mesmo objeto. Vale por instância (várias instâncias: Chat 09).
 */
export class MailControl implements Mailer {
  private inner: Mailer = disabledMailer;
  private current: MailSettingsView | null = null;
  /** B2: teto de e-mails do servidor inteiro por hora (LUDRAW_MAIL_MAX_PER_HOUR) */
  private readonly ceiling: Limiter;
  private warnedUntil = 0;

  constructor(
    private readonly load: () => Promise<ResolvedMail>,
    private readonly deps: () => SmtpDeps,
    private readonly opts: { maxPerHour: number; onCeiling?: (retryAfterMs: number) => void; ceiling?: Limiter } = { maxPerHour: 300 },
  ) {
    // Chat 09 · R4: o teto vem do conjunto de limites (memória ou Redis, compartilhado entre instâncias)
    this.ceiling = opts.ceiling ?? new AttemptLimiter(opts.maxPerHour, 60 * 60_000);
  }

  get enabled(): boolean {
    return this.inner.enabled;
  }

  async send(message: MailMessage): Promise<void> {
    if (this.inner.enabled) {
      const r = await this.ceiling.hit('server');
      if (!r.allowed) {
        // avisa uma vez por janela (o log nunca leva destinatário nem conteúdo)
        if (Date.now() > this.warnedUntil) {
          this.warnedUntil = Date.now() + r.retryAfterMs;
          this.opts.onCeiling?.(r.retryAfterMs);
        }
        throw new MailRateLimitedError(r.retryAfterMs);
      }
    }
    return this.inner.send(message);
  }

  /** estado atual para a administração (sem senha) */
  get view(): MailSettingsView | null {
    return this.current;
  }

  async reload(): Promise<MailSettingsView> {
    const resolved = await this.load();
    this.inner = createMailer(resolved.config, this.deps, resolved.panelHost);
    this.current = resolved.view;
    return resolved.view;
  }
}

/** O que pode ir ao log quando um envio falha: código e etapa, nunca endereço nem conteúdo. */
export function mailErrorForLog(err: unknown): Record<string, unknown> {
  const e = (err ?? {}) as { name?: unknown; code?: unknown; command?: unknown; responseCode?: unknown };
  return {
    name: typeof e.name === 'string' ? e.name : 'Error',
    code: typeof e.code === 'string' ? e.code : undefined,
    command: typeof e.command === 'string' ? e.command : undefined,
    responseCode: typeof e.responseCode === 'number' ? e.responseCode : undefined,
  };
}

/** Categoria do erro de envio para a administração (sem a resposta do servidor remoto). */
export function mailFailureCode(err: unknown): 'mailServerLimit' | 'mailHostPrivate' | 'mailHostUnresolved' | 'mailConnectFailed' | 'mailTlsFailed' | 'mailAuthFailed' | 'mailSendFailed' {
  if (err instanceof MailRateLimitedError) return 'mailServerLimit';
  if (err instanceof MailHostBlockedError) return err.reason === 'private' ? 'mailHostPrivate' : 'mailHostUnresolved';
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'EAUTH') return 'mailAuthFailed';
  if (code === 'ETLS') return 'mailTlsFailed';
  if (code === 'ECONNECTION' || code === 'EDNS' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNREFUSED') return 'mailConnectFailed';
  return 'mailSendFailed';
}
