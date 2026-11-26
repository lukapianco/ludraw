/**
 * LuDraw — Instalação de extensões (Chat 06.5 · Rodada A · `EXTENSIONS_SPEC.md` §5.7).
 *
 * Fluxo: arquivo/pasta → `readZipPackage`/`readFolderPackage` (caminhos, limites, anti-ZIP-bomb,
 * sha256) → `manifest.json` (UTF-8 estrito) → `validateManifest` (allowlist, licença, contraste…)
 * → arquivos referenciados (`validateAssets`) → política (`explainExtensionInstall`) → comparação
 * com a versão já instalada (publisher diferente = bloqueado) → `InstallPreview`.
 *
 * Nada é gravado aqui: quem confirma e grava (IndexedDB) é `useExtensionsStore.confirmInstall`.
 * Sem `eval`/`new Function`; nenhum arquivo do pacote é executado.
 */
import type { MessageDescriptor } from '../i18n/types';
import { explainExtensionInstall, type PermissionContext } from '../utils/permissions';
import { validateAssets } from './contributions/assets';
import { PACKAGE_LIMITS, readFolderPackage, readZipPackage, shortHash, type PackageContents, type PackageResult } from './package';
import { parseManifestText, scanScriptSource, validateManifest, type ValidationIssue } from './schema';
import type { ExtensionManifest, ExtensionPermission, ExtensionRecord, ExtensionSource } from './types';

export type InstallInput = { kind: 'zip'; file: File } | { kind: 'folder'; files: File[] };

export interface InstallPreview {
  manifest: ExtensionManifest;
  pkg: PackageContents;
  source: Exclude<ExtensionSource, 'builtin'>;
  dev: boolean;
  /** 12 primeiros caracteres do sha256 do pacote (para comparar com o do autor) */
  shortHash: string;
  /** versão já instalada do mesmo id (atualização) */
  existing: ExtensionRecord | null;
  /** permissões pedidas que a versão anterior não tinha */
  newPermissions: ExtensionPermission[];
  /** mesmo conteúdo (hash igual) da versão instalada */
  sameContent: boolean;
}

export type PrepareResult = { ok: true; preview: InstallPreview } | { ok: false; error: MessageDescriptor; issues?: ValidationIssue[] };

export type InspectResult = { ok: true; manifest: ExtensionManifest } | { ok: false; error: MessageDescriptor; issues?: ValidationIssue[] };

/** Valida o manifest e os arquivos de um pacote já lido. */
export function inspectPackage(pkg: Pick<PackageContents, 'files' | 'fileHashes'>, source: ExtensionSource): InspectResult {
  const raw = pkg.files['manifest.json'];
  if (!raw) return { ok: false, error: { key: 'extensions.package.manifestMissing' } };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    return { ok: false, error: { key: 'extensions.package.manifestEncoding' } };
  }
  const parsed = parseManifestText(text);
  if (!parsed.ok) return { ok: false, error: { key: 'extensions.install.invalid' }, issues: parsed.issues };
  const result = validateManifest(parsed.value, { fileHashes: pkg.fileHashes, source });
  if (!result.ok) return { ok: false, error: { key: 'extensions.install.invalid' }, issues: result.issues };
  // Chat 06.5 · B: código dos scripts — UTF-8 estrito e conferência estática (o Worker selado é a garantia real)
  if (result.manifest.kind === 'script') {
    const scriptIssues: ValidationIssue[] = [];
    for (const path of [result.manifest.main, result.manifest.ui]) {
      if (!path) continue;
      try {
        scriptIssues.push(...scanScriptSource(path, new TextDecoder('utf-8', { fatal: true }).decode(pkg.files[path])));
      } catch {
        scriptIssues.push({ path, message: { key: 'extensions.package.manifestEncoding' } });
      }
    }
    if (scriptIssues.length) return { ok: false, error: { key: 'extensions.install.invalid' }, issues: scriptIssues };
  }
  const assetIssues = validateAssets(result.manifest, pkg.files);
  if (assetIssues.length) return { ok: false, error: { key: 'extensions.install.invalid' }, issues: assetIssues };
  return { ok: true, manifest: result.manifest };
}

