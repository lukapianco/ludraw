/**
 * LuDraw server — Chat 08.7 · R5: segredos, chaves por propósito e configuração de boot.
 *
 *  - S-34: `LUDRAW_JWT_SECRET` de exemplo (marcadores conhecidos, pouca variedade) recusado no boot; em produção
 *    também < 32 caracteres; em desenvolvimento o curto só gera aviso. A mensagem ensina a gerar um aleatório.
 *  - S-19: `pglite://` recusado no boot em produção (`assertDatabaseForEnv`, chamado pelo `index.ts`).
 *  - S-16: o HMAC do IP do pedido de acesso usa chave derivada própria ('access-request-ip'), não a do JWT.
 *  - S-13: corpo com `Content-Type` não suportado numa rota JSON → 415 com código, sem "unhandled error" no log.
 *  - S-18: token proposto pelo cliente (convite, link geral, link público) precisa de ≥ 32 caracteres.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { accessRequests } from '../src/db/schema';
import * as config from '../src/config';
import { deriveKey, hmacHex } from '../src/lib/crypto';
import { api, clientHeaders, createBoard, json, startConfigured, startServer, startWithMail, TEST_DB_URL, type Person } from './helpers';

const PROD = { DATABASE_URL: 'postgres://u:p@db.internal:5432/ludraw', NODE_ENV: 'production', LUDRAW_PUBLIC_URL: 'https://draw.example.com' };
const DEV = { DATABASE_URL: TEST_DB_URL, NODE_ENV: 'development' };
const GUIDE_VALUE = 'troque-por-um-segredo-longo-de-teste-0123456789';
const strong = () => randomBytes(48).toString('base64url');

test('S-34: segredo de exemplo ou sem variedade é recusado no boot (dev e produção), com a receita para gerar um', () => {
  for (const env of [DEV, PROD]) {
    assert.throws(() => config.loadConfig({ ...env, LUDRAW_JWT_SECRET: GUIDE_VALUE }), /randomBytes\(48\)/, 'valor antigo do guia');
    for (const marker of ['troque', 'change-me', 'changeme', 'CHANGE_ME', 'replace-me', 'example', 'exemplo', 'placeholder', 'substitua', 'your-secret', 'seu-segredo', 'dummy']) {
      const value = `${marker}-${'k3Y9pQ2zR7wX5vB8nM4cL6'}-${'0123456789'}`;
      assert.throws(() => config.loadConfig({ ...env, LUDRAW_JWT_SECRET: value }), /LUDRAW_JWT_SECRET/, marker);
    }
    assert.throws(() => config.loadConfig({ ...env, LUDRAW_JWT_SECRET: 'a'.repeat(40) }), /LUDRAW_JWT_SECRET/, 'um caractere só');
    assert.throws(() => config.loadConfig({ ...env, LUDRAW_JWT_SECRET: 'abababababababababababababababab12' }), /LUDRAW_JWT_SECRET/, 'pouca variedade');
    // aleatório e os segredos dos testes continuam valendo
    assert.equal(config.loadConfig({ ...env, LUDRAW_JWT_SECRET: strong() }).jwtSecret?.length, 64);
    assert.ok(config.loadConfig({ ...env, LUDRAW_JWT_SECRET: 'e2e-jwt-secret-for-the-mail-panel-0123456789' }).jwtSecret);
    assert.ok(config.loadConfig({ ...env, LUDRAW_JWT_SECRET: 'jwt-secret-for-the-mail-panel-tests-0123456789' }).jwtSecret);
  }
  // também pelo arquivo (LUDRAW_JWT_SECRET_FILE)
  const dir = mkdtempSync(join(tmpdir(), 'od-secret-'));
  try {
    const file = join(dir, 'jwt');
    writeFileSync(file, `${GUIDE_VALUE}\n`);
    assert.throws(() => config.loadConfig({ ...DEV, LUDRAW_JWT_SECRET_FILE: file }), /randomBytes\(48\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('S-34: comprimento — produção exige ≥ 32 (erro com a receita); desenvolvimento só avisa', () => {
  const short = 'Zq7#Lp2@Wx9!Rk4$Mt'; // 18 caracteres, variados
  assert.throws(() => config.loadConfig({ ...PROD, LUDRAW_JWT_SECRET: short }), /32[\s\S]*randomBytes\(48\)/);
  const dev = config.loadConfig({ ...DEV, LUDRAW_JWT_SECRET: short });
  assert.equal(dev.jwtSecret, short, 'em desenvolvimento o curto sobe');
  assert.ok(dev.warnings.some((w) => /LUDRAW_JWT_SECRET/.test(w) && /32/.test(w) && /randomBytes\(48\)/.test(w)), 'com aviso que ensina a gerar');
  assert.equal(config.loadConfig({ ...PROD, LUDRAW_JWT_SECRET: strong() }).warnings.length, 0);
});

test('S-19: pglite:// é recusado no boot em produção (o resto segue igual)', () => {
  const assertDb = (config as { assertDatabaseForEnv?: (c: config.ServerConfig) => void }).assertDatabaseForEnv;
  assert.equal(typeof assertDb, 'function', 'assertDatabaseForEnv existe (chamado pelo index.ts antes de abrir o banco)');
  const prodPglite = config.loadConfig({ ...PROD, DATABASE_URL: 'pglite://memory' });
  assert.throws(() => assertDb!(prodPglite), /PostgreSQL/);
  assert.doesNotThrow(() => assertDb!(config.loadConfig({ ...PROD })));
  assert.doesNotThrow(() => assertDb!(config.loadConfig({ DATABASE_URL: 'pglite://memory', NODE_ENV: 'test' })));
  assert.doesNotThrow(() => assertDb!(config.loadConfig({ DATABASE_URL: 'pglite://memory' })));
});

test('S-16: o IP do pedido de acesso vira HMAC com chave derivada própria (não a chave do JWT)', async () => {
  const { server, admin, flush } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    assert.equal((await api(server.app, owner).op({ type: 'updatePolicies', patch: { allowAccessRequests: true } })).statusCode, 200);
    const r = await server.app.inject({ method: 'POST', url: '/api/v1/access-requests', payload: { name: 'Caio', email: 'caio@example.com' }, headers: clientHeaders });
    assert.equal(r.statusCode, 202);
    await flush();
    const [row] = await server.ctx.db.select().from(accessRequests);
    const secret = new TextDecoder().decode(server.ctx.keys.jwt);
    const material = 'access-request|127.0.0.1';
    assert.notEqual(row.requesterIpHash, hmacHex(server.ctx.keys.jwt, material), 'a chave do JWT não é reaproveitada');
    assert.equal(row.requesterIpHash, hmacHex(deriveKey(secret, 'access-request-ip'), material));
  } finally {
    await server.close();
  }
});

test('S-13: Content-Type não suportado numa rota JSON → 415 com código, sem "unhandled error" no log', async () => {
  const lines: string[] = [];
  const server = await startServer({}, undefined, { level: 'info', stream: { write: (s: string) => void lines.push(s) } });
  try {
    for (const url of ['/api/v1/auth/login', '/api/v1/access-requests']) {
      const r = await server.app.inject({ method: 'POST', url, payload: 'email=a%40example.com&password=x', headers: { 'content-type': 'application/x-www-form-urlencoded', ...clientHeaders } });
      assert.equal(r.statusCode, 415, `${url}: ${r.body}`);
      assert.equal(json(r).error.code, 'unsupportedMediaType');
    }
    assert.equal(lines.filter((l) => /unhandled error/.test(l)).length, 0, 'nada de "unhandled error" (alarme falso)');
  } finally {
    await server.close();
  }
});

test('S-18: token proposto pelo cliente precisa de ≥ 32 caracteres (convite, link geral, link público)', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const short = 'A'.repeat(12) + 'b'.repeat(12); // 24
    const long = randomBytes(24).toString('base64url'); // 32
    const inv = (token: string) => api(server.app, owner).op({ type: 'createInvitation', input: { email: `p${token.length}@example.com`, role: 'member', expiresInDays: 7, sendEmail: false }, token });
    const shortInv = await inv(short);
    assert.equal(shortInv.statusCode, 400, shortInv.body);
    assert.equal(json(shortInv).error.code, 'invalidOperation');
    assert.equal((await inv(long)).statusCode, 200);
    const board = await createBoard(server.app, owner);
    const link = (token: string) => api(server.app, owner).op({ type: 'setPublicLink', boardId: board.id, patch: { enabled: true, accessLevel: 'viewer' }, token });
    assert.equal((await link(short)).statusCode, 400);
    assert.equal((await link(randomBytes(24).toString('base64url'))).statusCode, 200);
    const gen = (token: string) => api(server.app, owner).op({ type: 'createInviteLink', input: { role: 'member', expiresInDays: 7, maxUses: 5 }, token });
    assert.equal((await gen(short)).statusCode, 400);
  } finally {
    await server.close();
  }
});
