/**
 * LuDraw — Estado das extensões (Chat 06.5 · Rodada A · `EXTENSIONS_SPEC.md` §5.7–§5.8).
 *
 * - Persistência SÓ pelo `boardRepository` (IndexedDB v2: `extensions`, `extensionFiles`, `meta`);
 *   nada em localStorage. A UI nunca fala com o IndexedDB.
 * - **Pinning:** ao carregar, cada extensão instalada tem os arquivos conferidos contra os hashes
 *   gravados NA INSTALAÇÃO. Divergência → desativada, aviso e registro no Audit Log.
 *   Limite honesto: registro e arquivos ficam no mesmo IndexedDB (protege de corrupção, não de quem
 *   altera os dois); o `publisher` é declarado pelo autor, sem assinatura. A defesa real é comparar
 *   o hash exibido na instalação com o publicado pelo autor.
 * - **Política** (`allowExtensions`, `extensionAllowlist`) e papel por `explainExtension`/`explain`
 *   (motor único `can()`); **Modo Seguro** (`#/?safe=1` ou botão) desliga todas.
 * - Ativar/desativar sem recarregar: `sync()` liga/desliga as contribuições nos registries.
 * - Toda mudança (instalar, atualizar, remover, ativar, desativar, Modo Seguro) vai para o Audit Log
 *   do Workspace (`recordWorkspaceAudit`), com o id de quem fez e o nome da extensão (nunca nome de pessoa).
 */
import { create } from 'zustand';
import { t, translateMessage } from '../i18n';
import { compareText } from '../i18n/format';
import type { MessageDescriptor } from '../i18n/types';
import { BUILTIN_PACKAGES } from '../extensions/builtin';
import { buildRecord, inspectPackage, prepareInstall, type InstallInput, type InstallPreview, type PrepareResult } from '../extensions/loader';
import { listingHash, shortHash, verifyFiles } from '../extensions/package';
import { activateContributions, deactivateContributions } from '../extensions/registry';
import { ThemeRegistry } from '../extensions/registries';
import type { ValidationIssue } from '../extensions/schema';
import type { ExtensionManifest, ExtensionPermission, ExtensionRecord, ExtensionStatus } from '../extensions/types';
import { boardRepository } from '../utils/boardRepository';
import { clearExtensionStorage } from '../extensions/api';
import { isRunning, startExtensionRuntime, stopAllRuntimes, stopExtensionRuntime } from '../extensions/runtime';
import type { KillReason } from '../extensions/host/connection';
import type { TKey } from '../i18n/types';
import { useExtensionRuntimeStore } from './useExtensionRuntimeStore';
import { HashUnavailableError, sha256Bytes } from '../utils/hash';
import { explain, explainExtension, workspaceContext, type PermissionContext, type PermissionDecision } from '../utils/permissions';
import { useAppStore } from './useAppStore';
import { currentViewer, policiesOf } from './workspaceSlice';

export interface InstalledExtension {
  record: ExtensionRecord;
  /** null quando o manifest instalado não pôde ser lido/validado */
  manifest: ExtensionManifest | null;
  status: ExtensionStatus;
  /** motivo do status ≠ ok */
  problem?: MessageDescriptor;
  issues?: ValidationIssue[];
  builtin: boolean;
}

export type ExtensionActionResult = { ok: true } | { ok: false; error: string; needsApproval?: boolean };

interface SafeMode {
  /** aberto com `?safe=1` (vale só nesta aba/sessão) */
  url: boolean;
  /** ligado pelo botão em Configurações (persistido) */
  persisted: boolean;
}

interface ExtensionsState {
  hydrated: boolean;
  /** embutidas primeiro, depois as instaladas (ordem por nome) */
  extensions: InstalledExtension[];
  /** ids com as contribuições ligadas agora */
  activeIds: string[];
  safeMode: SafeMode;
  /** tema escolhido (`"<id da extensão>/<id do tema>"`), mesmo se a extensão estiver desligada */
  themeChoice: string | null;
  /** false = sem IndexedDB: instalações valem só nesta sessão */
  persistent: boolean;

