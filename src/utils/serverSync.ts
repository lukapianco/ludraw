/**
 * LuDraw — Chat 07 · B: o Modo Servidor do lado do cliente.
 *
 * - Boot: confere o servidor (`/info`), manda para `#/setup` se o primeiro acesso está pendente, renova a sessão
 *   pelo cookie e traz o estado da organização (`/workspace/state`) para o `useAppStore`.
 * - Ações do Workspace: o slice aplica na hora (mesmas regras) e esta camada envia a operação ao servidor numa
 *   fila; o servidor é quem decide — recusa vira aviso e o estado oficial volta.
 * - Boards, modelos e lixeira: chamadas diretas à API (o conteúdo vai pelo `ApiBoardRepository`).
 * - Sair: encerra a sessão no servidor e APAGA a cópia de trabalho deste navegador.
 * Só é usado quando `isServerMode()`; o Modo Local não passa por aqui.
 */
import { getLocale, t } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { setServerBridge, type ActionResult, type ServerBridge } from '../store/workspaceSlice';
import type { BoardMeta, TemplateEntity } from '../types/workspace';
import { api, ApiError, errorText } from './api';
import { API_VERSION, type AuthResult } from './apiContract';
import { serverBoardRepository } from './boardRepository';
import { colorFromString } from './color';
import { connection, isServerMode } from './serverConfig';
import type { Place } from './workspace';
import type { WorkspaceOp } from './workspaceRules';

const ok = (id?: string): ActionResult => (id ? { ok: true, id } : { ok: true });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const toast = (...args: Parameters<ReturnType<typeof useAppStore.getState>['toast']>) => useAppStore.getState().toast(...args);

/* ------------------------------ Sessão ------------------------------ */

/** Entrou (login, convite, setup, SSO): guarda a pessoa e traz o estado da organização. */
export async function applyAuth(r: AuthResult): Promise<void> {
  const u = r.user;
  useAppStore.getState().applyServerAuth({ id: u.id, name: u.name, email: u.email, guest: false, color: u.avatarColor || colorFromString(u.name) }, { mustChangePassword: u.mustChangePassword, authProvider: u.authProvider, emailVerified: u.emailVerified });
  // Chat 08.7 · R4 (S-29): nova sessão neste servidor — a limpeza adiada não pode apagar a cópia dela depois
  void import('./serverWipe').then(async (m) => m.forgetPendingWipe((await import('./serverConfig')).serverKey()));
  void import('./tokenLink').then((m) => m.clearInviteToken());
  if (!u.mustChangePassword) await hydrateFromServer();
}

/** Traz o estado oficial da organização (ou mantém a cópia, sem rede). */
export async function hydrateFromServer(): Promise<boolean> {
  if (!api || !useAppStore.getState().user) return false;
  try {
    const state = await api.workspaceState();
    useAppStore.getState().applyServerState(state);
    useAppStore.getState().ensureStarterBoard();
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.offline) useAppStore.setState({ serverReachable: false });
    return false;
  }
}

/** A sessão acabou de vez (refresh recusado): volta para a entrada sem apagar nada do servidor. */
/**
 * Primeiro acesso em andamento — ou (Chat 08.5) uma das telas que existem SEM conta (esqueci a senha, criar
 * nova senha, confirmar e-mail): não há sessão para renovar nem perder, então trocar de aba não pode jogar
 * a pessoa para `#/login`.
 */
const NO_ACCOUNT_ROUTES: ReadonlySet<string> = new Set(['setup', 'forgot', 'reset', 'verify', 'join', 'signup', 'access', 'request-access', 'register']);
function inSetup(): boolean {
  const app = useAppStore.getState();
  return NO_ACCOUNT_ROUTES.has(app.route.name) || !!app.serverInfo?.setupRequired;
}

function sessionLost(): void {
  const app = useAppStore.getState();
  // no primeiro acesso uma recusa de sessão (ex.: usuário antigo guardado neste navegador) não pode tirar a pessoa do #/setup
  if (!app.user || inSetup()) return;
  app.clearServerSession();
  toast(t('server.client.sessionEnded'), 'neutral');
}

