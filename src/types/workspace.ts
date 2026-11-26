/**
 * LuDraw — Tipos de workspace: usuários, boards (projetos), preferências e rotas.
 * A gestão completa de pastas/espaços/equipe chega nos Chats 06 e 07; os campos já
 * existem aqui para que o dashboard do Chat 01 funcione com dados reais (localStorage).
 */

import type { BoardData, CameraState } from './canvas';
import type { StoredMessage } from '../i18n/types';

export type ThemeMode = 'light' | 'dark';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Cor do avatar (derivada do nome) */
  color: string;
  /** true quando entrou com "Continuar sem conta" */
  guest: boolean;
  organization?: string;
  department?: string;
  jobTitle?: string;
  language?: 'pt-BR' | 'en' | 'es';
}

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: number;
  color: string;
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  role: Exclude<MemberRole, 'owner'>;
  invitedAt: number;
  invitedBy: string;
}

export type NotificationChannel = 'email' | 'browser' | 'desktop';

export interface NotificationSettings {
  /** regra → canal → ligado */
  rules: Record<string, Partial<Record<NotificationChannel, boolean>>>;
  digestStart: string;
  digestEvery: '6h' | '12h' | '24h';
  muteAll: boolean;
}

/** Conta local (modo offline). A senha é guardada apenas como hash SHA-256. */
export interface LocalAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

/** Chat 04: + 'swot' | 'retro' | 'business9' | 'sprint' | 'journey' | 'architecture' (Galeria de Templates) e 'personal' (template salvo pelo usuário). */
export type BoardTemplateId =
  | 'blank'
  | 'demo'
  | 'flowchart'
  | 'brainwriting'
  | 'mindmap'
  | 'swot'
  | 'retro'
  | 'business9'
  | 'sprint'
  | 'journey'
  | 'architecture'
  | 'personal';

export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  favorite: boolean;
  ownerName: string;
  ownerId: string;
  /* ---- Hierarquia B2B (tipos no Chat 02 · UI no Chat 06) — todos opcionais ---- */
  /** Vínculo com a Organização */
  workspaceId?: string;
  /** Vínculo com o Time (null se estiver no Personal Space) */
  teamId?: string | null;
  /** Vínculo com o Projeto/Pasta */
  projectId?: string | null;
  /** Privado no "Personal Space" do usuário até ser compartilhado */
  isPersonalSpace?: boolean;
  /** Guests B2B convidados nominalmente para este board */
  invitedGuestIds?: string[];
  /** Configuração de acesso para Visitors */
  publicLink?: PublicShareLink;
  /** ACL do board (§5): compartilhar com pessoas específicas */
  members?: BoardMember[];
  /** Lixeira (soft delete) — §6 */
  deletedAt?: number | null;
  deletedBy?: string | null;
  /** Compatibilidade Chat 01 */
  team: string;
  space: string;
  /** Cor do ícone do board na listagem */
  color: string;
  /** Miniatura JPEG (data URL) gerada ao salvar */
  thumbnail?: string;
  template: BoardTemplateId;
  /** Chat 07: board aberto por link público no Modo Servidor (só nesta aba; nunca salvo no navegador) */
  transient?: boolean;
  /** Chat 08.2: trazido do Modo Local de um navegador por `by` (`sourceId` = id do board local; evita duplicar por pessoa) */
  importedFrom?: { kind: 'local'; sourceId: string; by: string; at: number };
}

export type InputDevice = 'auto' | 'mouse' | 'trackpad';

