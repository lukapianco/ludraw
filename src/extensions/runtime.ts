/**
 * LuDraw — Execução das extensões programáveis (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §5.1).
 *
 * - Lógica (`main.js`) num **Web Worker dedicado** criado a partir de um Blob montado pelo host, DENTRO da estação
 *   isolada (`host/isolation.ts`, Chat 08.7 · R4 · S-28: iframe sandbox com CSP sem rede, herdada pelo Worker):
 *   preâmbulo selado → runtime `ludraw` → código da extensão (a CÓPIA instalada e conferida pelo
 *   pinning). Sem DOM, sem `window`, sem `localStorage`, sem rede direta.
 * - Contribuições com código entram pelos registries (comandos, painéis, importadores, exportadores,
 *   colagem) e cada execução vira uma chamada RPC com timeout de 5 s.
 * - Kill-switch: `worker.terminate()` (timeout, heartbeat sem resposta, excesso de mensagens, Modo
 *   Seguro, desativar, revogar permissão, desinstalar).
 */
import { getLocale, t } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { useBoardStore } from '../store/useBoardStore';
import { useExtensionRuntimeStore } from '../store/useExtensionRuntimeStore';
import type { CanvasElement } from '../types/canvas';
import { allowExport } from '../utils/boardActions';
import { downloadBlob } from '../utils/export';
import { createApiHandler, snapshotOf, blobFrom, type ApiHandler } from './api';
import { buildApiElements } from './contributions/templates';
import { ExtensionConnection, type KillReason } from './host/connection';
import { RUNTIME_SOURCE, workerScript } from './host/extensionRuntime';
import { safeFileName, type HostMessage } from './host/protocol';
import { startWorkerStation, PANEL_CSP } from './host/isolation';
import { SEAL_SOURCE } from './host/sealGlobals';
import { CommandRegistry, ExporterRegistry, ImporterRegistry, PanelRegistry, type ImportPayload } from './registries';
import { localizedDescription, localizedName, validateElementInputs } from './schema';
import type { ExtensionManifest, ExtensionPermission } from './types';
import { runAsExtension } from '../store/useBoardStore';

export const RUNTIME_LIMITS = { importFileBytes: 20 * 1024 * 1024, importElements: 5000, pasteChars: 1024 * 1024, warnings: 20 } as const;

interface Running {
  conn: ExtensionConnection;
  api: ApiHandler;
  name: string;
  manifest: ExtensionManifest;
  grants: ReadonlySet<ExtensionPermission>;
  bound: { commands: Set<string>; imports: Set<string>; exports: Set<string>; paste: boolean };
  unregister: Array<() => void>;
}

const running = new Map<string, Running>();

export interface StartOptions {
  manifest: ExtensionManifest;
  files: Record<string, Uint8Array>;
  grants: ReadonlySet<ExtensionPermission>;
  onKilled: (reason: KillReason) => void;
}

const decode = (bytes: Uint8Array | undefined) => (bytes ? new TextDecoder('utf-8').decode(bytes) : '');

/** O Worker da extensão está de pé? */
export function isRunning(id: string): boolean {
  return running.get(id)?.conn.alive ?? false;
}

export function runningCount(): number {
  return [...running.values()].filter((r) => r.conn.alive).length;
}

/** Inicia o Worker e registra as contribuições com código. Idempotente. */
export function startExtensionRuntime(opts: StartOptions): void {
  const m = opts.manifest;
  if (m.kind !== 'script' || !m.main || running.has(m.id)) return;
  const name = localizedName(m, getLocale());
  const code = decode(opts.files[m.main]);
  const bound: Running['bound'] = { commands: new Set(), imports: new Set(), exports: new Set(), paste: false };
  const rt = useExtensionRuntimeStore.getState();
  rt.setState(m.id, 'starting');

  // eslint-disable-next-line prefer-const
  let conn: ExtensionConnection;
  const station = startWorkerStation(workerScript(SEAL_SOURCE, code), `ludraw-ext:${m.id}`, {
    onMessage: (data) => conn.receive(data),
    // erro não tratado no código da extensão: fica no console; o heartbeat decide se travou
    onError: (message) => console.warn(`[extensions] ${m.id}: ${message}`),
    onMessageError: () => conn.kill('error'),
  });
  const api = createApiHandler({
    id: m.id,
    name,
    manifest: m,
    grants: opts.grants,
    send: (msg) => conn.send(msg),
    onBind: (kind, id) => {
      if (kind === 'command') bound.commands.add(id);
      else if (kind === 'import') bound.imports.add(id);
      else if (kind === 'export') bound.exports.add(id);
      else if (kind === 'paste' && !bound.paste) {
        bound.paste = true;
        entry.unregister.push(registerPaste(m, name, () => conn));
      }
    },
  });
  conn = new ExtensionConnection({
    // S-28: o Worker nasce dentro da estação isolada (CSP sem rede), nunca no documento do app
    port: { post: (msg, transfer) => station.post(msg, transfer), close: () => station.close() },
    heartbeat: true,
    onRequest: (method, params) => api.handle(method, params),
    onReady: () => {
      useExtensionRuntimeStore.getState().setState(m.id, 'running');
    },
    onKilled: (reason) => {
      cleanup(m.id);
      useExtensionRuntimeStore.getState().setState(m.id, 'killed', reason);
      opts.onKilled(reason);
    },
  });
  const entry: Running = { conn, api, name, manifest: m, grants: opts.grants, bound, unregister: [] };
  running.set(m.id, entry);
  conn.send({ v: 1, t: 'init', extensionId: m.id, locale: getLocale(), permissions: [...opts.grants] });
  entry.unregister.push(...registerCodeContributions(m, name, opts, entry));
}

