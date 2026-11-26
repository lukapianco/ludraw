/**
 * LuDraw server — senhas com argon2id (Chat 07). Parâmetros conforme a recomendação da OWASP para
 * argon2id (19 MiB, 2 iterações, 1 via). Hashes com parâmetros antigos são refeitos no próximo login.
 * A senha nunca vai para log nem para o banco em texto.
 */
import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export interface VerifyResult {
  ok: boolean;
  needsRehash: boolean;
}

export async function verifyPassword(hash: string | null | undefined, password: string): Promise<VerifyResult> {
  if (!hash) {
    // gasta o mesmo tempo de uma verificação real (não revela se a conta existe)
    await argon2.verify(await dummyHash(), password).catch(() => false);
    return { ok: false, needsRehash: false };
  }
  let ok = false;
  try {
    ok = await argon2.verify(hash, password);
  } catch {
    ok = false;
  }
  return { ok, needsRehash: ok && argon2.needsRehash(hash, OPTIONS) };
}

let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummy ??= argon2.hash('ludraw-timing-equalizer', OPTIONS);
  return dummy;
}
