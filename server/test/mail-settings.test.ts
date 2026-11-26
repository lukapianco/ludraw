/**
 * Chat 08.5 · B2 — e-mail configurado pelo painel (Admin → Políticas → E-mail).
 *
 *  - a senha nunca vaza (respostas, banco, auditoria, log);
 *  - a chave da senha é LUDRAW_JWT_SECRET (propósito 'smtp-password'); sem ela, o painel recusa senha;
 *    chave trocada → "redefina a senha" e carteiro desligado;
 *  - variáveis vencem campo a campo (campo travado → 409); a pasta de saída trava tudo;
 *  - host interno recusado (loopback, privado, link-local/metadados, IPv6 interno, IPv4 mapeado) e porta fora
 *    da lista; liberado com LUDRAW_SMTP_ALLOW_PRIVATE_HOST;
 *  - DNS rebinding: a conferência roda a cada envio, a conexão vai ao IP conferido com `servername` = nome, e o
 *    nodemailer NÃO resolve o nome de novo (prova com nodemailer de verdade + servidor SMTP falso + espião no DNS);
 *  - salvar recria o carteiro sem reiniciar (`/info.email`);
 *  - permissão, multi_org só leitura, endereço do app obrigatório, limite do botão de teste, auditoria.
 */
import assert from 'node:assert/strict';
import dns from 'node:dns';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { createTransport } from 'nodemailer';
import { LOG_REDACT } from '../src/app';
import { mailSettings, workspaceAudit } from '../src/db/schema';
import { Sealer } from '../src/lib/crypto';
import { checkSmtpHost, isInternalAddress } from '../src/mail/hostGuard';
import type { MailEnvelope, SmtpOptions, TransportFactory } from '../src/mail/mailer';
import { api, completeSetup, invitePerson, issueTestSetupToken, json, MAIL_ENV, startConfigured, startServer, type Person } from './helpers';

const JWT = 'jwt-secret-for-the-mail-panel-tests-0123456789';
const PANEL_ENV = { LUDRAW_APP_URL: 'https://draw.example.com', LUDRAW_JWT_SECRET: JWT };
const SECRET = 'S3nha-do-SMTP-que-nunca-vaza!';
const PUBLIC_IP = '93.184.216.34';

function spyTransport() {
  const calls: SmtpOptions[] = [];
  const sent: MailEnvelope[] = [];
  const factory: TransportFactory = (options) => {
    calls.push(structuredClone(options));
    return {
      sendMail: async (message: MailEnvelope) => {
        sent.push(message);
        return {};
      },
    };
  };
  return { calls, sent, factory };
}

function fakeLookup(initial: Record<string, string[]>) {
  const map = { ...initial };
  const calls: string[] = [];
  const fn = async (host: string) => {
    calls.push(host);
    const found = map[host];
    if (!found) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return found;
  };
  return { map, calls, fn };
}

async function startPanel(env: Record<string, string> = {}, hosts: Record<string, string[]> = { 'smtp.example.com': [PUBLIC_IP] }, logs?: string[]) {
  const spy = spyTransport();
  const lookup = fakeLookup(hosts);
  const logger = logs
    ? {
        level: 'trace',
        redact: LOG_REDACT,
        stream: new Writable({
          write(chunk, _enc, cb) {
            logs.push(String(chunk));
            cb();
          },
        }),
      }
    : false;
  const started = await startConfigured({ ...PANEL_ENV, ...env }, (_app, ctx) => {
    ctx.dnsLookup = lookup.fn;
    ctx.smtpTransportFactory = spy.factory;
  }, logger);
  const owner: Person = { token: started.admin.accessToken, id: started.admin.user.id };
  return { ...started, owner, spy, lookup };
}

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  security: 'starttls',
  user: 'ludraw@example.com',
  from: 'LuDraw <no-reply@example.com>',
  password: SECRET,
  ...over,
});

const info = async (s: { app: import('fastify').FastifyInstance }) => json((await s.app.inject({ url: '/api/v1/info' })) as never) as { email: boolean };

