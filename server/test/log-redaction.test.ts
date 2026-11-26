/**
 * LuDraw server — Chat 08.7 · R5 (S-06): tokens fora do log.
 *
 * Antes: a linha "incoming request" do Fastify trazia `"url":"/api/v1/invitations/<TOKEN>"` — quem lia os logs
 * (operador, agregador, backup) obtinha tokens de convite, link público, cadastro e redefinição de senha ainda
 * válidos, e o `code`/`state` do callback do SSO. Agora o serializador de `req` mascara o segmento do token e os
 * parâmetros sensíveis da query, com as MESMAS opções de logger que o `index.ts` usa (`loggerOptions`).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as appModule from '../src/app';
import { clientHeaders, startServer } from './helpers';

const T = (n: number) => `Tk${n}_abcdefghijklmnopqrstuvwxyz0123456789`;

test('S-06: nenhuma linha do log traz o token da URL (caminho e query), com as opções de produção', async () => {
  const lines: string[] = [];
  const stream = { write: (s: string) => void lines.push(s) };
  const mod = appModule as unknown as { loggerOptions?: (level: string, stream?: unknown) => object; LOG_REDACT: string[] };
  // sem a correção, o servidor de produção usava só { level, redact: LOG_REDACT }
  const options = mod.loggerOptions ? mod.loggerOptions('info', stream) : { level: 'info', redact: mod.LOG_REDACT, stream };
  const server = await startServer({}, undefined, options as never);
  const used: string[] = [];
  try {
    const hit = (method: 'GET' | 'POST', url: string, ...tokens: string[]) => {
      used.push(...tokens);
      return server.app.inject({ method, url, headers: clientHeaders, ...(method === 'POST' ? { payload: {} } : {}) });
    };
    await hit('GET', `/api/v1/invitations/${T(1)}`, T(1));
    await hit('POST', `/api/v1/invitations/${T(2)}/accept`, T(2));
    await hit('GET', `/api/v1/public/links/${T(3)}`, T(3));
    await hit('POST', `/api/v1/public/links/${T(4)}/session`, T(4));
    await hit('GET', `/api/v1/join/${T(5)}`, T(5));
    await hit('POST', `/api/v1/join/${T(6)}`, T(6));
    await hit('GET', `/api/v1/signup/${T(7)}`, T(7));
    await hit('POST', `/api/v1/signup/${T(8)}/complete`, T(8));
    await hit('GET', `/api/v1/auth/password/reset/${T(9)}`, T(9));
    await hit('GET', `/api/v1/auth/oidc/callback?code=${T(10)}&state=${T(11)}&session_state=${T(12)}&iss=https%3A%2F%2Fidp.example.com`, T(10), T(11), T(12));
    await hit('GET', `/api/v1/info?token=${T(13)}&share=${T(14)}`, T(13), T(14));
    await server.app.close();
  } finally {
    await server.close().catch(() => undefined);
  }
  const all = lines.join('\n');
  const leaked = used.filter((tok) => all.includes(tok));
  assert.deepEqual(leaked, [], 'nenhum token aparece no log');
  // o log continua útil: a rota aparece com o token mascarado
  assert.match(all, /\/api\/v1\/invitations\/\*\*\*/);
  assert.match(all, /\/api\/v1\/public\/links\/\*\*\*\/session/);
  assert.match(all, /\/api\/v1\/auth\/oidc\/callback\?code=\*\*\*&state=\*\*\*/);
  assert.equal(typeof mod.loggerOptions, 'function', 'o index.ts usa as mesmas opções (loggerOptions)');
});

test('S-06: redactUrl (puro) — só o segmento do token e os parâmetros sensíveis', async () => {
  const m = await import('../src/lib/logRedact').catch(() => null);
  assert.ok(m, 'server/src/lib/logRedact.ts existe');
  const { redactUrl } = m!;
  assert.equal(redactUrl('/api/v1/invitations/abc123/accept'), '/api/v1/invitations/***/accept');
  assert.equal(redactUrl('/api/v1/invitations/abc/resend'), '/api/v1/invitations/***/resend');
  assert.equal(redactUrl('/api/v1/auth/password/reset/xyz'), '/api/v1/auth/password/reset/***');
  assert.equal(redactUrl('/api/v1/boards/b1/data?x=1'), '/api/v1/boards/b1/data?x=1', 'rotas sem token ficam iguais');
  assert.equal(redactUrl('/api/v1/assets/abc?as=visitor&board=b1'), '/api/v1/assets/abc?as=visitor&board=b1');
  assert.equal(redactUrl('/api/v1/auth/oidc/callback?state=s&code=c&x=1'), '/api/v1/auth/oidc/callback?state=***&code=***&x=1');
  assert.equal(redactUrl(undefined), undefined);
});
