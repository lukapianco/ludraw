/**
 * LuDraw — Chat 07: contrato da API entre o cliente e o servidor (`server/`).
 *
 * Arquivo PURO (só tipos e constantes), importado pelos dois lados. Erros da API nunca trazem frase
 * pronta: trazem `StoredMessage` (chave do catálogo + parâmetros) e o cliente traduz (I18N_SPEC §4.4).
 * As chaves de erro ficam escritas por extenso em `API_ERROR_KEYS` para o `audit:i18n` encontrá-las.
 */
import type { StoredMessage } from '../i18n/types';
import type { InstallMode, MembershipStatus, WorkspaceRole } from '../types/workspace';

/** Versão do contrato. Muda só com quebra de compatibilidade (o cliente confere em `/info`). */
export const API_VERSION = 1;
export const API_PREFIX = '/api/v1';
/** Cabeçalho exigido nas rotas que usam o cookie de sessão (proteção contra CSRF). */
export const CLIENT_HEADER = 'x-ludraw-client';
export const CLIENT_HEADER_VALUE = '1';
export const REFRESH_COOKIE = 'ld_rt';

/** Códigos de erro → chave do catálogo (`src/locales/<idioma>/server.json`). */
export const API_ERROR_KEYS = {
  invalidRequest: 'server.errors.invalidRequest',
  unauthorized: 'server.errors.unauthorized',
  invalidCredentials: 'server.errors.invalidCredentials',
  accountSuspended: 'server.errors.accountSuspended',
  accountRemoved: 'server.errors.accountRemoved',
  mustChangePassword: 'server.errors.mustChangePassword',
  currentPasswordWrong: 'server.errors.currentPasswordWrong',
  samePassword: 'server.errors.samePassword',
  noLocalPassword: 'server.errors.noLocalPassword',
  tooManyAttempts: 'server.errors.tooManyAttempts',
  /** Chat 08.7 · R3: muitas senhas erradas nesta conta (limite por e-mail); a mensagem aponta "Esqueci minha senha" */
  accountLocked: 'server.errors.accountLocked',
  originNotAllowed: 'server.errors.originNotAllowed',
  notFound: 'server.errors.notFound',
  internal: 'server.errors.internal',
  setupInvalidToken: 'server.errors.setupInvalidToken',
  setupNotEmpty: 'server.errors.setupNotEmpty',
  invalidEmail: 'server.errors.invalidEmail',
  nameRequired: 'server.errors.nameRequired',
  orgNameRequired: 'server.errors.orgNameRequired',
  invalidDomain: 'server.errors.invalidDomain',
  emailOutsideDomain: 'server.errors.emailOutsideDomain',
  registrationInviteOnly: 'server.errors.registrationInviteOnly',
  // A-2: boards, operações, links públicos, convites e SSO
  invalidBoard: 'server.errors.invalidBoard',
  tooManyElements: 'server.errors.tooManyElements',
  textTooLong: 'server.errors.textTooLong',
  imageTooLarge: 'server.errors.imageTooLarge',
  pathTooComplex: 'server.errors.pathTooComplex',
  payloadTooLarge: 'server.errors.payloadTooLarge',
  boardConflict: 'server.errors.boardConflict',
  boardNotFound: 'server.errors.boardNotFound',
  invalidOperation: 'server.errors.invalidOperation',
  linkUnavailable: 'server.errors.linkUnavailable',
  linkWrongPassword: 'server.errors.linkWrongPassword',
  linkPasswordRequired: 'server.errors.linkPasswordRequired',
  ssoDisabled: 'server.errors.ssoDisabled',
  ssoFailed: 'server.errors.ssoFailed',
  ssoEmailUnverified: 'server.errors.ssoEmailUnverified',
  ssoNoAccess: 'server.errors.ssoNoAccess',
  emailInUse: 'server.errors.emailInUse',
  /* Chat 08 · tempo real */
  objectInUse: 'server.errors.objectInUse',
  collabInvalidChange: 'server.errors.collabInvalidChange',
  /* Chat 08.2 · trazer boards do Modo Local */
  alreadyImported: 'server.errors.alreadyImported',
  /* Chat 08.2 · imagens no servidor */
  unsupportedImage: 'server.errors.unsupportedImage',
  /* Chat 09 · R2 · "Baixar para o board" pelo servidor (as mesmas mensagens do fluxo no app) */
  remoteImageFailed: 'importexport.safety.urlImageFailed',
  remoteImageTooLarge: 'importexport.safety.urlImageTooLarge',
  /* Chat 08.7 · R5 (S-13) */
  unsupportedMediaType: 'server.errors.unsupportedMediaType',
  storageFailed: 'server.errors.storageFailed',
  imageNotAvailable: 'server.errors.imageNotAvailable',
  imageMustUpload: 'server.errors.imageMustUpload',
  /* Chat 08.5 · e-mail e acesso */
  mailUnavailable: 'server.errors.mailUnavailable',
  // Chat 09 · R4: limites de tentativa guardados no Redis/Valkey, que está fora do ar (fecha em vez de liberar)
  limitsUnavailable: 'server.errors.limitsUnavailable',
  tokenInvalid: 'server.errors.tokenInvalid',
  mailSendFailed: 'server.errors.mailSendFailed',
  accessQueueFull: 'server.errors.accessQueueFull',
  /* Chat 08.5 · B2 · e-mail pelo painel */
  mailSettingsServerOnly: 'server.errors.mailSettingsServerOnly',
  mailFieldLocked: 'server.errors.mailFieldLocked',
  mailKeyMissing: 'server.errors.mailKeyMissing',
  mailAppUrlMissing: 'server.errors.mailAppUrlMissing',
  mailHostInvalid: 'server.errors.mailHostInvalid',
  mailHostPrivate: 'server.errors.mailHostPrivate',
  mailHostUnresolved: 'server.errors.mailHostUnresolved',
  mailPortNotAllowed: 'server.errors.mailPortNotAllowed',
  mailFromInvalid: 'server.errors.mailFromInvalid',
  mailSecurityMismatch: 'server.errors.mailSecurityMismatch',
  mailServerLimit: 'server.errors.mailServerLimit',
  /* Chat 08.5 · C */
  domainSignupNeedsMail: 'server.errors.domainSignupNeedsMail',
  domainSignupNeedsDomain: 'server.errors.domainSignupNeedsDomain',
  domainSignupMultiOrg: 'server.errors.domainSignupMultiOrg',
  domainSignupDailyLimit: 'server.errors.domainSignupDailyLimit',
  mailIncomplete: 'server.errors.mailIncomplete',
  mailConnectFailed: 'server.errors.mailConnectFailed',
  mailTlsFailed: 'server.errors.mailTlsFailed',
  mailAuthFailed: 'server.errors.mailAuthFailed',
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_KEYS;

/** Corpo de toda resposta de erro. `code` é estável; `message` é o que a interface traduz. */
export interface ApiErrorBody {
  error: { code: string; message: StoredMessage; retryAfterSeconds?: number };
}

/** `GET /api/v1/info` — público, usado pelo teste de conexão e pela tela de entrada. */
export interface ServerInfo {
  name: 'ludraw';
  version: string;
  apiVersion: number;
  setupRequired: boolean;
  mode: InstallMode | null;
  organizationName: string | null;
  sso: { enabled: boolean; label: string | null };
  /** Chat 08.5 · C: 'domain' = cadastro com o e-mail da organização ATIVO (política + SMTP + domínio) */
  registration: 'invite_only' | 'domain';
  /**
   * Chat 07: o app servido por este servidor pode ficar no Modo Local? Padrão 'blocked'
   * (LUDRAW_ALLOW_LOCAL_MODE ou a política "Permitir modo local" da organização).
   */
  localMode: 'allowed' | 'blocked';
  /** Chat 08: o servidor oferece edição ao vivo (WebSocket em `/api/v1/collab`)? Ausente = não (servidores do Chat 07). */
  realtime?: boolean;
  /** Chat 08.5: o servidor consegue enviar e-mail (recuperar senha, verificar e-mail)? Ausente = não. */
  email?: boolean;
  /** Chat 08.5 · B: a entrada oferece "Pedir acesso" (política `allowAccessRequests`). Ausente = não. */
  accessRequests?: boolean;
  /**
   * Chat 09 · R5: a tela "Sistema visual" (`#/design-system`) aparece? `LUDRAW_ENABLE_DESIGN_SYSTEM` (padrão true;
   * a imagem Docker define false). Ausente = sim (servidores anteriores). Regra do cliente: `designSystemGate`.
   */
  designSystem?: boolean;
  /**
   * Chat 09.1 · R7 (D14): origem do emissor do SSO (`https://login.example.com`), para o programa desktop deixar a
   * janela navegar até ela e a mais nenhuma outra. Já é pública (o navegador é mandado para lá). Ausente/null = sem SSO.
   */
  ssoOrigin?: string | null;
}

/** Pessoa autenticada (`/auth/me` e respostas de login). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  organizationId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  mustChangePassword: boolean;
  authProvider: 'local' | 'oidc';
  /** Chat 08.5: a pessoa já provou que recebe mensagens neste e-mail? Ausente = servidor antigo (não mostra aviso). */
  emailVerified?: boolean;
}

