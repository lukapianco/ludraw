/**
 * LuDraw — API `ludraw.*` v1 do lado do host (Chat 06.5 · B · `EXTENSIONS_SPEC.md` §5.5 e §6).
 *
 * ÚNICA camada que toca o store em nome de uma extensão:
 * - cada método exige a permissão aprovada (`API_METHODS` → `grants`); sem ela, erro claro;
 * - escrita no board passa pela MESMA decisão do `ensure()` (`checkBoardAction` → `can()`/`explain()`,
 *   inclusive "Visualizar como…" e Modo Apresentação) e pelas ações existentes do store
 *   (`addElements`, `updateElements`, `deleteElements`) dentro de `runAsExtension` — o Activity Log
 *   grava `viaExtension` e cada chamada é 1 passo de desfazer;
 * - leitura devolve cópias (`ElementSnapshot`): nunca referência ao store; conteúdo oculto por frame
 *   e comentários ficam de fora; notas privadas ocultas chegam SEM texto (`isPrivateDraftHidden`);
 * - nada recebido é executado (sem `eval`/`Function`).
 */
import { isProtoKey, ownValue } from '../utils/safeKeys';
import { t, translateMessage } from '../i18n';
import type { MessageDescriptor } from '../i18n/types';
import { checkBoardAction, runAsExtension, useBoardStore } from '../store/useBoardStore';
import { useAppStore } from '../store/useAppStore';
import { useExtensionRuntimeStore } from '../store/useExtensionRuntimeStore';
import type { CanvasElement, ElementPatch } from '../types/canvas';
import { allowExport } from '../utils/boardActions';
import { boardRepository } from '../utils/boardRepository';
import { downloadBlob } from '../utils/export';
import { isHiddenByFrame } from '../utils/frames';
import { isPrivateDraftHidden } from '../utils/permissions';
import { buildApiElements } from './contributions/templates';
import { ApiError } from './host/connection';
import { hostFetch } from './host/netProxy';
import { permissionFor, safeFileName, type ApiMethod, type HostMessage } from './host/protocol';
import { hasCssInjection, parseColor, validateElementInputs, type ValidationIssue } from './schema';
import type { ElementSnapshot, ExtensionManifest, ExtensionPermission } from './types';

export interface ApiCaller {
  id: string;
  /** nome exibido (conteúdo da extensão) */
  name: string;
  manifest: ExtensionManifest;
  grants: ReadonlySet<ExtensionPermission>;
  /** envia eventos para a extensão (seleção/elementos) */
  send: (msg: HostMessage) => void;
  /** a extensão ligou um handler (comando, colagem, importação, exportação) */
  onBind?: (kind: 'command' | 'paste' | 'import' | 'export', id: string) => void;
}

export const API_LIMITS = { maxElements: 2000, maxPatches: 2000, maxText: 10_000, notifyChars: 300, storageBytes: 1024 * 1024, storageKey: 100, downloadBytes: 2 * 1024 * 1024 } as const;
const DOWNLOAD_MIME = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/xml', 'image/png']);

const fail = (code: string, message: MessageDescriptor): never => {
  throw new ApiError(code, translateMessage(message));
};

function issuesText(issues: ValidationIssue[]): string {
  return issues
    .slice(0, 3)
    .map((i) => `${i.path}: ${translateMessage(i.message)}`)
    .join(' · ');
}

/* ------------------------------ Leitura do board ------------------------------ */