export interface Preferences {
  /* Visualizar */
  showCursors: boolean;
  /** Chat 08: cursores dos colaboradores com inércia (movimento suave). Desligado ou "Reduzir movimento" = sem animação. */
  cursorInertia: boolean;
  showComments: boolean;
  showScrollbars: boolean;
  showBoardDimensions: boolean;
  showUndoRedo: boolean;
  showMinimap: boolean;
  showConnectors: boolean;
  showObjectSize: boolean;
  suggestObjectSize: boolean;
  /* Preferências */
  inputDevice: InputDevice;
  alignObjects: boolean;
  /** Marquee seleciona objetos tocados parcialmente (false = só os totalmente cobertos) */
  selectOnTouch: boolean;
  followConversations: boolean;
  doNotDisturb: boolean;
  alwaysOpenDesktop: boolean;
  /* Acessibilidade */
  preciseSelection: boolean;
  reduceMotion: boolean;
  singleKeyShortcuts: boolean;
  /* Idioma e região — Chat 05.6 */
  /** Código do idioma escolhido (ex.: "pt-BR", "en"). Ausente = seguir o idioma do navegador. */
  locale?: string;
}

/** Chat 06: seções da Administração do Workspace (`#/admin/<seção>`). */
export type AdminSection = 'overview' | 'members' | 'guests' | 'teams' | 'policies' | 'audit' | 'trash' | 'transfer' | 'backup';

export type Route =
  | { name: 'login' }
  /** Chat 06: 'trash' = Lixeira da pessoa (`#/trash`) */
  | { name: 'dashboard'; section?: 'home' | 'recent' | 'favorites' | 'templates' | 'trash' }
  /** Chat 06: `share` = token do link público de Visitor (`#/board/:id?share=TOKEN`) */
  | { name: 'board'; id: string; focus?: string; embed?: boolean; view?: 'fit' | 'initial' | 'current'; cam?: string; share?: string }
  | { name: 'design-system' }
  /** Chat 06: a aba 'users' saiu de Configurações (redireciona para `#/admin/members`); o valor fica aceito por compatibilidade. */
  | { name: 'settings'; tab?: 'profile' | 'notifications' | 'users' | 'extensions'; /** Chat 08.2: board de onde a pessoa veio (o Voltar leva de volta a ele) */ from?: string }
  /** Chat 06: Administração do Workspace (só admin) */
  | { name: 'admin'; section?: AdminSection }
  /** Chat 06: aceitar convite (`#/invite/<token>`) no fluxo de Login local */
  | { name: 'invite'; token: string }
  /** Chat 07: primeiro acesso do servidor (só com o banco vazio) */
  | { name: 'setup' }
  /** Chat 07: volta do login da empresa (SSO); `error` = código do servidor */
  | { name: 'sso'; error?: string }
  /**
   * Chat 08.5: telas sem conta que dependem de e-mail. O token do link NUNCA fica na rota nem na URL:
   * `utils/tokenLink.ts` o tira do endereço ao abrir e o guarda só na memória.
   */
  | { name: 'forgot' }
  | { name: 'reset' }
  | { name: 'verify' }
  /** Chat 08.5 · B: link de convite geral (`#/join/<token>`, token tirado do endereço), concluir cadastro pelo e-mail (`#/signup/<token>`), pedir acesso e confirmar o pedido (`#/access/<token>`) */
  | { name: 'join' }
  | { name: 'signup' }
  | { name: 'request-access' }
  | { name: 'register' }
  | { name: 'access' };

export interface DevFeatureNotice {
  feature: string;
  /** Em qual chat/módulo está planejado */
  plannedFor?: string;
  description?: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'neutral' | 'success' | 'danger';
  /** Chat 05 (opcional): linha de ajuda abaixo da mensagem */
  detail?: string;
  /** Chat 05 (opcional): botão de ação no aviso (ex.: "Inserir mesmo assim") */
  action?: { label: string; run: () => void };
}

/** Chat 05: opções extras de `toast()` (todas opcionais). */
export interface ToastOptions {
  detail?: string;
  action?: Toast['action'];
  /** Tempo na tela (ms). Padrão 2600; com ação, 10000 */
  durationMs?: number;
}