test('senha nunca vaza: respostas, estado, banco, auditoria e log; o carteiro recebe a senha certa', async () => {
  const logs: string[] = [];
  const { server, owner, spy } = await startPanel({}, undefined, logs);
  try {
    const put = await api(server.app, owner).put('/admin/mail/settings', settings());
    assert.equal(put.statusCode, 200, put.body);
    const view = json(put);
    assert.equal(view.passwordSet, true);
    assert.equal(view.active, true);
    assert.equal(view.source, 'panel');
    assert.ok(!('password' in view.values));

    const get = await api(server.app, owner).get('/admin/mail/settings');
    const state = await server.app.inject({ method: 'GET', url: '/api/v1/workspace/state', headers: { authorization: `Bearer ${owner.token}` } });
    const infoRes = await server.app.inject({ url: '/api/v1/info' });
    for (const [what, body] of [['PUT', put.body], ['GET', get.body], ['estado', state.body], ['info', infoRes.body]] as const) {
      assert.ok(!body.includes(SECRET), `a senha apareceu em ${what}`);
    }

    const [row] = await server.ctx.db.select().from(mailSettings);
    assert.ok(row.passwordEnc && !row.passwordEnc.includes(SECRET), 'no banco só cifrada');
    assert.ok(!JSON.stringify(row).includes(SECRET));
    assert.equal(row.passwordKeyCheck, new Sealer(JWT, 'smtp-password').fingerprint(), 'chave = LUDRAW_JWT_SECRET, propósito smtp-password');
    assert.equal(new Sealer(JWT, 'smtp-password').open(row.passwordEnc!), SECRET);
    assert.equal(new Sealer(JWT, 'invitation-token').open(row.passwordEnc!), null, 'propósito próprio: outra cifra não abre');

    const audits = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'mail_settings_updated'));
    assert.equal(audits.length, 1);
    assert.ok(!JSON.stringify(audits).includes(SECRET), 'auditoria sem a senha');
    assert.deepEqual(
      audits[0].changes?.find((c) => c.field === 'smtp.password'),
      { field: 'smtp.password', before: false, after: true },
      'da senha a auditoria guarda só "tinha / tem"',
    );
    assert.equal((audits[0].message as { key: string }).key, 'workspace.audit.msg.mailSettingsUpdated');

    const sent = await api(server.app, owner).post('/admin/mail/test', {});
    assert.equal(sent.statusCode, 200, sent.body);
    assert.equal(spy.calls[0].auth?.pass, SECRET, 'o carteiro abre a senha só na hora do envio');
    assert.ok(!sent.body.includes(SECRET));

    // troca de senha e remoção também não vazam
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings({ password: 'Outra-senha-secreta-2026' }))).statusCode, 200);
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings({ password: null, user: null }))).statusCode, 200);
    const [cleared] = await server.ctx.db.select().from(mailSettings);
    assert.equal(cleared.passwordEnc, null);

    await server.app.close().catch(() => undefined);
    const allLogs = logs.join('\n');
    assert.ok(logs.length > 0, 'o teste capturou o log');
    assert.ok(!allLogs.includes(SECRET) && !allLogs.includes('Outra-senha-secreta-2026'), 'a senha não aparece no log');
  } finally {
    await server.close().catch(() => undefined);
  }
});

test('chave: sem LUDRAW_JWT_SECRET o painel não guarda senha (relay sem autenticação funciona); chave trocada pede a senha de novo', async () => {
  const noKey = await startPanel({ LUDRAW_JWT_SECRET: '' });
  try {
    const view = json(await api(noKey.server.app, noKey.owner).get('/admin/mail/settings'));
    assert.equal(view.canStorePassword, false);
    const refused = await api(noKey.server.app, noKey.owner).put('/admin/mail/settings', settings());
    assert.equal(refused.statusCode, 409);
    assert.equal(json(refused).error.message.key, 'server.errors.mailKeyMissing');
    const relay = await api(noKey.server.app, noKey.owner).put('/admin/mail/settings', settings({ user: null, password: undefined }));
    assert.equal(relay.statusCode, 200, relay.body);
    assert.equal(json(relay).active, true);
  } finally {
    await noKey.server.close();
  }

  const { server, owner } = await startPanel();
  try {
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings())).statusCode, 200);
    assert.equal((await info(server)).email, true);
    // a variável mudou (simulado): a senha guardada não abre mais
    server.ctx.keys.mailSealer = new Sealer('another-jwt-secret-with-at-least-32-chars!!', 'smtp-password');
    await server.ctx.mailControl!.reload();
    const view = json(await api(server.app, owner).get('/admin/mail/settings'));
    assert.equal(view.passwordUnreadable, true);
    assert.equal(view.problem, 'passwordUnreadable');
    assert.equal(view.active, false);
    assert.equal((await info(server)).email, false, 'sem senha legível o e-mail desliga');
    // digitar a senha de novo resolve
    const fixed = await api(server.app, owner).put('/admin/mail/settings', settings());
    assert.equal(json(fixed).passwordUnreadable, false);
    assert.equal(json(fixed).active, true);
  } finally {
    await server.close();
  }
});

