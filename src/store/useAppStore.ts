/**
 * LuDraw — Store da aplicação: rota, usuário/contas locais, tema, preferências,
 * lista de boards (projetos) e UI global (avisos "em desenvolvimento", toasts, modais).
 * Persistido em localStorage (`ludraw:app`). No Chat 06 os boards migram para IndexedDB.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  BoardMeta,
  BoardTemplateId,
  DevFeatureNotice,
  LocalAccount,
  ModalState,
  Preferences,
  Route,
  ThemeMode,
  Toast,
  ToastOptions,
  User,
  WorkspaceInvite,
  WorkspaceMember,
  NotificationChannel,
  NotificationSettings,
  TemplateEntity,
  WorkspaceRole,
} from '../types/workspace';
import type { Invitation, UserAccount, TemplateScope } from '../types/workspace';
import type { ViewAsProfile } from '../utils/permissions';
import type { BoardData } from '../types/canvas';
import { createId } from '../utils/id';
import { colorFromString } from '../utils/color';
import { createTemplateData } from '../utils/demo';
import { createWelcomeBoardData, welcomeBoardName } from '../utils/welcome';
import { loadBoardData, saveBoardData } from '../utils/storage';
import { parseHash } from '../utils/router';
import { t, translateMessage } from '../i18n';
import { DEFAULT_AUTHOR_NAME, DEFAULT_SPACE_NAME } from '../utils/storedNames';
import { sha256 } from '../utils/hash';
import { DAY_MS, LOCAL_WORKSPACE_ID, canUsePlace, keepSessionLinkTokens, type SessionLinkTokens, membershipAccounts, membershipOf, normalizeBoards, placeFields, placeOf, randomToken, teamIdsOf, type Place } from '../utils/workspace';
import { appStorageKey, isServerMode } from '../utils/serverConfig';
import type { ServerInfo, WorkspaceState } from '../utils/apiContract';
import type { LinkSession } from './workspaceSlice';
import {
  serverCreateBoard,
  serverDeleteBoard,
  serverDeleteTemplate,
  serverLogin,
  serverLogout,
  serverPatchBoard,
  serverRenameTemplate,
  serverSaveTemplate,
} from '../utils/serverSync';
import {
  accountFor,
  SYSTEM_ACTOR_ID,
  appendAudit,
  auditFrom,
  makeAuditEntry,
  completeWorkspace,
  createWorkspaceSlice,
  currentViewer,
  defaultWorkspace,
  explainBoardAction,
  explainWorkspaceAction,
  placeParam,
  policiesOf,
  purgeExpiredBoards,
  templateAccess,
  type WorkspaceSlice,
} from './workspaceSlice';

/** Abas do Painel do board (BoardSidebar). "activity" ganha conteúdo na Rodada B do Chat 02; "comments" no Chat 04. */

/** Preferências locais de áudio do Kit de Facilitação (Chat 04) — cada pessoa ouve no próprio volume. */
export interface FacilitationAudioPrefs {
  /** 0–1 */
  musicVolume: number;
  /** Silencia a música ambiente só neste navegador */
  musicMuted: boolean;
  /** Toca o alarme ao fim do cronômetro */
  alarm: boolean;
}

export const DEFAULT_AUDIO_PREFS: FacilitationAudioPrefs = { musicVolume: 0.55, musicMuted: false, alarm: true };

/**
 * Sessão atual (ARCHITECTURE_MAP §5). No modo local/offline o usuário é administrador do
 * próprio workspace; `viewAs` é o simulador "Visualizar como…" (só muda o contexto de permissão).
 */
export interface SessionState {
  userId: string;
  userName: string;
  workspaceRole: WorkspaceRole;
  viewAs: ViewAsProfile | null;
}

/**
 * Chat 06: o papel vem do diretório do workspace. Contas sem entrada (antigas, modo "sem conta",
 * cadastro local sem convite) continuam administradoras do próprio workspace local, como antes.
 */
function sessionFor(user: User | null, directory: readonly UserAccount[] = [], viewAs: ViewAsProfile | null = null): SessionState {
  const acc = user ? directory.find((a) => a.id === user.id) : undefined;
  // emenda v1.1: o papel vem da participação; conta isolada ("Continuar sem conta") não administra nada
  const m = membershipOf(acc, LOCAL_WORKSPACE_ID);
  const workspaceRole = !acc ? 'admin' : (m?.role ?? 'member');
  return { userId: user?.id ?? 'local', userName: user?.name ?? DEFAULT_AUTHOR_NAME, workspaceRole, viewAs };
}

/** Já existe administrador ativo na organização? (fecha o cadastro sem convite — emenda v1.1 §11) */
function hasActiveAdmin(directory: readonly UserAccount[]): boolean {
  return membershipAccounts(directory, LOCAL_WORKSPACE_ID).some((a) => a.workspaceRole === 'admin' && a.status === 'active');
}

/**
 * Garante a conta do usuário no diretório e atualiza o último acesso.
 * Papel de uma conta NOVA (cadastro local sem convite ou "Continuar sem conta"): administrador só se o
 * workspace ainda não tiver nenhum administrador ativo (primeiro acesso); depois disso, membro.
 * Assim ninguém vira administrador só por abrir o modo offline num navegador já em uso.
 * Contas antigas continuam administradoras pela migração (`hydrateWorkspace`).
 */
