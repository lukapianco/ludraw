/**
 * LuDraw — isolamento das extensões pela política do próprio navegador (Chat 08.7 · R4, achado S-28).
 *
 * O preâmbulo selado (`sealGlobals.ts`) apaga globais, mas não alcança a SINTAXE (`import()`) nem recursos que
 * o navegador busca sozinho. A defesa real é a CSP de um documento isolado:
 *
 *  - **Estação do Worker:** o Worker da extensão não nasce no documento do app. O host cria um
 *    `<iframe sandbox="allow-scripts">` invisível (origem opaca) cujo documento tem `WORKER_STATION_CSP`
 *    (`connect-src 'none'`, `font-src 'none'`, `script-src` só embutido e `blob:`…). O Worker é criado LÁ, a partir de
 *    um `blob:`, e herda essa política: `import()`, `FontFace`, `importScripts`, `fetch`, `WebSocket` e `EventSource`
 *    são barrados antes de qualquer requisição. Host ⇄ estação por `MessageChannel`.
 *  - **Painel embrulhado:** a navegação do próprio painel (`location = …`, link, `meta refresh`) não é regida pela CSP do
 *    painel, e sim pelo `frame-src` do documento que o contém. O painel fica dentro de um INTERMEDIÁRIO fixo
 *    (também `sandbox="allow-scripts"`) com `PANEL_CSP` (inclui `frame-src 'none'`): a navegação para fora é recusada
 *    e o painel fica preso ao `srcdoc`.
 *
 * Chat 09 · R2: estação e intermediário são ARQUIVOS fixos da mesma origem (`ext/station.html`, `ext/panel-host.html`,
 * conteúdo em `isolationPolicy.ts`) com a CSP própria no cabeçalho — não mais `srcdoc`, que herdaria a CSP do app e
 * teria o script embutido bloqueado. O atributo `csp` (só Chromium) saiu desses dois iframes: com URL de verdade ele
 * exigiria a mesma política no cabeçalho e quebraria quem serve o `dist/` sem cabeçalhos; a política continua no
 * cabeçalho (servidor, Vite) e no `<meta>` do próprio arquivo. O painel interno (`srcdoc`) continua com o atributo.
 */
import { ISOLATED_DOCS, PANEL_CSP, WORKER_STATION_CSP, isolatedDocument } from './isolationPolicy';

export { PANEL_CSP, WORKER_STATION_CSP };

/** Endereço de um documento isolado, relativo ao `index.html` (funciona em subcaminho e empacotado). */
export function isolatedDocUrl(kind: keyof typeof ISOLATED_DOCS): string {
  return new URL(ISOLATED_DOCS[kind], document.baseURI).href;
}

/** Documento da estação do Worker (fixo; o mesmo texto que o build grava em `ext/station.html`). */
export function workerStationDocument(): string {
  return isolatedDocument('station');
}

export interface StationHandle {
  post(msg: unknown, transfer?: Transferable[]): void;
  close(): void;
}

export interface StationCallbacks {
  onMessage(data: unknown): void;
  onError(message: string): void;
  onMessageError(): void;
}

/**
 * Cria a estação (iframe invisível no `document.body`) e o Worker dentro dela. As mensagens do host ficam na fila da
 * porta até a estação carregar; nada se perde.
 */
export function startWorkerStation(code: string, name: string, cb: StationCallbacks): StationHandle {
  const channel = new MessageChannel();
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('allow', '');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.dataset.extensionStation = name;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
  frame.src = isolatedDocUrl('station');
  let closed = false;
  channel.port1.onmessage = (e: MessageEvent) => {
    const env = e.data as { s?: string; d?: unknown; m?: string } | null;
    if (!env || typeof env !== 'object') return;
    if (env.s === 'm') cb.onMessage(env.d);
    else if (env.s === 'e') cb.onError(typeof env.m === 'string' ? env.m.slice(0, 500) : '');
    else if (env.s === 'x') cb.onMessageError();
  };
  frame.addEventListener(
    'load',
    () => {
      if (!closed) frame.contentWindow?.postMessage({ od: 'station', code, name }, '*', [channel.port2]);
    },
    { once: true },
  );
  document.body.appendChild(frame);
  return {
    post: (msg, transfer) => {
      if (!closed) channel.port1.postMessage(msg, transfer ?? []);
    },
    close: () => {
      if (closed) return;
      closed = true;
      channel.port1.close();
      frame.remove(); // o documento some e o Worker dele é encerrado pelo navegador
    },
  };
}

/** Mensagem que entrega ao intermediário (`ext/panel-host.html`) o documento do painel (já com CSP e preâmbulo). */
export function panelDocMessage(panelDoc: string): { od: 'panel-doc'; html: string } {
  return { od: 'panel-doc', html: panelDoc };
}
