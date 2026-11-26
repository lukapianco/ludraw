/**
 * Login da empresa por OIDC genérico (Chat 07), de ponta a ponta contra um provedor de TESTE escrito aqui
 * (descoberta, JWKS e endpoint de token com PKCE S256) — nenhum serviço de terceiros.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { orgMemberships, sessions, users, workspaceAudit } from '../src/db/schema';
import { api, clientHeaders, json, refreshCookieOf, startConfigured, STRONG_PASSWORD, type Person } from './helpers';

const CLIENT_ID = 'ludraw';
const CLIENT_SECRET = 'segredo-do-cliente';
const CLIENT_URL = 'http://localhost:5173/';

interface PendingCode {
  nonce: string;
  challenge: string;
  claims: Record<string, unknown>;
}

let op: Server;
let issuer = '';
const codes = new Map<string, PendingCode>();
let sign: (claims: Record<string, unknown>) => Promise<string>;

before(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  sign = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  op = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/.well-known/openid-configuration') {
      return send(200, {
        issuer,
        authorization_endpoint: `${issuer}authorize`,
        token_endpoint: `${issuer}token`,
        jwks_uri: `${issuer}jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      });
    }
    if (req.url === '/jwks') return send(200, { keys: [jwk] });
    if (req.url === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', async () => {
        const form = new URLSearchParams(raw);
        const pending = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        const verifier = form.get('code_verifier') ?? '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!pending || challenge !== pending.challenge || form.get('client_secret') !== CLIENT_SECRET || form.get('client_id') !== CLIENT_ID) {
          return send(400, { error: 'invalid_grant' });
        }
        send(200, { access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: await sign({ nonce: pending.nonce, ...pending.claims }) });
      });
      return;
    }
    send(404, {});
  });
  await new Promise<void>((resolve) => op.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(op.address() as AddressInfo).port}/`;
});

after(() => new Promise<void>((resolve) => op.close(() => resolve())));

const env = (extra: Record<string, string> = {}) => ({
  OIDC_ISSUER: issuer,
  OIDC_CLIENT_ID: CLIENT_ID,
  OIDC_CLIENT_SECRET: CLIENT_SECRET,
  OIDC_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/oidc/callback',
  OIDC_PROVIDER_NAME: 'Login da Empresa',
  OIDC_ALLOW_INSECURE_HTTP: 'true',
  ...extra,
});

type TestServer = Awaited<ReturnType<typeof startConfigured>>['server'];

/** Cookie de vínculo do fluxo SSO com o navegador (Chat 08.7 · R5 · S-08). */
const SSO_COOKIE = 'ld_sso';
const ssoCookieOf = (res: { cookies: Array<{ name: string; value: string }> }) => res.cookies.find((c) => c.name === SSO_COOKIE)?.value;

/**
 * Faz o vaivém completo: /start → "provedor" → /callback, como um NAVEGADOR (leva ao callback o cookie que o /start
 * deixou). `browserCookie`: `undefined` = o do próprio /start; `null` = nenhum (outro navegador); texto = esse valor.
 * Devolve o destino final e o cookie.
 */
async function sso(server: TestServer, claims: Record<string, unknown>, browserCookie?: string | null) {
  const start = await server.app.inject({ url: `/api/v1/auth/oidc/start?redirect=${encodeURIComponent(CLIENT_URL)}` });
  assert.equal(start.statusCode, 302, start.body);
  const auth = new URL(start.headers.location as string);
  assert.equal(auth.origin + '/', issuer);
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  const code = randomBytes(12).toString('hex');
  codes.set(code, { nonce: auth.searchParams.get('nonce')!, challenge: auth.searchParams.get('code_challenge')!, claims });
  const bound = browserCookie === undefined ? ssoCookieOf(start) : browserCookie;
  const cb = await server.app.inject({ url: `/api/v1/auth/oidc/callback?code=${code}&state=${auth.searchParams.get('state')}`, ...(bound ? { cookies: { [SSO_COOKIE]: bound } } : {}) });
  assert.equal(cb.statusCode, 302);
  return { location: cb.headers.location as string, cookie: refreshCookieOf(cb), state: auth.searchParams.get('state')!, code, start, callback: cb };
}

const claimsFor = (email: string, extra: Record<string, unknown> = {}) => ({ sub: `sub-${email}`, email, email_verified: true, name: 'Pessoa SSO', ...extra });