  hydrate: (opts?: { safeUrl?: boolean }) => Promise<void>;
  prepareInstall: (input: InstallInput) => Promise<PrepareResult>;
  confirmInstall: (preview: InstallPreview) => Promise<ExtensionActionResult>;
  remove: (id: string) => Promise<ExtensionActionResult>;
  setEnabled: (id: string, on: boolean) => Promise<ExtensionActionResult>;
  setSafeMode: (on: boolean) => Promise<void>;
  /** Chat 06.5 · B: aprova as permissões pedidas pelo manifest (embutidas: na 1ª ativação) */
  approvePermissions: (id: string) => Promise<ExtensionActionResult>;
  /** Chat 06.5 · B: revoga (ou devolve) uma permissão aprovada — reinicia o Worker */
  setPermission: (id: string, permission: ExtensionPermission, granted: boolean) => Promise<ExtensionActionResult>;
  /** Chat 06.5 · B: tenta de novo depois de um encerramento (timeout/travou) */
  restart: (id: string) => void;
  setTheme: (themeKey: string | null) => Promise<ExtensionActionResult>;
  /** Reaplica política/Modo Seguro: liga e desliga contribuições conforme o estado atual. */
  sync: () => void;
}

/** Chat 06.5 · B: motivo do encerramento de um Worker (texto do aviso). */
export const KILL_REASON_KEYS: Record<KillReason, TKey> = {
  timeout: 'extensions.kill.timeout',
  unresponsive: 'extensions.kill.unresponsive',
  flood: 'extensions.kill.flood',
  error: 'extensions.kill.error',
  stopped: 'extensions.kill.error',
};

/** Permissões em vigor = pedidas pelo manifest ∩ aprovadas pelo usuário (revogáveis). */
export function grantsOf(ext: Pick<InstalledExtension, 'manifest' | 'record'>): ReadonlySet<ExtensionPermission> {
  const approved = new Set(ext.record.approvedPermissions);
  return new Set((ext.manifest?.permissions ?? []).filter((p) => approved.has(p)));
}

/** Arquivos de cada extensão em memória (cópia do IndexedDB ou do pacote embutido). */
const filesById = new Map<string, Record<string, Uint8Array>>();

const META_SAFE_MODE = 'safeMode';
const META_THEME = 'theme';

/** `?safe=1` na URL (busca ou hash) — lido antes do primeiro render. */
export function safeModeFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('safe');
    const hashQuery = window.location.hash.split('?')[1];
    const fromHash = hashQuery ? new URLSearchParams(hashQuery).get('safe') : null;
    return fromSearch === '1' || fromHash === '1';
  } catch {
    return false;
  }
}

/** Contexto de permissão do usuário atual (com "Visualizar como…" e visitante do link público). */
export function extensionContext(): PermissionContext {
  const s = useAppStore.getState();
  const ctx = workspaceContext(currentViewer(s), policiesOf(s));
  return s.linkSession ? { ...ctx, workspaceRole: 'visitor' } : ctx;
}

const denialText = (d: PermissionDecision): string => (d.reason ? translateMessage(d.reason) : t('permissions.denied.unknownAction'));

function audit(action: Parameters<ReturnType<typeof useAppStore.getState>['recordWorkspaceAudit']>[0], key: string, ext: { id: string; name: string }, params: Record<string, string | number> = {}): void {
  useAppStore.getState().recordWorkspaceAudit(action, { key, params }, { targetType: 'extension', targetId: ext.id, targetName: ext.name });
}

let channel: BroadcastChannel | null = null;
function announce(): void {
  try {
    channel?.postMessage({ type: 'changed' });
  } catch {
    /* sem canal */
  }
}

function sortExtensions(list: InstalledExtension[]): InstalledExtension[] {
  return [...list].sort((a, b) => Number(b.builtin) - Number(a.builtin) || compareText(a.record.name, b.record.name));
}