/** Cópia somente-leitura (ou null quando a pessoa não deve ver o elemento). */
export function snapshotOf(el: CanvasElement, lookup: (id: string) => CanvasElement | undefined, viewer: { id: string; simulate: boolean }): ElementSnapshot | null {
  if (el.type === 'comment' || isHiddenByFrame(el, lookup)) return null;
  const base: ElementSnapshot = { id: el.id, type: el.type, x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation ?? 0, parentId: el.parentId ?? null, locked: !!el.locked };
  switch (el.type) {
    case 'sticky': {
      const hidden = isPrivateDraftHidden(el, viewer.id, viewer.simulate);
      return { ...base, text: hidden ? '' : el.text, color: el.color, tags: hidden ? [] : (el.tags ?? []).map((tag) => tag.label), ...(hidden ? { hidden: true } : {}) };
    }
    case 'shape':
      return { ...base, text: el.text, shapeKind: el.shapeKind, fillColor: el.fillColor, strokeColor: el.strokeColor, textColor: el.textColor };
    case 'text':
      return { ...base, text: el.text, textColor: el.textColor };
    case 'frame':
      return { ...base, title: el.title };
    case 'connector':
      return { ...base, label: el.label ?? '', from: el.start.elementId, to: el.end.elementId };
    case 'composite':
      return { ...base, text: el.text };
    default:
      return base;
  }
}

function boardReadable(): void {
  const d = checkBoardAction('board.view');
  if (!d.allowed) fail('permission', d.reason ?? { key: 'permissions.denied.noAccess' });
}

function viewerOf() {
  const s = useBoardStore.getState();
  return { id: s.access.userId, simulate: !!s.facilitation.privateMode.previewOwnNotes };
}

function snapshots(ids?: readonly string[]): ElementSnapshot[] {
  const s = useBoardStore.getState();
  const lookup = (id: string) => s.elements[id];
  const viewer = viewerOf();
  const list = ids ? ids.map((id) => s.elements[id]).filter((e): e is CanvasElement => !!e) : s.elementOrder.map((id) => s.elements[id]).filter((e): e is CanvasElement => !!e);
  return list.map((el) => snapshotOf(el, lookup, viewer)).filter((x): x is ElementSnapshot => !!x);
}

/* ------------------------------ Escrita no board ------------------------------ */

function boardWritable(): void {
  const d = checkBoardAction('board.edit');
  if (!d.allowed) fail('permission', d.reason ?? { key: 'permissions.denied.noAccess' });
}

const NUM = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const STR = (v: unknown, max: number = API_LIMITS.maxText) => typeof v === 'string' && v.length <= max;
const COLOR = (v: unknown) => typeof v === 'string' && !hasCssInjection(v) && (v === 'transparent' || !!parseColor(v));

/** Converte o pedido de alteração na `ElementPatch` do store (allowlist de campos por tipo). */
function toPatch(el: CanvasElement, raw: Record<string, unknown>): ElementPatch {
  const patch: Record<string, unknown> = {};
  const bad = (field: string) => fail('invalid', { key: 'extensions.api.badField', params: { field, id: el.id } });
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'id') continue;
    if (k === 'x' || k === 'y') (NUM(v, -1e6, 1e6) ? (patch[k] = v) : bad(k));
    else if (k === 'width' || k === 'height') (NUM(v, 1, 1e5) && el.type !== 'connector' ? (patch[k] = v) : bad(k));
    else if (k === 'rotation') (NUM(v, -360, 360) ? (patch[k] = v) : bad(k));
    else if (k === 'text') (STR(v) && (el.type === 'sticky' || el.type === 'shape' || el.type === 'text' || el.type === 'composite') ? (patch.text = v) : bad(k));
    else if (k === 'title') (STR(v, 500) && el.type === 'frame' ? (patch.title = v) : bad(k));
    else if (k === 'label') (STR(v, 1000) && el.type === 'connector' ? (patch.label = v) : bad(k));
    else if (k === 'color') (COLOR(v) && el.type === 'sticky' ? (patch.color = v) : bad(k));
    else if (k === 'fillColor' || k === 'strokeColor') (COLOR(v) && el.type === 'shape' ? (patch[k] = v) : bad(k));
    else if (k === 'textColor') (COLOR(v) && (el.type === 'shape' || el.type === 'text') ? (patch.textColor = v) : bad(k));
    else bad(k);
  }
  return patch as ElementPatch;
}

/* ------------------------------ Armazenamento ------------------------------ */

const storageCache = new Map<string, Record<string, unknown>>();

