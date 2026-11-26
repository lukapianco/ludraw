/**
 * LuDraw — documentos isolados das extensões: políticas e conteúdo (PURO: sem DOM; usado pelo app, pelo build do
 * Vite, pelo servidor e pelos testes).
 *
 * Chat 09 · R2 (CSP do app): até o Chat 08.7 a estação do Worker e o intermediário do painel eram `srcdoc`. Um
 * documento `srcdoc` (e `blob:`/`data:`) HERDA a CSP de quem o cria; com a CSP do app (`script-src 'self'` + hash), o
 * `<script>` embutido deles seria bloqueado — e o do intermediário nem tem hash fixo (levava o painel dentro). Agora
 * os dois são ARQUIVOS fixos servidos pela mesma origem (`ext/station.html`, `ext/panel-host.html`), com a CSP
 * própria no cabeçalho (e repetida em `<meta>`, para quem servir o `dist/` sem cabeçalhos). Continuam dentro de
 * `<iframe sandbox="allow-scripts">` (origem opaca). O código da extensão chega por `postMessage`, como antes.
 *
 * Chat 09 · R2 (pendência 5, `dns-prefetch`): a CSP não controla a pré-resolução de DNS que o navegador faz sozinho
 * para links; os dois documentos (e o painel) levam `x-dns-prefetch-control: off`. É uma dica — o navegador pode
 * ignorá-la (limite registrado no EXTENSIONS_SPEC).
 */

/** CSP do documento da estação: só o script embutido da estação e o Worker de `blob:`; nada de rede. */
export const WORKER_STATION_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; font-src 'none'; img-src 'none'; style-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src blob:; form-action 'none'; base-uri 'none'";

/** CSP do documento do painel (e do intermediário): só script/estilo embutidos e imagens/fontes `data:`; nenhuma conexão. */
export const PANEL_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'";

/** Caminhos dos documentos isolados, relativos ao `index.html` (o app usa `base: './'`). */
export const ISOLATED_DOCS = {
  station: 'ext/station.html',
  panelHost: 'ext/panel-host.html',
} as const;

export type IsolatedDocKind = keyof typeof ISOLATED_DOCS;

/** CSP de cada documento isolado. */
export const ISOLATED_DOC_CSP: Record<IsolatedDocKind, string> = { station: WORKER_STATION_CSP, panelHost: PANEL_CSP };

/** Cabeçalhos do `<head>` de um documento isolado (CSP, sem `Referer`, sem pré-resolução de DNS). */
export const isolatedHead = (csp: string) =>
  `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off">`;

/**
 * Script da estação (texto fixo). Espera UMA mensagem do app (`e.source === parent`) com o código do Worker e a porta;
 * cria o Worker de `blob:` (que herda a CSP desta página) e repassa as mensagens nos dois sentidos.
 */
export const STATION_SCRIPT = `(function () {
  var started = false;
  window.addEventListener('message', function (e) {
    if (started || e.source !== window.parent || !e.data || e.data.od !== 'station' || !e.ports || !e.ports[0]) return;
    started = true;
    var port = e.ports[0];
    var url = URL.createObjectURL(new Blob([String(e.data.code)], { type: 'text/javascript' }));
    var worker = new Worker(url, { name: String(e.data.name || '') });
    var revoked = false;
    worker.onmessage = function (m) {
      if (!revoked) { revoked = true; URL.revokeObjectURL(url); }
      port.postMessage({ s: 'm', d: m.data });
    };
    worker.onerror = function (err) { err.preventDefault(); port.postMessage({ s: 'e', m: String(err.message || '') }); };
    worker.onmessageerror = function () { port.postMessage({ s: 'x' }); };
    port.onmessage = function (m) { worker.postMessage(m.data); };
  });
})();`;

/**
 * Script do intermediário do painel (texto fixo). A PRIMEIRA mensagem do app (`{ od: 'panel-doc', html }`, só de
 * `window.parent`) traz o documento do painel; o intermediário cria o iframe do painel (`srcdoc`, que herda a política
 * DESTE documento) e daí em diante só repassa mensagens — do painel para o app só se vierem do painel, do app para o
 * painel só se vierem do app. Mensagens do app que chegam antes de o painel carregar ficam numa fila. Outro
 * `panel-doc` depois do primeiro é ignorado.
 */
export const PANEL_HOST_SCRIPT = `(function () {
  var csp = ${JSON.stringify(PANEL_CSP)};
  var de = document.documentElement, body = document.body;
  de.style.height = '100%'; body.style.height = '100%'; body.style.margin = '0'; body.style.overflow = 'hidden';
  var f = null, ready = false, queue = [];
  window.addEventListener('message', function (e) {
    if (f && e.source === f.contentWindow) { window.parent.postMessage(e.data, '*'); return; }
    if (e.source !== window.parent) return;
    if (!f) {
      if (!e.data || e.data.od !== 'panel-doc' || typeof e.data.html !== 'string') return;
      f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('csp', csp);
      f.setAttribute('allow', '');
      f.setAttribute('referrerpolicy', 'no-referrer');
      f.style.border = '0'; f.style.width = '100%'; f.style.height = '100%'; f.style.display = 'block';
      f.addEventListener('load', function () { ready = true; for (var i = 0; i < queue.length; i++) f.contentWindow.postMessage(queue[i], '*'); queue = []; });
      f.srcdoc = e.data.html;
      body.appendChild(f);
      return;
    }
    if (e.data && e.data.od === 'panel-doc') return;
    if (ready) f.contentWindow.postMessage(e.data, '*'); else queue.push(e.data);
  });
})();`;

/** Conteúdo de cada documento isolado (o build grava em `dist/ext/`, o Vite de desenvolvimento serve na hora). */
export function isolatedDocument(kind: IsolatedDocKind): string {
  const csp = ISOLATED_DOC_CSP[kind];
  const script = kind === 'station' ? STATION_SCRIPT : PANEL_HOST_SCRIPT;
  return `<!doctype html><html><head>${isolatedHead(csp)}</head><body><script>${script}</script></body></html>\n`;
}
