import { t } from '../i18n';
/**
 * LuDraw — Leitor mínimo e seguro de arquivos ZIP (Chat 05), usado para ler planilhas
 * `.xlsx` (OOXML) e `.ods` (ODF), que são pacotes ZIP de arquivos XML.
 *
 * Escrito do zero a partir da especificação pública do formato ZIP (PKWARE APPNOTE): diretório
 * central + cabeçalhos locais. A descompressão usa a API NATIVA do navegador
 * `DecompressionStream('deflate-raw')` — nenhuma dependência nova.
 *
 * Segurança (arquivos maliciosos):
 * - só métodos 0 (armazenado) e 8 (deflate); entradas cifradas e ZIP64 são recusadas;
 * - orçamento GLOBAL de bytes descompactados (padrão 50 MB), conferido durante o fluxo — a leitura
 *   é abortada assim que passa do limite (protege contra "zip bomb");
 * - limite de entradas, nomes com `..` ignorados (e listados em `unsafeNames`) e CRC-32 conferido;
 * - Chat 06.5 (pacotes de extensão): limites opcionais por ENTRADA e de TAXA DE COMPRESSÃO, ambos
 *   medidos sobre os bytes REAIS produzidos durante o fluxo (nunca sobre o tamanho declarado).
 */

export interface ZipLimits {
  /** Soma máxima de bytes descompactados lidos do pacote */
  maxTotalUncompressed: number;
  maxEntries: number;
  /** Chat 06.5: bytes descompactados máximos de UMA entrada (medidos no fluxo) */
  maxEntryUncompressed?: number;
  /** Chat 06.5: taxa máxima descompactado/compactado de uma entrada (medida no fluxo) */
  maxCompressionRatio?: number;
  /** Chat 06.5: a taxa só é cobrada depois de produzir este tanto de bytes (arquivos pequenos comprimem muito) */
  ratioFloorBytes?: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxTotalUncompressed: 50 * 1024 * 1024, maxEntries: 4000 };

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  encrypted: boolean;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

