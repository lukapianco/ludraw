/**
 * LuDraw server — convite por e-mail (Chat 08.5 · B). Usado ao criar o convite (Admin, Compartilhar do board),
 * ao aprovar um pedido de acesso e no "Reenviar e-mail". Os limites de envio são os mesmos de todo e-mail:
 * por pessoa que envia (`mailUser`) e por destinatário (`mailAddress`, chave `invite|<e-mail>`).
 */
import { eq } from 'drizzle-orm';
import type { MailLang } from '../../../src/utils/apiContract';
import { SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import type { AppContext } from '../context';
import { invitations, organizations, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { tooManyAttempts } from '../lib/errors';
import { appLink, mailText, renderMail } from '../mail/templates';

const DAY_MS = 24 * 60 * 60 * 1000;

export const inviteMailKey = (email: string) => `invite|${email.trim().toLowerCase()}`;

/** Confere (sem contar) se ainda dá para enviar; recusa ANTES de criar algo que depois não sairia. */
export async function assertInviteMailAllowed(ctx: AppContext, senderId: string, email: string): Promise<void> {
  for (const r of await Promise.all([ctx.limiters.mailUser.check(senderId), ctx.limiters.mailAddress.check(inviteMailKey(email))])) {
    if (!r.allowed) throw tooManyAttempts(r.retryAfterMs / 1000);
  }
}

export interface InvitationMailInput {
  organizationId: string;
  invitationId: string;
  /** token em claro (só existe na criação; no reenvio vem do valor cifrado do convite) */
  token: string;
  lang: MailLang;
  actorId: string;
  ip: string;
  resend?: boolean;
}

/** Envia o convite, marca `emailed_at` e registra no Audit Log. Falha do SMTP = exceção (quem chama decide). */
export async function sendInvitationEmail(ctx: AppContext, input: InvitationMailInput): Promise<void> {
  const mailer = ctx.mailer;
  const appUrl = ctx.config.appUrl;
  if (!mailer?.enabled || !appUrl) throw new Error('mail is not configured');
  const [inv] = await ctx.db.select().from(invitations).where(eq(invitations.id, input.invitationId));
  if (!inv) throw new Error('invitation not found');
  const [org] = await ctx.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, input.organizationId));
  const [inviter] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, inv.invitedBy));
  await ctx.limiters.mailUser.hit(input.actorId);
  await ctx.limiters.mailAddress.hit(inviteMailKey(inv.email));
  const days = Math.max(1, Math.ceil((inv.expiresAt.getTime() - Date.now()) / DAY_MS));
  await mailer.send({
    to: inv.email,
    ...renderMail({
      kind: 'invitation',
      lang: input.lang,
      org: org?.name ?? 'LuDraw',
      url: appLink(appUrl, `invite/${encodeURIComponent(input.token)}`),
      params: { inviter: inviter?.name ?? '', role: mailText(input.lang, `server.mail.roles.${inv.role}`), days },
    }),
  });
  await ctx.db.update(invitations).set({ emailedAt: new Date() }).where(eq(invitations.id, inv.id));
  await recordAudit(ctx.db, {
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'invitation_emailed',
    message: { key: input.resend ? SERVER_AUDIT_MESSAGES.invitationResent : SERVER_AUDIT_MESSAGES.invitationEmailed },
    targetType: 'invitation',
    targetId: inv.id,
    ip: input.ip,
  });
}
