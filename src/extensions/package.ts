/**
 * LuDraw — Leitura de pacotes de extensão (Chat 06.5 · Rodada A · `EXTENSIONS_SPEC.md` §3 e §5.7).
 *
 * Entrada: `.ludraw-ext` (ZIP, lido pelo leitor próprio `utils/zip.ts`) ou pasta (modo
 * desenvolvimento). Saída: arquivos por caminho normalizado + sha256 de cada arquivo e do pacote.
 *
 * Segurança:
 * - caminhos: recusa `..`, `.`, absolutos, `\`, `:`, caracteres de controle, nomes repetidos que só
 *   diferem por maiúsculas/minúsculas, arquivos fora de `manifest.json`/`LICENSE*`/`README.md`/`assets/**`
 *   e qualquer `.js` (pacote declarativo não tem código);
 * - anti-ZIP-bomb: tamanho do pacote, nº de arquivos, bytes por arquivo e total, e taxa de compressão,
 *   todos medidos sobre os bytes REAIS durante a descompressão;
 * - sha256 obrigatório (`crypto.subtle`); sem ele a instalação é recusada.
 */
import type { MessageDescriptor } from '../i18n/types';
import { HashUnavailableError, sha256Bytes } from '../utils/hash';
import { isZipBytes, ZipArchive, ZipError } from '../utils/zip';

export const PACKAGE_LIMITS = {
  /** Tamanho do arquivo `.ludraw-ext` */
  maxPackageBytes: 5 * 1024 * 1024,
  /** Soma dos arquivos descompactados */
  maxTotalUncompressed: 8 * 1024 * 1024,
  maxFiles: 200,
  maxFileBytes: 2 * 1024 * 1024,
  /** descompactado ÷ compactado, por arquivo */
  maxCompressionRatio: 100,
  /** a taxa só é cobrada depois de 64 KB produzidos (arquivo pequeno comprime muito) */
  ratioFloorBytes: 64 * 1024,
  maxPathLength: 160,
  maxDepth: 5,
} as const;

export interface PackageContents {
  /** Caminho normalizado → bytes */
  files: Record<string, Uint8Array>;
  /** Caminho normalizado → sha256 hex */
  fileHashes: Record<string, string>;
  /** ZIP: sha256 do arquivo inteiro · pasta: sha256 da lista ordenada `caminho:hash` */
  packageHash: string;
  totalBytes: number;
}

export type PackageResult = { ok: true; pkg: PackageContents } | { ok: false; error: MessageDescriptor };

const ROOT_FILES = ['manifest.json', 'LICENSE', 'LICENSE.txt', 'LICENSE.md', 'README.md'];
const ASSET_EXT = /\.(svg|png|webp|json|txt|md)$/i;
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;
/** Lixo comum de sistemas operacionais: ignorado (não entra no pacote). */
const IGNORED = /(^|\/)(__MACOSX\/.*|\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

const fail = (key: MessageDescriptor['key'], params?: MessageDescriptor['params']): PackageResult => ({ ok: false, error: params ? { key, params } : { key } });

/**
 * Confere e normaliza os nomes do pacote. Devolve `nome original → caminho normalizado`.
 * Uma pasta raiz comum (ex.: `minha-ext/manifest.json`) é removida.
 */
export function checkPackagePaths(rawNames: readonly string[]): { ok: true; paths: Map<string, string> } | { ok: false; error: MessageDescriptor } {
  const names = rawNames.filter((n) => !n.endsWith('/') && !IGNORED.test(n));
  for (const n of names) {
    if (!n || n.startsWith('/') || n.includes('\\') || n.includes(':') || /[\u0000-\u001f\u007f]/.test(n)) return { ok: false, error: { key: 'extensions.package.unsafePath', params: { path: n.slice(0, 120) } } };
    const segs = n.split('/');
    if (segs.some((s) => s === '' || s === '.' || s === '..')) return { ok: false, error: { key: 'extensions.package.unsafePath', params: { path: n.slice(0, 120) } } };
  }
  if (!names.length) return { ok: false, error: { key: 'extensions.package.empty' } };
  if (names.length > PACKAGE_LIMITS.maxFiles) return { ok: false, error: { key: 'extensions.package.tooManyFiles', params: { max: PACKAGE_LIMITS.maxFiles } } };

  // pasta raiz comum (zip feito a partir da pasta, ou pasta escolhida no navegador)
  let strip = 0;
  if (!names.includes('manifest.json')) {
    const first = names[0].split('/')[0];
    if (names.every((n) => n.includes('/') && n.split('/')[0] === first)) strip = first.length + 1;
  }

  const paths = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const raw of names) {
    const path = raw.slice(strip);
    if (path.length > PACKAGE_LIMITS.maxPathLength) return { ok: false, error: { key: 'extensions.package.unsafePath', params: { path: path.slice(0, 120) } } };
    // Chat 06.5 · B: código só nos dois lugares do Nível 2 (`main.js` e `ui/<nome>.html`); o validador recusa código em pacote declarativo
    const scriptPath = path === 'main.js' || /^ui\/[a-z0-9][a-z0-9-]{0,40}\.html$/.test(path);
    if (!scriptPath && /\.(m?js|cjs|ts|html?|wasm)$/i.test(path)) return { ok: false, error: { key: 'extensions.package.scriptFile', params: { path } } };
    const segs = path.split('/');
    const allowed = scriptPath || ROOT_FILES.includes(path) || (segs[0] === 'assets' && segs.length >= 2 && segs.length <= PACKAGE_LIMITS.maxDepth && segs.every((s) => SEGMENT.test(s)) && ASSET_EXT.test(path));
    if (!allowed) return { ok: false, error: { key: 'extensions.package.fileNotAllowed', params: { path } } };
    const lower = path.toLowerCase();
    if (seen.has(lower)) return { ok: false, error: { key: 'extensions.package.duplicateName', params: { path } } };
    seen.set(lower, path);
    paths.set(raw, path);
  }
  if (![...paths.values()].includes('manifest.json')) return { ok: false, error: { key: 'extensions.package.manifestMissing' } };
  return { ok: true, paths };
}

