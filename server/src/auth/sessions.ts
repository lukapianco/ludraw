/**
 * LuDraw server — sessões e refresh tokens (Chat 07).
 *
 * - Cada login cria uma sessão (30 dias no máximo; 14 dias parada = vencida).
 * - O refresh token é opaco (32 bytes), vai num cookie httpOnly e é guardado só em hash.
 * - A cada renovação o token é trocado (rotação). Reapresentar o token ANTIGO:
 *     · dentro da janela de tolerância (20 s) → devolve o MESMO sucessor já emitido (várias abas
 *       renovando ao mesmo tempo não derrubam a sessão e o cookie converge para um valor só);
 *     · depois da janela → reuso (token vazado?) → a sessão inteira é revogada.
 */
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { createId } from '../../../src/utils/id';
import type { AppContext } from '../context';
import type { Db } from '../db/client';
import { refreshTokens, sessions } from '../db/schema';
import { randomUrlToken, sha256Hex, type Sealer } from '../lib/crypto';

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
export const REFRESH_GRACE_MS = 20_000;

export interface NewSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function createSession(
  db: Db,
  input: { userId: string; organizationId: string; ip?: string | null; userAgent?: string | null },
  now = new Date(),
): Promise<NewSession> {
  const sessionId = createId(20);
  const refreshToken = randomUrlToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      userId: input.userId,
      organizationId: input.organizationId,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    });
    await tx.insert(refreshTokens).values({ hash: sha256Hex(refreshToken), sessionId, issuedAt: now });
  });
  return { sessionId, refreshToken, expiresAt };
}

export type RefreshOutcome =
  | { ok: true; sessionId: string; userId: string; organizationId: string; refreshToken: string; expiresAt: Date; rotated: boolean }
  | { ok: false; reason: 'unknown' | 'expired' | 'revoked' | 'reuse' };

/** Sessão utilizável agora? */
export function sessionAlive(s: { revokedAt: Date | null; expiresAt: Date; lastUsedAt: Date }, now: Date): 'ok' | 'revoked' | 'expired' {
  if (s.revokedAt) return 'revoked';
  if (s.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (now.getTime() - s.lastUsedAt.getTime() > SESSION_IDLE_MS) return 'expired';
  return 'ok';
}

class LostRace extends Error {}

export async function rotateRefreshToken(db: Db, sealer: Sealer, presented: string, now = new Date()): Promise<RefreshOutcome> {
  const hash = sha256Hex(presented);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.hash, hash));
  if (!row) return { ok: false, reason: 'unknown' };
  const [session] = await db.select().from(sessions).where(eq(sessions.id, row.sessionId));
  if (!session) return { ok: false, reason: 'unknown' };
  const alive = sessionAlive(session, now);
  if (alive !== 'ok') return { ok: false, reason: alive };

  if (!row.replacedAt) {
    // Token atual → rotação atômica (só uma requisição concorrente vence; as outras caem na janela)
    const next = randomUrlToken();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(refreshTokens).values({ hash: sha256Hex(next), sessionId: session.id, issuedAt: now });
        const updated = await tx
          .update(refreshTokens)
          .set({ replacedAt: now, successorEnc: sealer.seal(next) })
          .where(and(eq(refreshTokens.hash, hash), isNull(refreshTokens.replacedAt)))
          .returning({ hash: refreshTokens.hash });
        if (!updated.length) throw new LostRace();
        await tx.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, session.id));
      });
      return { ok: true, sessionId: session.id, userId: session.userId, organizationId: session.organizationId, refreshToken: next, expiresAt: session.expiresAt, rotated: true };
    } catch (err) {
      if (!(err instanceof LostRace)) throw err;
      // outra aba renovou primeiro: segue pelo caminho da janela de tolerância
    }
  }
  return followGrace(db, sealer, hash, session, now);
}

async function followGrace(
  db: Db,
  sealer: Sealer,
  hash: string,
  session: typeof sessions.$inferSelect,
  now: Date,
): Promise<RefreshOutcome> {
  let currentHash = hash;
  // segue a cadeia de sucessores (no máximo alguns saltos, todos dentro da janela)
  for (let hop = 0; hop < 4; hop++) {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.hash, currentHash));
    if (!row) return { ok: false, reason: 'unknown' };
    if (!row.replacedAt) {
      // chegamos ao token vigente, mas só temos o texto dele pelo sucessor cifrado do anterior
      return { ok: false, reason: 'unknown' };
    }
    const withinGrace = now.getTime() - row.replacedAt.getTime() <= REFRESH_GRACE_MS;
    const successor = withinGrace && row.successorEnc ? sealer.open(row.successorEnc) : null;
    if (!successor) {
      await revokeSession(db, session.id, 'refresh_reuse', now);
      return { ok: false, reason: 'reuse' };
    }
    const successorHash = sha256Hex(successor);
    const [next] = await db.select().from(refreshTokens).where(eq(refreshTokens.hash, successorHash));
    if (!next) return { ok: false, reason: 'unknown' };
    if (!next.replacedAt) {
      await db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, session.id));
      return { ok: true, sessionId: session.id, userId: session.userId, organizationId: session.organizationId, refreshToken: successor, expiresAt: session.expiresAt, rotated: false };
    }
    currentHash = successorHash;
  }
  await revokeSession(db, session.id, 'refresh_reuse', now);
  return { ok: false, reason: 'reuse' };
}

export async function revokeSession(db: Db, sessionId: string, reason: string, now = new Date()): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Derruba todas as sessões abertas de uma pessoa (opcionalmente menos a atual). Devolve quantas caíram. */
export async function revokeUserSessions(db: Db, userId: string, reason: string, opts: { exceptSessionId?: string; organizationId?: string } = {}, now = new Date()): Promise<number> {
  const conds = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (opts.organizationId) conds.push(eq(sessions.organizationId, opts.organizationId));
  if (opts.exceptSessionId) conds.push(sql`${sessions.id} <> ${opts.exceptSessionId}`);
  const rows = await db
    .update(sessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(...conds))
    .returning({ id: sessions.id });
  return rows.length;
}

/**
 * Chat 08.5: encerra as sessões de uma pessoa E confere de novo, na hora, as conexões de tempo real dela
 * (sem isto o ao vivo só cairia na conferência periódica). Usado por sair de todos, troca e redefinição de senha.
 */
export async function endUserSessions(ctx: AppContext, userId: string, reason: string, opts: { exceptSessionId?: string; organizationId?: string } = {}): Promise<number> {
  const count = await revokeUserSessions(ctx.db, userId, reason, opts);
  await ctx.collab?.recheckWhere((c) => c.principal.kind === 'member' && c.principal.userId === userId).catch(() => undefined);
  return count;
}

/** Manutenção: apaga sucessores cifrados vencidos e sessões encerradas há mais de 30 dias. */
export async function pruneSessions(db: Db, now = new Date()): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ successorEnc: null })
    .where(and(lt(refreshTokens.replacedAt, new Date(now.getTime() - REFRESH_GRACE_MS)), sql`${refreshTokens.successorEnc} is not null`));
  const cutoff = new Date(now.getTime() - SESSION_MAX_AGE_MS);
  await db.delete(sessions).where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff)));
}
