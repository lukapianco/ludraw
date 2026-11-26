/**
 * LuDraw — Preâmbulo selado (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §5.2).
 *
 * Roda ANTES do código da extensão, dentro do Worker (lógica) ou do iframe (painel). Remove de vez
 * todo acesso direto à rede e ao armazenamento do navegador, e a geração de código a partir de texto:
 *
 * - `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`, `RTCPeerConnection`
 *   (e afins), `importScripts`, `Worker`/`SharedWorker`, `BroadcastChannel`, `indexedDB`, `caches`,
 *   `localStorage`/`sessionStorage`, `navigator.sendBeacon`, `postMessage` direto e `open`;
 *   apagados do objeto global E da cadeia de protótipos, e redefinidos como `undefined` não configurável;
 * - `eval`, `Function` e os construtores de funções assíncronas/geradoras; `setTimeout`/`setInterval`
 *   só aceitam função (texto seria `eval`);
 * - `Object.prototype` e `Function.prototype` congelados.
 *
 * A rede só existe pelo host (`ludraw.network.fetch` → `netProxy.ts`). A defesa real contra o que o selo não alcança
 * (sintaxe `import()`, navegação do painel) é a CSP da estação do Worker e do intermediário do painel
 * (`host/isolation.ts`, Chat 08.7 · R4 · S-28).
 * Limite honesto: nenhum mecanismo de navegador é perfeito; instale só extensões de quem você confia.
 *
 * A função é AUTOCONTIDA (sem imports nem variáveis de fora): o host a serializa com `toString()`
 * para dentro do Blob do Worker / do `srcdoc` do painel. Devolve o `postMessage` capturado (único canal).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sealGlobals(g: any, mode: 'worker' | 'panel'): (msg: unknown) => void {
  'use strict';
  const parentWin = mode === 'panel' ? g.parent : null;
  const rawPost = mode === 'panel' ? parentWin.postMessage : g.postMessage;
  const post = (msg: unknown) => {
    if (mode === 'panel') rawPost.call(parentWin, msg, '*');
    else rawPost.call(g, msg);
  };
  const names = [
    'fetch', 'XMLHttpRequest', 'XMLHttpRequestEventTarget', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport',
    'RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate',
    'importScripts', 'Worker', 'SharedWorker', 'ServiceWorker', 'ServiceWorkerContainer', 'BroadcastChannel',
    'indexedDB', 'IDBFactory', 'caches', 'CacheStorage', 'localStorage', 'sessionStorage', 'openDatabase',
    'postMessage', 'open', 'eval', 'Notification', 'PresentationRequest', 'Request',
    // Chat 08.7 · R4 (S-28): fonte carregada por URL; a CSP da estação/painel é a defesa real, isto é a 2ª camada
    'FontFace', 'fonts',
  ];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    for (let o = g; o; o = Object.getPrototypeOf(o)) {
      if (Object.prototype.hasOwnProperty.call(o, name)) {
        try {
          delete o[name];
        } catch (_e) {
          /* propriedade presa: a redefinição abaixo cobre */
        }
      }
    }
    try {
      Object.defineProperty(g, name, { value: undefined, writable: false, configurable: false, enumerable: false });
    } catch (_e) {
      /* já não configurável */
    }
  }
  try {
    if (g.document) Object.defineProperty(g.document, 'fonts', { value: undefined, writable: false, configurable: false });
  } catch (_e) {
    /* sem document (Worker) */
  }
  try {
    if (g.navigator) Object.defineProperty(g.navigator, 'sendBeacon', { value: undefined, writable: false, configurable: false });
  } catch (_e) {
    /* sem navigator */
  }
  // geração de código a partir de texto
  const blocked = function () {
    throw new TypeError('LuDraw: code generation is blocked in extensions');
  };
  const protos = [
    Function.prototype,
    Object.getPrototypeOf(async function () {}),
    Object.getPrototypeOf(function* () {}),
    Object.getPrototypeOf(async function* () {}),
  ];
  for (let i = 0; i < protos.length; i++) {
    try {
      Object.defineProperty(protos[i], 'constructor', { value: blocked, writable: false, configurable: false });
    } catch (_e) {
      /* ignora */
    }
  }
  try {
    Object.defineProperty(g, 'Function', { value: blocked, writable: false, configurable: false });
  } catch (_e) {
    /* ignora */
  }
  const st = g.setTimeout;
  const si = g.setInterval;
  const onlyFn = (impl: (...a: unknown[]) => unknown) =>
    function (fn: unknown, ...rest: unknown[]) {
      if (typeof fn !== 'function') throw new TypeError('LuDraw: timers only accept functions');
      return impl.call(g, fn, ...rest);
    };
  try {
    Object.defineProperty(g, 'setTimeout', { value: onlyFn(st), writable: false, configurable: false });
    Object.defineProperty(g, 'setInterval', { value: onlyFn(si), writable: false, configurable: false });
  } catch (_e) {
    /* ignora */
  }
  Object.freeze(Object.prototype);
  Object.freeze(Function.prototype);
  return post;
}

/** Fonte do preâmbulo para o Blob/`srcdoc` (função autocontida, sem `eval` no host). */
export const SEAL_SOURCE = `(${sealGlobals.toString()})`;
