/**
 * LuDraw — Chat 07 · B: cliente HTTP do Modo Servidor (sem dependência; `fetch` nativo).
 *
 * - O access token fica SÓ na memória da aba; o refresh fica no cookie httpOnly (o JavaScript não o lê).
 * - Renovação única por vez: dentro da aba (promessa compartilhada) e entre abas (`navigator.locks`, quando
 *   existe). O servidor ainda tolera 20 s de corrida entre abas (Rodada A).
 * - Erros chegam como `ApiError` com `StoredMessage` (chave + parâmetros); a tela traduz com `translateStored`.
 */
import type { StoredMessage } from '../i18n/types';
import { translateStored } from '../i18n';
import type { BoardData } from '../types/canvas';
import type { BoardSnapshot } from '../types/workspace';
import {
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  type AcceptInvitationRequest,
  type AuthResult,
  type BoardDataEnvelope,
  type BoardMetaPatch,
  type CreateBoardRequest,
  type CreateSnapshotRequest,
  type AccessRequestInput,
  type DomainSignupRequest,
  type DomainSignupStatus,
  type InvitationPreview,
  type JoinLinkPreview,
  type JoinRequest,
  type JoinResponse,
  type MailLang,
  type MailSettingsInput,
  type MailSettingsView,
  type SignupFinishRequest,
  type SignupPreview,
  type PublicLinkResolution,
  type PublicLinkSession,
  type ServerInfo,
  type SessionUser,
  type SetupCompleteRequest,
  type WorkspaceOpResult,
  type WorkspaceState,
} from './apiContract';
import type { WorkspaceOp } from './workspaceRules';
import { apiBase, connection } from './serverConfig';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly storedMessage: StoredMessage,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }

  /** Frase no idioma ativo. */
  text(): string {
    return translateStored(this.storedMessage);
  }

  get offline(): boolean {
    return this.code === 'network';
  }
}

type Auth = 'user' | 'none' | { visitorBoardId: string };

interface RequestOptions {
  body?: unknown;
  auth?: Auth;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** já tentou renovar a sessão (evita laço) */
  retried?: boolean;
}

export class ApiClient {
  private accessToken: string | null = null;
  private refreshing: Promise<AuthResult | null> | null = null;
  private readonly visitorTokens = new Map<string, string>();
  /** Chamado quando a sessão terminou de vez (refresh recusado). */
  onSessionLost: (() => void) | null = null;

  constructor(private readonly base: string) {}