export type ModalState =
  /** Chat 07: conexão com o servidor e troca de senha */
  | { type: 'server-settings' }
  | { type: 'change-password' }
  | { type: 'forgot-password' }
  /** Chat 08.2: trazer boards do Modo Local deste navegador para o servidor */
  | { type: 'import-local-boards' }
  /** Chat 08.7 · R4 (S-29): sair com mudanças que ainda não chegaram ao servidor */
  | { type: 'logout-unsynced'; everywhere: boolean; keepRoute: boolean }
  | { type: 'embed'; boardId: string }
  | { type: 'details'; boardId: string }
  | { type: 'shortcuts' }
  | { type: 'confirm-delete-board'; boardId: string; redirect: boolean }
  | { type: 'rename-board'; boardId: string }
  /** Chat 03 · Rodada B: excluir frame (manter/excluir conteúdo) ou filhos que ficaram fora após redimensionar */
  | { type: 'frame-children'; mode: 'delete' | 'resize'; frameIds: string[]; childIds: string[]; alsoDelete?: string[] }
  /** Chat 04: gerador de diagrama por texto (sintaxe de fluxograma estilo Mermaid) */
  | { type: 'diagram'; initialText?: string }
  /** Chat 04: Galeria de Templates (`target: 'board'` insere no board aberto; `'new'` cria um board) */
  | { type: 'templates'; target: 'board' | 'new'; tab?: 'gallery' | 'personal' | 'team' | 'workspace' }
  /** Chat 04: salvar a seleção ou o board inteiro como template (Chat 06: escopo pessoal, time ou workspace) */
  | { type: 'save-template'; source: 'selection' | 'board'; scope?: Exclude<TemplateScope, 'system'> }
  /** Chat 06: compartilhar o board (pessoas, facilitadores, link público) */
  | { type: 'share-board'; boardId: string; tab?: 'people' | 'facilitators' | 'link' }
  /** Chat 06: mover o board para o Espaço Pessoal, um Time ou um Projeto */
  | { type: 'move-board'; boardId: string }
  /** Chat 06: criar convite (link/código copiável) */
  | { type: 'invite'; role?: WorkspaceRole; teamIds?: string[]; projectId?: string; boardId?: string }
  /** Chat 06: criar/editar Time */
  | { type: 'team-edit'; teamId?: string }
  /** Chat 06: criar/editar Projeto (pasta) */
  | { type: 'project-edit'; projectId?: string; teamId?: string }
  /** Chat 04: editar um card de Kanban */
  | { type: 'kanban-card'; elementId: string; cardId: string }
  /** Chat 04: configurar uma sessão de votação por pontos */
  | { type: 'voting-setup' }
  /** Chat 05: exportar (todos os formatos) · importar arquivo · Inspetor de colagem */
  | { type: 'export-import'; tab?: 'export' | 'import' | 'inspect'; exporter?: string }
  /** Chat 05: prévia e destino de uma planilha/tabela (o livro fica em `useImportUi`) */
  | { type: 'import-sheet' };

export interface BoardBackupFile {
  format: 'ludraw-board';
  version: 1;
  exportedAt: number;
  board: { name: string; createdAt: number; ownerName: string };
  data: import('./canvas').BoardData;
}

export type { CameraState };


/* ========================================================================== */
/*  Contratos corporativos B2B (ARCHITECTURE_MAP.md §4–§6)                     */
/*  Chat 02 · Rodada B: SOMENTE tipos. UI no Chat 06, servidor no Chat 07.     */
/* ========================================================================== */

/** 4 categorias de perfis de acesso (RBAC corporativo) */
export type WorkspaceRole =
  | 'admin' // Workspace/Team Admin: poder destrutivo, políticas de domínio e transferência de propriedade
  | 'member' // Membro interno: cria boards, edita os permitidos, convida membros
  | 'guest_b2b' // Convidado externo B2B: autenticado, mas vê APENAS os boards/projetos onde foi convidado
  | 'visitor'; // Visitante anônimo via link público

/** 1. Entidade raiz: Workspace (Organização) */
export interface WorkspaceEntity {
  id: string;
  name: string;
  slug: string;
  /** Ex.: ['empresa.com.br'] — restringe entrada automática de membros */
  allowedEmailDomains: string[];
  requireDomainForMembers: boolean;
  createdAt: number;
  ownerId: string;
  /** §6 — ausente = padrões seguros (DEFAULT_WORKSPACE_POLICIES em utils/permissions.ts) */
  policies?: WorkspacePolicies;
}