test('precedência campo a campo: variável trava o campo (409), o painel completa o resto; pasta de saída trava tudo', async () => {
  const { server, owner, spy, lookup } = await startPanel({ ...MAIL_ENV });
  try {
    const view = json(await api(server.app, owner).get('/admin/mail/settings'));
    assert.equal(view.source, 'env');
    assert.deepEqual(view.locked, { host: true, port: false, security: false, user: false, password: false, from: true });
    assert.equal(view.enabledLocked, true);
    assert.equal(view.values.host, 'smtp.example.com');

    const locked = await api(server.app, owner).put('/admin/mail/settings', settings({ host: 'smtp.other.com', from: null }));
    assert.equal(locked.statusCode, 409);
    assert.equal(json(locked).error.message.key, 'server.errors.mailFieldLocked');

    const mixed = await api(server.app, owner).put('/admin/mail/settings', settings({ host: null, from: null, port: 465, security: 'tls', user: 'robo', password: 'senha-do-robo' }));
    assert.equal(mixed.statusCode, 200, mixed.body);
    assert.equal(json(mixed).source, 'mixed');
    assert.equal(json(mixed).values.port, 465);

    assert.equal((await api(server.app, owner).post('/admin/mail/test', {})).statusCode, 200);
    const opts = spy.calls.at(-1)!;
    assert.equal(opts.host, 'smtp.example.com', 'host da variável: sem fixação de IP');
    assert.equal(opts.port, 465);
    assert.equal(opts.secure, true);
    assert.deepEqual(opts.auth, { user: 'robo', pass: 'senha-do-robo' });
    assert.equal(lookup.calls.length, 0, 'host da variável não passa pela guarda do painel');
  } finally {
    await server.close();
  }

  const pw = await startPanel({ ...MAIL_ENV, LUDRAW_SMTP_USER: 'env-user', LUDRAW_SMTP_PASSWORD: 'env-pass' });
  try {
    const view = json(await api(pw.server.app, pw.owner).get('/admin/mail/settings'));
    assert.equal(view.locked.password, true);
    assert.equal(view.passwordSet, true);
    const r = await api(pw.server.app, pw.owner).put('/admin/mail/settings', settings({ host: null, from: null, user: null }));
    assert.equal(r.statusCode, 409, 'senha da variável não pode ser trocada pelo painel');
    assert.ok(!JSON.stringify(view).includes('env-pass'));
  } finally {
    await pw.server.close();
  }

  const outboxDir = mkdtempSync(join(tmpdir(), 'ludraw-outbox-'));
  const outbox = await startPanel({ LUDRAW_MAIL_OUTBOX_DIR: outboxDir });
  try {
    const view = json(await api(outbox.server.app, outbox.owner).get('/admin/mail/settings'));
    assert.equal(view.source, 'outbox');
    assert.ok(Object.values(view.locked).every(Boolean));
    assert.equal((await api(outbox.server.app, outbox.owner).put('/admin/mail/settings', settings())).statusCode, 409);
  } finally {
    await outbox.server.close();
    rmSync(outboxDir, { recursive: true, force: true });
  }
});