async function loadStorage(id: string): Promise<Record<string, unknown>> {
  let data = storageCache.get(id);
  if (!data) {
    data = (await boardRepository.getExtensionMeta<Record<string, unknown>>(`storage:${id}`)) ?? {};
    storageCache.set(id, data);
  }
  return data;
}

/** Apaga o armazenamento de uma extensão (desinstalar). */
export async function clearExtensionStorage(id: string): Promise<void> {
  storageCache.delete(id);
  await boardRepository.setExtensionMeta(`storage:${id}`, null).catch(() => undefined);
}

/* --------------------------------- Handler --------------------------------- */

export interface ApiHandler {
  handle: (method: ApiMethod, params: Record<string, unknown> | undefined) => Promise<unknown>;
  dispose: () => void;
}

export function createApiHandler(caller: ApiCaller): ApiHandler {
  const via = { id: caller.id, name: caller.name };
  let unsub: (() => void) | null = null;
  const wants = { selection: false, elements: false };
  let lastNotify = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const subscribe = () => {
    if (unsub) return;
    let prevSel = useBoardStore.getState().selectedIds.join('|');
    let prevEls = useBoardStore.getState().elements;
    unsub = useBoardStore.subscribe((s) => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = null;
        const st = useBoardStore.getState();
        if (wants.selection) {
          const sel = st.selectedIds.join('|');
          if (sel !== prevSel) {
            prevSel = sel;
            caller.send({ v: 1, t: 'event', name: 'selection', payload: st.selectedIds.slice(0, 5000) });
          }
        }
        if (wants.elements && st.elements !== prevEls) {
          const added: string[] = [];
          const updated: string[] = [];
          const removed: string[] = [];
          for (const [id, el] of Object.entries(st.elements)) {
            if (el.type === 'comment') continue;
            if (!prevEls[id]) added.push(id);
            else if (prevEls[id] !== el) updated.push(id);
          }
          for (const id of Object.keys(prevEls)) if (!st.elements[id]) removed.push(id);
          prevEls = st.elements;
          if (added.length || updated.length || removed.length) caller.send({ v: 1, t: 'event', name: 'elements', payload: { added: added.slice(0, 5000), updated: updated.slice(0, 5000), removed: removed.slice(0, 5000) } });
        }
      }, 150);
      void s;
    });
  };

  const handle = async (method: ApiMethod, params: Record<string, unknown> = {}): Promise<unknown> => {
    const need = permissionFor(method);
    if (need && !caller.grants.has(need)) fail('permission', { key: 'extensions.api.missingPermission', params: { permission: need } });
    switch (method) {
      case 'runtime.ready':
        return true;

      case 'board.getSelection': {
        boardReadable();
        return snapshots(useBoardStore.getState().selectedIds);
      }
      case 'board.getElements': {
        boardReadable();
        const ids = params.ids;
        if (ids !== undefined && (!Array.isArray(ids) || ids.length > 5000 || ids.some((x) => typeof x !== 'string'))) fail('invalid', { key: 'extensions.api.badParams' });
        return snapshots(ids as string[] | undefined);
      }
      case 'board.subscribe': {
        boardReadable();
        if (params.selection === true) wants.selection = true;
        if (params.elements === true) wants.elements = true;
        subscribe();
        return true;
      }

      case 'board.addElements': {
        boardWritable();
        const v = validateElementInputs(params.elements, API_LIMITS.maxElements);
        if (!v.ok) throw new ApiError('invalid', issuesText(v.issues));
        const st = useBoardStore.getState();
        const els = buildApiElements(v.inputs, (id) => st.elements[id]);
        runAsExtension(via, () => useBoardStore.getState().addElements(els, { select: false }));
        return els.map((e) => e.id).filter((id) => !!useBoardStore.getState().elements[id]);
      }
      case 'board.updateElements': {
        boardWritable();
        const raw = params.patches;
        if (!Array.isArray(raw) || raw.length > API_LIMITS.maxPatches) fail('invalid', { key: 'extensions.api.badParams' });
        const st = useBoardStore.getState();
        const lookup = (id: string) => st.elements[id];
        const patches = (raw as unknown[]).map((p) => {
          if (!p || typeof p !== 'object' || Array.isArray(p) || typeof (p as Record<string, unknown>).id !== 'string') return fail('invalid', { key: 'extensions.api.badParams' });
          const rec = p as Record<string, unknown>;
          const el = st.elements[rec.id as string];
          if (!el || !snapshotOf(el, lookup, viewerOf())) return fail('invalid', { key: 'extensions.api.notFound', params: { id: String(rec.id) } });
          if (el.locked) return fail('locked', { key: 'extensions.api.locked', params: { id: el.id } });
          return { id: el.id, patch: toPatch(el, rec) };
        });
        if (!patches.length) return true;
        runAsExtension(via, () => {
          useBoardStore.getState().pushHistory();
          useBoardStore.getState().updateElements(patches);
        });
        return true;
      }
      case 'board.deleteElements': {
        boardWritable();
        const ids = params.ids;
        if (!Array.isArray(ids) || ids.length > API_LIMITS.maxElements || ids.some((x) => typeof x !== 'string')) fail('invalid', { key: 'extensions.api.badParams' });
        const st = useBoardStore.getState();
        const lookup = (id: string) => st.elements[id];
        for (const id of ids as string[]) {
          const el = st.elements[id];
          if (!el || !snapshotOf(el, lookup, viewerOf())) fail('invalid', { key: 'extensions.api.notFound', params: { id } });
          if (el.locked) fail('locked', { key: 'extensions.api.locked', params: { id } });
        }
        runAsExtension(via, () => useBoardStore.getState().deleteElements(ids as string[]));
        return true;
      }

      case 'ui.registerCommand': {
        const id = params.id;
        if (typeof id !== 'string' || !caller.manifest.contributes?.commands?.some((c) => c.id === id)) fail('invalid', { key: 'extensions.api.undeclared', params: { what: 'command', id: String(id) } });
        caller.onBind?.('command', id as string);
        return true;
      }
      case 'ui.showPanel': {
        const id = params.id;
        if (typeof id !== 'string' || !caller.manifest.contributes?.panels?.some((p) => p.id === id)) fail('invalid', { key: 'extensions.api.undeclared', params: { what: 'panel', id: String(id) } });
        // Chat 08.2: o painel abre na janela flutuante do Estúdio (a API não mudou)
        useExtensionRuntimeStore.getState().setOpenPanel(`${caller.id}/${id as string}`);
        return true;
      }
      case 'ui.notify': {
        const message = params.message;
        if (typeof message !== 'string' || !message.trim()) fail('invalid', { key: 'extensions.api.badParams' });
        const now = Date.now();
        if (now - lastNotify < 1000) return false;
        lastNotify = now;
        const tone = params.kind === 'success' ? 'success' : params.kind === 'danger' ? 'danger' : 'neutral';
        useAppStore.getState().toast(t('extensions.api.notify', { name: caller.name, message: (message as string).slice(0, API_LIMITS.notifyChars) }), tone);
        return true;
      }

      case 'clipboard.onPaste':
        caller.onBind?.('paste', 'paste');
        return true;
      case 'files.onImport': {
        const id = params.id;
        if (id !== undefined && (typeof id !== 'string' || !caller.manifest.contributes?.importers?.some((im) => im.id === id))) fail('invalid', { key: 'extensions.api.undeclared', params: { what: 'importer', id: String(id) } });
        caller.onBind?.('import', (id as string | undefined) ?? '*');
        return true;
      }
      case 'files.onExport': {
        const id = params.id;
        if (typeof id !== 'string' || !caller.manifest.contributes?.exporters?.some((ex) => ex.id === id)) fail('invalid', { key: 'extensions.api.undeclared', params: { what: 'exporter', id: String(id) } });
        caller.onBind?.('export', id as string);
        return true;
      }
      case 'files.offerDownload': {
        const blob = blobFrom(params);
        const d = checkBoardAction('board.export');
        if (!d.allowed) fail('permission', d.reason ?? { key: 'permissions.denied.noAccess' });
        let ok = false;
        runAsExtension(via, () => {
          ok = allowExport({ key: 'board.activity.export.extensionFile', params: { name: caller.name } });
        });
        if (!ok) fail('permission', { key: 'permissions.denied.noAccess' });
        downloadBlob(blob, safeFileName(params.name));
        return true;
      }

      case 'storage.get': {
        const key = params.key;
        if (typeof key !== 'string' || key.length > API_LIMITS.storageKey) fail('invalid', { key: 'extensions.api.badParams' });
        const data = await loadStorage(caller.id);
        // S-32: só valor PRÓPRIO (`constructor` herdado derrubava a extensão)
        return ownValue(data, key as string) ?? null;
      }
      case 'storage.set': {
        const key = params.key;
        if (typeof key !== 'string' || key.length > API_LIMITS.storageKey || isProtoKey(key)) fail('invalid', { key: 'extensions.api.badParams' });
        const data = { ...(await loadStorage(caller.id)) };
        if (params.value === null || params.value === undefined) delete data[key as string];
        else data[key as string] = params.value;
        const size = JSON.stringify(data).length;
        if (size > API_LIMITS.storageBytes) fail('quota', { key: 'extensions.api.storageQuota', params: { kb: API_LIMITS.storageBytes / 1024 } });
        storageCache.set(caller.id, data);
        await boardRepository.setExtensionMeta(`storage:${caller.id}`, data);
        return true;
      }

      case 'network.fetch': {
        const allowlist = caller.manifest.networkAllowlist ?? [];
        try {
          const res = await hostFetch({ url: params.url, init: params.init }, allowlist);
          useExtensionRuntimeStore.getState().logNetwork({ extensionId: caller.id, host: res.host, at: Date.now(), ok: true });
          announceNetwork(caller, res.host);
          return { status: res.status, text: res.text };
        } catch (err) {
          let host = '';
          try {
            host = new URL(String(params.url)).hostname;
          } catch {
            host = String(params.url).slice(0, 80);
          }
          useExtensionRuntimeStore.getState().logNetwork({ extensionId: caller.id, host, at: Date.now(), ok: false });
          throw err;
        }
      }
    }
    return fail('invalid', { key: 'extensions.api.badParams' });
  };

  return {
    handle,
    dispose: () => {
      unsub?.();
      unsub = null;
      if (debounce) clearTimeout(debounce);
    },
  };
}