/** CRC-32 (polinômio IEEE 802.3), usado pelo ZIP para conferir cada entrada. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  const t = crcTable();
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type InflateCtor = new (format: string) => TransformStream<Uint8Array, Uint8Array>;

function nativeInflate(): InflateCtor {
  const ctor = (globalThis as unknown as { DecompressionStream?: InflateCtor }).DecompressionStream;
  if (!ctor) throw new ZipError(t('importexport.zip.thisBrowserCantUnzipFiles'));
  return ctor;
}

export class ZipArchive {
  private used = 0;
  private readonly byName = new Map<string, ZipEntry>();
  private readonly bytes: Uint8Array;
  readonly entries: ZipEntry[];
  private readonly limits: ZipLimits;
  /** Chat 06.5: nomes recusados por segurança (`..`), para quem quiser recusar o pacote inteiro */
  readonly unsafeNames: string[];

  private constructor(bytes: Uint8Array, entries: ZipEntry[], limits: ZipLimits, unsafeNames: string[]) {
    this.bytes = bytes;
    this.entries = entries;
    this.limits = limits;
    this.unsafeNames = unsafeNames;
    for (const e of entries) this.byName.set(normalizeName(e.name), e);
  }

  /** Lê o diretório central. Não descompacta nada ainda. */
  static open(bytes: Uint8Array, limits: Partial<ZipLimits> = {}): ZipArchive {
    const lim = { ...DEFAULT_ZIP_LIMITS, ...limits };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.byteLength;
    if (len < 22) throw new ZipError(t('importexport.zip.emptyCorruptedFile'));
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
      if (view.getUint32(i, true) === SIG_EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError(t('importexport.zip.notValidZipPackageSpreadsheet'));
    const count = view.getUint16(eocd + 10, true);
    const cdSize = view.getUint32(eocd + 12, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) throw new ZipError(t('importexport.zip.zip64PackageNotSupportedFile'));
    if (count > lim.maxEntries) throw new ZipError(t('importexport.zip.thePackageHasCountInternal', { count, maxEntries: lim.maxEntries }));
    if (cdOffset + cdSize > len) throw new ZipError(t('importexport.zip.zipDirectoryOutsideFileCorrupted'));
    const entries: ZipEntry[] = [];
    const unsafe: string[] = [];
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (p + 46 > len || view.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError(t('importexport.zip.corruptedZipDirectory'));
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      const crc = view.getUint32(p + 16, true);
      const compressedSize = view.getUint32(p + 20, true);
      const uncompressedSize = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localHeaderOffset = view.getUint32(p + 42, true);
      const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
      const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'windows-1252').decode(nameBytes);
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) throw new ZipError(t('importexport.zip.zip64PackageNotSupported'));
      if (!name.includes('..')) entries.push({ name, method, compressedSize, uncompressedSize, crc32: crc, localHeaderOffset, encrypted: (flags & 1) === 1 });
      else unsafe.push(name);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipArchive(bytes, entries, lim, unsafe);
  }

  has(name: string): boolean {
    return this.byName.has(normalizeName(name));
  }

  /** Nomes das entradas (para depuração e para listar `xl/worksheets/*`). */
  names(): string[] {
    return this.entries.map((e) => e.name);
  }

  /** Bytes descompactados já consumidos do orçamento. */
  get bytesRead(): number {
    return this.used;
  }

  async readBytes(name: string): Promise<Uint8Array> {
    const entry = this.byName.get(normalizeName(name));
    if (!entry) throw new ZipError(t('importexport.zip.missingInternalFileName', { name }));
    if (entry.encrypted) throw new ZipError(t('importexport.zip.theSpreadsheetPasswordProtectedRemove'));
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const h = entry.localHeaderOffset;
    if (h + 30 > this.bytes.byteLength || view.getUint32(h, true) !== SIG_LOCAL) throw new ZipError(t('importexport.zip.corruptedZipLocalHeader'));
    const start = h + 30 + view.getUint16(h + 26, true) + view.getUint16(h + 28, true);
    const end = start + entry.compressedSize;
    if (end > this.bytes.byteLength) throw new ZipError(t('importexport.zip.zipEntryOutsideFileCorrupted'));
    const remaining = this.limits.maxTotalUncompressed - this.used;
    if (entry.uncompressedSize > remaining) throw new ZipError(limitMessage(this.limits));
    const entryMax = this.limits.maxEntryUncompressed;
    if (entryMax !== undefined && entry.uncompressedSize > entryMax) throw new ZipError(entryLimitMessage(entry.name, entryMax));
    const raw = this.bytes.subarray(start, end);
    let out: Uint8Array;
    if (entry.method === 0) {
      if (raw.byteLength > remaining) throw new ZipError(limitMessage(this.limits));
      if (entryMax !== undefined && raw.byteLength > entryMax) throw new ZipError(entryLimitMessage(entry.name, entryMax));
      out = raw.slice();
    } else if (entry.method === 8) {
      out = await inflateRaw(raw, remaining, this.limits, entry.name);
    } else {
      throw new ZipError(t('importexport.zip.compressionMethodMethodNotSupported', { method: entry.method }));
    }
    this.used += out.byteLength;
    if (out.byteLength !== entry.uncompressedSize || crc32(out) !== entry.crc32) throw new ZipError(t('importexport.zip.corruptedContentNameCrcCheck', { name: entry.name }));
    return out;
  }

  async readText(name: string): Promise<string> {
    return new TextDecoder('utf-8').decode(await this.readBytes(name));
  }
}

function normalizeName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function entryLimitMessage(name: string, max: number): string {
  return t('importexport.zip.entryTooLarge', { name, size: Math.round((max / 1024 / 1024) * 10) / 10 });
}

function limitMessage(l: ZipLimits): string {
  return t('importexport.zip.theUnzippedSpreadsheetOverRound', { round: Math.round(l.maxTotalUncompressed / (1024 * 1024)) });
}

/**
 * Inflate (deflate "cru") com orçamento: aborta assim que a saída REAL passa de `budget` bytes, do
 * limite por entrada ou da taxa de compressão (Chat 06.5) — o tamanho declarado no ZIP não é confiável.
 */
async function inflateRaw(input: Uint8Array, budget: number, limits: ZipLimits, name: string): Promise<Uint8Array> {
  const Ctor = nativeInflate();
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new Ctor('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > budget) {
        await reader.cancel();
        throw new ZipError(limitMessage(limits));
      }
      if (limits.maxEntryUncompressed !== undefined && total > limits.maxEntryUncompressed) {
        await reader.cancel();
        throw new ZipError(entryLimitMessage(name, limits.maxEntryUncompressed));
      }
      if (limits.maxCompressionRatio !== undefined && total > (limits.ratioFloorBytes ?? 0) && total / Math.max(1, input.byteLength) > limits.maxCompressionRatio) {
        await reader.cancel();
        throw new ZipError(t('importexport.zip.compressionRatioTooHigh', { name, ratio: limits.maxCompressionRatio }));
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ZipError) throw err;
    throw new ZipError(t('importexport.zip.couldntUnzipSpreadsheetCorruptedFile'));
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** O arquivo começa com a assinatura de um ZIP? */
export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) && (bytes[3] === 4 || bytes[3] === 6);
}