function withAccount(directory: UserAccount[], user: User, createdVia: UserAccount['createdVia']): UserAccount[] {
  const existing = directory.find((a) => a.id === user.id);
  if (existing) return directory.map((a) => (a.id === user.id ? { ...a, name: user.name, email: user.email || a.email, avatarColor: user.color, lastSeenAt: Date.now() } : a));
  return [...directory, accountFor(user, hasActiveAdmin(directory) ? 'member' : 'admin', createdVia)];
}

/**
 * localStorage protegido: escrita que falha (espaço cheio, modo privado) não quebra a ação nem some em
 * silêncio — avisa uma vez. (Na Rodada B os dados migram para IndexedDB, sem o limite de 5 MB.)
 */
/** Chat 08.7 · R5 (S-17): tokens de link público que ESTA aba recebeu do servidor (memória, nunca salvo). */
const sessionLinkTokens: SessionLinkTokens = new Map();
let storageWarned = false;
/** Chat 08.7 · R4 (S-29): durante a saída do servidor nada mais é gravado (a página recarrega em seguida). */
let persistenceSuspended = false;
export function suspendPersistence(): void {
  persistenceSuspended = true;
}
const safeLocalStorage = {
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    if (persistenceSuspended) return;
    try {
      localStorage.setItem(name, value);
    } catch {
      if (!storageWarned) {
        storageWarned = true;
        window.setTimeout(() => useAppStore.getState().toast(t('board.boardActions.localStorageFullLastChange'), 'danger'), 0);
      }
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* nada a fazer */
    }
  },
};

export const DEFAULT_PREFERENCES: Preferences = {
  showCursors: true,
  cursorInertia: true,
  showComments: true,
  showScrollbars: false,
  showBoardDimensions: false,
  showUndoRedo: true,
  showMinimap: true,
  showConnectors: true,
  showObjectSize: false,
  suggestObjectSize: true,
  inputDevice: 'auto',
  alignObjects: true,
  selectOnTouch: true,
  followConversations: true,
  doNotDisturb: false,
  alwaysOpenDesktop: false,
  preciseSelection: true,
  reduceMotion: false,
  singleKeyShortcuts: true,
};

const BOARD_COLORS = ['#194B32', '#3A8156', '#E0A21B', '#2C64A8', '#C2412D', '#8C4A7A', '#5FA067'];

const TEMPLATE_NAMES: Record<BoardTemplateId, string> = {
  get blank() { return t('common.useAppStore.untitledBoard'); },
  get demo() { return t('common.useAppStore.demoBoard'); },
  get flowchart() { return t('dashboard.templates.flowchart'); },
  get brainwriting() { return t('common.useAppStore.brainwriting'); },
  get mindmap() { return t('common.mindMap'); },
  get swot() { return t('common.swotMatrix'); },
  get retro() { return t('dashboard.templates.retrospective'); },
  get business9() { return t('common.useAppStore.n9BlockBusinessModel'); },
  get sprint() { return t('common.sprintKanban'); },
  get journey() { return t('common.useAppStore.userJourneyMap'); },
  get architecture() { return t('common.useAppStore.systemArchitecture'); },
  get personal() { return t('common.useAppStore.boardTemplate'); },
};

function makeUser(name: string, email: string, guest: boolean, id = createId()): User {
  return { id, name, email, guest, color: colorFromString(name || email) };
}

export const NOTIFICATION_RULES: { group: string; description: string; items: { id: string; label: string; channels: NotificationChannel[] }[] }[] = [
  {
    get group() { return t('common.useAppStore.boardsConversations'); },
    get description() { return t('common.useAppStore.whatHappensBoardsYouOwn'); },
    items: [
      { id: 'board-shared', get label() { return t('common.useAppStore.whenBoardSharedMe'); }, channels: ['email', 'browser', 'desktop'] },
      { id: 'board-shared-team', get label() { return t('common.useAppStore.whenBoardSharedTeam'); }, channels: ['email', 'browser'] },
      { id: 'access-request', get label() { return t('common.useAppStore.whenSomeoneRequestsAccessOne'); }, channels: ['email', 'browser', 'desktop'] },
      { id: 'comment-followed', get label() { return t('common.useAppStore.whenSomeoneCommentsThreadsI'); }, channels: ['email', 'browser', 'desktop'] },
      { id: 'mention', get label() { return t('common.useAppStore.whenSomeoneMentionsMe'); }, channels: ['email', 'browser', 'desktop'] },
      { id: 'digest', get label() { return t('common.useAppStore.summaryChangesMyBoards'); }, channels: ['email'] },
    ],
  },
  {
    get group() { return t('common.useAppStore.tablesKanban'); },
    get description() { return t('common.useAppStore.itemsAssignedYouDueDates'); },
    items: [
      { id: 'item-assigned', get label() { return t('common.useAppStore.whenItemAssignedMe'); }, channels: ['email', 'browser'] },
      { id: 'item-due', get label() { return t('common.useAppStore.whenOneMyItemsDue'); }, channels: ['email', 'browser'] },
      { id: 'item-updated', get label() { return t('common.useAppStore.whenItemAssignedMeUpdated'); }, channels: ['email', 'browser'] },
      { id: 'item-followed', get label() { return t('common.useAppStore.whenItemIFollowUpdated'); }, channels: ['email', 'browser'] },
    ],
  },
  {
    get group() { return t('common.useAppStore.spacesTeam'); },
    get description() { return t('common.useAppStore.invitationsAccessNewMembers'); },
    items: [
      { id: 'space-added', get label() { return t('common.useAppStore.whenSomeoneAddsMeSpace'); }, channels: ['email', 'browser'] },
      { id: 'guest-joined', get label() { return t('common.useAppStore.whenMyGuestsAcceptInvitation'); }, channels: ['email', 'browser'] },
      { id: 'team-access', get label() { return t('common.useAppStore.whenSomeoneRequestsAccessMy'); }, channels: ['email', 'browser', 'desktop'] },
      { id: 'team-invite', get label() { return t('common.useAppStore.whenImInvitedTeam'); }, channels: ['email', 'browser'] },
    ],
  },
];