test('sem convite nem auto-provisionamento: não entra; /info anuncia o SSO', async () => {
  const { server } = await startConfigured(env());
  try {
    const info = json(await server.app.inject({ url: '/api/v1/info' }));
    assert.deepEqual(info.sso, { enabled: true, label: 'Login da Empresa' });
    const r = await sso(server, claimsFor('estranho@example.com'));
    assert.equal(r.location, `${CLIENT_URL}#/auth/sso?error=ssoNoAccess`);
    assert.equal(r.cookie, null);
    assert.equal((await server.ctx.db.select().from(users)).length, 1);
  } finally {
    await server.close();
  }
});

test('convite pendente: cria a conta pelo SSO, entra, registra e volta a entrar pelo mesmo subject', async () => {
  const { server, admin } = await startConfigured(env());
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    await api(server.app, owner).op({ type: 'createInvitation', input: { email: 'sso@example.com', role: 'member', expiresInDays: 7 } });
    const r = await sso(server, claimsFor('sso@example.com'));
    assert.equal(r.location, `${CLIENT_URL}#/auth/sso`, 'nenhum token na URL');
    assert.ok(r.cookie);
    const refreshed = await server.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: clientHeaders, cookies: { ld_rt: r.cookie! } });
    assert.equal(refreshed.statusCode, 200);
    assert.equal(json(refreshed).user.authProvider, 'oidc');
    assert.equal(json(refreshed).user.role, 'member');
    const [u] = await server.ctx.db.select().from(users).where(eq(users.email, 'sso@example.com'));
    assert.equal(u.passwordHash, null);
    assert.equal(u.createdVia, 'sso');
    // Chat 08.5: o provedor confirmou o e-mail → a conta já nasce com o e-mail confirmado
    assert.ok(u.emailVerifiedAt);
    assert.equal(json(refreshed).user.emailVerified, true);
    const logins = (await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'login'))).filter((a) => a.actorId === u.id);
    assert.deepEqual(logins[0].message, { key: 'workspace.audit.msg.login', params: { method: { key: 'server.audit.method.sso' } } });
    // o e-mail mudou no provedor, mas o subject é o mesmo → mesma conta
    const again = await sso(server, claimsFor('sso@example.com', { email: 'outro@example.com' }));
    assert.equal(again.location, `${CLIENT_URL}#/auth/sso`);
    // conta SSO não tem senha própria
    const pw = await server.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'sso@example.com', password: STRONG_PASSWORD } });
    assert.equal(pw.statusCode, 401);
  } finally {
    await server.close();
  }
});

test('e-mail não verificado e conta local com o mesmo e-mail (só liga com OIDC_LINK_BY_EMAIL)', async () => {
  const off = await startConfigured(env());
  try {
    assert.match((await sso(off.server, claimsFor('ana@example.com', { email_verified: false }))).location, /error=ssoEmailUnverified$/);
    assert.match((await sso(off.server, claimsFor('ana@example.com'))).location, /error=emailInUse$/);
  } finally {
    await off.server.close();
  }
  const on = await startConfigured(env({ OIDC_LINK_BY_EMAIL: 'true' }));
  try {
    const r = await sso(on.server, claimsFor('ana@example.com'));
    assert.equal(r.location, `${CLIENT_URL}#/auth/sso`);
    const [u] = await on.server.ctx.db.select().from(users).where(eq(users.email, 'ana@example.com'));
    assert.equal(u.oidcSubject, 'sub-ana@example.com');
    assert.equal((await on.server.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'ana@example.com', password: STRONG_PASSWORD } })).statusCode, 200, 'a senha local continua valendo');
  } finally {
    await on.server.close();
  }
});

test('auto-provisionamento só para domínios permitidos; participação suspensa não entra', async () => {
  const { server, admin } = await startConfigured(env({ OIDC_AUTO_PROVISION: 'true' }));
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    assert.match((await sso(server, claimsFor('alguem@empresa.com'))).location, /error=ssoNoAccess$/, 'sem domínios configurados ninguém entra sozinho');
    await api(server.app, owner).op({ type: 'updateWorkspace', patch: { allowedEmailDomains: ['empresa.com'] } });
    assert.equal((await sso(server, claimsFor('alguem@empresa.com'))).location, `${CLIENT_URL}#/auth/sso`);
    assert.match((await sso(server, claimsFor('fora@outra.org'))).location, /error=ssoNoAccess$/);
    const [u] = await server.ctx.db.select().from(users).where(eq(users.email, 'alguem@empresa.com'));
    const [m] = await server.ctx.db.select().from(orgMemberships).where(eq(orgMemberships.userId, u.id));
    assert.equal(m.role, 'member');
    await api(server.app, owner).op({ type: 'suspendAccount', id: u.id });
    assert.match((await sso(server, claimsFor('alguem@empresa.com'))).location, /error=accountSuspended$/);
  } finally {
    await server.close();
  }
});

