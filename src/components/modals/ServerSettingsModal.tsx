import { useState } from 'react';
import { CheckCircle2, CircleAlert, HardDrive, LoaderCircle, Lock, LogOut, PlugZap, Server, Unplug } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { useAppStore } from '../../store/useAppStore';
import { api, ApiError, probeServer } from '../../utils/api';
import { API_VERSION, type ServerInfo } from '../../utils/apiContract';
import { clearServerCopy, connection, isServerMode, localModeAllowed, normalizeServerUrl, switchMode } from '../../utils/serverConfig';
import { inDesktopApp, openDesktopChooser } from '../../utils/desktop';
import { serverLogout } from '../../utils/serverSync';

type Probe = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; info: ServerInfo } | { state: 'error'; message: string };

/**
 * Chat 07 · B — Modo Local × Modo Servidor.
 *  - App servido por um servidor (detectado na própria origem ou configurado): o endereço é fixo; o Modo Local
 *    só aparece se o servidor permitir ("Usar só neste navegador").
 *  - Modo Local com o servidor desta instalação disponível: "Voltar para o servidor".
 *  - Sem servidor detectado: testa um endereço (`/info`: versão, organização, SSO, primeiro acesso) e conecta.
 * Trocar de modo recarrega o app; sair do servidor apaga a cópia de trabalho deste navegador.
 * Diferença do padrão de mercado: a escolha mostra o que o servidor oferece ANTES de trocar de modo.
 */
