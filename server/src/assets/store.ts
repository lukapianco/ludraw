/**
 * LuDraw server — arquivos das imagens do Modo Servidor (Chat 08.2 · A-2), numa pasta do disco
 * (`LUDRAW_ASSETS_DIR`; decisão do usuário: pasta no disco, o banco guarda só os metadados).
 *
 *   <pasta>/<2 primeiros caracteres do sha256>/<sha256>
 * Por conteúdo: a mesma imagem é UM arquivo, mesmo usada por várias organizações (metadados e vínculos ficam
 * separados por organização no banco). Gravação atômica (temporário + rename); a leitura confere o sha256 antes de
 * servir (arquivo adulterado no disco nunca sai). Nenhum caminho vem do pedido: só o hash validado.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSET_HASH_RE } from '../../../src/utils/assetRefs';

export type AssetStoreErrorKind = 'notWritable' | 'writeFailed' | 'corrupt';

export class AssetStoreError extends Error {
  constructor(
    readonly kind: AssetStoreErrorKind,
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
  }
}

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class AssetStore {
  constructor(readonly dir: string) {}

  /** Na subida: a pasta existe (ou é criada) e aceita gravação. Senão o servidor não sobe (mensagem clara). */
  async ensureReady(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      const probe = join(this.dir, `.probe-${randomBytes(6).toString('hex')}`);
      await writeFile(probe, 'ok');
      await unlink(probe);
    } catch (err) {
      throw new AssetStoreError('notWritable', `${this.dir} (${(err as NodeJS.ErrnoException).code ?? 'erro'})`);
    }
  }

  pathFor(hash: string): string {
    if (!ASSET_HASH_RE.test(hash)) throw new AssetStoreError('corrupt', 'hash inválido');
    return join(this.dir, hash.slice(0, 2), hash);
  }

  /** Grava (se ainda não existir) e devolve o sha256. Falha de disco → `writeFailed` (nada é referenciado). */
  async put(bytes: Uint8Array, hash = sha256Hex(bytes)): Promise<string> {
    const path = this.pathFor(hash);
    try {
      const s = await stat(path).catch(() => null);
      if (s && s.size === bytes.byteLength) return hash;
      await mkdir(join(this.dir, hash.slice(0, 2)), { recursive: true });
      const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await writeFile(tmp, bytes);
        await rename(tmp, path);
      } catch (err) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw err;
      }
      return hash;
    } catch (err) {
      if (err instanceof AssetStoreError) throw err;
      throw new AssetStoreError('writeFailed', (err as NodeJS.ErrnoException).code ?? 'erro');
    }
  }

  /** Bytes conferidos pelo sha256; null = não existe. Conteúdo diferente do hash → `corrupt`. */
  async read(hash: string): Promise<Uint8Array | null> {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.pathFor(hash));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    if (sha256Hex(bytes) !== hash) throw new AssetStoreError('corrupt', hash);
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  async exists(hash: string): Promise<boolean> {
    return !!(await stat(this.pathFor(hash)).catch(() => null));
  }

  async remove(hash: string): Promise<void> {
    await rm(this.pathFor(hash), { force: true });
  }
}
