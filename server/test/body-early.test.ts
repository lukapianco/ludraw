/**
 * LuDraw server — Chat 08.7 · R3 (S-07): corpo grande sem autenticação é recusado ANTES de ser lido.
 *
 * Antes: a autenticação rodava no `preHandler` (ou dentro do handler), depois de o Fastify ler e interpretar o corpo
 * — um anônimo fazia o servidor receber e processar até 40 MB antes do 401. Agora as rotas de corpo grande
 * autenticam no `onRequest`. O teste usa um socket de verdade: declara um corpo grande, manda só 1 KB e exige a
 * resposta 401 sem o resto do corpo (antes, o servidor ficava esperando o corpo inteiro).
 */
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { api, createBoard, json, startConfigured, type Person } from './helpers';

/** Manda o cabeçalho + 1 KB de um corpo declarado grande; devolve o status da resposta ou null se não veio em `ms`. */
function partialRequest(port: number, method: string, path: string, contentLength: number, contentType: string, headers: Record<string, string> = {}, ms = 2000): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    let buf = '';
    const done = (v: number | null) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), ms);
    socket.on('data', (d) => {
      buf += d.toString('latin1');
      const m = /^HTTP\/1\.1 (\d{3})/.exec(buf);
      if (m) done(Number(m[1]));
    });
    socket.on('error', () => done(null));
    socket.on('connect', () => {
      const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('');
      socket.write(`${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: ${contentType}\r\nContent-Length: ${contentLength}\r\n${extra}\r\n`);
      socket.write(contentType.startsWith('application/json') ? '{"pad":"' + 'x'.repeat(1000) : Buffer.alloc(1024, 7));
    });
  });
}

test('rotas de corpo grande: sem token válido → 401 sem esperar o corpo; com token, o servidor espera o corpo', async () => {
  const { server, admin } = await startConfigured();
  try {
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const board = await createBoard(server.app, owner);
    await server.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (server.app.server.address() as AddressInfo).port;
    const MB = 1_000_000;
    const routes: [string, string, number, string][] = [
      ['PUT', `/api/v1/boards/${board.id}/data`, 41 * MB, 'application/json'],
      ['POST', '/api/v1/boards', 41 * MB, 'application/json'],
      ['POST', '/api/v1/templates', 41 * MB, 'application/json'],
      ['PUT', `/api/v1/public/boards/${board.id}/data`, 41 * MB, 'application/json'],
      ['PATCH', `/api/v1/boards/${board.id}`, 4 * MB, 'application/json'],
      ['POST', `/api/v1/boards/${board.id}/assets`, 12 * MB, 'image/png'],
      ['POST', `/api/v1/boards/${board.id}/assets?as=visitor`, 12 * MB, 'image/png'],
    ];
    const results: string[] = [];
    for (const [method, path, len, type] of routes) {
      const anon = await partialRequest(port, method, path, len, type);
      const forged = await partialRequest(port, method, path, len, type, { authorization: 'Bearer token-forjado.abc.def' });
      results.push(`${method} ${path}: anônimo=${anon} forjado=${forged}`);
    }
    assert.deepEqual(
      results.filter((r) => !/anônimo=401 forjado=401$/.test(r)),
      [],
      'todas as rotas de corpo grande recusam (401) sem ler o corpo',
    );
    // controle: com token válido o servidor ESPERA o corpo (não responde com 1 KB de 41 MB)
    const real = await partialRequest(port, 'PUT', `/api/v1/boards/${board.id}/data`, 41 * MB, 'application/json', { authorization: `Bearer ${owner.token}`, 'if-match': '"1"' }, 1500);
    assert.equal(real, null, 'autenticado: o servidor aguarda o corpo');
    // e a rota funciona normalmente com o corpo completo
    const cur = json(await api(server.app, owner).get(`/boards/${board.id}/data`));
    assert.equal((await api(server.app, owner).put(`/boards/${board.id}/data`, cur.data, cur.revision)).statusCode, 200);
  } finally {
    await server.close();
  }
});