function defaultNotificationSettings(): NotificationSettings {
  const rules: NotificationSettings['rules'] = {};
  NOTIFICATION_RULES.forEach((g) =>
    g.items.forEach((it) => {
      rules[it.id] = {};
      it.channels.forEach((c) => (rules[it.id][c] = c !== 'desktop'));
    }),
  );
  return { rules, digestStart: '08:00', digestEvery: '12h', muteAll: false };
}

export interface AppState extends WorkspaceSlice {
  route: Route;
  user: User | null;
  accounts: LocalAccount[];
  theme: ThemeMode;
  preferences: Preferences;
  boards: BoardMeta[];

  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  notifications: NotificationSettings;
  /** Aba ativa do Painel (não persistida) */
  /** Sessão + simulação de perfil (não persistida) */
  session: SessionState;
  /** Templates salvos pelo usuário (Chat 04: escopo `personal`; `team`/`workspace` no Chat 06) */
  templates: TemplateEntity[];
  /** Áudio do cronômetro neste navegador (Chat 04) */
  audioPrefs: FacilitationAudioPrefs;

  dev: DevFeatureNotice | null;
  toasts: Toast[];
  modal: ModalState | null;

  /* ---- Chat 07 · B: Modo Servidor (nada disto é salvo) ---- */
  /** Resposta de `/info` do servidor conectado (null = Modo Local ou ainda não respondeu) */
  serverInfo: ServerInfo | null;
  /** false = o servidor não respondeu (trabalhando na cópia deste navegador) */
  serverReachable: boolean;
  /** Dados da sessão no servidor (troca de senha obrigatória, tipo de login) */
  /** Chat 08.5: `emailVerified` ausente = servidor sem essa informação (não mostra aviso) */
  serverAuth: { mustChangePassword: boolean; authProvider: 'local' | 'oidc'; emailVerified?: boolean } | null;
  /** Entrou no servidor (login, convite, setup, SSO) */
  applyServerAuth: (user: User, auth: { mustChangePassword: boolean; authProvider: 'local' | 'oidc'; emailVerified?: boolean }) => void;
  /** Estado oficial da organização vindo do servidor */
  applyServerState: (state: WorkspaceState) => void;
  /** Sessão do servidor acabou: volta para a entrada (a cópia de trabalho continua até sair de vez) */
  clearServerSession: () => void;
  /** Visitante entrou por link público no Modo Servidor (board só nesta aba) */
  openServerLink: (meta: BoardMeta, link: LinkSession) => void;

  updateProfile: (patch: Partial<Pick<User, 'name' | 'email' | 'organization' | 'department' | 'jobTitle' | 'language' | 'color'>>) => void;
  setNotificationRule: (ruleId: string, channel: NotificationChannel, value: boolean) => void;
  setNotificationSettings: (patch: Partial<NotificationSettings>) => void;
  /** Abre o Painel já na aba indicada (ex.: "Gerenciar anotações" → aba Tags). */
  /** "Visualizar como…": null volta para o próprio usuário */
  setViewAs: (profile: ViewAsProfile | null) => void;
  /**
   * Salva um template (Chat 04: pessoal; Chat 06: também do Time ou do Workspace, conforme `can()`).
   * Devolve o template criado, ou null se a permissão foi negada (o motivo aparece em toast).
   */
  saveTemplate: (input: { name: string; description?: string; data: BoardData; thumbnail?: string; scope?: Exclude<TemplateScope, 'system'>; teamId?: string }) => TemplateEntity | null;
  renameTemplate: (id: string, name: string) => void;
  deleteTemplate: (id: string) => void;
  setAudioPrefs: (patch: Partial<FacilitationAudioPrefs>) => void;

  navigate: (route: Route) => void;
  setRouteFromHash: (route: Route) => void;

