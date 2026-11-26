/**
 * LuDraw server — primeiro acesso (WORKSPACE_ADMIN_SPEC §5, Chat 07).
 *
 * `provisionInstallation` é o ÚNICO caminho que cria a organização inicial + o administrador. Roda numa
 * transação com a linha de `server_setup` travada (`FOR UPDATE`) e só com o banco vazio; é usado pelo
 * assistente `#/setup` e pelo bootstrap por variáveis. Depois de concluído, nada aqui volta a rodar.
 */
import { count, eq } from 'drizzle-orm';
import type { InstallMode } from '../../../src/types/workspace';
import { AUDIT_PARAM_KEYS, SERVER_AUDIT_MESSAGES } from '../../../src/utils/apiContract';
import { colorFromString } from '../../../src/utils/color';
import { createId } from '../../../src/utils/id';
import { DEFAULT_WORKSPACE_POLICIES } from '../../../src/utils/permissions';
import { emailDomain, isValidEmail, normalizeDomain, slugify } from '../../../src/utils/workspace';
import type { Db } from '../db/client';
import { organizations, orgMemberships, serverSetup, users } from '../db/schema';
import { recordAudit } from '../lib/audit';
import { apiError, descriptorError } from '../lib/errors';
import { sha256Hex, safeEqual } from '../lib/crypto';
import { checkPasswordStrength } from '../../../src/utils/passwordPolicy';

/** O assistente aceita o token com ou sem os hífens/espaços de exibição e em qualquer caixa. */
export function normalizeSetupToken(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}

export type SetupRow = typeof serverSetup.$inferSelect;

export async function readSetup(db: Db): Promise<SetupRow> {
  await db.insert(serverSetup).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(serverSetup).where(eq(serverSetup.id, 1));
  if (!row) throw new Error('server_setup row missing');
  return row;
}

export async function isDatabaseEmpty(db: Db): Promise<boolean> {
  const [o] = await db.select({ n: count() }).from(organizations);
  const [u] = await db.select({ n: count() }).from(users);
  return (o?.n ?? 0) === 0 && (u?.n ?? 0) === 0;
}

/**
 * Cache do "setup concluído" (só muda de false para true). As rotas de setup consultam isto a cada
 * requisição e respondem 404 assim que vira true.
 */
export class SetupGate {
  private completed = false;

  async refresh(db: Db): Promise<boolean> {
    if (this.completed) return true;
    const row = await readSetup(db);
    this.completed = !!row.completedAt;
    return this.completed;
  }

  isCompleted(): boolean {
    return this.completed;
  }

  markCompleted(): void {
    this.completed = true;
  }
}

export interface ProvisionInput {
  organizationName: string;
  allowedEmailDomains: string[];
  mode: InstallMode;
  admin: { name: string; email: string; passwordHash: string; mustChangePassword: boolean };
  source: 'wizard' | 'env';
  ip?: string | null;
  /** assistente: confere o token dentro da mesma transação */
  token?: string;
}

export interface ProvisionResult {
  organizationId: string;
  userId: string;
}

/** Validação dos dados do primeiro acesso (mesmas regras no assistente e no bootstrap). */
export function validateProvisionData(input: { organizationName: string; allowedEmailDomains: string[]; adminName: string; adminEmail: string; adminPassword: string }): {
  organizationName: string;
  domains: string[];
  adminName: string;
  adminEmail: string;
} {
  const organizationName = input.organizationName.trim();
  if (organizationName.length < 2 || organizationName.length > 120) throw apiError(400, 'orgNameRequired');
  const domains: string[] = [];
  for (const raw of input.allowedEmailDomains) {
    const d = normalizeDomain(raw);
    if (!d) throw apiError(400, 'invalidDomain', { domain: raw.slice(0, 80) });
    if (!domains.includes(d)) domains.push(d);
  }
  const adminName = input.adminName.trim();
  if (adminName.length < 2 || adminName.length > 120) throw apiError(400, 'nameRequired');
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (!isValidEmail(adminEmail) || adminEmail.length > 320) throw apiError(400, 'invalidEmail');
  if (domains.length) {
    const d = emailDomain(adminEmail);
    if (!domains.some((allowed) => d === allowed || d.endsWith(`.${allowed}`))) throw apiError(400, 'emailOutsideDomain', { domains: domains.join(', ') });
  }
  const weak = checkPasswordStrength(input.adminPassword, { email: adminEmail, name: adminName });
  if (weak) throw descriptorError(400, 'weakPassword', weak);
  return { organizationName, domains, adminName, adminEmail };
}

export async function provisionInstallation(db: Db, input: ProvisionInput, now = new Date()): Promise<ProvisionResult> {
  return db.transaction(async (tx) => {
    await tx.insert(serverSetup).values({ id: 1 }).onConflictDoNothing();
    const [setup] = await tx.select().from(serverSetup).where(eq(serverSetup.id, 1)).for('update');
    if (!setup || setup.completedAt) throw apiError(404, 'notFound');
    if (input.token !== undefined) {
      if (!setup.setupTokenHash || !safeEqual(sha256Hex(normalizeSetupToken(input.token)), setup.setupTokenHash)) throw apiError(403, 'setupInvalidToken');
    }
    if (!(await isDatabaseEmpty(tx as unknown as Db))) throw apiError(409, 'setupNotEmpty');

    const organizationId = createId(16);
    const userId = createId(16);
    const name = input.organizationName;
    await tx.insert(users).values({
      id: userId,
      email: input.admin.email,
      name: input.admin.name,
      avatarColor: colorFromString(input.admin.name || input.admin.email),
      passwordHash: input.admin.passwordHash,
      authProvider: 'local',
      mustChangePassword: input.admin.mustChangePassword,
      createdVia: input.source,
      createdAt: now,
    });
    await tx.insert(organizations).values({
      id: organizationId,
      name,
      slug: slugify(name) || 'org',
      allowedEmailDomains: input.allowedEmailDomains,
      requireDomainForMembers: input.allowedEmailDomains.length > 0,
      // servidor: extensões programáveis desligadas por padrão (EXTENSIONS_SPEC — só pacotes declarativos)
      policies: { ...DEFAULT_WORKSPACE_POLICIES, allowExtensions: 'packs_only', extensionAllowlist: [] },
      ownerId: userId,
      createdAt: now,
    });
    await tx.insert(orgMemberships).values({ organizationId, userId, role: 'admin', status: 'active', createdAt: now });
    await tx
      .update(serverSetup)
      .set({ completedAt: now, organizationId, mode: input.mode, bootstrapSource: input.source, setupTokenHash: null })
      .where(eq(serverSetup.id, 1));
    await recordAudit(tx as unknown as Db, {
      organizationId,
      actorId: userId,
      action: 'setup_completed',
      message: {
        key: SERVER_AUDIT_MESSAGES.setupCompleted,
        params: { name, source: { key: input.source === 'env' ? AUDIT_PARAM_KEYS.sourceEnv : AUDIT_PARAM_KEYS.sourceWizard } },
      },
      targetType: 'workspace',
      targetId: organizationId,
      targetName: name,
      ip: input.ip ?? null,
      origin: input.source === 'env' ? 'env' : 'web',
      at: now,
    });
    return { organizationId, userId };
  });
}