/** Para o Worker (kill-switch) e tira as contribuições com código. */
export function stopExtensionRuntime(id: string): void {
  const r = running.get(id);
  if (!r) return;
  r.conn.kill('stopped');
  cleanup(id);
  useExtensionRuntimeStore.getState().clear(id);
}

export function stopAllRuntimes(): void {
  for (const id of [...running.keys()]) stopExtensionRuntime(id);
}

function cleanup(id: string): void {
  const r = running.get(id);
  if (!r) return;
  running.delete(id);
  r.api.dispose();
  r.unregister.forEach((fn) => fn());
}

/* ------------------------------ Contribuições com código ------------------------------ */

function liveConn(id: string): ExtensionConnection | null {
  const r = running.get(id);
  return r && r.conn.alive ? r.conn : null;
}

function registerCodeContributions(m: ExtensionManifest, name: string, opts: StartOptions, entry: Running): Array<() => void> {
  const out: Array<() => void> = [];
  const c = m.contributes ?? {};
  const via = { id: m.id, name };

  if (opts.grants.has('ui.command')) {
    c.commands?.forEach((cmd, i) => {
      out.push(
        CommandRegistry.register({
          id: `${m.id}/${cmd.id}`,
          source: 'extension',
          extensionId: m.id,
          order: i,
          get label() {
            return localizedName({ name: cmd.title, i18n: cmd.i18n }, getLocale());
          },
          keywords: [...(cmd.keywords ?? []), name],
          run: () => {
            const conn = liveConn(m.id);
            if (!conn || !conn.ready || !entry.bound.commands.has(cmd.id)) {
              useAppStore.getState().toast(t('extensions.api.commandNotReady', { name }), 'danger');
              return;
            }
            conn.call('command', cmd.id).catch((err: Error) => useAppStore.getState().toast(t('extensions.api.commandFailed', { name, detail: err.message }), 'danger'));
          },
        }),
      );
    });
  }

  if (opts.grants.has('ui.panel') && m.ui) {
    const html = decode(opts.files[m.ui]);
    c.panels?.forEach((p, i) => {
      out.push(
        PanelRegistry.register({
          id: `${m.id}/${p.id}`,
          source: 'extension',
          extensionId: m.id,
          order: i,
          get label() {
            return localizedName({ name: p.title, i18n: p.i18n }, getLocale());
          },
          html,
        }),
      );
    });
  }

  if (opts.grants.has('files.import')) {
    c.importers?.forEach((im, i) => {
      out.push(
        ImporterRegistry.register({
          id: `${m.id}/${im.id}`,
          source: 'extension',
          extensionId: m.id,
          order: 500 + i,
          get label() {
            return localizedName({ name: im.label, i18n: im.i18n }, getLocale());
          },
          get description() {
            return localizedDescription({ description: im.description, i18n: im.i18n }, getLocale()) ?? '';
          },
          get standard() {
            return t('extensions.api.importerStandard', { name });
          },
          extensions: [...im.extensions],
          mimeTypes: [],
          readFile: async (file: File): Promise<ImportPayload> => {
            const conn = liveConn(m.id);
            if (!conn || !conn.ready || !(entry.bound.imports.has(im.id) || entry.bound.imports.has('*'))) throw new Error(t('extensions.api.importerNotReady', { name }));
            if (file.size > RUNTIME_LIMITS.importFileBytes) throw new Error(t('extensions.api.importTooLarge', { size: RUNTIME_LIMITS.importFileBytes / 1024 / 1024 }));
            const bytes = new Uint8Array(await file.arrayBuffer());
            const result = await conn.call('import', im.id, { name: file.name, bytes }, [bytes.buffer]);
            return payloadFrom(result, localizedName({ name: im.label, i18n: im.i18n }, getLocale()), via);
          },
        }),
      );
    });
  }

  if (opts.grants.has('files.export')) {
    c.exporters?.forEach((ex, i) => {
      out.push(
        ExporterRegistry.register({
          id: `${m.id}/${ex.id}`,
          source: 'extension',
          extensionId: m.id,
          order: 500 + i,
          get label() {
            return localizedName({ name: ex.label, i18n: ex.i18n }, getLocale());
          },
          get description() {
            return localizedDescription({ description: ex.description, i18n: ex.i18n }, getLocale()) ?? '';
          },
          group: 'data',
          extension: ex.extension,
          scopes: ['board', 'selection'],
          run: async (req) => {
            const conn = liveConn(m.id);
            if (!conn || !conn.ready || !entry.bound.exports.has(ex.id)) throw new Error(t('extensions.api.exporterNotReady', { name }));
            const s = useBoardStore.getState();
            const lookup = (id: string) => s.elements[id];
            const viewer = { id: s.access.userId, simulate: !!s.facilitation.privateMode.previewOwnNotes };
            const ids = req.scope === 'selection' ? s.selectedIds : s.elementOrder;
            const elements = ids.map((id) => s.elements[id]).filter((e): e is CanvasElement => !!e).map((e) => snapshotOf(e, lookup, viewer)).filter(Boolean);
            const out = (await conn.call('export', ex.id, { scope: req.scope, elements })) as Record<string, unknown>;
            const blob = blobFrom(out ?? {});
            let ok = false;
            runAsExtension(via, () => {
              ok = allowExport({ key: 'board.activity.export.extensionFile', params: { name } });
            });
            if (ok) downloadBlob(blob, safeFileName(out?.name, `${safeFileName(name, 'export')}.${ex.extension}`));
          },
        }),
      );
    });
  }
  return out;
}