/** 2. Subdivisão: Time (Department / Squad) */
export interface TeamEntity {
  id: string;
  workspaceId: string;
  /** Ex.: "Engenharia", "Produto", "Diretoria" */
  name: string;
  description?: string;
  color: string;
  /** Um usuário corporativo pode pertencer a múltiplos times */
  memberIds: string[];
  createdAt: number;
  /** Chat 06: arquivado (some do seletor; boards continuam existindo) */
  archivedAt?: number | null;
}

/** 3. Agrupador lógico: Projeto (pasta dentro de um Time) */
export interface ProjectFolder {
  id: string;
  workspaceId: string;
  teamId: string;
  /** Ex.: "Q3 - Lançamento do App" */
  name: string;
  description?: string;
  /** IDs de usuários 'guest_b2b' com acesso a esta pasta */
  invitedGuestIds: string[];
  createdAt: number;
  /** Chat 06: papel de cada convidado B2B nos boards do projeto (ausente = editor) */
  guestRoles?: Record<string, BoardRole>;
  /** Chat 06: arquivado */
  archivedAt?: number | null;
}

/** Link público para Visitors anônimos */
export interface PublicShareLink {
  enabled: boolean;
  /**
   * Token do link. Chat 08.7 · R5 (S-17): no Modo Servidor sem `LUDRAW_JWT_SECRET` o servidor guarda só o hash e
   * manda '' — o endereço aparece uma única vez, na criação (o cliente guarda o que propôs nesta sessão).
   */
  token: string;
  /** Chat 08.7 · R5: impressão curta do link (12 primeiros caracteres do sha256 do token); identifica sem revelar */
  tokenPrint?: string;
  accessLevel: 'viewer' | 'commenter' | 'editor';
  /** Senha opcional */
  passwordHash?: string | null;
  /** Timestamp de expiração opcional */
  expiresAt?: number | null;
  /** Visitante pode exportar? `true` libera; `false` nega; ausente segue WorkspacePolicies.allowViewerExport (padrão: desligada) — Chat 05 */
  allowDownload?: boolean;
  createdBy?: string;
  createdAt?: number;
  /** Revogar sem apagar, para a auditoria */
  revokedAt?: number | null;
  lastUsedAt?: number | null;
}

/** Snapshots de histórico de versões (Chat 06) */
export interface BoardSnapshot {
  id: string;
  boardId: string;
  name: string;
  createdAt: number;
  createdBy: string;
  elementCount: number;
  data: BoardData;
  /* ---- Chat 06 · B (opcionais) ---- */
  /** auto = periódica · manual = salva com nome · safety = antes de restaurar ou de excluir em massa */
  kind?: 'auto' | 'manual' | 'safety';
  /** Por que a versão de segurança existe (chave + parâmetros; traduzido na tela) */
  reason?: StoredMessage;
}

/** Papel DENTRO de um board (ACL ou nível do link público) */
export type BoardRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface BoardMember {
  boardId: string;
  userId: string;
  role: BoardRole;
  invitedBy: string;
  invitedAt: number;
  /** Acesso temporário (ex.: convidado B2B por 30 dias) */
  expiresAt?: number | null;
}

