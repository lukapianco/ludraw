/**
 * SHA-256 em hexadecimal (contas locais e senha do link público no modo local).
 * LOCAL ≠ SEGURO: no navegador isto só evita guardar a senha em texto puro; a proteção real
 * de senhas é do servidor (Chat 07, argon2).
 */
export async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Fallback (contextos sem SubtleCrypto, ex.: http em IP de rede local)
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return `fallback-${h}`;
  }
}

/** Erro quando o navegador não oferece SHA-256 seguro (ex.: http fora de localhost). */
export class HashUnavailableError extends Error {
  constructor() {
    super('sha256-unavailable');
    this.name = 'HashUnavailableError';
  }
}

/**
 * Chat 06.5: SHA-256 (hex) de bytes, para a integridade das extensões. **Sem fallback fraco**: se
 * `crypto.subtle` não existir, lança `HashUnavailableError` e a instalação é recusada.
 */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new HashUnavailableError();
  const buf = await subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
