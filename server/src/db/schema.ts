/**
 * LuDraw server — esquema do PostgreSQL (Drizzle, Chat 07).
 *
 * Datas em `timestamptz`; ids de texto gerados pelo próprio app (`createId`). O banco já nasce
 * multi-organização (`organization_id` em tudo + `org_memberships`), mesmo com `single_org` por padrão.
 * Segredos nunca em texto puro: senhas em argon2id, refresh tokens/tokens de convite/setup em SHA-256.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { StoredMessage } from '../../../src/i18n/types';
import type { AuditChange, WorkspacePolicies } from '../../../src/types/workspace';

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Estado do primeiro acesso (linha única, id = 1). */
export const serverSetup = pgTable(
  'server_setup',
  {
    id: integer('id').primaryKey().default(1),
    completedAt: tstz('completed_at'),
    organizationId: text('organization_id'),
    setupTokenHash: text('setup_token_hash'),
    setupTokenIssuedAt: tstz('setup_token_issued_at'),
    mode: text('mode').$type<'single_org' | 'multi_org'>().notNull().default('single_org'),
    bootstrapSource: text('bootstrap_source').$type<'wizard' | 'env'>(),
  },
  (t) => [check('server_setup_single_row', sql`${t.id} = 1`)],
);

/** Segredos gerados pelo próprio servidor (ex.: chave dos JWT quando LUDRAW_JWT_SECRET não existe). */
export const serverSecrets = pgTable('server_secrets', {
  name: text('name').primaryKey(),
  value: text('value').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

/**
 * Chat 08.5 · B2: e-mail configurado pelo painel (linha única, id = 'default'; o SMTP é do servidor, não da
 * organização). A senha fica cifrada (AES-256-GCM, chave derivada de LUDRAW_JWT_SECRET com o propósito
 * 'smtp-password'); `password_key_check` é a impressão dessa chave na gravação, para avisar quando ela mudou.
 * As variáveis LUDRAW_SMTP_* vencem campo a campo.
 */
export const mailSettings = pgTable(
  'mail_settings',
  {
    id: text('id').primaryKey().default('default'),
    enabled: boolean('enabled').notNull().default(false),
    host: text('host'),
    port: integer('port'),
    security: text('security').$type<'tls' | 'starttls'>(),
    username: text('username'),
    fromAddress: text('from_address'),
    passwordEnc: text('password_enc'),
    passwordKeyCheck: text('password_key_check'),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => [check('mail_settings_single_row', sql`${t.id} = 'default'`)],
);

/**
 * Chat 08.5 · C: e-mails de pessoas REMOVIDAS (só o HMAC, com a chave 'removed-email'), para o cadastro pelo
 * domínio não deixar ninguém voltar sozinho. A volta é por convite de um admin (aceitar apaga a marca).
 */
export const removedEmailMarks = pgTable(
  'removed_email_marks',
  {
    organizationId: text('organization_id').notNull(),
    emailHmac: text('email_hmac').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.emailHmac] })],
);

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  allowedEmailDomains: text('allowed_email_domains').array().notNull().default(sql`'{}'::text[]`),
  requireDomainForMembers: boolean('require_domain_for_members').notNull().default(false),
  policies: jsonb('policies').$type<WorkspacePolicies>().notNull(),
  ownerId: text('owner_id').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

/** Identidade (quem faz login). Papel/status na organização ficam em `org_memberships`. */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    avatarColor: text('avatar_color').notNull(),
    passwordHash: text('password_hash'),
    authProvider: text('auth_provider').$type<'local' | 'oidc'>().notNull().default('local'),
    oidcIssuer: text('oidc_issuer'),
    oidcSubject: text('oidc_subject'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdVia: text('created_via').$type<'wizard' | 'env' | 'cli' | 'invite' | 'sso' | 'invite_link' | 'signup'>().notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastSeenAt: tstz('last_seen_at'),
    anonymizedAt: tstz('anonymized_at'),
    /** Bloqueio da conta inteira (operador da instalação, multi_org — ainda sem tela). */
    blockedAt: tstz('blocked_at'),
    /** Chat 08.5: quando a pessoa provou que recebe mensagens neste e-mail (link de verificação, redefinição de senha, SSO com e-mail verificado). */
    emailVerifiedAt: tstz('email_verified_at'),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email), uniqueIndex('users_oidc_unique').on(t.oidcIssuer, t.oidcSubject)],
);