export interface WorkspacePolicies {
  /** padrão true */
  allowPublicLinks: boolean;
  /** null = sem limite */
  maxPublicLinkLifetimeDays: number | null;
  requirePasswordOnPublicLinks: boolean;
  /** convidados B2B */
  allowGuests: boolean;
  guestDefaultExpiryDays: number | null;
  /** visitante/leitor pode baixar PNG/PDF/CSV? */
  allowViewerExport: boolean;
  allowMembersCreateTeams: boolean;
  allowMembersInviteGuests: boolean;
  /** padrão 30 */
  snapshotRetentionDays: number;
  /** padrão 15 */
  autoSnapshotIntervalMin: number;
  /** padrão 30 */
  trashRetentionDays: number;
  /** Chat 06 (EXTENSIONS_SPEC §8): ausente = 'all' no modo local; aplicada pela plataforma do Chat 06.5 */
  allowExtensions?: 'none' | 'packs_only' | 'all';
  /** Chat 06: ids de extensões liberadas (vazio/ausente = sem lista) */
  extensionAllowlist?: string[];
  /**
   * Chat 07: o app servido por este servidor pode ser usado no Modo Local (dados só no navegador)?
   * Ausente = segue LUDRAW_ALLOW_LOCAL_MODE do servidor (padrão: bloqueado). Só faz sentido no servidor.
   */
  allowLocalMode?: boolean;
  /**
   * Chat 08: no board ao vivo, pessoas com cores iguais ou parecidas recebem cores bem diferentes (cursor, contorno,
   * avatar). Ausente = ligado.
   */
  distinctPresenceColors?: boolean;
  /** Chat 08.5 · B (Modo Servidor): a tela de entrada oferece "Pedir acesso" (fila aprovada pela administração). Ausente = desligado. */
  allowAccessRequests?: boolean;
  /**
   * Chat 08.5 · C (Modo Servidor, uma organização): quem tem e-mail de um domínio cadastrado (igualdade exata)
   * cria a própria conta como membro, provando o e-mail. Só fica ATIVA com SMTP e domínio. Ausente = desligado.
   */
  allowDomainSignup?: boolean;
}

/**
 * EMENDA v1.1 (WORKSPACE_ADMIN_SPEC §1, §10, §11) — modo da instalação e participação.
 * `single_org` (padrão; o modo local é sempre este) · `multi_org` só com servidor, a partir do Chat 07.
 */
export type InstallMode = 'single_org' | 'multi_org';

/** Status da PARTICIPAÇÃO na organização (não da identidade). Chat 07: entidade `OrgMembership`. */
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'removed';

/** Primeiro acesso do servidor (Chat 07). */
export interface ServerSetup {
  completedAt: number | null;
  organizationId: string | null;
  setupTokenHash?: string;
  mode: InstallMode;
  /** Chat 07: como o servidor foi configurado (assistente `#/setup` ou variáveis LUDRAW_*) */
  bootstrapSource?: 'wizard' | 'env' | null;
}

/**
 * Chat 07: participação de uma conta numa organização (WORKSPACE_ADMIN_SPEC §7 e §10). No servidor é
 * uma tabela própria; no cliente continua lida por `membershipOf()` (o servidor entrega o `UserAccount`
 * já com papel/status vindos daqui).
 */
export interface OrgMembership {
  userId: string;
  organizationId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  teamIds: string[];
  invitedBy?: string | null;
  createdAt: number;
  suspendedAt?: number | null;
  suspendedReason?: string | null;
  removedAt?: number | null;
  anonymizedAt?: number | null;
  guestExpiresAt?: number | null;
}

/** offboarding = 'suspended' + transferBoardOwnership */
export type AccountStatus = 'active' | 'suspended' | 'removed';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  status: AccountStatus;
  workspaceRole: WorkspaceRole;
  teamIds: string[];
  authProvider: 'local' | 'oidc';
  lastSeenAt?: number | null;
  deactivatedAt?: number | null;
  /* ---- Chat 06 (opcionais) ---- */
  /** Usuário simulado do modo local (validar telas e regras sem servidor) */
  simulated?: boolean;
  createdVia?: 'wizard' | 'env' | 'cli' | 'invite' | 'sso' | 'local' | 'simulated' | 'invite_link' | 'signup';
  invitedBy?: string;
  createdAt?: number;
  /** "Remover" = suspender + anonimizar nome/e-mail (o userId continua no Audit Log) */
  anonymizedAt?: number | null;
  /** Convidado B2B: acesso expira nesta data */
  guestExpiresAt?: number | null;
  /** Chat 07 (spec §7) */
  mustChangePassword?: boolean;
  /** Chat 08.5 (Modo Servidor): a pessoa confirmou o e-mail? Só chega para quem gerencia membros (e para a própria pessoa). */
  emailVerified?: boolean;
  /**
   * Emenda v1.1 §11: conta do modo "Continuar sem conta" — ESPAÇO ISOLADO, sem participação na
   * organização (`membershipOf()` devolve null): só vê e cria os próprios boards.
   */
  isolated?: boolean;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  /** guest_b2b: restringe ao projeto/board */
  teamIds?: string[];
  projectId?: string;
  boardId?: string;
  token: string;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number | null;
  /* ---- Chat 06 (opcionais) ---- */
  /** Papel no board/projeto para convidados B2B (ausente = editor) */
  boardRole?: BoardRole;
  revokedAt?: number | null;
  /** userId de quem aceitou */
  acceptedBy?: string | null;
  /** Chat 08.5: quando o convite foi enviado por e-mail pelo servidor (ausente = só link/código) */
  emailedAt?: number | null;
}

