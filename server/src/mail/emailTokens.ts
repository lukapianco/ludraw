/**
 * LuDraw server — tokens de uso único enviados por e-mail (Chat 08.5).
 *
 * O token em claro só existe na memória (para montar o link) e na mensagem enviada. No banco fica o
 * SHA-256. Pedir outro token invalida os anteriores do mesmo propósito; consumir trava a linha, então
 * dois pedidos simultâneos com o mesmo token nunca valem duas vezes.
 */
import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { createId } from '../../../src/utils/id';
import type { Db } from '../db/client';
import { emailTokens, type EmailTokenPurpose } from '../db/schema';
import { randomUrlToken, sha256Hex } from '../lib/crypto';

export type EmailTokenRow = typeof emailTokens.$inferSelect;

const MINUTE_MS = 60_000;
/** Formato dos tokens que este servidor emite (`randomUrlToken(32)` = 43 caracteres base64url). */
export const EMAIL_TOKEN_PATTERN = '^[A-Za-z0-9_-]{20,128}$';
const TOKEN_RE = new RegExp(EMAIL_TOKEN_PATTERN);

export interface IssueInput {
  purpose: EmailTokenPurpose;
  organizationId: string;
  email: string;
  userId?: string | null;
  payload?: Record<string, unknown> | null;
  ttlMinutes: number;
}

/** Cria o token (invalida os pendentes do mesmo propósito para a mesma pessoa/e-mail) e devolve o valor em claro. */
export async function issueEmailToken(db: Db, input: IssueInput, now = new Date()): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const same = input.userId ? or(eq(emailTokens.userId, input.userId), eq(emailTokens.email, email)) : eq(emailTokens.email, email);
  await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(and(eq(emailTokens.purpose, input.purpose), eq(emailTokens.organizationId, input.organizationId), isNull(emailTokens.usedAt), same));
  const token = randomUrlToken(32);
  await db.insert(emailTokens).values({
    id: createId(16),
    purpose: input.purpose,
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    email,
    tokenHash: sha256Hex(token),
    payload: input.payload ?? null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + input.ttlMinutes * MINUTE_MS),
  });
  return token;
}

function usable(row: EmailTokenRow | undefined, purpose: EmailTokenPurpose, now: Date): row is EmailTokenRow {
  return !!row && row.purpose === purpose && !row.usedAt && row.expiresAt.getTime() > now.getTime();
}

/** Só confere (tela "o link ainda vale?"); não consome. */
export async function peekEmailToken(db: Db, token: string, purpose: EmailTokenPurpose, now = new Date()): Promise<EmailTokenRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db.select().from(emailTokens).where(eq(emailTokens.tokenHash, sha256Hex(token)));
  return usable(row, purpose, now) ? row : null;
}

/** Consome o token DENTRO de uma transação (linha travada). `null` = inexistente, vencido, usado ou de outro propósito. */
export async function consumeEmailToken(tx: Db, token: string, purpose: EmailTokenPurpose, now = new Date()): Promise<EmailTokenRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await tx.select().from(emailTokens).where(eq(emailTokens.tokenHash, sha256Hex(token))).for('update');
  if (!usable(row, purpose, now)) return null;
  await tx.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, row.id));
  return row;
}

/** Manutenção: apaga tokens vencidos ou usados há mais de um dia. */
export async function pruneEmailTokens(db: Db, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * MINUTE_MS);
  await db.delete(emailTokens).where(or(lt(emailTokens.expiresAt, cutoff), and(isNotNull(emailTokens.usedAt), lt(emailTokens.usedAt, cutoff))));
}