  get hasSession(): boolean {
    return !!this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  setVisitorToken(boardId: string, token: string | null): void {
    if (token) this.visitorTokens.set(boardId, token);
    else this.visitorTokens.delete(boardId);
  }

  visitorTokenFor(boardId: string): string | null {
    return this.visitorTokens.get(boardId) ?? null;
  }

  /** Id do visitante dado pelo servidor (claim `vid` do token): a autoria do que ele cria precisa bater com a do servidor. */
  visitorIdFor(boardId: string): string | null {
    const token = this.visitorTokens.get(boardId);
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { vid?: unknown };
      return typeof payload.vid === 'string' ? payload.vid : null;
    } catch {
      return null;
    }
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const auth = opts.auth ?? 'user';
    if (auth === 'user' && !this.accessToken && !opts.retried) await this.refresh();
    const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE, ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (auth === 'user' && this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    if (typeof auth === 'object') {
      const vt = this.visitorTokens.get(auth.visitorBoardId);
      if (vt) headers.authorization = `Bearer ${vt}`;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        credentials: 'include',
        signal: ctrl.signal,
      });
    } catch {
      throw new ApiError(0, 'network', { key: 'server.client.offline' });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 && auth === 'user' && !opts.retried) {
      const renewed = await this.refresh();
      if (renewed) return this.request<T>(method, path, { ...opts, retried: true });
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: StoredMessage; retryAfterSeconds?: number } } | undefined)?.error;
      throw new ApiError(res.status, err?.code ?? 'http', err?.message ?? { key: 'server.errors.internal' }, err?.retryAfterSeconds);
    }
    return json as T;
  }

  /**
   * Chat 08.2: pedido binário das imagens (envio do arquivo / leitura dos bytes). Mesma autenticação do `request`:
   * visitante usa o token do board (`?as=visitor`); membro renova a sessão uma vez em caso de 401.
   */
  private async binary(method: 'GET' | 'POST', path: string, boardId: string, body?: Blob, retried = false): Promise<Response> {
    const visitor = this.visitorTokens.get(boardId);
    if (!visitor && !this.accessToken && !retried) await this.refresh();
    const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
    const token = visitor ?? this.accessToken;
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) headers['content-type'] = 'application/octet-stream';
    const sep = path.includes('?') ? '&' : '?';
    const url = `${this.base}${path}${visitor ? `${sep}as=visitor&board=${encodeURIComponent(boardId)}` : ''}`;
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, credentials: 'include' });
    } catch {
      throw new ApiError(0, 'network', { key: 'server.client.offline' });
    }
    if (res.status === 401 && !visitor && !retried && (await this.refresh())) return this.binary(method, path, boardId, body, true);
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: StoredMessage } } | null;
      throw new ApiError(res.status, json?.error?.code ?? 'http', json?.error?.message ?? { key: 'server.errors.internal' });
    }
    return res;
  }

  /** Chat 08.2: envia uma imagem para o board; devolve a referência `asset:<sha256>`. */
  async uploadAsset(boardId: string, file: Blob): Promise<{ ref: string; hash: string }> {
    const res = await this.binary('POST', `/boards/${encodeURIComponent(boardId)}/assets`, boardId, file);
    return (await res.json()) as { ref: string; hash: string };
  }

  /**
   * Chat 09 · R2 (pendência 6): "Baixar para o board" — o SERVIDOR busca a imagem do endereço (guarda de SSRF, DNS
   * fixado, redirecionamento revalidado, ≤ 12 MB, tipo pelos bytes) e devolve os bytes. Exige poder editar o board.
   */
  async fetchRemoteImage(boardId: string, url: string): Promise<Blob> {
    const res = await this.binary('POST', `/boards/${encodeURIComponent(boardId)}/assets/fetch`, boardId, new Blob([url], { type: 'text/plain' }));
    return res.blob();
  }

  /** Chat 08.2: bytes de uma imagem (autorizados pelo board). */
  async assetBlob(hash: string, boardId: string): Promise<Blob> {
    const res = await this.binary('GET', `/assets/${hash}`, boardId);
    return res.blob();
  }

  /** Chat 08.2: prova de acesso — vincula a este board imagens que a pessoa já vê noutro board. */
  linkAssets = (boardId: string, hashes: string[]) =>
    this.request<{ linked: string[]; missing: string[] }>('POST', `/boards/${encodeURIComponent(boardId)}/assets/link${this.visitorTokens.has(boardId) ? '?as=visitor' : ''}`, {
      body: { hashes },
      ...(this.visitorTokens.has(boardId) ? { auth: { visitorBoardId: boardId } } : {}),
    });

  /**
   * Token para abrir o WebSocket do tempo real (Chat 08): o de membro, renovado se faltar menos de 30 s para vencer,
   * ou o de visitante daquele board.
   */
  async socketToken(boardId: string, visitor: boolean): Promise<string | null> {
    if (visitor) return this.visitorTokens.get(boardId) ?? null;
    const expiresSoon = (): boolean => {
      if (!this.accessToken) return true;
      try {
        const payload = JSON.parse(atob(this.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
        return typeof payload.exp === "number" && payload.exp * 1000 - Date.now() < 30_000;
      } catch {
        return false;
      }
    };
    if (expiresSoon()) await this.refresh();
    return this.accessToken;
  }

  /** Renova a sessão pelo cookie (uma vez por vez, inclusive entre abas). */
  refresh(): Promise<AuthResult | null> {
    if (!this.refreshing) {
      const run = async (): Promise<AuthResult | null> => {
        try {
          const r = await this.request<AuthResult>('POST', '/auth/refresh', { auth: 'none', retried: true });
          this.accessToken = r.accessToken;
          return r;
        } catch (e) {
          if (e instanceof ApiError && !e.offline) {
            this.accessToken = null;
            this.onSessionLost?.();
          }
          return null;
        }
      };
      const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
      const pending = (locks ? (locks.request('ludraw-refresh', run) as unknown as Promise<AuthResult | null>) : run()).finally(() => {
        this.refreshing = null;
      });
      this.refreshing = pending;
      return pending;
    }
    return this.refreshing;
  }

  /* ---------------- Servidor e sessão ---------------- */
  info = () => this.request<ServerInfo>('GET', '/info', { auth: 'none', timeoutMs: 8000 });
  login = async (email: string, password: string) => {
    const r = await this.request<AuthResult>('POST', '/auth/login', { auth: 'none', body: { email, password } });
    this.accessToken = r.accessToken;
    return r;
  };
  logout = async () => {
    try {
      await this.request<void>('POST', '/auth/logout', { auth: 'none' });
    } finally {
      this.accessToken = null;
    }
  };
  logoutAll = () => this.request<void>('POST', '/auth/logout-all');
  me = () => this.request<{ user: SessionUser }>('GET', '/auth/me');
  changePassword = (currentPassword: string, newPassword: string) =>
    this.request<{ user: SessionUser; sessionsEnded: number }>('POST', '/auth/change-password', { body: { currentPassword, newPassword } });
  ssoStartUrl = (returnTo: string) => `${this.base}/auth/oidc/start?redirect=${encodeURIComponent(returnTo)}`;

  /* ---------------- Chat 08.5: e-mail (recuperar senha, confirmar e-mail) ---------------- */
  /** Resposta sempre igual (202), exista ou não a conta. */
  forgotPassword = (email: string, lang: MailLang) => this.request<{ ok: true }>('POST', '/auth/password/forgot', { auth: 'none', body: { email, lang } });
  checkResetToken = (token: string) => this.request<{ valid: boolean }>('GET', `/auth/password/reset/${encodeURIComponent(token)}`, { auth: 'none' });
  resetPassword = (token: string, password: string) => this.request<{ ok: true }>('POST', '/auth/password/reset', { auth: 'none', body: { token, password } });
  sendVerifyEmail = (lang: MailLang) => this.request<{ ok: true; already?: boolean }>('POST', '/auth/email/verify/send', { body: { lang } });
  verifyEmail = (token: string) => this.request<{ ok: true }>('POST', '/auth/email/verify', { auth: 'none', body: { token } });
  sendTestMail = (lang: MailLang) => this.request<{ ok: true }>('POST', '/admin/mail/test', { body: { lang } });
  /** Chat 08.5 · B2: e-mail pelo painel (a senha nunca volta) */
  mailSettings = () => this.request<MailSettingsView>('GET', '/admin/mail/settings');
  saveMailSettings = (input: MailSettingsInput) => this.request<MailSettingsView>('PUT', '/admin/mail/settings', { body: input });

  /* ---------------- Primeiro acesso ---------------- */
  setupStatus = () => this.request<{ required: true; tokenIssued: boolean }>('GET', '/setup/status', { auth: 'none' });
  setupVerify = (token: string) => this.request<{ ok: true }>('POST', '/setup/verify-token', { auth: 'none', body: { token } });
  setupComplete = async (body: SetupCompleteRequest) => {
    const r = await this.request<AuthResult>('POST', '/setup/complete', { auth: 'none', body });
    this.accessToken = r.accessToken;
    return r;
  };

  /* ---------------- Workspace ---------------- */
  workspaceState = () => this.request<WorkspaceState>('GET', '/workspace/state');
  /** Chat 08.5 · B: `lang` = idioma do e-mail do convite (criar convite, aprovar pedido) */
  workspaceOp = (op: WorkspaceOp, password?: string | null, lang?: MailLang) =>
    this.request<WorkspaceOpResult>('POST', '/workspace/ops', { body: { op, ...(password === undefined ? {} : { password }), ...(lang ? { lang } : {}) } });

  /* ---------------- Chat 08.5 · B: convite por e-mail, link geral e pedidos de acesso ---------------- */
  resendInvitation = (id: string, lang: MailLang) => this.request<{ ok: true }>('POST', `/invitations/${encodeURIComponent(id)}/resend`, { body: { lang } });
  joinPreview = (token: string) => this.request<JoinLinkPreview>('GET', `/join/${encodeURIComponent(token)}`, { auth: 'none' });
  joinLink = (token: string, body: JoinRequest) => this.request<JoinResponse>('POST', `/join/${encodeURIComponent(token)}`, { auth: 'none', body });
  signupPreview = (token: string) => this.request<SignupPreview>('GET', `/signup/${encodeURIComponent(token)}`, { auth: 'none' });
  signupComplete = async (token: string, body: SignupFinishRequest) => {
    const r = await this.request<AuthResult>('POST', `/signup/${encodeURIComponent(token)}/complete`, { auth: 'none', body });
    this.accessToken = r.accessToken;
    return r;
  };
  requestAccess = (body: AccessRequestInput) => this.request<{ ok: true }>('POST', '/access-requests', { auth: 'none', body });
  confirmAccessRequest = (token: string) => this.request<{ ok: true }>('POST', '/access-requests/confirm', { auth: 'none', body: { token } });
  /** Chat 08.5 · C: cadastro com o e-mail da organização (resposta sempre a mesma) e estado para a administração */
  requestSignup = (body: DomainSignupRequest) => this.request<{ ok: true }>('POST', '/signup', { auth: 'none', body });
  signupStatus = () => this.request<DomainSignupStatus>('GET', '/admin/signup/status');

  /* ---------------- Boards ---------------- */
  createBoard = (body: CreateBoardRequest) => this.request<{ board: unknown; revision: number }>('POST', '/boards', { body, timeoutMs: 60_000 });
  patchBoard = (id: string, body: BoardMetaPatch) => this.request<{ ok: true }>('PATCH', `/boards/${encodeURIComponent(id)}`, { body });
  deleteBoard = (id: string) => this.request<{ ok: true }>('DELETE', `/boards/${encodeURIComponent(id)}`);
  boardData = (id: string, visitor = false) =>
    this.request<BoardDataEnvelope>('GET', visitor ? `/public/boards/${encodeURIComponent(id)}/data` : `/boards/${encodeURIComponent(id)}/data`, {
      auth: visitor ? { visitorBoardId: id } : 'user',
      timeoutMs: 60_000,
    });
  saveBoardData = (id: string, data: BoardData, revision: number, visitor = false) =>
    this.request<{ revision: number }>('PUT', visitor ? `/public/boards/${encodeURIComponent(id)}/data` : `/boards/${encodeURIComponent(id)}/data`, {
      auth: visitor ? { visitorBoardId: id } : 'user',
      body: data,
      headers: { 'if-match': `"${revision}"` },
      timeoutMs: 60_000,
    });
  /** Só a revisão atual (vigia do board aberto). */
  boardRevision = (id: string, visitor = false) =>
    this.request<{ revision: number }>('GET', visitor ? `/public/boards/${encodeURIComponent(id)}/revision` : `/boards/${encodeURIComponent(id)}/revision`, {
      auth: visitor ? { visitorBoardId: id } : 'user',
      timeoutMs: 8000,
    });
  snapshots = (id: string) => this.request<{ snapshots: BoardSnapshot[] }>('GET', `/boards/${encodeURIComponent(id)}/snapshots`, { timeoutMs: 60_000 });
  createSnapshot = (id: string, body: CreateSnapshotRequest) => this.request<{ snapshot: BoardSnapshot | null }>('POST', `/boards/${encodeURIComponent(id)}/snapshots`, { body });
  deleteSnapshot = (id: string, sid: string) => this.request<{ ok: true }>('DELETE', `/boards/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(sid)}`);
  restoreSnapshot = (id: string, sid: string) => this.request<{ revision: number }>('POST', `/boards/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(sid)}/restore`);

  /* ---------------- Modelos ---------------- */
  createTemplate = (body: { name: string; description?: string; scope: 'personal' | 'team' | 'workspace'; teamId?: string; thumbnail?: string; data: BoardData }) =>
    this.request<{ template: unknown }>('POST', '/templates', { body, timeoutMs: 60_000 });
  renameTemplate = (id: string, name: string) => this.request<{ ok: true }>('PATCH', `/templates/${encodeURIComponent(id)}`, { body: { name } });
  deleteTemplate = (id: string) => this.request<{ ok: true }>('DELETE', `/templates/${encodeURIComponent(id)}`);

  /* ---------------- Convites e links públicos ---------------- */
  invitationPreview = (token: string) => this.request<InvitationPreview>('GET', `/invitations/${encodeURIComponent(token)}`, { auth: 'none' });
  acceptInvitation = async (token: string, body: AcceptInvitationRequest) => {
    const r = await this.request<AuthResult>('POST', `/invitations/${encodeURIComponent(token)}/accept`, { auth: 'none', body });
    this.accessToken = r.accessToken;
    return r;
  };
  resolvePublicLink = (token: string) => this.request<PublicLinkResolution>('GET', `/public/links/${encodeURIComponent(token)}`, { auth: 'none' });
  openPublicLink = async (token: string, password?: string) => {
    const s = await this.request<PublicLinkSession>('POST', `/public/links/${encodeURIComponent(token)}/session`, { auth: 'none', body: password === undefined ? {} : { password } });
    this.visitorTokens.set(s.boardId, s.visitorToken);
    return s;
  };
}

/** Cliente para outro endereço (teste de conexão antes de conectar). */
export function probeServer(url: string): ApiClient {
  return new ApiClient(apiBase(url));
}

/** Cliente do servidor conectado (só existe no Modo Servidor). */
export const api: ApiClient | null = connection.mode === 'server' ? new ApiClient(apiBase()) : null;

/** Texto traduzido de qualquer erro (ApiError ou inesperado). */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.text();
  return translateStored({ key: 'server.errors.internal' });
}