/**
 * Chat 08.5 · B — link de convite GERAL (vários usos): papel fixo (`member` ou `guest_b2b`, nunca admin),
 * validade, limite de usos, domínio opcional, revogável. O token só existe na criação (o servidor guarda o hash;
 * quem cria copia o link na hora). Só no Modo Servidor.
 */
export interface InviteLink {
  id: string;
  role: 'member' | 'guest_b2b';
  teamIds?: string[];
  /** convidado: projeto ou board obrigatório */
  projectId?: string;
  boardId?: string;
  boardRole?: Exclude<BoardRole, 'owner'>;
  /** só e-mails deste domínio (e subdomínios) podem usar o link */
  allowedDomain?: string | null;
  maxUses: number;
  uses: number;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number | null;
  /** existe só no momento da criação (memória); nunca é guardado nem enviado no estado */
  token?: string;
}

/**
 * Chat 08.5 · B — pedido de acesso na fila da administração. `email` = pela tela "Pedir acesso"; `link` = pelo link
 * geral num servidor SEM e-mail (a pessoa não prova o e-mail, então nada é criado até a administração aprovar). Nenhum
 * pedido leva senha: aprovar gera um CONVITE para aquele e-mail e a senha é definida ao aceitar.
 */
export interface AccessRequest {
  id: string;
  kind: 'email' | 'link';
  inviteLinkId?: string | null;
  email: string;
  name: string;
  message?: string | null;
  /** `unconfirmed` (só no servidor: aguardando o link do e-mail) nunca chega à tela */
  status: 'unconfirmed' | 'pending' | 'approved' | 'rejected';
  /** a pessoa clicou no link enviado ao e-mail (só com e-mail no servidor) */
  emailConfirmed: boolean;
  /** já existe conta com este e-mail (só a administração vê): aprovar apenas fecha o pedido */
  existingAccount: boolean;
  createdAt: number;
  decidedAt?: number | null;
  decidedBy?: string | null;
  invitationId?: string | null;
}

