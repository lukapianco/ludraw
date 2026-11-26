/**
 * LuDraw server — ponte entre o banco e as regras compartilhadas (`src/utils/workspaceRules.ts`, Chat 07).
 *
 * 1. `loadRulesState` lê a organização inteira no MESMO formato do cliente (UserAccount, TeamEntity,
 *    BoardMeta…). O papel/status de cada conta vem de `org_memberships` (conta ≠ participação).
 * 2. As regras decidem (mesmo código do modo local).
 * 3. `persistDiff` grava só o que mudou (comparação por referência — as regras não recriam o que não muda).
 * O conteúdo dos boards (`data`) nunca passa por aqui.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AccessRequest, BoardMember, BoardMeta, BoardTemplateId, Invitation, InviteLink, ProjectFolder, PublicShareLink, TeamEntity, UserAccount, WorkspaceEntity } from '../../../src/types/workspace';
import { DEFAULT_WORKSPACE_POLICIES } from '../../../src/utils/permissions';
import type { WorkspaceRulesState } from '../../../src/utils/workspaceRules';
import type { Db } from '../db/client';
import { accessRequests, boardMembers, boards, invitations, inviteLinks, organizations, orgMemberships, projectGuests, projects, publicLinks, teamMembers, teams, users } from '../db/schema';
import { Sealer, sha256Hex } from '../lib/crypto';

export const ms = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);
export const dt = (n: number | null | undefined): Date | null => (n === null || n === undefined ? null : new Date(n));

/** Colunas do board sem o conteúdo (o JSON pode ser grande). */
export const boardMetaColumns = {
  id: boards.id,
  organizationId: boards.organizationId,
  name: boards.name,
  ownerId: boards.ownerId,
  teamId: boards.teamId,
  projectId: boards.projectId,
  isPersonalSpace: boards.isPersonalSpace,
  color: boards.color,
  template: boards.template,
  thumbnail: boards.thumbnail,
  legacyTeam: boards.legacyTeam,
  legacySpace: boards.legacySpace,
  createdAt: boards.createdAt,
  updatedAt: boards.updatedAt,
  deletedAt: boards.deletedAt,
  deletedBy: boards.deletedBy,
  revision: boards.revision,
  importedFrom: boards.importedFrom,
};

export type BoardMetaRow = { [K in keyof typeof boardMetaColumns]: (typeof boards.$inferSelect)[K] };
type LinkRow = typeof publicLinks.$inferSelect;
type MemberRow = typeof boardMembers.$inferSelect;

/** Chaves que a leitura/gravação do workspace usa (convites e, Chat 08.7 · R5, cópia do link público). */
export type StateKeys = Sealer | { inviteSealer: Sealer; linkSealer?: Sealer | null };
const inviteSealerOf = (k: StateKeys): Sealer => (k instanceof Sealer ? k : k.inviteSealer);
const linkSealerOf = (k: StateKeys): Sealer | null => (k instanceof Sealer ? null : (k.linkSealer ?? null));

/**
 * Chat 08.7 · R5 (S-17): o token vem da cópia cifrada (chave do ambiente) ou, até o passo do boot, do texto legado.
 * Sem nenhum dos dois (chave no banco) fica '' — o endereço só aparece na criação; `tokenPrint` identifica o link.
 */
export function linkFromRow(l: LinkRow, linkSealer: Sealer | null = null): PublicShareLink {
  const token = (l.tokenEnc && linkSealer ? linkSealer.open(l.tokenEnc) : null) ?? l.token ?? '';
  const link: PublicShareLink = {
    enabled: l.enabled,
    token,
    tokenPrint: l.tokenHash.slice(0, 12),
    accessLevel: l.accessLevel,
    passwordHash: l.passwordHash,
    expiresAt: ms(l.expiresAt),
    createdBy: l.createdBy,
    createdAt: ms(l.createdAt) ?? undefined,
    revokedAt: ms(l.revokedAt),
    lastUsedAt: ms(l.lastUsedAt),
  };
  if (l.allowDownload !== null) link.allowDownload = l.allowDownload;
  return link;
}

