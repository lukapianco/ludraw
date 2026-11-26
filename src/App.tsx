import { useEffect, type ReactNode } from 'react';
import { useAppStore } from './store/useAppStore';
import { parseHash, routeToHash } from './utils/router';
import { LoginView } from './components/auth/LoginView';
import { DashboardView } from './components/dashboard/DashboardView';
import { BoardView } from './components/board/BoardView';
import { DesignSystemView } from './components/design-system/DesignSystemView';
import { SettingsView } from './components/settings/SettingsView';
import { DevFeatureDialog } from './components/ui/DevFeatureDialog';
import { Toaster } from './components/ui/Toaster';
import { AppModals } from './components/modals/AppModals';
import { SplashScreen } from './components/splash/SplashScreen';
import { useSplashGate } from './components/splash/useSplashGate';
import { useLocale } from './i18n/useT';
import { AdminView } from './components/admin/AdminView';
import { PublicLinkGate } from './components/board/PublicLinkGate';
import { explainWorkspaceAction } from './store/workspaceSlice';
import { AccessSuspended } from './components/auth/AccessSuspended';
import { membershipOf } from './utils/workspace';
import { SetupView } from './components/setup/SetupView';
import { SsoReturn } from './components/auth/SsoReturn';
import { MustChangePassword } from './components/auth/ChangePasswordForm';
import { isServerMode } from './utils/serverConfig';
import { useDesignSystemGate } from './hooks/useDesignSystemGate';
import { ForgotPasswordView, ResetPasswordView, VerifyEmailView } from './components/auth/EmailAccessViews';
import { captureTokenFromHash } from './utils/tokenLink';
import { AccessConfirmView, JoinView, RequestAccessView, SignupCompleteView, SignupRequestView } from './components/auth/AccessViews';

/**
 * Raiz da aplicação: sincroniza a rota com o hash da URL, aplica tema/acessibilidade
 * no <html> e protege as telas que exigem perfil (login local ou convidado).
 */
