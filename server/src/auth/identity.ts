/**
 * LuDraw server — quem é a pessoa e qual a sua participação na organização (Chat 07).
 * Conta (identidade) ≠ participação (papel/status na organização): WORKSPACE_ADMIN_SPEC §10.
 */
import { and, eq } from 'drizzle-orm';
import type { SessionUser } from '../../../src/utils/apiContract';
import type { Db } from '../db/client';
import { orgMemberships, users } from '../db/schema';
import { apiError, type HttpError } from '../lib/errors';

export type UserRow = typeof users.$inferSelect;
export type MembershipRow = typeof orgMemberships.$inferSelect;

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  return row ?? null;
}

export async function findMembership(db: Db, userId: string, organizationId: string): Promise<MembershipRow | null> {
  const [row] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.organizationId, organizationId)));
  return row ?? null;
}

/** Primeira participação da pessoa (single_org: a única). Prefere uma ativa. */
export async function primaryMembership(db: Db, userId: string): Promise<MembershipRow | null> {
  const rows = await db.select().from(orgMemberships).where(eq(orgMemberships.userId, userId));
  return rows.find((m) => m.status === 'active') ?? rows[0] ?? null;
}

/** Motivo para recusar a entrada (ou null se pode entrar). */
export function membershipBlock(user: UserRow, membership: MembershipRow | null, now = new Date()): HttpError | null {
  if (user.anonymizedAt || user.blockedAt) return apiError(403, 'accountRemoved');
  if (!membership || membership.status === 'removed' || membership.anonymizedAt) return apiError(403, 'accountRemoved');
  if (membership.status !== 'active') return apiError(403, 'accountSuspended');
  if (membership.guestExpiresAt && membership.guestExpiresAt.getTime() <= now.getTime()) return apiError(403, 'accountSuspended');
  return null;
}

export function sessionUser(user: UserRow, membership: MembershipRow): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarColor: user.avatarColor,
    organizationId: membership.organizationId,
    role: membership.role,
    status: membership.status,
    mustChangePassword: user.mustChangePassword,
    authProvider: user.authProvider,
    emailVerified: !!user.emailVerifiedAt,
  };
}