test('destino de volta só para origens permitidas; state é de uso único', async () => {
  const { server } = await startConfigured(env());
  try {
    const evil = await server.app.inject({ url: `/api/v1/auth/oidc/start?redirect=${encodeURIComponent('https://evil.example.com/')}` });
    assert.equal(evil.statusCode, 400);
    assert.equal(json(evil).error.code, 'originNotAllowed');
    const first = await sso(server, claimsFor('x@example.com'));
    const replay = await server.app.inject({ url: `/api/v1/auth/oidc/callback?code=${first.code}&state=${first.state}` });
    assert.equal(replay.statusCode, 302);
    assert.match(replay.headers.location as string, /error=ssoFailed$/);
  } finally {
    await server.close();
  }
  const plain = await startConfigured();
  try {
    assert.equal((await plain.server.app.inject({ url: '/api/v1/auth/oidc/start' })).statusCode, 404, 'sem OIDC_ISSUER o SSO não existe');
  } finally {
    await plain.server.close();
  }
});

test('S-08: o callback do SSO só vale no MESMO navegador que começou o login (cookie de vínculo)', async () => {
  const { server, admin } = await startConfigured(env({ OIDC_AUTO_PROVISION: 'true' }));
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    await api(server.app, owner).op({ type: 'updateWorkspace', patch: { allowedEmailDomains: ['empresa.com'] } });
    const sessionsBefore = (await server.ctx.db.select().from(sessions)).length;
    // CSRF de login: o atacante começa o fluxo e entrega o link do callback à vítima (que não tem o cookie)
    const victim = await sso(server, claimsFor('atacante@empresa.com'), null);
    assert.match(victim.location, /error=ssoFailed$/, 'callback sem o cookie do /start é recusado');
    assert.equal(victim.cookie, null, 'nenhuma sessão para a vítima');
    assert.equal((await server.ctx.db.select().from(sessions)).length, sessionsBefore, 'nenhuma sessão criada');
    // cookie de OUTRO /start (outro fluxo do mesmo navegador ou de outro) também não serve
    const other = await server.app.inject({ url: `/api/v1/auth/oidc/start?redirect=${encodeURIComponent(CLIENT_URL)}` });
    const crossed = await sso(server, claimsFor('atacante@empresa.com'), ssoCookieOf(other) ?? 'cookie-de-outro-fluxo');
    assert.match(crossed.location, /error=ssoFailed$/);
    assert.equal(crossed.cookie, null);
    // o mesmo navegador entra normalmente, e o cookie de vínculo é limpo no callback
    const ok = await sso(server, claimsFor('atacante@empresa.com'));
    assert.equal(ok.location, `${CLIENT_URL}#/auth/sso`);
    assert.ok(ok.cookie, 'sessão criada para quem começou o fluxo');
    const cleared = ok.callback.cookies.find((c) => c.name === SSO_COOKIE);
    assert.ok(cleared && (cleared.value === '' || (cleared.maxAge ?? 1) <= 0 || (cleared.expires && cleared.expires.getTime() <= Date.now())), 'cookie de vínculo limpo');
  } finally {
    await server.close();
  }
});

test('S-08: o cookie de vínculo é HttpOnly, SameSite=Lax (mesmo com LUDRAW_COOKIE_SAMESITE=strict), curto e só no caminho do SSO', async () => {
  const { server } = await startConfigured(env({ LUDRAW_COOKIE_SAMESITE: 'strict' }));
  try {
    const start = await server.app.inject({ url: `/api/v1/auth/oidc/start?redirect=${encodeURIComponent(CLIENT_URL)}` });
    assert.equal(start.statusCode, 302);
    const c = start.cookies.find((x) => x.name === SSO_COOKIE) as { value: string; httpOnly?: boolean; sameSite?: string; path?: string; maxAge?: number } | undefined;
    assert.ok(c, 'o /start deixa o cookie de vínculo');
    assert.ok(c!.value.length >= 40);
    assert.equal(c!.httpOnly, true);
    assert.equal(String(c!.sameSite).toLowerCase(), 'lax', 'o retorno do provedor é navegação GET de outro site: Strict não levaria o cookie');
    assert.equal(c!.path, '/api/v1/auth/oidc');
    assert.ok(c!.maxAge && c!.maxAge > 0 && c!.maxAge <= 600);
  } finally {
    await server.close();
  }
});
