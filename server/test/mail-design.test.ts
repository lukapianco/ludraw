/**
 * Chat 08.5 · B2 — e-mails com a faixa da marca e limites de envio.
 *
 *  - todo tipo de e-mail, nos dois idiomas: a faixa vem EMBUTIDA (anexo inline com o mesmo `cid:` do HTML),
 *    nenhum recurso externo, texto alternativo, prévia escondida, claro/escuro, escape mantido, tamanho total
 *    abaixo de 100 KB e a versão só texto sem HTML;
 *  - limites: padrão seguro, teto que a variável não ultrapassa, limite por pessoa configurável e o teto do
 *    servidor inteiro (`MailControl`) avisando uma vez no log.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAIL_TEMPLATE_KEYS, type MailKind } from '../../src/utils/apiContract';
import { MAIL_BANNER_ARTS, MAIL_KIND_ART, mailBannerArtFor, mailBannerSource, mailBannerSvg } from '../../src/utils/mailBanners';
import { loadConfig, MAIL_RATE_LIMITS } from '../src/config';
import { MAIL_BANNER_PNG, MAIL_BANNER_PNG_SHA256, MAIL_BANNER_SOURCE_SHA256 } from '../src/mail/bannerImages';
import { MailControl, MailRateLimitedError, type MailEnvelope, type TransportFactory } from '../src/mail/mailer';
import { resolveMail } from '../src/mail/settings';
import { MAIL_BANNER_CID, renderMail } from '../src/mail/templates';
import { api, invitePerson, MAIL_ENV, startWithMail, type Person } from './helpers';

const KINDS = Object.keys(MAIL_TEMPLATE_KEYS).filter((k) => k !== 'common' && k !== 'roles') as MailKind[];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('todo e-mail leva a faixa embutida, nada externo, cabe em 100 KB e mantém o escape', () => {
  for (const lang of ['pt-BR', 'en'] as const) {
    for (const kind of KINDS) {
      const mail = renderMail({ kind, lang, org: 'Org <b>"x"</b>', url: 'https://draw.example.com/#/reset/abc', params: { minutes: 30, days: 7, inviter: 'Ana', role: 'membro', provider: 'SSO' } });
      const where = `${kind}/${lang}`;
      assert.equal(mail.attachments?.length, 1, `${where}: uma imagem embutida`);
      const banner = mail.attachments![0];
      assert.equal(banner.cid, MAIL_BANNER_CID);
      assert.equal(banner.contentType, 'image/png');
      assert.ok(banner.content.subarray(0, 8).equals(PNG_SIGNATURE), `${where}: PNG de verdade`);
      assert.ok(mail.html.includes(`src="cid:${MAIL_BANNER_CID}"`), `${where}: o HTML aponta para a imagem embutida`);
      assert.doesNotMatch(mail.html, /\s(?:src|background)=["']?(?:https?:)?\/\//i, `${where}: nenhum recurso externo`);
      assert.match(mail.html, /<img [^>]*alt="LuDraw"/, `${where}: texto alternativo`);
      assert.match(mail.html, /name="color-scheme" content="light dark"/, `${where}: claro e escuro`);
      assert.match(mail.html, /display:none;max-height:0/, `${where}: texto de prévia escondido`);
      assert.ok(!mail.html.includes('<b>"x"</b>') && mail.html.includes('Org &lt;b&gt;&quot;x&quot;&lt;/b&gt;'), `${where}: escape mantido`);
      // texto puro: o nome da organização vai como foi digitado; marcação do layout, nunca
      assert.doesNotMatch(mail.text, /<(?:table|td|a|img|div|p|h1|span)\b|&lt;|&amp;/i, `${where}: texto puro sem HTML`);
      const total = Buffer.byteLength(mail.html) + Buffer.byteLength(mail.text) + Math.ceil((banner.content.length * 4) / 3);
      assert.ok(total < 100 * 1024, `${where}: ${Math.round(total / 1024)} KB (limite 100 KB)`);
    }
  }
});

test('faixas: uma por tipo de e-mail, todas em PNG, e os PNGs batem com o desenho atual', () => {
  for (const art of MAIL_BANNER_ARTS) {
    assert.ok(MAIL_BANNER_PNG[art], `PNG gerado para ${art}`);
    assert.match(mailBannerSvg(art), /^<svg [^>]*viewBox="0 0 1200 336"/);
    assert.doesNotMatch(mailBannerSvg(art), /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'SVG sem recurso externo');
  }
  for (const kind of KINDS) assert.equal(mailBannerArtFor(kind), MAIL_KIND_ART[kind as keyof typeof MAIL_KIND_ART]);
  assert.equal(
    createHash('sha256').update(mailBannerSource()).digest('hex'),
    MAIL_BANNER_SOURCE_SHA256,
    'o desenho das faixas (src/utils/mailBanners.ts) mudou e os PNGs não: rode `npm run mail:assets` e versione server/src/mail/bannerImages.ts',
  );
});

test('faixas: o SHA-256 de cada PNG confere com o arquivo gerado e com o docs/PROVENANCE.md §4 (Chat 08.6 · O-08)', () => {
  const provenance = readFileSync(new URL('../../docs/PROVENANCE.md', import.meta.url), 'utf8');
  for (const art of MAIL_BANNER_ARTS) {
    const real = createHash('sha256').update(Buffer.from(MAIL_BANNER_PNG[art], 'base64')).digest('hex');
    assert.equal(real, MAIL_BANNER_PNG_SHA256[art], `${art}: os bytes do PNG mudaram sem regerar pelo npm run mail:assets`);
    assert.ok(provenance.includes(`${art} \`${real}\``), `${art}: SHA-256 do PNG ausente ou diferente no docs/PROVENANCE.md §4`);
  }
});

test('limites: padrão seguro; acima do teto vale o teto (com aviso); a variável ajusta para baixo', () => {
  const base = { DATABASE_URL: 'pglite://memory' };
  const def = loadConfig(base);
  assert.equal(def.mailEnv.maxPerUserHour, MAIL_RATE_LIMITS.perUserHour.default);
  assert.equal(def.mailEnv.maxPerServerHour, MAIL_RATE_LIMITS.perServerHour.default);
  const high = loadConfig({ ...base, LUDRAW_MAIL_MAX_PER_USER_HOUR: '5000', LUDRAW_MAIL_MAX_PER_HOUR: '999999' });
  assert.equal(high.mailEnv.maxPerUserHour, MAIL_RATE_LIMITS.perUserHour.max);
  assert.equal(high.mailEnv.maxPerServerHour, MAIL_RATE_LIMITS.perServerHour.max);
  assert.ok(high.warnings.some((w) => w.includes('LUDRAW_MAIL_MAX_PER_USER_HOUR')));
  assert.ok(high.warnings.some((w) => w.includes('LUDRAW_MAIL_MAX_PER_HOUR')));
  const low = loadConfig({ ...base, LUDRAW_MAIL_MAX_PER_USER_HOUR: '20', LUDRAW_MAIL_MAX_PER_HOUR: '100' });
  assert.equal(low.mailEnv.maxPerUserHour, 20);
  assert.equal(low.mailEnv.maxPerServerHour, 100);
});

test('teto do servidor: passou do limite por hora, recusa (sem enviar) e avisa no log uma vez', async () => {
  const config = loadConfig({ DATABASE_URL: 'pglite://memory', ...MAIL_ENV });
  const sent: MailEnvelope[] = [];
  const factory: TransportFactory = () => ({ sendMail: async (m: MailEnvelope) => void sent.push(m) });
  const warnings: number[] = [];
  const control = new MailControl(
    async () => resolveMail({ env: config.mailEnv, envConfig: config.mail, appUrl: config.appUrl, row: null, sealer: null, serverOnly: false }),
    () => ({ lookup: async () => ['93.184.216.34'], factory, allowPrivate: false }),
    { maxPerHour: 3, onCeiling: (ms) => warnings.push(ms) },
  );
  await control.reload();
  const message = { to: 'bia@example.com', ...renderMail({ kind: 'testMail', lang: 'pt-BR', org: 'Org' }) };
  for (let i = 0; i < 3; i++) await control.send(message);
  await assert.rejects(control.send(message), (err) => err instanceof MailRateLimitedError && err.retryAfterMs > 0);
  await assert.rejects(control.send(message), MailRateLimitedError);
  assert.equal(sent.length, 3, 'nada passou do teto');
  assert.equal(warnings.length, 1, 'um aviso por janela, não um por e-mail');
  assert.equal(sent[0].attachments?.[0]?.contentDisposition, 'inline', 'a faixa vai embutida (inline)');
});

test('limite por pessoa configurável: convites por e-mail param no limite com 429 e o resto segue normal', async () => {
  const { server, admin, mailer, flush } = await startWithMail({ LUDRAW_MAIL_MAX_PER_USER_HOUR: '2' });
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const codes: number[] = [];
    for (const email of ['a1@example.com', 'a2@example.com', 'a3@example.com']) {
      const r = await api(server.app, owner).op({ type: 'createInvitation', input: { email, role: 'member', expiresInDays: 7, sendEmail: true } });
      codes.push(r.statusCode);
    }
    await flush();
    assert.deepEqual(codes, [200, 200, 429]);
    assert.equal(mailer.sent.length, 2);
    // sem e-mail, convidar continua livre (o limite é de envio, não de convite)
    assert.ok(await invitePerson(server.app, owner, { email: 'a4@example.com' }));
  } finally {
    await server.close();
  }
});