/** Indicador de rede: avisa na primeira vez (por domínio) em cada sessão. */
const announced = new Set<string>();
function announceNetwork(caller: ApiCaller, host: string): void {
  const key = `${caller.id}|${host}`;
  if (announced.has(key)) return;
  announced.add(key);
  useAppStore.getState().toast(t('extensions.toast.network', { name: caller.name, host }), 'neutral', { durationMs: 6000 });
}

/** Arquivo vindo da extensão (`text` ou `base64`) → Blob, com tipo da allowlist e limite de tamanho. */
export function blobFrom(params: Record<string, unknown>): Blob {
  const mime = typeof params.mime === 'string' && DOWNLOAD_MIME.has(params.mime) ? params.mime : 'text/plain';
  if (typeof params.text === 'string') {
    if (params.text.length > API_LIMITS.downloadBytes) fail('quota', { key: 'extensions.api.fileTooLarge' });
    return new Blob([params.text], { type: `${mime};charset=utf-8` });
  }
  if (typeof params.base64 === 'string') {
    if (params.base64.length > (API_LIMITS.downloadBytes * 4) / 3 + 4) fail('quota', { key: 'extensions.api.fileTooLarge' });
    let bin: string;
    try {
      bin = atob(params.base64);
    } catch {
      return fail('invalid', { key: 'extensions.api.badParams' });
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return fail('invalid', { key: 'extensions.api.badParams' });
}