/** Colagem (`clipboard.onPaste`): só texto e HTML genérico, depois da proteção contra dado codificado. */
function registerPaste(m: ExtensionManifest, name: string, conn: () => ExtensionConnection): () => void {
  const via = { id: m.id, name };
  return ImporterRegistry.register({
    id: `${m.id}/paste`,
    source: 'extension',
    extensionId: m.id,
    order: 900,
    get label() {
      return t('extensions.api.pasteLabel', { name });
    },
    get description() {
      return t('extensions.api.pasteDescription', { name });
    },
    get standard() {
      return t('extensions.api.importerStandard', { name });
    },
    extensions: [],
    mimeTypes: [],
    // < 50: genérico — roda DEPOIS da proteção contra dado codificado e dos formatos reconhecidos
    clipboardPriority: 45,
    readClipboard: async (snap) => {
      const c = conn();
      if (!c.alive || !c.ready || (!snap.text && !snap.html)) return null;
      const result = await c.call('paste', 'paste', { text: snap.text.slice(0, RUNTIME_LIMITS.pasteChars), html: snap.html.slice(0, RUNTIME_LIMITS.pasteChars) });
      if (result === null || result === undefined) return null;
      return payloadFrom(result, t('extensions.api.pasteLabel', { name }), via);
    },
  });
}

/** Resultado de importação/colagem → payload do núcleo (elementos validados e construídos pelo host). */
function payloadFrom(result: unknown, label: string, via: { id: string; name: string }): ImportPayload {
  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  const v = validateElementInputs(r.elements, RUNTIME_LIMITS.importElements);
  if (!v.ok) throw new Error(t('extensions.api.importInvalid', { detail: v.issues.slice(0, 2).map((i) => i.path).join(', ') }));
  const elements = buildApiElements(v.inputs, () => undefined);
  const warnings = Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === 'string').slice(0, RUNTIME_LIMITS.warnings).map((w) => w.slice(0, 300)) : [];
  return { kind: 'elements', elements, label, summary: t('extensions.api.importSummary', { count: elements.length }), warnings, viaExtension: via };
}

/* ---------------------------------- Painéis ---------------------------------- */

/** CSP do documento do painel (fonte única em `host/isolationPolicy.ts`; o painel fica dentro de um intermediário — S-28). */
export { PANEL_CSP, isolatedDocUrl, panelDocMessage } from './host/isolation';

/** Documento do painel: CSP + preâmbulo selado + runtime, ANTES do HTML da extensão. */
export function panelDocument(html: string): string {
  const preamble = [
    '(function () {',
    `  var post = ${SEAL_SOURCE}(window, 'panel');`,
    `  var parentWin = window.parent;`,
    `  ${RUNTIME_SOURCE}(window, post, function (fn) { window.addEventListener('message', function (e) { if (e.source === parentWin) fn(e.data); }); });`,
    '})();',
  ].join('\n');
  // `</script` dentro do preâmbulo quebraria o documento: não existe (fontes fixas do host)
  // Chat 09 · R2: sem pré-resolução de DNS dos links do painel (dica; a CSP não cobre — pendência 5)
  return `<meta http-equiv="Content-Security-Policy" content="${PANEL_CSP}"><meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off"><script>${preamble}</script>\n${html}`;
}

/**
 * API para o iframe de um painel: mesmas permissões aprovadas do Worker, mas eventos (seleção,
 * elementos) vão para o próprio painel. O painel não registra comandos/importadores (só o Worker).
 */
export function createPanelApi(id: string, send: (msg: HostMessage) => void): { handler: ApiHandler; name: string } | null {
  const r = running.get(id);
  if (!r || !r.conn.alive) return null;
  return { handler: createApiHandler({ id, name: r.name, manifest: r.manifest, grants: r.grants, send }), name: r.name };
}
