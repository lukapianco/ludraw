import { useEffect, useMemo, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PanelRegistry, useRegistry } from '../../extensions/registries';
import { ExtensionConnection } from '../../extensions/host/connection';
import { createPanelApi, isolatedDocUrl, panelDocMessage, panelDocument } from '../../extensions/runtime';
import { useExtensionRuntimeStore } from '../../store/useExtensionRuntimeStore';
import { useT } from '../../i18n/useT';
import { cn } from '../../utils/cn';

/**
 * Chat 06.5 · B — painel de extensão (`EXTENSIONS_SPEC.md` §5.1 e §5.11).
 *
 * `<iframe sandbox="allow-scripts">` SEM `allow-same-origin`/`allow-forms`/`allow-popups`/`allow-modals`/
 * `allow-top-navigation`, com `allow=""`, `referrerpolicy="no-referrer"`, atributo `csp` e CSP no próprio
 * documento: origem opaca, sem acesso ao app, ao `localStorage`/IndexedDB nem à rede. O documento leva
 * o preâmbulo selado antes do HTML da extensão. Só mensagens vindas DESTE `contentWindow` são aceitas,
 * validadas pela mesma conexão RPC do Worker (tamanho, taxa, allowlist de métodos).
 *
 * Chat 08.7 · R4 (S-28): o iframe deste componente é um INTERMEDIÁRIO fixo do host (`host/isolation.ts`), também
 * `sandbox="allow-scripts"` e com `PANEL_CSP`; o painel da extensão roda dentro dele. A navegação do painel
 * (`location`, link, `meta refresh`) é conferida pelo `frame-src 'none'` do intermediário e não sai do computador. O
 * intermediário só repassa mensagens (do painel para cá e daqui para o painel).
 *
 * Chat 09 · R2: o intermediário é o arquivo fixo `ext/panel-host.html` (CSP própria no cabeçalho; um `srcdoc` herdaria a
 * CSP do app e teria o script bloqueado). A PRIMEIRA mensagem, a cada carga, entrega o documento do painel.
 */
export function ExtensionPanelFrame({ panelKey }: { panelKey: string }) {
  const t = useT();
  const panels = useRegistry(PanelRegistry);
  const panel = panels.find((p) => p.id === panelKey);
  const ref = useRef<HTMLIFrameElement>(null);
  const extensionId = panel?.extensionId ?? '';
  // S-28: o painel fica DENTRO de um intermediário com `frame-src 'none'` (a navegação do painel para fora é recusada)
  const panelDoc = useMemo(() => (panel ? panelDocument(panel.html) : ''), [panel]);
  const hostUrl = useMemo(() => isolatedDocUrl('panelHost'), []);

  useEffect(() => {
    const frame = ref.current;
    if (!frame || !panel) return;
    let conn: ExtensionConnection | null = null;
    let unmounting = false;
    const api = createPanelApi(extensionId, (msg) => conn?.send(msg));
    if (!api) return;
    conn = new ExtensionConnection({
      port: {
        post: (msg) => frame.contentWindow?.postMessage(msg, '*'),
        close: () => {
          // kill-switch apaga o painel; desmontar (inclusive a remontagem do StrictMode) não
          if (!unmounting) frame.src = 'about:blank';
        },
      },
      heartbeat: false,
      onRequest: (method, params) => {
        // painéis não registram comandos, importadores nem colagem (isso é do Worker)
        if (method === 'ui.registerCommand' || method === 'files.onImport' || method === 'files.onExport' || method === 'clipboard.onPaste') return Promise.resolve(false);
        return api.handler.handle(method, params);
      },
      onKilled: () => useExtensionRuntimeStore.getState().setOpenPanel(null),
    });
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      conn?.receive(e.data);
    };
    const onLoad = () => {
      // o documento do painel vai PRIMEIRO (o intermediário ignora outro depois do primeiro); depois o `init`
      frame.contentWindow?.postMessage(panelDocMessage(panelDoc), '*');
      conn?.send({ v: 1, t: 'init', extensionId, locale: document.documentElement.lang || 'pt-BR', permissions: [] });
    };
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', onLoad);
    // remontagem com o documento já carregado: o `init` é idempotente no painel (o intermediário guarda na fila)
    onLoad();
    return () => {
      unmounting = true;
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onLoad);
      api.handler.dispose();
      conn?.kill('stopped');
    };
  }, [panel, extensionId, panelDoc]);

  if (!panel) return <p className="p-4 text-sm text-ink-subtle">{t('extensions.panel.unavailable')}</p>;
  return (
    <div className="flex h-full flex-col">
      <iframe
        ref={ref}
        title={t('extensions.panel.frameTitle', { name: panel.label })}
        sandbox="allow-scripts"
        allow=""
        referrerPolicy="no-referrer"
        src={hostUrl}
        className={cn('min-h-[360px] w-full flex-1 border-0 bg-panel')}
        data-extension-panel={panel.id}
      />
      <p className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-2xs text-ink-subtle">
        <ShieldCheck size={12} /> {t('extensions.panel.isolation')}
      </p>
    </div>
  );
}

/** Aba "Extensões" do Painel lateral: escolhe um painel ativo e mostra o iframe isolado. */
export function ExtensionsPanelTab() {
  const t = useT();
  const panels = useRegistry(PanelRegistry);
  const open = useExtensionRuntimeStore((s) => s.openPanel);
  const setOpen = useExtensionRuntimeStore((s) => s.setOpenPanel);
  const current = panels.find((p) => p.id === open) ?? panels[0];
  if (!panels.length) return <p className="p-4 text-sm text-ink-subtle">{t('extensions.panel.empty')}</p>;
  return (
    <div className="flex h-full flex-col">
      {panels.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          {panels.map((p) => (
            <button key={p.id} type="button" className={cn('od-btn od-btn-sm', current?.id === p.id ? 'od-btn-soft' : 'od-btn-ghost text-ink-muted')} onClick={() => setOpen(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {current && <ExtensionPanelFrame key={current.id} panelKey={current.id} />}
    </div>
  );
}