export function ServerSettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const server = isServerMode();
  const user = useAppStore((s) => s.user);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const [url, setUrl] = useState(connection.url);
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  const [busy, setBusy] = useState(false);
  const normalized = normalizeServerUrl(url);
  const orgName = serverInfo?.organizationName ?? connection.available?.info?.organizationName ?? (connection.url || t('server.connect.sameOrigin'));

  const test = async (): Promise<ServerInfo | null> => {
    if (normalized === null) {
      setProbe({ state: 'error', message: t('server.connect.urlInvalid') });
      return null;
    }
    setProbe({ state: 'testing' });
    try {
      const info = await probeServer(normalized).info();
      if (info?.name !== 'ludraw') {
        setProbe({ state: 'error', message: t('server.connect.notLuDraw') });
        return null;
      }
      if (info.apiVersion !== API_VERSION) {
        setProbe({ state: 'error', message: t('server.connect.incompatible', { version: info.apiVersion }) });
        return null;
      }
      setProbe({ state: 'ok', info });
      return info;
    } catch (e) {
      const reason = e instanceof ApiError ? e.text() : t('server.connect.notLuDraw');
      setProbe({ state: 'error', message: t('server.connect.failed', { reason }) });
      return null;
    }
  };

  const connect = async () => {
    const info = probe.state === 'ok' ? probe.info : await test();
    if (!info || normalized === null) return;
    // conectar sempre começa limpo: a cópia de trabalho de uma conexão anterior a este servidor sai
    await clearServerCopy(normalized);
    switchMode({ mode: 'server', url: normalized });
  };

  /** Sai do servidor (sessão encerrada, cópia apagada) e recarrega no Modo Local. */
  const goLocal = async () => {
    setBusy(true);
    try {
      if (user) await api?.logout();
    } catch {
      /* sem rede: a cópia sai mesmo assim */
    }
    // Chat 08.7 · R4 (S-29): mesma limpeza do "Sair" (fecha os bancos, só o que é do servidor, Modo Local intacto)
    const { wipeThisServer } = await import('../../utils/serverSync');
    await wipeThisServer();
    switchMode({ mode: 'local' });
  };

  const modeLine = (
    <div className="flex items-center gap-2 rounded-xl bg-panel-sunken px-3 py-2.5 text-sm text-ink ring-1 ring-line">
      {server ? <Server size={16} className="text-brand-700 dark:text-brand-300" /> : <HardDrive size={16} className="text-ink-muted" />}
      <span>{server ? t('server.connect.modeServer', { url: connection.locked ? orgName : connection.url || t('server.connect.sameOrigin') }) : t('server.connect.modeLocal')}</span>
    </div>
  );

  // ---- Modo Servidor
  if (server) {
    const canLocal = localModeAllowed();
    return (
      <Modal
        open
        onClose={onClose}
        width={520}
        icon={<Server size={18} />}
        title={t('server.connect.title')}
        description={t('server.connect.description')}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-subtle">{t('server.connect.reloadNote')}</span>
            {(canLocal || !connection.locked) && (
              <button type="button" className="od-btn od-btn-secondary" onClick={() => void goLocal()} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Unplug size={16} />} {connection.locked ? t('server.connect.useLocalOnlyHere') : t('server.connect.disconnect')}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {modeLine}
          {connection.locked && (
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <Lock size={15} className="mt-0.5 shrink-0" /> {t('server.connect.locked')}
            </p>
          )}
          <p className="text-sm text-ink-muted">{canLocal ? (connection.locked ? t('server.connect.useLocalHint') : t('server.connect.disconnectHint')) : t('server.connect.localBlocked')}</p>
          {user && (
            <button type="button" className="od-btn od-btn-ghost w-full justify-start text-ink-muted" onClick={() => void serverLogout()}>
              <LogOut size={16} /> {t('dashboard.appHeader.signOut')}
            </button>
          )}
        </div>
      </Modal>
    );
  }

  // ---- Modo Local com o servidor desta instalação disponível
  if (connection.available) {
    return (
      <Modal
        open
        onClose={onClose}
        width={520}
        icon={<Server size={18} />}
        title={t('server.connect.title')}
        description={t('server.connect.description')}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-subtle">{t('server.connect.reloadNote')}</span>
            <button type="button" className="od-btn od-btn-primary" onClick={() => switchMode({ mode: 'server' })}>
              <Server size={16} /> {t('server.connect.backToServer')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {modeLine}
          <p className="text-sm text-ink-muted">{t('server.connect.useServer', { org: orgName })}</p>
        </div>
      </Modal>
    );
  }

  // ---- Programa desktop no Modo Local (Chat 09.1 · R7): quem troca é a tela de escolha, que abre o servidor numa
  // janela própria. Este app embutido nunca fala com a API de um servidor (não há um terceiro caminho de dados).
  if (inDesktopApp()) {
    return (
      <Modal
        open
        onClose={onClose}
        width={520}
        icon={<Server size={18} />}
        title={t('server.connect.title')}
        description={t('desktop.settings.text')}
        footer={
          <button type="button" data-testid="desktop-open-chooser" className="od-btn od-btn-primary" onClick={openDesktopChooser}>
            <Server size={16} /> {t('desktop.settings.open')}
          </button>
        }
      >
        {modeLine}
      </Modal>
    );
  }

  // ---- Modo Local sem servidor detectado: conectar a um endereço
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      icon={<Server size={18} />}
      title={t('server.connect.title')}
      description={t('server.connect.description')}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-subtle">{t('server.connect.reloadNote')}</span>
          <div className="flex gap-2">
            <button type="button" className="od-btn od-btn-ghost" onClick={() => void test()} disabled={probe.state === 'testing'}>
              {probe.state === 'testing' ? <LoaderCircle size={16} className="animate-spin" /> : <PlugZap size={16} />} {probe.state === 'testing' ? t('server.connect.testing') : t('server.connect.test')}
            </button>
            <button type="button" className="od-btn od-btn-primary" onClick={() => void connect()} disabled={probe.state === 'testing'}>
              <Server size={16} /> {t('server.connect.connect')}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {modeLine}
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">{t('server.connect.urlLabel')}</span>
          <input
            className="od-input"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setProbe({ state: 'idle' });
            }}
            placeholder={t('server.connect.urlPlaceholder')}
            inputMode="url"
            autoComplete="url"
            aria-invalid={normalized === null}
            aria-describedby="od-server-url-hint"
          />
          <span id="od-server-url-hint" className="mt-1.5 block text-xs text-ink-subtle">{t('server.connect.urlHint')}</span>
        </label>
        {probe.state === 'ok' && (
          <div className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-ink ring-1 ring-line" role="status">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={16} className="text-brand-700 dark:text-brand-300" />
              {probe.info.organizationName ? t('server.connect.ok', { org: probe.info.organizationName, version: probe.info.version }) : t('server.connect.okNoOrg', { version: probe.info.version })}
            </p>
            {probe.info.sso.enabled && <p className="mt-1 text-ink-muted">{t('server.connect.ssoAvailable', { label: probe.info.sso.label ?? 'SSO' })}</p>}
            {probe.info.setupRequired && <p className="mt-1 text-ink-muted">{t('server.connect.setupPending')}</p>}
          </div>
        )}
        {probe.state === 'error' && (
          <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger" role="alert">
            <CircleAlert size={16} className="mt-0.5 shrink-0" /> {probe.message}
          </div>
        )}
      </div>
    </Modal>
  );
}
