/**
 * LuDraw server — Chat 08.7 · R3 (S-20, parte HTTP): tempos limite explícitos do servidor.
 *
 * `LUDRAW_HTTP_HEADERS_TIMEOUT_SECONDS` (cabeçalho inteiro), `LUDRAW_HTTP_REQUEST_TIMEOUT_SECONDS` (requisição
 * inteira, inclusive o corpo) e `LUDRAW_HTTP_IDLE_TIMEOUT_SECONDS` (conexão parada). Antes valiam só os padrões do
 * Node (cabeçalho 60 s, requisição 300 s, ociosidade nenhuma). Aqui o servidor sobe com valores pequenos e o teste
 * confere que cabeçalho lento, corpo lento e conexão parada são cortados — e que o tempo real (WebSocket) parado
 * NÃO é derrubado (o `ws` desliga o tempo de ociosidade do socket depois do upgrade).
 */
import assert from 'node:assert/strict';
import { connect, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { connectClient, sleep, until } from './collab-helpers';
import { createBoard, startConfigured, type Person } from './helpers';

const ENV = { LUDRAW_HTTP_HEADERS_TIMEOUT_SECONDS: '1', LUDRAW_HTTP_REQUEST_TIMEOUT_SECONDS: '2', LUDRAW_HTTP_IDLE_TIMEOUT_SECONDS: '1' };

/** Abre um socket, roda `drive` e mede quando o servidor responde/fecha (ou `null` se nada em `ms`). */
function watch(port: number, drive: (s: Socket) => void, ms: number): Promise<{ closedAfterMs: number | null; status: number | null }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = connect(port, '127.0.0.1');
    let status: number | null = null;
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      s.destroy();
      resolve({ closedAfterMs: closed ? Date.now() - t0 : null, status });
    };
    const timer = setTimeout(() => finish(false), ms);
    s.on('data', (d) => {
      const m = /^HTTP\/1\.1 (\d{3})/.exec(d.toString('latin1'));
      if (m) status = Number(m[1]);
    });
    s.on('close', () => finish(true));
    s.on('error', () => finish(true));
    s.on('connect', () => drive(s));
  });
}

test('cabeçalho lento, corpo lento e conexão parada são cortados; requisição normal e WebSocket parado continuam', async () => {
  const { server, admin } = await startConfigured(ENV);
  const timers: NodeJS.Timeout[] = [];
  try {
    await server.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (server.app.server.address() as AddressInfo).port;

    // 1) cabeçalho que nunca termina (um byte a cada 300 ms, para não cair na ociosidade)
    const slowHeaders = await watch(port, (s) => {
      s.write('POST /api/v1/auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\n');
      const t = setInterval(() => !s.destroyed && s.write('X'), 300);
      timers.push(t);
    }, 8000);
    assert.ok(slowHeaders.closedAfterMs !== null && slowHeaders.closedAfterMs < 6000, `cabeçalho lento cortado (${slowHeaders.closedAfterMs} ms)`);

    // 2) corpo que chega aos poucos (1 byte a cada 300 ms de 200 declarados)
    const slowBody = await watch(port, (s) => {
      s.write('POST /api/v1/auth/login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{');
      const t = setInterval(() => !s.destroyed && s.write(' '), 300);
      timers.push(t);
    }, 10_000);
    assert.ok(slowBody.closedAfterMs !== null && slowBody.closedAfterMs < 8000, `corpo lento cortado (${slowBody.closedAfterMs} ms)`);

    // 3) conexão aberta sem mandar nada
    const idle = await watch(port, () => undefined, 8000);
    assert.ok(idle.closedAfterMs !== null && idle.closedAfterMs < 6000, `conexão parada fechada (${idle.closedAfterMs} ms)`);

    // 4) controle: requisição normal responde
    const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    assert.equal(health.status, 200);

    // 5) WebSocket do tempo real parado por mais que a ociosidade continua conectado
    const owner: Person = { token: admin.accessToken, id: admin.user.id };
    const board = await createBoard(server.app, owner);
    const c = connectClient(`ws://127.0.0.1:${port}/api/v1/collab`, board.id, { t: owner.token });
    await until(() => c.synced, 'sync');
    await sleep(3500);
    assert.equal(c.closes.length, 0, 'o WebSocket parado não foi derrubado');
    c.destroy();
  } finally {
    timers.forEach((t) => clearInterval(t));
    await server.close();
  }
});
