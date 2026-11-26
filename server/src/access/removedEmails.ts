/**
 * Chat 08.5 · C — marcas de e-mails de pessoas REMOVIDAS da organização.
 *
 * Remover anonimiza a conta (o e-mail sai do banco). Sem marca, quem ainda tivesse a caixa da empresa ativa
 * voltaria sozinho pelo cadastro com o e-mail da organização. A marca guarda só o HMAC do e-mail normalizado
 * (chave `keys.removedEmailKey`, propósito 'removed-email'); o cadastro pelo domínio recusa em silêncio, e
 * aceitar um convite (decisão de um admin) apaga a marca.
 */
import { and, eq } from 'drizzle-orm';
import type { WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import type { Db } from '../db/client';
import { removedEmailMarks } from '../db/schema';
import { hmacHex } from '../lib/crypto';

export function removedEmailHmac(key: Uint8Array, email: string): string {
  return hmacHex(key, email.trim().toLowerCase());
}

/** Depois de uma operação: quem passou a "removido" ganha a marca (o e-mail vem do estado de ANTES). */
export async function markRemovedEmails(tx: Db, organizationId: string, key: Uint8Array, before: WorkspaceRulesState, after: WorkspaceRulesState): Promise<void> {
  const was = new Map(before.directory.map((a) => [a.id, a]));
  for (const acc of after.directory) {
    const prev = was.get(acc.id);
    if (acc.status !== 'removed' || !prev || prev.status === 'removed' || !prev.email) continue;
    await tx.insert(removedEmailMarks).values({ organizationId, emailHmac: removedEmailHmac(key, prev.email) }).onConflictDoNothing();
  }
}

export async function isRemovedEmail(db: Db, organizationId: string, key: Uint8Array, email: string): Promise<boolean> {
  const [row] = await db
    .select({ h: removedEmailMarks.emailHmac })
    .from(removedEmailMarks)
    .where(and(eq(removedEmailMarks.organizationId, organizationId), eq(removedEmailMarks.emailHmac, removedEmailHmac(key, email))));
  return !!row;
}

/** Convite aceito para este e-mail: a administração trouxe a pessoa de volta. */
export async function clearRemovedEmail(db: Db, organizationId: string, key: Uint8Array, email: string): Promise<void> {
  await db.delete(removedEmailMarks).where(and(eq(removedEmailMarks.organizationId, organizationId), eq(removedEmailMarks.emailHmac, removedEmailHmac(key, email))));
}