export async function serverLogin(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!api) return fail(t('server.client.offline'));
  try {
    await applyAuth(await api.login(email.trim().toLowerCase(), password));
    return { ok: true };
  } catch (e) {
    return fail(errorText(e));
  }
}

export interface LogoutOptions {
  everywhere?: boolean;
  keepRoute?: boolean;
  /** Chat 08.7 · R4: a pessoa já decidiu na janela de "mudanças não enviadas" */
  force?: boolean;
}

/** Chat 08.7 · R4 (S-29): há algo deste navegador que o servidor ainda não recebeu? */
export async function hasUnsyncedWork(): Promise<boolean> {
  const { currentCollab } = await import('../collab/session');
  return pending > 0 || !!serverBoardRepository?.hasUnsynced() || !!currentCollab()?.unsynced();
}

/** "Baixar e sair": o board aberto (com as imagens embutidas) e os conteúdos ainda na fila, como JSON de board. */
export async function downloadUnsyncedWork(): Promise<number> {
  const { inlineAssetImages } = await import('../collab/assets');
  const { currentCollab } = await import('../collab/session');
  const files: Array<{ name: string; data: unknown }> = [];
  const nameOf = (id: string) => useAppStore.getState().boards.find((b) => b.id === id)?.name ?? 'board';
  const open = useBoardStore.getState();
  const live = currentCollab();
  if (live?.unsynced() && open.boardId === live.boardId) files.push({ name: nameOf(live.boardId), data: await inlineAssetImages(open.serialize(), live.boardId).catch(() => open.serialize()) });
  for (const b of serverBoardRepository?.unsyncedBoards() ?? []) {
    if (files.some((f) => f.name === nameOf(b.id))) continue;
    files.push({ name: nameOf(b.id), data: await inlineAssetImages(b.data, b.id).catch(() => b.data) });
  }
  const { downloadBlob } = await import('./export');
  for (const f of files) downloadBlob(new Blob([JSON.stringify(f.data)], { type: 'application/json' }), `${f.name}-${t('server.logout.unsentSuffix')}.json`);
  return files.length;
}

/**
 * Chat 08.7 · R4 (S-29): desliga tudo o que grava a cópia deste servidor e apaga só o que é dele (estado da
 * organização, tokens de link público, diretório, Audit Log, cópia de trabalho, documentos ao vivo, extensões do Modo
 * Servidor). O Modo Local fica intacto. Banco preso por outra aba → limpeza refeita no próximo carregamento.
 */
export async function wipeThisServer(): Promise<'done' | 'deferred'> {
  const { serverKey } = await import('./serverConfig');
  const { suspendPersistence } = await import('../store/useAppStore');
  const { wipeServerCopy, signalLogout } = await import('./serverWipe');
  const { clearShareTokens } = await import('./tokenLink');
  const { stopAllRuntimes } = await import('../extensions/runtime');
  const { currentCollab } = await import('../collab/session');
  const key = serverKey();
  // 1) para o que pode gravar: sessão ao vivo (y-indexeddb), extensões, envios e o estado persistido
  currentCollab()?.stop();
  stopAllRuntimes();
  serverBoardRepository?.shutdown();
  suspendPersistence();
  useAppStore.getState().clearServerSession();
  clearShareTokens();
  // 2) apaga a cópia do servidor (só as preferências de tela continuam) e avisa as outras abas
  const result = await wipeServerCopy(key);
  signalLogout(key);
  return result;
}