/** Registro padrão (desligado) de uma embutida que o usuário ainda não tocou. */
function builtinRecord(manifest: ExtensionManifest, fileHashes: Record<string, string>, packageHash: string, stored?: ExtensionRecord): ExtensionRecord {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher,
    kind: manifest.kind,
    source: 'builtin',
    dev: false,
    packageHash,
    fileHashes,
    // Chat 06.5 · B: embutida programável começa SEM permissões aprovadas (a 1ª ativação abre a tela de aprovação)
    approvedPermissions: stored?.approvedPermissions ?? (manifest.kind === 'script' ? [] : [...manifest.permissions]),
    installedAt: stored?.installedAt ?? 0,
    updatedAt: stored?.updatedAt ?? 0,
    installedBy: stored?.installedBy ?? '',
    enabled: stored?.enabled ?? false,
  };
}

async function loadBuiltins(stored: Map<string, ExtensionRecord>): Promise<InstalledExtension[]> {
  const out: InstalledExtension[] = [];
  for (const pkg of BUILTIN_PACKAGES) {
    const fileHashes: Record<string, string> = {};
    try {
      for (const [path, bytes] of Object.entries(pkg.files)) fileHashes[path] = await sha256Bytes(bytes);
    } catch {
      /* sem SHA-256: a embutida vem do próprio app, segue sem hash exibido */
    }
    const inspected = inspectPackage({ files: pkg.files, fileHashes }, 'builtin');
    if (!inspected.ok) {
      // embutida inválida é erro de desenvolvimento: aparece desativada com o motivo
      console.error(`[extensions] invalid built-in package: ${pkg.folder}`, inspected.issues);
      continue;
    }
    const m = inspected.manifest;
    const packageHash = Object.keys(fileHashes).length ? await listingHash(fileHashes).catch(() => '') : '';
    filesById.set(m.id, pkg.files);
    out.push({ record: builtinRecord(m, fileHashes, packageHash, stored.get(m.id)), manifest: m, status: 'ok', builtin: true });
  }
  return out;
}

async function loadInstalled(record: ExtensionRecord): Promise<InstalledExtension> {
  let files: Record<string, Uint8Array> = {};
  try {
    files = await boardRepository.loadExtensionFiles(record.id);
  } catch {
    files = {};
  }
  try {
    const check = await verifyFiles(files, record.fileHashes);
    if (!check.ok) return { record, manifest: null, status: 'tampered', problem: { key: 'extensions.status.tampered', params: { file: check.file } }, builtin: false };
  } catch (err) {
    const key = err instanceof HashUnavailableError ? 'extensions.package.hashUnavailable' : 'extensions.package.readError';
    return { record, manifest: null, status: 'invalid', problem: { key }, builtin: false };
  }
  const inspected = inspectPackage({ files, fileHashes: record.fileHashes }, record.source);
  if (!inspected.ok) return { record, manifest: null, status: 'invalid', problem: inspected.error, issues: inspected.issues, builtin: false };
  filesById.set(record.id, files);
  return { record, manifest: inspected.manifest, status: 'ok', builtin: false };
}