test('host interno recusado (nome e IP, IPv4 e IPv6, mapeado, metadados); porta fora da lista; liberado para homelab', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fd00:ec2::254', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1']) {
    assert.equal(isInternalAddress(ip), true, `${ip} é interno`);
  }
  for (const ip of [PUBLIC_IP, '1.1.1.1', '2606:4700:4700::1111', '::ffff:93.184.216.34']) assert.equal(isInternalAddress(ip), false, `${ip} é público`);

  const hosts = {
    'smtp.example.com': [PUBLIC_IP],
    localhost: ['127.0.0.1', '::1'],
    'interno.example.com': [PUBLIC_IP, '10.0.0.5'],
    'metadados.example.com': ['169.254.169.254'],
    'v6.example.com': ['fd12:3456::1'],
  };
  const { server, owner } = await startPanel({}, hosts);
  try {
    const put = (over: Record<string, unknown>) => api(server.app, owner).put('/admin/mail/settings', settings(over));
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '169.254.169.254', '[::1]', 'fd00::1', '::ffff:127.0.0.1', 'interno.example.com', 'metadados.example.com', 'v6.example.com']) {
      const r = await put({ host });
      assert.equal(r.statusCode, 422, `${host}: ${r.body}`);
      assert.equal(json(r).error.message.key, 'server.errors.mailHostPrivate', host);
    }
    const unresolved = await put({ host: 'nao-existe.example.com' });
    assert.equal(json(unresolved).error.message.key, 'server.errors.mailHostUnresolved');
    const invalid = await put({ host: 'smtp exemplo!' });
    assert.equal(json(invalid).error.message.key, 'server.errors.mailHostInvalid');
    const port = await put({ port: 2526 });
    assert.equal(port.statusCode, 422);
    assert.equal(json(port).error.message.key, 'server.errors.mailPortNotAllowed');
    for (const p of [587, 465, 25, 2525]) assert.equal((await put({ port: p, security: p === 465 ? 'tls' : 'starttls' })).statusCode, 200, `porta ${p}`);
    // porta e segurança trocadas nunca conectam: recusa ao salvar, com a explicação
    for (const [p, sec] of [[465, 'starttls'], [587, 'tls']] as const) {
      const r = await put({ port: p, security: sec });
      assert.equal(r.statusCode, 422, `${p}/${sec}`);
      assert.equal(json(r).error.message.key, 'server.errors.mailSecurityMismatch');
    }
    const from = await put({ from: 'sem-arroba' });
    assert.equal(json(from).error.message.key, 'server.errors.mailFromInvalid');
    assert.equal((await api(server.app, owner).get('/admin/mail/settings')).statusCode, 200);
    assert.equal((await server.ctx.db.select().from(mailSettings))[0].host, 'smtp.example.com', 'nada recusado foi gravado');
  } finally {
    await server.close();
  }

  const lab = await startPanel({ LUDRAW_SMTP_ALLOW_PRIVATE_HOST: 'true' }, hosts);
  try {
    const r = await api(lab.server.app, lab.owner).put('/admin/mail/settings', settings({ host: '10.1.2.3' }));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(json(r).allowPrivateHost, true);
  } finally {
    await lab.server.close();
  }
  const guard = await checkSmtpHost('localhost', { lookup: async () => ['127.0.0.1'], allowPrivate: false });
  assert.deepEqual(guard, { ok: false, reason: 'private' });
});

test('DNS rebinding: confere a cada envio e conecta no IP conferido com servername = nome', async () => {
  const { server, owner, spy, lookup } = await startPanel();
  try {
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings())).statusCode, 200);
    const before = lookup.calls.length;

    // público ao salvar, interno na hora de enviar → recusado, sem abrir conexão nenhuma
    lookup.map['smtp.example.com'] = ['127.0.0.1'];
    const blocked = await api(server.app, owner).post('/admin/mail/test', {});
    assert.equal(blocked.statusCode, 502);
    assert.equal(json(blocked).error.message.key, 'server.errors.mailHostPrivate');
    assert.equal(spy.calls.length, 0, 'nenhum transporte foi criado');
    assert.equal(lookup.calls.length, before + 1, 'conferiu de novo na hora do envio');

    // de volta ao público: a conexão vai ao IP conferido, o nome segue só para o TLS
    lookup.map['smtp.example.com'] = [PUBLIC_IP];
    assert.equal((await api(server.app, owner).post('/admin/mail/test', {})).statusCode, 200);
    assert.equal(lookup.calls.length, before + 2, 'uma resolução por envio — a da guarda');
    const opts = spy.calls[0];
    assert.equal(opts.host, PUBLIC_IP, 'host = IP já conferido (não o nome)');
    assert.equal(opts.servername, 'smtp.example.com');
    assert.deepEqual(opts.tls, { servername: 'smtp.example.com' });
  } finally {
    await server.close();
  }
});