export type WorkspaceAuditAction =
  | 'login'
  | 'login_failed'
  /** Chat 08.7 · R3: a conta atingiu o limite de senhas erradas (login com senha travado por 15 min) */
  | 'login_locked'
  | 'member_invited'
  | 'member_joined'
  | 'member_suspended'
  | 'member_removed'
  | 'role_changed'
  | 'guest_invited'
  | 'guest_revoked'
  | 'public_link_created'
  | 'public_link_revoked'
  | 'board_created'
  | 'board_moved'
  | 'board_deleted'
  | 'board_restored'
  | 'ownership_transferred'
  | 'snapshot_restored'
  | 'export_large'
  | 'policy_changed'
  /* Chat 06 */
  | 'team_created'
  | 'team_updated'
  | 'team_archived'
  | 'project_created'
  | 'project_updated'
  | 'project_archived'
  | 'member_reactivated'
  | 'member_anonymized'
  | 'invitation_revoked'
  | 'board_access_changed'
  | 'board_purged'
  | 'trash_emptied'
  | 'template_saved'
  | 'workspace_updated'
  /* WORKSPACE_ADMIN_SPEC §7 (Chat 07) */
  | 'setup_completed'
  | 'admin_created_via_cli'
  /* Emenda v1.1 */
  | 'sessions_revoked'
  | 'registration_blocked'
  /* Chat 06 · B: backup completo do workspace */
  | 'workspace_backup_exported'
  | 'workspace_backup_restored'
  /* Chat 06.5: extensões (instaladas por pessoa, neste navegador) */
  | 'extension_installed'
  | 'extension_updated'
  | 'extension_removed'
  | 'extension_enabled'
  | 'extension_disabled'
  | 'extensions_safe_mode'
  | 'extension_permissions_changed'
  // Chat 07 (servidor): troca de senha, recuperação pela CLI e novo token de configuração
  | 'password_changed'
  | 'password_reset_via_cli'
  | 'setup_token_issued'
  // Chat 08 (tempo real): o servidor registra o que só ele vê
  | 'private_notes_revealed'
  | 'voting_revealed'
  | 'collab_write_denied'
  // Chat 08.2: boards trazidos do Modo Local deste navegador
  | 'board_imported'
  // Chat 08.5: senha redefinida pelo link do e-mail; e-mail de teste enviado pela administração
  | 'password_reset_email'
  | 'mail_test_sent'
  | 'mail_settings_updated'
  // Chat 08.5 · B: convite enviado por e-mail, link de convite geral e fila de pedidos de acesso
  | 'invitation_emailed'
  | 'invite_link_created'
  | 'invite_link_revoked'
  | 'invite_link_used'
  | 'access_request_approved'
  | 'access_request_rejected'
  // Chat 08.5 · C: conta criada pelo cadastro com o e-mail da organização
  | 'domain_signup';

/** Chat 06: alteração registrada (ex.: política antes/depois). Valores são dados, não frases. */
export interface AuditChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

/**
 * Audit Log do Workspace (separado do Activity Log do board).
 * Chat 06: o autor e o alvo são guardados por **id**; a tela resolve o nome no diretório
 * (conta anonimizada → "Usuário removido"). A mensagem é chave + parâmetros (`message`).
 */
export interface WorkspaceAuditEntry {
  id: string;
  workspaceId: string;
  timestamp: number;
  actorId: string;
  /** LEGADO: nome gravado. Entradas do Chat 06 não copiam o nome (fica vazio). */
  actorName?: string;
  action: WorkspaceAuditAction;
  targetType?: 'user' | 'team' | 'project' | 'board' | 'link' | 'policy' | 'invitation' | 'template' | 'workspace' | 'extension' | 'inviteLink' | 'accessRequest';
  targetId?: string;
  /** Nome de board/time/projeto/template (conteúdo do usuário). Nunca nome de pessoa. */
  targetName?: string;
  /** LEGADO: frase pronta */
  summary?: string;
  /** Chat 06: chave + parâmetros, traduzida na tela */
  message?: StoredMessage;
  /** Chat 06: antes/depois (políticas, papéis) */
  changes?: AuditChange[];
  /** Chat 06: quantos itens a ação afetou (ex.: transferência em massa) */
  count?: number;
  /** só no modo servidor */
  ip?: string;
}

export type TemplateScope = 'system' | 'workspace' | 'team' | 'personal';

export interface TemplateEntity {
  id: string;
  name: string;
  description?: string;
  scope: TemplateScope;
  workspaceId?: string;
  /** team herda o diretório do Time (CLAUDE.md §1.1) */
  teamId?: string;
  createdBy: string;
  createdAt: number;
  thumbnail?: string;
  data: BoardData;
}

/** Interface de persistência (Chat 06) — troca localStorage → IndexedDB → servidor/Yjs sem tocar na UI */
export interface BoardRepository {
  loadBoard(id: string): Promise<BoardData | null>;
  saveBoard(id: string, data: BoardData): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  listSnapshots(boardId: string): Promise<BoardSnapshot[]>;
  saveSnapshot(s: BoardSnapshot): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
}