/** Resposta de login/refresh/setup: o access token fica só na memória do cliente; o refresh vai em cookie httpOnly. */
export interface AuthResult {
  accessToken: string;
  /** segundos até o access token vencer */
  expiresIn: number;
  user: SessionUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/* ---------------------------- Chat 08.5: e-mail e acesso ---------------------------- */

/** Idiomas em que o servidor escreve e-mails (os mesmos catálogos do app). */
export type MailLang = 'pt-BR' | 'en';

/** `POST /auth/password/forgot` — a resposta é sempre a mesma, exista ou não a conta. */
export interface ForgotPasswordRequest {
  email: string;
  lang?: MailLang;
}

/** `POST /auth/password/reset` — o token veio no link do e-mail (uso único). */
export interface ResetPasswordRequest {
  token: string;
  password: string;
}

/** `POST /auth/email/verify`. */
export interface VerifyEmailRequest {
  token: string;
}

/** Corpo dos pedidos autenticados que só escolhem o idioma do e-mail. */
export interface MailLangRequest {
  lang?: MailLang;
}

/** Validade dos links enviados por e-mail (minutos) — o cliente mostra o mesmo número que o servidor aplica. */
export const MAIL_TOKEN_MINUTES = { resetPassword: 30, verifyEmail: 60, signup: 60, accessRequest: 60 } as const;

/* ------------------------- Chat 08.5 · B2: e-mail configurado pelo painel ------------------------- */

/** Segurança da conexão SMTP no painel: TLS desde a conexão (465) ou STARTTLS obrigatório. Sem TLS só por variável. */
export type MailSecurity = 'tls' | 'starttls';

/** Portas aceitas para o host vindo do painel (as variáveis não têm essa restrição). */
export const PANEL_SMTP_PORTS = [587, 465, 25, 2525] as const;

export type MailSettingsField = 'host' | 'port' | 'security' | 'user' | 'password' | 'from';

/** Por que o e-mail não está ligado (ou `null` quando está). */
export type MailSettingsProblem = 'off' | 'missingHost' | 'missingFrom' | 'missingPassword' | 'passwordUnreadable' | 'appUrlMissing';

/**
 * `GET/PUT /api/v1/admin/mail/settings` — estado do e-mail para a administração. A senha NUNCA vem aqui:
 * só se está definida e se ainda dá para ler (a chave do servidor pode ter mudado).
 */
export interface MailSettingsView {
  /** o servidor envia e-mail agora (é o mesmo valor de `/info.email`) */
  active: boolean;
  /** de onde vem a configuração: nada, só variáveis, pasta de saída (desenvolvimento), só painel ou os dois */
  source: 'none' | 'env' | 'outbox' | 'panel' | 'mixed';
  /** interruptor do painel ("usar a configuração deste painel") */
  enabled: boolean;
  /** com LUDRAW_SMTP_HOST o e-mail está sempre ligado (o interruptor fica travado) */
  enabledLocked: boolean;
  /** valores efetivos (variável ou painel); a senha nunca */
  values: { host: string | null; port: number | null; security: MailSecurity | null; user: string | null; from: string | null };
  /** campo definido por variável (não editável no painel) */
  locked: Record<MailSettingsField, boolean>;
  passwordSet: boolean;
  /** há senha salva pelo painel, mas a chave do servidor mudou desde então: redefina */
  passwordUnreadable: boolean;
  /** o painel pode guardar senha (só com LUDRAW_JWT_SECRET no ambiente) */
  canStorePassword: boolean;
  /** sem LUDRAW_APP_URL/LUDRAW_PUBLIC_URL os e-mails não teriam links: o painel fica desativado */
  appUrlMissing: boolean;
  /**
   * Instalação multi-organização. Chat 09 · R5 (D12): no multi_org as rotas do painel recusam (409
   * `mailSettingsServerOnly`) e a Administração esconde a seção (`mailPanelVisible`); nas respostas vem sempre false.
   */
  serverOnly: boolean;
  /** LUDRAW_SMTP_ALLOW_PRIVATE_HOST ligado (homelab) */
  allowPrivateHost: boolean;
  problem: MailSettingsProblem | null;
}

/**
 * Corpo do `PUT`. Campo travado por variável vai `null`. Senha: ausente = manter a atual; `null` = remover;
 * texto = trocar.
 */
export interface MailSettingsInput {
  enabled: boolean;
  host: string | null;
  port: number | null;
  security: MailSecurity | null;
  user: string | null;
  from: string | null;
  password?: string | null;
}

/** Limites dos campos do painel de e-mail. */
export const MAIL_SETTINGS_LIMITS = { hostMax: 253, userMax: 320, fromMax: 320, passwordMax: 1024 } as const;

/* ------------------------- Chat 08.5 · B: link de convite geral e pedidos de acesso ------------------------- */

/** `GET /join/:token` — o que a tela do link mostra antes de pedir o e-mail. */
export interface JoinLinkPreview {
  organizationName: string;
  role: 'member' | 'guest_b2b';
  /** só e-mails deste domínio */
  allowedDomain: string | null;
  status: 'active' | 'revoked' | 'expired' | 'exhausted';
  /** `email` = o servidor manda um link para concluir o cadastro; `approval` = sem e-mail no servidor, vira pedido na fila */
  mode: 'email' | 'approval';
}

/** `POST /join/:token` — nunca leva senha (sem e-mail ninguém prova ser dono do endereço). */
export interface JoinRequest {
  email: string;
  name?: string;
  lang?: MailLang;
}

/** Resposta do link geral: SEMPRE a mesma, exista ou não conta com o e-mail. */
export interface JoinResponse {
  ok: true;
  mode: 'email' | 'approval';
}

/** `GET /signup/:token` — concluir o cadastro aberto pelo e-mail. */
export interface SignupPreview {
  email: string;
  organizationName: string;
  role: 'member' | 'guest_b2b';
}

/** `POST /signup/:token/complete`. */
export interface SignupFinishRequest {
  name: string;
  password: string;
}

/* ------------------------- Chat 08.5 · C: cadastro com o e-mail da organização ------------------------- */

/** `POST /signup` — resposta sempre a mesma (202), exista ou não conta, seja ou não do domínio. */
export interface DomainSignupRequest {
  email: string;
  lang?: MailLang;
}

/** O que falta para o cadastro pelo domínio funcionar. */
export type DomainSignupMissing = 'mail' | 'domain' | 'multiOrg';

/** `GET /admin/signup/status` (workspace.policies.manage): estado para o aviso em Políticas. */
export interface DomainSignupStatus {
  /** a política está ligada */
  policy: boolean;
  /** ligada E funcionando (é o mesmo que `/info.registration === 'domain'`) */
  active: boolean;
  missing: DomainSignupMissing[];
  /** contas criadas por domínio nas últimas 24 h (LUDRAW_DOMAIN_SIGNUP_MAX_PER_DAY) */
  maxPerDay: number;
  /** domínios que atingiram o teto nas últimas 24 h */
  reached: { domain: string; count: number }[];
}

/** `POST /access-requests` — resposta sempre a mesma (202). */
export interface AccessRequestInput {
  name: string;
  email: string;
  message?: string;
  lang?: MailLang;
}

/** Tetos da fila de pedidos (o servidor aplica; a documentação cita os mesmos números). */
export const ACCESS_REQUEST_LIMITS = {
  /** pedidos esperando a administração */
  maxOpen: 200,
  /** pedidos esperando a confirmação do e-mail (somem em 24 h) — no total */
  maxUnconfirmed: 500,
  /** … e vindos do mesmo IP */
  maxUnconfirmedPerIp: 5,
  nameMax: 120,
  messageMax: 500,
} as const;

/**
 * Textos dos e-mails (catálogo `server.json`, chaves `mail.*`). Só o servidor os usa; ficam escritos
 * por extenso aqui para o `audit:i18n` e o teste de chaves do servidor os encontrarem.
 */
export const MAIL_TEMPLATE_KEYS = {
  common: {
    linkHint: 'server.mail.common.linkHint',
    footer: 'server.mail.common.footer',
  },
  resetPassword: {
    subject: 'server.mail.resetPassword.subject',
    eyebrow: 'server.mail.resetPassword.eyebrow',
    heading: 'server.mail.resetPassword.heading',
    body: 'server.mail.resetPassword.body',
    action: 'server.mail.resetPassword.action',
    note: 'server.mail.resetPassword.note',
  },
  resetPasswordSso: {
    subject: 'server.mail.resetPasswordSso.subject',
    eyebrow: 'server.mail.resetPasswordSso.eyebrow',
    heading: 'server.mail.resetPasswordSso.heading',
    body: 'server.mail.resetPasswordSso.body',
    action: 'server.mail.resetPasswordSso.action',
    note: 'server.mail.resetPasswordSso.note',
  },
  verifyEmail: {
    subject: 'server.mail.verifyEmail.subject',
    eyebrow: 'server.mail.verifyEmail.eyebrow',
    heading: 'server.mail.verifyEmail.heading',
    body: 'server.mail.verifyEmail.body',
    action: 'server.mail.verifyEmail.action',
    note: 'server.mail.verifyEmail.note',
  },
  testMail: {
    subject: 'server.mail.testMail.subject',
    eyebrow: 'server.mail.testMail.eyebrow',
    heading: 'server.mail.testMail.heading',
    body: 'server.mail.testMail.body',
    note: 'server.mail.testMail.note',
  },
  /* Chat 08.5 · B */
  invitation: {
    subject: 'server.mail.invitation.subject',
    eyebrow: 'server.mail.invitation.eyebrow',
    heading: 'server.mail.invitation.heading',
    body: 'server.mail.invitation.body',
    action: 'server.mail.invitation.action',
    note: 'server.mail.invitation.note',
  },
  joinLink: {
    subject: 'server.mail.joinLink.subject',
    eyebrow: 'server.mail.joinLink.eyebrow',
    heading: 'server.mail.joinLink.heading',
    body: 'server.mail.joinLink.body',
    action: 'server.mail.joinLink.action',
    note: 'server.mail.joinLink.note',
  },
  joinExisting: {
    subject: 'server.mail.joinExisting.subject',
    eyebrow: 'server.mail.joinExisting.eyebrow',
    heading: 'server.mail.joinExisting.heading',
    body: 'server.mail.joinExisting.body',
    action: 'server.mail.joinExisting.action',
    note: 'server.mail.joinExisting.note',
  },
  accessConfirm: {
    subject: 'server.mail.accessConfirm.subject',
    eyebrow: 'server.mail.accessConfirm.eyebrow',
    heading: 'server.mail.accessConfirm.heading',
    body: 'server.mail.accessConfirm.body',
    action: 'server.mail.accessConfirm.action',
    note: 'server.mail.accessConfirm.note',
  },
  accessExisting: {
    subject: 'server.mail.accessExisting.subject',
    eyebrow: 'server.mail.accessExisting.eyebrow',
    heading: 'server.mail.accessExisting.heading',
    body: 'server.mail.accessExisting.body',
    action: 'server.mail.accessExisting.action',
    note: 'server.mail.accessExisting.note',
  },
  /* Chat 08.5 · C */
  domainSignup: {
    subject: 'server.mail.domainSignup.subject',
    eyebrow: 'server.mail.domainSignup.eyebrow',
    heading: 'server.mail.domainSignup.heading',
    body: 'server.mail.domainSignup.body',
    action: 'server.mail.domainSignup.action',
    note: 'server.mail.domainSignup.note',
  },
  /** nomes dos papéis dentro dos e-mails */
  roles: {
    admin: 'server.mail.roles.admin',
    member: 'server.mail.roles.member',
    guest_b2b: 'server.mail.roles.guest_b2b',
  },
} as const;

export type MailKind = Exclude<keyof typeof MAIL_TEMPLATE_KEYS, 'common' | 'roles'>;

/** `POST /api/v1/setup/complete` — primeiro acesso (WORKSPACE_ADMIN_SPEC §5). */
export interface SetupCompleteRequest {
  token: string;
  mode: InstallMode;
  organization: { name: string; allowedEmailDomains: string[] };
  admin: { name: string; email: string; password: string };
}

export interface SetupStatus {
  required: true;
  /** o token foi gerado e impresso nos logs (ou veio de LUDRAW_SETUP_TOKEN) */
  tokenIssued: boolean;
}

/**
 * Parâmetros traduzíveis das entradas de auditoria gravadas pelo servidor (método de entrada, origem,
 * motivo). Ficam como `StoredMessage` aninhada dentro da mensagem e são traduzidos na hora de exibir.
 */
export const AUDIT_PARAM_KEYS = {
  methodPassword: 'server.audit.method.password',
  methodSso: 'server.audit.method.sso',
  methodSetup: 'server.audit.method.setup',
  methodInvitation: 'server.audit.method.invitation',
  methodInviteLink: 'server.audit.method.inviteLink',
  methodSignup: 'server.audit.method.signup',
  sourceWizard: 'server.audit.source.wizard',
  sourceEnv: 'server.audit.source.env',
  reasonWrongPassword: 'server.audit.reason.wrongPassword',
  reasonSuspended: 'server.audit.reason.suspended',
  reasonRemoved: 'server.audit.reason.removed',
  reasonLogoutAll: 'server.audit.reason.logoutAll',
  reasonPasswordChanged: 'server.audit.reason.passwordChanged',
  reasonPasswordReset: 'server.audit.reason.passwordReset',
  reasonRefreshReuse: 'server.audit.reason.refreshReuse',
} as const;

/** Mensagens do Audit Log gravadas pelo servidor (o cliente as traduz em `auditText`). */
export const SERVER_AUDIT_MESSAGES = {
  login: 'workspace.audit.msg.login',
  loginFailed: 'workspace.audit.msg.loginFailed',
  loginLocked: 'workspace.audit.msg.loginLocked',
  setupCompleted: 'workspace.audit.msg.setupCompleted',
  adminCreatedViaCli: 'workspace.audit.msg.adminCreatedViaCli',
  adminPromotedViaCli: 'workspace.audit.msg.adminPromotedViaCli',
  passwordChanged: 'workspace.audit.msg.passwordChanged',
  passwordResetViaCli: 'workspace.audit.msg.passwordResetViaCli',
  sessionsRevoked: 'workspace.audit.msg.sessionsRevoked',
  setupTokenIssued: 'workspace.audit.msg.setupTokenIssued',
  /* Chat 08 · tempo real */
  privateNotesRevealed: 'workspace.audit.msg.privateNotesRevealed',
  votingRevealed: 'workspace.audit.msg.votingRevealed',
  collabWriteDenied: 'workspace.audit.msg.collabWriteDenied',
  /* Chat 08.2 */
  boardImported: 'workspace.audit.msg.boardImported',
  /* Chat 08.5 */
  passwordResetEmail: 'workspace.audit.msg.passwordResetEmail',
  mailTestSent: 'workspace.audit.msg.mailTestSent',
  /* Chat 08.5 · B */
  invitationEmailed: 'workspace.audit.msg.invitationEmailed',
  invitationResent: 'workspace.audit.msg.invitationResent',
  /* Chat 08.5 · B2 */
  mailSettingsUpdated: 'workspace.audit.msg.mailSettingsUpdated',
} as const;

/* ---------------------------- A-2: workspace, boards, links ---------------------------- */

/** `GET /workspace/state` — tudo o que a Mesa e a administração precisam, já filtrado pelo papel. */
export interface WorkspaceState {
  workspace: import('../types/workspace').WorkspaceEntity;
  directory: import('../types/workspace').UserAccount[];
  teams: import('../types/workspace').TeamEntity[];
  projects: import('../types/workspace').ProjectFolder[];
  invitations: import('../types/workspace').Invitation[];
  boards: import('../types/workspace').BoardMeta[];
  /** Chat 08.5 · B: só para quem gerencia membros (sem token nem senha) */
  inviteLinks?: import('../types/workspace').InviteLink[];
  accessRequests?: import('../types/workspace').AccessRequest[];
  /** últimas entradas (só com `workspace.audit.view`) */
  auditLog: import('../types/workspace').WorkspaceAuditEntry[];
  templates: import('../types/workspace').TemplateEntity[];
  me: SessionUser;
  serverTime: number;
}

/** Resposta de `POST /workspace/ops`. */
export interface WorkspaceOpResult {
  ok: true;
  id?: string;
  token?: string;
  state: WorkspaceState;
  /** Chat 08.5 · B: o convite criado foi enviado por e-mail? (ausente = não se aplica; false = o envio falhou) */
  emailed?: boolean;
}

/** Conteúdo do board + versão (controle de edição concorrente por `If-Match`). */
export interface BoardDataEnvelope {
  data: import('../types/canvas').BoardData;
  revision: number;
}

export interface CreateBoardRequest {
  id?: string;
  name: string;
  place: import('./workspace').Place;
  color?: string;
  template?: import('../types/workspace').BoardTemplateId;
  data: import('../types/canvas').BoardData;
  /** Chat 08.2: board trazido do Modo Local deste navegador (o servidor guarda quem trouxe e recusa duplicata) */
  importFrom?: { kind: 'local'; sourceId: string };
}

export interface BoardMetaPatch {
  name?: string;
  favorite?: boolean;
  lastOpenedAt?: number;
  thumbnail?: string | null;
}

/** A versão é sempre tirada do conteúdo GRAVADO no servidor (o cliente pode ter partes redigidas). */
export interface CreateSnapshotRequest {
  id?: string;
  name: string;
  kind: 'auto' | 'manual' | 'safety';
  reason?: StoredMessage;
}

/** `GET /public/links/:token` — o que o portão do link mostra. */
export interface PublicLinkResolution {
  status: 'ok' | 'password' | 'expired' | 'revoked' | 'disabled' | 'policy' | 'invalid';
  boardId?: string;
  boardName?: string;
  accessLevel?: 'viewer' | 'commenter' | 'editor';
  allowDownload?: boolean;
}

/** Sessão de visitante (link público): token curto, só para aquele board. */
export interface PublicLinkSession {
  visitorToken: string;
  expiresIn: number;
  boardId: string;
  accessLevel: 'viewer' | 'commenter' | 'editor';
  allowDownload?: boolean;
  policies: import('../types/workspace').WorkspacePolicies;
}

/** `GET /invitations/:token` — prévia do convite (sem dados da organização além do necessário). */
export interface InvitationPreview {
  email: string;
  role: 'admin' | 'member' | 'guest_b2b';
  organizationName: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: number;
  /** já existe conta com este e-mail (entra com a senha dela em vez de criar outra) */
  accountExists: boolean;
}

export interface AcceptInvitationRequest {
  name?: string;
  email: string;
  password: string;
}