export const useExtensionsStore = create<ExtensionsState>((set, get) => {
  const setState = set;
  const find = (id: string) => get().extensions.find((e) => e.record.id === id);
  const manageDenied = (): string | null => {
    const d = explain(extensionContext(), 'extensions.manage');
    return d.allowed ? null : denialText(d);
  };
  const replace = (ext: InstalledExtension) =>
    set((s) => ({ extensions: sortExtensions([...s.extensions.filter((e) => e.record.id !== ext.record.id), ext]) }));
  const userId = () => useAppStore.getState().session.userId;

  return {
    hydrated: false,
    extensions: [],
    activeIds: [],
    safeMode: { url: false, persisted: false },
    themeChoice: null,
    persistent: true,

    hydrate: async (opts) => {
      if (typeof BroadcastChannel !== 'undefined' && !channel) {
        channel = new BroadcastChannel('ludraw-extensions');
        channel.addEventListener('message', () => void get().hydrate());
      }
      const records = await boardRepository.listExtensionRecords();
      const stored = new Map(records.map((r) => [r.id, r]));
      const builtins = await loadBuiltins(stored);
      const builtinIds = new Set(builtins.map((b) => b.record.id));
      const installed: InstalledExtension[] = [];
      for (const r of records) {
        if (r.source === 'builtin' || builtinIds.has(r.id)) continue;
        const ext = await loadInstalled(r);
        if (ext.status === 'tampered' && r.enabled) {
          // pinning: arquivo alterado depois da instalação → desativa, avisa e registra
          ext.record = { ...r, enabled: false };
          await boardRepository.saveExtension(ext.record).catch(() => undefined);
          audit('extension_disabled', 'workspace.audit.msg.extensionTampered', r, { file: String(ext.problem?.params?.file ?? '') });
          useAppStore.getState().toast(t('extensions.toast.tampered', { name: r.name }), 'danger', { detail: t('extensions.toast.tamperedDetail'), durationMs: 12000 });
        }
        installed.push(ext);
      }
      const persisted = (await boardRepository.getExtensionMeta<boolean>(META_SAFE_MODE)) === true;
      const themeChoice = (await boardRepository.getExtensionMeta<string>(META_THEME)) ?? null;
      set((s) => ({
        hydrated: true,
        extensions: sortExtensions([...builtins, ...installed]),
        safeMode: { url: opts?.safeUrl ?? s.safeMode.url, persisted },
        themeChoice,
        persistent: boardRepository.extensionsPersistent,
      }));
      get().sync();
    },

    sync: () => {
      const s = get();
      if (!s.hydrated) return;
      const safe = s.safeMode.url || s.safeMode.persisted;
      // Modo Seguro = kill-switch geral: encerra TODO Worker de extensão desta aba
      if (safe) stopAllRuntimes();
      const ctx = extensionContext();
      const want = new Set<string>();
      for (const ext of s.extensions) {
        if (safe || !ext.record.enabled || ext.status !== 'ok' || !ext.manifest) continue;
        if (!explainExtension(ctx, { id: ext.record.id, kind: ext.record.kind, dev: ext.record.dev }).allowed) continue;
        want.add(ext.record.id);
      }
      const active = new Set(s.activeIds);
      for (const id of active) {
        if (want.has(id)) continue;
        stopExtensionRuntime(id);
        deactivateContributions(id);
      }
      const nowActive: string[] = [];
      for (const ext of s.extensions) {
        const id = ext.record.id;
        if (!want.has(id) || !ext.manifest) continue;
        if (!active.has(id)) {
          try {
            activateContributions(ext.manifest, filesById.get(id) ?? {});
          } catch (err) {
            console.error(`[extensions] could not activate ${id}`, err);
            useAppStore.getState().toast(t('extensions.toast.activateFailed', { name: ext.record.name }), 'danger');
            continue;
          }
        }
        nowActive.push(id);
        // Chat 06.5 · B: extensão programável → Worker isolado (não reinicia sozinha depois de encerrada)
        if (ext.manifest.kind === 'script' && !isRunning(id) && useExtensionRuntimeStore.getState().states[id]?.state !== 'killed') {
          const name = ext.record.name;
          try {
            startExtensionRuntime({
              manifest: ext.manifest,
              files: filesById.get(id) ?? {},
              grants: grantsOf(ext),
              onKilled: (reason) => useAppStore.getState().toast(t('extensions.toast.killed', { name }), 'danger', { detail: t(KILL_REASON_KEYS[reason] ?? 'extensions.kill.error'), durationMs: 10000 }),
            });
          } catch (err) {
            console.error(`[extensions] could not start ${id}`, err);
            useExtensionRuntimeStore.getState().setState(id, 'killed', 'error');
          }
        }
      }
      if (nowActive.join('|') !== s.activeIds.join('|')) set({ activeIds: nowActive });
    },

    prepareInstall: async (input) => {
      const denied = manageDenied();
      if (denied) return { ok: false, error: explain(extensionContext(), 'extensions.manage').reason ?? { key: 'permissions.denied.unknownAction' } };
      return prepareInstall(input, extensionContext(), (id) => find(id)?.record);
    },

    confirmInstall: async (preview) => {
      const denied = manageDenied();
      if (denied) return { ok: false, error: denied };
      const current = find(preview.manifest.id);
      if (current?.builtin) return { ok: false, error: t('extensions.install.builtinReadOnly') };
      if (current && current.record.publisher !== preview.manifest.publisher) {
        return { ok: false, error: t('extensions.install.publisherChanged', { publisher: preview.manifest.publisher, registered: current.record.publisher }) };
      }
      const record = buildRecord(preview, userId());
      try {
        await boardRepository.saveExtension(record, preview.pkg.files);
      } catch {
        return { ok: false, error: t('extensions.install.saveFailed') };
      }
      filesById.set(record.id, preview.pkg.files);
      // reinstalar troca as contribuições: desliga a versão antiga antes do sync religar
      deactivateContributions(record.id);
      set((s) => ({ activeIds: s.activeIds.filter((id) => id !== record.id) }));
      replace({ record, manifest: preview.manifest, status: 'ok', builtin: false });
      if (preview.existing) audit('extension_updated', 'workspace.audit.msg.extensionUpdated', record, { from: preview.existing.version, version: record.version, hash: preview.shortHash });
      else audit('extension_installed', 'workspace.audit.msg.extensionInstalled', record, { version: record.version, hash: preview.shortHash });
      get().sync();
      announce();
      return { ok: true };
    },

    remove: async (id) => {
      const denied = manageDenied();
      if (denied) return { ok: false, error: denied };
      const ext = find(id);
      if (!ext) return { ok: true };
      if (ext.builtin) return { ok: false, error: t('extensions.install.builtinReadOnly') };
      try {
        await boardRepository.deleteExtension(id);
      } catch {
        return { ok: false, error: t('extensions.install.saveFailed') };
      }
      stopExtensionRuntime(id);
      deactivateContributions(id);
      filesById.delete(id);
      await clearExtensionStorage(id);
      set((s) => ({ extensions: s.extensions.filter((e) => e.record.id !== id), activeIds: s.activeIds.filter((x) => x !== id) }));
      audit('extension_removed', 'workspace.audit.msg.extensionRemoved', ext.record);
      announce();
      return { ok: true };
    },

    setEnabled: async (id, on) => {
      const ext = find(id);
      if (!ext) return { ok: false, error: t('extensions.install.notFound') };
      // desligar é sempre permitido (segurança); ligar passa por papel + política + integridade
      if (on) {
        const denied = manageDenied();
        if (denied) return { ok: false, error: denied };
        if (ext.status !== 'ok' || !ext.manifest) return { ok: false, error: ext.problem ? translateMessage(ext.problem) : t('extensions.status.invalid') };
        const d = explainExtension(extensionContext(), { id, kind: ext.record.kind, dev: ext.record.dev });
        if (!d.allowed) return { ok: false, error: denialText(d) };
        // Chat 06.5 · B: permissões nunca aprovadas (embutida programável na 1ª vez) → tela de aprovação
        if (ext.manifest.permissions.some((perm) => !ext.record.approvedPermissions.includes(perm)) && ext.builtin && !ext.record.installedAt) {
          return { ok: false, error: t('extensions.permissions.needApproval'), needsApproval: true };
        }
      }
      if (ext.record.enabled === on) return { ok: true };
      const now = Date.now();
      const record: ExtensionRecord = { ...ext.record, enabled: on, updatedAt: now, ...(ext.builtin && !ext.record.installedAt ? { installedAt: now, installedBy: userId() } : {}) };
      try {
        await boardRepository.saveExtension(record);
      } catch {
        return { ok: false, error: t('extensions.install.saveFailed') };
      }
      replace({ ...ext, record });
      audit(on ? 'extension_enabled' : 'extension_disabled', on ? 'workspace.audit.msg.extensionEnabled' : 'workspace.audit.msg.extensionDisabled', record);
      get().sync();
      announce();
      return { ok: true };
    },

    approvePermissions: async (id) => {
      const denied = manageDenied();
      if (denied) return { ok: false, error: denied };
      const ext = find(id);
      if (!ext || !ext.manifest) return { ok: false, error: t('extensions.install.notFound') };
      const now = Date.now();
      const record: ExtensionRecord = {
        ...ext.record,
        approvedPermissions: [...ext.manifest.permissions],
        enabled: true,
        updatedAt: now,
        ...(!ext.record.installedAt ? { installedAt: now, installedBy: userId() } : {}),
      };
      try {
        await boardRepository.saveExtension(record);
      } catch {
        return { ok: false, error: t('extensions.install.saveFailed') };
      }
      stopExtensionRuntime(id);
      replace({ ...ext, record });
      audit('extension_permissions_changed', 'workspace.audit.msg.extensionPermissionsApproved', record, { permissions: record.approvedPermissions.join(', ') || '—' });
      audit('extension_enabled', 'workspace.audit.msg.extensionEnabled', record);
      get().sync();
      announce();
      return { ok: true };
    },

    setPermission: async (id, permission, granted) => {
      const ext = find(id);
      if (!ext || !ext.manifest) return { ok: false, error: t('extensions.install.notFound') };
      // revogar é sempre permitido; devolver passa por quem pode gerenciar
      if (granted) {
        const denied = manageDenied();
        if (denied) return { ok: false, error: denied };
        if (!ext.manifest.permissions.includes(permission)) return { ok: false, error: t('extensions.permissions.notRequested') };
      }
      const set = new Set(ext.record.approvedPermissions);
      if (granted) set.add(permission);
      else set.delete(permission);
      const record: ExtensionRecord = { ...ext.record, approvedPermissions: ext.manifest.permissions.filter((p) => set.has(p)), updatedAt: Date.now() };
      try {
        await boardRepository.saveExtension(record);
      } catch {
        return { ok: false, error: t('extensions.install.saveFailed') };
      }
      stopExtensionRuntime(id);
      deactivateContributions(id);
      replace({ ...ext, record });
      setState((st) => ({ activeIds: st.activeIds.filter((x) => x !== id) }));
      audit('extension_permissions_changed', granted ? 'workspace.audit.msg.extensionPermissionGranted' : 'workspace.audit.msg.extensionPermissionRevoked', record, { permission });
      get().sync();
      announce();
      return { ok: true };
    },

    restart: (id) => {
      stopExtensionRuntime(id);
      useExtensionRuntimeStore.getState().clear(id);
      deactivateContributions(id);
      setState((st) => ({ activeIds: st.activeIds.filter((x) => x !== id) }));
      get().sync();
    },

    setSafeMode: async (on) => {
      if (get().safeMode.persisted === on) return;
      await boardRepository.setExtensionMeta(META_SAFE_MODE, on ? true : null).catch(() => undefined);
      set((s) => ({ safeMode: { ...s.safeMode, persisted: on } }));
      audit('extensions_safe_mode', on ? 'workspace.audit.msg.safeModeOn' : 'workspace.audit.msg.safeModeOff', { id: 'safe-mode', name: '' });
      get().sync();
      announce();
    },

    setTheme: async (themeKey) => {
      if (themeKey !== null && !ThemeRegistry.has(themeKey)) return { ok: false, error: t('extensions.theme.unavailable') };
      await boardRepository.setExtensionMeta(META_THEME, themeKey).catch(() => undefined);
      set({ themeChoice: themeKey });
      announce();
      return { ok: true };
    },
  };
});

/** Tema efetivo agora (null = tema do núcleo): a escolha só vale se a extensão estiver ativa. */
export function effectiveThemeKey(s: Pick<ExtensionsState, 'themeChoice' | 'activeIds'>): string | null {
  if (!s.themeChoice) return null;
  const extId = s.themeChoice.split('/')[0];
  return s.activeIds.includes(extId) && ThemeRegistry.has(s.themeChoice) ? s.themeChoice : null;
}

/** Reaplica a política quando a organização, a sessão ou "Visualizar como…" mudam. */
let lastPolicyKey = '';
useAppStore.subscribe((s) => {
  const key = JSON.stringify([s.workspace.policies?.allowExtensions, s.workspace.policies?.extensionAllowlist, s.session.userId, s.session.workspaceRole, s.session.viewAs, !!s.linkSession]);
  if (key === lastPolicyKey) return;
  lastPolicyKey = key;
  useExtensionsStore.getState().sync();
});

/** Hash curto para exibir. */
export { shortHash };
