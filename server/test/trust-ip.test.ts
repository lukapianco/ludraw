/**
 * LuDraw server — Chat 08.7 · R5 (S-14): o IP do WebSocket segue a MESMA regra de proxy do REST.
 *
 * Antes: com `LUDRAW_TRUST_PROXY` numérico ≥ 2 (ou lista de proxies), o `clientIp` do hub pegava o ÚLTIMO
 * `X-Forwarded-For` e ignorava a contagem de saltos — todos os clientes dividiam o mesmo limite `collabConnect`
 * (o IP do proxy mais próximo) — e com `true` ficava com o último, não o do cliente. Agora `trustFunction` é a única
 * regra (a do Fastify, via `@fastify/proxy-addr`) e o hub usa a mesma: o IP do hub é igual ao `request.ip`.
 */
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import * as hub from '../src/collab/hub';
import { startServer } from './helpers';

const CHAINS: Array<{ remote: string; xff?: string }> = [
  { remote: '127.0.0.1' },
  { remote: '127.0.0.1', xff: '203.0.113.9' },
  { remote: '127.0.0.1', xff: '203.0.113.9, 10.0.0.2' },
  { remote: '127.0.0.1', xff: '198.51.100.7, 203.0.113.9, 10.0.0.2' },
  { remote: '10.0.0.5', xff: '198.51.100.7, 203.0.113.9' },
  { remote: '192.0.2.44', xff: '198.51.100.7' },
];

for (const trust of ['1', '2', 'true', 'false', '127.0.0.1', '10.0.0.0/8, 127.0.0.1']) {
  test(`S-14: LUDRAW_TRUST_PROXY=${trust} — IP do WebSocket = request.ip do Fastify`, async () => {
    const clientIp = (hub as { clientIp?: (req: IncomingMessage, ctx: unknown) => string }).clientIp;
    assert.equal(typeof clientIp, 'function', 'clientIp do hub exportado (mesma regra do Fastify)');
    const server = await startServer({ LUDRAW_TRUST_PROXY: trust }, (app) => {
      app.get('/__ip', async (request) => ({ ip: request.ip }));
    });
    try {
      for (const c of CHAINS) {
        const headers = c.xff ? { 'x-forwarded-for': c.xff } : {};
        const viaFastify = (await server.app.inject({ url: '/__ip', remoteAddress: c.remote, headers })).json().ip as string;
        const req = { headers, socket: { remoteAddress: c.remote }, connection: { remoteAddress: c.remote } } as unknown as IncomingMessage;
        assert.equal(clientIp!(req, server.ctx), viaFastify, `${c.remote} | ${c.xff ?? '(sem XFF)'}`);
      }
    } finally {
      await server.close();
    }
  });
}
