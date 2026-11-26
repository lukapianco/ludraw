/**
 * LuDraw server — segredos do servidor (Chat 07).
 *
 * O mais seguro é definir LUDRAW_JWT_SECRET no ambiente (fica fora do banco). Sem ele, o servidor
 * gera 64 bytes aleatórios no primeiro boot e guarda na tabela `server_secrets` — conveniente, mas quem
 * lê o banco consegue forjar sessões. O README explica a diferença.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { serverSecrets } from '../db/schema';
import { deriveKey, Sealer } from './crypto';

export interface ServerKeys {
  /** chave HMAC dos JWT (acesso e visitante) */
  jwt: Uint8Array;
  /** cifra do sucessor do refresh token (janela de tolerância entre abas) */
  refreshSealer: Sealer;
  /** cifra dos tokens de convite (o admin pode copiar o link de novo) */
  inviteSealer: Sealer;
  /**
   * Chat 08.5 · B2: cifra da senha do SMTP salva pelo painel. Derivada SÓ de LUDRAW_JWT_SECRET (propósito
   * 'smtp-password'); com a chave guardada no próprio banco ela é null e o painel não aceita senha — quem
   * lesse o banco leria a senha.
   */
  mailSealer: Sealer | null;
  /**
   * Chat 08.5 · C: chave do HMAC dos e-mails de pessoas removidas (bloqueio do cadastro pelo domínio), derivada
   * com o propósito 'removed-email'. Com o segredo guardado no banco, quem lê o banco pode testar e-mails
   * candidatos; trocar o segredo zera a lista (as marcas antigas deixam de bater).
   */
  removedEmailKey: Uint8Array;
  /**
   * Chat 08.7 · R5 (S-17): cópia cifrada do token do link público (propósito 'public-link-token'). SÓ com a chave no
   * ambiente: com o segredo guardado no próprio banco, quem lê o banco decifraria — então null e o banco guarda só o
   * hash (o endereço aparece uma única vez, na criação).
   */
  linkSealer: Sealer | null;
  /** Chat 08.7 · R5 (S-16): chave do HMAC do IP do pedido de acesso (propósito 'access-request-ip') */
  accessIpKey: Uint8Array;
  source: 'env' | 'database';
}

async function storedSecret(db: Db, name: string): Promise<string> {
  const existing = await db.select().from(serverSecrets).where(eq(serverSecrets.name, name));
  if (existing[0]) return existing[0].value;
  await db
    .insert(serverSecrets)
    .values({ name, value: randomBytes(64).toString('base64url') })
    .onConflictDoNothing();
  const row = await db.select().from(serverSecrets).where(eq(serverSecrets.name, name));
  if (!row[0]) throw new Error(`could not create server secret ${name}`);
  return row[0].value;
}

export async function loadServerKeys(db: Db, envSecret: string | null): Promise<ServerKeys> {
  const secret = envSecret ?? (await storedSecret(db, 'jwt'));
  return {
    jwt: new TextEncoder().encode(secret),
    refreshSealer: new Sealer(secret, 'refresh-successor'),
    inviteSealer: new Sealer(secret, 'invitation-token'),
    mailSealer: envSecret ? new Sealer(envSecret, 'smtp-password') : null,
    linkSealer: envSecret ? new Sealer(envSecret, 'public-link-token') : null,
    removedEmailKey: deriveKey(secret, 'removed-email'),
    accessIpKey: deriveKey(secret, 'access-request-ip'),
    source: envSecret ? 'env' : 'database',
  };
}