export const orgMemberships = pgTable(
  'org_memberships',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<'admin' | 'member' | 'guest_b2b'>().notNull(),
    status: text('status').$type<'invited' | 'active' | 'suspended' | 'removed'>().notNull(),
    invitedBy: text('invited_by'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    suspendedAt: tstz('suspended_at'),
    suspendedReason: text('suspended_reason'),
    removedAt: tstz('removed_at'),
    anonymizedAt: tstz('anonymized_at'),
    guestExpiresAt: tstz('guest_expires_at'),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index('org_memberships_user').on(t.userId)],
);

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    archivedAt: tstz('archived_at'),
  },
  (t) => [index('teams_org').on(t.organizationId)],
);

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    archivedAt: tstz('archived_at'),
  },
  (t) => [index('projects_org').on(t.organizationId)],
);

export const projectGuests = pgTable(
  'project_guests',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<'editor' | 'commenter' | 'viewer'>().notNull().default('editor'),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

/** Board: metadados + conteúdo (`BoardData`) como JSON; `revision` controla edição concorrente. */
export const boards = pgTable(
  'boards',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ownerId: text('owner_id').notNull(),
    teamId: text('team_id'),
    projectId: text('project_id'),
    isPersonalSpace: boolean('is_personal_space').notNull().default(false),
    color: text('color').notNull(),
    template: text('template').notNull().default('blank'),
    thumbnail: text('thumbnail'),
    legacyTeam: text('legacy_team').notNull().default(''),
    legacySpace: text('legacy_space').notNull().default(''),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
    deletedAt: tstz('deleted_at'),
    deletedBy: text('deleted_by'),
    revision: integer('revision').notNull().default(0),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    /** Chat 08.2: board trazido do Modo Local de um navegador por `by` (`sourceId` = id do board local); evita duplicar por pessoa */
    importedFrom: jsonb('imported_from').$type<{ kind: 'local'; sourceId: string; by: string; at: number }>(),
  },
  (t) => [
    index('boards_org').on(t.organizationId),
    index('boards_owner').on(t.ownerId),
    // a mesma pessoa não traz o mesmo board local duas vezes para a organização (vale para quem trouxe, não para o dono atual)
    uniqueIndex('boards_imported_unique').on(t.organizationId, sql`(${t.importedFrom}->>'by')`, sql`(${t.importedFrom}->>'sourceId')`).where(sql`${t.importedFrom} is not null`),
  ],
);

/**
 * Chat 08.2: imagens do Modo Servidor (metadados por organização; os bytes ficam na pasta `LUDRAW_ASSETS_DIR`,
 * um arquivo por sha256). `unlinkedAt` = quando a manutenção viu a imagem sem nenhum vínculo (a folga de 24 h conta
 * daqui); volta a null se ela for vinculada de novo.
 */
export const boardAssets = pgTable(
  'board_assets',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    mime: text('mime').notNull(),
    originBoardId: text('origin_board_id'),
    createdBy: text('created_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    unlinkedAt: tstz('unlinked_at'),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.sha256] }), index('board_assets_unlinked').on(t.unlinkedAt), index('board_assets_sha').on(t.sha256)],
);

/** Chat 08.2: em quais boards cada imagem é usada (base da autorização do GET). Sai em cascata com o board. */
export const boardAssetLinks = pgTable(
  'board_asset_links',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull(),
    sha256: text('sha256').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.sha256] }), index('board_asset_links_sha').on(t.organizationId, t.sha256)],
);

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<'editor' | 'commenter' | 'viewer'>().notNull(),
    invitedBy: text('invited_by').notNull(),
    invitedAt: tstz('invited_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at'),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] })],
);

/** Preferências por pessoa e board (favorito, último acesso). */
export const boardUserState = pgTable(
  'board_user_state',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    favorite: boolean('favorite').notNull().default(false),
    lastOpenedAt: tstz('last_opened_at'),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] })],
);