export default function App() {
  const route = useAppStore((s) => s.route);
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const reduceMotion = useAppStore((s) => s.preferences.reduceMotion);
  // emenda v1.1 §10: participação suspensa/removida → nenhum dado, só "acesso suspenso"
  // Chat 07: Modo Servidor — assistente de primeiro acesso e troca de senha obrigatória
  const setupRequired = useAppStore((s) => !!s.serverInfo?.setupRequired);
  const mustChangePassword = useAppStore((s) => !!s.serverAuth?.mustChangePassword);
  const myStatus = useAppStore((s) => (s.user ? membershipOf(s.directory.find((a) => a.id === s.user!.id), s.workspace.id)?.status ?? null : null));
  // Chat 09 · R5: "Sistema visual" desligado pela instalação → #/design-system vira a tela inicial
  const designSystem = useDesignSystemGate();
  // Chat 05.6: assina o idioma — ao trocar, as telas abaixo são redesenhadas sem recarregar
  useLocale();

  // Splash: só na abertura do app (não a cada troca de rota) e nunca no modo embed
  const splash = useSplashGate({ enabled: !(route.name === 'board' && route.embed) });

  // Hash → rota
  useEffect(() => {
    // Chat 08.5: link com token colado nesta aba → o token sai do endereço antes de virar rota
    const sync = () => {
      captureTokenFromHash();
      useAppStore.getState().setRouteFromHash(parseHash(window.location.hash));
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Rota → hash
  useEffect(() => {
    const target = routeToHash(route);
    if (window.location.hash !== target && !(target === '#/' && (window.location.hash === '' || window.location.hash === '#'))) {
      window.location.hash = target;
    }
  }, [route]);

  // Tema
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('od-reduce-motion', reduceMotion);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#16161A' : '#194B32');
  }, [theme, reduceMotion]);

  // Guarda de rotas (Chat 06: link público e convite abrem sem conta)
  const isEmbed = route.name === 'board' && route.embed;
  const isPublicLink = route.name === 'board' && !!route.share;
  // Chat 07: primeiro acesso do servidor e volta do SSO também abrem sem conta
  // Chat 08.5: telas ligadas ao e-mail (esqueci a senha, nova senha, confirmar e-mail) também abrem sem conta
  const noAccountRoute = ['forgot', 'reset', 'verify', 'join', 'signup', 'access', 'request-access', 'register'].includes(route.name);
  const openDesignSystem = route.name === 'design-system' && designSystem !== 'off';
  const needsUser = route.name !== 'login' && !openDesignSystem && route.name !== 'invite' && route.name !== 'setup' && route.name !== 'sso' && !noAccountRoute && !isEmbed && !isPublicLink;
  useEffect(() => {
    if (route.name === 'design-system' && designSystem === 'off') useAppStore.getState().navigate({ name: 'dashboard' });
  }, [route.name, designSystem]);
  useEffect(() => {
    // Chat 09 · R3: servidor com o primeiro acesso pendente → o assistente, e não a entrada. No build de produção o
    // /info chega antes do App montar, e a leitura inicial do endereço levava para #/login (corrida do boot).
    if (setupRequired && !user && isServerMode() && (route.name === 'login' || needsUser)) {
      useAppStore.getState().navigate({ name: 'setup' });
      return;
    }
    if (needsUser && !user) useAppStore.getState().navigate({ name: 'login' });
    if ((route.name === 'login' || (route.name === 'setup' && !setupRequired)) && user) useAppStore.getState().navigate({ name: 'dashboard' });
  }, [needsUser, user, route.name, setupRequired]);

  // Chat 06: membros e convites saíram de Configurações (#/settings é só pessoal)
  useEffect(() => {
    if (route.name !== 'settings' || route.tab !== 'users') return;
    const app = useAppStore.getState();
    app.navigate(explainWorkspaceAction(app, 'workspace.admin.view').allowed ? { name: 'admin', section: 'members' } : { name: 'settings', tab: 'profile' });
  }, [route]);

  // Chat 06: a sessão de visitante vale só enquanto a rota for o link público daquele board
  const shareBoard = route.name === 'board' && route.share ? route.id : null;
  useEffect(() => {
    const ls = useAppStore.getState().linkSession;
    if (ls && ls.boardId !== shareBoard) useAppStore.getState().clearLinkSession();
  }, [shareBoard]);

  let screen: ReactNode = null;
  if (route.name === 'design-system' && designSystem === 'on') screen = <DesignSystemView />;
  // Modo Servidor ainda sem o /info: não mostra a tela nem redireciona antes da resposta
  else if (route.name === 'design-system' && designSystem === 'pending') screen = null;
  else if (route.name === 'setup') screen = isServerMode() && setupRequired ? <SetupView /> : <LoginView />;
  else if (route.name === 'sso') screen = <SsoReturn error={route.error} />;
  // Chat 08.5: só existem no Modo Servidor (sem servidor, voltam para a entrada)
  else if (route.name === 'forgot') screen = isServerMode() ? <ForgotPasswordView /> : <LoginView />;
  else if (route.name === 'reset') screen = isServerMode() ? <ResetPasswordView /> : <LoginView />;
  else if (route.name === 'verify') screen = isServerMode() ? <VerifyEmailView /> : <LoginView />;
  // Chat 08.5 · B: link de convite geral, concluir cadastro, pedir acesso e confirmar o pedido
  else if (route.name === 'join') screen = isServerMode() ? <JoinView /> : <LoginView />;
  else if (route.name === 'signup') screen = isServerMode() ? <SignupCompleteView /> : <LoginView />;
  else if (route.name === 'request-access') screen = isServerMode() ? <RequestAccessView /> : <LoginView />;
  else if (route.name === 'register') screen = isServerMode() ? <SignupRequestView /> : <LoginView />;
  else if (route.name === 'access') screen = isServerMode() ? <AccessConfirmView /> : <LoginView />;
  else if (isServerMode() && user && mustChangePassword && !isPublicLink) screen = <MustChangePassword />;
  else if (route.name === 'invite') screen = <LoginView inviteToken={route.token} />;
  else if (user && myStatus && myStatus !== 'active' && !isPublicLink) screen = <AccessSuspended status={myStatus} />;
  else if (route.name === 'login' || (needsUser && !user)) screen = <LoginView />;
  else if (route.name === 'settings') screen = <SettingsView tab={route.tab === 'notifications' || route.tab === 'extensions' ? route.tab : 'profile'} from={route.from} />;
  else if (route.name === 'admin') screen = <AdminView section={route.section ?? 'overview'} />;
  else if (route.name === 'board' && route.share && !route.embed) screen = <PublicLinkGate key={`${route.id}:${route.share}`} id={route.id} token={route.share} />;
  else if (route.name === 'board') screen = <BoardView key={route.id} id={route.id} focus={route.focus} embed={route.embed} embedView={route.view} embedCam={route.cam} />;
  else screen = <DashboardView section={route.name === 'dashboard' ? (route.section ?? 'home') : 'home'} />;

  return (
    <>
      {screen}
      <DevFeatureDialog />
      <AppModals />
      <Toaster />
      {splash.visible && <SplashScreen ready={splash.ready} force={splash.force} onExited={splash.dismiss} />}
    </>
  );
}
