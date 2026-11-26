/**
 * LuDraw server — comandos de recuperação (WORKSPACE_ADMIN_SPEC §6, Chat 07).
 * Lógica pura sobre o banco (testável); `src/cli.ts` cuida de argumentos, senha oculta e saída.
 * Tudo fica no Audit Log com origem `cli`. Mensagens em inglês técnico (I18N_SPEC §4.10).
 */
import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { AUDIT_PARAM_KEYS, SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import { colorFromString } from '../../../src/utils/color';
import { createId } from '../../../src/utils/id';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';
import { emailDomain, isValidEmail } from '../../../src/utils/workspace';
import { findUserByEmail } from '../auth/identity';
import { hashPassword } from '../auth/passwords';
import { revokeUserSessions } from '../auth/sessions';
import type { Db } from '../db/client';
import { organizations, orgMemberships, users } from '../db/schema';
import { recordAudit, SYSTEM_ACTOR } from '../lib/audit';
import { issueSetupToken } from '../setup/boot';
import { readSetup } from '../setup/provision';

export class CliError extends Error {}

/** Senha temporária forte (20 caracteres, os 4 tipos). */
export function generatePassword(): string {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#%*+=?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 20) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function assertStrong(password: string, email: string, name?: string): void {
  const weak = checkPasswordStrength(password, { email, name });
  if (weak) {
    const hints: Record<string, string> = {
      'server.password.tooShort': 'at least 10 characters',
      'server.password.tooLong': 'at most 256 characters',
      'server.password.needsVariety': 'mix 3 of: lowercase, uppercase, digits, symbols (or 16+ characters)',
      'server.password.containsPersonal': 'must not contain the name or the email',
    };
    throw new CliError(`Password rejected: ${hints[weak.key] ?? weak.key}.`);
  }
}

async function installationOrg(db: Db): Promise<{ id: string; name: string; allowedEmailDomains: string[]; requireDomainForMembers: boolean }> {
  const setup = await readSetup(db);
  if (!setup.completedAt || !setup.organizationId) {
    throw new CliError('The server is not configured yet. Finish the first-run setup (#/setup) or use the LUDRAW_ORG_NAME/LUDRAW_ADMIN_* variables.');
  }
  const [org] = await db.select().from(organizations).where(eq(organizations.id, setup.organizationId));
  if (!org) throw new CliError('The configured organization was not found in the database.');
  return org;
}

export interface CreateAdminInput {
  email: string;
  name?: string;
  password: string;
  promote?: boolean;
}

export async function createAdmin(db: Db, input: CreateAdminInput): Promise<{ userId: string; promoted: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new CliError('Invalid email address.');
  const org = await installationOrg(db);
  const existing = await findUserByEmail(db, email);
  const now = new Date();

  if (existing) {
    if (!input.promote) throw new CliError(`An account with ${email} already exists. Use --promote to make it an administrator, or admin:reset-password to recover it.`);
    if (existing.anonymizedAt) throw new CliError('That account was removed and anonymized; it cannot be promoted.');
    await db.transaction(async (tx) => {
      const [m] = await tx
        .select()
        .from(orgMemberships)
        .where(and(eq(orgMemberships.userId, existing.id), eq(orgMemberships.organizationId, org.id)));
      if (m) {
        await tx
          .update(orgMemberships)
          .set({ role: 'admin', status: 'active', suspendedAt: null, suspendedReason: null, guestExpiresAt: null })
          .where(and(eq(orgMemberships.userId, existing.id), eq(orgMemberships.organizationId, org.id)));
      } else {
        await tx.insert(orgMemberships).values({ organizationId: org.id, userId: existing.id, role: 'admin', status: 'active', createdAt: now });
      }
      await recordAudit(tx as unknown as Db, {
        organizationId: org.id,
        actorId: SYSTEM_ACTOR,
        action: 'role_changed',
        message: { key: SERVER_AUDIT_MESSAGES.adminPromotedViaCli },
        targetType: 'user',
        targetId: existing.id,
        changes: [{ field: 'role', before: m?.role ?? null, after: 'admin' }],
        origin: 'cli',
      });
    });
    return { userId: existing.id, promoted: true };
  }

  const name = (input.name ?? email.split('@')[0]).trim();
  if (name.length < 2) throw new CliError('The name must have at least 2 characters (use --name).');
  if (org.requireDomainForMembers && org.allowedEmailDomains.length) {
    const d = emailDomain(email);
    if (!org.allowedEmailDomains.some((a) => d === a || d.endsWith(`.${a}`))) {
      throw new CliError(`The organization only accepts these email domains: ${org.allowedEmailDomains.join(', ')}.`);
    }
  }
  assertStrong(input.password, email, name);
  const userId = createId(16);
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email,
      name,
      avatarColor: colorFromString(name),
      passwordHash,
      authProvider: 'local',
      mustChangePassword: true,
      createdVia: 'cli',
      createdAt: now,
    });
    await tx.insert(orgMemberships).values({ organizationId: org.id, userId, role: 'admin', status: 'active', createdAt: now });
    await recordAudit(tx as unknown as Db, {
      organizationId: org.id,
      actorId: SYSTEM_ACTOR,
      action: 'admin_created_via_cli',
      message: { key: SERVER_AUDIT_MESSAGES.adminCreatedViaCli },
      targetType: 'user',
      targetId: userId,
      origin: 'cli',
    });
  });
  return { userId, promoted: false };
}

export async function resetPassword(db: Db, input: { email: string; password: string }): Promise<{ userId: string; sessionsEnded: number }> {
  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(db, email);
  if (!user || user.anonymizedAt) throw new CliError(`No account found for ${email}.`);
  assertStrong(input.password, email, user.name);
  const org = await installationOrg(db);
  const passwordHash = await hashPassword(input.password);
  await db.update(users).set({ passwordHash, mustChangePassword: true }).where(eq(users.id, user.id));
  const count = await revokeUserSessions(db, user.id, 'password_reset_cli');
  await recordAudit(db, {
    organizationId: org.id,
    actorId: SYSTEM_ACTOR,
    action: 'password_reset_via_cli',
    message: { key: SERVER_AUDIT_MESSAGES.passwordResetViaCli },
    targetType: 'user',
    targetId: user.id,
    origin: 'cli',
  });
  await recordAudit(db, {
    organizationId: org.id,
    actorId: SYSTEM_ACTOR,
    action: 'sessions_revoked',
    message: { key: SERVER_AUDIT_MESSAGES.sessionsRevoked, params: { count, reason: { key: AUDIT_PARAM_KEYS.reasonPasswordReset } } },
    targetType: 'user',
    targetId: user.id,
    count,
    origin: 'cli',
  });
  return { userId: user.id, sessionsEnded: count };
}

/** Novo token de primeiro acesso (o anterior deixa de valer). Só com o setup pendente. */
export async function newSetupToken(db: Db): Promise<string> {
  const setup = await readSetup(db);
  if (setup.completedAt) throw new CliError('The server is already configured; there is no setup token to issue.');
  const token = await issueSetupToken(db, null);
  await recordAudit(db, {
    organizationId: null,
    actorId: SYSTEM_ACTOR,
    action: 'setup_token_issued',
    message: { key: SERVER_AUDIT_MESSAGES.setupTokenIssued },
    targetType: 'workspace',
    origin: 'cli',
  });
  return token;
}
