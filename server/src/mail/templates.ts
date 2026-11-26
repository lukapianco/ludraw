/**
 * LuDraw server — texto dos e-mails (Chat 08.5).
 *
 * Os textos vêm dos MESMOS catálogos do app (`src/locales/<idioma>/server.json`, chaves `mail.*`), lidos
 * aqui como dado JSON — sem o motor `src/i18n` (o servidor só importa módulos puros). A interpolação é
 * simples (`{nome}`) e todo valor é escapado no HTML.
 *
 * B2: o layout é o de `src/utils/mailLayout.ts` (o mesmo das prévias do `#/design-system`), com a faixa da
 * marca em PNG EMBUTIDA na própria mensagem (anexo inline, `cid:`) — nada é buscado fora do e-mail.
 */
import type { MailKind, MailLang } from '../../../src/utils/apiContract';
import { mailBannerArtFor } from '../../../src/utils/mailBanners';
import { composeMail, escapeHtml as escapeHtmlShared, type MailParams as SharedParams } from '../../../src/utils/mailLayout';
import en from '../../../src/locales/en/server.json';
import ptBR from '../../../src/locales/pt-BR/server.json';
import { MAIL_BANNER_PNG } from './bannerImages';
import type { MailMessage } from './mailer';

const CATALOGS: Record<MailLang, Record<string, string>> = { 'pt-BR': ptBR, en };

/** Identificador da faixa dentro da mensagem (`<img src="cid:…">`). */
export const MAIL_BANNER_CID = 'od-banner@ludraw';

export function mailLang(value: unknown): MailLang {
  return value === 'en' ? 'en' : 'pt-BR';
}

export type MailParams = SharedParams;

/** Uma frase do catálogo no idioma do e-mail (ex.: o nome do papel dentro do convite). */
export function mailText(lang: MailLang, key: string, params: MailParams = {}): string {
  return text(lang, key, params);
}

function text(lang: MailLang, key: string, params: MailParams): string {
  const local = key.replace(/^server\./, '');
  const raw = CATALOGS[lang][local] ?? CATALOGS['pt-BR'][local] ?? '';
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export const escapeHtml = escapeHtmlShared;

export interface RenderInput {
  kind: MailKind;
  lang: MailLang;
  /** nome da organização (aparece no assunto e no rodapé) */
  org: string;
  /** destino do botão; ausente = e-mail só informativo */
  url?: string;
  params?: MailParams;
}

export function renderMail(input: RenderInput): Omit<MailMessage, 'to'> {
  const composed = composeMail({ ...input, translate: (key, params) => text(input.lang, key, params), bannerSrc: `cid:${MAIL_BANNER_CID}` });
  const art = mailBannerArtFor(input.kind);
  return {
    ...composed,
    attachments: [{ filename: 'ludraw.png', cid: MAIL_BANNER_CID, contentType: 'image/png', content: Buffer.from(MAIL_BANNER_PNG[art], 'base64') }],
  };
}

/** Link para uma tela do app. Só a partir do endereço configurado (`LUDRAW_APP_URL`), nunca do pedido. */
export function appLink(appUrl: string, hashPath: string): string {
  return `${appUrl}/#/${hashPath.replace(/^\/+/, '')}`;
}
