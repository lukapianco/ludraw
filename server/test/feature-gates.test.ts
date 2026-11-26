/**
 * Chat 09 · R5 — funções que a instalação liga ou desliga.
 *  - Design System opcional (D11): `LUDRAW_ENABLE_DESIGN_SYSTEM` → `/info.designSystem`; a regra do cliente
 *    (`designSystemGate`) segue o `/info` quando há servidor e fica ligada sem servidor.
 *  - Painel de e-mail no multi_org (D12): `mailPanelVisible`; GET e PUT de `/admin/mail/settings` e o
 *    `POST /admin/mail/test` recusam com `mailSettingsServerOnly`, sem enviar nada.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designSystemGate, mailPanelVisible } from '../../src/utils/featureGates';
import { MemoryMailer } from '../src/mail/memory';
import { api, completeSetup, issueTestSetupToken, json, MAIL_ENV, startServer, startWithMail } from './helpers';

test('designSystemGate: com servidor segue o /info; sem servidor fica ligada; Modo Servidor espera o /info', () => {
  const cases: [Parameters<typeof designSystemGate>[0], string][] = [
    [{ serverMode: false, info: null, reachable: true }, 'on'], // desenvolvimento / desktop no Modo Local
    [{ serverMode: false, info: null, reachable: false }, 'on'],
    [{ serverMode: false, info: { designSystem: false }, reachable: true }, 'off'], // Modo Local servido pela instalação
    [{ serverMode: false, info: { designSystem: true }, reachable: true }, 'on'],
    [{ serverMode: true, info: { designSystem: false }, reachable: true }, 'off'],
    [{ serverMode: true, info: { designSystem: true }, reachable: true }, 'on'],
    [{ serverMode: true, info: {}, reachable: true }, 'on'], // servidor anterior ao campo
    [{ serverMode: true, info: null, reachable: true }, 'pending'], // ainda sem resposta: nem mostra nem redireciona
    [{ serverMode: true, info: null, reachable: false }, 'off'], // fora do ar e sem /info: desligada
  ];
  for (const [input, expected] of cases) assert.equal(designSystemGate(input), expected, JSON.stringify(input));
});

test('mailPanelVisible: só no single_org; modo desconhecido ainda não mostra', () => {
  assert.equal(mailPanelVisible('single_org'), true);
  assert.equal(mailPanelVisible('multi_org'), false);
  assert.equal(mailPanelVisible(null), false);
  assert.equal(mailPanelVisible(undefined), false);
});

test('/info.designSystem: ligado por padrão; LUDRAW_ENABLE_DESIGN_SYSTEM=false desliga', async () => {
  for (const [env, expected] of [[{}, true], [{ LUDRAW_ENABLE_DESIGN_SYSTEM: 'false' }, false], [{ LUDRAW_ENABLE_DESIGN_SYSTEM: '0' }, false], [{ LUDRAW_ENABLE_DESIGN_SYSTEM: 'true' }, true]] as const) {
    const server = await startServer({ ...env });
    try {
      await issueTestSetupToken(server);
      const info = json(await server.app.inject({ url: '/api/v1/info' }));
      assert.equal(info.designSystem, expected, JSON.stringify(env));
    } finally {
      await server.close();
    }
  }
});

test('multi_org: GET, PUT e o teste de envio do painel de e-mail recusam (409), sem enviar nada; single_org segue igual', async () => {
  const body = { enabled: true, host: null, port: null, security: null, user: null, from: null };

  // single_org (controle): o mesmo servidor com e-mail lê o painel e o botão de teste envia
  const single = await startWithMail();
  try {
    const owner = single.admin.accessToken;
    assert.equal((await api(single.server.app, owner).get('/admin/mail/settings')).statusCode, 200);
    assert.equal((await api(single.server.app, owner).post('/admin/mail/test', {})).statusCode, 200);
    assert.equal(single.mailer.sent.length, 1, 'controle: o teste de envio funciona no single_org');
  } finally {
    await single.server.close();
  }

  const multi = await startServer({ ...MAIL_ENV });
  const mailer = new MemoryMailer();
  multi.ctx.mailer = mailer;
  try {
    await issueTestSetupToken(multi);
    const setup = await completeSetup(multi.app, { mode: 'multi_org' });
    assert.equal(setup.statusCode, 200);
    const token = json(setup).accessToken as string;
    assert.equal(json(await multi.app.inject({ url: '/api/v1/info' })).mode, 'multi_org');
    const calls = [
      ['GET', await api(multi.app, token).get('/admin/mail/settings')],
      ['PUT', await api(multi.app, token).put('/admin/mail/settings', body)],
      ['TEST', await api(multi.app, token).post('/admin/mail/test', {})],
    ] as const;
    for (const [name, res] of calls) {
      assert.equal(res.statusCode, 409, name);
      assert.equal(json(res).error.message.key, 'server.errors.mailSettingsServerOnly', name);
      assert.doesNotMatch(res.body, /smtp\.example\.com/, `${name}: nada da configuração do servidor na resposta`);
    }
    assert.equal(mailer.sent.length, 0, 'nenhuma mensagem de teste saiu');
    // o e-mail do servidor continua ligado para o resto (recuperar senha, convites)
    assert.equal(json(await multi.app.inject({ url: '/api/v1/info' })).email, true);
  } finally {
    await multi.close();
  }
});