/** Sair: encerra a sessão, apaga a cópia de trabalho deste navegador e recarrega na tela de entrada. */
export async function serverLogout(options: LogoutOptions = {}): Promise<void> {
  // Chat 08.7 · R4: mudanças que ainda não chegaram ao servidor → pergunta antes (baixar e sair, sair, cancelar)
  if (!options.force && (await hasUnsyncedWork())) {
    useAppStore.getState().openModal({ type: 'logout-unsynced', everywhere: !!options.everywhere, keepRoute: !!options.keepRoute });
    return;
  }
  try {
    if (options.everywhere) await api?.logoutAll();
    await api?.logout();
  } catch {
    /* sem rede: a cópia sai mesmo assim; o cookie vence sozinho */
  }
  await wipeThisServer();
  if (typeof location !== 'undefined') {
    if (!options.keepRoute) location.hash = '#/login';
    location.reload();
  }
}

/**
 * Chat 08.7 · R4 (S-29): outra aba deste navegador saiu deste servidor → esta também sai (sem chamar a API de novo),
 * fecha os bancos (para a outra conseguir apagá-los) e volta à entrada.
 */
export function watchLogoutFromOtherTabs(): () => void {
  if (typeof window === 'undefined' || !isServerMode()) return () => undefined;
  const onStorage = (e: StorageEvent) => {
    void (async () => {
      const { serverKey } = await import('./serverConfig');
      const { LOGOUT_SIGNAL_PREFIX } = await import('./serverWipe');
      if (e.key !== `${LOGOUT_SIGNAL_PREFIX}${serverKey()}` || !e.newValue) return;
      window.removeEventListener('storage', onStorage);
      const route = useAppStore.getState().route;
      const visitorLink = route.name === 'board' && !!route.share;
      await wipeThisServer();
      // visitante por link público continua no link; quem tinha conta volta à entrada
      if (!visitorLink) location.hash = '#/login';
      location.reload();
    })();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  if (!api) return fail(t('server.client.offline'));
  try {
    await api.changePassword(currentPassword, newPassword);
    useAppStore.setState((s) => ({ serverAuth: s.serverAuth ? { ...s.serverAuth, mustChangePassword: false } : s.serverAuth }));
    await hydrateFromServer();
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}

/* ------------------------------ Operações do Workspace (fila) ------------------------------ */

let chain: Promise<void> = Promise.resolve();
let pending = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  pending++;
  const run = chain.then(task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run.finally(() => {
    pending--;
  });
}

function sendOp(op: WorkspaceOp): void {
  if (!api) return;
  const client = api;
  void enqueue(async () => {
    try {
      const r = await client.workspaceOp(op, undefined, getLocale() === 'en' ? 'en' : 'pt-BR');
      // estado oficial só quando a fila esvazia (senão uma resposta antiga desfaria a próxima ação otimista)
      if (pending === 1) useAppStore.getState().applyServerState(r.state);
      // Chat 08.5 · B: o convite foi criado, mas o servidor de e-mail recusou o envio (o link continua copiável)
      if (r.emailed === false) toast(t('server.client.inviteMailFailed'), 'danger');
    } catch (e) {
      toast(e instanceof ApiError && e.offline ? t('server.client.offline') : t('server.client.rejectedSync', { reason: errorText(e) }), 'danger');
      await hydrateFromServer();
    }
  });
}

const bridge: ServerBridge = {
  sendOp,

  setPublicLink: (boardId, patch, password, token) =>
    enqueue(async () => {
      if (!api) return fail(t('server.client.offline'));
      const meta = useAppStore.getState().boards.find((b) => b.id === boardId);
      const op: WorkspaceOp = { type: 'setPublicLink', boardId, patch, ...(meta?.publicLink?.token ? {} : { token }) };
      try {
        const r = await api.workspaceOp(op, password);
        useAppStore.getState().applyServerState(r.state);
        return ok(boardId);
      } catch (e) {
        return fail(errorText(e));
      }
    }),

  openPublicLink: async (boardId, token, password) => {
    if (!api) return { status: 'invalid' };
    let res;
    try {
      res = await api.resolvePublicLink(token);
    } catch {
      return { status: 'invalid' };
    }
    if (res.status !== 'ok' && res.status !== 'password') return { status: res.status };
    if (res.boardId !== boardId) return { status: 'invalid' };
    if (res.status === 'password' && password === undefined) return { status: 'password' };
    try {
      const session = await api.openPublicLink(token, password);
      useAppStore.getState().openServerLink(
        {
          id: boardId,
          name: res.boardName ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastOpenedAt: Date.now(),
          favorite: false,
          ownerName: '',
          ownerId: '',
          team: '',
          space: '',
          color: '#194B32',
          template: 'blank',
          transient: true,
          publicLink: { enabled: true, token, accessLevel: session.accessLevel, ...(session.allowDownload !== undefined ? { allowDownload: session.allowDownload } : {}) },
        },
        { boardId, token, accessLevel: session.accessLevel, allowDownload: session.allowDownload, policies: session.policies },
      );
      return { status: 'ok' };
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) toast(e.text(), 'danger');
      if (e instanceof ApiError && (e.code === 'linkWrongPassword' || e.status === 429)) return { status: 'password', wrongPassword: true };
      return { status: 'invalid' };
    }
  },

  acceptInvitation: async (token, { name, email, password }) => {
    if (!api) return fail(t('server.client.offline'));
    try {
      const r = await api.acceptInvitation(token, { name, email, password });
      await applyAuth(r);
      if (r.user.role === 'guest_b2b') useAppStore.setState({ currentPlace: { kind: 'shared' } });
      return ok(r.user.id);
    } catch (e) {
      return fail(errorText(e));
    }
  },
};

/* ------------------------------ Boards e modelos ------------------------------ */

export function serverCreateBoard(meta: BoardMeta, place: Place, data: Parameters<NonNullable<typeof serverBoardRepository>['registerNewBoard']>[0]['data']): void {
  if (!serverBoardRepository) return;
  void serverBoardRepository.registerNewBoard({ id: meta.id, name: meta.name, place, color: meta.color, template: meta.template, data }).then((created) => {
    if (created) return;
    // o servidor recusou ou não respondeu: o board otimista sai daqui (o servidor manda o estado oficial)
    useAppStore.setState((s) => ({ boards: s.boards.filter((b) => b.id !== meta.id) }));
    if (useAppStore.getState().route.name === 'board') useAppStore.getState().navigate({ name: 'dashboard' });
    void hydrateFromServer();
  });
}

export function serverPatchBoard(id: string, patch: { name?: string; favorite?: boolean; lastOpenedAt?: number; thumbnail?: string | null }): void {
  if (!api || useAppStore.getState().boards.find((b) => b.id === id)?.transient) return;
  api.patchBoard(id, patch).catch((e: unknown) => {
    if (e instanceof ApiError && e.offline) return;
    if (patch.name !== undefined) {
      toast(t('server.client.rejectedSync', { reason: errorText(e) }), 'danger');
      void hydrateFromServer();
    }
  });
}

export function serverDeleteBoard(id: string): void {
  api?.deleteBoard(id).catch((e: unknown) => {
    toast(t('server.client.rejectedSync', { reason: errorText(e) }), 'danger');
    void hydrateFromServer();
  });
}

export function serverSaveTemplate(tpl: TemplateEntity): void {
  if (!api) return;
  const scope = tpl.scope === 'system' ? 'personal' : tpl.scope;
  api
    .createTemplate({ name: tpl.name, description: tpl.description, scope, teamId: tpl.teamId, thumbnail: tpl.thumbnail, data: tpl.data })
    .then(() => hydrateFromServer())
    .catch((e: unknown) => {
      toast(t('server.client.rejectedSync', { reason: errorText(e) }), 'danger');
      void hydrateFromServer();
    });
}

export function serverRenameTemplate(id: string, name: string): void {
  api?.renameTemplate(id, name).catch((e: unknown) => {
    toast(t('server.client.rejectedSync', { reason: errorText(e) }), 'danger');
    void hydrateFromServer();
  });
}

export function serverDeleteTemplate(id: string): void {
  api?.deleteTemplate(id).catch((e: unknown) => {
    toast(t('server.client.rejectedSync', { reason: errorText(e) }), 'danger');
    void hydrateFromServer();
  });
}

/** Recarrega do servidor o board aberto (depois de um conflito ou de restaurar uma versão). */
export async function reloadOpenBoard(id: string): Promise<boolean> {
  if (!serverBoardRepository) return false;
  serverBoardRepository.resetRevision(id);
  const data = await serverBoardRepository.loadBoard(id);
  if (!data || useBoardStore.getState().boardId !== id) return false;
  const camera = useBoardStore.getState().camera;
  useBoardStore.getState().loadBoard(id, data);
  useBoardStore.getState().setCamera(camera);
  return true;
}

/* ------------------------------ Boot ------------------------------ */

let started = false;

/** Liga o Modo Servidor (chamado no `main.tsx` quando `isServerMode()`). */
export async function startServerMode(): Promise<void> {
  if (started || !isServerMode() || !api) return;
  started = true;
  setServerBridge(bridge);
  api.onSessionLost = sessionLost;
  if (serverBoardRepository) {
    serverBoardRepository.onConflict = (id) =>
      toast(t('server.client.conflict'), 'danger', {
        durationMs: 30_000,
        action: {
          label: t('server.client.reload'),
          run: () => {
            void reloadOpenBoard(id).then((done) => done && toast(t('server.client.reloaded'), 'success'));
          },
        },
      });
    serverBoardRepository.onRejected = (_id, e) => toast(t('server.client.rejectedSync', { reason: e.text() }), 'danger', { durationMs: 10_000 });
    // alguém salvou uma versão mais nova do board aberto: avisa na hora (sem esperar a próxima gravação daqui)
    serverBoardRepository.onRemoteChange = (id) =>
      toast(t('server.client.remoteChange'), 'neutral', {
        durationMs: 30_000,
        action: {
          label: t('server.client.reload'),
          run: () => {
            void reloadOpenBoard(id).then((done) => done && toast(t('server.client.reloaded'), 'success'));
          },
        },
      });
    // visitante: link revogado/vencido/trocado → a sessão de visitante acaba e o portão mostra o motivo
    serverBoardRepository.onLinkLost = (id) => {
      api?.setVisitorToken(id, null);
      toast(t('server.client.linkRevoked'), 'danger', { durationMs: 10_000 });
      useAppStore.setState((s) => (s.linkSession?.boardId === id ? { linkSession: null } : {}));
    };
  }

  // sempre atualizado: ao voltar para a aba e a cada minuto
  const refresh = () => {
    if (inSetup()) return;
    if (useAppStore.getState().user && !useAppStore.getState().serverAuth?.mustChangePassword) void hydrateFromServer();
  };
  let last = 0;
  window.addEventListener('focus', () => {
    if (Date.now() - last > 15_000) {
      last = Date.now();
      refresh();
    }
  });
  window.setInterval(refresh, 60_000);

  let info = connection.info;
  try {
    info ??= await api.info();
  } catch {
    useAppStore.setState({ serverReachable: false });
    if (useAppStore.getState().user) toast(t('server.client.offlineKept'), 'neutral', { durationMs: 10_000 });
    return;
  }
  useAppStore.setState({ serverInfo: info, serverReachable: true });
  if (info.apiVersion !== API_VERSION) toast(t('server.connect.incompatible', { version: info.apiVersion }), 'danger', { durationMs: 15_000 });
  if (info.setupRequired) {
    useAppStore.getState().navigate({ name: 'setup' });
    return;
  }
  const route = useAppStore.getState().route;
  // a volta do SSO cuida da própria sessão; o link público só renova se já havia alguém entrado neste navegador
  if (route.name === 'sso' || (route.name === 'board' && route.share && !useAppStore.getState().user)) return;
  // recusa de verdade cai em sessionLost (onSessionLost); sem rede, a cópia de trabalho continua
  const renewed = await api.refresh();
  if (renewed) await applyAuth(renewed);
}