/** Link público (um por board). Senha em argon2id; tentativas erradas contadas por link. */
export const publicLinks = pgTable(
  'public_links',
  {
    boardId: text('board_id')
      .primaryKey()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /**
     * Chat 08.7 · R5 (S-17): token em texto só nos links ANTERIORES à migração 0009, até o passo do boot
     * (`secureLegacyPublicLinks`) conferir o hash e zerá-lo. Links novos nunca gravam o texto.
     */
    token: text('token'),
    /** sha256 (hex) do token — a busca do link é por aqui */
    tokenHash: text('token_hash').notNull(),
    /** cópia cifrada (Sealer 'public-link-token') SÓ quando a chave vem do ambiente; com a chave no banco, null */
    tokenEnc: text('token_enc'),
    enabled: boolean('enabled').notNull().default(true),
    accessLevel: text('access_level').$type<'viewer' | 'commenter' | 'editor'>().notNull(),
    passwordHash: text('password_hash'),
    expiresAt: tstz('expires_at'),
    allowDownload: boolean('allow_download'),
    createdBy: text('created_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    revokedAt: tstz('revoked_at'),
    lastUsedAt: tstz('last_used_at'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: tstz('locked_until'),
  },
  (t) => [uniqueIndex('public_links_token').on(t.token), uniqueIndex('public_links_token_hash').on(t.tokenHash)],
);

/** Convites. O token é guardado em hash (busca) e cifrado (para o admin copiar o link de novo). */
export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').$type<'admin' | 'member' | 'guest_b2b'>().notNull(),
    teamIds: text('team_ids').array().notNull().default(sql`'{}'::text[]`),
    projectId: text('project_id'),
    boardId: text('board_id'),
    boardRole: text('board_role').$type<'editor' | 'commenter' | 'viewer'>(),
    tokenHash: text('token_hash').notNull(),
    tokenEnc: text('token_enc').notNull(),
    invitedBy: text('invited_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    acceptedAt: tstz('accepted_at'),
    acceptedBy: text('accepted_by'),
    revokedAt: tstz('revoked_at'),
    /** Chat 08.5: quando o servidor enviou o convite por e-mail (último envio) */
    emailedAt: tstz('emailed_at'),
  },
  (t) => [uniqueIndex('invitations_token').on(t.tokenHash), index('invitations_org').on(t.organizationId)],
);

/**
 * Chat 08.5 · B — links de convite gerais. SÓ o hash do token: quem cria copia o link na hora; perdeu = desativa e
 * cria outro. `uses` sobe na MESMA transação que cria a conta (ou o convite), com a linha travada.
 */
export const inviteLinks = pgTable(
  'invite_links',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').$type<'member' | 'guest_b2b'>().notNull(),
    teamIds: text('team_ids').array().notNull().default(sql`'{}'::text[]`),
    projectId: text('project_id'),
    boardId: text('board_id'),
    boardRole: text('board_role').$type<'editor' | 'commenter' | 'viewer'>(),
    allowedDomain: text('allowed_domain'),
    maxUses: integer('max_uses').notNull(),
    uses: integer('uses').notNull().default(0),
    tokenHash: text('token_hash').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [uniqueIndex('invite_links_token').on(t.tokenHash), index('invite_links_org').on(t.organizationId)],
);

/**
 * Chat 08.5 · B — fila de pedidos de acesso. Nenhum pedido guarda senha. `requester_ip_hash` (HMAC do IP) existe só
 * enquanto o pedido espera a confirmação do e-mail, para o teto por IP; sai ao confirmar.
 */
export const accessRequests = pgTable(
  'access_requests',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'email' | 'link'>().notNull(),
    inviteLinkId: text('invite_link_id').references(() => inviteLinks.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    message: text('message'),
    status: text('status').$type<'unconfirmed' | 'pending' | 'approved' | 'rejected'>().notNull(),
    existingAccount: boolean('existing_account').notNull().default(false),
    requesterIpHash: text('requester_ip_hash'),
    emailConfirmedAt: tstz('email_confirmed_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    decidedAt: tstz('decided_at'),
    decidedBy: text('decided_by'),
    invitationId: text('invitation_id'),
  },
  (t) => [
    index('access_requests_org_status').on(t.organizationId, t.status),
    index('access_requests_org_email').on(t.organizationId, t.email),
    // Chat 08.7 · R3: um só pedido ABERTO por organização + e-mail (pedidos simultâneos não duplicam a fila)
    uniqueIndex('access_requests_open_email').on(t.organizationId, t.email).where(sql`status in ('unconfirmed', 'pending')`),
  ],
);

export const snapshots = pgTable(
  'snapshots',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').$type<'auto' | 'manual' | 'safety'>().notNull(),
    reason: jsonb('reason').$type<StoredMessage>(),
    createdBy: text('created_by').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    elementCount: integer('element_count').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index('snapshots_board').on(t.boardId, t.createdAt)],
);

/** Activity Log do board (o que aconteceu no canvas), extraído de cada gravação. */
export const boardActivity = pgTable(
  'board_activity',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    timestamp: tstz('timestamp').notNull(),
    entry: jsonb('entry').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.id] }), index('board_activity_time').on(t.boardId, t.timestamp)],
);

