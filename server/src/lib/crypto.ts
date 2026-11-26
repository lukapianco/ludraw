/**
 * LuDraw server — utilitários de criptografia (Chat 07), só `node:crypto`.
 * - `sha256Hex`: para tokens de alta entropia (refresh, convite, setup). Senhas NUNCA usam isto (argon2id).
 * - `sealText`/`openText`: AES-256-GCM com chave derivada (HKDF) do segredo do servidor, para guardar por
 *   pouco tempo algo que precisa voltar em texto (sucessor do refresh na janela das abas, token do convite).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Chat 08.5: HMAC-SHA256 (ex.: IP de quem pede acesso, guardado só como HMAC com a chave do servidor). */
export function hmacHex(key: Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/**
 * Chat 08.5 · C: chave de 32 bytes derivada (HKDF) do segredo do servidor com um propósito próprio — cada uso
 * tem a sua chave (ex.: 'removed-email'), nunca a chave dos JWT direto.
 */
export function deriveKey(secret: string, purpose: string): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), Buffer.from(`ludraw:${purpose}`, 'utf8'), 32));
}

/** Token aleatório URL-safe (base64url). 32 bytes = 256 bits. */
export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Comparação em tempo constante de dois textos (compara os hashes para não vazar o tamanho). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

export class Sealer {
  private readonly key: Buffer;

  constructor(secret: string, purpose: string) {
    this.key = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), Buffer.from(`ludraw:${purpose}`, 'utf8'), 32));
  }

  /**
   * Chat 08.5 · B2: impressão curta da chave derivada (HMAC, não revela a chave). Guardada ao lado de um
   * valor cifrado, mostra se a chave do servidor mudou desde a gravação.
   */
  fingerprint(): string {
    return createHmac('sha256', this.key).update('ludraw:key-check', 'utf8').digest('base64url').slice(0, 16);
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  }

  open(sealed: string): string | null {
    const [iv, tag, data] = sealed.split('.');
    if (!iv || !tag || !data) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
