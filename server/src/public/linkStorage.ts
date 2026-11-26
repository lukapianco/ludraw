/**
 * LuDraw server — token do link público guardado com segurança (Chat 08.7 · R5 · achado S-17).
 *
 * O banco guarda o HASH do token (`token_hash`, sha256 hex) para a busca e, SÓ quando a chave vem do ambiente
 * (`LUDRAW_JWT_SECRET`), uma cópia cifrada (`token_enc`) para quem compartilha copiar o link de novo. Com a chave
 * guardada no próprio banco, a cifra não protegeria nada: só o hash, e o endereço aparece uma única vez (na criação).
 *
 * Migração em duas fases:
 *   1. SQL 0009 — acrescenta `token_hash`/`token_enc` e preenche o hash a partir do texto (nada é apagado);
 *   2. boot — `secureLegacyPublicLinks`: confere que TODO link tem hash e que o hash bate com o texto; se algo não
 *      conferir, o boot para com erro claro e NADA é apagado. Só então cifra (chave do ambiente) e zera o texto.
 * Idempotente (roda em todo boot): sem texto restante, não faz nada.
 */
import { eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { publicLinks } from '../db/schema';
import { sha256Hex, type Sealer } from '../lib/crypto';

export interface SecureReport {
  /** links que ainda tinham o token em texto e foram protegidos agora */
  secured: number;
}

export async function secureLegacyPublicLinks(db: Db, keys: { linkSealer: Sealer | null }): Promise<SecureReport> {
  const rows = await db.select({ boardId: publicLinks.boardId, token: publicLinks.token, tokenHash: publicLinks.tokenHash, tokenEnc: publicLinks.tokenEnc }).from(publicLinks);
  // conferência COMPLETA antes de qualquer gravação
  const bad = rows.filter((r) => !r.tokenHash || !/^[a-f0-9]{64}$/.test(r.tokenHash) || (r.token !== null && sha256Hex(r.token) !== r.tokenHash));
  if (bad.length) {
    throw new Error(
      `public_links: ${bad.length} link(s) without a token hash that matches the stored token (migration 0009 incomplete or data altered). ` +
        'Nothing was erased; the server will not start until this is fixed (restore the table from a backup or run the migrations again).',
    );
  }
  const legacy = rows.filter((r) => r.token !== null);
  const staleCopies = keys.linkSealer ? [] : rows.filter((r) => r.tokenEnc !== null);
  if (!legacy.length && !staleCopies.length) return { secured: 0 };
  await db.transaction(async (tx) => {
    for (const r of legacy) {
      const sealed = keys.linkSealer ? keys.linkSealer.seal(r.token!) : null;
      await tx.update(publicLinks).set({ token: null, tokenEnc: sealed }).where(eq(publicLinks.boardId, r.boardId));
    }
    // chave no banco: nenhuma cópia cifrada fica (não protegeria nada)
    if (!keys.linkSealer) await tx.update(publicLinks).set({ tokenEnc: null }).where(isNotNull(publicLinks.tokenEnc));
  });
  return { secured: legacy.length };
}


/** Hash da busca. */
export const tokenHashOf = (token: string): string => sha256Hex(token);
