/**
 * LuDraw server — o que acontece no boot em relação ao primeiro acesso (Chat 07):
 *
 * 1. Setup concluído → nada (se ainda houver variáveis LUDRAW_ADMIN_*, só avisa que foram ignoradas).
 * 2. Setup pendente + LUDRAW_ORG_NAME/ADMIN_EMAIL/ADMIN_PASSWORD(_FILE) + banco vazio → bootstrap
 *    (org + admin com troca de senha obrigatória), uma única vez.
 * 3. Setup pendente sem bootstrap → garante um SETUP_TOKEN: gera um novo (ou usa LUDRAW_SETUP_TOKEN),
 *    guarda só o hash e mostra o token UMA vez no log. Boots seguintes apenas lembram que está pendente.
 */
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { hashPassword } from '../auth/passwords';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { serverSetup } from '../db/schema';
import { randomBytes } from 'node:crypto';
import { sha256Hex, safeEqual } from '../lib/crypto';
import { HttpError } from '../lib/errors';
import { isDatabaseEmpty, normalizeSetupToken, provisionInstallation, readSetup, validateProvisionData } from './provision';

export type BootSetupOutcome = 'completed' | 'bootstrapped' | 'token_issued' | 'token_pending' | 'bootstrap_skipped_not_empty';

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0 e 1 (fáceis de confundir)

/** 25 símbolos de 32 possíveis = 125 bits de entropia. */
export function generateSetupToken(): string {
  return Array.from(randomBytes(25), (b) => TOKEN_ALPHABET[b % 32]).join('');
}

/** Formata o token em blocos de 5 para facilitar a cópia do log. */
export function displayToken(token: string): string {
  return token.match(/.{1,5}/g)?.join('-') ?? token;
}

export function printSetupToken(log: FastifyBaseLogger, token: string, origin: 'generated' | 'env' | 'cli'): void {
  const lines = [
    '',
    '================================================================',
    ' LuDraw — first-run setup is pending',
    ' Open the app, connect to this server and use this setup token:',
    '',
    `   ${token}`,
    '',
    origin === 'env'
      ? ' (taken from LUDRAW_SETUP_TOKEN)'
      : ' It is shown only this once. Lost it? Run: npm run setup:token (Docker: docker compose exec app ludraw setup:token)',
    '================================================================',
    '',
  ];
  // impressão direta: o token não pode passar pelo redator do logger, e só aparece aqui
  log.info('setup token issued (printed to stdout once)');
  process.stdout.write(lines.join('\n') + '\n');
}

export async function issueSetupToken(db: Db, explicit: string | null): Promise<string> {
  const token = explicit ?? generateSetupToken();
  await db
    .update(serverSetup)
    .set({ setupTokenHash: sha256Hex(normalizeSetupToken(token)), setupTokenIssuedAt: new Date() })
    .where(eq(serverSetup.id, 1));
  return token;
}

export async function runBootSetup(db: Db, config: ServerConfig, log: FastifyBaseLogger): Promise<BootSetupOutcome> {
  const setup = await readSetup(db);
  if (setup.completedAt) {
    if (config.bootstrap) log.info('LUDRAW_ORG_NAME/ADMIN_* are set but the server is already configured: bootstrap ignored, nothing changed. You can remove them (and the password) from the environment.');
    return 'completed';
  }
  if (config.bootstrapIncomplete.length) {
    log.warn(`Bootstrap variables are incomplete (found only: ${config.bootstrapIncomplete.join(', ')}). LUDRAW_ORG_NAME, LUDRAW_ADMIN_EMAIL and LUDRAW_ADMIN_PASSWORD (or _FILE) are all required. Falling back to the setup wizard.`);
  }
  if (config.bootstrap) {
    if (!(await isDatabaseEmpty(db))) {
      log.warn('Bootstrap skipped: the database is not empty. Use the setup wizard or the recovery CLI.');
      return 'bootstrap_skipped_not_empty';
    }
    const b = config.bootstrap;
    try {
      const data = validateProvisionData({ organizationName: b.orgName, allowedEmailDomains: b.allowedDomains, adminName: b.adminName, adminEmail: b.adminEmail, adminPassword: b.adminPassword });
      await provisionInstallation(db, {
        organizationName: data.organizationName,
        allowedEmailDomains: data.domains,
        mode: config.mode,
        admin: { name: data.adminName, email: data.adminEmail, passwordHash: await hashPassword(b.adminPassword), mustChangePassword: true },
        source: 'env',
      });
    } catch (err) {
      if (err instanceof HttpError) {
        throw new Error(`Bootstrap rejected (${err.code}: ${err.storedMessage.key}). Fix the LUDRAW_* variables and restart.`);
      }
      throw err;
    }
    log.info(`Bootstrap complete: organization "${b.orgName}" and administrator ${b.adminEmail} created. The administrator must change the password at first sign-in. Remove LUDRAW_ADMIN_PASSWORD from the environment now.`);
    return 'bootstrapped';
  }
  // assistente de primeiro acesso
  if (config.setupToken) {
    const same = setup.setupTokenHash ? safeEqual(sha256Hex(normalizeSetupToken(config.setupToken)), setup.setupTokenHash) : false;
    if (!same) {
      await issueSetupToken(db, config.setupToken);
      log.info('Setup token taken from LUDRAW_SETUP_TOKEN. Open the app to finish the first-run setup.');
    } else {
      log.info('First-run setup is pending (token from LUDRAW_SETUP_TOKEN).');
    }
    return same ? 'token_pending' : 'token_issued';
  }
  if (!setup.setupTokenHash) {
    const token = await issueSetupToken(db, null);
    printSetupToken(log, displayToken(token), 'generated');
    return 'token_issued';
  }
  log.warn('First-run setup is pending. The setup token was printed on the first start. Lost it? Run: npm run setup:token (Docker: docker compose exec app ludraw setup:token)');
  return 'token_pending';
}
