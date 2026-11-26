/**
 * LuDraw server — Chat 08.7 · R4 (S-30, S-31, S-32): conteúdo inseguro dentro do board.
 *
 *  - S-31: link de texto/post-it só `https?:`/`mailto:` (antes: `javascript:` era aceito e virava `<a href>`).
 *  - S-30: imagem nova/alterada só `asset:` ou `data:image/*` (antes: URL externa era aceita e cada pessoa que abria o
 *    board buscava a imagem no servidor de terceiros — IP e `Referer` vazados); cor com `url(...)` recusada.
 *  - S-32: chaves `__proto__`/`constructor`/`prototype` vindas do documento ao vivo são ignoradas pelo codec.
 * Valores antigos que NÃO mudaram continuam aceitos (boards antigos seguem editáveis). PUT, tempo real (veto, que usa o
 * mesmo guard), criação de board e de modelo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { bindYjs, boardDataToSlice, readSlice, rootsOf, seedDoc } from '../../src/collab/codec';
import type { BoardData } from '../../src/types/canvas';
import type { PermissionContext } from '../../src/utils/permissions';
import { Veto, type VetoActor } from '../src/collab/veto';
import { boards } from '../src/db/schema';
import { api, createBoard, emptyBoard, json, startConfigured, sticky, type Person } from './helpers';

bindYjs(Y);

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const image = (id: string, dataUrl: string) => ({ id, type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 2, createdAt: 1, updatedAt: 1, dataUrl });

test('módulo puro: links, imagens e cores seguras', async () => {
  const cs = await import('../../src/utils/contentSafety').catch(() => null);
  assert.ok(cs, 'src/utils/contentSafety.ts existe');
  const { safeLinkHref, isSafeImageSrc, safeCssColor } = cs!;
  assert.equal(safeLinkHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeLinkHref('http://example.com'), 'http://example.com');
  assert.equal(safeLinkHref('mailto:pessoa@example.com'), 'mailto:pessoa@example.com');
  for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<b>', 'vbscript:x', 'file:///etc/passwd', '//evil.example/x', '']) assert.equal(safeLinkHref(bad), null, bad);
  assert.equal(isSafeImageSrc('asset:' + 'a'.repeat(64)), true);
  assert.equal(isSafeImageSrc(PNG), true);
  assert.equal(isSafeImageSrc('data:image/svg+xml;base64,PHN2Zy8+'), true);
  for (const bad of ['https://tracker.test/x.png', 'http://x', '//x/y.png', 'blob:https://x/1', 'data:text/html,x', 'javascript:x']) assert.equal(isSafeImageSrc(bad), false, bad);
  assert.equal(safeCssColor('#ffcc00'), '#ffcc00');
  assert.equal(safeCssColor('rgba(1, 2, 3, 0.5)'), 'rgba(1, 2, 3, 0.5)');
  assert.equal(safeCssColor('transparent'), 'transparent');
  for (const bad of ['url(https://x/y)', 'red;background:url(x)', 'expression(alert(1))', 'var(--x)', 'image-set(url(x))']) assert.equal(safeCssColor(bad), undefined, bad);
});

async function scenario() {
  const { server, admin } = await startConfigured();
  const owner: Person = { token: admin.accessToken, id: admin.user.id };
  const board = await createBoard(server.app, owner, { data: emptyBoard({ s1: sticky('s1', 'texto', { createdBy: admin.user.id }) }) });
  const put = async (mutate: (d: { elements: Record<string, Record<string, unknown>>; elementOrder: string[] }) => void) => {
    const cur = json(await api(server.app, owner).get(`/boards/${board.id}/data`));
    mutate(cur.data);
    return api(server.app, owner).put(`/boards/${board.id}/data`, cur.data, cur.revision);
  };
  const reason = (r: { body: string }) => { try { return JSON.parse(r.body).error.message.key as string; } catch { return ''; } };
  return { server, owner, board, put, reason };
}

test('PUT: link inseguro, imagem externa e cor com url() novos/alterados são recusados; os seguros passam', async () => {
  const s = await scenario();
  try {
    const bad = await s.put((d) => (d.elements.s1.link = 'javascript:alert(1)'));
    assert.equal(bad.statusCode, 403, bad.body);
    assert.equal(s.reason(bad), 'server.errors.unsafeLink');
    assert.equal((await s.put((d) => (d.elements.s1.link = 'https://example.com'))).statusCode, 200);
    const ext = await s.put((d) => { d.elements.i1 = image('i1', 'https://tracker.test/x.png'); d.elementOrder.push('i1'); });
    assert.equal(ext.statusCode, 403, ext.body);
    assert.equal(s.reason(ext), 'server.errors.imageExternalUrl');
    assert.equal((await s.put((d) => { d.elements.i2 = image('i2', PNG); d.elementOrder.push('i2'); })).statusCode, 200);
    const css = await s.put((d) => (d.elements.s1.color = 'url(https://tracker.test/c)'));
    assert.equal(css.statusCode, 403, css.body);
    assert.equal(s.reason(css), 'server.errors.unsafeStyle');
  } finally {
    await s.server.close();
  }
});

test('board antigo com link/imagem externa (já gravados) continua editável enquanto esses valores não mudam', async () => {
  const s = await scenario();
  try {
    const [row] = await s.server.ctx.db.select().from(boards).where(eq(boards.id, s.board.id));
    const data = row.data as unknown as { elements: Record<string, Record<string, unknown>>; elementOrder: string[] };
    data.elements.s1.link = 'javascript:legado()';
    data.elements.old = image('old', 'https://legado.test/x.png');
    data.elementOrder.push('old');
    await s.server.ctx.db.update(boards).set({ data: data as never }).where(eq(boards.id, s.board.id));
    const edit = await s.put((d) => (d.elements.s1.text = 'mudou só o texto'));
    assert.equal(edit.statusCode, 200, edit.body);
  } finally {
    await s.server.close();
  }
});

test('criar board e modelo com imagem externa ou link inseguro é recusado', async () => {
  const s = await scenario();
  try {
    const withExt = emptyBoard({ i: image('i', 'https://tracker.test/x.png') });
    const createExt = await api(s.server.app, s.owner).post('/boards', { name: 'x', place: { kind: 'personal' }, data: withExt });
    assert.equal(createExt.statusCode, 403, createExt.body);
    const withLink = emptyBoard({ s: sticky('s', 't', { link: 'javascript:alert(1)' }) });
    const tpl = await api(s.server.app, s.owner).post('/templates', { name: 'x', scope: 'personal', data: withLink });
    assert.equal(tpl.statusCode, 403, tpl.body);
  } finally {
    await s.server.close();
  }
});

test('tempo real: o veto recusa link inseguro e imagem externa (mesmo guard)', () => {
  const OWNER = 'dono';
  const owner: VetoActor = { userId: OWNER, name: 'Dono', role: 'admin', context: (x = {}) => ({ userId: OWNER, workspaceRole: 'admin', boardRole: null, isBoardOwner: true, isFacilitator: true, ...x }) as PermissionContext };
  const room = new Y.Doc();
  seedDoc(room, boardDataToSlice(emptyBoard({ s1: sticky('s1', 'texto', { createdBy: OWNER }) }) as unknown as BoardData), 'E');
  const veto = new Veto(room);
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(room));
  const change = (fn: () => void) => {
    const sv = Y.encodeStateVector(client);
    client.transact(fn);
    return Y.encodeStateAsUpdate(client, sv);
  };
  const link = veto.check(change(() => (rootsOf(client).els.get('s1') as Y.Map<unknown>).set('link', 'javascript:alert(1)')), owner, () => null);
  assert.equal(link.ok, false, 'link javascript: recusado ao vivo');
  // a sombra foi refeita: o cliente "bom" recomeça do documento do servidor
  const fresh = new Y.Doc();
  Y.applyUpdate(fresh, Y.encodeStateAsUpdate(room));
  const sv = Y.encodeStateVector(fresh);
  fresh.transact(() => {
    const el = new Y.Map<unknown>();
    rootsOf(fresh).els.set('i9', el);
    for (const [k, v] of Object.entries(image('i9', 'https://tracker.test/x.png'))) el.set(k, v);
  });
  const ext = veto.check(Y.encodeStateAsUpdate(fresh, sv), owner, () => null);
  assert.equal(ext.ok, false, 'imagem externa recusada ao vivo');
});

test('codec: chaves __proto__/constructor/prototype vindas do documento são ignoradas', () => {
  const doc = new Y.Doc();
  seedDoc(doc, boardDataToSlice(emptyBoard({ s1: sticky('s1', 'texto') }) as unknown as BoardData), 'E');
  doc.transact(() => {
    const el = rootsOf(doc).els.get('s1') as Y.Map<unknown>;
    el.set('__proto__', { isPrivateDraft: true, polluted: 1 });
    el.set('constructor', 'x');
    const evil = new Y.Map<unknown>();
    evil.set('id', '__proto__');
    evil.set('type', 'sticky');
    rootsOf(doc).els.set('__proto__', evil);
  });
  const slice = readSlice(doc);
  const s1 = slice.elements.s1 as unknown as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(s1), Object.prototype, 'protótipo do objeto intacto');
  assert.equal((s1 as { polluted?: unknown }).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(s1, 'constructor'), false);
  assert.equal(Object.getPrototypeOf(slice.elements), Object.prototype, 'mapa de elementos intacto');
  assert.equal(Object.prototype.hasOwnProperty.call(slice.elements, '__proto__'), false);
  assert.equal(({} as { polluted?: unknown }).polluted, undefined, 'protótipo global intacto');
});

test('importadores: stripUnsafeContent descarta imagem externa e link inseguro, neutraliza cor com url(); renderSafeElement', async () => {
  const { stripUnsafeContent, renderSafeElement } = await import('../../src/utils/contentSafety');
  const data = emptyBoard({
    s1: sticky('s1', 't', { link: 'javascript:alert(1)' }),
    s2: sticky('s2', 't', { link: 'https://example.com' }),
    i1: image('i1', 'https://tracker.test/x.png'),
    i2: image('i2', PNG),
    f1: { id: 'f1', type: 'frame', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, createdAt: 1, updatedAt: 1, fillColor: 'url(https://tracker.test/bg)', title: 'f' },
  }) as unknown as BoardData;
  const r = stripUnsafeContent(data);
  assert.deepEqual({ images: r.images, links: r.links, styles: r.styles }, { images: 1, links: 1, styles: 1 });
  assert.equal(r.data.elements.i1, undefined);
  assert.ok(r.data.elements.i2);
  assert.equal((r.data.elements.s1 as { link?: unknown }).link, undefined);
  assert.equal((r.data.elements.s2 as { link?: unknown }).link, 'https://example.com');
  assert.equal((r.data.elements.f1 as { fillColor?: unknown }).fillColor, 'transparent', 'a cor obrigatória fica (neutra), o desenho não quebra');
  assert.ok(!r.data.elementOrder.includes('i1'));
  // renderSafeElement: o mesmo objeto quando não há nada inseguro (o React não redesenha à toa)
  const ok = sticky('ok', 't', { link: 'mailto:a@example.com' });
  assert.equal(renderSafeElement(ok), ok);
  const bad = sticky('bad', 't', { link: 'javascript:x', color: 'url(https://tracker.test/c)' });
  const safe = renderSafeElement(bad) as Record<string, unknown>;
  assert.notEqual(safe, bad);
  assert.equal(safe.link, undefined);
  assert.equal(safe.color, '#808080');
});

test('"Baixar para o board": só endereço de imagem; sem cookies nem Referer; tipo pelos bytes; limite de tamanho', async () => {
  const ext = await import('../../src/utils/externalImage').catch(() => null);
  assert.ok(ext, 'src/utils/externalImage.ts existe');
  const { imageUrlFromText, sniffImageType, downloadExternalImage, EXTERNAL_IMAGE_MAX_BYTES } = ext!;
  assert.equal(imageUrlFromText(' https://example.com/a/foto.PNG '), 'https://example.com/a/foto.PNG');
  assert.equal(imageUrlFromText('https://example.com/foto.webp?w=200'), 'https://example.com/foto.webp?w=200');
  for (const no of ['https://example.com/pagina', 'javascript:x.png', 'ftp://x/y.png', 'veja https://example.com/a.png', 'https://u:p@example.com/a.png', 'data:image/png;base64,AAAA']) assert.equal(imageUrlFromText(no), null, no);
  const png = Buffer.from(PNG.split(',')[1], 'base64');
  assert.equal(sniffImageType(new Uint8Array(png)), 'image/png');
  assert.equal(sniffImageType(new TextEncoder().encode('<?xml version="1.0"?><!-- c --><svg xmlns="x"></svg>')), 'image/svg+xml');
  assert.equal(sniffImageType(new TextEncoder().encode('<html><script>x</script>')), null);
  let seen: RequestInit | undefined;
  const fake = (body: Uint8Array | string, headers: Record<string, string> = {}, status = 200) =>
    (async (_u: unknown, init?: RequestInit) => {
      seen = init;
      return new Response(typeof body === 'string' ? body : new Uint8Array(body), { status, headers });
    }) as unknown as typeof fetch;
  const ok = await downloadExternalImage('https://example.com/a.png', fake(png));
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.file.type, 'image/png');
  assert.equal(seen?.credentials, 'omit');
  assert.equal(seen?.referrerPolicy, 'no-referrer');
  const html = await downloadExternalImage('https://example.com/a.png', fake('<html>não é imagem</html>', { 'content-type': 'image/png' }));
  assert.deepEqual(html, { ok: false, reason: { key: 'importexport.safety.urlImageFailed' } }, 'Content-Type mentiroso não passa');
  const big = await downloadExternalImage('https://example.com/a.png', fake(png, { 'content-length': String(EXTERNAL_IMAGE_MAX_BYTES + 1) }));
  assert.equal(big.ok, false);
  assert.equal(!big.ok && big.reason.key, 'importexport.safety.urlImageTooLarge');
  const notFound = await downloadExternalImage('https://example.com/a.png', fake('', {}, 404));
  assert.equal(notFound.ok, false);
  const offline = await downloadExternalImage('https://example.com/a.png', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
  assert.equal(offline.ok, false);
});