export function boardMetaFromRow(b: BoardMetaRow, members: MemberRow[], link: LinkRow | undefined, ownerName: string, linkSealer: Sealer | null = null): BoardMeta {
  return {
    id: b.id,
    name: b.name,
    createdAt: b.createdAt.getTime(),
    updatedAt: b.updatedAt.getTime(),
    lastOpenedAt: b.updatedAt.getTime(),
    favorite: false,
    ownerName,
    ownerId: b.ownerId,
    workspaceId: b.organizationId,
    teamId: b.teamId,
    projectId: b.projectId,
    isPersonalSpace: b.isPersonalSpace,
    invitedGuestIds: [],
    members: members.map((m): BoardMember => ({ boardId: m.boardId, userId: m.userId, role: m.role, invitedBy: m.invitedBy, invitedAt: m.invitedAt.getTime(), expiresAt: ms(m.expiresAt) })),
    publicLink: link ? linkFromRow(link, linkSealer) : undefined,
    deletedAt: ms(b.deletedAt),
    deletedBy: b.deletedBy,
    team: b.legacyTeam,
    space: b.legacySpace,
    color: b.color,
    thumbnail: b.thumbnail ?? undefined,
    template: b.template as BoardTemplateId,
    ...(b.importedFrom ? { importedFrom: b.importedFrom } : {}),
  };
}

export async function loadOrganization(db: Db, orgId: string): Promise<WorkspaceEntity> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new Error(`organization ${orgId} not found`);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    allowedEmailDomains: org.allowedEmailDomains,
    requireDomainForMembers: org.requireDomainForMembers,
    createdAt: org.createdAt.getTime(),
    ownerId: org.ownerId,
    policies: { ...DEFAULT_WORKSPACE_POLICIES, ...org.policies },
  };
}

export async function loadRulesState(db: Db, orgId: string, keys: StateKeys): Promise<WorkspaceRulesState> {
  const inviteSealer = inviteSealerOf(keys);
  const linkSealer = linkSealerOf(keys);
  const workspace = await loadOrganization(db, orgId);
  const people = await db.select({ u: users, m: orgMemberships }).from(orgMemberships).innerJoin(users, eq(users.id, orgMemberships.userId)).where(eq(orgMemberships.organizationId, orgId));
  const teamRows = await db.select().from(teams).where(eq(teams.organizationId, orgId));
  const teamIds = teamRows.map((t) => t.id);
  const tm = teamIds.length ? await db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamIds)) : [];
  const projectRows = await db.select().from(projects).where(eq(projects.organizationId, orgId));
  const projectIds = projectRows.map((p) => p.id);
  const pg = projectIds.length ? await db.select().from(projectGuests).where(inArray(projectGuests.projectId, projectIds)) : [];
  const invRows = await db.select().from(invitations).where(eq(invitations.organizationId, orgId));
  const boardRows = (await db.select(boardMetaColumns).from(boards).where(eq(boards.organizationId, orgId))) as BoardMetaRow[];
  const boardIds = boardRows.map((b) => b.id);
  const memberRows = boardIds.length ? await db.select().from(boardMembers).where(inArray(boardMembers.boardId, boardIds)) : [];
  const linkRows = boardIds.length ? await db.select().from(publicLinks).where(inArray(publicLinks.boardId, boardIds)) : [];

  const directory: UserAccount[] = people.map(({ u, m }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    status: m.status === 'invited' ? 'suspended' : m.status,
    workspaceRole: m.role,
    teamIds: tm.filter((x) => x.userId === u.id).map((x) => x.teamId),
    authProvider: u.authProvider,
    lastSeenAt: ms(u.lastSeenAt),
    deactivatedAt: ms(m.suspendedAt ?? m.removedAt),
    createdVia: u.createdVia,
    invitedBy: m.invitedBy ?? undefined,
    createdAt: m.createdAt.getTime(),
    anonymizedAt: ms(m.anonymizedAt ?? u.anonymizedAt),
    guestExpiresAt: ms(m.guestExpiresAt),
    mustChangePassword: u.mustChangePassword,
    emailVerified: !!u.emailVerifiedAt,
  }));
  const nameOf = new Map(directory.map((a) => [a.id, a.name]));

  const teamList: TeamEntity[] = teamRows.map((t) => ({
    id: t.id,
    workspaceId: t.organizationId,
    name: t.name,
    description: t.description ?? undefined,
    color: t.color,
    memberIds: tm.filter((x) => x.teamId === t.id).map((x) => x.userId),
    createdAt: t.createdAt.getTime(),
    archivedAt: ms(t.archivedAt),
  }));

  const projectList: ProjectFolder[] = projectRows.map((p) => {
    const guests = pg.filter((g) => g.projectId === p.id);
    return {
      id: p.id,
      workspaceId: p.organizationId,
      teamId: p.teamId,
      name: p.name,
      description: p.description ?? undefined,
      invitedGuestIds: guests.map((g) => g.userId),
      guestRoles: Object.fromEntries(guests.map((g) => [g.userId, g.role])),
      createdAt: p.createdAt.getTime(),
      archivedAt: ms(p.archivedAt),
    };
  });

  const invitationList: Invitation[] = invRows.map((i) => ({
    id: i.id,
    workspaceId: i.organizationId,
    email: i.email,
    role: i.role,
    teamIds: i.teamIds.length ? i.teamIds : undefined,
    projectId: i.projectId ?? undefined,
    boardId: i.boardId ?? undefined,
    boardRole: i.boardRole ?? undefined,
    token: inviteSealer.open(i.tokenEnc) ?? '',
    invitedBy: i.invitedBy,
    createdAt: i.createdAt.getTime(),
    expiresAt: i.expiresAt.getTime(),
    acceptedAt: ms(i.acceptedAt),
    acceptedBy: i.acceptedBy,
    revokedAt: ms(i.revokedAt),
    emailedAt: ms(i.emailedAt),
  }));

  // Chat 08.5 · B: links gerais (nunca o token: só existe o hash) e pedidos já confirmados (os não confirmados ficam de fora)
  const linkList: InviteLink[] = (await db.select().from(inviteLinks).where(eq(inviteLinks.organizationId, orgId))).map((l) => ({
    id: l.id,
    role: l.role,
    teamIds: l.teamIds.length ? l.teamIds : undefined,
    projectId: l.projectId ?? undefined,
    boardId: l.boardId ?? undefined,
    boardRole: l.boardRole ?? undefined,
    allowedDomain: l.allowedDomain,
    maxUses: l.maxUses,
    uses: l.uses,
    createdBy: l.createdBy,
    createdAt: l.createdAt.getTime(),
    expiresAt: l.expiresAt.getTime(),
    revokedAt: ms(l.revokedAt),
  }));
  const requestList: AccessRequest[] = (
    await db
      .select()
      .from(accessRequests)
      .where(and(eq(accessRequests.organizationId, orgId), ne(accessRequests.status, 'unconfirmed')))
  ).map((r) => ({
    id: r.id,
    kind: r.kind,
    inviteLinkId: r.inviteLinkId,
    email: r.email,
    name: r.name,
    message: r.message,
    status: r.status,
    emailConfirmed: !!r.emailConfirmedAt,
    existingAccount: r.existingAccount,
    createdAt: r.createdAt.getTime(),
    decidedAt: ms(r.decidedAt),
    decidedBy: r.decidedBy,
    invitationId: r.invitationId,
  }));

  const boardList: BoardMeta[] = boardRows.map((b) =>
    boardMetaFromRow(
      b,
      memberRows.filter((m) => m.boardId === b.id),
      linkRows.find((l) => l.boardId === b.id),
      nameOf.get(b.ownerId) ?? '',
      linkSealer,
    ),
  );

  return { workspace, directory, teams: teamList, projects: projectList, invitations: invitationList, boards: boardList, inviteLinks: linkList, accessRequests: requestList };
}

