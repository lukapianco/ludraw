/**
 * E-mail (Chat 08.5): configuração (SMTP opcional, pasta de saída só fora de produção, endereço do app
 * obrigatório), `/info.email`, servidor sem e-mail, modelo das mensagens (escape de HTML, links só do
 * endereço configurado), pasta de saída `.eml`, falha de envio fora do caminho da resposta e o e-mail de
 * teste da administração.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { workspaceAudit } from '../src/db/schema';
import { createMailer } from '../src/mail/mailer';
import { MemoryMailer } from '../src/mail/memory';
import { appLink, renderMail } from '../src/mail/templates';
import { api, bearer, clientHeaders, invitePerson, json, MAIL_ENV, startConfigured, startWithMail, type Person } from './helpers';

const BASE = { DATABASE_URL: 'pglite://memory' };
const forgot = (app: import('fastify').FastifyInstance, email: string, headers: Record<string, string> = clientHeaders) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', payload: { email }, headers });

test('configuração: sem variáveis não há e-mail; SMTP exige remetente e endereço do app; produção recusa atalhos de desenvolvimento', () => {
  assert.equal(loadConfig(BASE).mail, null);
  assert.throws(() => loadConfig({ ...BASE, LUDRAW_SMTP_HOST: 'smtp.example.com', LUDRAW_APP_URL: 'https://draw.example.com' }), /LUDRAW_SMTP_FROM/);
  assert.throws(() => loadConfig({ ...BASE, LUDRAW_SMTP_HOST: 'smtp.example.com', LUDRAW_SMTP_FROM: 'a@example.com' }), /LUDRAW_APP_URL/, 'link nunca sai do cabeçalho do pedido');
  assert.throws(() => loadConfig({ ...BASE, ...MAIL_ENV, LUDRAW_MAIL_OUTBOX_DIR: 'x' }), /not both/);
  assert.throws(() => loadConfig({ ...BASE, ...MAIL_ENV, LUDRAW_SMTP_USER: 'u' }), /set together/);
  assert.throws(() => loadConfig({ ...BASE, NODE_ENV: 'production', LUDRAW_MAIL_OUTBOX_DIR: 'x', LUDRAW_APP_URL: 'https://draw.example.com' }), /refused in production/);
  assert.throws(() => loadConfig({ ...BASE, NODE_ENV: 'production', ...MAIL_ENV, LUDRAW_SMTP_ALLOW_INSECURE: 'true' }), /refused in production/);
  assert.throws(() => loadConfig({ ...BASE, ...MAIL_ENV, LUDRAW_APP_URL: 'ftp://draw.example.com' }), /https:\/\/ or http:\/\//);

  const smtp = loadConfig({ ...BASE, ...MAIL_ENV, LUDRAW_APP_URL: 'https://draw.example.com/quadros/' }).mail!;
  assert.equal(smtp.transport, 'smtp');
  assert.equal(smtp.port, 587);
  assert.equal(smtp.secure, false);
  assert.equal(smtp.requireTls, true, 'STARTTLS exigido por padrão');
  assert.equal(smtp.appUrl, 'https://draw.example.com/quadros', 'sem barra no fim; subcaminho preservado');
  assert.equal(smtp.maxPerAddressHour, 5);
  assert.equal(smtp.maxPerIpHour, 20);
  assert.equal(loadConfig({ ...BASE, ...MAIL_ENV, LUDRAW_SMTP_PORT: '465' }).mail!.secure, true);
  // o endereço público serve de endereço do app quando o específico não foi dado
  assert.equal(loadConfig({ ...BASE, LUDRAW_SMTP_HOST: 'smtp.example.com', LUDRAW_SMTP_FROM: 'a@example.com', LUDRAW_PUBLIC_URL: 'https://draw.example.com' }).mail!.appUrl, 'https://draw.example.com');
  const plainHttp = loadConfig({ ...BASE, ...MAIL_ENV, LUDRAW_APP_URL: 'http://draw.example.com' });
  assert.ok(plainHttp.warnings.some((w) => w.includes('LUDRAW_APP_URL uses plain http')));
});

test('sem e-mail: /info.email = false e as rotas de e-mail respondem "indisponível" (o resto funciona)', async () => {
  const { server, admin } = await startConfigured();
  try {
    assert.equal(json(await server.app.inject({ url: '/api/v1/info' })).email, false);
    const res = await forgot(server.app, 'ana@example.com');
    assert.equal(res.statusCode, 503);
    assert.equal(json(res).error.message.key, 'server.errors.mailUnavailable');
    const send = await server.app.inject({ method: 'POST', url: '/api/v1/auth/email/verify/send', headers: bearer(admin.accessToken), payload: {} });
    assert.equal(send.statusCode, 503);
    const t = await api(server.app, admin.accessToken).post('/admin/mail/test', {});
    assert.equal(t.statusCode, 503);
    assert.equal((await server.app.inject({ url: '/api/v1/auth/me', headers: bearer(admin.accessToken) })).statusCode, 200);
  } finally {
    await server.close();
  }
});

test('com e-mail: /info.email = true; o link sai SÓ do endereço configurado, mesmo com Host forjado', async () => {
  const { server, mailer, flush } = await startWithMail();
  try {
    assert.equal(json(await server.app.inject({ url: '/api/v1/info' })).email, true);
    const res = await forgot(server.app, 'ana@example.com', { ...clientHeaders, host: 'evil.example.com', 'x-forwarded-host': 'evil.example.com', 'x-forwarded-proto': 'http' });
    assert.equal(res.statusCode, 202);
    await flush();
    const msg = mailer.last('ana@example.com')!;
    assert.ok(msg, 'mensagem enviada');
    const link = MemoryMailer.linkOf(msg)!;
    assert.match(link, /^https:\/\/draw\.example\.com\/#\/reset\/[A-Za-z0-9_-]{40,}$/);
    assert.doesNotMatch(msg.text + msg.html, /evil\.example\.com/);
    assert.match(msg.subject, /Empresa Exemplo/);
    // sem o cabeçalho do app, o pedido nem é aceito (um site qualquer não dispara e-mails pelo navegador da pessoa)
    assert.equal((await forgot(server.app, 'ana@example.com', {})).statusCode, 403);
  } finally {
    await server.close();
  }
});

test('modelo: valores escapados no HTML, assunto e texto no idioma pedido, link montado só com o endereço do app', () => {
  const pt = renderMail({ kind: 'resetPassword', lang: 'pt-BR', org: '<b>Acme & Filhos</b>', url: 'https://draw.example.com/#/reset/abc"onmouseover="x', params: { minutes: 30 } });
  assert.doesNotMatch(pt.html, /<b>Acme/);
  assert.match(pt.html, /&lt;b&gt;Acme &amp; Filhos&lt;\/b&gt;/);
  assert.doesNotMatch(pt.html, /abc"onmouseover/, 'aspas do endereço escapadas no atributo');
  assert.match(pt.text, /30 minutos/);
  assert.match(pt.text, /https:\/\/draw\.example\.com\/#\/reset\//);
  assert.doesNotMatch(pt.html, /<script|https?:\/\/(?!draw\.example\.com)/i, 'sem script nem recurso externo');
  // B2: a única imagem é a faixa da marca, embutida na própria mensagem (cid:), nunca buscada de fora
  assert.deepEqual([...pt.html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]), ['cid:od-banner@ludraw']);
  const en = renderMail({ kind: 'resetPassword', lang: 'en', org: 'Acme', url: 'https://draw.example.com/#/reset/abc', params: { minutes: 30 } });
  assert.match(en.subject, /Reset your password/);
  assert.match(en.text, /30 minutes/);
  assert.doesNotMatch(en.text + en.subject, /\{\w+\}/, 'nenhum parâmetro sem preencher');
  const info = renderMail({ kind: 'testMail', lang: 'pt-BR', org: 'Acme' });
  assert.doesNotMatch(info.html, /<a /, 'e-mail informativo não tem botão');
  assert.equal(appLink('https://draw.example.com/quadros', '/reset/abc'), 'https://draw.example.com/quadros/#/reset/abc');
});

test('pasta de saída (desenvolvimento): cada mensagem vira um arquivo .eml legível', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ludraw-outbox-'));
  try {
    const config = loadConfig({ ...BASE, LUDRAW_MAIL_OUTBOX_DIR: dir, LUDRAW_APP_URL: 'http://localhost:5173' });
    assert.equal(config.mail!.transport, 'outbox');
    const mailer = createMailer(config.mail);
    assert.equal(mailer.enabled, true);
    await mailer.send({ to: 'bia@example.com', subject: 'Assunto\r\nBcc: outro@example.com', text: 'Abra http://localhost:5173/#/reset/TOKEN123', html: '<p>oi</p>' });
    const files = readdirSync(dir).sort();
    assert.equal(files.length, 2, 'um .eml e a cópia legível .txt');
    assert.match(files[0], /\.eml$/);
    assert.equal(files[1], files[0].replace(/\.eml$/, '.txt'));
    const txt = readFileSync(join(dir, files[1]), 'utf8');
    assert.match(txt, /^To: bia@example\.com$/m);
    assert.match(txt, /^Subject: Assunto Bcc: outro@example\.com$/m, 'assunto em uma linha só');
    assert.match(txt, /http:\/\/localhost:5173\/#\/reset\/TOKEN123$/m, 'link inteiro, sem quebra');
    const eml = readFileSync(join(dir, files[0]), 'utf8');
    assert.match(eml, /^To: bia@example\.com$/m);
    assert.match(eml, /TOKEN123/);
    assert.doesNotMatch(eml, /^Bcc:/m, 'quebra de linha no assunto não vira cabeçalho novo');
    assert.equal(createMailer(null).enabled, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('servidor de e-mail fora do ar: quem pediu recebe a mesma resposta e nada quebra', async () => {
  const { server, mailer, flush } = await startWithMail();
  try {
    mailer.fail = true;
    const res = await forgot(server.app, 'ana@example.com');
    assert.equal(res.statusCode, 202);
    await flush();
    assert.equal(mailer.sent.length, 0);
    assert.equal((await server.app.inject({ url: '/api/v1/health' })).statusCode, 200);
  } finally {
    await server.close();
  }
});

test('e-mail de teste: só quem gerencia políticas; vai para o próprio e-mail; registra; falha do SMTP vira erro claro', async () => {
  const { server, admin, mailer } = await startWithMail();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    assert.equal((await api(server.app, bia).post('/admin/mail/test', {})).statusCode, 403);
    assert.equal(mailer.sent.length, 0);

    const ok = await api(server.app, owner).post('/admin/mail/test', { lang: 'en' });
    assert.equal(ok.statusCode, 200);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, 'ana@example.com');
    assert.match(mailer.sent[0].subject, /Test e-mail/);
    const audit = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'mail_test_sent'));
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0].message, { key: 'workspace.audit.msg.mailTestSent' });

    mailer.fail = true;
    const failed = await api(server.app, owner).post('/admin/mail/test', {});
    assert.equal(failed.statusCode, 502);
    // B2: só a categoria (aqui, conexão recusada) — nunca a resposta do servidor remoto
    assert.equal(json(failed).error.message.key, 'server.errors.mailConnectFailed');
    assert.doesNotMatch(failed.body, /ana@example\.com|ECONNREFUSED/, 'a resposta não leva detalhe do SMTP');
  } finally {
    await server.close();
  }
});