  register: (name: string, email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  continueAsGuest: (name?: string) => void;
  /** Chat 06: `keepRoute` mantém a rota atual (ex.: sair para aceitar um convite em #/invite/…) */
  logout: (options?: { keepRoute?: boolean }) => void;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  togglePreference: (key: { [K in keyof Preferences]-?: Preferences[K] extends boolean ? K : never }[keyof Preferences]) => void;

  /**
   * Cria um board no lugar indicado (padrão: o lugar atual da Mesa, ou o Espaço Pessoal se não puder usá-lo).
   * Chat 06: exige `workspace.boards.create`; negado → toast com o motivo e devolve ''.
   */
  createBoard: (options?: { name?: string; template?: BoardTemplateId; data?: BoardData; open?: boolean; place?: Place }) => string;
  /** Chat 06 · B: assíncrono (lê do BoardRepository). */
  duplicateBoard: (id: string) => Promise<string | null>;
  /** Chat 06: soft delete — vai para a Lixeira (`deletedAt`); some de vez após `trashRetentionDays`. */
  deleteBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  toggleFavorite: (id: string) => void;
  touchBoard: (id: string, patch?: Partial<BoardMeta>) => void;
  ensureStarterBoard: () => void;

  showDev: (feature: string, plannedFor?: string, description?: string) => void;
  hideDev: () => void;
  toast: (message: string, tone?: Toast['tone'], options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...createWorkspaceSlice(set, get),
      serverInfo: null,
      serverReachable: true,
      serverAuth: null,
      applyServerAuth: (user, auth) =>
        // renovar a sessão com um link público aberto não derruba o acesso de visitante já liberado
        set((s) => ({ user, serverAuth: auth, session: sessionFor(user, s.directory), linkSession: s.route.name === 'board' && s.route.share ? s.linkSession : null, serverReachable: true })),
      applyServerState: (st) =>
        set((s) => {
          const transient = s.boards.filter((b) => b.transient && !st.boards.some((x) => x.id === b.id));
          const user = s.user && st.me.id === s.user.id ? { ...s.user, name: st.me.name, email: st.me.email, color: st.me.avatarColor || s.user.color } : s.user;
          return {
            user,
            workspace: st.workspace,
            directory: st.directory,
            teams: st.teams,
            projects: st.projects,
            invitations: st.invitations,
            // Chat 08.5 · B: só chegam para quem gerencia membros
            inviteLinks: st.inviteLinks ?? [],
            accessRequests: st.accessRequests ?? [],
            // Chat 08.7 · R5 (S-17): o token do link criado nesta sessão continua enquanto a impressão for a mesma
            boards: [...keepSessionLinkTokens(st.boards, sessionLinkTokens), ...transient],
            auditLog: st.auditLog,
            templates: st.templates,
            session: sessionFor(user, st.directory, s.session.viewAs),
            serverAuth: { mustChangePassword: st.me.mustChangePassword, authProvider: st.me.authProvider, emailVerified: st.me.emailVerified },
            serverReachable: true,
          };
        }),
      clearServerSession: () => set((s) => ({ user: null, serverAuth: null, session: sessionFor(null), linkSession: null, route: s.route.name === 'board' && s.route.share ? s.route : { name: 'login' } })),
      openServerLink: (meta, link) =>
        set((s) => ({ boards: [...s.boards.filter((b) => b.id !== meta.id || !b.transient), ...(s.boards.some((b) => b.id === meta.id && !b.transient) ? [] : [meta])], linkSession: link })),
      route: typeof window !== 'undefined' ? parseHash(window.location.hash) : { name: 'login' },
      user: null,
      accounts: [],
      theme: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      preferences: { ...DEFAULT_PREFERENCES },
      boards: [],

      members: [],
      invites: [],
      notifications: defaultNotificationSettings(),
      session: sessionFor(null),
      templates: [],
      audioPrefs: { ...DEFAULT_AUDIO_PREFS },

      dev: null,
      toasts: [],
      modal: null,

      updateProfile: (patch) => {
        const user = get().user;
        if (!user) return;
        const next = { ...user, ...patch };
        set((st) => ({
          user: next,
          session: { ...st.session, userName: next.name },
          accounts: st.accounts.map((a) => (a.id === user.id ? { ...a, name: next.name, email: next.email.trim().toLowerCase() || a.email } : a)),
          boards: st.boards.map((b) => (b.ownerId === user.id ? { ...b, ownerName: next.name } : b)),
          // Chat 06: a conta no diretório do workspace acompanha o perfil
          directory: st.directory.map((a) => (a.id === user.id ? { ...a, name: next.name, email: next.email.trim().toLowerCase() || a.email, avatarColor: next.color } : a)),
        }));
      },

      setNotificationRule: (ruleId, channel, value) =>
        set((st) => ({
          notifications: { ...st.notifications, rules: { ...st.notifications.rules, [ruleId]: { ...st.notifications.rules[ruleId], [channel]: value } } },
        })),
      setNotificationSettings: (patch) => set((st) => ({ notifications: { ...st.notifications, ...patch } })),
      setViewAs: (profile) => set((st) => ({ session: { ...st.session, viewAs: profile } })),

      saveTemplate: ({ name, description, data, thumbnail, scope = 'personal', teamId }) => {
        const st0 = get();
        const user = st0.user;
        // Chat 06: Time → membro do time (ou admin) com `workspace.templates.team`; Workspace → `workspace.templates.manage`
        if (scope !== 'personal') {
          const d = explainWorkspaceAction(st0, scope === 'team' ? 'workspace.templates.team' : 'workspace.templates.manage');
          const teamOk = scope !== 'team' || (!!teamId && canUsePlace(currentViewer(st0), { kind: 'team', teamId }, st0.teams, st0.projects));
          if (!d.allowed || !teamOk) {
            st0.toast(d.reason ? translateMessage(d.reason) : t('workspace.errors.placeNotAllowed'), 'danger');
            return null;
          }
        }
        const template: TemplateEntity = {
          id: createId(10),
          name: name.trim() || t('common.useAppStore.unnamedTemplate'),
          description: description?.trim() || undefined,
          scope,
          workspaceId: scope === 'personal' ? undefined : st0.workspace.id,
          teamId: scope === 'team' ? teamId : undefined,
          createdBy: user?.id ?? 'local',
          createdAt: Date.now(),
          thumbnail,
          data,
        };
        set((st) => ({ templates: [template, ...st.templates] }));
        if (isServerMode()) {
          serverSaveTemplate(template);
          return template;
        }
        if (scope !== 'personal') {
          const scopeKey = scope === 'team' ? 'workspace.templates.scopeTeam' : 'workspace.templates.scopeWorkspace';
          set((st) => ({
            auditLog: appendAudit(
              st.auditLog,
              auditFrom(st, 'template_saved', { key: 'workspace.audit.msg.templateSaved', params: { name: template.name, scope: { key: scopeKey } } }, { targetType: 'template', targetId: template.id, targetName: template.name }),
            ),
          }));
        }
        return template;
      },
      renameTemplate: (id, name) => {
        const clean = name.trim();
        const tpl = get().templates.find((x) => x.id === id);
        if (!clean || !tpl) return;
        // Chat 06: templates do Time/Workspace só por quem pode gerenciá-los
        if (!templateAccess(get(), tpl).manage) return get().toast(t('workspace.templates.cannotManage'), 'danger');
        set((st) => ({ templates: st.templates.map((x) => (x.id === id ? { ...x, name: clean } : x)) }));
        if (isServerMode()) serverRenameTemplate(id, clean);
      },
      deleteTemplate: (id) => {
        const tpl = get().templates.find((x) => x.id === id);
        if (!tpl) return;
        if (!templateAccess(get(), tpl).manage) return get().toast(t('workspace.templates.cannotManage'), 'danger');
        set((st) => ({ templates: st.templates.filter((x) => x.id !== id) }));
        if (isServerMode()) serverDeleteTemplate(id);
      },
      setAudioPrefs: (patch) => set((st) => ({ audioPrefs: { ...st.audioPrefs, ...patch } })),

      navigate: (route) => set({ route }),
      setRouteFromHash: (route) => set({ route }),

      register: async (name, email, password) => {
        // Chat 07: no servidor, conta nova só por convite (o aceite cria a conta)
        if (isServerMode()) return { ok: false, error: t('server.errors.registrationInviteOnly') };
        const normalized = email.trim().toLowerCase();
        if (get().accounts.some((a) => a.email === normalized)) {
          return { ok: false, error: t('common.useAppStore.aLocalAccountThisEmail') };
        }
        const account: LocalAccount = {
          id: createId(),
          name: name.trim(),
          email: normalized,
          passwordHash: await sha256(`${normalized}:${password}`),
          createdAt: Date.now(),
        };
        // Emenda v1.1 §11: depois que existe um administrador, o cadastro exige convite/código.
        // Sem convite, nada é criado (o caminho é "Tenho um convite"). O primeiro cadastro vira admin.
        if (hasActiveAdmin(get().directory)) {
          set((s) => ({
            auditLog: appendAudit(s.auditLog, makeAuditEntry(s.workspace.id, SYSTEM_ACTOR_ID, 'registration_blocked', { key: 'workspace.audit.msg.registrationBlocked' }, { targetType: 'workspace', targetId: s.workspace.id })),
          }));
          return { ok: false, error: t('workspace.errors.inviteRequired') };
        }
        const user = makeUser(account.name, account.email, false, account.id);
        set((s) => {
          const directory = withAccount(s.directory, user, 'local');
          return { accounts: [...s.accounts, account], user, directory, session: sessionFor(user, directory) };
        });
        get().ensureStarterBoard();
        return { ok: true };
      },

      login: async (email, password) => {
        if (isServerMode()) return serverLogin(email, password);
        const normalized = email.trim().toLowerCase();
        const account = get().accounts.find((a) => a.email === normalized);
        if (!account) return { ok: false, error: t('common.useAppStore.weCouldntFindLocalAccount') };
        const hash = await sha256(`${normalized}:${password}`);
        if (hash !== account.passwordHash) return { ok: false, error: t('common.useAppStore.wrongPasswordTryAgain') };
        // Chat 06: conta suspensa ou removida não entra (offboarding)
        // participação suspensa/removida não entra (a conta isolada não tem participação e entra no próprio espaço)
        const membership = membershipOf(get().directory.find((a) => a.id === account.id), LOCAL_WORKSPACE_ID);
        if (membership && membership.status !== 'active') return { ok: false, error: t('workspace.errors.accountSuspended') };
        const user = makeUser(account.name, account.email, false, account.id);
        set((s) => {
          const directory = withAccount(s.directory, user, 'local');
          return { user, directory, session: sessionFor(user, directory), linkSession: null };
        });
        get().ensureStarterBoard();
        return { ok: true };
      },

      continueAsGuest: (name) => {
        // "Continuar sem conta" é do Modo Local (no servidor toda pessoa tem conta)
        if (isServerMode()) return;
        // Chat 06: id estável do modo "sem conta" — o Espaço Pessoal não se perde entre sessões.
        // Emenda v1.1 §11: é um ESPAÇO ISOLADO — sem participação na organização (só os próprios boards).
        const id = get().localGuestId ?? createId();
        const user = makeUser(name?.trim() || t('auth.guestName'), '', true, id);
        set((s) => {
          const existing = s.directory.find((a) => a.id === id);
          const directory = existing
            ? s.directory.map((a) => (a.id === id ? { ...a, name: user.name, avatarColor: user.color, isolated: true, workspaceRole: 'member' as const, teamIds: [], lastSeenAt: Date.now() } : a))
            : [...s.directory, { ...accountFor(user, 'member', 'local'), isolated: true }];
          return { user, localGuestId: id, directory, session: sessionFor(user, directory), linkSession: null, currentPlace: { kind: 'personal' } };
        });
        get().ensureStarterBoard();
      },

      logout: (options) => {
        // Chat 07: no servidor, sair encerra a sessão e apaga a cópia de trabalho deste navegador
        if (isServerMode() && get().user) {
          void serverLogout({ keepRoute: options?.keepRoute });
          return;
        }
        set((s) => ({ user: null, route: options?.keepRoute ? s.route : { name: 'login' }, session: sessionFor(null), linkSession: null }));
      },

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setPreference: (key, value) => set((s) => ({ preferences: { ...s.preferences, [key]: value } })),
      togglePreference: (key) => set((s) => ({ preferences: { ...s.preferences, [key]: !s.preferences[key] } })),

      createBoard: (options) => {
        const st = get();
        // Chat 06: convidados e visitantes não criam estrutura
        const allowed = explainWorkspaceAction(st, 'workspace.boards.create');
        if (!allowed.allowed) {
          if (allowed.reason) st.toast(translateMessage(allowed.reason), 'danger');
          return '';
        }
        const template = options?.template ?? 'blank';
        const user = st.user;
        const viewer = currentViewer(st);
        const wanted = options?.place ?? st.currentPlace;
        const place: Place = canUsePlace(viewer, wanted, st.teams, st.projects) ? wanted : { kind: 'personal' };
        const team = place.kind === 'team' ? st.teams.find((x) => x.id === place.teamId) : undefined;
        const project = place.kind === 'team' && place.projectId ? st.projects.find((p) => p.id === place.projectId) : undefined;
        const id = createId(10);
        const now = Date.now();
        const meta: BoardMeta = {
          id,
          name: options?.name ?? TEMPLATE_NAMES[template],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          favorite: false,
          ownerName: user?.name ?? DEFAULT_AUTHOR_NAME,
          ownerId: user?.id ?? 'local',
          ...placeFields(place, st.workspace.id),
          // campos legados (texto) mantidos para quem ainda os lê
          team: team?.name ?? (place.kind === 'workspace' ? st.workspace.name : 'Pessoal'),
          space: project?.name ?? team?.name ?? (place.kind === 'workspace' ? st.workspace.name : DEFAULT_SPACE_NAME),
          color: BOARD_COLORS[st.boards.length % BOARD_COLORS.length],
          template,
        };
        const initial = options?.data ?? createTemplateData(template);
        set((s) => ({ boards: [meta, ...s.boards] }));
        if (isServerMode()) {
          // Chat 07: o servidor cria o board (e registra no Audit Log); aqui fica a cópia de trabalho
          serverCreateBoard(meta, place, initial);
          if (options?.open) set({ route: { name: 'board', id } });
          return id;
        }
        saveBoardData(id, initial);
        // boards fora do Espaço Pessoal entram no Audit Log do Workspace
        if (place.kind !== 'personal') {
          set((s) => ({
            auditLog: appendAudit(
              s.auditLog,
              auditFrom(s, 'board_created', { key: 'workspace.audit.msg.boardCreated', params: { name: meta.name, place: placeParam(place, s) } }, { targetType: 'board', targetId: id, targetName: meta.name }),
            ),
          }));
        }
        if (options?.open) set({ route: { name: 'board', id } });
        return id;
      },

      duplicateBoard: async (id) => {
        const meta = get().boards.find((b) => b.id === id);
        const data = await loadBoardData(id);
        if (!meta || !data) return null;
        // a cópia nasce no mesmo lugar do original (se a pessoa puder usá-lo)
        const newId = get().createBoard({ name: t('common.useAppStore.nameCopy', { name: meta.name }), template: meta.template, data, place: placeOf(meta) });
        return newId || null;
      },

      deleteBoard: (id) => {
        const st = get();
        const meta = st.boards.find((b) => b.id === id);
        if (!meta || meta.deletedAt) return;
        const d = explainBoardAction(st, meta, 'board.delete');
        if (!d.allowed) {
          if (d.reason) st.toast(translateMessage(d.reason), 'danger');
          return;
        }
        const now = Date.now();
        if (isServerMode()) {
          set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, deletedAt: now, deletedBy: s.session.userId } : b)) }));
          serverDeleteBoard(id);
          return;
        }
        // Chat 06: soft delete — os dados ficam até a Lixeira ser esvaziada (manual ou por `trashRetentionDays`)
        set((s) => ({
          boards: s.boards.map((b) => (b.id === id ? { ...b, deletedAt: now, deletedBy: s.session.userId } : b)),
          auditLog: appendAudit(
            s.auditLog,
            auditFrom(s, 'board_deleted', { key: 'workspace.audit.msg.boardDeleted', params: { name: meta.name } }, { targetType: 'board', targetId: id, targetName: meta.name }),
          ),
        }));
      },

      renameBoard: (id, name) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, name: clean, updatedAt: Date.now() } : b)) }));
        if (isServerMode()) serverPatchBoard(id, { name: clean });
      },

      toggleFavorite: (id) => {
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, favorite: !b.favorite } : b)) }));
        if (isServerMode()) serverPatchBoard(id, { favorite: !!get().boards.find((b) => b.id === id)?.favorite });
      },

      touchBoard: (id, patch) => {
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
        // Chat 07: último acesso (por pessoa) e miniatura também vão para o servidor
        if (isServerMode() && patch && (patch.lastOpenedAt !== undefined || patch.thumbnail !== undefined)) {
          serverPatchBoard(id, { ...(patch.lastOpenedAt !== undefined ? { lastOpenedAt: patch.lastOpenedAt } : {}), ...(patch.thumbnail !== undefined ? { thumbnail: patch.thumbnail } : {}) });
        }
      },

      // Board criado automaticamente quando a conta ainda não tem nenhum (primeira abertura,
      // novo cadastro ou convidado). Desde o Chat 03 usa o conteúdo "Comece por aqui".
      // Boards já salvos, `createTemplateData`, templates da Mesa e presets da Dock não mudam.
      ensureStarterBoard: () => {
        const st = get();
        if (!explainWorkspaceAction(st, 'workspace.boards.create').allowed) return;
        // espaço isolado sem nenhum board próprio também ganha o board de boas-vindas
        const isolated = currentViewer(st).isolated;
        const hasBoards = isolated ? st.boards.some((b) => b.ownerId === st.session.userId && !b.deletedAt) : st.boards.length > 0;
        if (hasBoards) return;
        st.createBoard({ name: welcomeBoardName(), template: 'demo', data: createWelcomeBoardData(), place: { kind: 'personal' } });
      },

      showDev: (feature, plannedFor, description) => set({ dev: { feature, plannedFor, description } }),
      hideDev: () => set({ dev: null }),

      toast: (message, tone = 'neutral', options) => {
        const id = createId(6);
        const extra = { ...(options?.detail ? { detail: options.detail } : {}), ...(options?.action ? { action: options.action } : {}) };
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, ...extra }] }));
        window.setTimeout(() => get().dismissToast(id), options?.durationMs ?? (options?.action ? 10_000 : 2600));
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      openModal: (modal) => set({ modal }),
      closeModal: () => set({ modal: null }),
    }),
    {
      // Chat 07: o Modo Servidor guarda a cópia de trabalho em outra chave (nunca mistura com o Modo Local)
      name: appStorageKey(),
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        user: s.user,
        // Chat 07: no servidor não existem credenciais locais
        accounts: isServerMode() ? [] : s.accounts,
        theme: s.theme,
        preferences: s.preferences,
        // board aberto por link público no servidor é só desta aba
        boards: s.boards.filter((b) => !b.transient),
        members: s.members,
        invites: s.invites,
        notifications: s.notifications,
        templates: s.templates,
        audioPrefs: s.audioPrefs,
        // Chat 06
        workspace: s.workspace,
        directory: s.directory,
        teams: s.teams,
        projects: s.projects,
        invitations: s.invitations,
        auditLog: s.auditLog,
        currentPlace: s.currentPlace,
        localGuestId: s.localGuestId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const ws = hydrateWorkspace(p);
        return {
          ...current,
          ...p,
          ...ws,
          session: sessionFor(p.user ?? null, ws.directory),
          preferences: { ...DEFAULT_PREFERENCES, ...(p.preferences ?? {}) },
          notifications: { ...defaultNotificationSettings(), ...(p.notifications ?? {}) },
          templates: Array.isArray(p.templates) ? p.templates : [],
          audioPrefs: { ...DEFAULT_AUDIO_PREFS, ...(p.audioPrefs ?? {}) },
          // a sessão de visitante não vem do disco; ao reidratar por outra aba, a desta aba continua
          linkSession: current.linkSession ?? null,
        };
      },
    },
  ),
);

