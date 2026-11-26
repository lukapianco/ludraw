/**
 * LuDraw — Chat 07: regra ÚNICA de força de senha (pura, sem DOM).
 *
 * Usada pelo cliente (`#/setup`, convite, troca de senha) e pelo servidor (setup, convite, troca de
 * senha, CLI de recuperação). Devolve a chave do motivo (`server.password.*`) — quem mostra traduz.
 * Regra: pelo menos 10 caracteres com 3 tipos (minúscula, maiúscula, número, símbolo) OU 16+ caracteres
 * de qualquer tipo; nunca contém o e-mail (parte antes do @) nem o nome da pessoa.
 */
import type { MessageDescriptor } from '../i18n/types';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_PASSPHRASE_LENGTH = 16;
/** Teto para não gastar CPU do servidor com entradas absurdas (o hash não precisa de mais). */
export const PASSWORD_MAX_LENGTH = 256;

export interface PasswordContext {
  email?: string;
  name?: string;
}

function characterClasses(pw: string): number {
  let n = 0;
  if (/[a-z]/.test(pw)) n++;
  if (/[A-Z]/.test(pw)) n++;
  if (/[0-9]/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  return n;
}

function personalParts(ctx: PasswordContext): string[] {
  const parts: string[] = [];
  const local = ctx.email?.split('@')[0]?.trim().toLowerCase();
  if (local && local.length >= 4) parts.push(local);
  for (const word of (ctx.name ?? '').toLowerCase().split(/\s+/)) if (word.length >= 4) parts.push(word);
  return parts;
}

/** `null` = senha aceita; senão o motivo (chave + parâmetros). */
export function checkPasswordStrength(password: string, ctx: PasswordContext = {}): MessageDescriptor | null {
  if (password.length > PASSWORD_MAX_LENGTH) return { key: 'server.password.tooLong', params: { max: PASSWORD_MAX_LENGTH } };
  if (password.length < PASSWORD_MIN_LENGTH) return { key: 'server.password.tooShort', params: { min: PASSWORD_MIN_LENGTH } };
  const lower = password.toLowerCase();
  if (personalParts(ctx).some((p) => lower.includes(p))) return { key: 'server.password.containsPersonal' };
  if (password.length < PASSWORD_PASSPHRASE_LENGTH && characterClasses(password) < 3) {
    return { key: 'server.password.needsVariety', params: { long: PASSWORD_PASSPHRASE_LENGTH } };
  }
  return null;
}
