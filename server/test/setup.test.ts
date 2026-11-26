/**
 * Primeiro acesso (WORKSPACE_ADMIN_SPEC §5 e §9): token obrigatório, limite de tentativas, transação
 * única, 404 depois de concluído, modo gravado, boot que mostra o token uma vez.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { count, eq } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { organizations, serverSetup, users, workspaceAudit } from '../src/db/schema';
import { runBootSetup } from '../src/setup/boot';
import { isDatabaseEmpty } from '../src/setup/provision';
import { completeSetup, issueTestSetupToken, json, refreshCookieOf, SETUP_TOKEN, startServer, STRONG_PASSWORD, TEST_DB_URL } from './helpers';

test('servidor vazio: /info pede setup e /setup/status responde', async () => {
  const s = await startServer();
  try {
    await issueTestSetupToken(s);
    const info = json(await s.app.inject({ url: '/api/v1/info' }));
    assert.equal(info.setupRequired, true);
    assert.equal(info.mode, null);
    assert.equal(info.registration, 'invite_only');
    const status = await s.app.inject({ url: '/api/v1/setup/status' });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(json(status), { required: true, tokenIssued: true });
  } finally {
    await s.close();
  }
});

test('sem o SETUP_TOKEN correto nada é criado', async () => {
  const s = await startServer();
  try {
    await issueTestSetupToken(s);
    const res = await s.app.inject({
      method: 'POST',
      url: '/api/v1/setup/complete',
      payload: { token: 'ERRADO-ERRADO-ERRADO', mode: 'single_org', organization: { name: 'X Org', allowedEmailDomains: [] }, admin: { name: 'Ana', email: 'ana@example.com', password: STRONG_PASSWORD } },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(json(res).error.code, 'setupInvalidToken');
    assert.equal(json(res).error.message.key, 'server.errors.setupInvalidToken');
    assert.equal(await isDatabaseEmpty(s.ctx.db), true);
    const verify = await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: 'nope' } });
    assert.equal(verify.statusCode, 403);
    const ok = await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: SETUP_TOKEN.toLowerCase() } });
    assert.equal(ok.statusCode, 200, 'token aceito sem diferenciar caixa e com hífens');
  } finally {
    await s.close();
  }
});

test('limite de tentativas do setup: a 6ª tentativa depois de 5 erradas recebe 429', async () => {
  const s = await startServer();
  try {
    await issueTestSetupToken(s);
    for (let i = 0; i < 5; i++) {
      const r = await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: `errado-${i}` } });
      assert.equal(r.statusCode, 403);
    }
    const blocked = await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: SETUP_TOKEN } });
    assert.equal(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal(json(blocked).error.message.key, 'server.errors.tooManyAttempts');
    const blockedComplete = await completeSetup(s.app);
    assert.equal(blockedComplete.statusCode, 429, 'o limite vale também para concluir');
  } finally {
    await s.close();
  }
});

test('setup conclui numa transação, já entra como admin e depois as rotas viram 404', async () => {
  const s = await startServer();
  try {
    await issueTestSetupToken(s);
    const res = await completeSetup(s.app, { mode: 'multi_org', domains: ['@Example.com'] });
    assert.equal(res.statusCode, 200, res.body);
    const body = json(res);
    assert.ok(body.accessToken);
    assert.equal(body.user.role, 'admin');
    assert.equal(body.user.mustChangePassword, false);
    assert.ok(refreshCookieOf(res), 'cookie de renovação gravado');
    const cookie = res.cookies.find((c) => c.name === 'ld_rt')!;
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.path, '/api/v1/auth');

    const [setup] = await s.ctx.db.select().from(serverSetup);
    assert.ok(setup.completedAt);
    assert.equal(setup.mode, 'multi_org');
    assert.equal(setup.bootstrapSource, 'wizard');
    assert.equal(setup.setupTokenHash, null, 'token apagado ao concluir');
    const [org] = await s.ctx.db.select().from(organizations);
    assert.deepEqual(org.allowedEmailDomains, ['example.com']);
    assert.equal(org.policies.allowExtensions, 'packs_only');
    // Chat 08.5 · C: cadastro pelo domínio nasce desligado, e multi_org nunca oferece cadastro aberto
    assert.notEqual(org.policies.allowDomainSignup, true);
    assert.equal(json(await s.app.inject({ url: '/api/v1/info' })).registration, 'invite_only');
    const audit = await s.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'setup_completed'));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorId, body.user.id);

    assert.equal((await s.app.inject({ url: '/api/v1/setup/status' })).statusCode, 404);
    assert.equal((await completeSetup(s.app)).statusCode, 404);
    assert.equal((await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: SETUP_TOKEN } })).statusCode, 404);
    const info = json(await s.app.inject({ url: '/api/v1/info' }));
    assert.equal(info.setupRequired, false);
    assert.equal(info.mode, 'multi_org');
    assert.equal(info.organizationName, 'Empresa Exemplo');
  } finally {
    await s.close();
  }
});

test('dois "concluir" ao mesmo tempo criam uma única organização', async () => {
  const s = await startServer();
  try {
    await issueTestSetupToken(s);
    const [a, b] = await Promise.all([completeSetup(s.app, { email: 'a@example.com' }), completeSetup(s.app, { email: 'b@example.com' })]);
    const codes = [a.statusCode, b.statusCode].sort();
    assert.equal(codes[0], 200);
    assert.ok(codes[1] === 404 || codes[1] === 409, `segunda resposta ${codes[1]}`);
    const [{ n }] = await s.ctx.db.select({ n: count() }).from(organizations);
    assert.equal(n, 1);
    const [{ u }] = await s.ctx.db.select({ u: count() }).from(users);
    assert.equal(u, 1);
  } finally {
    await s.close();
  }
});

test('setup valida senha forte, e-mail e domínio', async () => {
  const s = await startServer();
  try {
    await issueTestSetupToken(s);
    const weak = await completeSetup(s.app, { password: 'curta' });
    assert.equal(weak.statusCode, 400);
    assert.equal(json(weak).error.message.key, 'server.password.tooShort');
    const personal = await completeSetup(s.app, { password: 'AnaAdmin-Senha-1', name: 'Ana Admin' });
    assert.equal(json(personal).error.message.key, 'server.password.containsPersonal');
    const outside = await completeSetup(s.app, { email: 'ana@outra.org', domains: ['example.com'] });
    assert.equal(json(outside).error.code, 'emailOutsideDomain');
    const badDomain = await completeSetup(s.app, { domains: ['não é domínio'] });
    assert.equal(json(badDomain).error.code, 'invalidDomain');
    const badBody = await s.app.inject({ method: 'POST', url: '/api/v1/setup/complete', payload: { token: SETUP_TOKEN } });
    assert.equal(badBody.statusCode, 400);
    assert.equal(json(badBody).error.code, 'invalidRequest');
    assert.equal(await isDatabaseEmpty(s.ctx.db), true);
  } finally {
    await s.close();
  }
});

test('boot: gera o token uma vez; reinícios só lembram; LUDRAW_SETUP_TOKEN é respeitado', async () => {
  const s = await startServer();
  const writes: string[] = [];
  const stdout = process.stdout as unknown as { write: (chunk: string) => boolean };
  const original = stdout.write;
  stdout.write = (chunk: string) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    const config = loadConfig({ DATABASE_URL: TEST_DB_URL });
    assert.equal(await runBootSetup(s.ctx.db, config, s.app.log), 'token_issued');
    assert.equal(await runBootSetup(s.ctx.db, config, s.app.log), 'token_pending');
    const printed = writes.join('');
    const tokens = printed.match(/^ {3}[A-Z2-9]{5}(-[A-Z2-9]{1,5})+$/gm) ?? [];
    assert.equal(tokens.length, 1, 'token impresso uma única vez');
    const ok = await s.app.inject({ method: 'POST', url: '/api/v1/setup/verify-token', payload: { token: tokens[0].trim() } });
    assert.equal(ok.statusCode, 200, 'o token impresso funciona');
    const withEnv = loadConfig({ DATABASE_URL: TEST_DB_URL, LUDRAW_SETUP_TOKEN: SETUP_TOKEN });
    assert.equal(await runBootSetup(s.ctx.db, withEnv, s.app.log), 'token_issued');
    assert.equal(await runBootSetup(s.ctx.db, withEnv, s.app.log), 'token_pending');
  } finally {
    stdout.write = original;
    await s.close();
  }
});
