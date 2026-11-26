/**
 * Chat 08.5 · B2 — layout dos e-mails (puro: sem DOM e sem Node).
 *
 * O MESMO código monta a mensagem no servidor (`server/src/mail/templates.ts`, faixa embutida por CID) e nas
 * prévias do `#/design-system` (faixa em SVG). Os textos chegam já traduzidos pela função `translate` de quem
 * chama (catálogos `server.mail.*`), e todo valor é escapado no HTML.
 *
 * Feito para cliente de e-mail: tabelas, estilos em linha, botão que funciona no Outlook, texto de prévia
 * escondido, `color-scheme` claro/escuro (com ajustes por `@media` onde o cliente aceita) e nenhum recurso
 * externo — a única imagem é a faixa, que vem junto da mensagem.
 */
import { MAIL_TEMPLATE_KEYS, type MailKind, type MailLang } from './apiContract';
import { MAIL_BANNER_SIZE } from './mailBanners';

export type MailParams = Record<string, string | number>;
export type MailTranslate = (key: string, params: MailParams) => string;

export interface ComposeMailInput {
  kind: MailKind;
  lang: MailLang;
  /** nome da organização (assunto, corpo e rodapé) */
  org: string;
  /** destino do botão; ausente = e-mail só informativo */
  url?: string;
  params?: MailParams;
  translate: MailTranslate;
  /** endereço da faixa: `cid:…` no servidor, `data:` nas prévias */
  bannerSrc: string;
}

export interface ComposedMail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Ajustes onde o cliente aceita `<style>` (Apple Mail, iOS, Gmail no app, Outlook.com…); o resto fica em linha. */
const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
  .od-bg{background:#0F1411!important}
  .od-card{background:#192019!important;border-color:#2A332B!important}
  .od-eyebrow{color:#A9D68E!important}
  .od-h{color:#EEF5E6!important}
  .od-t{color:#C8D2C3!important}
  .od-m{color:#97A492!important}
  .od-box{background:#202820!important;border-color:#303A30!important}
  .od-link{color:#B9DB9A!important}
  .od-btn{background:#D0E4AE!important}
  .od-btn a{color:#123A27!important}
  .od-word{color:#D0E4AE!important}
}
@media (max-width:620px){
  .od-pad{padding-left:22px!important;padding-right:22px!important}
  .od-h{font-size:23px!important;line-height:29px!important}
}`;

/** Monta assunto, texto puro e HTML de um tipo de e-mail. */
export function composeMail(input: ComposeMailInput): ComposedMail {
  const keys = MAIL_TEMPLATE_KEYS[input.kind] as { subject: string; eyebrow: string; heading: string; body: string; note: string; action?: string };
  const params: MailParams = { ...input.params, org: input.org };
  const t = (key: string) => input.translate(key, params);
  const subject = t(keys.subject);
  const eyebrow = t(keys.eyebrow);
  const heading = t(keys.heading);
  const body = t(keys.body);
  const note = t(keys.note);
  const footer = t(MAIL_TEMPLATE_KEYS.common.footer);
  const action = input.url && keys.action ? t(keys.action) : null;
  const linkHint = action ? t(MAIL_TEMPLATE_KEYS.common.linkHint) : null;

  const text = [heading, body, ...(action && input.url ? [`${action}:\n${input.url}`] : []), note, `—\n${footer}`].join('\n\n');

  const e = escapeHtml;
  const button =
    action && input.url
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>` +
        `<td class="od-btn" bgcolor="#194B32" style="background:#194B32;border-radius:12px">` +
        `<a href="${e(input.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:#F3F8E9;text-decoration:none;border-radius:12px">${e(action)}&nbsp;&rarr;</a>` +
        `</td></tr></table>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>` +
        `<td class="od-box od-m" style="background:#F4F8EE;border:1px solid #E1EAD5;border-radius:12px;padding:12px 14px;font-family:${FONT};font-size:12.5px;line-height:18px;color:#5B6B5F">` +
        `${e(linkHint ?? '')}<br><a class="od-link" href="${e(input.url)}" target="_blank" style="color:#1F6B44;word-break:break-all;text-decoration:underline">${e(input.url)}</a>` +
        `</td></tr></table>`
      : '';
  // texto de prévia (a linha cinza ao lado do assunto na caixa de entrada) + respiro para o cliente não puxar o resto
  const preheader = `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${e(body)}${'&#8202;&zwnj;'.repeat(40)}</div>`;
  const { width, height } = MAIL_BANNER_SIZE;

  const html =
    `<!doctype html><html lang="${e(input.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(subject)}</title><style>${STYLE}</style></head>` +
    `<body class="od-bg" style="margin:0;padding:0;background:#EDF1E8;-webkit-text-size-adjust:100%">${preheader}` +
    `<table role="presentation" class="od-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDF1E8"><tr><td align="center" style="padding:32px 12px 36px">` +
    // cartão
    `<table role="presentation" class="od-card" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px;background:#FFFFFF;border:1px solid #DDE5D3;border-radius:20px;border-collapse:separate">` +
    `<tr><td style="padding:0;background:#194B32;border-radius:19px 19px 0 0;line-height:0;font-size:0">` +
    `<img src="${e(input.bannerSrc)}" width="${width}" height="${height}" alt="LuDraw" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:19px 19px 0 0;color:#D0E4AE;font-family:${FONT};font-size:18px;font-weight:800;line-height:${height}px;text-align:center">` +
    `</td></tr>` +
    `<tr><td class="od-pad" style="padding:34px 40px 8px;font-family:${FONT}">` +
    `<div class="od-eyebrow" style="margin:0 0 10px;font-size:12px;line-height:16px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:#3B7A57">${e(eyebrow)}</div>` +
    `<h1 class="od-h" style="margin:0 0 12px;font-size:26px;line-height:32px;font-weight:800;letter-spacing:-0.3px;color:#102A1C">${e(heading)}</h1>` +
    `<p class="od-t" style="margin:0 0 26px;font-size:16px;line-height:25px;color:#3A4A3F">${e(body)}</p>` +
    button +
    `</td></tr>` +
    `<tr><td class="od-pad" style="padding:22px 40px 34px;font-family:${FONT}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td class="od-m" style="border-left:3px solid #D0E4AE;padding:2px 0 2px 14px;font-size:13.5px;line-height:21px;color:#5F6E63">${e(note)}</td>` +
    `</tr></table></td></tr>` +
    `</table>` +
    // rodapé fora do cartão
    `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px"><tr>` +
    `<td align="center" class="od-m" style="padding:22px 24px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#7D8A7A">` +
    `<div class="od-word" style="margin:0 0 6px;font-size:15px;line-height:18px;font-weight:800;letter-spacing:-0.4px;color:#194B32">Lu<span style="color:#5E8E3E">Draw</span></div>` +
    `${e(footer)}</td></tr></table>` +
    `</td></tr></table></body></html>`;

  return { subject, text, html };
}