test('DNS rebinding (nodemailer de verdade): com o IP conferido, o envio não faz nenhuma consulta de DNS', async () => {
  // servidor SMTP falso mínimo em 127.0.0.1 (liberado só neste teste com ALLOW_PRIVATE_HOST)
  const received: string[] = [];
  const sockets = new Set<Socket>();
  const smtp = createServer((sock) => {
    sockets.add(sock);
    let buf = '';
    let inData = false;
    let msg = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(msg);
            sock.write('250 OK\r\n');
          } else msg += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-fake\r\n250 8BITMIME\r\n');
        else if (cmd === 'DATA') {
          inData = true;
          msg = '';
          sock.write('354 go ahead\r\n');
        } else if (cmd === 'QUIT') {
          sock.write('221 bye\r\n');
          sock.end();
        } else sock.write('250 OK\r\n');
      }
    });
    sock.on('close', () => sockets.delete(sock));
  });
  await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  const fakePort = (smtp.address() as AddressInfo).port;

  const seen: SmtpOptions[] = [];
  const { server, owner } = await startPanel({ LUDRAW_SMTP_ALLOW_PRIVATE_HOST: 'true' }, { 'mail.rebind.test': ['127.0.0.1'] });
  // transporte REAL do nodemailer; o teste só troca a porta (a do servidor falso) e dispensa o STARTTLS
  server.ctx.smtpTransportFactory = (options) => {
    seen.push(structuredClone(options));
    return createTransport({ ...options, port: fakePort, secure: false, requireTLS: false, ignoreTLS: true });
  };
  // o nodemailer resolve por `new dns.Resolver()` (resolve4/resolve6) e, na falta, por `dns.lookup`: o espião
  // conta tanto as funções do módulo quanto as do protótipo do Resolver
  const original = { lookup: dns.lookup, resolve4: dns.resolve4, resolve6: dns.resolve6, resolve: dns.resolve };
  const proto = dns.Resolver.prototype as unknown as Record<'resolve4' | 'resolve6' | 'resolve', (...a: unknown[]) => unknown>;
  const originalProto = { resolve4: proto.resolve4, resolve6: proto.resolve6, resolve: proto.resolve };
  let dnsCalls = 0;
  const count =
    <F extends (...a: never[]) => unknown>(fn: F) =>
    (...args: Parameters<F>) => {
      dnsCalls++;
      return fn(...args);
    };
  try {
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings({ host: 'mail.rebind.test', user: null, password: undefined }))).statusCode, 200);
    dns.lookup = count(original.lookup) as typeof dns.lookup;
    dns.resolve4 = count(original.resolve4) as typeof dns.resolve4;
    dns.resolve6 = count(original.resolve6) as typeof dns.resolve6;
    dns.resolve = count(original.resolve) as typeof dns.resolve;
    for (const name of ['resolve4', 'resolve6', 'resolve'] as const) {
      const fn = originalProto[name];
      proto[name] = function (this: unknown, ...args: unknown[]) {
        dnsCalls++;
        return fn.apply(this, args);
      };
    }
    const res = await api(server.app, owner).post('/admin/mail/test', {});
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(received.length, 1, 'a mensagem chegou ao servidor falso');
    assert.equal(seen[0].host, '127.0.0.1', 'o nodemailer recebeu o IP conferido');
    assert.equal(seen[0].servername, 'mail.rebind.test');
    assert.equal(dnsCalls, 0, 'o nodemailer não consultou o DNS: não há janela para trocar o endereço depois da conferência');

    // controle: o espião enxerga, sim, o nodemailer resolvendo quando recebe um NOME (prova que o 0 acima vale)
    await createTransport({ host: 'localhost', port: fakePort, secure: false, ignoreTLS: true }).sendMail({ from: 'a@example.com', to: 'b@example.com', subject: 'controle', text: 'x' });
    assert.ok(dnsCalls > 0, 'com nome, o nodemailer consulta o DNS (o espião funciona)');
    assert.equal(received.length, 2);
  } finally {
    Object.assign(dns, original);
    Object.assign(proto, originalProto);
    await server.close();
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
  }
});

