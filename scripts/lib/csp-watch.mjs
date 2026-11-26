/**
 * LuDraw — testes de navegador com a CSP ligada (Chat 09 · R2, pendência 1).
 *
 * O Vite de desenvolvimento manda a MESMA CSP de produção (`src/utils/securityHeaders.ts`; só o hash do script que o
 * Vite/React acrescentam ao `index.html` muda). Cada roteiro:
 *   1. confere que a página chegou com a CSP (`cspHeaderExpression`);
 *   2. escuta `securitypolicyviolation` na janela de TOPO (o documento do app) e repassa ao Node por um binding do
 *      DevTools (`Runtime.addBinding`), que sobrevive a recarregar a página;
 *   3. no fim, exige ZERO violações da política do app.
 * Os documentos isolados das extensões (`ext/*.html` e o painel) têm políticas próprias e bloqueiam coisas DE
 * PROPÓSITO nos roteiros da R4 (rede, fontes, navegação) — ficam fora desta contagem. Se a política do app barrasse o
 * carregamento deles, seria uma violação do `frame-src` do app, no topo, e apareceria aqui.
 */
export const CSP_BINDING = '__odCspViolation';

const WATCH_SOURCE = `(function () {
  if (window !== window.top) return;
  document.addEventListener('securitypolicyviolation', function (e) {
    try {
      window.${CSP_BINDING}(JSON.stringify({ directive: e.effectiveDirective, blocked: String(e.blockedURI || ''), source: String(e.sourceFile || ''), line: e.lineNumber || 0, sample: String(e.sample || '').slice(0, 80), page: location.pathname + location.hash.slice(0, 40) }));
    } catch (_) {}
  });
})();`;

/** Liga a escuta numa aba (antes de navegar). */
export async function watchCsp(send) {
  await send('Runtime.addBinding', { name: CSP_BINDING });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_SOURCE });
}

/** Violação repassada pela página (ou `null` se a mensagem do DevTools for outra). */
export function cspViolationOf(msg) {
  if (msg.method !== 'Runtime.bindingCalled' || msg.params?.name !== CSP_BINDING) return null;
  try {
    return JSON.parse(msg.params.payload);
  } catch {
    return { directive: 'parse-error', blocked: String(msg.params.payload).slice(0, 120) };
  }
}

/** Expressão (para `Runtime.evaluate`) que devolve a CSP da página atual, lida do próprio servidor. */
export const cspHeaderExpression = `fetch(location.href.split('#')[0], { cache: 'no-store' }).then((r) => r.headers.get('content-security-policy') || '')`;

/** A CSP lida é a do app (script só da origem + hash, sem unsafe-inline/eval em script, frame-ancestors). */
export function isAppCsp(csp) {
  const script = (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '');
  return /^script-src 'self'( 'sha256-[A-Za-z0-9+/]{43}=')+$/.test(script) && !/unsafe-eval/.test(csp) && /frame-ancestors 'self'/.test(csp) && /object-src 'none'/.test(csp);
}