/**
 * Chat 06: várias abas abertas compartilham o mesmo estado salvo. Quando outra aba grava (ex.: aceitou um
 * convite e trocou de conta), esta aba relê o disco — senão a próxima gravação daqui (um toast, o autosave)
 * sobrescreveria a outra com o estado antigo (era o que desfazia o convite aceito).
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === appStorageKey() && e.newValue && e.newValue !== e.oldValue) void useAppStore.persist.rehydrate();
  });
}

/**
 * Chat 06: estado do workspace a partir do que estava salvo (idempotente — rodar de novo não muda nada).
 *  - contas locais antigas e o usuário atual → administradores do workspace local (como antes);
 *  - membros/convites da antiga aba "Usuários" (Chat 01) → diretório e `Invitation`;
 *  - boards antigos → `normalizeBoards` (Espaço Pessoal do usuário salvo, ou "Geral" da organização);
 *  - lixeira vencida (`trashRetentionDays`) é esvaziada e registrada no Audit Log.
 */
function hydrateWorkspace(p: Partial<AppState>): Pick<AppState, 'workspace' | 'directory' | 'teams' | 'projects' | 'invitations' | 'auditLog' | 'currentPlace' | 'boards' | 'localGuestId'> {
  const user = p.user ?? null;
  const accounts = Array.isArray(p.accounts) ? p.accounts : [];
  const workspace = completeWorkspace(p.workspace ?? defaultWorkspace(user?.id ?? accounts[0]?.id ?? 'local'));
  const localGuestId = p.localGuestId ?? (user?.guest ? user.id : null);

  let directory: UserAccount[];
  if (Array.isArray(p.directory)) directory = p.directory;
  else {
    directory = accounts.map((a) => accountFor({ id: a.id, name: a.name, email: a.email, color: colorFromString(a.name || a.email) }, 'admin', 'local'));
    for (const m of Array.isArray(p.members) ? p.members : []) {
      if (directory.some((d) => d.email === m.email)) continue;
      directory.push({ ...accountFor({ id: m.id, name: m.name, email: m.email, color: m.color }, 'member', 'local'), createdAt: m.joinedAt, lastSeenAt: null });
    }
  }
  if (user && !directory.some((a) => a.id === user.id)) directory = [...directory, accountFor(user, user.guest ? 'member' : 'admin', 'local')];
  // Emenda v1.1 §11: a conta do modo "Continuar sem conta" fica isolada (sem participação na organização)
  if (localGuestId) {
    directory = directory.map((a) => (a.id === localGuestId && !a.isolated ? { ...a, isolated: true, workspaceRole: 'member', teamIds: [] } : a));
  }

  const invitations: Invitation[] = Array.isArray(p.invitations)
    ? p.invitations
    : (Array.isArray(p.invites) ? p.invites : []).map((inv) => ({
        id: inv.id,
        workspaceId: workspace.id,
        email: inv.email,
        role: 'member' as const,
        token: randomToken(32),
        invitedBy: user?.id ?? 'local',
        createdAt: inv.invitedAt,
        expiresAt: inv.invitedAt + 7 * DAY_MS,
      }));

  // Só quem está salvo como usuário atual (ou o modo "sem conta") ganha Espaço Pessoal na migração;
  // boards de outras contas deste navegador vão para "Geral" e continuam visíveis/abrindo como antes.
  const knownOwners = new Set<string>([...(user ? [user.id] : []), ...(localGuestId ? [localGuestId] : [])]);
  const normalized = normalizeBoards(Array.isArray(p.boards) ? p.boards : [], workspace.id || LOCAL_WORKSPACE_ID, knownOwners);
  const purge = purgeExpiredBoards(normalized, workspace.policies ?? policiesOf({ workspace }), workspace.id);
  const auditLog = Array.isArray(p.auditLog) ? p.auditLog : [];

  const teams = Array.isArray(p.teams) ? p.teams : [];
  const projects = Array.isArray(p.projects) ? p.projects : [];
  let currentPlace: Place = p.currentPlace ?? { kind: 'personal' };
  if (currentPlace.kind === 'team') {
    const teamId = currentPlace.teamId;
    const projectId = currentPlace.projectId;
    if (!teams.some((x) => x.id === teamId && !x.archivedAt)) currentPlace = { kind: 'personal' };
    else if (projectId && !projects.some((x) => x.id === projectId && !x.archivedAt)) currentPlace = { kind: 'team', teamId };
  }
  // a pessoa entra só nos times em que está (mantém teamIds coerentes com memberIds)
  directory = directory.map((a) => {
    const ids = teamIdsOf(a.id, teams);
    return ids.join() === a.teamIds.join() ? a : { ...a, teamIds: ids };
  });

  return {
    workspace,
    directory,
    teams,
    projects,
    invitations,
    auditLog: purge.audit ? appendAudit(auditLog, purge.audit) : auditLog,
    currentPlace,
    boards: purge.boards,
    localGuestId,
  };
}

/** Atalho para abrir o aviso de "em desenvolvimento" fora de componentes React. */
export function notifyInDevelopment(feature: string, plannedFor?: string, description?: string): void {
  useAppStore.getState().showDev(feature, plannedFor, description);
}

export function notify(message: string, tone: Toast['tone'] = 'neutral'): void {
  useAppStore.getState().toast(message, tone);
}