/** bytea ↔ Uint8Array (o `pg` devolve Buffer; o PGlite devolve Uint8Array). */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  toDriver: (v) => Buffer.from(v),
  fromDriver: (v) => new Uint8Array(v),
});

/**
 * Estado do documento Yjs público de cada board em colaboração (Chat 08). `boards.data` continua sendo o
 * conteúdo completo (REST, versões, busca); esta tabela guarda a história do CRDT para os navegadores
 * conseguirem juntar edições feitas offline. `epoch` identifica a "vida" do documento: restaurar uma
 * versão ou gravar por PUT apaga a linha, e quem tinha cópia local da época antiga é obrigado a recomeçar.
 */
export const boardYdocs = pgTable('board_ydocs', {
  boardId: text('board_id')
    .primaryKey()
    .references(() => boards.id, { onDelete: 'cascade' }),
  state: bytea('state').notNull(),
  epoch: text('epoch').notNull(),
  /** `boards.revision` no momento em que o estado foi gravado (se divergir, o estado é velho e é refeito) */
  baseRevision: integer('base_revision').notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

/** Audit Log do workspace (sempre por id; `organization_id` nulo = evento da instalação). */
export const workspaceAudit = pgTable(
  'workspace_audit',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id'),
    timestamp: tstz('timestamp').notNull().defaultNow(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    targetName: text('target_name'),
    message: jsonb('message').$type<StoredMessage>(),
    changes: jsonb('changes').$type<AuditChange[]>(),
    count: integer('count'),
    /** IP de origem; apagado depois de LUDRAW_AUDIT_IP_RETENTION_DAYS. */
    ip: text('ip'),
    origin: text('origin').$type<'web' | 'cli' | 'env' | 'system'>().notNull().default('web'),
  },
  (t) => [index('workspace_audit_org_time').on(t.organizationId, t.timestamp)],
);

export const templates = pgTable(
  'templates',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scope: text('scope').$type<'workspace' | 'team' | 'personal'>().notNull(),
    teamId: text('team_id'),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    thumbnail: text('thumbnail'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [index('templates_org').on(t.organizationId)],
);

/** Sessão de login (uma por dispositivo/navegador). Revogar = derrubar na hora. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastUsedAt: tstz('last_used_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    revokedReason: text('revoked_reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

/**
 * Refresh tokens de cada sessão (só o hash). Ao renovar, o token antigo ganha `replaced_at` e guarda o
 * sucessor cifrado por alguns segundos: outra aba que reapresentar o antigo dentro da janela recebe o
 * MESMO sucessor (sem derrubar a sessão); fora da janela é reuso → a sessão inteira é revogada.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    hash: text('hash').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    issuedAt: tstz('issued_at').notNull().defaultNow(),
    replacedAt: tstz('replaced_at'),
    successorEnc: text('successor_enc'),
  },
  (t) => [index('refresh_tokens_session').on(t.sessionId)],
);

/**
 * Chat 08.5: tokens de uso único enviados por e-mail (redefinir senha, verificar e-mail…). Só o hash
 * (SHA-256) do token fica aqui; o token em claro existe apenas na mensagem enviada. `used_at` marca o
 * consumo (ou a invalidação por um token mais novo do mesmo propósito).
 */
export type EmailTokenPurpose = 'reset_password' | 'verify_email' | 'signup' | 'access_request';

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose').$type<EmailTokenPurpose>().notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
  },
  (t) => [uniqueIndex('email_tokens_hash_unique').on(t.tokenHash), index('email_tokens_purpose_email').on(t.purpose, t.email), index('email_tokens_user').on(t.userId)],
);

/** Pedidos de login SSO em andamento (state/nonce/PKCE), válidos por 10 minutos. */
export const oidcRequests = pgTable('oidc_requests', {
  state: text('state').primaryKey(),
  nonce: text('nonce').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  redirectTo: text('redirect_to').notNull(),
  /** Chat 08.7 · R5 (S-08): sha256 do cookie `ld_sso` deixado no navegador que começou o fluxo (CSRF de login) */
  browserHash: text('browser_hash'),
  createdAt: tstz('created_at').notNull().defaultNow(),
});