test('salvar recria o carteiro sem reiniciar: /info.email acompanha; desligar desliga', async () => {
  const { server, owner, spy } = await startPanel();
  try {
    const mailer = server.ctx.mailer;
    assert.equal((await info(server)).email, false);
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings())).statusCode, 200);
    assert.equal((await info(server)).email, true, 'ligou sem reiniciar');
    assert.equal(server.ctx.mailer, mailer, 'o mesmo objeto no ctx (quem guardou a referência acompanha)');
    assert.equal((await api(server.app, owner).post('/admin/mail/test', {})).statusCode, 200);
    assert.equal(spy.sent.at(-1)?.from, 'LuDraw <no-reply@example.com>');

    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings({ from: 'Equipe <equipe@example.com>' }))).statusCode, 200);
    assert.equal((await api(server.app, owner).post('/admin/mail/test', {})).statusCode, 200);
    assert.equal(spy.sent.at(-1)?.from, 'Equipe <equipe@example.com>', 'a configuração nova vale no envio seguinte');

    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings({ enabled: false }))).statusCode, 200);
    assert.equal((await info(server)).email, false);
    assert.equal((await api(server.app, owner).post('/admin/mail/test', {})).statusCode, 503);
  } finally {
    await server.close();
  }
});

test('regras: só quem gerencia políticas; multi_org recusa (sem painel); sem endereço do app recusa; incompleto não liga; limite do teste; auditoria só com nomes', async () => {
  const { server, owner } = await startPanel();
  try {
    const bia = await invitePerson(server.app, owner, { email: 'bia@example.com' });
    assert.equal((await api(server.app, bia).get('/admin/mail/settings')).statusCode, 403);
    assert.equal((await api(server.app, bia).put('/admin/mail/settings', settings())).statusCode, 403);

    const incomplete = await api(server.app, owner).put('/admin/mail/settings', settings({ from: null }));
    assert.equal(incomplete.statusCode, 422);
    assert.equal(json(incomplete).error.message.key, 'server.errors.mailIncomplete');
    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings({ enabled: false, from: null }))).statusCode, 200, 'rascunho desligado pode ficar incompleto');

    assert.equal((await api(server.app, owner).put('/admin/mail/settings', settings())).statusCode, 200);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await api(server.app, owner).post('/admin/mail/test', {})).statusCode);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429], 'botão de teste: 5 a cada 15 minutos');

    const audits = await server.ctx.db.select().from(workspaceAudit).where(eq(workspaceAudit.action, 'mail_settings_updated'));
    const fields = audits.flatMap((a) => (a.changes ?? []).map((c) => c.field));
    assert.ok(fields.includes('smtp.host') && fields.includes('smtp.from') && fields.includes('smtp.password'));
    for (const c of audits.flatMap((a) => a.changes ?? [])) if (c.field === 'smtp.password') assert.equal(typeof c.after, 'boolean');
  } finally {
    await server.close();
  }

  const noUrl = await startPanel({ LUDRAW_APP_URL: '' });
  try {
    const view = json(await api(noUrl.server.app, noUrl.owner).get('/admin/mail/settings'));
    assert.equal(view.appUrlMissing, true);
    const r = await api(noUrl.server.app, noUrl.owner).put('/admin/mail/settings', settings());
    assert.equal(r.statusCode, 409);
    assert.equal(json(r).error.message.key, 'server.errors.mailAppUrlMissing');
  } finally {
    await noUrl.server.close();
  }

  const multi = await startServer({ ...PANEL_ENV });
  try {
    await issueTestSetupToken(multi);
    const setup = await completeSetup(multi.app, { mode: 'multi_org' });
    const token = json(setup).accessToken as string;
    // Chat 09 · R5 (D12): no multi_org nem a leitura existe (o painel some da Administração)
    const read = await api(multi.app, token).get('/admin/mail/settings');
    assert.equal(read.statusCode, 409);
    assert.equal(json(read).error.message.key, 'server.errors.mailSettingsServerOnly');
    const r = await api(multi.app, token).put('/admin/mail/settings', settings());
    assert.equal(r.statusCode, 409);
    assert.equal(json(r).error.message.key, 'server.errors.mailSettingsServerOnly');
  } finally {
    await multi.close();
  }
});