async function readInput(input: InstallInput): Promise<PackageResult> {
  if (input.kind === 'zip') {
    if (input.file.size > PACKAGE_LIMITS.maxPackageBytes) return { ok: false, error: { key: 'extensions.package.tooLarge', params: { size: PACKAGE_LIMITS.maxPackageBytes / 1024 / 1024 } } };
    return readZipPackage(new Uint8Array(await input.file.arrayBuffer()));
  }
  const files = input.files;
  if (files.length > PACKAGE_LIMITS.maxFiles * 2) return { ok: false, error: { key: 'extensions.package.tooManyFiles', params: { max: PACKAGE_LIMITS.maxFiles } } };
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > PACKAGE_LIMITS.maxTotalUncompressed) return { ok: false, error: { key: 'extensions.package.tooLarge', params: { size: PACKAGE_LIMITS.maxTotalUncompressed / 1024 / 1024 } } };
  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const f of files) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (f.size > PACKAGE_LIMITS.maxFileBytes) return { ok: false, error: { key: 'extensions.package.fileTooLarge', params: { path, size: PACKAGE_LIMITS.maxFileBytes / 1024 / 1024 } } };
    entries.push({ path, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return readFolderPackage(entries);
}

/**
 * Prepara a instalação (ou atualização) sem gravar nada. `ctx` = contexto de permissão do usuário
 * atual (com as políticas do workspace); `existing` = registro já instalado com o mesmo id.
 */
export async function prepareInstall(input: InstallInput, ctx: PermissionContext, findExisting: (id: string) => ExtensionRecord | undefined): Promise<PrepareResult> {
  const read = await readInput(input);
  if (!read.ok) return { ok: false, error: read.error };
  const source = input.kind === 'zip' ? 'file' : 'folder';
  const inspected = inspectPackage(read.pkg, source);
  if (!inspected.ok) return inspected;
  const manifest = inspected.manifest;
  const dev = source === 'folder';
  const decision = explainExtensionInstall(ctx, { id: manifest.id, kind: manifest.kind, dev });
  if (!decision.allowed) return { ok: false, error: decision.reason ?? { key: 'permissions.denied.unknownAction' } };
  const existing = findExisting(manifest.id) ?? null;
  if (existing && existing.source === 'builtin') return { ok: false, error: { key: 'extensions.install.builtinReadOnly' } };
  if (existing && existing.publisher !== manifest.publisher) {
    return { ok: false, error: { key: 'extensions.install.publisherChanged', params: { publisher: manifest.publisher, registered: existing.publisher } } };
  }
  const previous = new Set(existing?.approvedPermissions ?? []);
  return {
    ok: true,
    preview: {
      manifest,
      pkg: read.pkg,
      source,
      dev,
      shortHash: shortHash(read.pkg.packageHash),
      existing,
      newPermissions: manifest.permissions.filter((p) => !previous.has(p)),
      sameContent: !!existing && existing.packageHash === read.pkg.packageHash,
    },
  };
}

/** Registro gravado na instalação (pinning dos hashes). */
export function buildRecord(preview: InstallPreview, userId: string, now = Date.now()): ExtensionRecord {
  const m = preview.manifest;
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    publisher: m.publisher,
    kind: m.kind,
    source: preview.source,
    dev: preview.dev,
    packageHash: preview.pkg.packageHash,
    fileHashes: { ...preview.pkg.fileHashes },
    approvedPermissions: [...m.permissions],
    installedAt: preview.existing?.installedAt ?? now,
    updatedAt: now,
    installedBy: userId,
    // atualização mantém o estado; permissão nova desliga até nova aprovação (EXTENSIONS_SPEC §5.7)
    enabled: preview.existing ? preview.existing.enabled && preview.newPermissions.length === 0 : true,
  };
}
