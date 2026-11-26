/**
 * LuDraw — Lado da extensão da ponte `ludraw.*` (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §6).
 *
 * Roda DENTRO do Worker/iframe, depois do preâmbulo selado e antes do código da extensão. Cria o objeto
 * global `ludraw` (congelado, não regravável). Toda chamada vira uma mensagem `req` para o host, que
 * valida, confere a permissão e executa pelas ações do store (`api.ts`). Nada aqui toca o app.
 *
 * Função AUTOCONTIDA: serializada com `toString()` (sem imports nem variáveis de fora).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extensionRuntime(g: any, post: (msg: unknown) => void, listen: (fn: (data: any) => void) => void): void {
  'use strict';
  let seq = 0;
  let info = { extensionId: '', locale: 'pt-BR', permissions: [] as string[] };
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const commands = new Map<string, () => unknown>();
  const importers = new Map<string, (file: unknown) => unknown>();
  const exporters = new Map<string, (req: unknown) => unknown>();
  let anyImporter: ((file: unknown) => unknown) | null = null;
  let pasteHandler: ((data: unknown) => unknown) | null = null;
  const selectionListeners = new Set<(ids: unknown) => void>();
  const elementListeners = new Set<(summary: unknown) => void>();

  const call = (method: string, params?: Record<string, unknown>) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      post({ v: 1, t: 'req', id, method, params });
    });

  const toBase64 = (bytes: Uint8Array) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    return g.btoa(bin);
  };
  /** Arquivo de saída → forma serializável (`text` ou `base64`). */
  const fileOut = (out: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o: any = out || {};
    const data = o.data;
    const base = { name: typeof o.name === 'string' ? o.name : undefined, mime: typeof o.mime === 'string' ? o.mime : undefined };
    if (typeof data === 'string') return { ...base, text: data };
    if (data instanceof Uint8Array) return { ...base, base64: toBase64(data) };
    throw new TypeError('data must be a string or Uint8Array');
  };

  listen(async (m) => {
    if (!m || typeof m !== 'object' || m.v !== 1) return;
    if (m.t === 'ping') return post({ v: 1, t: 'pong', n: m.n });
    if (m.t === 'init') {
      info = { extensionId: String(m.extensionId), locale: String(m.locale), permissions: Array.isArray(m.permissions) ? m.permissions.map(String) : [] };
      return;
    }
    if (m.t === 'res') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.value);
      else {
        const err = new Error(String(m.error));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any).code = m.code;
        p.reject(err);
      }
      return;
    }
    if (m.t === 'event') {
      const set = m.name === 'selection' ? selectionListeners : elementListeners;
      set.forEach((cb) => {
        try {
          cb(m.payload);
        } catch (_e) {
          /* erro do ouvinte não derruba os outros */
        }
      });
      return;
    }
    if (m.t === 'call') {
      try {
        let value: unknown;
        if (m.kind === 'command') {
          const run = commands.get(m.target);
          if (!run) throw new Error('command not registered: ' + m.target);
          value = await run();
          value = undefined;
        } else if (m.kind === 'paste') {
          if (!pasteHandler) throw new Error('no paste handler');
          value = await pasteHandler(m.payload);
        } else if (m.kind === 'import') {
          const h = importers.get(m.target) || anyImporter;
          if (!h) throw new Error('no import handler: ' + m.target);
          value = await h(m.payload);
        } else if (m.kind === 'export') {
          const h = exporters.get(m.target);
          if (!h) throw new Error('no export handler: ' + m.target);
          value = fileOut(await h(m.payload));
        }
        post({ v: 1, t: 'res', id: m.id, ok: true, value });
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        post({ v: 1, t: 'res', id: m.id, ok: false, error: String((e && (e as any).message) || e).slice(0, 500) });
      }
    }
  });

  const fnRequired = (fn: unknown) => {
    if (typeof fn !== 'function') throw new TypeError('a function is required');
  };

  const api = {
    apiVersion: 1,
    get extensionId() {
      return info.extensionId;
    },
    get locale() {
      return info.locale;
    },
    get permissions() {
      return info.permissions.slice();
    },
    board: Object.freeze({
      getSelection: () => call('board.getSelection'),
      getElements: (ids?: string[]) => call('board.getElements', ids ? { ids } : {}),
      addElements: (elements: unknown[]) => call('board.addElements', { elements }),
      updateElements: (patches: unknown[]) => call('board.updateElements', { patches }),
      deleteElements: (ids: string[]) => call('board.deleteElements', { ids }),
      onSelectionChange(cb: (ids: unknown) => void) {
        fnRequired(cb);
        selectionListeners.add(cb);
        void call('board.subscribe', { selection: true });
        return () => selectionListeners.delete(cb);
      },
      onElementsChange(cb: (summary: unknown) => void) {
        fnRequired(cb);
        elementListeners.add(cb);
        void call('board.subscribe', { elements: true });
        return () => elementListeners.delete(cb);
      },
    }),
    ui: Object.freeze({
      registerCommand(c: { id: string; run: () => unknown }) {
        if (!c || typeof c.id !== 'string') throw new TypeError('command id is required');
        fnRequired(c.run);
        commands.set(c.id, c.run);
        return call('ui.registerCommand', { id: c.id });
      },
      showPanel: (id: string) => call('ui.showPanel', { id }),
      notify: (message: string, kind?: string) => call('ui.notify', { message: String(message), kind: kind || 'info' }),
    }),
    clipboard: Object.freeze({
      onPaste(h: (data: unknown) => unknown) {
        fnRequired(h);
        pasteHandler = h;
        return call('clipboard.onPaste', {});
      },
    }),
    files: Object.freeze({
      onImport(a: unknown, b?: unknown) {
        if (typeof a === 'function') {
          anyImporter = a as (file: unknown) => unknown;
          return call('files.onImport', {});
        }
        fnRequired(b);
        importers.set(String(a), b as (file: unknown) => unknown);
        return call('files.onImport', { id: String(a) });
      },
      onExport(id: string, h: (req: unknown) => unknown) {
        fnRequired(h);
        exporters.set(String(id), h);
        return call('files.onExport', { id: String(id) });
      },
      offerDownload: (name: string, data: unknown, mime?: string) => call('files.offerDownload', fileOut({ name, data, mime })),
    }),
    storage: Object.freeze({
      get: (key: string) => call('storage.get', { key: String(key) }),
      set: (key: string, value: unknown) => call('storage.set', { key: String(key), value }),
    }),
    network: Object.freeze({
      fetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => call('network.fetch', { url: String(url), init: init || {} }),
    }),
  };
  Object.defineProperty(g, 'ludraw', { value: Object.freeze(api), writable: false, configurable: false, enumerable: true });
  // avisa o host quando o código da extensão terminar de rodar (fila de microtarefas)
  Promise.resolve().then(() => call('runtime.ready'));
}

/** Fonte do runtime para o Blob/`srcdoc`. */
export const RUNTIME_SOURCE = `(${extensionRuntime.toString()})`;

/**
 * Monta o script completo do Worker: preâmbulo selado → runtime → código da extensão.
 * Nada aqui é avaliado pelo host: o texto vira um Blob carregado num Worker dedicado.
 */
export function workerScript(sealSource: string, extensionCode: string): string {
  return [
    '(function () {',
    `  var post = ${sealSource}(self, 'worker');`,
    `  ${RUNTIME_SOURCE}(self, post, function (fn) { self.addEventListener('message', function (e) { fn(e.data); }); });`,
    '})();',
    // código da extensão (escopo do Worker já selado)
    extensionCode,
  ].join('\n');
}