async function hashAll(files: Record<string, Uint8Array>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) out[path] = await sha256Bytes(bytes);
  return out;
}

/** Hash canônico de um conjunto de arquivos (pastas): lista ordenada `caminho:hash`. */
export async function listingHash(fileHashes: Record<string, string>): Promise<string> {
  const listing = Object.keys(fileHashes)
    .sort()
    .map((p) => `${p}:${fileHashes[p]}\n`)
    .join('');
  return sha256Bytes(new TextEncoder().encode(listing));
}

async function guarded(fn: () => Promise<PackageResult>): Promise<PackageResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HashUnavailableError) return fail('extensions.package.hashUnavailable');
    if (err instanceof ZipError) return fail('extensions.package.zipError', { detail: err.message });
    return fail('extensions.package.readError');
  }
}

/** Lê um `.ludraw-ext` (ZIP). */
export function readZipPackage(bytes: Uint8Array): Promise<PackageResult> {
  return guarded(async () => {
    if (bytes.byteLength > PACKAGE_LIMITS.maxPackageBytes) return fail('extensions.package.tooLarge', { size: PACKAGE_LIMITS.maxPackageBytes / 1024 / 1024 });
    if (!isZipBytes(bytes)) return fail('extensions.package.notZip');
    const zip = ZipArchive.open(bytes, {
      maxEntries: PACKAGE_LIMITS.maxFiles * 2,
      maxTotalUncompressed: PACKAGE_LIMITS.maxTotalUncompressed,
      maxEntryUncompressed: PACKAGE_LIMITS.maxFileBytes,
      maxCompressionRatio: PACKAGE_LIMITS.maxCompressionRatio,
      ratioFloorBytes: PACKAGE_LIMITS.ratioFloorBytes,
    });
    if (zip.unsafeNames.length) return fail('extensions.package.unsafePath', { path: zip.unsafeNames[0].slice(0, 120) });
    if (zip.entries.some((e) => e.encrypted)) return fail('extensions.package.encrypted');
    const checked = checkPackagePaths(zip.names());
    if (!checked.ok) return { ok: false, error: checked.error };
    const files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const [raw, path] of checked.paths) {
      const data = await zip.readBytes(raw);
      total += data.byteLength;
      files[path] = data;
    }
    const fileHashes = await hashAll(files);
    return { ok: true, pkg: { files, fileHashes, packageHash: await sha256Bytes(bytes), totalBytes: total } };
  });
}

/** Lê uma pasta escolhida no navegador (modo desenvolvimento). */
export function readFolderPackage(entries: ReadonlyArray<{ path: string; bytes: Uint8Array }>): Promise<PackageResult> {
  return guarded(async () => {
    const checked = checkPackagePaths(entries.map((e) => e.path));
    if (!checked.ok) return { ok: false, error: checked.error };
    const files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const e of entries) {
      const path = checked.paths.get(e.path);
      if (!path) continue;
      if (e.bytes.byteLength > PACKAGE_LIMITS.maxFileBytes) return fail('extensions.package.fileTooLarge', { path, size: PACKAGE_LIMITS.maxFileBytes / 1024 / 1024 });
      total += e.bytes.byteLength;
      if (total > PACKAGE_LIMITS.maxTotalUncompressed) return fail('extensions.package.tooLarge', { size: PACKAGE_LIMITS.maxTotalUncompressed / 1024 / 1024 });
      files[path] = e.bytes;
    }
    const fileHashes = await hashAll(files);
    return { ok: true, pkg: { files, fileHashes, packageHash: await listingHash(fileHashes), totalBytes: total } };
  });
}

/** Confere arquivos instalados contra os hashes gravados na instalação (pinning). */
export async function verifyFiles(files: Record<string, Uint8Array>, expected: Record<string, string>): Promise<{ ok: true } | { ok: false; file: string }> {
  const expectedPaths = Object.keys(expected);
  for (const path of expectedPaths) {
    const bytes = files[path];
    if (!bytes) return { ok: false, file: path };
    if ((await sha256Bytes(bytes)) !== expected[path]) return { ok: false, file: path };
  }
  for (const path of Object.keys(files)) if (!(path in expected)) return { ok: false, file: path };
  return { ok: true };
}

/** 12 primeiros caracteres do hash (para o usuário comparar com o do autor). */
export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