/* ------------------------------ Gravação da diferença ------------------------------ */

const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((x) => [x.id, x]));

export interface PersistOutcome {
  /** Participações que deixaram de estar ativas (o servidor derruba as sessões) */
  deactivated: string[];
}

function membershipStatus(a: UserAccount): 'active' | 'suspended' | 'removed' {
  return a.status;
}

export async function persistDiff(db: Db, orgId: string, before: WorkspaceRulesState, after: WorkspaceRulesState, keys: StateKeys): Promise<PersistOutcome> {
  const inviteSealer = inviteSealerOf(keys);
  const linkSealer = linkSealerOf(keys);
  const deactivated: string[] = [];

  if (after.workspace !== before.workspace) {
    const w = after.workspace;
    await db
      .update(organizations)
      .set({ name: w.name, slug: w.slug, allowedEmailDomains: w.allowedEmailDomains, requireDomainForMembers: w.requireDomainForMembers, policies: { ...DEFAULT_WORKSPACE_POLICIES, ...(w.policies ?? {}) } })
      .where(eq(organizations.id, orgId));
  }

  if (after.directory !== before.directory) {
    const prev = byId(before.directory);
    for (const a of after.directory) {
      const b = prev.get(a.id);
      if (b === a) continue;
      if (!b || b.name !== a.name || b.email !== a.email || b.avatarColor !== a.avatarColor || (b.anonymizedAt ?? null) !== (a.anonymizedAt ?? null)) {
        await db.update(users).set({ name: a.name, email: a.email, avatarColor: a.avatarColor, anonymizedAt: dt(a.anonymizedAt) }).where(eq(users.id, a.id));
      }
      const status = membershipStatus(a);
      const values = {
        role: a.workspaceRole === 'visitor' ? 'member' : a.workspaceRole,
        status,
        suspendedAt: status === 'suspended' ? dt(a.deactivatedAt ?? Date.now()) : null,
        removedAt: status === 'removed' ? dt(a.deactivatedAt ?? Date.now()) : null,
        anonymizedAt: dt(a.anonymizedAt),
        guestExpiresAt: dt(a.guestExpiresAt),
      } as const;
      if (!b) {
        await db.insert(orgMemberships).values({ organizationId: orgId, userId: a.id, invitedBy: a.invitedBy ?? null, createdAt: dt(a.createdAt) ?? new Date(), ...values });
      } else {
        await db
          .update(orgMemberships)
          .set(values)
          .where(and(eq(orgMemberships.organizationId, orgId), eq(orgMemberships.userId, a.id)));
        if (b.status === 'active' && status !== 'active') deactivated.push(a.id);
      }
    }
  }

  if (after.teams !== before.teams) {
    const prev = byId(before.teams);
    for (const t of after.teams) {
      const b = prev.get(t.id);
      if (b === t) continue;
      const row = { name: t.name, description: t.description ?? null, color: t.color, archivedAt: dt(t.archivedAt) };
      if (!b) await db.insert(teams).values({ id: t.id, organizationId: orgId, createdAt: dt(t.createdAt) ?? new Date(), ...row });
      else await db.update(teams).set(row).where(eq(teams.id, t.id));
      if (!b || b.memberIds.join(',') !== t.memberIds.join(',')) {
        await db.delete(teamMembers).where(eq(teamMembers.teamId, t.id));
        if (t.memberIds.length) await db.insert(teamMembers).values(t.memberIds.map((userId) => ({ teamId: t.id, userId })));
      }
    }
  }

  if (after.projects !== before.projects) {
    const prev = byId(before.projects);
    for (const p of after.projects) {
      const b = prev.get(p.id);
      if (b === p) continue;
      const row = { teamId: p.teamId, name: p.name, description: p.description ?? null, archivedAt: dt(p.archivedAt) };
      if (!b) await db.insert(projects).values({ id: p.id, organizationId: orgId, createdAt: dt(p.createdAt) ?? new Date(), ...row });
      else await db.update(projects).set(row).where(eq(projects.id, p.id));
      const guestsKey = (x: ProjectFolder) => x.invitedGuestIds.map((g) => `${g}:${x.guestRoles?.[g] ?? 'editor'}`).join(',');
      if (!b || guestsKey(b) !== guestsKey(p)) {
        await db.delete(projectGuests).where(eq(projectGuests.projectId, p.id));
        if (p.invitedGuestIds.length) {
          await db.insert(projectGuests).values(p.invitedGuestIds.map((userId) => ({ projectId: p.id, userId, role: (p.guestRoles?.[userId] ?? 'editor') as 'editor' | 'commenter' | 'viewer' })));
        }
      }
    }
  }

  if (after.invitations !== before.invitations) {
    const prev = byId(before.invitations);
    for (const i of after.invitations) {
      const b = prev.get(i.id);
      if (b === i) continue;
      if (!b) {
        await db.insert(invitations).values({
          id: i.id,
          organizationId: orgId,
          email: i.email,
          role: i.role === 'visitor' ? 'member' : i.role,
          teamIds: i.teamIds ?? [],
          projectId: i.projectId ?? null,
          boardId: i.boardId ?? null,
          boardRole: i.boardRole && i.boardRole !== 'owner' ? i.boardRole : null,
          tokenHash: sha256Hex(i.token),
          tokenEnc: inviteSealer.seal(i.token),
          invitedBy: i.invitedBy,
          createdAt: dt(i.createdAt) ?? new Date(),
          expiresAt: dt(i.expiresAt) ?? new Date(),
        });
      } else {
        await db
          .update(invitations)
          .set({ revokedAt: dt(i.revokedAt), acceptedAt: dt(i.acceptedAt), acceptedBy: i.acceptedBy ?? null, expiresAt: dt(i.expiresAt) ?? new Date() })
          .where(eq(invitations.id, i.id));
      }
    }
  }

  // Chat 08.5 · B: links gerais (novo = só o hash do token) e decisões da fila de pedidos
  if (after.inviteLinks && after.inviteLinks !== before.inviteLinks) {
    const prev = byId(before.inviteLinks ?? []);
    for (const l of after.inviteLinks) {
      const b = prev.get(l.id);
      if (b === l) continue;
      if (!b) {
        if (!l.token) throw new Error('invite link without token');
        await db.insert(inviteLinks).values({
          id: l.id,
          organizationId: orgId,
          role: l.role,
          teamIds: l.teamIds ?? [],
          projectId: l.projectId ?? null,
          boardId: l.boardId ?? null,
          boardRole: l.boardRole ?? null,
          allowedDomain: l.allowedDomain ?? null,
          maxUses: l.maxUses,
          uses: l.uses,
          tokenHash: sha256Hex(l.token),
          createdBy: l.createdBy,
          createdAt: dt(l.createdAt) ?? new Date(),
          expiresAt: dt(l.expiresAt) ?? new Date(),
        });
      } else {
        await db.update(inviteLinks).set({ uses: l.uses, revokedAt: dt(l.revokedAt) }).where(eq(inviteLinks.id, l.id));
      }
    }
  }
  if (after.accessRequests && after.accessRequests !== before.accessRequests) {
    const prev = byId(before.accessRequests ?? []);
    for (const r of after.accessRequests) {
      const b = prev.get(r.id);
      if (!b || b === r) continue;
      await db
        .update(accessRequests)
        .set({ status: r.status, decidedAt: dt(r.decidedAt), decidedBy: r.decidedBy ?? null, invitationId: r.invitationId ?? null })
        .where(eq(accessRequests.id, r.id));
    }
  }

  if (after.boards !== before.boards) {
    const prev = byId(before.boards);
    const kept = new Set(after.boards.map((b) => b.id));
    const removed = before.boards.filter((b) => !kept.has(b.id)).map((b) => b.id);
    if (removed.length) await db.delete(boards).where(inArray(boards.id, removed));
    for (const m of after.boards) {
      const b = prev.get(m.id);
      if (!b || b === m) continue; // boards novos só nascem pela rota própria (com conteúdo)
      await db
        .update(boards)
        .set({
          name: m.name,
          ownerId: m.ownerId,
          teamId: m.teamId ?? null,
          projectId: m.projectId ?? null,
          isPersonalSpace: !!m.isPersonalSpace,
          legacyTeam: m.team,
          legacySpace: m.space,
          deletedAt: dt(m.deletedAt),
          deletedBy: m.deletedBy ?? null,
          updatedAt: dt(m.updatedAt) ?? new Date(),
        })
        .where(eq(boards.id, m.id));
      const memberKey = (x: BoardMeta) => (x.members ?? []).map((mm) => `${mm.userId}:${mm.role}:${mm.expiresAt ?? ''}`).join(',');
      if (memberKey(b) !== memberKey(m)) {
        await db.delete(boardMembers).where(eq(boardMembers.boardId, m.id));
        const rows = (m.members ?? []).filter((mm) => mm.role !== 'owner');
        if (rows.length) {
          await db.insert(boardMembers).values(
            rows.map((mm) => ({ boardId: m.id, userId: mm.userId, role: mm.role as 'editor' | 'commenter' | 'viewer', invitedBy: mm.invitedBy, invitedAt: dt(mm.invitedAt) ?? new Date(), expiresAt: dt(mm.expiresAt) })),
          );
        }
      }
      if (b.publicLink !== m.publicLink) {
        const l = m.publicLink;
        if (!l) await db.delete(publicLinks).where(eq(publicLinks.boardId, m.id));
        else {
          // Chat 08.7 · R5 (S-17): o texto nunca vai ao banco — hash para a busca e cópia cifrada só com a chave do ambiente.
          // Com a chave no banco o token de um link existente chega como '' (desconhecido): sem troca, nada é regravado.
          const tokenChanged = !b.publicLink || (!!l.token && b.publicLink.token !== l.token);
          const tokenCols = tokenChanged ? { token: null, tokenHash: sha256Hex(l.token), tokenEnc: linkSealer ? linkSealer.seal(l.token) : null } : {};
          const row = {
            ...tokenCols,
            enabled: l.enabled,
            accessLevel: l.accessLevel,
            passwordHash: l.passwordHash ?? null,
            expiresAt: dt(l.expiresAt),
            allowDownload: l.allowDownload ?? null,
            createdBy: l.createdBy ?? m.ownerId,
            createdAt: dt(l.createdAt) ?? new Date(),
            revokedAt: dt(l.revokedAt),
            lastUsedAt: dt(l.lastUsedAt),
            // token novo ou senha nova zeram o contador de tentativas
            ...(tokenChanged || b.publicLink?.passwordHash !== l.passwordHash ? { failedAttempts: 0, lockedUntil: null } : {}),
          };
          await db
            .insert(publicLinks)
            // a linha só é criada com token novo (tokenCols presente); o hash aqui só satisfaz o tipo do insert
            .values({ boardId: m.id, tokenHash: sha256Hex(l.token), ...row })
            .onConflictDoUpdate({ target: publicLinks.boardId, set: row });
        }
      }
    }
  }

  return { deactivated };
}
